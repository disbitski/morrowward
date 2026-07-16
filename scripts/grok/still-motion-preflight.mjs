import { spawn } from "node:child_process";
import {
  lstat,
  open,
  readdir,
  unlink,
} from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { isAbsolute, resolve } from "node:path";
import { assertReviewScores } from "./media-lib.mjs";

export const STILL_MOTION_ID = "still-motion";
export const STILL_MOTION_FILENAME = "videos/still-motion.mp4";
export const STILL_MOTION_PROVIDER = "local";
export const STILL_MOTION_WORKFLOW =
  "deterministic-ffmpeg-still-to-video";
export const MAX_STILL_MOTION_BYTES = 50 * 1024 * 1024;
export const STILL_MOTION_SOURCE_MIME_TYPES = Object.freeze([
  "image/png",
  "image/jpeg",
]);

const STILL_MOTION_SPEC_VALUE = {
  schemaVersion: 1,
  name: "subtle-centered-camera-push",
  description:
    "A deterministic center-anchored camera push over one reviewed still; no person, object, environmental, or generated scene motion.",
  durationSeconds: 15,
  outputWidth: 1280,
  outputHeight: 720,
  framesPerSecond: 30,
  totalFrames: 450,
  startScale: 1,
  endScale: 1.02,
  maximumScaleIncreasePercent: 2,
  easing: "smoothstep",
  anchor: "center",
  personMotion: "none",
  objectMotion: "none",
  environmentalMotion: "none",
  frameSource: "single-reviewed-still",
  generativeVideoModelUsed: false,
  audio: "none",
};

