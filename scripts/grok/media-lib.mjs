import { createHash } from "node:crypto";
import { lstat, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const XAI_API_BASE_URL = "https://api.x.ai/v1";
export const DEFAULT_MANIFEST_PATH = new URL(
  "./manifests/morrowward-greeting.json",
  import.meta.url,
);
export const MEDIA_REVIEW_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../.media-review",
);

const MIME_EXTENSIONS = Object.freeze({
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "audio/wav": ".wav",
  "audio/mpeg": ".mp3",
});

const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm"]);
const AUDIO_MIME_TYPES = new Set(["audio/wav", "audio/mpeg"]);

/** @param {Record<string, string | undefined>} environment */
export function requireXaiApiKey(environment = process.env) {
  const key = environment.XAI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "XAI_API_KEY is required in the process environment. Do not put it in the manifest or command line.",
    );
  }
  return key;
}

export function requireXaiUploadConfirmation(options, description) {
  if (options?.["confirm-xai-upload"] !== true) {
    throw new Error(
      `Refusing to send ${description} to xAI without the explicit --confirm-xai-upload flag.`,
    );
  }
}

export function normalizeMimeType(value) {
  if (typeof value !== "string") return null;
  const normalized = value.split(";", 1)[0].trim().toLowerCase();
  if (["audio/mp3", "audio/x-mp3"].includes(normalized)) return "audio/mpeg";
  if (["audio/wave", "audio/x-wav"].includes(normalized)) return "audio/wav";
  return normalized || null;
}

export function extensionForMimeType(mimeType) {
  const extension = MIME_EXTENSIONS[normalizeMimeType(mimeType)];
  if (!extension) throw new Error(`Unsupported media MIME type: ${mimeType}`);
  return extension;
}

function startsWith(buffer, bytes, offset = 0) {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

export function detectMediaMimeType(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError("Media must be a Buffer.");
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    buffer.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))
  ) {
    return "image/gif";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    return "video/mp4";
  }
  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WAVE"
  ) {
    return "audio/wav";
  }
  if (
    startsWith(buffer, [0x49, 0x44, 0x33]) ||
    (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
  ) {
    return "audio/mpeg";
  }
  return null;
}

/**
 * @param {Buffer} buffer
 * @param {string | null | undefined} claimedMimeType
 * @param {{kind?: "image" | "video" | "audio", minimumBytes?: number}} options
 */
export function validateMediaBuffer(
  buffer,
  claimedMimeType,
  { kind, minimumBytes = 1 } = {},
) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError("Media must be a Buffer.");
  if (!Number.isSafeInteger(minimumBytes) || minimumBytes < 1) {
    throw new Error("minimumBytes must be a positive safe integer.");
  }
  if (buffer.length < minimumBytes) {
    throw new Error(
      `Downloaded media is too small (${buffer.length} bytes; expected at least ${minimumBytes}).`,
    );
  }

  const detectedMimeType = detectMediaMimeType(buffer);
  if (!detectedMimeType) {
    throw new Error("Downloaded bytes do not match a supported image or video format.");
  }
  const normalizedClaim = normalizeMimeType(claimedMimeType);
  if (normalizedClaim && normalizedClaim !== detectedMimeType) {
    throw new Error(
      `Media MIME mismatch: provider reported ${normalizedClaim}, bytes are ${detectedMimeType}.`,
    );
  }
  if (kind === "image" && !IMAGE_MIME_TYPES.has(detectedMimeType)) {
    throw new Error(`Expected an image but received ${detectedMimeType}.`);
  }
  if (kind === "video" && !VIDEO_MIME_TYPES.has(detectedMimeType)) {
    throw new Error(`Expected a video but received ${detectedMimeType}.`);
  }
  if (kind === "audio" && !AUDIO_MIME_TYPES.has(detectedMimeType)) {
    throw new Error(`Expected audio but received ${detectedMimeType}.`);
  }
  return detectedMimeType;
}

