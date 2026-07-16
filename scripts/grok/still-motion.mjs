import { mkdir, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DEFAULT_MANIFEST_PATH,
  assertImageMatchesRequest,
  assertReviewedCandidateUpload,
  loadCampaignManifest,
  parseCliArguments,
  readImageDimensions,
  resolveMediaReviewPath,
  sha256Hex,
  validateMediaBuffer,
  writeJsonAtomic,
} from "./media-lib.mjs";
import {
  assertRecordedByteLength,
  assertRecordedSha256,
  assertReviewManifestShape,
  readReviewManifest,
} from "./provenance-lib.mjs";
import {
  stageAndCommitVideo,
  validateVideoReviewManifest,
} from "./video-preflight.mjs";
import {
  STILL_MOTION_ENCODER_SPEC,
  STILL_MOTION_ID,
  STILL_MOTION_PROVIDER,
  STILL_MOTION_SPEC,
  STILL_MOTION_WORKFLOW,
  acquireStillMotionLock,
  assertStillMotionSourceImageFormat,
  assertStillMotionOutputsAvailable,
  assertStillMotionReviewUnchanged,
  buildStillMotionFilterGraph,
  inspectStillMotionTools,
  probeStillMotionFile,
  renderStillMotionSource,
  validateStillMotionCliOptions,
} from "./still-motion-preflight.mjs";

const options = validateStillMotionCliOptions(
  parseCliArguments(process.argv.slice(2)),
);
const { manifest } = await loadCampaignManifest(
  options.manifest ?? DEFAULT_MANIFEST_PATH,
);
const runDirectory = await resolveMediaReviewPath(
  options.run,
  "Still-motion run directory",
);
const videoDirectory = await resolveMediaReviewPath(
  resolve(runDirectory, "videos"),
  "Still-motion video directory",
);
const reviewPath = await resolveMediaReviewPath(
  resolve(runDirectory, "review.json"),
  "Still-motion review manifest",
);

await mkdir(videoDirectory, { recursive: true, mode: 0o700 });
const loadValidatedReview = async () =>
  validateVideoReviewManifest(
    assertReviewManifestShape(
      await readReviewManifest(reviewPath),
      manifest.campaignId,
    ),
    manifest,
  );

const initialReview = await loadValidatedReview();
const preflight = await assertStillMotionOutputsAvailable({
  videoDirectory,
  reviewPath,
  reviewManifest: initialReview,
});
const toolVersions = await inspectStillMotionTools();
const renderLock = await acquireStillMotionLock(preflight.lockPath);
let pipelineError = null;
let finalizedVideoPath = null;
let reviewSaved = false;