export const STILL_MOTION_SPEC = Object.freeze({
  ...STILL_MOTION_SPEC_VALUE,
});
export const STILL_MOTION_ENCODER_SPEC = Object.freeze({
  encoder: "libx264",
  outputCodec: "h264",
  preset: "slow",
  crf: 18,
  pixelFormat: "yuv420p",
  profile: "high",
  level: "3.1",
  gopSizeFrames: 60,
  minimumKeyframeIntervalFrames: 60,
  sceneChangeThreshold: 0,
  threads: 1,
  formatFlags: "+bitexact",
  videoFlags: "+bitexact",
  container: "mp4",
  movFlags: "+frag_keyframe+empty_moov+default_base_moof",
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

/**
 * The renderer accepts only the run and optional campaign manifest. It never
 * accepts an upload acknowledgement, alternate source image, output path,
 * duration, zoom, or encoder override.
 */
export function validateStillMotionCliOptions(options) {
  if (!isRecord(options)) {
    throw new Error("Still-motion options must be an object.");
  }
  const allowed = new Set(["run", "manifest"]);
  const unexpected = Object.keys(options).filter((key) => !allowed.has(key));
  if (unexpected.length) {
    throw new Error(
      `Unsupported still-motion option(s): ${unexpected.join(", ")}.`,
    );
  }
  requiredString(options.run, "--run");
  if (options.manifest !== undefined) {
    requiredString(options.manifest, "--manifest");
  }
  return options;
}

export function smoothstepScaleAt(frameIndex) {
  if (
    !Number.isSafeInteger(frameIndex) ||
    frameIndex < 0 ||
    frameIndex >= STILL_MOTION_SPEC.totalFrames
  ) {
    throw new Error(
      `Still-motion frame index must be from 0 to ${STILL_MOTION_SPEC.totalFrames - 1}.`,
    );
  }
  const progress = frameIndex / (STILL_MOTION_SPEC.totalFrames - 1);
  const eased = 3 * progress * progress - 2 * progress * progress * progress;
  return (
    STILL_MOTION_SPEC.startScale +
    (STILL_MOTION_SPEC.endScale - STILL_MOTION_SPEC.startScale) * eased
  );
}

export function buildStillMotionFilterGraph() {
  const finalFrame = STILL_MOTION_SPEC.totalFrames - 1;
  const progress = `(on/${finalFrame})`;
  const eased = `(3*${progress}*${progress}-2*${progress}*${progress}*${progress})`;
  const zoom = `${STILL_MOTION_SPEC.startScale}+0.02*${eased}`;
  return [
    `scale=${STILL_MOTION_SPEC.outputWidth}:${STILL_MOTION_SPEC.outputHeight}:flags=lanczos`,
    [
      `zoompan=z='${zoom}'`,
      "x='(iw-iw/zoom)/2'",
      "y='(ih-ih/zoom)/2'",
      "d=1",
      `s=${STILL_MOTION_SPEC.outputWidth}x${STILL_MOTION_SPEC.outputHeight}`,
      `fps=${STILL_MOTION_SPEC.framesPerSecond}`,
    ].join(":"),
    "format=yuv420p",
  ].join(",");
}

export function buildStillMotionFfmpegArguments(imagePath) {
  requiredString(imagePath, "Still-motion source image path");
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-loop",
    "1",
    "-framerate",
    String(STILL_MOTION_SPEC.framesPerSecond),
    "-i",
    imagePath,
    "-map",
    "0:v:0",
    "-vf",
    buildStillMotionFilterGraph(),
    "-frames:v",
    String(STILL_MOTION_SPEC.totalFrames),
    "-an",
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    "-c:v",
    STILL_MOTION_ENCODER_SPEC.encoder,
    "-preset",
    STILL_MOTION_ENCODER_SPEC.preset,
    "-crf",
    String(STILL_MOTION_ENCODER_SPEC.crf),
    "-pix_fmt",
    STILL_MOTION_ENCODER_SPEC.pixelFormat,
    "-profile:v",
    STILL_MOTION_ENCODER_SPEC.profile,
    "-level:v",
    STILL_MOTION_ENCODER_SPEC.level,
    "-g",
    String(STILL_MOTION_ENCODER_SPEC.gopSizeFrames),
    "-keyint_min",
    String(STILL_MOTION_ENCODER_SPEC.minimumKeyframeIntervalFrames),
    "-sc_threshold",
    String(STILL_MOTION_ENCODER_SPEC.sceneChangeThreshold),
    "-threads",
    String(STILL_MOTION_ENCODER_SPEC.threads),
    "-fflags",
    STILL_MOTION_ENCODER_SPEC.formatFlags,
    "-flags:v",
    STILL_MOTION_ENCODER_SPEC.videoFlags,
    "-f",
    STILL_MOTION_ENCODER_SPEC.container,
    "-movflags",
    STILL_MOTION_ENCODER_SPEC.movFlags,
    "pipe:1",
  ];
}

function pngContainsAnimationControlChunk(buffer) {
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const chunkLength = buffer.readUInt32BE(offset);
    const chunkEnd = offset + 12 + chunkLength;
    if (!Number.isSafeInteger(chunkEnd) || chunkEnd > buffer.length) break;
    const chunkType = buffer.toString("ascii", offset + 4, offset + 8);
    if (chunkType === "acTL") return true;
    if (chunkType === "IEND") break;
    offset = chunkEnd;
  }
  return false;
}

/**
 * The local renderer intentionally accepts only conservative, static still
 * formats. GIF and WebP can contain animation that `-loop 1` would interpret
 * differently across demuxers/tool versions. APNG is also rejected explicitly.
 */
export function assertStillMotionSourceImageFormat(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError("Still-motion source image must be a Buffer.");
  }
  if (!STILL_MOTION_SOURCE_MIME_TYPES.includes(mimeType)) {
    throw new Error(
      `Still-motion source image must be a static PNG or JPEG; received ${mimeType ?? "an unknown format"}.`,
    );
  }
  if (
    mimeType === "image/png" &&
    pngContainsAnimationControlChunk(buffer)
  ) {
    throw new Error(
      "Still-motion source image must be static; animated PNG is not supported.",
    );
  }
  return mimeType;
}

/**
 * Keep the format gate inseparable from the render call so unsupported formats
 * fail before ffmpeg can start, even if a future caller skips an earlier check.
 */
export function renderStillMotionSource(
  imagePath,
  imageBuffer,
  mimeType,
  {
    renderImplementation = renderStillMotionBuffer,
    renderOptions,
  } = {},
) {
  assertStillMotionSourceImageFormat(imageBuffer, mimeType);
  return renderImplementation(imagePath, renderOptions);
}

