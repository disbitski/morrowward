import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { sha256Hex } from "./media-lib.mjs";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function assertCompositionIsNotHumanApproved(reviewManifest) {
  const composed = reviewManifest?.composed;
  if (composed === undefined || composed === null) return;
  if (!isRecord(composed)) {
    throw new Error("Review manifest composed metadata must be an object.");
  }

  const humanApproval = composed.humanApproval;
  if (
    humanApproval !== undefined &&
    humanApproval !== null &&
    !isRecord(humanApproval)
  ) {
    throw new Error("Composed humanApproval metadata must be an object or null.");
  }
  const hasApprovalBasis =
    composed.approvalBasis !== undefined ||
    composed.approvalBasisSha256 !== undefined ||
    humanApproval?.approvalBasis !== undefined ||
    humanApproval?.approvalBasisSha256 !== undefined;
  const carriesHumanApproval =
    humanApproval?.status === "approved" ||
    humanApproval?.approvedBy !== undefined ||
    humanApproval?.approvedAt !== undefined ||
    (typeof composed.status === "string" &&
      /^approved(?:-|$)/.test(composed.status));

  if (carriesHumanApproval || hasApprovalBasis) {
    throw new Error(
      "Refusing to replace composition metadata carrying human approval or its approval basis; create a fresh review run instead.",
    );
  }
}

export function assertReviewManifestShape(manifest, expectedCampaignId) {
  if (!isRecord(manifest)) {
    throw new Error("Review manifest must contain a JSON object.");
  }
  if (manifest.schemaVersion !== 1) {
    throw new Error("Review manifest must use schemaVersion 1.");
  }
  if (typeof manifest.campaignId !== "string" || !manifest.campaignId.trim()) {
    throw new Error("Review manifest is missing its campaign id.");
  }
  if (
    expectedCampaignId !== undefined &&
    manifest.campaignId !== expectedCampaignId
  ) {
    throw new Error(
      `Review manifest campaign ${manifest.campaignId} does not match ${expectedCampaignId}.`,
    );
  }
  if (
    typeof manifest.runCreatedAt !== "string" ||
    !Number.isFinite(Date.parse(manifest.runCreatedAt))
  ) {
    throw new Error("Review manifest is missing a valid creation timestamp.");
  }
  if (!Array.isArray(manifest.candidates) || !Array.isArray(manifest.videos)) {
    throw new Error("Review manifest must contain candidate and video arrays.");
  }
  if (
    !isRecord(manifest.selection) ||
    typeof manifest.selection.leadReviewer !== "string" ||
    !manifest.selection.leadReviewer.trim()
  ) {
    throw new Error("Review manifest must contain its selection record.");
  }
  if (
    typeof manifest.disclosure !== "string" ||
    typeof manifest.caption !== "string" ||
    !isRecord(manifest.source) ||
    !isRecord(manifest.reviewPolicy)
  ) {
    throw new Error(
      "Review manifest is missing required disclosure, caption, source, or review-policy metadata.",
    );
  }
  if (
    !Array.isArray(manifest.reviewPolicy.hardGates) ||
    !Array.isArray(manifest.reviewPolicy.scorecard)
  ) {
    throw new Error(
      "Review manifest review policy must retain hard-gate and scorecard arrays.",
    );
  }
  if (manifest.narration !== null && !isRecord(manifest.narration)) {
    throw new Error("Review manifest narration must be null or an object.");
  }
  return manifest;
}

export async function readReviewManifest(reviewPath) {
  let contents;
  try {
    contents = await readFile(reviewPath, "utf8");
  } catch (error) {
    throw new Error(`Could not read review manifest ${reviewPath}: ${error.message}`, {
      cause: error,
    });
  }

  let manifest;
  try {
    manifest = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Review manifest ${reviewPath} is not valid JSON: ${error.message}`, {
      cause: error,
    });
  }
  if (!isRecord(manifest)) {
    throw new Error(`Review manifest ${reviewPath} must contain a JSON object.`);
  }
  return manifest;
}

export async function readReviewManifestOrInitialize(reviewPath, initialize) {
  try {
    return await readReviewManifest(reviewPath);
  } catch (error) {
    if (error.cause?.code !== "ENOENT") throw error;
    const fallback = initialize();
    if (!isRecord(fallback)) {
      throw new Error("Review manifest initializer must return a JSON object.");
    }
    return fallback;
  }
}

export function assertExactRunArtifactPath({
  runDirectory,
  actualPath,
  recordedFilename,
  expectedFilename,
  label,
}) {
  if (typeof recordedFilename !== "string") {
    throw new Error(`${label} is missing its recorded filename.`);
  }
  if (recordedFilename !== expectedFilename) {
    throw new Error(
      `${label} must use the exact recorded filename ${expectedFilename}.`,
    );
  }

  const expectedPath = resolve(runDirectory, expectedFilename);
  const pathWithinRun = relative(runDirectory, expectedPath);
  if (
    pathWithinRun === "" ||
    pathWithinRun === ".." ||
    pathWithinRun.startsWith(`..${sep}`) ||
    isAbsolute(pathWithinRun)
  ) {
    throw new Error(`${label} must stay inside the selected composition run.`);
  }
  if (resolve(actualPath) !== expectedPath) {
    throw new Error(
      `${label} must be the exact file recorded for this composition run.`,
    );
  }
  return expectedPath;
}

export function assertRecordedSha256(buffer, recordedSha256, label) {
  if (typeof recordedSha256 !== "string" || !SHA256_PATTERN.test(recordedSha256)) {
    throw new Error(`${label} is missing a valid recorded SHA-256 digest.`);
  }
  const actualSha256 = sha256Hex(buffer);
  if (actualSha256 !== recordedSha256) {
    throw new Error(`${label} no longer matches the SHA-256 in review.json.`);
  }
  return actualSha256;
}

export function assertRecordedByteLength(buffer, recordedBytes, label) {
  if (!Number.isSafeInteger(recordedBytes) || recordedBytes < 0) {
    throw new Error(`${label} is missing a valid recorded byte length.`);
  }
  if (buffer.length !== recordedBytes) {
    throw new Error(`${label} no longer matches the byte length in review.json.`);
  }
}