try {
  const reviewManifest = await loadValidatedReview();
  await assertStillMotionOutputsAvailable({
    videoDirectory,
    reviewPath,
    reviewManifest,
    allowExistingLock: true,
  });

  const selectedCandidateId = reviewManifest.selection.selectedCandidateId;
  const selectedCandidate = reviewManifest.candidates.find(
    (candidate) => candidate.id === selectedCandidateId,
  );
  if (!selectedCandidate) {
    throw new Error(
      "Select exactly one reviewed image candidate before rendering still-motion.",
    );
  }
  const imagePath = await resolveMediaReviewPath(
    resolve(runDirectory, selectedCandidate.filename),
    "Still-motion selected source image",
  );
  const imageBuffer = await readFile(imagePath);
  const imageMimeType = validateMediaBuffer(
    imageBuffer,
    selectedCandidate.mimeType,
    { kind: "image", minimumBytes: 32 },
  );
  assertStillMotionSourceImageFormat(imageBuffer, imageMimeType);
  const imageSha256 = assertRecordedSha256(
    imageBuffer,
    selectedCandidate.sha256,
    "Still-motion source image",
  );
  assertRecordedByteLength(
    imageBuffer,
    selectedCandidate.bytes,
    "Still-motion source image",
  );
  const reviewedCandidate = assertReviewedCandidateUpload(
    reviewManifest,
    runDirectory,
    imagePath,
    imageSha256,
  );
  const imageDimensions = readImageDimensions(imageBuffer, imageMimeType);
  assertImageMatchesRequest(
    imageDimensions,
    manifest.image,
    "Still-motion source image",
  );
  if (
    reviewedCandidate.width !== imageDimensions.width ||
    reviewedCandidate.height !== imageDimensions.height
  ) {
    throw new Error(
      "Still-motion source image dimensions no longer match review.json.",
    );
  }

  const renderedBuffer = await renderStillMotionSource(
    imagePath,
    imageBuffer,
    imageMimeType,
  );
  const renderedMimeType = validateMediaBuffer(
    renderedBuffer,
    "video/mp4",
    { kind: "video", minimumBytes: 10_000 },
  );
  const { probe } = await stageAndCommitVideo({
    videoPath: preflight.videoPath,
    buffer: renderedBuffer,
    probeAndValidate: async (temporaryPath) => {
      return probeStillMotionFile(temporaryPath);
    },
  });
  finalizedVideoPath = preflight.videoPath;

  const latestReview = await loadValidatedReview();
  assertStillMotionReviewUnchanged(reviewManifest, latestReview);
  latestReview.videos.push({
    id: STILL_MOTION_ID,
    filename: "videos/still-motion.mp4",
    mimeType: renderedMimeType,
    bytes: renderedBuffer.length,
    sha256: sha256Hex(renderedBuffer),
    provider: STILL_MOTION_PROVIDER,
    workflow: STILL_MOTION_WORKFLOW,
    renderer: {
      name: "ffmpeg",
      version: toolVersions.ffmpegVersion,
    },
    encoder: structuredClone(STILL_MOTION_ENCODER_SPEC),
    filterGraph: buildStillMotionFilterGraph(),
    motionSpec: structuredClone(STILL_MOTION_SPEC),
    requestedDurationSeconds: STILL_MOTION_SPEC.durationSeconds,
    requestedResolution: "720p",
    width: probe.video.width,
    height: probe.video.height,
    durationSeconds: probe.durationSeconds,
    framesPerSecond: probe.framesPerSecond,
    totalFrames: STILL_MOTION_SPEC.totalFrames,
    codecName: probe.codecName,
    audioIncluded: false,
    probe: {
      name: "ffprobe",
      version: toolVersions.ffprobeVersion,
      width: probe.video.width,
      height: probe.video.height,
      durationSeconds: probe.durationSeconds,
      framesPerSecond: probe.framesPerSecond,
      averageFramesPerSecond: probe.averageFramesPerSecond,
      realFramesPerSecond: probe.realFramesPerSecond,
      frameCount: probe.frameCount,
      frameCountSource: probe.frameCountSource,
      codecName: probe.codecName,
      pixelFormat: probe.pixelFormat,
      profile: probe.profile,
      level: probe.level,
      videoStreamCount: probe.videoStreamCount,
      hasAudio: false,
    },
    sourceImage: {
      candidateId: reviewedCandidate.id,
      path: reviewedCandidate.filename,
      mimeType: reviewedCandidate.mimeType,
      bytes: reviewedCandidate.bytes,
      sha256: reviewedCandidate.sha256,
      width: reviewedCandidate.width,
      height: reviewedCandidate.height,
    },
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
      status: "pending-frame-and-subtle-camera-motion-review",
    },
  });
  await writeJsonAtomic(reviewPath, latestReview);
  reviewSaved = true;

  console.log(`Rendered private deterministic still-motion video: ${preflight.videoPath}`);
  console.log(
    "No image, prompt, or financial data was uploaded; the visual remains private and requires motion review.",
  );
} catch (error) {
  pipelineError = error;
  if (!reviewSaved) {
    const cleanupErrors = [];
    for (const path of [
      finalizedVideoPath,
      preflight.reviewTemporaryPath,
    ].filter(Boolean)) {
      try {
        await unlink(path);
      } catch (cleanupError) {
        if (cleanupError?.code !== "ENOENT") cleanupErrors.push(cleanupError);
      }
    }
    if (cleanupErrors.length) {
      pipelineError = new AggregateError(
        [error, ...cleanupErrors],
        "Still-motion render failed and one or more private attempt files could not be removed.",
      );
    }
  }
}

try {
  await renderLock.release();
} catch (releaseError) {
  pipelineError = pipelineError
    ? new AggregateError(
        [pipelineError, releaseError],
        "Still-motion render failed and its private lock could not be released.",
      )
    : releaseError;
}
if (pipelineError) throw pipelineError;