function uint24LittleEndian(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

export function readImageDimensions(buffer, mimeType = detectMediaMimeType(buffer)) {
  if (mimeType === "image/png" && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mimeType === "image/gif" && buffer.length >= 10) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (mimeType === "image/jpeg") {
    let offset = 2;
    const sizeMarkers = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
      0xce, 0xcf,
    ]);
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if (segmentLength < 2 || offset + segmentLength + 2 > buffer.length) break;
      if (sizeMarkers.has(marker)) {
        return {
          width: buffer.readUInt16BE(offset + 7),
          height: buffer.readUInt16BE(offset + 5),
        };
      }
      offset += segmentLength + 2;
    }
  }
  if (mimeType === "image/webp" && buffer.length >= 30) {
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8X") {
      return {
        width: uint24LittleEndian(buffer, 24) + 1,
        height: uint24LittleEndian(buffer, 27) + 1,
      };
    }
    if (
      chunk === "VP8 " &&
      startsWith(buffer, [0x9d, 0x01, 0x2a], 23) &&
      buffer.length >= 30
    ) {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
      const bits = buffer.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
    }
  }
  throw new Error(`Could not read dimensions for ${mimeType ?? "unknown image"}.`);
}

export function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function safeProviderError(payload) {
  const candidate = payload?.error?.message ?? payload?.message;
  if (typeof candidate !== "string") return "Provider request failed.";
  return candidate.replace(/xai-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 300);
}

/**
 * @param {typeof fetch} fetchImplementation
 * @param {string} url
 * @param {{apiKey: string, method?: string, body?: unknown, acceptedStatuses?: number[]}} options
 */
export async function requestJson(
  fetchImplementation,
  url,
  { apiKey, method = "GET", body, acceptedStatuses = [200] } = {},
) {
  if (typeof fetchImplementation !== "function") {
    throw new TypeError("A fetch implementation is required.");
  }
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetchImplementation(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`xAI returned non-JSON data (HTTP ${response.status}).`);
    }
  }
  if (!acceptedStatuses.includes(response.status)) {
    throw new Error(
      `xAI request failed (HTTP ${response.status}): ${safeProviderError(payload)}`,
    );
  }
  return { payload, status: response.status };
}

export function buildImageGenerationRequest(manifest, prompt) {
  return {
    model: manifest.image.model,
    prompt,
    n: manifest.image.candidateCount,
    aspect_ratio: manifest.image.aspectRatio,
    resolution: manifest.image.resolution,
    response_format: "b64_json",
  };
}

export function decodeImageGenerationResponse(payload, expectedCount) {
  if (!payload || !Array.isArray(payload.data)) {
    throw new Error("xAI image response is missing its data array.");
  }
  if (payload.data.length !== expectedCount) {
    throw new Error(
      `xAI returned ${payload.data.length} image(s); expected ${expectedCount}.`,
    );
  }
  return payload.data.map((item, index) => {
    if (!item || typeof item.b64_json !== "string" || !item.b64_json) {
      throw new Error(`Image candidate ${index + 1} has no base64 payload.`);
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(item.b64_json)) {
      throw new Error(`Image candidate ${index + 1} has invalid base64 data.`);
    }
    const buffer = Buffer.from(item.b64_json, "base64");
    const mimeType = validateMediaBuffer(buffer, item.mime_type, {
      kind: "image",
    });
    return { buffer, mimeType };
  });
}

export function buildVideoGenerationRequest(manifest, mode, prompt, imageDataUri) {
  const configuration = manifest.video[mode];
  if (!configuration) throw new Error(`Unknown video mode: ${mode}`);
  const request = {
    model: configuration.model,
    prompt,
    duration: configuration.durationSeconds,
    aspect_ratio: configuration.aspectRatio,
    resolution: configuration.resolution,
  };
  if (mode === "imageToVideo") {
    if (!imageDataUri?.startsWith("data:image/")) {
      throw new Error("imageToVideo requires a validated image data URI.");
    }
    request.image = { url: imageDataUri };
  }
  return request;
}

