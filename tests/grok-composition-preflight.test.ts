import {
  access,
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
  COMPOSED_CAPTION_FILENAME,
  COMPOSED_VIDEO_FILENAME,
  acquireCompositionLock,
  assertCompositionOutputsAvailable,
  stageAndCommitCompositionArtifacts,
} from "../scripts/grok/composition-preflight.mjs";

const temporaryDirectories: string[] = [];

async function makeRun() {
  const runDirectory = await mkdtemp(resolve(tmpdir(), "morrowward-compose-"));
  temporaryDirectories.push(runDirectory);
  const outputDirectory = resolve(runDirectory, "composed");
  await mkdir(outputDirectory, { mode: 0o700 });
  return {
    runDirectory,
    outputDirectory,
    reviewPath: resolve(runDirectory, "review.json"),
  };
}

async function expectMissing(path: string) {
  await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Grok composition preflight and atomic staging", () => {
  it("refuses existing composed metadata before rendering", async () => {
    const { outputDirectory, reviewPath } = await makeRun();
    await expect(
      assertCompositionOutputsAvailable({
        outputDirectory,
        reviewPath,
        reviewManifest: { composed: { filename: "already.mp4" } },
      }),
    ).rejects.toThrow(/already contains composed output metadata/);
  });

  it("detects final, review-temp, lock, and stale-attempt collisions", async () => {
    const { outputDirectory, reviewPath } = await makeRun();
    const base = {
      outputDirectory,
      reviewPath,
      reviewManifest: {},
      processId: 4242,
    };

    const videoPath = resolve(outputDirectory, COMPOSED_VIDEO_FILENAME);
    await writeFile(videoPath, "occupied");
    await expect(assertCompositionOutputsAvailable(base)).rejects.toThrow(
      /composed video output already exists/,
    );
    await rm(videoPath);

    await writeFile(`${reviewPath}.4242.tmp`, "occupied");
    await expect(assertCompositionOutputsAvailable(base)).rejects.toThrow(
      /review.json atomic temporary output already exists/,
    );
    await rm(`${reviewPath}.4242.tmp`);

    const lockPath = resolve(outputDirectory, ".composition.lock");
    await writeFile(lockPath, "occupied");
    await expect(assertCompositionOutputsAvailable(base)).rejects.toThrow(
      /composition lock already exists/,
    );
    await rm(lockPath);

    const stalePath = resolve(
      outputDirectory,
      ".primary-greeting-with-narration.1-stale.tmp.mp4",
    );
    await writeFile(stalePath, "occupied");
    await expect(assertCompositionOutputsAvailable(base)).rejects.toThrow(
      /Private composition attempt file already exists/,
    );
  });

  it("holds an exclusive private composition lock", async () => {
    const { outputDirectory } = await makeRun();
    const lockPath = resolve(outputDirectory, ".composition.lock");
    const lock = await acquireCompositionLock(lockPath);

    expect((await stat(lockPath)).mode & 0o777).toBe(0o600);
    expect(await readFile(lockPath, "utf8")).toContain('"pid"');
    await expect(acquireCompositionLock(lockPath)).rejects.toThrow(
      /Could not acquire private composition lock/,
    );
    await lock.release();
    await lock.release();
    await expectMissing(lockPath);
  });

  it("publishes a validated private video-caption pair", async () => {
    const { outputDirectory } = await makeRun();
    const captions = Buffer.from("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHi\n");
    const result = await stageAndCommitCompositionArtifacts({
      outputDirectory,
      captionBuffer: captions,
      uniqueId: "success",
      renderVideo: async (path: string) => {
        await writeFile(path, Buffer.from("rendered-private-video"));
      },
      validateArtifacts: async ({
        videoPath,
        captionPath,
      }: {
        videoPath: string;
        captionPath: string;
      }) => ({
        video: await readFile(videoPath, "utf8"),
        captions: await readFile(captionPath, "utf8"),
      }),
    });

    expect(result.validation.video).toBe("rendered-private-video");
    expect(result.validation.captions).toBe(captions.toString("utf8"));
    expect((await stat(result.videoPath)).mode & 0o777).toBe(0o600);
    expect((await stat(result.captionPath)).mode & 0o777).toBe(0o600);
    expect((await readdir(outputDirectory)).sort()).toEqual(
      [COMPOSED_CAPTION_FILENAME, COMPOSED_VIDEO_FILENAME].sort(),
    );
  });

  it("cleans temps after validation failure and rolls back a partial rename", async () => {
    const { outputDirectory } = await makeRun();
    const common = {
      outputDirectory,
      captionBuffer: Buffer.from("WEBVTT\n"),
      renderVideo: async (path: string) => {
        await writeFile(path, Buffer.from("video"));
      },
    };

    await expect(
      stageAndCommitCompositionArtifacts({
        ...common,
        uniqueId: "invalid",
        validateArtifacts: async () => {
          throw new Error("invalid composition");
        },
      }),
    ).rejects.toThrow(/invalid composition/);
    expect(await readdir(outputDirectory)).toEqual([]);

    let renameCount = 0;
    await expect(
      stageAndCommitCompositionArtifacts({
        ...common,
        uniqueId: "rollback",
        validateArtifacts: async () => ({ valid: true }),
        renameImplementation: async (from, to) => {
          renameCount += 1;
          if (renameCount === 2) throw new Error("second rename failed");
          await rename(from, to);
        },
      }),
    ).rejects.toThrow(/second rename failed/);
    expect(await readdir(outputDirectory)).toEqual([]);
  });
});
