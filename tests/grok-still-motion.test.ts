import { EventEmitter } from "node:events";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertCompositionSourceProbe,
  assertCompositionSourceVideoRecord,
} from "../scripts/grok/composition-source.mjs";
import {
  STILL_MOTION_ENCODER_SPEC,
  STILL_MOTION_FILENAME,
  STILL_MOTION_ID,
  STILL_MOTION_PROVIDER,
  STILL_MOTION_SPEC,
  STILL_MOTION_WORKFLOW,
  acquireStillMotionLock,
  assertStillMotionOutputsAvailable,
  assertStillMotionProbeMatchesSpec,
  assertStillMotionReviewUnchanged,
  assertStillMotionSourceImageFormat,
  assertStillMotionVideoRecord,
  buildStillMotionFfmpegArguments,
  buildStillMotionFilterGraph,
  inspectStillMotionTools,
  parseStillMotionFfprobeMedia,
  probeStillMotionFile,
  renderStillMotionBuffer,
  renderStillMotionSource,
  smoothstepScaleAt,
  validateStillMotionCliOptions,
} from "../scripts/grok/still-motion-preflight.mjs";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), "morrowward-still-motion-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

function reviewPolicy() {
  return {
    humanFinalApprovalRequired: true,
    minimumScore: 8,
    minimumDimensionScore: 4,
    hardGates: ["No malformed anatomy.", "No unplanned motion."],
    scorecard: [
      { id: "craft", label: "Visual craft", maximum: 5 },
      { id: "accessibility", label: "Accessibility", maximum: 5 },
    ],
  };
}

function passingReview() {
  return {
    hardGatesPassed: true,
    scores: { craft: 4, accessibility: 4 },
    totalScore: 8,
  };
}

function fixture() {
  const candidate = {
    id: "image-2",
    filename: "images/image-candidate-02.png",
    mimeType: "image/png",
    bytes: 123_456,
    sha256: "a".repeat(64),
    width: 2048,
    height: 1152,
    review: passingReview(),
  };
  const reviewManifest = {
    reviewPolicy: reviewPolicy(),
    candidates: [candidate],
    videos: [] as Array<Record<string, unknown>>,
    selection: { selectedCandidateId: candidate.id },
    composed: null as null | Record<string, unknown>,
  };
  const video = {
    id: STILL_MOTION_ID,
    filename: STILL_MOTION_FILENAME,
    mimeType: "video/mp4",
    bytes: 456_789,
    sha256: "b".repeat(64),
    provider: STILL_MOTION_PROVIDER,
    workflow: STILL_MOTION_WORKFLOW,
    renderer: {
      name: "ffmpeg",
      version:
        "ffmpeg version 8.0.1 Copyright (c) 2000-2025 the FFmpeg developers",
    },
    encoder: structuredClone(STILL_MOTION_ENCODER_SPEC),
    filterGraph: buildStillMotionFilterGraph(),
    motionSpec: structuredClone(STILL_MOTION_SPEC),
    requestedDurationSeconds: 15,
    requestedResolution: "720p",
    width: 1280,
    height: 720,
    durationSeconds: 15,
    framesPerSecond: 30,
    totalFrames: 450,
    codecName: "h264",
    audioIncluded: false,
    probe: {
      name: "ffprobe",
      version:
        "ffprobe version 8.0.1 Copyright (c) 2007-2025 the FFmpeg developers",
      width: 1280,
      height: 720,
      durationSeconds: 15,
      framesPerSecond: 30,
      averageFramesPerSecond: 30,
      realFramesPerSecond: 30,
      frameCount: 450,
      frameCountSource: "nb_read_frames",
      codecName: "h264",
      pixelFormat: "yuv420p",
      profile: "High",
      level: 31,
      videoStreamCount: 1,
      hasAudio: false,
    },
    sourceImage: {
      candidateId: candidate.id,
      path: candidate.filename,
      mimeType: candidate.mimeType,
      bytes: candidate.bytes,
      sha256: candidate.sha256,
      width: candidate.width,
      height: candidate.height,
    },
    review: passingReview(),
  };
  return { candidate, reviewManifest, video };
}

