import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  parseCliArguments,
  resolveMediaReviewPath,
  sha256Hex,
  validateMediaBuffer,
  writeJsonAtomic,
} from "./media-lib.mjs";

function run(command, argumentsList) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, argumentsList, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let errorOutput = "";
    child.stderr.on("data", (chunk) => {
      errorOutput += chunk.toString();
      if (errorOutput.length > 8_000) errorOutput = errorOutput.slice(-8_000);
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${command} exited ${code}: ${errorOutput.trim()}`));
    });
  });
}

const options = parseCliArguments(process.argv.slice(2));
for (const required of ["video", "audio", "captions", "run"]) {
  if (typeof options[required] !== "string") {
    throw new Error(`Missing required --${required} path.`);
  }
}
const videoPath = resolve(options.video);
const audioPath = resolve(options.audio);
const captionPath = resolve(options.captions);
const runDirectory = await resolveMediaReviewPath(
  options.run,
  "Composition run directory",
);
const outputDirectory = await resolveMediaReviewPath(
  resolve(runDirectory, "composed"),
  "Composition output directory",
);
const reviewPath = await resolveMediaReviewPath(
  resolve(runDirectory, "review.json"),
  "Composition review manifest",
);
const outputPath = resolve(outputDirectory, "primary-greeting-with-narration.mp4");
const outputCaptionPath = resolve(outputDirectory, "primary-greeting.en.vtt");
await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
try {
  await stat(outputPath);
  throw new Error(`Refusing to overwrite existing output: ${outputPath}`);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

validateMediaBuffer(await readFile(videoPath), null, {
  kind: "video",
  minimumBytes: 10_000,
});
validateMediaBuffer(await readFile(audioPath), null, {
  kind: "audio",
  minimumBytes: 44,
});
const captions = await readFile(captionPath, "utf8");
if (!captions.startsWith("WEBVTT\n") || !captions.includes("-->")) {
  throw new Error("Caption input is not a valid WebVTT sidecar.");
}

// Ignore any model-generated audio. The only output audio is the declared xAI
// built-in narrator voice, padded to the visual duration without autoplay.
await run("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-n",
  "-i",
  videoPath,
  "-i",
  audioPath,
  "-filter_complex",
  "[1:a:0]apad[a]",
  "-map",
  "0:v:0",
  "-map",
  "[a]",
  "-map_metadata",
  "-1",
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-crf",
  "18",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-shortest",
  "-movflags",
  "+faststart",
  outputPath,
]);
await copyFile(captionPath, outputCaptionPath, 0);
const output = await readFile(outputPath);
const mimeType = validateMediaBuffer(output, "video/mp4", {
  kind: "video",
  minimumBytes: 10_000,
});

const reviewManifest = JSON.parse(await readFile(reviewPath, "utf8"));
reviewManifest.composed = {
  filename: "composed/primary-greeting-with-narration.mp4",
  captionFilename: "composed/primary-greeting.en.vtt",
  mimeType,
  bytes: output.length,
  sha256: sha256Hex(output),
  sourceVideo: videoPath,
  sourceNarration: audioPath,
  autoplay: false,
  controlsRequired: true,
  posterRequired: true,
  reducedMotionFallbackRequired: true,
  status: "pending-final-frame-audio-caption-review",
};
await writeJsonAtomic(reviewPath, reviewManifest);

console.log(`Composed private review video: ${outputPath}`);
console.log(`Caption sidecar: ${outputCaptionPath}`);
console.log("Autoplay is not authorized; publish only with controls and a poster fallback.");
