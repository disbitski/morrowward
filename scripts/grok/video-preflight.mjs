import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  lstat,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, resolve } from "node:path";
import {
  assertQuoteSourceConsistency,
  assertReviewPolicyMatchesCampaign,
} from "./media-lib.mjs";

const MAX_POLL_INTERVAL_MS = 60_000;
const MAX_VIDEO_TIMEOUT_MS = 60 * 60_000;
const VIDEO_EXTENSIONS = Object.freeze([".mp4", ".webm"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function parsePositiveInteger(value, fallback, label, maximum) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be a positive base-10 integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new Error(`${label} must not exceed ${maximum}.`);
  }
  return parsed;
}

/** Parse and bound CLI timing controls before a paid generation starts. */
export function parseVideoTimingOptions(options = {}) {
  const intervalMs = parsePositiveInteger(
    options["poll-ms"],
    5_000,
    "--poll-ms",
    MAX_POLL_INTERVAL_MS,
  );
  const timeoutMs = parsePositiveInteger(
    options["timeout-ms"],
    15 * 60_000,
    "--timeout-ms",
    MAX_VIDEO_TIMEOUT_MS,
  );
  if (timeoutMs < intervalMs) {
    throw new Error("--timeout-ms must be greater than or equal to --poll-ms.");
  }
  return { intervalMs, timeoutMs };
}

function assertSafeRelativeMediaFilename(value, directory, label) {
  requiredString(value, label);
  if (
    isAbsolute(value) ||
    value.includes("\\") ||
    value.split("/").includes("..") ||
    !value.startsWith(`${directory}/`)
  ) {
    throw new Error(`${label} must stay inside ${directory}/.`);
  }
}

function assertUniqueMediaEntries(entries, kind, directory) {
  const ids = new Set();
  const filenames = new Set();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!isRecord(entry)) {
      throw new Error(`review.json ${kind}[${index}] must be an object.`);
    }
    const id = requiredString(entry.id, `review.json ${kind}[${index}].id`);
    assertSafeRelativeMediaFilename(
      entry.filename,
      directory,
      `review.json ${kind}[${index}].filename`,
    );
    if (ids.has(id)) {
      throw new Error(`review.json contains duplicate ${kind} id ${id}.`);
    }
    if (filenames.has(entry.filename)) {
      throw new Error(
        `review.json contains duplicate ${kind} filename ${entry.filename}.`,
      );
    }
    ids.add(id);
    filenames.add(entry.filename);
  }
}

/**
 * Fail closed on malformed, stale, or cross-campaign review state. This keeps
 * the generation script from silently replacing evidence reviewers edited.
 */
export function validateVideoReviewManifest(reviewManifest, manifest) {
  if (!isRecord(reviewManifest)) {
    throw new Error("review.json must contain one JSON object.");
  }
  if (reviewManifest.schemaVersion !== 1) {
    throw new Error("review.json schemaVersion must be 1.");
  }
  if (reviewManifest.campaignId !== manifest.campaignId) {
    throw new Error("review.json campaignId does not match this campaign.");
  }
  if (
    typeof reviewManifest.runCreatedAt !== "string" ||
    !Number.isFinite(Date.parse(reviewManifest.runCreatedAt))
  ) {
    throw new Error("review.json runCreatedAt must be a valid timestamp.");
  }

  const expectedMetadata = {
    aiInterpretationBadge: manifest.metadata.aiInterpretationBadge,
    disclosure: manifest.metadata.historicalFigureDisclosure,
    caption: manifest.metadata.caption,
    voiceDisclosure: manifest.metadata.voiceDisclosure,
    transcript: manifest.metadata.transcript,
    directQuote: manifest.metadata.directQuote,
    directQuoteAttribution: manifest.metadata.directQuoteAttribution,
  };
  for (const [field, expected] of Object.entries(expectedMetadata)) {
    if (reviewManifest[field] !== expected) {
      throw new Error(
        `review.json ${field} is missing or does not match the campaign manifest.`,
      );
    }
  }
  assertQuoteSourceConsistency(
    {
      transcript: reviewManifest.transcript,
      directQuote: reviewManifest.directQuote,
      directQuoteAttribution: reviewManifest.directQuoteAttribution,
      source: reviewManifest.source,
    },
    "review.json",
  );
  for (const [field, expected] of Object.entries(manifest.metadata.source)) {
    if (reviewManifest.source[field] !== expected) {
      throw new Error(
        `review.json source.${field} does not match the campaign manifest.`,
      );
    }
  }
  assertReviewPolicyMatchesCampaign(
    reviewManifest.reviewPolicy,
    manifest.review,
  );
  if (!Array.isArray(reviewManifest.candidates)) {
    throw new Error("review.json candidates must be an array.");
  }
  if (!Array.isArray(reviewManifest.videos)) {
    throw new Error("review.json videos must be an array.");
  }
  if (!isRecord(reviewManifest.selection)) {
    throw new Error("review.json selection must be an object.");
  }
  requiredString(
    reviewManifest.selection.leadReviewer,
    "review.json selection.leadReviewer",
  );
  if (
    reviewManifest.selection.selectedCandidateId !== null &&
    (typeof reviewManifest.selection.selectedCandidateId !== "string" ||
      !reviewManifest.selection.selectedCandidateId)
  ) {
    throw new Error(
      "review.json selection.selectedCandidateId must be null or a non-empty string.",
    );
  }
  if (
    reviewManifest.selection.rationale !== null &&
    typeof reviewManifest.selection.rationale !== "string"
  ) {
    throw new Error("review.json selection.rationale must be null or a string.");
  }
  if (
    reviewManifest.narration !== null &&
    !isRecord(reviewManifest.narration)
  ) {
    throw new Error("review.json narration must be null or an object.");
  }
  assertUniqueMediaEntries(reviewManifest.candidates, "candidates", "images");
  assertUniqueMediaEntries(reviewManifest.videos, "videos", "videos");
  return reviewManifest;
}