describe("deterministic still-motion contract", () => {
  it("locks the renderer to a smooth push no greater than two percent", () => {
    expect(STILL_MOTION_SPEC).toMatchObject({
      durationSeconds: 15,
      outputWidth: 1280,
      outputHeight: 720,
      framesPerSecond: 30,
      totalFrames: 450,
      startScale: 1,
      endScale: 1.02,
      maximumScaleIncreasePercent: 2,
      easing: "smoothstep",
      personMotion: "none",
      objectMotion: "none",
      environmentalMotion: "none",
      frameSource: "single-reviewed-still",
      generativeVideoModelUsed: false,
      audio: "none",
    });

    const scales = Array.from(
      { length: STILL_MOTION_SPEC.totalFrames },
      (_, frame) => smoothstepScaleAt(frame),
    );
    expect(scales[0]).toBe(1);
    expect(scales.at(-1)).toBeCloseTo(1.02, 12);
    expect(Math.max(...scales)).toBeLessThanOrEqual(1.02);
    for (let index = 1; index < scales.length; index += 1) {
      expect(scales[index]).toBeGreaterThanOrEqual(scales[index - 1]);
    }
    expect(() => smoothstepScaleAt(-1)).toThrow(/frame index/);
    expect(() => smoothstepScaleAt(450)).toThrow(/frame index/);
  });

  it("builds one fixed silent ffmpeg pipeline with no operator motion overrides", () => {
    const imagePath = "/private/review/images/image-candidate-02.png";
    const argumentsList = buildStillMotionFfmpegArguments(imagePath);
    const filterIndex = argumentsList.indexOf("-vf");

    expect(argumentsList.slice(filterIndex, filterIndex + 2)).toEqual([
      "-vf",
      buildStillMotionFilterGraph(),
    ]);
    expect(argumentsList).toContain("-an");
    expect(argumentsList).toContain("450");
    expect(argumentsList).toContain("libx264");
    expect(argumentsList).toContain("pipe:1");
    expect(argumentsList).not.toContain("-shortest");
    expect(buildStillMotionFilterGraph()).toContain("on/449");
    expect(buildStillMotionFilterGraph()).toContain("0.02");
    expect(STILL_MOTION_ENCODER_SPEC).toMatchObject({
      encoder: "libx264",
      outputCodec: "h264",
      gopSizeFrames: 60,
      minimumKeyframeIntervalFrames: 60,
      sceneChangeThreshold: 0,
      formatFlags: "+bitexact",
      videoFlags: "+bitexact",
      movFlags: "+frag_keyframe+empty_moov+default_base_moof",
    });
    for (const [flag, value] of [
      ["-g", "60"],
      ["-keyint_min", "60"],
      ["-sc_threshold", "0"],
      ["-fflags", "+bitexact"],
      ["-flags:v", "+bitexact"],
      ["-movflags", "+frag_keyframe+empty_moov+default_base_moof"],
    ]) {
      const flagIndex = argumentsList.indexOf(flag);
      expect(argumentsList[flagIndex + 1]).toBe(value);
    }

    expect(
      validateStillMotionCliOptions({
        run: ".media-review/grok/campaign/run",
        manifest: "scripts/grok/manifests/campaign.json",
      }),
    ).toBeDefined();
    expect(() =>
      validateStillMotionCliOptions({
        run: ".media-review/grok/campaign/run",
        image: "/tmp/different.png",
      }),
    ).toThrow(/Unsupported.*image/);
    expect(() =>
      validateStillMotionCliOptions({
        run: ".media-review/grok/campaign/run",
        "confirm-xai-upload": true,
      }),
    ).toThrow(/Unsupported.*confirm-xai-upload/);
    expect(() => validateStillMotionCliOptions({})).toThrow(/--run/);
  });

  it("rejects animated and runtime-variable still formats before rendering", () => {
    const renderer = vi.fn(() => Promise.resolve(Buffer.alloc(12_000)));
    const gif = Buffer.concat([
      Buffer.from("GIF89a", "ascii"),
      Buffer.alloc(32),
    ]);
    expect(() =>
      renderStillMotionSource("/private/animated.gif", gif, "image/gif", {
        renderImplementation: renderer,
      }),
    ).toThrow(/static PNG or JPEG/);
    expect(renderer).not.toHaveBeenCalled();

    const webp = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.alloc(4),
      Buffer.from("WEBP", "ascii"),
      Buffer.alloc(20),
    ]);
    expect(() =>
      assertStillMotionSourceImageFormat(webp, "image/webp"),
    ).toThrow(/static PNG or JPEG/);

    const pngSignature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const animationControlChunk = Buffer.concat([
      Buffer.alloc(4),
      Buffer.from("acTL", "ascii"),
      Buffer.alloc(4),
    ]);
    expect(() =>
      assertStillMotionSourceImageFormat(
        Buffer.concat([pngSignature, animationControlChunk]),
        "image/png",
      ),
    ).toThrow(/animated PNG/);
    expect(
      assertStillMotionSourceImageFormat(
        Buffer.concat([pngSignature, Buffer.alloc(16)]),
        "image/png",
      ),
    ).toBe("image/png");
    expect(
      assertStillMotionSourceImageFormat(
        Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
        "image/jpeg",
      ),
    ).toBe("image/jpeg");
  });

  it("strictly validates measured duration, geometry, fps, frames, codec, and audio", () => {
    const probe = parseStillMotionFfprobeMedia({
      streams: [
        {
          codec_type: "video",
          codec_name: "h264",
          width: 1280,
          height: 720,
          duration: "15.000000",
          avg_frame_rate: "30/1",
          r_frame_rate: "30/1",
          nb_frames: "450",
          nb_read_frames: "450",
          pix_fmt: "yuv420p",
          profile: "High",
          level: 31,
        },
      ],
      format: { duration: "15.000000" },
    });
    expect(assertStillMotionProbeMatchesSpec(probe)).toBe(probe);
    expect(probe).toMatchObject({
      durationSeconds: 15,
      video: { width: 1280, height: 720 },
      codecName: "h264",
      framesPerSecond: 30,
      frameCount: 450,
      frameCountSource: "nb_read_frames",
      videoStreamCount: 1,
      hasAudio: false,
    });

    for (const mutation of [
      { durationSeconds: 1 },
      { video: { width: 1920, height: 720 } },
      { video: { width: 1280, height: 1080 } },
      {
        framesPerSecond: 1,
        averageFramesPerSecond: 1,
        realFramesPerSecond: 1,
      },
      { frameCount: 30 },
      { codecName: "hevc" },
      { hasAudio: true },
    ]) {
      expect(() =>
        assertStillMotionProbeMatchesSpec({ ...probe, ...mutation }),
      ).toThrow();
    }
    expect(() =>
      assertStillMotionProbeMatchesSpec({
        ...probe,
        frameCount: null,
        frameCountSource: "unavailable",
      }),
    ).toThrow(/unverified number of.*450/);
  });

  it("records exact local provenance and selected-image review evidence", () => {
    const { reviewManifest, video } = fixture();
    expect(assertStillMotionVideoRecord(video, reviewManifest)).toBe(video);

    expect(() =>
      assertStillMotionVideoRecord(
        { ...video, provider: "xAI" },
        reviewManifest,
      ),
    ).toThrow(/provider must be local/);
    expect(() =>
      assertStillMotionVideoRecord(
        {
          ...video,
          motionSpec: { ...video.motionSpec, endScale: 1.021 },
        },
        reviewManifest,
      ),
    ).toThrow(/exact deterministic motion specification/);
    expect(() =>
      assertStillMotionVideoRecord(
        { ...video, audioIncluded: true },
        reviewManifest,
      ),
    ).toThrow(/record no audio/);
    expect(() =>
      assertStillMotionVideoRecord(
        {
          ...video,
          probe: { ...video.probe, hasAudio: true },
        },
        reviewManifest,
      ),
    ).toThrow(/ffprobe.*evidence/);
    expect(() =>
      assertStillMotionVideoRecord(
        {
          ...video,
          sourceImage: { ...video.sourceImage, sha256: "c".repeat(64) },
        },
        reviewManifest,
      ),
    ).toThrow(/sourceImage.sha256/);

    for (const mutation of [
      {
        requestedDurationSeconds: 1,
        durationSeconds: 1,
        probe: { ...video.probe, durationSeconds: 1 },
      },
      {
        width: 1920,
        height: 1080,
        probe: { ...video.probe, width: 1920, height: 1080 },
      },
      {
        framesPerSecond: 1,
        totalFrames: 15,
        probe: {
          ...video.probe,
          framesPerSecond: 1,
          averageFramesPerSecond: 1,
          realFramesPerSecond: 1,
          frameCount: 15,
        },
      },
      {
        totalFrames: 449,
        probe: { ...video.probe, frameCount: 449 },
      },
      {
        codecName: "hevc",
        probe: { ...video.probe, codecName: "hevc" },
      },
    ]) {
      expect(() =>
        assertStillMotionVideoRecord(
          { ...video, ...mutation },
          reviewManifest,
        ),
      ).toThrow(/exact 15-second/);
    }
  });

  it("accepts the reviewed local source in composition without weakening xAI sources", () => {
    const runDirectory = "/private/tmp/morrowward-composition-run";
    const { reviewManifest, video } = fixture();
    reviewManifest.videos.push(video);
    const localPath = resolve(runDirectory, STILL_MOTION_FILENAME);

    expect(
      assertCompositionSourceVideoRecord({
        sourceVideoRecord: video,
        reviewManifest,
        runDirectory,
        videoPath: localPath,
      }),
    ).toMatchObject({
      sourceType: "local-deterministic-still",
      exactVideoFilename: STILL_MOTION_FILENAME,
      sourceImage: video.sourceImage,
    });
    expect(() =>
      assertCompositionSourceProbe(video, {
        durationSeconds: 15,
        video: { width: 1280, height: 720 },
        hasAudio: true,
      }),
    ).toThrow(/must not contain audio/);

    const xaiVideo = {
      id: "image-to-video",
      filename: "videos/image-to-video.mp4",
      mimeType: "video/mp4",
      requestedDurationSeconds: 15,
      requestedResolution: "720p",
      review: passingReview(),
    };
    expect(
      assertCompositionSourceVideoRecord({
        sourceVideoRecord: xaiVideo,
        reviewManifest,
        runDirectory,
        videoPath: resolve(runDirectory, xaiVideo.filename),
      }),
    ).toMatchObject({
      sourceType: "xai-video",
      exactVideoFilename: xaiVideo.filename,
      sourceImage: null,
    });
    expect(
      assertCompositionSourceProbe(xaiVideo, {
        durationSeconds: 15,
        video: { width: 1280, height: 720 },
        hasAudio: true,
      }),
    ).toBeDefined();
    expect(() =>
      assertCompositionSourceVideoRecord({
        sourceVideoRecord: { ...xaiVideo, id: "unreviewed-local-path" },
        reviewManifest,
        runDirectory,
        videoPath: resolve(runDirectory, xaiVideo.filename),
      }),
    ).toThrow(/invalid generated-video id/);
  });
});

