import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

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

// A quarter-second allows for ordinary frame/container timebase rounding while
// still failing materially short or long generations against the requested
// duration. Resolution is always checked exactly.
export const VIDEO_DURATION_TOLERANCE_SECONDS = 0.25;
export const NARRATION_TAIL_HEADROOM_SECONDS = 0.05;
export const MINIMUM_2K_16_BY_9_IMAGE_WIDTH = 2048;
export const MINIMUM_2K_16_BY_9_IMAGE_HEIGHT = 1152;
export const DEFAULT_MEDIA_DOWNLOAD_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_MEDIA_DOWNLOAD_BYTES = 100 * 1024 * 1024;
export const DEFAULT_XAI_JSON_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_XAI_JSON_RESPONSE_BYTES = 100 * 1024 * 1024;

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

/**
 * Fail closed unless generated image bytes match the requested 2K widescreen
 * contract. xAI documents the resolution tier as "2k" rather than promising one
 * fixed pixel matrix; current valid 16:9 output may be 2048x1152 or 2816x1584.
 * We therefore enforce the requested ratio and a true 2K-or-better floor.
 */
export function assertImageMatchesRequest(
  dimensions,
  imageConfiguration,
  label = "Generated image",
) {
  const width = dimensions?.width;
  const height = dimensions?.height;
  if (
    !Number.isSafeInteger(width) ||
    width < 1 ||
    !Number.isSafeInteger(height) ||
    height < 1
  ) {
    throw new Error(`${label} has invalid dimensions.`);
  }
  const aspectError = Math.abs(width * 9 - height * 16);
  if (aspectError > 16) {
    throw new Error(
      `${label} is ${width}x${height}; expected 16:9 output within one pixel.`,
    );
  }
  if (
    width < MINIMUM_2K_16_BY_9_IMAGE_WIDTH ||
    height < MINIMUM_2K_16_BY_9_IMAGE_HEIGHT
  ) {
    throw new Error(
      `${label} is ${width}x${height}; expected at least ${MINIMUM_2K_16_BY_9_IMAGE_WIDTH}x${MINIMUM_2K_16_BY_9_IMAGE_HEIGHT} for the requested 2k tier.`,
    );
  }
  if (
    !Number.isSafeInteger(imageConfiguration?.minimumEdgePixels) ||
    Math.min(width, height) < imageConfiguration.minimumEdgePixels
  ) {
    throw new Error(
      `${label} does not satisfy the configured minimum image edge.`,
    );
  }
  return dimensions;
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
 * @param {{apiKey: string, method?: string, body?: unknown, acceptedStatuses?: number[], timeoutMs?: number, maximumBytes?: number}} options
 */
export async function requestJson(
  fetchImplementation,
  url,
  {
    apiKey,
    method = "GET",
    body,
    acceptedStatuses = [200],
    timeoutMs = DEFAULT_XAI_JSON_TIMEOUT_MS,
    maximumBytes = DEFAULT_MAX_XAI_JSON_RESPONSE_BYTES,
  } = {},
) {
  if (typeof fetchImplementation !== "function") {
    throw new TypeError("A fetch implementation is required.");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("timeoutMs must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error("maximumBytes must be a positive safe integer.");
  }
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  let activeReader = null;
  let timedOut = false;
  let timeoutHandle;
  const timeoutPromise = new Promise((_, rejectPromise) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      controller.abort();
      activeReader?.cancel().catch(() => undefined);
      rejectPromise(
        new Error(`xAI JSON request timed out after ${timeoutMs}ms.`),
      );
    }, timeoutMs);
    timeoutHandle.unref?.();
  });

  const operation = (async () => {
    const response = await fetchImplementation(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const declaredLength = response.headers?.get?.("content-length");
    if (declaredLength !== null && declaredLength !== undefined) {
      const parsedLength = Number(declaredLength);
      if (
        Number.isSafeInteger(parsedLength) &&
        parsedLength >= 0 &&
        parsedLength > maximumBytes
      ) {
        throw new Error(
          `xAI JSON response exceeds the ${maximumBytes}-byte limit.`,
        );
      }
    }

    const chunks = [];
    let receivedBytes = 0;
    if (response.body !== null && response.body !== undefined) {
      if (typeof response.body.getReader !== "function") {
        throw new Error("xAI JSON response body is not a readable byte stream.");
      }
      activeReader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await activeReader.read();
          if (done) break;
          if (!(value instanceof Uint8Array)) {
            throw new Error("xAI JSON response stream returned invalid bytes.");
          }
          receivedBytes += value.byteLength;
          if (receivedBytes > maximumBytes) {
            await activeReader.cancel().catch(() => undefined);
            throw new Error(
              `xAI JSON response exceeds the ${maximumBytes}-byte limit.`,
            );
          }
          chunks.push(Buffer.from(value));
        }
      } finally {
        activeReader.releaseLock();
        activeReader = null;
      }
    }

    const text = Buffer.concat(chunks, receivedBytes).toString("utf8");
    let payload = null;
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
  })();

  try {
    return await Promise.race([operation, timeoutPromise]);
  } catch (error) {
    if (timedOut) {
      throw new Error(`xAI JSON request timed out after ${timeoutMs}ms.`, {
        cause: error,
      });
    }
    throw error;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
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

export function buildNarrationDisclosure(manifest) {
  assertString(
    manifest?.metadata?.voiceDisclosure,
    "metadata.voiceDisclosure",
  );
  return `AI-generated narration using an xAI built-in voice. ${manifest.metadata.voiceDisclosure}`;
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
    if (/[.!?]/.test(text[index])) {
      let endIndex = index;
      while (
        endIndex + 1 < text.length &&
        /["'\u2019\u201d]/.test(text[endIndex + 1])
      ) {
        endIndex += 1;
      }
      sentenceEnds.push(endIndex);
      index = endIndex;
    } else if (index === text.length - 1) {
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

  while (true) {
    const remainingRequestMs = Math.floor(deadline - now());
    if (remainingRequestMs < 1) break;
    const { payload, status: httpStatus } = await requestJson(
      fetchImplementation,
      `${XAI_API_BASE_URL}/videos/${encodedRequestId}`,
      {
        apiKey,
        acceptedStatuses: [200, 202],
        timeoutMs: Math.min(
          DEFAULT_XAI_JSON_TIMEOUT_MS,
          remainingRequestMs,
        ),
      },
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
    const remainingSleepMs = Math.floor(deadline - now());
    if (remainingSleepMs < 1) break;
    await sleep(Math.min(intervalMs, remainingSleepMs));
  }
  throw new Error(`xAI video generation timed out after ${timeoutMs}ms.`);
}

/**
 * @param {typeof fetch} fetchImplementation
 * @param {string} url
 * @param {{kind?: "image" | "video" | "audio", minimumBytes?: number, maximumBytes?: number, timeoutMs?: number}} options
 */
export async function downloadAndValidateMedia(
  fetchImplementation,
  url,
  {
    kind,
    minimumBytes = 1,
    maximumBytes = DEFAULT_MAX_MEDIA_DOWNLOAD_BYTES,
    timeoutMs = DEFAULT_MEDIA_DOWNLOAD_TIMEOUT_MS,
  } = {},
) {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:") {
    throw new Error("Generated media download URL must use HTTPS.");
  }
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error("maximumBytes must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(minimumBytes) || minimumBytes < 1) {
    throw new Error("minimumBytes must be a positive safe integer.");
  }
  if (minimumBytes > maximumBytes) {
    throw new Error("minimumBytes cannot exceed maximumBytes.");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("timeoutMs must be a positive safe integer.");
  }

  const controller = new AbortController();
  let timedOut = false;
  let timeoutHandle;
  const timeoutPromise = new Promise((_, rejectPromise) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      rejectPromise(
        new Error(`Generated media download timed out after ${timeoutMs}ms.`),
      );
      controller.abort();
    }, timeoutMs);
    timeoutHandle.unref?.();
  });

  const operation = (async () => {
    const response = await fetchImplementation(parsedUrl, {
      redirect: "follow",
      signal: controller.signal,
    });
    if (response.url) {
      let finalUrl;
      try {
        finalUrl = new URL(response.url);
      } catch {
        throw new Error("Generated media response has an invalid final URL.");
      }
      if (finalUrl.protocol !== "https:") {
        throw new Error(
          "Generated media final redirect URL must continue to use HTTPS.",
        );
      }
    }
    if (!response.ok) {
      throw new Error(
        `Generated media download failed (HTTP ${response.status}).`,
      );
    }

    const declaredLength = response.headers.get("content-length");
    if (declaredLength !== null) {
      const parsedLength = Number(declaredLength);
      if (
        Number.isSafeInteger(parsedLength) &&
        parsedLength >= 0 &&
        parsedLength > maximumBytes
      ) {
        throw new Error(
          `Generated media exceeds the ${maximumBytes}-byte download limit.`,
        );
      }
    }

    let buffer;
    if (response.body && typeof response.body.getReader === "function") {
      const reader = response.body.getReader();
      const chunks = [];
      let downloadedBytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!(value instanceof Uint8Array)) {
            throw new Error("Generated media stream returned invalid bytes.");
          }
          downloadedBytes += value.byteLength;
          if (downloadedBytes > maximumBytes) {
            await reader.cancel().catch(() => undefined);
            throw new Error(
              `Generated media exceeds the ${maximumBytes}-byte download limit.`,
            );
          }
          chunks.push(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
      }
      buffer = Buffer.concat(chunks, downloadedBytes);
    } else {
      buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > maximumBytes) {
        throw new Error(
          `Generated media exceeds the ${maximumBytes}-byte download limit.`,
        );
      }
    }

    const mimeType = validateMediaBuffer(
      buffer,
      response.headers.get("content-type"),
      { kind, minimumBytes },
    );
    return { buffer, mimeType, sha256: sha256Hex(buffer) };
  })();

  try {
    return await Promise.race([operation, timeoutPromise]);
  } catch (error) {
    if (timedOut) {
      throw new Error(`Generated media download timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
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

function positiveDuration(value) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Parse the deliberately small ffprobe JSON shape requested by probeMediaFile. */
export function parseFfprobeMedia(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("ffprobe output must be a JSON object.");
  }
  if (!Array.isArray(payload.streams)) {
    throw new Error("ffprobe output is missing its streams array.");
  }

  const videoStream = payload.streams.find(
    (stream) => stream?.codec_type === "video",
  );
  const audioStream = payload.streams.find(
    (stream) => stream?.codec_type === "audio",
  );
  const durationSeconds =
    positiveDuration(payload.format?.duration) ??
    positiveDuration(videoStream?.duration) ??
    positiveDuration(audioStream?.duration);
  if (durationSeconds === null) {
    throw new Error("ffprobe output has no positive media duration.");
  }

  let video = null;
  if (videoStream) {
    if (
      !Number.isSafeInteger(videoStream.width) ||
      videoStream.width < 1 ||
      !Number.isSafeInteger(videoStream.height) ||
      videoStream.height < 1
    ) {
      throw new Error("ffprobe video stream has invalid dimensions.");
    }
    video = {
      width: videoStream.width,
      height: videoStream.height,
    };
  }

  return {
    durationSeconds,
    video,
    hasAudio: Boolean(audioStream),
  };
}

/** Inspect actual media bytes with ffprobe; never trust only request metadata. */
export function probeMediaFile(
  path,
  { spawnImplementation = spawn } = {},
) {
  if (typeof path !== "string" || !path.trim()) {
    throw new Error("Media probe path must be a non-empty string.");
  }
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawnImplementation(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,width,height,duration",
        "-of",
        "json",
        path,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    let errorOutput = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.length > 1_000_000) {
        child.kill();
        rejectPromise(new Error("ffprobe output exceeded the 1 MB safety limit."));
      }
    });
    child.stderr.on("data", (chunk) => {
      errorOutput += chunk.toString();
      if (errorOutput.length > 8_000) errorOutput = errorOutput.slice(-8_000);
    });
    child.on("error", (error) => {
      rejectPromise(new Error(`Could not start ffprobe: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(
          new Error(`ffprobe exited ${code}: ${errorOutput.trim() || "no details"}`),
        );
        return;
      }
      try {
        resolvePromise(parseFfprobeMedia(JSON.parse(output)));
      } catch (error) {
        rejectPromise(new Error(`Could not validate ffprobe output: ${error.message}`));
      }
    });
  });
}