export function buildFallbackVideoReviewManifest(
  manifest,
  prompt,
  mode,
  now = () => new Date(),
) {
  const requestedVideo = manifest.video[mode];
  if (!requestedVideo) throw new Error(`Unknown video mode: ${mode}`);
  const createdAt = now();
  if (!(createdAt instanceof Date) || !Number.isFinite(createdAt.getTime())) {
    throw new Error("Review timestamp factory must return a valid Date.");
  }
  return {
    schemaVersion: 1,
    campaignId: manifest.campaignId,
    runCreatedAt: createdAt.toISOString(),
    generatedBy: {
      provider: "xAI",
      model: requestedVideo.model,
      request: {
        mode,
        durationSeconds: requestedVideo.durationSeconds,
        aspectRatio: requestedVideo.aspectRatio,
        resolution: requestedVideo.resolution,
      },
    },
    aiInterpretationBadge: manifest.metadata.aiInterpretationBadge,
    disclosure: manifest.metadata.historicalFigureDisclosure,
    caption: manifest.metadata.caption,
    voiceDisclosure: manifest.metadata.voiceDisclosure,
    transcript: manifest.metadata.transcript,
    directQuote: manifest.metadata.directQuote,
    directQuoteAttribution: manifest.metadata.directQuoteAttribution,
    source: structuredClone(manifest.metadata.source),
    prompt,
    reviewPolicy: structuredClone(manifest.review),
    candidates: [],
    videos: [],
    narration: null,
    selection: {
      leadReviewer: "Codex/GPT",
      selectedCandidateId: null,
      rationale: null,
      humanApproval: null,
    },
  };
}

/**
 * Read an existing review without ever repairing it. Text-to-video may create
 * a fresh manifest, but only when readFile reports the path truly does not
 * exist; parse, permission, directory, and schema errors remain fatal.
 */
export async function loadOrInitializeVideoReview({
  reviewPath,
  manifest,
  prompt,
  mode,
  allowInitialize,
}) {
  let source;
  try {
    source = await readFile(reviewPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw new Error(`Could not read review.json: ${error.message}`, {
        cause: error,
      });
    }
    if (!allowInitialize) {
      throw new Error("Image-to-video requires this run's review.json.", {
        cause: error,
      });
    }
    const initialized = buildFallbackVideoReviewManifest(
      manifest,
      prompt,
      mode,
    );
    validateVideoReviewManifest(initialized, manifest);
    try {
      await writeFile(
        reviewPath,
        `${JSON.stringify(initialized, null, 2)}\n`,
        { mode: 0o600, flag: "wx" },
      );
    } catch (writeError) {
      throw new Error(
        `Could not initialize review.json without replacing existing state: ${writeError.message}`,
        { cause: writeError },
      );
    }
    return { reviewManifest: initialized, initialized: true };
  }

  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`review.json is malformed JSON: ${error.message}`, {
      cause: error,
    });
  }
  return {
    reviewManifest: validateVideoReviewManifest(parsed, manifest),
    initialized: false,
  };
}