describe("still-motion local preflight and locking", () => {
  it("detects metadata, file, lock, review-temp, and composed-state collisions", async () => {
    const directory = await temporaryDirectory();
    const videoDirectory = resolve(directory, "videos");
    const reviewPath = resolve(directory, "review.json");
    await mkdir(videoDirectory);
    const { reviewManifest, video } = fixture();

    await expect(
      assertStillMotionOutputsAvailable({
        videoDirectory,
        reviewPath,
        reviewManifest,
        processId: 12345,
      }),
    ).resolves.toMatchObject({
      videoPath: resolve(videoDirectory, "still-motion.mp4"),
      lockPath: resolve(videoDirectory, ".still-motion.render.lock"),
    });

    await writeFile(resolve(videoDirectory, "still-motion.mp4"), "occupied");
    await expect(
      assertStillMotionOutputsAvailable({
        videoDirectory,
        reviewPath,
        reviewManifest,
        processId: 12345,
      }),
    ).rejects.toThrow(/output already exists/);
    await rm(resolve(videoDirectory, "still-motion.mp4"));

    reviewManifest.videos.push(video);
    await expect(
      assertStillMotionOutputsAvailable({
        videoDirectory,
        reviewPath,
        reviewManifest,
        processId: 12345,
      }),
    ).rejects.toThrow(/already contains still-motion/);
    reviewManifest.videos = [];

    const lockPath = resolve(videoDirectory, ".still-motion.render.lock");
    await writeFile(lockPath, "occupied");
    await expect(
      assertStillMotionOutputsAvailable({
        videoDirectory,
        reviewPath,
        reviewManifest,
        processId: 12345,
      }),
    ).rejects.toThrow(/render lock already exists/);
    await rm(lockPath);

    await writeFile(`${reviewPath}.12345.tmp`, "occupied");
    await expect(
      assertStillMotionOutputsAvailable({
        videoDirectory,
        reviewPath,
        reviewManifest,
        processId: 12345,
      }),
    ).rejects.toThrow(/atomic temporary output already exists/);
    await rm(`${reviewPath}.12345.tmp`);

    reviewManifest.composed = { status: "pending" };
    await expect(
      assertStillMotionOutputsAvailable({
        videoDirectory,
        reviewPath,
        reviewManifest,
        processId: 12345,
      }),
    ).rejects.toThrow(/already contains composition metadata/);
  });

  it("holds one exclusive private render lock and removes it on release", async () => {
    const directory = await temporaryDirectory();
    const lockPath = resolve(directory, ".still-motion.render.lock");
    const lock = await acquireStillMotionLock(lockPath);
    expect(JSON.parse(await readFile(lockPath, "utf8"))).toMatchObject({
      pid: process.pid,
    });
    await expect(acquireStillMotionLock(lockPath)).rejects.toThrow(
      /Could not acquire private still-motion render lock/,
    );
    await lock.release();
    expect(await readdir(directory)).toEqual([]);
    await lock.release();
  });

  it("refuses to overwrite review changes made during rendering", () => {
    const before = { videos: [], selection: { selectedCandidateId: "image-1" } };
    expect(
      assertStillMotionReviewUnchanged(before, structuredClone(before)),
    ).toEqual(before);
    expect(() =>
      assertStillMotionReviewUnchanged(before, {
        ...before,
        videos: [{ id: "other-work" }],
      }),
    ).toThrow(/changed during the local render/);
  });

  it("inspects local tools and bounds ffmpeg pipe output", async () => {
    const versionChildren = ["ffmpeg", "ffprobe"].map((command) => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      queueMicrotask(() => {
        child.stdout.emit(
          "data",
          Buffer.from(`${command} version 8.0.1 test build\nconfiguration`),
        );
        child.emit("close", 0);
      });
      return child;
    });
    const versionSpawn = vi
      .fn()
      .mockReturnValueOnce(versionChildren[0])
      .mockReturnValueOnce(versionChildren[1]);
    await expect(
      inspectStillMotionTools({ spawnImplementation: versionSpawn as never }),
    ).resolves.toEqual({
      ffmpegVersion: "ffmpeg version 8.0.1 test build",
      ffprobeVersion: "ffprobe version 8.0.1 test build",
    });

    const renderChild = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
    };
    renderChild.stdout = new EventEmitter();
    renderChild.stderr = new EventEmitter();
    renderChild.kill = vi.fn();
    const renderSpawn = vi.fn(() => renderChild);
    const rendered = renderStillMotionBuffer("/private/still.png", {
      spawnImplementation: renderSpawn as never,
      maximumBytes: 20_000,
    });
    const expected = Buffer.alloc(12_000, 7);
    queueMicrotask(() => {
      renderChild.stdout.emit("data", expected);
      renderChild.emit("close", 0);
    });
    await expect(rendered).resolves.toEqual(expected);
    expect(renderSpawn).toHaveBeenCalledWith(
      "ffmpeg",
      buildStillMotionFfmpegArguments("/private/still.png"),
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    const probeChild = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
    };
    probeChild.stdout = new EventEmitter();
    probeChild.stderr = new EventEmitter();
    probeChild.kill = vi.fn();
    const probeSpawn = vi.fn(() => probeChild);
    const probeResult = probeStillMotionFile("/private/still-motion.mp4", {
      spawnImplementation: probeSpawn as never,
    });
    queueMicrotask(() => {
      probeChild.stdout.emit(
        "data",
        Buffer.from(
          JSON.stringify({
            streams: [
              {
                codec_type: "video",
                codec_name: "h264",
                width: 1280,
                height: 720,
                duration: "15.000000",
                avg_frame_rate: "30/1",
                r_frame_rate: "30/1",
                nb_frames: "450",
                nb_read_frames: "450",
                pix_fmt: "yuv420p",
                profile: "High",
                level: 31,
              },
            ],
            format: { duration: "15.000000" },
          }),
        ),
      );
      probeChild.emit("close", 0);
    });
    await expect(probeResult).resolves.toMatchObject({
      durationSeconds: 15,
      framesPerSecond: 30,
      frameCount: 450,
      codecName: "h264",
      hasAudio: false,
    });
    expect(probeSpawn).toHaveBeenCalledWith(
      "ffprobe",
      expect.arrayContaining(["-count_frames"]),
      { stdio: ["ignore", "pipe", "pipe"] },
    );
  });
});
