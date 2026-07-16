import {
  assertReviewScores,
  assertVideoMatchesRequest,
  extensionForMimeType,
} from "./media-lib.mjs";
import { assertExactRunArtifactPath } from "./provenance-lib.mjs";
import {
  STILL_MOTION_FILENAME,
  STILL_MOTION_ID,
  assertStillMotionVideoRecord,
} from "./still-motion-preflight.mjs";

const XAI_SOURCE_IDS = new Set(["image-to-video", "text-to-video"]);

export function assertCompositionSourceVideoRecord({
  sourceVideoRecord,
  reviewManifest,
  runDirectory,
  videoPath,
}) {
  if (!sourceVideoRecord || typeof sourceVideoRecord !== "object") {
    throw new Error("Composition source video metadata must be an object.");
  }
  const isStillMotion = sourceVideoRecord.id === STILL_MOTION_ID;
  if (!isStillMotion && !XAI_SOURCE_IDS.has(sourceVideoRecord.id)) {
    throw new Error("Composition source video has an invalid generated-video id.");
  }

  const exactVideoFilename = isStillMotion
    ? STILL_MOTION_FILENAME
    : `videos/${sourceVideoRecord.id}${extensionForMimeType(sourceVideoRecord.mimeType)}`;
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

  if (isStillMotion) {
    assertStillMotionVideoRecord(sourceVideoRecord, reviewManifest);
  }
  return {
    sourceType: isStillMotion ? "local-deterministic-still" : "xai-video",
    exactVideoFilename,
    sourceImage: isStillMotion ? sourceVideoRecord.sourceImage : null,
  };
}

export function assertCompositionSourceProbe(sourceVideoRecord, probe) {
  assertVideoMatchesRequest(probe, {
    expectedDurationSeconds: sourceVideoRecord.requestedDurationSeconds,
    label: "Composition source video",
  });
  if (sourceVideoRecord.id === STILL_MOTION_ID && probe.hasAudio) {
    throw new Error(
      "Deterministic still-motion composition source must not contain audio.",
    );
  }
  return probe;
}