export function assertVideoMatchesRequest(
  probe,
  {
    expectedWidth = 1280,
    expectedHeight = 720,
    expectedDurationSeconds,
    toleranceSeconds = VIDEO_DURATION_TOLERANCE_SECONDS,
    requireAudio = false,
    label = "Video",
  },
) {
  if (!probe?.video) throw new Error(`${label} has no video stream.`);
  if (!Number.isFinite(probe.durationSeconds) || probe.durationSeconds <= 0) {
    throw new Error(`${label} has no positive measured duration.`);
  }
  if (
    probe.video.width !== expectedWidth ||
    probe.video.height !== expectedHeight
  ) {
    throw new Error(
      `${label} is ${probe.video.width}x${probe.video.height}; expected exactly ${expectedWidth}x${expectedHeight}.`,
    );
  }
  if (!Number.isFinite(expectedDurationSeconds) || expectedDurationSeconds <= 0) {
    throw new Error("Expected video duration must be a positive number.");
  }
  if (!Number.isFinite(toleranceSeconds) || toleranceSeconds < 0) {
    throw new Error("Video duration tolerance must be a non-negative number.");
  }
  const difference = Math.abs(
    probe.durationSeconds - expectedDurationSeconds,
  );
  if (difference > toleranceSeconds) {
    throw new Error(
      `${label} is ${probe.durationSeconds.toFixed(3)}s; expected ${expectedDurationSeconds}s within +/-${toleranceSeconds}s.`,
    );
  }
  if (requireAudio && !probe.hasAudio) {
    throw new Error(`${label} has no audio stream.`);
  }
  return probe;
}