export function buildTtsRequest(manifest, text) {
  const narration = manifest.narration;
  return {
    text,
    voice_id: narration.voiceId,
    language: narration.language,
    output_format: {
      codec: narration.codec,
      sample_rate: narration.sampleRate,
    },
    speed: narration.speed,
    with_timestamps: true,
  };
}

export async function assertBuiltInVoice(
  fetchImplementation,
  apiKey,
  voiceId,
) {
  const { payload } = await requestJson(
    fetchImplementation,
    `${XAI_API_BASE_URL}/tts/voices`,
    { apiKey },
  );
  if (!Array.isArray(payload?.voices)) {
    throw new Error("xAI built-in voice response is missing voices.");
  }
  const voice = payload.voices.find(
    (candidate) => candidate?.voice_id?.toLowerCase() === voiceId.toLowerCase(),
  );
  if (!voice) {
    throw new Error(`Configured voice ${voiceId} is not an available built-in voice.`);
  }
  return voice;
}

export function decodeTtsResponse(payload, expectedText) {
  if (!payload || typeof payload.audio !== "string" || !payload.audio) {
    throw new Error("xAI TTS response is missing audio.");
  }
  const buffer = Buffer.from(payload.audio, "base64");
  const mimeType = validateMediaBuffer(buffer, payload.content_type, {
    kind: "audio",
    minimumBytes: 44,
  });
  if (!Number.isFinite(payload.duration) || payload.duration <= 0) {
    throw new Error("xAI TTS response has an invalid duration.");
  }
  const characters = payload.audio_timestamps?.graph_chars;
  const times = payload.audio_timestamps?.graph_times;
  if (!Array.isArray(characters) || !Array.isArray(times)) {
    throw new Error("xAI TTS response is missing character timestamps.");
  }
  if (characters.length !== times.length || characters.join("") !== expectedText) {
    throw new Error("xAI TTS timestamps do not align with the requested transcript.");
  }
  let previousEnd = 0;
  for (const time of times) {
    if (
      !Array.isArray(time) ||
      time.length !== 2 ||
      !Number.isFinite(time[0]) ||
      !Number.isFinite(time[1]) ||
      time[0] < 0 ||
      time[1] < time[0]
    ) {
      throw new Error("xAI TTS response contains invalid character timing data.");
    }
    if (time[0] < previousEnd) {
      throw new Error(
        "xAI TTS character timings must be monotonic and must not overlap.",
      );
    }
    if (time[0] > payload.duration || time[1] > payload.duration) {
      throw new Error(
        "xAI TTS character timings must stay within the declared duration.",
      );
    }
    previousEnd = time[1];
  }
  return {
    buffer,
    mimeType,
    durationSeconds: payload.duration,
    characters,
    times,
  };
}