function parsePositiveNumber(value) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parsePositiveInteger(value) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseFrameRate(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string" || !value.trim() || value === "N/A") {
    return null;
  }
  const [numeratorText, denominatorText] = value.split("/", 2);
  const numerator = Number(numeratorText);
  const denominator =
    denominatorText === undefined ? 1 : Number(denominatorText);
  if (
    !Number.isFinite(numerator) ||
    numerator <= 0 ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return null;
  }
  return numerator / denominator;
}

/** Parse the exact ffprobe evidence requested by probeStillMotionFile. */
export function parseStillMotionFfprobeMedia(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.streams)) {
    throw new Error(
      "Still-motion ffprobe output must contain a streams array.",
    );
  }
  const videoStreams = payload.streams.filter(
    (stream) => stream?.codec_type === "video",
  );
  if (videoStreams.length !== 1) {
    throw new Error(
      `Still-motion output must contain exactly one video stream; found ${videoStreams.length}.`,
    );
  }
  const [videoStream] = videoStreams;
  if (
    !Number.isSafeInteger(videoStream.width) ||
    videoStream.width < 1 ||
    !Number.isSafeInteger(videoStream.height) ||
    videoStream.height < 1
  ) {
    throw new Error("Still-motion ffprobe output has invalid dimensions.");
  }
  const durationSeconds =
    parsePositiveNumber(payload.format?.duration) ??
    parsePositiveNumber(videoStream.duration);
  if (durationSeconds === null) {
    throw new Error(
      "Still-motion ffprobe output has no positive measured duration.",
    );
  }
  const averageFramesPerSecond = parseFrameRate(
    videoStream.avg_frame_rate,
  );
  const realFramesPerSecond = parseFrameRate(videoStream.r_frame_rate);
  const framesPerSecond =
    averageFramesPerSecond ?? realFramesPerSecond;
  if (framesPerSecond === null) {
    throw new Error(
      "Still-motion ffprobe output has no positive measured frame rate.",
    );
  }
  const countedFrames = parsePositiveInteger(videoStream.nb_read_frames);
  const reportedFrames = parsePositiveInteger(videoStream.nb_frames);
  if (
    countedFrames !== null &&
    reportedFrames !== null &&
    countedFrames !== reportedFrames
  ) {
    throw new Error(
      "Still-motion ffprobe frame counts disagree with one another.",
    );
  }
  const frameCount = countedFrames ?? reportedFrames;
  return {
    durationSeconds,
    video: {
      width: videoStream.width,
      height: videoStream.height,
    },
    codecName:
      typeof videoStream.codec_name === "string"
        ? videoStream.codec_name
        : null,
    framesPerSecond,
    averageFramesPerSecond,
    realFramesPerSecond,
    frameCount,
    frameCountSource:
      countedFrames !== null
        ? "nb_read_frames"
        : reportedFrames !== null
          ? "nb_frames"
          : "unavailable",
    pixelFormat:
      typeof videoStream.pix_fmt === "string" ? videoStream.pix_fmt : null,
    profile:
      typeof videoStream.profile === "string" ? videoStream.profile : null,
    level: Number.isSafeInteger(videoStream.level)
      ? videoStream.level
      : null,
    videoStreamCount: videoStreams.length,
    hasAudio: payload.streams.some(
      (stream) => stream?.codec_type === "audio",
    ),
  };
}