export function assertNarrationFitsVisual(videoProbe, narrationProbe) {
  if (!videoProbe?.video) throw new Error("Visual input has no video stream.");
  if (
    !Number.isFinite(videoProbe.durationSeconds) ||
    videoProbe.durationSeconds <= 0
  ) {
    throw new Error("Visual input has no positive measured duration.");
  }
  if (!narrationProbe?.hasAudio) {
    throw new Error("Narration input has no audio stream.");
  }
  if (
    !Number.isFinite(narrationProbe.durationSeconds) ||
    narrationProbe.durationSeconds <= 0
  ) {
    throw new Error("Narration input has no positive measured duration.");
  }
  const maximumNarrationDuration =
    videoProbe.durationSeconds - NARRATION_TAIL_HEADROOM_SECONDS;
  if (narrationProbe.durationSeconds > maximumNarrationDuration) {
    throw new Error(
      `Narration is ${narrationProbe.durationSeconds.toFixed(3)}s but the visual is ${videoProbe.durationSeconds.toFixed(3)}s; narration must fit with at least ${NARRATION_TAIL_HEADROOM_SECONDS}s tail headroom.`,
    );
  }
  return {
    visualDurationSeconds: videoProbe.durationSeconds,
    narrationDurationSeconds: narrationProbe.durationSeconds,
    tailHeadroomSeconds:
      videoProbe.durationSeconds - narrationProbe.durationSeconds,
  };
}