function formatVttTimestamp(seconds) {
  const milliseconds = Math.max(0, Math.round(seconds * 1_000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const remainingSeconds = Math.floor((milliseconds % 60_000) / 1_000);
  const remainingMilliseconds = milliseconds % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}.${String(remainingMilliseconds).padStart(3, "0")}`;
}

export function createWebVttFromCharacterTimings(text, characters, times) {
  if (characters.join("") !== text || characters.length !== times.length) {
    throw new Error("Caption timing characters must exactly match the transcript.");
  }
  const sentenceEnds = [];
  for (let index = 0; index < text.length; index += 1) {
    if (/[.!?]/.test(text[index]) || index === text.length - 1) {
      sentenceEnds.push(index);
    }
  }
  const cues = [];
  let startIndex = 0;
  for (const endIndex of sentenceEnds) {
    const cueText = text.slice(startIndex, endIndex + 1).trim();
    if (cueText) {
      const firstVisible = Math.max(
        startIndex,
        text.slice(startIndex, endIndex + 1).search(/\S/) + startIndex,
      );
      cues.push(
        `${formatVttTimestamp(times[firstVisible][0])} --> ${formatVttTimestamp(times[endIndex][1])}\n${cueText}`,
      );
    }
    startIndex = endIndex + 1;
  }
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

export async function startVideoGeneration(
  fetchImplementation,
  apiKey,
  requestBody,
) {
  const { payload } = await requestJson(
    fetchImplementation,
    `${XAI_API_BASE_URL}/videos/generations`,
    { apiKey, method: "POST", body: requestBody },
  );
  if (!payload || typeof payload.request_id !== "string" || !payload.request_id) {
    throw new Error("xAI video start response is missing request_id.");
  }
  return payload.request_id;
}

export async function pollVideoGeneration(
  fetchImplementation,
  apiKey,
  requestId,
  {
    intervalMs = 5_000,
    timeoutMs = 15 * 60_000,
    sleep = (milliseconds) =>
      new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
    now = () => Date.now(),
  } = {},
) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 0) {
    throw new Error("intervalMs must be a non-negative safe integer.");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("timeoutMs must be a positive safe integer.");
  }
  const deadline = now() + timeoutMs;
  const encodedRequestId = encodeURIComponent(requestId);

  while (now() <= deadline) {
    const { payload, status: httpStatus } = await requestJson(
      fetchImplementation,
      `${XAI_API_BASE_URL}/videos/${encodedRequestId}`,
      { apiKey, acceptedStatuses: [200, 202] },
    );
    const status = payload?.status ?? (httpStatus === 202 ? "pending" : null);
    if (status === "done") {
      const video = payload?.video ?? payload?.response?.video;
      if (!video || typeof video.url !== "string" || !video.url) {
        throw new Error("Completed xAI video response is missing video.url.");
      }
      if (video.respect_moderation === false) {
        throw new Error("xAI video did not pass provider moderation.");
      }
      return { ...payload, video };
    }
    if (["failed", "expired"].includes(status)) {
      throw new Error(`xAI video generation ${status}: ${safeProviderError(payload)}`);
    }
    if (status !== "pending" && status !== null) {
      throw new Error(`Unknown xAI video status: ${status}`);
    }
    await sleep(intervalMs);
  }
  throw new Error(`xAI video generation timed out after ${timeoutMs}ms.`);
}

/**
 * @param {typeof fetch} fetchImplementation
 * @param {string} url
 * @param {{kind?: "image" | "video" | "audio", minimumBytes?: number}} options
 */
export async function downloadAndValidateMedia(
  fetchImplementation,
  url,
  { kind, minimumBytes = 1 } = {},
) {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:") {
    throw new Error("Generated media download URL must use HTTPS.");
  }
  const response = await fetchImplementation(parsedUrl);
  if (!response.ok) {
    throw new Error(`Generated media download failed (HTTP ${response.status}).`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const mimeType = validateMediaBuffer(
    buffer,
    response.headers.get("content-type"),
    { kind, minimumBytes },
  );
  return { buffer, mimeType, sha256: sha256Hex(buffer) };
}

export async function imageFileToDataUri(filePath) {
  const buffer = await readFile(filePath);
  if (buffer.length > 15 * 1024 * 1024) {
    throw new Error("Source image exceeds the 15 MB local pipeline limit.");
  }
  const mimeType = validateMediaBuffer(buffer, null, {
    kind: "image",
    minimumBytes: 32,
  });
  return {
    dataUri: `data:${mimeType};base64,${buffer.toString("base64")}`,
    mimeType,
    sha256: sha256Hex(buffer),
  };
}

function assertString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Manifest field ${field} must be a non-empty string.`);
  }
}