export function assertStillMotionProbeMatchesSpec(
  probe,
  label = "Deterministic still-motion output",
) {
  if (!isRecord(probe) || !isRecord(probe.video)) {
    throw new Error(`${label} has no video stream.`);
  }
  if (
    probe.video.width !== STILL_MOTION_SPEC.outputWidth ||
    probe.video.height !== STILL_MOTION_SPEC.outputHeight
  ) {
    throw new Error(
      `${label} is ${probe.video.width}x${probe.video.height}; expected exactly ${STILL_MOTION_SPEC.outputWidth}x${STILL_MOTION_SPEC.outputHeight}.`,
    );
  }
  if (probe.durationSeconds !== STILL_MOTION_SPEC.durationSeconds) {
    throw new Error(
      `${label} is ${probe.durationSeconds}s; expected exactly ${STILL_MOTION_SPEC.durationSeconds}s.`,
    );
  }
  if (probe.codecName !== STILL_MOTION_ENCODER_SPEC.outputCodec) {
    throw new Error(
      `${label} codec is ${probe.codecName ?? "unknown"}; expected ${STILL_MOTION_ENCODER_SPEC.outputCodec}.`,
    );
  }
  for (const [rateLabel, rate] of [
    ["measured", probe.framesPerSecond],
    ["average", probe.averageFramesPerSecond],
    ["real", probe.realFramesPerSecond],
  ]) {
    if (
      rate !== null &&
      rate !== undefined &&
      rate !== STILL_MOTION_SPEC.framesPerSecond
    ) {
      throw new Error(
        `${label} ${rateLabel} frame rate is ${rate}; expected exactly ${STILL_MOTION_SPEC.framesPerSecond} fps.`,
      );
    }
  }
  if (probe.framesPerSecond !== STILL_MOTION_SPEC.framesPerSecond) {
    throw new Error(
      `${label} frame rate must be exactly ${STILL_MOTION_SPEC.framesPerSecond} fps.`,
    );
  }
  if (probe.frameCount !== STILL_MOTION_SPEC.totalFrames) {
    throw new Error(
      `${label} contains ${probe.frameCount ?? "an unverified number of"} frames; expected exactly ${STILL_MOTION_SPEC.totalFrames}.`,
    );
  }
  if (probe.videoStreamCount !== 1) {
    throw new Error(`${label} must contain exactly one video stream.`);
  }
  if (
    probe.pixelFormat !== STILL_MOTION_ENCODER_SPEC.pixelFormat ||
    typeof probe.profile !== "string" ||
    probe.profile.toLowerCase() !== STILL_MOTION_ENCODER_SPEC.profile ||
    probe.level !== 31
  ) {
    throw new Error(
      `${label} must preserve yuv420p High-profile H.264 level 3.1 output.`,
    );
  }
  if (probe.hasAudio !== false) {
    throw new Error(`${label} must not contain an audio stream.`);
  }
  return probe;
}

/** Probe exact codec, timing, frame-count, stream, and geometry evidence. */
export function probeStillMotionFile(
  path,
  { spawnImplementation = spawn } = {},
) {
  requiredString(path, "Still-motion probe path");
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawnImplementation(
      "ffprobe",
      [
        "-v",
        "error",
        "-count_frames",
        "-show_entries",
        "format=duration:stream=codec_type,codec_name,width,height,duration,avg_frame_rate,r_frame_rate,nb_frames,nb_read_frames,pix_fmt,profile,level",
        "-of",
        "json",
        path,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    let errorOutput = "";
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (error) rejectPromise(error);
      else resolvePromise(result);
    };
    child.stdout?.on("data", (chunk) => {
      if (settled) return;
      output += chunk.toString();
      if (output.length > 1_000_000) {
        child.kill();
        finish(
          new Error(
            "Still-motion ffprobe output exceeded the 1 MB safety limit.",
          ),
        );
      }
    });
    child.stderr?.on("data", (chunk) => {
      errorOutput = `${errorOutput}${chunk}`.slice(-8_000);
    });
    child.on("error", (error) => {
      finish(
        new Error(`Could not start still-motion ffprobe: ${error.message}`, {
          cause: error,
        }),
      );
    });
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(
          new Error(
            `Still-motion ffprobe exited ${code}: ${errorOutput.trim() || "no details"}`,
          ),
        );
        return;
      }
      try {
        const probe = parseStillMotionFfprobeMedia(JSON.parse(output));
        finish(null, assertStillMotionProbeMatchesSpec(probe));
      } catch (error) {
        finish(
          new Error(
            `Could not validate still-motion ffprobe output: ${error.message}`,
            { cause: error },
          ),
        );
      }
    });
  });
}

