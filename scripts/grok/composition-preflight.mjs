import { randomUUID } from "node:crypto";
import {
  lstat,
  open,
  readdir,
  rename,
  unlink,
} from "node:fs/promises";
import { basename, extname, resolve } from "node:path";

export const COMPOSED_VIDEO_FILENAME =
  "primary-greeting-with-narration.mp4";
export const COMPOSED_CAPTION_FILENAME = "primary-greeting.en.vtt";

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

function hasComposedMetadata(reviewManifest) {
  return (
    reviewManifest !== null &&
    typeof reviewManifest === "object" &&
    !Array.isArray(reviewManifest) &&
    reviewManifest.composed !== undefined &&
    reviewManifest.composed !== null
  );
}

/** Refuse all deterministic composition collisions before ffmpeg starts. */
export async function assertCompositionOutputsAvailable({
  outputDirectory,
  reviewPath,
  reviewManifest,
  processId = process.pid,
  allowExistingLock = false,
}) {
  if (!Number.isSafeInteger(processId) || processId < 1) {
    throw new Error("Composition process id must be a positive safe integer.");
  }
  if (hasComposedMetadata(reviewManifest)) {
    throw new Error(
      "review.json already contains composed output metadata; use a fresh run or explicitly remove the reviewed composition.",
    );
  }

  const videoPath = resolve(outputDirectory, COMPOSED_VIDEO_FILENAME);
  const captionPath = resolve(outputDirectory, COMPOSED_CAPTION_FILENAME);
  const lockPath = resolve(outputDirectory, ".composition.lock");
  const reviewTemporaryPath = `${reviewPath}.${processId}.tmp`;
  await assertPathMissing(videoPath, "composed video output");
  await assertPathMissing(captionPath, "composed caption output");
  await assertPathMissing(
    reviewTemporaryPath,
    "review.json atomic temporary output",
  );
  if (!allowExistingLock) {
    await assertPathMissing(lockPath, "composition lock");
  }

  const entries = await readdir(outputDirectory);
  const staleTemporary = entries.find(
    (entry) =>
      entry.startsWith(
        `.${basename(COMPOSED_VIDEO_FILENAME, extname(COMPOSED_VIDEO_FILENAME))}.`,
      ) ||
      entry.startsWith(
        `.${basename(COMPOSED_CAPTION_FILENAME, extname(COMPOSED_CAPTION_FILENAME))}.`,
      ),
  );
  if (staleTemporary) {
    throw new Error(
      `Private composition attempt file already exists: ${resolve(outputDirectory, staleTemporary)}`,
    );
  }

  return {
    videoPath,
    captionPath,
    lockPath,
    reviewTemporaryPath,
  };
}

/** Hold one same-run composition lock for the whole render and review update. */
export async function acquireCompositionLock(lockPath) {
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
    throw new Error(`Could not acquire private composition lock: ${error.message}`, {
      cause: error,
    });
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

/** Remove only files owned by the active composition attempt. */
export async function cleanupCompositionPaths(
  paths,
  { unlinkImplementation = unlink } = {},
) {
  if (!Array.isArray(paths)) {
    throw new Error("Composition cleanup paths must be an array.");
  }
  const failures = [];
  for (const path of new Set(paths)) {
    if (typeof path !== "string" || !path) {
      failures.push(new Error("Composition cleanup path must be a string."));
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
      "One or more private composition attempt files could not be removed.",
    );
  }
}

function temporaryCompositionPath(outputDirectory, filename, uniqueId) {
  const extension = extname(filename);
  const stem = basename(filename, extension);
  return resolve(
    outputDirectory,
    `.${stem}.${process.pid}-${uniqueId}.tmp${extension}`,
  );
}

/**
 * Precreate private unique temp files, render and fully validate both, then
 * publish each complete artifact with an atomic rename. A partial two-file
 * commit is rolled back so callers never retain an untracked half-pair.
 */
export async function stageAndCommitCompositionArtifacts({
  outputDirectory,
  captionBuffer,
  renderVideo,
  validateArtifacts,
  uniqueId = String(randomUUID()),
  renameImplementation = rename,
}) {
  if (!Buffer.isBuffer(captionBuffer) || captionBuffer.length < 1) {
    throw new Error("Composition caption buffer must be non-empty.");
  }
  if (typeof renderVideo !== "function") {
    throw new Error("A composition video renderer is required.");
  }
  if (typeof validateArtifacts !== "function") {
    throw new Error("A composition artifact validator is required.");
  }
  if (!/^[A-Za-z0-9-]{1,100}$/.test(uniqueId)) {
    throw new Error("Temporary composition id contains unsafe characters.");
  }

  const videoPath = resolve(outputDirectory, COMPOSED_VIDEO_FILENAME);
  const captionPath = resolve(outputDirectory, COMPOSED_CAPTION_FILENAME);
  const temporaryVideoPath = temporaryCompositionPath(
    outputDirectory,
    COMPOSED_VIDEO_FILENAME,
    uniqueId,
  );
  const temporaryCaptionPath = temporaryCompositionPath(
    outputDirectory,
    COMPOSED_CAPTION_FILENAME,
    uniqueId,
  );
  const temporaryPaths = new Set();
  const committedFinalPaths = [];

  try {
    for (const [path, label] of [
      [videoPath, "composed video output"],
      [captionPath, "composed caption output"],
      [temporaryVideoPath, "private composition video temporary output"],
      [temporaryCaptionPath, "private composition caption temporary output"],
    ]) {
      await assertPathMissing(path, label);
    }

    let videoHandle;
    try {
      videoHandle = await open(temporaryVideoPath, "wx", 0o600);
      temporaryPaths.add(temporaryVideoPath);
      await videoHandle.chmod(0o600);
      await videoHandle.sync();
    } finally {
      await videoHandle?.close();
    }

    let captionHandle;
    try {
      captionHandle = await open(temporaryCaptionPath, "wx", 0o600);
      temporaryPaths.add(temporaryCaptionPath);
      await captionHandle.chmod(0o600);
      await captionHandle.writeFile(captionBuffer);
      await captionHandle.sync();
    } finally {
      await captionHandle?.close();
    }

    await renderVideo(temporaryVideoPath);
    let renderedHandle;
    try {
      renderedHandle = await open(temporaryVideoPath, "r+");
      await renderedHandle.chmod(0o600);
      await renderedHandle.sync();
    } finally {
      await renderedHandle?.close();
    }

    const validation = await validateArtifacts({
      videoPath: temporaryVideoPath,
      captionPath: temporaryCaptionPath,
    });
    await assertPathMissing(videoPath, "final composed video output");
    await assertPathMissing(captionPath, "final composed caption output");

    await renameImplementation(temporaryVideoPath, videoPath);
    temporaryPaths.delete(temporaryVideoPath);
    committedFinalPaths.push(videoPath);
    await renameImplementation(temporaryCaptionPath, captionPath);
    temporaryPaths.delete(temporaryCaptionPath);
    committedFinalPaths.push(captionPath);

    return {
      validation,
      videoPath,
      captionPath,
      finalPaths: [...committedFinalPaths],
    };
  } catch (error) {
    try {
      await cleanupCompositionPaths([
        ...temporaryPaths,
        ...committedFinalPaths,
      ]);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Composition staging failed and private attempt files could not be removed.",
      );
    }
    throw error;
  }
}