export function validateCampaignManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Campaign manifest must be an object.");
  }
  if (manifest.schemaVersion !== 1) {
    throw new Error("Campaign manifest schemaVersion must be 1.");
  }
  assertString(manifest.campaignId, "campaignId");
  if (!/^[a-z0-9][a-z0-9-]{2,80}$/.test(manifest.campaignId)) {
    throw new Error("Manifest campaignId must be a lowercase safe slug.");
  }
  assertString(manifest.image?.model, "image.model");
  assertString(manifest.image?.promptFile, "image.promptFile");
  if (manifest.image.candidateCount !== 4) {
    throw new Error("Morrowward image review requires exactly four candidates.");
  }
  if (manifest.image.resolution !== "2k") {
    throw new Error("Morrowward image candidates must request 2k resolution.");
  }
  if (manifest.image.responseFormat !== "b64_json") {
    throw new Error("Morrowward images must use b64_json for private local review.");
  }
  for (const mode of ["imageToVideo", "textToVideo"]) {
    const video = manifest.video?.[mode];
    assertString(video?.model, `video.${mode}.model`);
    assertString(video?.promptFile, `video.${mode}.promptFile`);
    if (
      !Number.isSafeInteger(video.durationSeconds) ||
      video.durationSeconds < 1 ||
      video.durationSeconds > 15
    ) {
      throw new Error(`video.${mode}.durationSeconds must be from 1 to 15.`);
    }
  }
  assertString(manifest.narration?.textFile, "narration.textFile");
  assertString(manifest.narration?.voiceId, "narration.voiceId");
  if (manifest.narration.voiceType !== "built-in") {
    throw new Error("Narration must use an xAI built-in voice, never a cloned voice.");
  }
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(manifest.narration.voiceId)) {
    throw new Error("Narration voiceId must be a built-in voice slug.");
  }
  if (manifest.narration.codec !== "wav") {
    throw new Error("Narration must request WAV for lossless post-production.");
  }
  assertString(manifest.metadata?.historicalFigureDisclosure, "metadata.historicalFigureDisclosure");
  assertString(manifest.metadata?.caption, "metadata.caption");
  assertString(manifest.metadata?.transcript, "metadata.transcript");
  assertString(manifest.metadata?.source?.url, "metadata.source.url");
  if (manifest.playback?.autoplay !== false) {
    throw new Error("Playback metadata must explicitly disable autoplay.");
  }
  if (!Array.isArray(manifest.review?.hardGates) || manifest.review.hardGates.length < 1) {
    throw new Error("Review manifest must include hard gates.");
  }
  if (!Array.isArray(manifest.review?.scorecard) || manifest.review.scorecard.length < 1) {
    throw new Error("Review manifest must include a scorecard.");
  }
  return manifest;
}