function readVersionLine(command, { spawnImplementation = spawn } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawnImplementation(command, ["-version"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let errorOutput = "";
    child.stdout?.on("data", (chunk) => {
      output = `${output}${chunk}`.slice(0, 8_000);
    });
    child.stderr?.on("data", (chunk) => {
      errorOutput = `${errorOutput}${chunk}`.slice(-2_000);
    });
    child.on("error", (error) => {
      rejectPromise(
        new Error(`Could not start ${command}: ${error.message}`, {
          cause: error,
        }),
      );
    });
    child.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(
          new Error(
            `${command} preflight exited ${code}: ${errorOutput.trim() || "no details"}`,
          ),
        );
        return;
      }
      const firstLine = output.split(/\r?\n/, 1)[0]?.trim();
      if (!firstLine) {
        rejectPromise(
          new Error(`${command} preflight returned no version information.`),
        );
        return;
      }
      resolvePromise(firstLine);
    });
  });
}

export async function inspectStillMotionTools(options = {}) {
  const [ffmpegVersion, ffprobeVersion] = await Promise.all([
    readVersionLine("ffmpeg", options),
    readVersionLine("ffprobe", options),
  ]);
  return { ffmpegVersion, ffprobeVersion };
}

/**
 * Render an MP4 to a bounded in-memory pipe. No output path is exposed to
 * ffmpeg; callers atomically stage the validated bytes afterward.
 */
export function renderStillMotionBuffer(
  imagePath,
  {
    spawnImplementation = spawn,
    maximumBytes = MAX_STILL_MOTION_BYTES,
  } = {},
) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 10_000) {
    throw new Error(
      "Still-motion maximum output must be an integer of at least 10000 bytes.",
    );
  }
  const argumentsList = buildStillMotionFfmpegArguments(imagePath);
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawnImplementation("ffmpeg", argumentsList, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks = [];
    let receivedBytes = 0;
    let errorOutput = "";
    let settled = false;

    const finish = (error, buffer) => {
      if (settled) return;
      settled = true;
      if (error) rejectPromise(error);
      else resolvePromise(buffer);
    };

    child.stdout?.on("data", (chunk) => {
      if (settled) return;
      if (!Buffer.isBuffer(chunk)) chunk = Buffer.from(chunk);
      receivedBytes += chunk.length;
      if (receivedBytes > maximumBytes) {
        child.kill();
        finish(
          new Error(
            `Still-motion output exceeded the ${maximumBytes}-byte safety limit.`,
          ),
        );
        return;
      }
      chunks.push(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      errorOutput = `${errorOutput}${chunk}`.slice(-8_000);
    });
    child.on("error", (error) => {
      finish(
        new Error(`Could not start local ffmpeg renderer: ${error.message}`, {
          cause: error,
        }),
      );
    });
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(
          new Error(
            `Local ffmpeg renderer exited ${code}: ${errorOutput.trim() || "no details"}`,
          ),
        );
        return;
      }
      if (receivedBytes < 10_000) {
        finish(
          new Error(
            `Local ffmpeg renderer produced only ${receivedBytes} bytes.`,
          ),
        );
        return;
      }
      finish(null, Buffer.concat(chunks, receivedBytes));
    });
  });
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

export async function assertStillMotionOutputsAvailable({
  videoDirectory,
  reviewPath,
  reviewManifest,
  processId = process.pid,
  allowExistingLock = false,
}) {
  if (!isRecord(reviewManifest) || !Array.isArray(reviewManifest.videos)) {
    throw new Error("review.json must contain a video array.");
  }
  if (reviewManifest.composed !== undefined && reviewManifest.composed !== null) {
    throw new Error(
      "review.json already contains composition metadata; create a fresh run before adding a new source visual.",
    );
  }
  if (
    reviewManifest.videos.some(
      (entry) =>
        entry?.id === STILL_MOTION_ID ||
        entry?.filename === STILL_MOTION_FILENAME,
    )
  ) {
    throw new Error(
      "review.json already contains still-motion output metadata; use a fresh run or explicitly remove the reviewed output.",
    );
  }
  if (!Number.isSafeInteger(processId) || processId < 1) {
    throw new Error("Still-motion process id must be a positive safe integer.");
  }

  const videoPath = resolve(videoDirectory, "still-motion.mp4");
  const lockPath = resolve(videoDirectory, ".still-motion.render.lock");
  const reviewTemporaryPath = `${reviewPath}.${processId}.tmp`;
  await assertPathMissing(videoPath, "still-motion video output");
  await assertPathMissing(
    reviewTemporaryPath,
    "review.json atomic temporary output",
  );
  if (!allowExistingLock) {
    await assertPathMissing(lockPath, "still-motion render lock");
  }
  const staleTemporary = (await readdir(videoDirectory)).find(
    (entry) =>
      entry.startsWith(".still-motion.") && entry.endsWith(".tmp.mp4"),
  );
  if (staleTemporary) {
    throw new Error(
      `Private still-motion attempt file already exists: ${resolve(videoDirectory, staleTemporary)}`,
    );
  }
  return { videoPath, lockPath, reviewTemporaryPath };
}

