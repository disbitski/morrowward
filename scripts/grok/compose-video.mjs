import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DEFAULT_MANIFEST_PATH,
  assertNarrationFitsVisual,
  assertReviewPolicyMatchesCampaign,
  assertReviewScores,
  assertVideoMatchesRequest,
  extensionForMimeType,
  loadCampaignManifest,
  parseCliArguments,
  probeMediaFile,
  resolveMediaReviewPath,
  sha256Hex,
  validateMediaBuffer,
  writeJsonAtomic,
} from "./media-lib.mjs";
import {
  acquireCompositionLock,
  assertCompositionOutputsAvailable,
  cleanupCompositionPaths,
  stageAndCommitCompositionArtifacts,
} from "./composition-preflight.mjs";
import {
  assertCompositionIsNotHumanApproved,
  assertExactRunArtifactPath,
  assertRecordedByteLength,
  assertRecordedSha256,
  assertReviewManifestShape,
  readReviewManifest,
} from "./provenance-lib.mjs";

function run(command, argumentsList) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, argumentsList, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let errorOutput = "";
    child.stderr.on("data", (chunk) => {
      errorOutput += chunk.toString();
      if (errorOutput.length > 8_000) errorOutput = errorOutput.slice(-8_000);
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${command} exited ${code}: ${errorOutput.trim()}`));
    });
  });
}

const options = parseCliArguments(process.argv.slice(2));
for (const required of ["video", "audio", "captions", "run"]) {
  if (typeof options[required] !== "string") {
    throw new Error(`Missing required --${required} path.`);
  }
}
const runDirectory = await resolveMediaReviewPath(
  options.run,
  "Composition run directory",
);
const videoPath = await resolveMediaReviewPath(
  resolve(options.video),
  "Composition source video",
);
const audioPath = await resolveMediaReviewPath(
  resolve(options.audio),
  "Composition narration audio",
);
const captionPath = await resolveMediaReviewPath(
  resolve(options.captions),
  "Composition narration captions",
);
const outputDirectory = await resolveMediaReviewPath(
  resolve(runDirectory, "composed"),
  "Composition output directory",
);
const reviewPath = await resolveMediaReviewPath(
  resolve(runDirectory, "review.json"),
  "Composition review manifest",
);
const outputPath = resolve(outputDirectory, "primary-greeting-with-narration.mp4");
const outputCaptionPath = resolve(outputDirectory, "primary-greeting.en.vtt");

const { manifest: campaignManifest } = await loadCampaignManifest(
  options.manifest ?? DEFAULT_MANIFEST_PATH,
);
const reviewManifest = assertReviewManifestShape(
  await readReviewManifest(reviewPath),
  campaignManifest.campaignId,
);
assertReviewPolicyMatchesCampaign(
  reviewManifest.reviewPolicy,
  campaignManifest.review,
);
await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
const compositionPreflight = await assertCompositionOutputsAvailable({
  outputDirectory,
  reviewPath,
  reviewManifest,
});
const compositionLock = await acquireCompositionLock(
  compositionPreflight.lockPath,
);
let pipelineError = null;
let committedFinalPaths = [];
let reviewSaved = false;

try {
await assertCompositionOutputsAvailable({
  outputDirectory,
  reviewPath,
  reviewManifest,
  allowExistingLock: true,
});
assertCompositionIsNotHumanApproved(reviewManifest);
const matchingVideoRecords = reviewManifest.videos.filter(
  (entry) =>
    typeof entry?.filename === "string" &&
    resolve(runDirectory, entry.filename) === videoPath,
);
if (matchingVideoRecords.length !== 1) {
  throw new Error(
    "Composition video must match exactly one generated video in this run's review.json.",
  );
}
const [sourceVideoRecord] = matchingVideoRecords;
if (!["image-to-video", "text-to-video"].includes(sourceVideoRecord.id)) {
  throw new Error("Composition source video has an invalid generated-video id.");
}
const exactVideoFilename = `videos/${sourceVideoRecord.id}${extensionForMimeType(sourceVideoRecord.mimeType)}`;
assertExactRunArtifactPath({
  runDirectory,
  actualPath: videoPath,
  recordedFilename: sourceVideoRecord.filename,
  expectedFilename: exactVideoFilename,
  label: "Composition source video",
});
if (sourceVideoRecord.review?.hardGatesPassed !== true) {
  throw new Error(
    "Composition source video must pass its recorded hard-gate review first.",
  );
}
assertReviewScores(
  sourceVideoRecord.review,
  reviewManifest.reviewPolicy,
  "The composition source video",
);
if (sourceVideoRecord.requestedResolution !== "720p") {
  throw new Error("Composition source must record a requested 720p resolution.");
}
if (
  !Number.isFinite(sourceVideoRecord.requestedDurationSeconds) ||
  sourceVideoRecord.requestedDurationSeconds <= 0
) {
  throw new Error(
    "Composition source is missing its positive requested video duration.",
  );
}

const narrationRecord = reviewManifest.narration;
if (
  narrationRecord === null ||
  typeof narrationRecord !== "object" ||
  Array.isArray(narrationRecord)
) {
  throw new Error("Composition review.json is missing its narration record.");
}
if (narrationRecord.voiceType !== "built-in") {
  throw new Error("Composition requires a narration record with a built-in voice.");
}
if (narrationRecord.historicalVoiceImitation !== false) {
  throw new Error(
    "Composition requires historicalVoiceImitation to be explicitly false.",
  );
}
if (
  typeof narrationRecord.voiceId !== "string" ||
  !narrationRecord.voiceId.trim()
) {
  throw new Error("Composition narration is missing its built-in voice id.");
}
if (
  narrationRecord.captionMimeType !== "text/vtt; charset=utf-8" ||
  narrationRecord.transcriptMimeType !== "text/plain; charset=utf-8"
) {
  throw new Error(
    "Composition narration is missing its exact caption or transcript content type.",
  );
}

const exactAudioFilename = `narration/narration${extensionForMimeType(narrationRecord.mimeType)}`;
const exactCaptionFilename = "narration/narration.en.vtt";
const exactTranscriptFilename = "narration/narration.txt";
assertExactRunArtifactPath({
  runDirectory,
  actualPath: audioPath,
  recordedFilename: narrationRecord.audioFilename,
  expectedFilename: exactAudioFilename,
  label: "Composition narration audio",
});
assertExactRunArtifactPath({
  runDirectory,
  actualPath: captionPath,
  recordedFilename: narrationRecord.captionFilename,
  expectedFilename: exactCaptionFilename,
  label: "Composition narration captions",
});
const transcriptPath = await resolveMediaReviewPath(
  resolve(runDirectory, exactTranscriptFilename),
  "Composition narration transcript",
);
assertExactRunArtifactPath({
  runDirectory,
  actualPath: transcriptPath,
  recordedFilename: narrationRecord.transcriptFilename,
  expectedFilename: exactTranscriptFilename,
  label: "Composition narration transcript",
});

const videoBuffer = await readFile(videoPath);
const audioBuffer = await readFile(audioPath);
const captionBuffer = await readFile(captionPath);
const transcriptBuffer = await readFile(transcriptPath);
validateMediaBuffer(videoBuffer, sourceVideoRecord.mimeType, {
  kind: "video",
  minimumBytes: 10_000,
});
validateMediaBuffer(audioBuffer, narrationRecord.mimeType, {
  kind: "audio",
  minimumBytes: 44,
});
assertRecordedSha256(
  videoBuffer,
  sourceVideoRecord.sha256,
  "Composition source video",
);
assertRecordedByteLength(
  videoBuffer,
  sourceVideoRecord.bytes,
  "Composition source video",
);
const audioSha256 = assertRecordedSha256(
  audioBuffer,
  narrationRecord.audioSha256,
  "Composition narration audio",
);
if (narrationRecord.sha256 !== audioSha256) {
  throw new Error(
    "Composition narration audio SHA-256 aliases disagree in review.json.",
  );
}
if (narrationRecord.bytes !== narrationRecord.audioBytes) {
  throw new Error(
    "Composition narration audio byte-length aliases disagree in review.json.",
  );
}
assertRecordedByteLength(
  audioBuffer,
  narrationRecord.audioBytes,
  "Composition narration audio",
);
const captionSha256 = assertRecordedSha256(
  captionBuffer,
  narrationRecord.captionSha256,
  "Composition narration captions",
);
assertRecordedByteLength(
  captionBuffer,
  narrationRecord.captionBytes,
  "Composition narration captions",
);
const transcriptSha256 = assertRecordedSha256(
  transcriptBuffer,
  narrationRecord.transcriptSha256,
  "Composition narration transcript",
);
assertRecordedByteLength(
  transcriptBuffer,
  narrationRecord.transcriptBytes,
  "Composition narration transcript",
);

const captions = captionBuffer.toString("utf8");
if (!captions.startsWith("WEBVTT\n") || !captions.includes("-->")) {
  throw new Error("Caption input is not a valid WebVTT sidecar.");
}
if (typeof narrationRecord.transcript !== "string") {
  throw new Error("Composition narration record is missing its transcript text.");
}
if (transcriptBuffer.toString("utf8") !== `${narrationRecord.transcript}\n`) {
  throw new Error(
    "Composition narration transcript does not match its review.json text.",
  );
}

const sourceVideoProbe = await probeMediaFile(videoPath);
assertVideoMatchesRequest(sourceVideoProbe, {
  expectedDurationSeconds: sourceVideoRecord.requestedDurationSeconds,
  label: "Composition source video",
});
const narrationProbe = await probeMediaFile(audioPath);
const narrationFit = assertNarrationFitsVisual(
  sourceVideoProbe,
  narrationProbe,
);

// Ignore any model-generated audio. The only output audio is the declared xAI
// built-in narrator voice, padded to the visual duration without autoplay.
const stagedComposition = await stageAndCommitCompositionArtifacts({
  outputDirectory,
  captionBuffer,
  renderVideo: (temporaryVideoPath) =>
    run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      videoPath,
      "-i",
      audioPath,
      "-filter_complex",
      "[1:a:0]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100,apad[a]",
      "-map",
      "0:v:0",
      "-map",
      "[a]",
      "-map_metadata",
      "-1",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      "-movflags",
      "+faststart",
      temporaryVideoPath,
    ]),
  validateArtifacts: async ({
    videoPath: stagedVideoPath,
    captionPath: stagedCaptionPath,
  }) => {
    const output = await readFile(stagedVideoPath);
    const outputCaptions = await readFile(stagedCaptionPath);
    const mimeType = validateMediaBuffer(output, "video/mp4", {
      kind: "video",
      minimumBytes: 10_000,
    });
    const composedProbe = await probeMediaFile(stagedVideoPath);
    assertVideoMatchesRequest(composedProbe, {
      expectedDurationSeconds: sourceVideoRecord.requestedDurationSeconds,
      requireAudio: true,
      label: "Composed greeting",
    });
    if (
      !outputCaptions.equals(captionBuffer) ||
      sha256Hex(outputCaptions) !== captionSha256
    ) {
      throw new Error(
        "Composed caption sidecar does not match its reviewed source.",
      );
    }
    return { output, mimeType, composedProbe };
  },
});
committedFinalPaths = stagedComposition.finalPaths;
const { output, mimeType, composedProbe } = stagedComposition.validation;

reviewManifest.composed = {
  filename: "composed/primary-greeting-with-narration.mp4",
  captionFilename: "composed/primary-greeting.en.vtt",
  mimeType,
  bytes: output.length,
  sha256: sha256Hex(output),
  captionSha256,
  sourceVideo: sourceVideoRecord.filename,
  sourceNarration: narrationRecord.audioFilename,
  sourceCaptions: narrationRecord.captionFilename,
  sourceTranscript: narrationRecord.transcriptFilename,
  sources: {
    video: {
      filename: sourceVideoRecord.filename,
      sha256: sourceVideoRecord.sha256,
      hardGatesPassed: true,
    },
    audio: {
      filename: narrationRecord.audioFilename,
      sha256: audioSha256,
      voiceId: narrationRecord.voiceId,
      voiceName: narrationRecord.voiceName,
      voiceType: "built-in",
      historicalVoiceImitation: false,
    },
    captions: {
      filename: narrationRecord.captionFilename,
      sha256: captionSha256,
    },
    transcript: {
      filename: narrationRecord.transcriptFilename,
      sha256: transcriptSha256,
    },
  },
  requestedDurationSeconds: sourceVideoRecord.requestedDurationSeconds,
  width: composedProbe.video.width,
  height: composedProbe.video.height,
  durationSeconds: composedProbe.durationSeconds,
  narrationDurationSeconds: narrationFit.narrationDurationSeconds,
  tailHeadroomSeconds: narrationFit.tailHeadroomSeconds,
  autoplay: false,
  controlsRequired: true,
  posterRequired: true,
  reducedMotionFallbackRequired: true,
  status: "pending-final-frame-audio-caption-review",
};
await writeJsonAtomic(reviewPath, reviewManifest);
reviewSaved = true;

console.log(`Composed private review video: ${outputPath}`);
console.log(`Caption sidecar: ${outputCaptionPath}`);
console.log("Autoplay is not authorized; publish only with controls and a poster fallback.");
} catch (error) {
  pipelineError = error;
  if (!reviewSaved) {
    try {
      await cleanupCompositionPaths([
        ...committedFinalPaths,
        compositionPreflight.reviewTemporaryPath,
      ]);
    } catch (cleanupError) {
      pipelineError = new AggregateError(
        [error, cleanupError],
        "Composition failed and private partial output could not be removed.",
      );
    }
  }
}

try {
  await compositionLock.release();
} catch (releaseError) {
  pipelineError = pipelineError
    ? new AggregateError(
        [pipelineError, releaseError],
        "Composition failed and its private lock could not be released.",
      )
    : releaseError;
}
if (pipelineError) throw pipelineError;
