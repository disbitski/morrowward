import {
  access,
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
  acquireImageGenerationLock,
  assertImageOutputsAvailable,
  cleanupPrivateImageRun,
  initializePrivateImageRun,
  stageAndCommitImageCandidates,
} from "../scripts/grok/image-preflight.mjs";

const temporaryDirectories: string[] = [];

async function makeRoot() {
  const root = await mkdtemp(resolve(tmpdir(), "morrowward-images-"));
  temporaryDirectories.push(root);
  const runDirectory = resolve(root, "campaign", "run-1");
  const imageDirectory = resolve(runDirectory, "images");
  const reviewPath = resolve(runDirectory, "review.json");
  return { root, runDirectory, imageDirectory, reviewPath };
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

describe("Grok image generation preflight and staging", () => {
  it("creates an exclusive private run and refuses to reuse it", async () => {
    const paths = await makeRoot();
    await initializePrivateImageRun(paths);

    expect((await stat(paths.runDirectory)).mode & 0o777).toBe(0o700);
    expect((await stat(paths.imageDirectory)).mode & 0o777).toBe(0o700);
    await expect(initializePrivateImageRun(paths)).rejects.toThrow(
      /Private image run already exists/,
    );
  });

  it("detects final, metadata, lock, and stale-temp collisions", async () => {
    const paths = await makeRoot();
    await initializePrivateImageRun(paths);
    const base = { ...paths, candidateCount: 2, processId: 5151 };

    const finalPath = resolve(paths.imageDirectory, "image-candidate-01.png");
    await writeFile(finalPath, "occupied");
    await expect(assertImageOutputsAvailable(base)).rejects.toThrow(
      /image candidate 1 .png output already exists/,
    );
    await rm(finalPath);

    await writeFile(paths.reviewPath, "occupied");
    await expect(assertImageOutputsAvailable(base)).rejects.toThrow(
      /image review manifest already exists/,
    );
    await rm(paths.reviewPath);

    await writeFile(`${paths.reviewPath}.5151.tmp`, "occupied");
    await expect(assertImageOutputsAvailable(base)).rejects.toThrow(
      /review.json atomic temporary output already exists/,
    );
    await rm(`${paths.reviewPath}.5151.tmp`);

    const lockPath = resolve(paths.runDirectory, ".image-generation.lock");
    await writeFile(lockPath, "occupied");
    await expect(assertImageOutputsAvailable(base)).rejects.toThrow(
      /image generation run lock already exists/,
    );
    await rm(lockPath);

    await writeFile(
      resolve(paths.imageDirectory, ".image-candidate-01.stale.tmp.png"),
      "occupied",
    );
    await expect(assertImageOutputsAvailable(base)).rejects.toThrow(
      /Private image attempt file already exists/,
    );
  });

  it("holds an exclusive mode-0600 run lock", async () => {
    const paths = await makeRoot();
    await initializePrivateImageRun(paths);
    const lockPath = resolve(paths.runDirectory, ".image-generation.lock");
    const lock = await acquireImageGenerationLock(lockPath);

    expect((await stat(lockPath)).mode & 0o777).toBe(0o600);
    expect(await readFile(lockPath, "utf8")).toContain('"pid"');
    await expect(acquireImageGenerationLock(lockPath)).rejects.toThrow(
      /Could not acquire private image generation run lock/,
    );
    await lock.release();
    await lock.release();
    await expectMissing(lockPath);
  });

  it("publishes a fully validated private candidate set", async () => {
    const paths = await makeRoot();
    await initializePrivateImageRun(paths);
    const source = [
      { buffer: Buffer.from("png-one"), mimeType: "image/png" },
      { buffer: Buffer.from("jpeg-two"), mimeType: "image/jpeg" },
    ];
    const result = await stageAndCommitImageCandidates({
      imageDirectory: paths.imageDirectory,
      candidates: source,
      uniqueId: "success",
      validateCandidate: ({
        buffer,
        index,
      }: {
        buffer: Buffer;
        index: number;
      }) => ({
        index,
        text: buffer.toString("utf8"),
      }),
    });

    expect(result.artifacts.map((entry) => entry.validation.text)).toEqual([
      "png-one",
      "jpeg-two",
    ]);
    expect((await readdir(paths.imageDirectory)).sort()).toEqual([
      "image-candidate-01.png",
      "image-candidate-02.jpg",
    ]);
    for (const path of result.finalPaths) {
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }
  });

  it("cleans validation failures and rolls back a partial candidate commit", async () => {
    const paths = await makeRoot();
    await initializePrivateImageRun(paths);
    const common = {
      imageDirectory: paths.imageDirectory,
      candidates: [
        { buffer: Buffer.from("one"), mimeType: "image/png" },
        { buffer: Buffer.from("two"), mimeType: "image/webp" },
      ],
    };

    await expect(
      stageAndCommitImageCandidates({
        ...common,
        uniqueId: "invalid",
        validateCandidate: async ({ index }: { index: number }) => {
          if (index === 1) throw new Error("invalid second candidate");
          return true;
        },
      }),
    ).rejects.toThrow(/invalid second candidate/);
    expect(await readdir(paths.imageDirectory)).toEqual([]);

    let renameCount = 0;
    await expect(
      stageAndCommitImageCandidates({
        ...common,
        uniqueId: "rollback",
        validateCandidate: async () => true,
        renameImplementation: async (from, to) => {
          renameCount += 1;
          if (renameCount === 2) throw new Error("second rename failed");
          await rename(from, to);
        },
      }),
    ).rejects.toThrow(/second rename failed/);
    expect(await readdir(paths.imageDirectory)).toEqual([]);
  });

  it("removes a failed empty private run", async () => {
    const paths = await makeRoot();
    await initializePrivateImageRun(paths);
    await cleanupPrivateImageRun(paths);
    await expectMissing(paths.runDirectory);
  });
});
