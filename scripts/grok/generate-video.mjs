import { mkdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DEFAULT_MANIFEST_PATH,
  assertVideoMatchesRequest,
  assertReviewedCandidateUpload,
  buildVideoGenerationRequest,
  downloadAndValidateMedia,
  extensionForMimeType,
  imageFileToDataUri,
  loadCampaignManifest,
  parseCliArguments,
  pollVideoGeneration,
  probeMediaFile,
  resolveMediaReviewPath,
  requireXaiApiKey,
  requireXaiUploadConfirmation,
  startVideoGeneration,
  writeJsonAtomic,
} from "./media-lib.mjs";
import {
  acquireVideoGenerationLock,
  assertFfprobeAvailable,
  assertVideoOutputsAvailable,
  loadOrInitializeVideoReview,
  parseVideoTimingOptions,
  stageAndCommitVideo,
} from "./video-preflight.mjs";

const options = parseCliArguments(process.argv.slice(2));
requireXaiUploadConfirmation(
  options,
  "the private video prompt and, for image-to-video, the selected source image",
);
const manifestLocation = options.manifest ?? DEFAULT_MANIFEST_PATH;
const modeOption = options.mode;
if (!["image-to-video", "text-to-video"].includes(modeOption)) {
  throw new Error("Use --mode image-to-video or --mode text-to-video.");
}
const mode = modeOption === "image-to-video" ? "imageToVideo" : "textToVideo";
if (mode === "imageToVideo" && typeof options.image !== "string") {
  throw new Error("image-to-video requires --image /path/to/review-candidate.");
}
const timing = parseVideoTimingOptions(options);

const { manifest, prompts } = await loadCampaignManifest(manifestLocation);
const outputDirectory = await resolveMediaReviewPath(
  options.run ??
    `.media-review/grok/${manifest.campaignId}/${new Date().toISOString().replace(/[:.]/g, "-")}`,
  "Video run directory",
);
const videoDirectory = await resolveMediaReviewPath(
  resolve(outputDirectory, "videos"),
  "Video candidate directory",
);
const reviewPath = await resolveMediaReviewPath(
  resolve(outputDirectory, "review.json"),
  "Video review manifest",
);

await mkdir(videoDirectory, {
  recursive: true,
  mode: 0o700,
});

const { reviewManifest } = await loadOrInitializeVideoReview({
  reviewPath,
  manifest,
  prompt: prompts[mode],
  mode,
  allowInitialize: mode === "textToVideo",
});

let imageDataUri;
let sourceImage = null;
if (mode === "imageToVideo") {
  const selectedImagePath = await resolveMediaReviewPath(
    options.image,
    "Image-to-video source image",
  );
  const image = await imageFileToDataUri(selectedImagePath);
  const selectedCandidate = assertReviewedCandidateUpload(
    reviewManifest,
    outputDirectory,
    selectedImagePath,
    image.sha256,
  );
  imageDataUri = image.dataUri;
  sourceImage = {
    candidateId: selectedCandidate.id,
    path: selectedCandidate.filename,
    mimeType: image.mimeType,
    sha256: image.sha256,
  };
}

const requestBody = buildVideoGenerationRequest(
  manifest,
  mode,
  prompts[mode],
  imageDataUri,
);
const { lockPath } = await assertVideoOutputsAvailable({
  videoDirectory,
  reviewPath,
  reviewManifest,
  modeOption,
});
await assertFfprobeAvailable();
const generationLock = await acquireVideoGenerationLock(lockPath);
let pipelineError = null;
let finalizedVideoPath = null;
let reviewSaved = false;

try {
  // Recheck after holding the mode lock so another cooperating process cannot
  // win the gap between the initial collision audit and the paid request.
  await assertVideoOutputsAvailable({
    videoDirectory,
    reviewPath,
    reviewManifest,
    modeOption,
    allowExistingLock: true,
  });

  const apiKey = requireXaiApiKey();
  const requestId = await startVideoGeneration(fetch, apiKey, requestBody);
  console.log(`Started ${modeOption}; polling request ${requestId}.`);
  const result = await pollVideoGeneration(fetch, apiKey, requestId, timing);
  const downloaded = await downloadAndValidateMedia(fetch, result.video.url, {
    kind: "video",
    minimumBytes: manifest.video.minimumBytes,
  });
  const filename = `${modeOption}${extensionForMimeType(downloaded.mimeType)}`;
  const relativeFilename = `videos/${filename}`;
  const videoPath = resolve(outputDirectory, relativeFilename);
  const requestedVideo = manifest.video[mode];
  const { probe: videoProbe } = await stageAndCommitVideo({
    videoPath,
    buffer: downloaded.buffer,
    probeAndValidate: async (temporaryPath) => {
      const probe = await probeMediaFile(temporaryPath);
      return assertVideoMatchesRequest(probe, {
        expectedDurationSeconds: requestedVideo.durationSeconds,
        label: `${modeOption} output`,
      });
    },
  });
  finalizedVideoPath = videoPath;

  reviewManifest.videos.push({
    id: modeOption,
    filename: relativeFilename,
    mimeType: downloaded.mimeType,
    bytes: downloaded.buffer.length,
    sha256: downloaded.sha256,
    requestId,
    providerModel: manifest.video[mode].model,
    requestedDurationSeconds: requestedVideo.durationSeconds,
    requestedResolution: requestedVideo.resolution,
    width: videoProbe.video.width,
    height: videoProbe.video.height,
    durationSeconds: videoProbe.durationSeconds,
    prompt: prompts[mode],
    sourceImage,
    aiInterpretationBadge: manifest.metadata.aiInterpretationBadge,
    disclosure: manifest.metadata.historicalFigureDisclosure,
    caption: manifest.metadata.caption,
    voiceDisclosure: manifest.metadata.voiceDisclosure,
    directQuote: manifest.metadata.directQuote,
    directQuoteAttribution: manifest.metadata.directQuoteAttribution,
    transcript: manifest.metadata.transcript,
    playback: manifest.playback,
    review: {
      hardGatesPassed: null,
      hardGateNotes: [],
      scores: {},
      observations: [],
      status: "pending-frame-audio-and-motion-review",
    },
  });
  await writeJsonAtomic(reviewPath, reviewManifest);
  reviewSaved = true;

  console.log(`Validated ${downloaded.mimeType} video: ${videoPath}`);
  console.log(
    "The candidate remains private and requires frame, motion, and audio review.",
  );
} catch (error) {
  pipelineError = error;
  if (finalizedVideoPath && !reviewSaved) {
    try {
      await unlink(finalizedVideoPath);
    } catch (cleanupError) {
      if (cleanupError?.code !== "ENOENT") {
        pipelineError = new AggregateError(
          [error, cleanupError],
          `Video generation failed and its untracked final file could not be removed: ${finalizedVideoPath}`,
        );
      }
    }
  }
}

try {
  await generationLock.release();
} catch (releaseError) {
  pipelineError = pipelineError
    ? new AggregateError(
        [pipelineError, releaseError],
        "Video generation failed and its private generation lock could not be released.",
      )
    : releaseError;
}
if (pipelineError) throw pipelineError;
