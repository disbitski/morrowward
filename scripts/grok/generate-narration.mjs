import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DEFAULT_MANIFEST_PATH,
  XAI_API_BASE_URL,
  assertBuiltInVoice,
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
  sha256Hex,
  writeJsonAtomic,
} from "./media-lib.mjs";

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
const audioFilename = `narration${extensionForMimeType(narration.mimeType)}`;
const captionFilename = "narration.en.vtt";
const transcriptFilename = "narration.txt";
const webVtt = createWebVttFromCharacterTimings(
  prompts.narration,
  narration.characters,
  narration.times,
);
await writeFile(resolve(narrationDirectory, audioFilename), narration.buffer, {
  mode: 0o600,
  flag: "wx",
});
await writeFile(resolve(narrationDirectory, captionFilename), webVtt, {
  mode: 0o600,
  flag: "wx",
});
await writeFile(
  resolve(narrationDirectory, transcriptFilename),
  `${prompts.narration}\n`,
  { mode: 0o600, flag: "wx" },
);

let reviewManifest;
try {
  reviewManifest = JSON.parse(await readFile(reviewPath, "utf8"));
} catch {
  reviewManifest = {
    schemaVersion: 1,
    campaignId: manifest.campaignId,
    runCreatedAt: new Date().toISOString(),
    disclosure: manifest.metadata.historicalFigureDisclosure,
    caption: manifest.metadata.caption,
    source: manifest.metadata.source,
    reviewPolicy: manifest.review,
    candidates: [],
    videos: [],
    selection: {
      leadReviewer: "Codex/GPT",
      selectedCandidateId: null,
      rationale: null,
      humanApproval: null,
    },
  };
}
reviewManifest.narration = {
  audioFilename: `narration/${audioFilename}`,
  captionFilename: `narration/${captionFilename}`,
  transcriptFilename: `narration/${transcriptFilename}`,
  mimeType: narration.mimeType,
  bytes: narration.buffer.length,
  sha256: sha256Hex(narration.buffer),
  durationSeconds: narration.durationSeconds,
  provider: "xAI Text to Speech",
  voiceId: voice.voice_id,
  voiceName: voice.name,
  voiceType: "built-in",
  historicalVoiceImitation: false,
  transcript: prompts.narration,
  disclosure:
    "AI-generated narration using an xAI built-in voice; it is not Marcus Aurelius's voice and does not imitate a historical recording.",
};
await writeJsonAtomic(reviewPath, reviewManifest);

console.log(`Generated private built-in-voice narration (${voice.voice_id}).`);
console.log(`Narration directory: ${narrationDirectory}`);
console.log("Transcript and WebVTT captions were saved beside the audio.");