function isWithinDirectory(parent, candidate) {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

/**
 * Resolve a raw-media path and fail closed unless it stays in the repository's
 * gitignored .media-review directory. Existing symbolic-link path components
 * are rejected so a custom --run/--output cannot silently redirect writes.
 */
export async function resolveMediaReviewPath(candidate, label = "Media review path") {
  if (typeof candidate !== "string" || !candidate.trim()) {
    throw new Error(`${label} must be a non-empty path.`);
  }
  const resolvedCandidate = resolve(candidate);
  if (!isWithinDirectory(MEDIA_REVIEW_ROOT, resolvedCandidate)) {
    throw new Error(`${label} must stay inside ${MEDIA_REVIEW_ROOT}.`);
  }

  const relativeCandidate = relative(MEDIA_REVIEW_ROOT, resolvedCandidate);
  const components = relativeCandidate ? relativeCandidate.split(sep) : [];
  let current = MEDIA_REVIEW_ROOT;
  for (let index = -1; index < components.length; index += 1) {
    if (index >= 0) current = resolve(current, components[index]);
    try {
      const entry = await lstat(current);
      if (entry.isSymbolicLink()) {
        throw new Error(`${label} cannot contain symbolic links: ${current}`);
      }
      if (index < components.length - 1 && !entry.isDirectory()) {
        throw new Error(`${label} has a non-directory parent: ${current}`);
      }
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
  }
  return resolvedCandidate;
}

/**
 * Ensure image-to-video receives only the exact provisional winner recorded
 * in a run's review manifest after its hard gates passed.
 */
export function assertReviewedCandidateUpload(
  reviewManifest,
  runDirectory,
  imagePath,
  actualSha256,
) {
  if (!reviewManifest || typeof reviewManifest !== "object") {
    throw new Error("The selected run has no valid review manifest.");
  }
  const selectedCandidateId = reviewManifest.selection?.selectedCandidateId;
  if (typeof selectedCandidateId !== "string" || !selectedCandidateId) {
    throw new Error(
      "Select a provisional image candidate in review.json before image-to-video.",
    );
  }
  if (!Array.isArray(reviewManifest.candidates)) {
    throw new Error("The selected run's review.json has no image candidates.");
  }
  const matchingCandidates = reviewManifest.candidates.filter(
    (entry) => entry?.id === selectedCandidateId,
  );
  if (matchingCandidates.length !== 1) {
    throw new Error(
      "selection.selectedCandidateId must match exactly one candidate in review.json.",
    );
  }
  const [candidate] = matchingCandidates;
  if (candidate.review?.hardGatesPassed !== true) {
    throw new Error(
      "The selected image candidate must pass every hard gate before upload.",
    );
  }
  if (
    typeof candidate.filename !== "string" ||
    !candidate.filename ||
    isAbsolute(candidate.filename) ||
    candidate.filename.includes("\\")
  ) {
    throw new Error("The selected candidate has an invalid relative filename.");
  }

  const resolvedRunDirectory = resolve(runDirectory);
  const imageDirectory = resolve(resolvedRunDirectory, "images");
  const reviewedImagePath = resolve(resolvedRunDirectory, candidate.filename);
  const relativeImagePath = relative(imageDirectory, reviewedImagePath);
  if (
    !relativeImagePath ||
    relativeImagePath === ".." ||
    relativeImagePath.startsWith(`..${sep}`) ||
    isAbsolute(relativeImagePath)
  ) {
    throw new Error(
      "The selected candidate file must stay inside the selected run's images directory.",
    );
  }
  if (resolve(imagePath) !== reviewedImagePath) {
    throw new Error(
      "--image must be the exact candidate selected in this run's review.json.",
    );
  }
  if (
    typeof candidate.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(candidate.sha256) ||
    typeof actualSha256 !== "string" ||
    candidate.sha256 !== actualSha256
  ) {
    throw new Error(
      "The selected image no longer matches the SHA-256 recorded in review.json.",
    );
  }
  return candidate;
}

export async function loadCampaignManifest(manifestLocation = DEFAULT_MANIFEST_PATH) {
  const manifestPath = resolve(
    manifestLocation instanceof URL ? fileURLToPath(manifestLocation) : manifestLocation,
  );
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read campaign manifest: ${error.message}`);
  }
  validateCampaignManifest(manifest);
  const manifestDirectory = dirname(manifestPath);
  const promptRoot = resolve(manifestDirectory, "../prompts");
  const readPrompt = async (relativePath) => {
    const promptPath = resolve(manifestDirectory, relativePath);
    if (!isWithinDirectory(promptRoot, promptPath)) {
      throw new Error("Prompt path must stay inside scripts/grok/prompts.");
    }
    const prompt = (await readFile(promptPath, "utf8")).trim();
    if (!prompt) throw new Error(`Prompt is empty: ${relativePath}`);
    if (prompt.length > 12_000) throw new Error(`Prompt is too large: ${relativePath}`);
    return prompt;
  };
  const prompts = {
    image: await readPrompt(manifest.image.promptFile),
    imageToVideo: await readPrompt(manifest.video.imageToVideo.promptFile),
    textToVideo: await readPrompt(manifest.video.textToVideo.promptFile),
    narration: await readPrompt(manifest.narration.textFile),
  };
  if (prompts.narration !== manifest.metadata.transcript) {
    throw new Error(
      "Narration prompt must exactly match metadata.transcript so captions and disclosures cannot drift.",
    );
  }
  return { manifest, manifestPath, prompts };
}

export async function writeJsonAtomic(path, value) {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporaryPath, path);
}

export function parseCliArguments(argumentsList) {
  const result = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${argument}`);
    }
    const key = argument.slice(2);
    const value = argumentsList[index + 1];
    if (!value || value.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = value;
      index += 1;
    }
  }
  return result;
}

export function assertExtensionMatchesMimeType(path, mimeType) {
  const expected = extensionForMimeType(mimeType);
  const actual = extname(path).toLowerCase();
  if (actual !== expected && !(expected === ".jpg" && actual === ".jpeg")) {
    throw new Error(`File extension ${actual || "(none)"} does not match ${mimeType}.`);
  }
}