function assertString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Manifest field ${field} must be a non-empty string.`);
  }
}

function normalizedWords(value) {
  return (
    value
      .normalize("NFKC")
      .toLocaleLowerCase("en-US")
      .match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)
      ?.map((word) => word.replaceAll("’", "'"))
      .join(" ") ?? ""
  );
}

function includesNormalizedPhrase(value, phrase) {
  const normalizedValue = normalizedWords(value);
  const normalizedPhrase = normalizedWords(phrase);
  return (
    normalizedPhrase.length > 0 &&
    ` ${normalizedValue} `.includes(` ${normalizedPhrase} `)
  );
}

export function assertQuoteSourceConsistency(
  metadata,
  label = "Manifest metadata",
) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error(`${label} must be an object.`);
  }
  assertString(metadata.transcript, `${label}.transcript`);
  assertString(metadata.directQuote, `${label}.directQuote`);
  assertString(
    metadata.directQuoteAttribution,
    `${label}.directQuoteAttribution`,
  );
  const source = metadata.source;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error(`${label}.source must be an object.`);
  }
  for (const field of [
    "author",
    "work",
    "location",
    "usage",
    "url",
  ]) {
    assertString(source[field], `${label}.source.${field}`);
  }

  const usesLegacyExactText = source.publicDomainExactText !== undefined;
  const usesNormalizedArchivalText =
    source.archivalExactText !== undefined ||
    source.normalizationNote !== undefined;
  if (usesLegacyExactText === usesNormalizedArchivalText) {
    throw new Error(
      `${label}.source must include either publicDomainExactText or archivalExactText/normalizationNote, but not both.`,
    );
  }
  if (usesLegacyExactText) {
    assertString(
      source.publicDomainExactText,
      `${label}.source.publicDomainExactText`,
    );
  } else {
    assertString(
      source.archivalExactText,
      `${label}.source.archivalExactText`,
    );
    assertString(
      source.normalizationNote,
      `${label}.source.normalizationNote`,
    );
  }

  const usesLegacyTranslationCredit =
    source.translator !== undefined || source.translationYear !== undefined;
  const usesGenericEditionCredit =
    source.editionCredit !== undefined || source.publicationYear !== undefined;
  if (usesLegacyTranslationCredit === usesGenericEditionCredit) {
    throw new Error(
      `${label}.source must include either translator/translationYear or editionCredit/publicationYear, but not both.`,
    );
  }

  let sourceCredit;
  if (usesLegacyTranslationCredit) {
    assertString(source.translator, `${label}.source.translator`);
    if (
      !Number.isSafeInteger(source.translationYear) ||
      source.translationYear < 1 ||
      source.translationYear > 2100
    ) {
      throw new Error(`${label}.source.translationYear must be a valid year.`);
    }
    sourceCredit = source.translator;
  } else {
    assertString(source.editionCredit, `${label}.source.editionCredit`);
    if (
      !Number.isSafeInteger(source.publicationYear) ||
      source.publicationYear < 1 ||
      source.publicationYear > 2100
    ) {
      throw new Error(`${label}.source.publicationYear must be a valid year.`);
    }
    sourceCredit = source.editionCredit;
  }

  if (
    usesLegacyExactText &&
    metadata.directQuote !== source.publicDomainExactText
  ) {
    throw new Error(
      `${label}.directQuote must exactly match source.publicDomainExactText.`,
    );
  }
  if (
    usesNormalizedArchivalText &&
    normalizedWords(metadata.directQuote) !==
      normalizedWords(source.archivalExactText)
  ) {
    throw new Error(
      `${label}.directQuote must preserve source.archivalExactText wording and word order after the documented normalization.`,
    );
  }
  if (!metadata.transcript.includes(metadata.directQuote)) {
    throw new Error(`${label}.transcript must include the exact direct quote.`);
  }
  if (
    !includesNormalizedPhrase(metadata.transcript, source.author) &&
    !includesNormalizedPhrase(
      metadata.directQuoteAttribution,
      source.author,
    )
  ) {
    throw new Error(
      `${label}.source.author must be named in transcript or directQuoteAttribution.`,
    );
  }
  if (
    !includesNormalizedPhrase(metadata.directQuoteAttribution, source.work) ||
    !includesNormalizedPhrase(metadata.directQuoteAttribution, sourceCredit)
  ) {
    throw new Error(
      `${label}.directQuoteAttribution must identify the source work and source credit.`,
    );
  }
  let sourceUrl;
  try {
    sourceUrl = new URL(source.url);
  } catch {
    throw new Error(`${label}.source.url must be a valid HTTPS URL.`);
  }
  if (sourceUrl.protocol !== "https:") {
    throw new Error(`${label}.source.url must be a valid HTTPS URL.`);
  }
  return metadata;
}

export function validateReviewPolicy(review, label = "review") {
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    throw new Error(`Manifest field ${label} must be an object.`);
  }
  if (!Array.isArray(review.hardGates) || review.hardGates.length < 1) {
    throw new Error("Review manifest must include hard gates.");
  }
  const hardGateSet = new Set();
  for (const [index, hardGate] of review.hardGates.entries()) {
    assertString(hardGate, `${label}.hardGates[${index}]`);
    if (hardGateSet.has(hardGate)) {
      throw new Error(`${label}.hardGates must not contain duplicates.`);
    }
    hardGateSet.add(hardGate);
  }
  if (!Array.isArray(review.scorecard) || review.scorecard.length < 1) {
    throw new Error("Review manifest must include a scorecard.");
  }

  const scorecardIds = new Set();
  let maximumTotal = 0;
  let smallestMaximum = Number.POSITIVE_INFINITY;
  for (const [index, dimension] of review.scorecard.entries()) {
    if (!dimension || typeof dimension !== "object" || Array.isArray(dimension)) {
      throw new Error(`${label}.scorecard[${index}] must be an object.`);
    }
    assertString(dimension.id, `${label}.scorecard[${index}].id`);
    if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(dimension.id)) {
      throw new Error(`${label}.scorecard[${index}].id must be a safe slug.`);
    }
    if (scorecardIds.has(dimension.id)) {
      throw new Error(`${label}.scorecard ids must be unique.`);
    }
    scorecardIds.add(dimension.id);
    assertString(dimension.label, `${label}.scorecard[${index}].label`);
    if (
      !Number.isSafeInteger(dimension.maximum) ||
      dimension.maximum < 1 ||
      dimension.maximum > 10
    ) {
      throw new Error(
        `${label}.scorecard[${index}].maximum must be an integer from 1 to 10.`,
      );
    }
    maximumTotal += dimension.maximum;
    smallestMaximum = Math.min(smallestMaximum, dimension.maximum);
  }

  if (
    !Number.isSafeInteger(review.minimumDimensionScore) ||
    review.minimumDimensionScore < 1 ||
    review.minimumDimensionScore > smallestMaximum
  ) {
    throw new Error(
      `${label}.minimumDimensionScore must be a positive integer no greater than every dimension maximum.`,
    );
  }
  const dimensionFloorTotal =
    review.minimumDimensionScore * review.scorecard.length;
  if (
    !Number.isSafeInteger(review.minimumScore) ||
    review.minimumScore < dimensionFloorTotal ||
    review.minimumScore > maximumTotal
  ) {
    throw new Error(
      `${label}.minimumScore must be an integer from ${dimensionFloorTotal} to ${maximumTotal}.`,
    );
  }
  if (review.humanFinalApprovalRequired !== true) {
    throw new Error(`${label}.humanFinalApprovalRequired must be true.`);
  }
  return { maximumTotal, scorecard: review.scorecard };
}

/**
 * A run's editable review.json may record scores and notes, but it may not
 * redefine what passing means. Bind every acceptance step to the exact review
 * policy in the selected, committed campaign manifest.
 */
export function assertReviewPolicyMatchesCampaign(
  runReviewPolicy,
  campaignReviewPolicy,
  label = "review.json.reviewPolicy",
) {
  validateReviewPolicy(
    campaignReviewPolicy,
    "campaign manifest review policy",
  );
  validateReviewPolicy(runReviewPolicy, label);
  if (!isDeepStrictEqual(runReviewPolicy, campaignReviewPolicy)) {
    throw new Error(
      `${label} must exactly match the campaign manifest review policy.`,
    );
  }
  return runReviewPolicy;
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
  if (manifest.image.aspectRatio !== "16:9") {
    throw new Error("Morrowward image candidates must request 16:9 output.");
  }
  if (manifest.image.responseFormat !== "b64_json") {
    throw new Error("Morrowward images must use b64_json for private local review.");
  }
  if (
    !Number.isSafeInteger(manifest.image.minimumEdgePixels) ||
    manifest.image.minimumEdgePixels < 1000 ||
    manifest.image.minimumEdgePixels > MINIMUM_2K_16_BY_9_IMAGE_HEIGHT
  ) {
    throw new Error(
      `image.minimumEdgePixels must be an integer from 1000 to ${MINIMUM_2K_16_BY_9_IMAGE_HEIGHT}.`,
    );
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
    if (video.aspectRatio !== "16:9") {
      throw new Error(`video.${mode}.aspectRatio must be 16:9.`);
    }
    if (video.resolution !== "720p") {
      throw new Error(`video.${mode}.resolution must be 720p.`);
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
  assertString(manifest.metadata?.aiInterpretationBadge, "metadata.aiInterpretationBadge");
  assertString(manifest.metadata?.historicalFigureDisclosure, "metadata.historicalFigureDisclosure");
  assertString(manifest.metadata?.caption, "metadata.caption");
  assertString(manifest.metadata?.voiceDisclosure, "metadata.voiceDisclosure");
  assertQuoteSourceConsistency(manifest.metadata, "metadata");
  if (manifest.playback?.autoplay !== false) {
    throw new Error("Playback metadata must explicitly disable autoplay.");
  }
  validateReviewPolicy(manifest.review);
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

export function assertReviewScores(
  candidateReview,
  reviewPolicy,
  label = "The reviewed item",
) {
  if (
    !candidateReview?.scores ||
    typeof candidateReview.scores !== "object" ||
    Array.isArray(candidateReview.scores)
  ) {
    throw new Error(`${label} must include a complete score object.`);
  }
  const expectedIds = reviewPolicy.scorecard.map((dimension) => dimension.id);
  const actualIds = Object.keys(candidateReview.scores);
  const missingIds = expectedIds.filter(
    (id) => !Object.hasOwn(candidateReview.scores, id),
  );
  const unexpectedIds = actualIds.filter((id) => !expectedIds.includes(id));
  if (missingIds.length > 0 || unexpectedIds.length > 0) {
    throw new Error(
      `${label}'s scores must exactly match the review scorecard (missing: ${missingIds.join(", ") || "none"}; unexpected: ${unexpectedIds.join(", ") || "none"}).`,
    );
  }

  let computedTotal = 0;
  for (const dimension of reviewPolicy.scorecard) {
    const score = candidateReview.scores[dimension.id];
    if (
      !Number.isSafeInteger(score) ||
      score < 1 ||
      score > dimension.maximum
    ) {
      throw new Error(
        `Review score ${dimension.id} must be an integer from 1 to ${dimension.maximum}.`,
      );
    }
    if (score < reviewPolicy.minimumDimensionScore) {
      throw new Error(
        `Review score ${dimension.id} is below minimumDimensionScore ${reviewPolicy.minimumDimensionScore}.`,
      );
    }
    computedTotal += score;
  }
  if (
    !Number.isSafeInteger(candidateReview.totalScore) ||
    candidateReview.totalScore !== computedTotal
  ) {
    throw new Error(
      `${label}'s totalScore must equal the computed score total ${computedTotal}.`,
    );
  }
  if (computedTotal < reviewPolicy.minimumScore) {
    throw new Error(
      `The selected candidate's score total ${computedTotal} is below minimumScore ${reviewPolicy.minimumScore}.`,
    );
  }
  return computedTotal;
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
  assertQuoteSourceConsistency(
    {
      transcript: reviewManifest.transcript,
      directQuote: reviewManifest.directQuote,
      directQuoteAttribution: reviewManifest.directQuoteAttribution,
      source: reviewManifest.source,
    },
    "review.json",
  );
  validateReviewPolicy(reviewManifest.reviewPolicy, "review.json.reviewPolicy");
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
  assertReviewScores(
    candidate.review,
    reviewManifest.reviewPolicy,
    "The selected candidate",
  );
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
