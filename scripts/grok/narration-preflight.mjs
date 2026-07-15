import { randomUUID } from "node:crypto";
import {
  lstat,
  open,
  readFile,
  rename,
  unlink,
} from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, resolve } from "node:path";
import {
  assertQuoteSourceConsistency,
  assertReviewPolicyMatchesCampaign,
  extensionForMimeType,
  sha256Hex,
  validateMediaBuffer,
} from "./media-lib.mjs";

export const NARRATION_AUDIO_EXTENSIONS = Object.freeze([".wav", ".mp3"]);
export const DEFAULT_NARRATION_ARTIFACT_LIMITS = Object.freeze({
  maximumAudioBytes: 64 * 1024 * 1024,
  maximumCaptionBytes: 1024 * 1024,
  maximumTranscriptBytes: 64 * 1024,
});

/**
 * @typedef {{
 *   maximumAudioBytes?: number,
 *   maximumCaptionBytes?: number,
 *   maximumTranscriptBytes?: number,
 * }} NarrationArtifactLimits
 */

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function assertSafeReviewFilename(value, directory, label) {
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

function assertUniqueReviewEntries(entries, kind, directory) {
  if (!Array.isArray(entries)) {
    throw new Error(`review.json ${kind} must be an array.`);
  }
  const ids = new Set();
  const filenames = new Set();
  for (const [index, entry] of entries.entries()) {
    if (!isRecord(entry)) {
      throw new Error(`review.json ${kind}[${index}] must be an object.`);
    }
    const id = requiredString(entry.id, `review.json ${kind}[${index}].id`);
    assertSafeReviewFilename(
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

/** Fail closed on malformed, stale, or cross-campaign narration review state. */
export function validateNarrationReviewManifest(reviewManifest, manifest) {
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
  if (!isRecord(reviewManifest.generatedBy)) {
    throw new Error("review.json generatedBy must be an object.");
  }
  requiredString(
    reviewManifest.generatedBy.provider,
    "review.json generatedBy.provider",
  );
  requiredString(
    reviewManifest.generatedBy.model,
    "review.json generatedBy.model",
  );
  if (!isRecord(reviewManifest.generatedBy.request)) {
    throw new Error("review.json generatedBy.request must be an object.");
  }
  requiredString(reviewManifest.prompt, "review.json prompt");

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
  assertUniqueReviewEntries(reviewManifest.candidates, "candidates", "images");
  assertUniqueReviewEntries(reviewManifest.videos, "videos", "videos");
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
  return reviewManifest;
}

export function buildFallbackNarrationReviewManifest(
  manifest,
  prompt,
  now = () => new Date(),
) {
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
      model: "xAI Text to Speech API",
      request: {
        voiceId: manifest.narration.voiceId,
        voiceType: manifest.narration.voiceType,
        language: manifest.narration.language,
        codec: manifest.narration.codec,
        sampleRate: manifest.narration.sampleRate,
        speed: manifest.narration.speed,
        withTimestamps: true,
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

/** Initialize only on ENOENT; malformed, unreadable, and stale reviews are fatal. */
export async function loadOrInitializeNarrationReview({
  reviewPath,
  manifest,
  prompt,
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
    const reviewManifest = buildFallbackNarrationReviewManifest(
      manifest,
      prompt,
    );
    return {
      reviewManifest: validateNarrationReviewManifest(reviewManifest, manifest),
      initialized: true,
    };
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
    reviewManifest: validateNarrationReviewManifest(parsed, manifest),
    initialized: false,
  };
}

async function assertPathMissing(path, label) {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw new Error(`Could not inspect ${label}: ${error.message}`, {
      cause: error,
    });
  }
  throw new Error(`${label} already exists: ${path}`);
}

function narrationFinalPaths(narrationDirectory) {
  return [
    ...NARRATION_AUDIO_EXTENSIONS.map((extension) => ({
      path: resolve(narrationDirectory, `narration${extension}`),
      label: `narration ${extension} output`,
    })),
    {
      path: resolve(narrationDirectory, "narration.en.vtt"),
      label: "narration WebVTT output",
    },
    {
      path: resolve(narrationDirectory, "narration.txt"),
      label: "narration transcript output",
    },
  ];
}

async function assertNarrationFinalPathsMissing(narrationDirectory) {
  for (const entry of narrationFinalPaths(narrationDirectory)) {
    await assertPathMissing(entry.path, entry.label);
  }
}

/** Audit every deterministic collision before any xAI credential or request. */
export async function assertNarrationOutputsAvailable({
  narrationDirectory,
  reviewPath,
  reviewManifest,
  processId = process.pid,
  allowExistingLock = false,
}) {
  if (!Number.isSafeInteger(processId) || processId < 1) {
    throw new Error("Narration process id must be a positive safe integer.");
  }
  if (reviewManifest.narration !== null) {
    throw new Error(
      "review.json already contains narration metadata; use a fresh run or explicitly remove the reviewed output.",
    );
  }
  const lockPath = resolve(narrationDirectory, ".narration.generation.lock");
  const reviewTemporaryPath = `${reviewPath}.${processId}.tmp`;
  await assertNarrationFinalPathsMissing(narrationDirectory);
  await assertPathMissing(
    reviewTemporaryPath,
    "review.json atomic temporary output",
  );
  if (!allowExistingLock) {
    await assertPathMissing(lockPath, "narration generation lock");
  }
  return { lockPath, reviewTemporaryPath };
}

/** Hold one exclusive narration generation lock for the selected run. */
export async function acquireNarrationGenerationLock(lockPath) {
  let handle;
  let ownsLock = false;
  try {
    handle = await open(lockPath, "wx", 0o600);
    ownsLock = true;
    await handle.chmod(0o600);
    await handle.writeFile(
      `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`,
    );
    await handle.close();
    handle = null;
  } catch (error) {
    await handle?.close().catch(() => {});
    if (ownsLock) await unlink(lockPath).catch(() => {});
    throw new Error(
      `Could not acquire private narration generation lock: ${error.message}`,
      { cause: error },
    );
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

function validateLimits(limits) {
  const merged = { ...DEFAULT_NARRATION_ARTIFACT_LIMITS, ...limits };
  for (const [field, value] of Object.entries(merged)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${field} must be a positive safe integer.`);
    }
  }
  if (merged.maximumAudioBytes < 44) {
    throw new Error("maximumAudioBytes must be at least 44 bytes.");
  }
  return merged;
}

function assertBoundedBuffer(buffer, label, maximumBytes, minimumBytes = 1) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error(`${label} must be a Buffer.`);
  }
  if (buffer.length < minimumBytes) {
    throw new Error(`${label} must contain at least ${minimumBytes} bytes.`);
  }
  if (buffer.length > maximumBytes) {
    throw new Error(`${label} exceeds the ${maximumBytes}-byte limit.`);
  }
}

/**
 * Validate exact staged content and return hashes used by review provenance.
 * @param {{
 *   audioBuffer: Buffer,
 *   audioMimeType: string,
 *   captionBuffer: Buffer,
 *   transcriptBuffer: Buffer,
 *   expectedWebVtt: string,
 *   expectedTranscript: string,
 *   limits?: NarrationArtifactLimits,
 * }} options
 */
export function validateAndHashNarrationArtifacts({
  audioBuffer,
  audioMimeType,
  captionBuffer,
  transcriptBuffer,
  expectedWebVtt,
  expectedTranscript,
  limits = undefined,
}) {
  const validatedLimits = validateLimits(limits);
  assertBoundedBuffer(
    audioBuffer,
    "Narration audio",
    validatedLimits.maximumAudioBytes,
    44,
  );
  assertBoundedBuffer(
    captionBuffer,
    "Narration captions",
    validatedLimits.maximumCaptionBytes,
  );
  assertBoundedBuffer(
    transcriptBuffer,
    "Narration transcript",
    validatedLimits.maximumTranscriptBytes,
  );
  requiredString(expectedWebVtt, "Expected WebVTT");
  requiredString(expectedTranscript, "Expected narration transcript");
  if (!expectedWebVtt.startsWith("WEBVTT\n")) {
    throw new Error("Expected narration captions must use WebVTT.");
  }
  const normalizedAudioMimeType = validateMediaBuffer(
    audioBuffer,
    audioMimeType,
    { kind: "audio", minimumBytes: 44 },
  );
  if (!NARRATION_AUDIO_EXTENSIONS.includes(
    extensionForMimeType(normalizedAudioMimeType),
  )) {
    throw new Error("Narration audio uses an unsupported file extension.");
  }
  if (!captionBuffer.equals(Buffer.from(expectedWebVtt, "utf8"))) {
    throw new Error("Narration captions do not match the generated WebVTT.");
  }
  if (
    !transcriptBuffer.equals(Buffer.from(`${expectedTranscript}\n`, "utf8"))
  ) {
    throw new Error("Narration transcript does not match the requested text.");
  }
  return {
    audioMimeType: normalizedAudioMimeType,
    audioBytes: audioBuffer.length,
    captionBytes: captionBuffer.length,
    transcriptBytes: transcriptBuffer.length,
    audioSha256: sha256Hex(audioBuffer),
    captionSha256: sha256Hex(captionBuffer),
    transcriptSha256: sha256Hex(transcriptBuffer),
  };
}

function temporaryPathFor(finalPath, uniqueId) {
  const extension = extname(finalPath);
  const stem = basename(finalPath, extension);
  return resolve(
    dirname(finalPath),
    `.${stem}.${process.pid}-${uniqueId}.tmp${extension}`,
  );
}

/** Remove only files owned by the active narration attempt. */
export async function cleanupNarrationPaths(
  paths,
  { unlinkImplementation = unlink } = {},
) {
  if (!Array.isArray(paths)) {
    throw new Error("Narration cleanup paths must be an array.");
  }
  const failures = [];
  for (const path of new Set(paths)) {
    if (typeof path !== "string" || !path) {
      failures.push(new Error("Narration cleanup path must be a string."));
      continue;
    }
    try {
      await unlinkImplementation(path);
    } catch (error) {
      if (error?.code !== "ENOENT") failures.push(error);
    }
  }
  if (failures.length) {
    throw new AggregateError(
      failures,
      "One or more private narration attempt files could not be removed.",
    );
  }
}

/**
 * Stage all private artifacts, validate and hash their on-disk bytes, then
 * atomically rename them. Any failed validation or partial commit is removed.
 * @param {{
 *   narrationDirectory: string,
 *   audioBuffer: Buffer,
 *   audioMimeType: string,
 *   captionBuffer: Buffer,
 *   transcriptBuffer: Buffer,
 *   expectedWebVtt: string,
 *   expectedTranscript: string,
 *   limits?: NarrationArtifactLimits,
 *   uniqueId?: string,
 *   renameImplementation?: typeof rename,
 * }} options
 */
export async function stageAndCommitNarrationArtifacts({
  narrationDirectory,
  audioBuffer,
  audioMimeType,
  captionBuffer,
  transcriptBuffer,
  expectedWebVtt,
  expectedTranscript,
  limits = undefined,
  uniqueId = String(randomUUID()),
  renameImplementation = rename,
}) {
  if (!/^[A-Za-z0-9-]{1,100}$/.test(uniqueId)) {
    throw new Error("Temporary narration id contains unsafe characters.");
  }
  const audioExtension = extensionForMimeType(audioMimeType);
  if (!NARRATION_AUDIO_EXTENSIONS.includes(audioExtension)) {
    throw new Error("Narration audio MIME type is unsupported.");
  }
  // Bound and validate provider-derived buffers before any disk write, then
  // repeat the same validation on the staged bytes before committing them.
  validateAndHashNarrationArtifacts({
    audioBuffer,
    audioMimeType,
    captionBuffer,
    transcriptBuffer,
    expectedWebVtt,
    expectedTranscript,
    limits,
  });
  const artifacts = [
    {
      finalPath: resolve(narrationDirectory, `narration${audioExtension}`),
      buffer: audioBuffer,
    },
    {
      finalPath: resolve(narrationDirectory, "narration.en.vtt"),
      buffer: captionBuffer,
    },
    {
      finalPath: resolve(narrationDirectory, "narration.txt"),
      buffer: transcriptBuffer,
    },
  ].map((artifact) => ({
    ...artifact,
    temporaryPath: temporaryPathFor(artifact.finalPath, uniqueId),
  }));
  const temporaryPaths = new Set();
  const committedFinalPaths = [];

  try {
    await assertNarrationFinalPathsMissing(narrationDirectory);
    for (const artifact of artifacts) {
      let handle;
      try {
        handle = await open(artifact.temporaryPath, "wx", 0o600);
        temporaryPaths.add(artifact.temporaryPath);
        await handle.chmod(0o600);
        await handle.writeFile(artifact.buffer);
        await handle.sync();
      } finally {
        await handle?.close();
      }
    }

    const [stagedAudio, stagedCaptions, stagedTranscript] = await Promise.all(
      artifacts.map((artifact) => readFile(artifact.temporaryPath)),
    );
    const provenance = validateAndHashNarrationArtifacts({
      audioBuffer: stagedAudio,
      audioMimeType,
      captionBuffer: stagedCaptions,
      transcriptBuffer: stagedTranscript,
      expectedWebVtt,
      expectedTranscript,
      limits,
    });

    await assertNarrationFinalPathsMissing(narrationDirectory);
    for (const artifact of artifacts) {
      await assertPathMissing(artifact.finalPath, "Final narration artifact");
      await renameImplementation(artifact.temporaryPath, artifact.finalPath);
      temporaryPaths.delete(artifact.temporaryPath);
      committedFinalPaths.push(artifact.finalPath);
    }
    return {
      ...provenance,
      audioPath: artifacts[0].finalPath,
      captionPath: artifacts[1].finalPath,
      transcriptPath: artifacts[2].finalPath,
      finalPaths: committedFinalPaths,
    };
  } catch (error) {
    try {
      await cleanupNarrationPaths([
        ...temporaryPaths,
        ...committedFinalPaths,
      ]);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Narration staging failed and private attempt files could not be removed.",
      );
    }
    throw error;
  }
}