async function assertPathMissing(path, label, lstatImplementation = lstat) {
  try {
    await lstatImplementation(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw new Error(`Could not inspect ${label}: ${error.message}`, {
      cause: error,
    });
  }
  throw new Error(`${label} already exists: ${path}`);
}

/** Check every deterministic file/manifest collision before paid work. */
export async function assertVideoOutputsAvailable({
  videoDirectory,
  reviewPath,
  reviewManifest,
  modeOption,
  processId = process.pid,
  allowExistingLock = false,
}) {
  if (!["image-to-video", "text-to-video"].includes(modeOption)) {
    throw new Error(`Unknown video mode: ${modeOption}`);
  }
  const expectedFilenames = VIDEO_EXTENSIONS.map(
    (extension) => `videos/${modeOption}${extension}`,
  );
  const metadataCollision = reviewManifest.videos.find(
    (video) =>
      video.id === modeOption || expectedFilenames.includes(video.filename),
  );
  if (metadataCollision) {
    throw new Error(
      `review.json already contains ${modeOption} output metadata; use a fresh run or explicitly remove the reviewed output.`,
    );
  }

  const lockPath = resolve(videoDirectory, `.${modeOption}.generation.lock`);
  const paths = [
    ...VIDEO_EXTENSIONS.map((extension) => ({
      path: resolve(videoDirectory, `${modeOption}${extension}`),
      label: `${modeOption} ${extension} output`,
    })),
    {
      path: `${reviewPath}.${processId}.tmp`,
      label: "review.json atomic temporary output",
    },
  ];
  if (!allowExistingLock) {
    paths.push({ path: lockPath, label: `${modeOption} generation lock` });
  }
  for (const entry of paths) {
    await assertPathMissing(entry.path, entry.label);
  }
  return { lockPath };
}

/** Hold a same-run, same-mode lock so the preflight remains meaningful. */
export async function acquireVideoGenerationLock(lockPath) {
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
    await handle.writeFile(
      `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`,
    );
    await handle.close();
    handle = null;
  } catch (error) {
    await handle?.close().catch(() => {});
    if (handle) await unlink(lockPath).catch(() => {});
    throw new Error(`Could not acquire private video generation lock: ${error.message}`, {
      cause: error,
    });
  }
  let released = false;
  return {
    path: lockPath,
    async release() {
      if (released) return;
      try {
        await unlink(lockPath);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      released = true;
    },
  };
}

/** Ensure ffprobe can start and exit successfully before any generation call. */
export function assertFfprobeAvailable({
  spawnImplementation = spawn,
  timeoutMs = 5_000,
} = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new Error("ffprobe preflight timeout must be from 1 to 30000ms.");
  }
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let errorOutput = "";
    let timer;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) rejectPromise(error);
      else resolvePromise();
    };
    const child = spawnImplementation("ffprobe", ["-version"], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    child.stderr?.on("data", (chunk) => {
      errorOutput = `${errorOutput}${chunk}`.slice(-2_000);
    });
    child.on("error", (error) => {
      finish(new Error(`Could not start ffprobe: ${error.message}`, { cause: error }));
    });
    child.on("close", (code) => {
      if (code === 0) finish();
      else {
        finish(
          new Error(
            `ffprobe preflight exited ${code}: ${errorOutput.trim() || "no details"}`,
          ),
        );
      }
    });
    timer = setTimeout(() => {
      child.kill();
      finish(new Error(`ffprobe preflight timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });
}

/**
 * Write provider bytes to a private unique temp file, validate/probe them, and
 * only then atomically rename the complete file into its final name.
 * @template T
 * @param {{
 *   videoPath: string,
 *   buffer: Buffer,
 *   probeAndValidate: (temporaryPath: string) => T | Promise<T>,
 *   uniqueId?: string,
 * }} options
 * @returns {Promise<{probe: T, temporaryPath: string}>}
 */
export async function stageAndCommitVideo({
  videoPath,
  buffer,
  probeAndValidate,
  uniqueId = randomUUID(),
}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1) {
    throw new Error("Downloaded video buffer must be non-empty.");
  }
  if (typeof probeAndValidate !== "function") {
    throw new Error("A video probe and validation function is required.");
  }
  const extension = extname(videoPath);
  if (!VIDEO_EXTENSIONS.includes(extension)) {
    throw new Error("Final video path must end in .mp4 or .webm.");
  }
  if (!/^[A-Za-z0-9-]{1,100}$/.test(uniqueId)) {
    throw new Error("Temporary video id contains unsafe characters.");
  }
  const stem = basename(videoPath, extension);
  const temporaryPath = resolve(
    dirname(videoPath),
    `.${stem}.${process.pid}-${uniqueId}.tmp${extension}`,
  );
  let temporaryExists = false;
  try {
    await writeFile(temporaryPath, buffer, { mode: 0o600, flag: "wx" });
    temporaryExists = true;
    const probe = await probeAndValidate(temporaryPath);
    await assertPathMissing(videoPath, "Final validated video output");
    await rename(temporaryPath, videoPath);
    temporaryExists = false;
    return { probe, temporaryPath };
  } catch (error) {
    if (temporaryExists) {
      try {
        await unlink(temporaryPath);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          `Video staging failed and the private temporary file could not be removed: ${temporaryPath}`,
        );
      }
    }
    throw error;
  }
}
