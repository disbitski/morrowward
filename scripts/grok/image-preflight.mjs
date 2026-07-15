import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rmdir,
  unlink,
} from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { extensionForMimeType } from "./media-lib.mjs";

export const IMAGE_OUTPUT_EXTENSIONS = Object.freeze([
  ".png",
  ".jpg",
  ".webp",
  ".gif",
]);

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

/** Create an exclusive private run so a timestamp collision cannot be reused. */
export async function initializePrivateImageRun({
  runDirectory,
  imageDirectory,
}) {
  if (resolve(imageDirectory) !== resolve(runDirectory, "images")) {
    throw new Error("Image directory must be the images/ child of the run.");
  }
  await mkdir(dirname(runDirectory), { recursive: true, mode: 0o700 });
  let runCreated = false;
  try {
    await mkdir(runDirectory, { mode: 0o700 });
    runCreated = true;
    await mkdir(imageDirectory, { mode: 0o700 });
  } catch (error) {
    if (runCreated) {
      await rmdir(imageDirectory).catch(() => {});
      await rmdir(runDirectory).catch(() => {});
    }
    if (error?.code === "EEXIST") {
      throw new Error(`Private image run already exists: ${runDirectory}`, {
        cause: error,
      });
    }
    throw new Error(`Could not initialize private image run: ${error.message}`, {
      cause: error,
    });
  }
  return { runDirectory, imageDirectory };
}

/** Audit every possible final, temp, metadata, and lock collision. */
export async function assertImageOutputsAvailable({
  runDirectory,
  imageDirectory,
  reviewPath,
  candidateCount,
  processId = process.pid,
  allowExistingLock = false,
}) {
  if (!Number.isSafeInteger(candidateCount) || candidateCount < 1) {
    throw new Error("Image candidate count must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(processId) || processId < 1) {
    throw new Error("Image process id must be a positive safe integer.");
  }

  for (let index = 1; index <= candidateCount; index += 1) {
    const stem = `image-candidate-${String(index).padStart(2, "0")}`;
    for (const extension of IMAGE_OUTPUT_EXTENSIONS) {
      await assertPathMissing(
        resolve(imageDirectory, `${stem}${extension}`),
        `image candidate ${index} ${extension} output`,
      );
    }
  }
  await assertPathMissing(reviewPath, "image review manifest");
  const reviewTemporaryPath = `${reviewPath}.${processId}.tmp`;
  await assertPathMissing(
    reviewTemporaryPath,
    "review.json atomic temporary output",
  );
  const lockPath = resolve(runDirectory, ".image-generation.lock");
  if (!allowExistingLock) {
    await assertPathMissing(lockPath, "image generation run lock");
  }

  const staleTemporary = (await readdir(imageDirectory)).find((entry) =>
    entry.startsWith(".image-candidate-"),
  );
  if (staleTemporary) {
    throw new Error(
      `Private image attempt file already exists: ${resolve(imageDirectory, staleTemporary)}`,
    );
  }
  return { lockPath, reviewTemporaryPath };
}

/** Hold the exclusive lock from final preflight through review persistence. */
export async function acquireImageGenerationLock(lockPath) {
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
      `Could not acquire private image generation run lock: ${error.message}`,
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

/** Remove only candidate files owned by the current generation attempt. */
export async function cleanupImagePaths(
  paths,
  { unlinkImplementation = unlink } = {},
) {
  if (!Array.isArray(paths)) {
    throw new Error("Image cleanup paths must be an array.");
  }
  const failures = [];
  for (const path of new Set(paths)) {
    if (typeof path !== "string" || !path) {
      failures.push(new Error("Image cleanup path must be a string."));
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
      "One or more private image attempt files could not be removed.",
    );
  }
}

/** Remove a failed, exclusively-created run after all owned files are gone. */
export async function cleanupPrivateImageRun({ runDirectory, imageDirectory }) {
  const failures = [];
  for (const path of [imageDirectory, runDirectory]) {
    try {
      await rmdir(path);
    } catch (error) {
      if (error?.code !== "ENOENT") failures.push(error);
    }
  }
  if (failures.length) {
    throw new AggregateError(
      failures,
      "The failed private image run directories could not be removed.",
    );
  }
}

function temporaryImagePath(finalPath, uniqueId) {
  const extension = extname(finalPath);
  const stem = basename(finalPath, extension);
  return resolve(
    dirname(finalPath),
    `.${stem}.${process.pid}-${uniqueId}.tmp${extension}`,
  );
}

/**
 * Stage every decoded image at mode 0600, validate its exact on-disk bytes,
 * then rename complete candidates into place. Any partial set is rolled back.
 */
export async function stageAndCommitImageCandidates({
  imageDirectory,
  candidates,
  validateCandidate,
  uniqueId = String(randomUUID()),
  renameImplementation = rename,
}) {
  if (!Array.isArray(candidates) || candidates.length < 1) {
    throw new Error("At least one decoded image candidate is required.");
  }
  if (typeof validateCandidate !== "function") {
    throw new Error("An on-disk image candidate validator is required.");
  }
  if (!/^[A-Za-z0-9-]{1,100}$/.test(uniqueId)) {
    throw new Error("Temporary image id contains unsafe characters.");
  }

  const artifacts = candidates.map((candidate, index) => {
    if (!Buffer.isBuffer(candidate?.buffer) || candidate.buffer.length < 1) {
      throw new Error(`Image candidate ${index + 1} must contain bytes.`);
    }
    const extension = extensionForMimeType(candidate.mimeType);
    if (!IMAGE_OUTPUT_EXTENSIONS.includes(extension)) {
      throw new Error(`Image candidate ${index + 1} has an unsupported type.`);
    }
    const filename = `image-candidate-${String(index + 1).padStart(2, "0")}${extension}`;
    const finalPath = resolve(imageDirectory, filename);
    return {
      ...candidate,
      filename,
      finalPath,
      temporaryPath: temporaryImagePath(finalPath, uniqueId),
    };
  });
  const temporaryPaths = new Set();
  const committedFinalPaths = [];

  try {
    for (const artifact of artifacts) {
      await assertPathMissing(artifact.finalPath, "final image candidate");
      await assertPathMissing(
        artifact.temporaryPath,
        "private image candidate temporary output",
      );
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

    const validations = [];
    for (let index = 0; index < artifacts.length; index += 1) {
      const artifact = artifacts[index];
      const stagedBuffer = await readFile(artifact.temporaryPath);
      if (!stagedBuffer.equals(artifact.buffer)) {
        throw new Error(`Image candidate ${index + 1} staged bytes changed.`);
      }
      validations.push(
        await validateCandidate({
          path: artifact.temporaryPath,
          buffer: stagedBuffer,
          mimeType: artifact.mimeType,
          index,
        }),
      );
    }

    for (const artifact of artifacts) {
      await assertPathMissing(artifact.finalPath, "final image candidate");
    }
    for (const artifact of artifacts) {
      await renameImplementation(artifact.temporaryPath, artifact.finalPath);
      temporaryPaths.delete(artifact.temporaryPath);
      committedFinalPaths.push(artifact.finalPath);
    }

    return {
      artifacts: artifacts.map((artifact, index) => ({
        filename: artifact.filename,
        path: artifact.finalPath,
        mimeType: artifact.mimeType,
        buffer: artifact.buffer,
        validation: validations[index],
      })),
      finalPaths: [...committedFinalPaths],
    };
  } catch (error) {
    try {
      await cleanupImagePaths([...temporaryPaths, ...committedFinalPaths]);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Image staging failed and private attempt files could not be removed.",
      );
    }
    throw error;
  }
}
