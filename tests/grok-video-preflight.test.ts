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
  DEFAULT_MANIFEST_PATH,
  loadCampaignManifest,
} from "../scripts/grok/media-lib.mjs";
import {
  assertFfprobeAvailable,
  assertVideoOutputsAvailable,
  buildFallbackVideoReviewManifest,
  loadOrInitializeVideoReview,
  parseVideoTimingOptions,
  stageAndCommitVideo,
  validateVideoReviewManifest,
} from "../scripts/grok/video-preflight.mjs";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), "morrowward-video-test-"));
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

describe("Grok video no-spend preflight", () => {
  it("parses bounded poll and timeout controls before generation", () => {
    expect(parseVideoTimingOptions()).toEqual({
      intervalMs: 5_000,
      timeoutMs: 900_000,
    });
    expect(
      parseVideoTimingOptions({ "poll-ms": "2500", "timeout-ms": "60000" }),
    ).toEqual({ intervalMs: 2_500, timeoutMs: 60_000 });
    expect(() => parseVideoTimingOptions({ "poll-ms": true })).toThrow(
      /positive base-10 integer/,
    );
    expect(() => parseVideoTimingOptions({ "poll-ms": "1.5" })).toThrow(
      /positive base-10 integer/,
    );
    expect(() =>
      parseVideoTimingOptions({ "poll-ms": "5001", "timeout-ms": "5000" }),
    ).toThrow(/greater than or equal/);
    expect(() => parseVideoTimingOptions({ "timeout-ms": "3600001" })).toThrow(
      /must not exceed/,
    );
  });

  it("creates a complete text-to-video review only when review.json is absent", async () => {
    const directory = await temporaryDirectory();
    const reviewPath = resolve(directory, "review.json");
    const { manifest, prompts } = await loadCampaignManifest(
      DEFAULT_MANIFEST_PATH,
    );

    const result = await loadOrInitializeVideoReview({
      reviewPath,
      manifest,
      prompt: prompts.textToVideo,
      mode: "textToVideo",
      allowInitialize: true,
    });

    expect(result.initialized).toBe(true);
    expect(result.reviewManifest).toMatchObject({
      aiInterpretationBadge: manifest.metadata.aiInterpretationBadge,
      voiceDisclosure: manifest.metadata.voiceDisclosure,
      transcript: manifest.metadata.transcript,
      directQuote: manifest.metadata.directQuote,
      directQuoteAttribution: manifest.metadata.directQuoteAttribution,
      videos: [],
    });
    expect(
      validateVideoReviewManifest(
        JSON.parse(await readFile(reviewPath, "utf8")),
        manifest,
      ),
    ).toBeDefined();
  });

  it("never replaces malformed or unreadable review state", async () => {
    const directory = await temporaryDirectory();
    const { manifest, prompts } = await loadCampaignManifest(
      DEFAULT_MANIFEST_PATH,
    );
    const malformedPath = resolve(directory, "malformed.json");
    await writeFile(malformedPath, "{ definitely-not-json\n");

    await expect(
      loadOrInitializeVideoReview({
        reviewPath: malformedPath,
        manifest,
        prompt: prompts.textToVideo,
        mode: "textToVideo",
        allowInitialize: true,
      }),
    ).rejects.toThrow(/malformed JSON/);
    expect(await readFile(malformedPath, "utf8")).toBe(
      "{ definitely-not-json\n",
    );

    const directoryAtReviewPath = resolve(directory, "directory-review.json");
    await mkdir(directoryAtReviewPath);
    await expect(
      loadOrInitializeVideoReview({
        reviewPath: directoryAtReviewPath,
        manifest,
        prompt: prompts.textToVideo,
        mode: "textToVideo",
        allowInitialize: true,
      }),
    ).rejects.toThrow(/Could not read review\.json/);
  });

  it("rejects stale review metadata instead of silently repairing it", async () => {
    const { manifest, prompts } = await loadCampaignManifest(
      DEFAULT_MANIFEST_PATH,
    );
    const review = buildFallbackVideoReviewManifest(
      manifest,
      prompts.textToVideo,
      "textToVideo",
    );
    delete review.directQuote;

    expect(() => validateVideoReviewManifest(review, manifest)).toThrow(
      /directQuote is missing/,
    );
  });

  it("rejects a run policy that drifts from the campaign policy", async () => {
    const { manifest, prompts } = await loadCampaignManifest(
      DEFAULT_MANIFEST_PATH,
    );
    const review = buildFallbackVideoReviewManifest(
      manifest,
      prompts.textToVideo,
      "textToVideo",
    );

    review.reviewPolicy.scorecard[0].label = "Changed after generation";
    expect(() => validateVideoReviewManifest(review, manifest)).toThrow(
      /exactly match the campaign manifest review policy/,
    );

    review.reviewPolicy = structuredClone(manifest.review);
    review.reviewPolicy.minimumScore -= 1;
    expect(() => validateVideoReviewManifest(review, manifest)).toThrow(
      /exactly match the campaign manifest review policy/,
    );

    review.reviewPolicy = structuredClone(manifest.review);
    review.reviewPolicy.hardGates = [];
    expect(() => validateVideoReviewManifest(review, manifest)).toThrow(
      /include hard gates/,
    );
  });

  it("detects filesystem, metadata, lock, and atomic-review collisions", async () => {
    const directory = await temporaryDirectory();
    const videoDirectory = resolve(directory, "videos");
    const reviewPath = resolve(directory, "review.json");
    await mkdir(videoDirectory);
    const { manifest, prompts } = await loadCampaignManifest(
      DEFAULT_MANIFEST_PATH,
    );
    const review = buildFallbackVideoReviewManifest(
      manifest,
      prompts.textToVideo,
      "textToVideo",
    );

    await expect(
      assertVideoOutputsAvailable({
        videoDirectory,
        reviewPath,
        reviewManifest: review,
        modeOption: "text-to-video",
        processId: 12345,
      }),
    ).resolves.toMatchObject({
      lockPath: resolve(videoDirectory, ".text-to-video.generation.lock"),
    });

    await writeFile(resolve(videoDirectory, "text-to-video.mp4"), "occupied");
    await expect(
      assertVideoOutputsAvailable({
        videoDirectory,
        reviewPath,
        reviewManifest: review,
        modeOption: "text-to-video",
        processId: 12345,
      }),
    ).rejects.toThrow(/output already exists/);
    await rm(resolve(videoDirectory, "text-to-video.mp4"));

    (review.videos as Array<{ id: string; filename: string }>).push({
      id: "text-to-video",
      filename: "videos/text-to-video.webm",
    });
    await expect(
      assertVideoOutputsAvailable({
        videoDirectory,
        reviewPath,
        reviewManifest: review,
        modeOption: "text-to-video",
        processId: 12345,
      }),
    ).rejects.toThrow(/already contains/);

    review.videos = [];
    const lockPath = resolve(
      videoDirectory,
      ".text-to-video.generation.lock",
    );
    await writeFile(lockPath, "occupied");
    await expect(
      assertVideoOutputsAvailable({
        videoDirectory,
        reviewPath,
        reviewManifest: review,
        modeOption: "text-to-video",
        processId: 12345,
      }),
    ).rejects.toThrow(/generation lock already exists/);
    await rm(lockPath);

    await writeFile(`${reviewPath}.12345.tmp`, "occupied");
    await expect(
      assertVideoOutputsAvailable({
        videoDirectory,
        reviewPath,
        reviewManifest: review,
        modeOption: "text-to-video",
        processId: 12345,
      }),
    ).rejects.toThrow(/atomic temporary output already exists/);
  });

  it("checks ffprobe locally without making a provider request", async () => {
    const child = new EventEmitter() as EventEmitter & {
      stderr: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    const spawnImplementation = vi.fn(() => child);

    const check = assertFfprobeAvailable({
      spawnImplementation: spawnImplementation as never,
      timeoutMs: 100,
    });
    queueMicrotask(() => child.emit("close", 0));
    await expect(check).resolves.toBeUndefined();
    expect(spawnImplementation).toHaveBeenCalledWith(
      "ffprobe",
      ["-version"],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
  });
});

describe("Grok video private atomic staging", () => {
  it("renames a validated temp file into place without leaving temp bytes", async () => {
    const directory = await temporaryDirectory();
    const videoPath = resolve(directory, "text-to-video.mp4");
    const buffer = Buffer.from("private-video-bytes");
    const expectedProbe = {
      durationSeconds: 15,
      video: { width: 1280, height: 720 },
      hasAudio: false,
    };

    const result = await stageAndCommitVideo({
      videoPath,
      buffer,
      uniqueId: "success",
      probeAndValidate: async (temporaryPath) => {
        expect(temporaryPath).toContain(".tmp.mp4");
        expect(await readFile(temporaryPath)).toEqual(buffer);
        return expectedProbe;
      },
    });

    expect(result.probe).toEqual(expectedProbe);
    expect(await readFile(videoPath)).toEqual(buffer);
    expect(await readdir(directory)).toEqual(["text-to-video.mp4"]);
  });

  it("removes private temp bytes when probing or final collision checks fail", async () => {
    const directory = await temporaryDirectory();
    const videoPath = resolve(directory, "image-to-video.webm");

    await expect(
      stageAndCommitVideo({
        videoPath,
        buffer: Buffer.from("untrusted-video-bytes"),
        uniqueId: "probe-failure",
        probeAndValidate: async () => {
          throw new Error("measured dimensions are wrong");
        },
      }),
    ).rejects.toThrow(/measured dimensions/);
    expect(await readdir(directory)).toEqual([]);

    await writeFile(videoPath, "existing-reviewed-video");
    await expect(
      stageAndCommitVideo({
        videoPath,
        buffer: Buffer.from("replacement-video"),
        uniqueId: "collision",
        probeAndValidate: async () => ({ valid: true }),
      }),
    ).rejects.toThrow(/already exists/);
    expect(await readFile(videoPath, "utf8")).toBe("existing-reviewed-video");
    expect(await readdir(directory)).toEqual(["image-to-video.webm"]);
  });
});
