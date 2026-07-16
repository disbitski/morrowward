import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DEFAULT_MANIFEST_PATH,
  XAI_API_BASE_URL,
  assertBuiltInVoice,
  buildNarrationDisclosure,
  buildTtsRequest,
  createWebVttFromCharacterTimings,
  decodeTtsResponse,
  extensionForMimeType,
  loadCampaignManifest,
  parseCliArguments,
  requestJson,
  resolveMediaReviewPath,
  requireXaiApiKey,
  requireXaiUploadConfirmation,
  writeJsonAtomic,
} from "./media-lib.mjs";
import {
  acquireNarrationGenerationLock,
  assertNarrationOutputsAvailable,
  cleanupNarrationPaths,
  loadOrInitializeNarrationReview,
  stageAndCommitNarrationArtifacts,
} from "./narration-preflight.mjs";

const options = parseCliArguments(process.argv.slice(2));
requireXaiUploadConfirmation(options, "the private narration transcript");
const { manifest, prompts } = await loadCampaignManifest(
  options.manifest ?? DEFAULT_MANIFEST_PATH,
);
const outputDirectory = await resolveMediaReviewPath(
  options.run ??
    `.media-review/grok/${manifest.campaignId}/${new Date().toISOString().replace(/[:.]/g, "-")}`,
  "Narration run directory",
);
const narrationDirectory = await resolveMediaReviewPath(
  resolve(outputDirectory, "narration"),
  "Narration output directory",
);
const reviewPath = await resolveMediaReviewPath(
  resolve(outputDirectory, "review.json"),
  "Narration review manifest",
);

await mkdir(narrationDirectory, { recursive: true, mode: 0o700 });

const { reviewManifest } = await loadOrInitializeNarrationReview({
  reviewPath,
  manifest,
  prompt: prompts.narration,
});
const { lockPath, reviewTemporaryPath } =
  await assertNarrationOutputsAvailable({
    narrationDirectory,
    reviewPath,
    reviewManifest,
  });
const generationLock = await acquireNarrationGenerationLock(lockPath);
let pipelineError = null;
let committedFinalPaths = [];
let reviewWriteStarted = false;
let reviewSaved = false;

try {
  // Recheck while holding the run lock so no cooperating narration process can
  // win the gap between the initial audit and the first provider request.
  await assertNarrationOutputsAvailable({
    narrationDirectory,
    reviewPath,
    reviewManifest,
    allowExistingLock: true,
  });

  const apiKey = requireXaiApiKey();
  const voice = await assertBuiltInVoice(
    fetch,
    apiKey,
    manifest.narration.voiceId,
  );
  const { payload } = await requestJson(fetch, `${XAI_API_BASE_URL}/tts`, {
    apiKey,
    method: "POST",
    body: buildTtsRequest(manifest, prompts.narration),
  });
  const narration = decodeTtsResponse(payload, prompts.narration);
  const webVtt = createWebVttFromCharacterTimings(
    prompts.narration,
    narration.characters,
    narration.times,
  );
  const captionBuffer = Buffer.from(webVtt, "utf8");
  const transcriptBuffer = Buffer.from(`${prompts.narration}\n`, "utf8");
  const staged = await stageAndCommitNarrationArtifacts({
    narrationDirectory,
    audioBuffer: narration.buffer,
    audioMimeType: narration.mimeType,
    captionBuffer,
    transcriptBuffer,
    expectedWebVtt: webVtt,
    expectedTranscript: prompts.narration,
  });
  committedFinalPaths = staged.finalPaths;

  const audioFilename = `narration${extensionForMimeType(staged.audioMimeType)}`;
  const captionFilename = "narration.en.vtt";
  const transcriptFilename = "narration.txt";
  reviewManifest.narration = {
    audioFilename: `narration/${audioFilename}`,
    captionFilename: `narration/${captionFilename}`,
    transcriptFilename: `narration/${transcriptFilename}`,
    mimeType: staged.audioMimeType,
    captionMimeType: "text/vtt; charset=utf-8",
    transcriptMimeType: "text/plain; charset=utf-8",
    bytes: staged.audioBytes,
    audioBytes: staged.audioBytes,
    captionBytes: staged.captionBytes,
    transcriptBytes: staged.transcriptBytes,
    sha256: staged.audioSha256,
    audioSha256: staged.audioSha256,
    captionSha256: staged.captionSha256,
    transcriptSha256: staged.transcriptSha256,
    durationSeconds: narration.durationSeconds,
    provider: "xAI Text to Speech",
    voiceId: voice.voice_id,
    voiceName: voice.name,
    voiceType: "built-in",
    historicalVoiceImitation: false,
    transcript: prompts.narration,
    disclosure: buildNarrationDisclosure(manifest),
  };
  reviewWriteStarted = true;
  await writeJsonAtomic(reviewPath, reviewManifest);
  reviewSaved = true;

  console.log(`Generated private built-in-voice narration (${voice.voice_id}).`);
  console.log(`Narration directory: ${narrationDirectory}`);
  console.log("Transcript and WebVTT captions were saved beside the audio.");
} catch (error) {
  pipelineError = error;
  if (!reviewSaved) {
    try {
      await cleanupNarrationPaths([
        ...committedFinalPaths,
        ...(reviewWriteStarted ? [reviewTemporaryPath] : []),
      ]);
    } catch (cleanupError) {
      pipelineError = new AggregateError(
        [error, cleanupError],
        "Narration generation failed and private partial output could not be removed.",
      );
    }
  }
}

try {
  await generationLock.release();
} catch (releaseError) {
  pipelineError = pipelineError
    ? new AggregateError(
        [pipelineError, releaseError],
        "Narration generation failed and its private generation lock could not be released.",
      )
    : releaseError;
}
if (pipelineError) throw pipelineError;