export async function acquireStillMotionLock(lockPath) {
  let handle;
  let ownsLock = false;
  try {
    handle = await open(lockPath, "wx", 0o600);
    ownsLock = true;
    await handle.chmod(0o600);
    await handle.writeFile(
      `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`,
    );
    await handle.sync();
    await handle.close();
    handle = null;
  } catch (error) {
    await handle?.close().catch(() => {});
    if (ownsLock) await unlink(lockPath).catch(() => {});
    throw new Error(
      `Could not acquire private still-motion render lock: ${error.message}`,
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

export function assertStillMotionReviewUnchanged(
  before,
  after,
  label = "review.json",
) {
  if (!isDeepStrictEqual(before, after)) {
    throw new Error(
      `${label} changed during the local render; the private output was not recorded.`,
    );
  }
  return after;
}

export function assertStillMotionVideoRecord(record, reviewManifest) {
  if (!isRecord(record)) {
    throw new Error("Still-motion video metadata must be an object.");
  }
  if (record.id !== STILL_MOTION_ID) {
    throw new Error(`Still-motion video id must be ${STILL_MOTION_ID}.`);
  }
  if (record.filename !== STILL_MOTION_FILENAME) {
    throw new Error(
      `Still-motion video filename must be ${STILL_MOTION_FILENAME}.`,
    );
  }
  if (record.mimeType !== "video/mp4") {
    throw new Error("Still-motion video must record video/mp4.");
  }
  if (record.provider !== STILL_MOTION_PROVIDER) {
    throw new Error("Still-motion provider must be local.");
  }
  if (record.workflow !== STILL_MOTION_WORKFLOW) {
    throw new Error(
      `Still-motion workflow must be ${STILL_MOTION_WORKFLOW}.`,
    );
  }
  if (!isDeepStrictEqual(record.motionSpec, STILL_MOTION_SPEC_VALUE)) {
    throw new Error(
      "Still-motion metadata must preserve the exact deterministic motion specification.",
    );
  }
  if (
    record.requestedDurationSeconds !== STILL_MOTION_SPEC.durationSeconds ||
    record.requestedResolution !== "720p" ||
    record.width !== STILL_MOTION_SPEC.outputWidth ||
    record.height !== STILL_MOTION_SPEC.outputHeight ||
    record.durationSeconds !== STILL_MOTION_SPEC.durationSeconds ||
    record.framesPerSecond !== STILL_MOTION_SPEC.framesPerSecond ||
    record.totalFrames !== STILL_MOTION_SPEC.totalFrames ||
    record.codecName !== STILL_MOTION_ENCODER_SPEC.outputCodec
  ) {
    throw new Error(
      "Still-motion metadata must preserve the exact 15-second, 1280x720, 30 fps, 450-frame H.264 output contract.",
    );
  }
  if (record.audioIncluded !== false) {
    throw new Error("Still-motion metadata must explicitly record no audio.");
  }
  if (
    !isRecord(record.renderer) ||
    record.renderer.name !== "ffmpeg" ||
    typeof record.renderer.version !== "string" ||
    !record.renderer.version.startsWith("ffmpeg version ")
  ) {
    throw new Error(
      "Still-motion metadata must identify the local ffmpeg renderer and version.",
    );
  }
  if (
    !isDeepStrictEqual(record.encoder, STILL_MOTION_ENCODER_SPEC) ||
    record.filterGraph !== buildStillMotionFilterGraph()
  ) {
    throw new Error(
      "Still-motion metadata must preserve the exact local filter and encoder specification.",
    );
  }
  if (
    !isRecord(record.probe) ||
    record.probe.name !== "ffprobe" ||
    typeof record.probe.version !== "string" ||
    !record.probe.version.startsWith("ffprobe version ") ||
    record.probe.width !== STILL_MOTION_SPEC.outputWidth ||
    record.probe.height !== STILL_MOTION_SPEC.outputHeight ||
    record.probe.durationSeconds !== STILL_MOTION_SPEC.durationSeconds ||
    record.probe.framesPerSecond !== STILL_MOTION_SPEC.framesPerSecond ||
    (record.probe.averageFramesPerSecond !== null &&
      record.probe.averageFramesPerSecond !==
        STILL_MOTION_SPEC.framesPerSecond) ||
    (record.probe.realFramesPerSecond !== null &&
      record.probe.realFramesPerSecond !==
        STILL_MOTION_SPEC.framesPerSecond) ||
    (record.probe.frameCount !== null &&
      record.probe.frameCount !== STILL_MOTION_SPEC.totalFrames) ||
    !["nb_read_frames", "nb_frames", "unavailable"].includes(
      record.probe.frameCountSource,
    ) ||
    (record.probe.frameCount === null) !==
      (record.probe.frameCountSource === "unavailable") ||
    record.probe.codecName !== STILL_MOTION_ENCODER_SPEC.outputCodec ||
    record.probe.pixelFormat !== STILL_MOTION_ENCODER_SPEC.pixelFormat ||
    typeof record.probe.profile !== "string" ||
    record.probe.profile.toLowerCase() !== STILL_MOTION_ENCODER_SPEC.profile ||
    record.probe.level !== 31 ||
    record.probe.videoStreamCount !== 1 ||
    record.probe.hasAudio !== false
  ) {
    throw new Error(
      "Still-motion metadata must preserve exact ffprobe timing, dimensions, frame-rate, frame-count, H.264, and no-audio evidence.",
    );
  }
  if (
    !isRecord(record.sourceImage) ||
    typeof record.sourceImage.candidateId !== "string" ||
    typeof record.sourceImage.path !== "string" ||
    typeof record.sourceImage.sha256 !== "string" ||
    !STILL_MOTION_SOURCE_MIME_TYPES.includes(record.sourceImage.mimeType)
  ) {
    throw new Error(
      "Still-motion metadata must include selected static PNG/JPEG source-image provenance.",
    );
  }

  const selectedCandidateId = reviewManifest?.selection?.selectedCandidateId;
  const candidates = Array.isArray(reviewManifest?.candidates)
    ? reviewManifest.candidates.filter(
        (candidate) => candidate?.id === selectedCandidateId,
      )
    : [];
  if (candidates.length !== 1) {
    throw new Error(
      "Still-motion source must resolve to exactly one selected image candidate.",
    );
  }
  const [candidate] = candidates;
  if (
    typeof candidate.filename !== "string" ||
    !candidate.filename.startsWith("images/") ||
    isAbsolute(candidate.filename) ||
    candidate.filename.includes("\\") ||
    candidate.filename.split("/").includes("..")
  ) {
    throw new Error(
      "Still-motion selected candidate must stay inside this run's images/ directory.",
    );
  }
  if (candidate.review?.hardGatesPassed !== true) {
    throw new Error(
      "Still-motion source image must retain its hard-gate-passed review.",
    );
  }
  assertReviewScores(
    candidate.review,
    reviewManifest.reviewPolicy,
    "The still-motion source image",
  );
  for (const [field, expected] of [
    ["candidateId", candidate.id],
    ["path", candidate.filename],
    ["mimeType", candidate.mimeType],
    ["bytes", candidate.bytes],
    ["sha256", candidate.sha256],
    ["width", candidate.width],
    ["height", candidate.height],
  ]) {
    if (record.sourceImage[field] !== expected) {
      throw new Error(
        `Still-motion sourceImage.${field} does not match the selected reviewed candidate.`,
      );
    }
  }
  return record;
}
