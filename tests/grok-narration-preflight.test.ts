import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_MANIFEST_PATH,
  loadCampaignManifest,
} from "../scripts/grok/media-lib.mjs";
import {
  acquireNarrationGenerationLock,
  assertNarrationOutputsAvailable,
  buildFallbackNarrationReviewManifest,
  cleanupNarrationPaths,
  loadOrInitializeNarrationReview,
  stageAndCommitNarrationArtifacts,
  validateAndHashNarrationArtifacts,
  validateNarrationReviewManifest,
} from "../scripts/grok/narration-preflight.mjs";

const temporaryDirectories: string[] = [];

function fakeWav(extraBytes = 0): Buffer {
  const buffer = Buffer.alloc(44 + extraBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + extraBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.write("data", 36, "ascii");
  return buffer;
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(
    resolve(tmpdir(), "morrowward-narration-test-"),
  );
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

describe("Grok narration no-spend preflight", () => {
  it("initializes only an absent review and fails closed on malformed state", async () => {
    const directory = await temporaryDirectory();
    const { manifest, prompts } = await loadCampaignManifest(
      DEFAULT_MANIFEST_PATH,
    );
    const reviewPath = resolve(directory, "review.json");

    const initialized = await loadOrInitializeNarrationReview({
      reviewPath,
      manifest,
      prompt: prompts.narration,
    });
    expect(initialized.initialized).toBe(true);
    expect(
      validateNarrationReviewManifest(initialized.reviewManifest, manifest),
    ).toBeDefined();
    expect(await readdir(directory)).toEqual([]);

    await writeFile(reviewPath, "{ malformed narration review\n");
    await expect(
      loadOrInitializeNarrationReview({
        reviewPath,
        manifest,
        prompt: prompts.narration,
      }),
    ).rejects.toThrow(/malformed JSON/);
    expect(await readFile(reviewPath, "utf8")).toBe(
      "{ malformed narration review\n",
    );
  });

  it("rejects narration review-policy drift from the campaign", async () => {
    const { manifest, prompts } = await loadCampaignManifest(
      DEFAULT_MANIFEST_PATH,
    );
    const review = buildFallbackNarrationReviewManifest(
      manifest,
      prompts.narration,
    );

    review.reviewPolicy.scorecard[0].label = "Mutated accessibility bar";
    expect(() => validateNarrationReviewManifest(review, manifest)).toThrow(
      /exactly match the campaign manifest review policy/,
    );

    review.reviewPolicy = structuredClone(manifest.review);
    review.reviewPolicy.scorecard = [];
    expect(() => validateNarrationReviewManifest(review, manifest)).toThrow(
      /include a scorecard/,
    );
  });

  it("detects every final, metadata, lock, and atomic-review collision", async () => {
    const directory = await temporaryDirectory();
    const narrationDirectory = resolve(directory, "narration");
    const reviewPath = resolve(directory, "review.json");
    await mkdir(narrationDirectory);
    const { manifest, prompts } = await loadCampaignManifest(
      DEFAULT_MANIFEST_PATH,
    );
    const reviewManifest = buildFallbackNarrationReviewManifest(
      manifest,
      prompts.narration,
    );
    const processId = 12345;

    await expect(
      assertNarrationOutputsAvailable({
        narrationDirectory,
        reviewPath,
        reviewManifest,
        processId,
      }),
    ).resolves.toEqual({
      lockPath: resolve(
        narrationDirectory,
        ".narration.generation.lock",
      ),
      reviewTemporaryPath: `${reviewPath}.${processId}.tmp`,
    });

    for (const filename of [
      "narration.wav",
      "narration.mp3",
      "narration.en.vtt",
      "narration.txt",
    ]) {
      const collisionPath = resolve(narrationDirectory, filename);
      await writeFile(collisionPath, "occupied");
      await expect(
        assertNarrationOutputsAvailable({
          narrationDirectory,
          reviewPath,
          reviewManifest,
          processId,
        }),
      ).rejects.toThrow(/already exists/);
      await rm(collisionPath);
    }

    await writeFile(`${reviewPath}.${processId}.tmp`, "occupied");
    await expect(
      assertNarrationOutputsAvailable({
        narrationDirectory,
        reviewPath,
        reviewManifest,
        processId,
      }),
    ).rejects.toThrow(/atomic temporary output already exists/);
    await rm(`${reviewPath}.${processId}.tmp`);

    const lockPath = resolve(
      narrationDirectory,
      ".narration.generation.lock",
    );
    await writeFile(lockPath, "occupied");
    await expect(
      assertNarrationOutputsAvailable({
        narrationDirectory,
        reviewPath,
        reviewManifest,
        processId,
      }),
    ).rejects.toThrow(/generation lock already exists/);
    await rm(lockPath);

    (reviewManifest as { narration: unknown }).narration = {};
    await expect(
      assertNarrationOutputsAvailable({
        narrationDirectory,
        reviewPath,
        reviewManifest,
        processId,
      }),
    ).rejects.toThrow(/already contains narration metadata/);
  });

  it("holds an exclusive private run lock and releases it idempotently", async () => {
    const directory = await temporaryDirectory();
    const lockPath = resolve(directory, ".narration.generation.lock");
    const generationLock = await acquireNarrationGenerationLock(lockPath);

    expect((await stat(lockPath)).mode & 0o777).toBe(0o600);
    await expect(
      acquireNarrationGenerationLock(lockPath),
    ).rejects.toThrow(/Could not acquire private narration generation lock/);
    expect(await readFile(lockPath, "utf8")).toContain('"pid"');

    await generationLock.release();
    await generationLock.release();
    expect(await readdir(directory)).toEqual([]);
  });
});

describe("Grok narration bounded private staging", () => {
  it("validates exact content and enforces byte bounds before commit", () => {
    const expectedTranscript = "Take one step.";
    const expectedWebVtt =
      "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nTake one step.\n";
    const audioBuffer = fakeWav();
    const captionBuffer = Buffer.from(expectedWebVtt, "utf8");
    const transcriptBuffer = Buffer.from(`${expectedTranscript}\n`, "utf8");

    expect(
      validateAndHashNarrationArtifacts({
        audioBuffer,
        audioMimeType: "audio/wav",
        captionBuffer,
        transcriptBuffer,
        expectedWebVtt,
        expectedTranscript,
        limits: {
          maximumAudioBytes: audioBuffer.length,
          maximumCaptionBytes: captionBuffer.length,
          maximumTranscriptBytes: transcriptBuffer.length,
        },
      }),
    ).toMatchObject({
      audioMimeType: "audio/wav",
      audioBytes: 44,
      captionBytes: captionBuffer.length,
      transcriptBytes: transcriptBuffer.length,
    });

    expect(() =>
      validateAndHashNarrationArtifacts({
        audioBuffer: fakeWav(1),
        audioMimeType: "audio/wav",
        captionBuffer,
        transcriptBuffer,
        expectedWebVtt,
        expectedTranscript,
        limits: { maximumAudioBytes: 44 },
      }),
    ).toThrow(/exceeds the 44-byte limit/);
    expect(() =>
      validateAndHashNarrationArtifacts({
        audioBuffer,
        audioMimeType: "audio/wav",
        captionBuffer: Buffer.from("WEBVTT\n\ntampered\n"),
        transcriptBuffer,
        expectedWebVtt,
        expectedTranscript,
      }),
    ).toThrow(/do not match the generated WebVTT/);
  });

  it("commits three 0600 files and leaves no unique staging files", async () => {
    const narrationDirectory = await temporaryDirectory();
    const expectedTranscript = "Keep moving.";
    const expectedWebVtt =
      "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nKeep moving.\n";
    const result = await stageAndCommitNarrationArtifacts({
      narrationDirectory,
      audioBuffer: fakeWav(),
      audioMimeType: "audio/wav",
      captionBuffer: Buffer.from(expectedWebVtt, "utf8"),
      transcriptBuffer: Buffer.from(`${expectedTranscript}\n`, "utf8"),
      expectedWebVtt,
      expectedTranscript,
      uniqueId: "successful-stage",
    });

    expect(await readdir(narrationDirectory)).toEqual([
      "narration.en.vtt",
      "narration.txt",
      "narration.wav",
    ]);
    expect(await readFile(result.audioPath)).toEqual(fakeWav());
    for (const path of result.finalPaths) {
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }
  });

  it("removes unique temps and partial finals when a rename fails", async () => {
    const narrationDirectory = await temporaryDirectory();
    const expectedTranscript = "Try again safely.";
    const expectedWebVtt =
      "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nTry again safely.\n";
    let renameCount = 0;

    await expect(
      stageAndCommitNarrationArtifacts({
        narrationDirectory,
        audioBuffer: fakeWav(),
        audioMimeType: "audio/wav",
        captionBuffer: Buffer.from(expectedWebVtt, "utf8"),
        transcriptBuffer: Buffer.from(`${expectedTranscript}\n`, "utf8"),
        expectedWebVtt,
        expectedTranscript,
        uniqueId: "failed-stage",
        renameImplementation: async (source, destination) => {
          renameCount += 1;
          if (renameCount === 2) throw new Error("forced rename failure");
          await rename(source, destination);
        },
      }),
    ).rejects.toThrow(/forced rename failure/);

    expect(await readdir(narrationDirectory)).toEqual([]);

    const ownedPath = resolve(narrationDirectory, "owned.tmp");
    await writeFile(ownedPath, "private");
    await expect(
      cleanupNarrationPaths([
        ownedPath,
        resolve(narrationDirectory, "already-missing.tmp"),
      ]),
    ).resolves.toBeUndefined();
    expect(await readdir(narrationDirectory)).toEqual([]);
  });
});
