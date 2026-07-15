import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DEFAULT_MANIFEST_PATH,
  assertReviewedCandidateUpload,
  buildVideoGenerationRequest,
  downloadAndValidateMedia,
  extensionForMimeType,
  imageFileToDataUri,
  loadCampaignManifest,
  parseCliArguments,
  pollVideoGeneration,
  resolveMediaReviewPath,
  requireXaiApiKey,
  requireXaiUploadConfirmation,
  startVideoGeneration,
  writeJsonAtomic,
} from "./media-lib.mjs";

const options = parseCliArguments(process.argv.slice(2));
requireXaiUploadConfirmation(
  options,
  "the private video prompt and, for image-to-video, the selected source image",
);
const manifestLocation = options.manifest ?? DEFAULT_MANIFEST_PATH;
const modeOption = options.mode;
if (!["image-to-video", "text-to-video"].includes(modeOption)) {
  throw new Error("Use --mode image-to-video or --mode text-to-video.");
}
const mode = modeOption === "image-to-video" ? "imageToVideo" : "textToVideo";
if (mode === "imageToVideo" && typeof options.image !== "string") {
  throw new Error("image-to-video requires --image /path/to/review-candidate.");
}

const { manifest, prompts } = await loadCampaignManifest(manifestLocation);
const outputDirectory = await resolveMediaReviewPath(
  options.run ??
    `.media-review/grok/${manifest.campaignId}/${new Date().toISOString().replace(/[:.]/g, "-")}`,
  "Video run directory",
);
const videoDirectory = await resolveMediaReviewPath(
  resolve(outputDirectory, "videos"),
  "Video candidate directory",
);
const reviewPath = await resolveMediaReviewPath(
  resolve(outputDirectory, "review.json"),
  "Video review manifest",
);

let imageDataUri;
let sourceImage = null;
let reviewManifest = null;
if (mode === "imageToVideo") {
  const selectedImagePath = await resolveMediaReviewPath(
    options.image,
    "Image-to-video source image",
  );
  try {
    reviewManifest = JSON.parse(await readFile(reviewPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Image-to-video requires this run's valid review.json: ${error.message}`,
    );
  }
  const image = await imageFileToDataUri(selectedImagePath);
  const selectedCandidate = assertReviewedCandidateUpload(
    reviewManifest,
    outputDirectory,
    selectedImagePath,
    image.sha256,
  );
  imageDataUri = image.dataUri;
  sourceImage = {
    candidateId: selectedCandidate.id,
    path: selectedCandidate.filename,
    mimeType: image.mimeType,
    sha256: image.sha256,
  };
}
await mkdir(videoDirectory, {
  recursive: true,
  mode: 0o700,
});
const requestBody = buildVideoGenerationRequest(
  manifest,
  mode,
  prompts[mode],
  imageDataUri,
);
const apiKey = requireXaiApiKey();
const requestId = await startVideoGeneration(fetch, apiKey, requestBody);
console.log(`Started ${modeOption}; polling request ${requestId}.`);
const result = await pollVideoGeneration(fetch, apiKey, requestId, {
  intervalMs: Number(options["poll-ms"] ?? 5_000),
  timeoutMs: Number(options["timeout-ms"] ?? 15 * 60_000),
});
const downloaded = await downloadAndValidateMedia(fetch, result.video.url, {
  kind: "video",
  minimumBytes: manifest.video.minimumBytes,
});
const filename = `${modeOption}${extensionForMimeType(downloaded.mimeType)}`;
const relativeFilename = `videos/${filename}`;
await writeFile(resolve(outputDirectory, relativeFilename), downloaded.buffer, {
  mode: 0o600,
  flag: "wx",
});

if (!reviewManifest) {
  try {
    reviewManifest = JSON.parse(await readFile(reviewPath, "utf8"));
  } catch {
    reviewManifest = {
      schemaVersion: 1,
      campaignId: manifest.campaignId,
      runCreatedAt: new Date().toISOString(),
      disclosure: manifest.metadata.historicalFigureDisclosure,
      caption: manifest.metadata.caption,
      source: manifest.metadata.source,
      reviewPolicy: manifest.review,
      candidates: [],
      videos: [],
      narration: null,
      selection: {
        leadReviewer: "Codex/GPT",
        selectedCandidateId: null,
        rationale: null,
        humanApproval: null,
      },
    };
  }
}
reviewManifest.videos ??= [];
reviewManifest.videos.push({
  id: modeOption,
  filename: relativeFilename,
  mimeType: downloaded.mimeType,
  bytes: downloaded.buffer.length,
  sha256: downloaded.sha256,
  requestId,
  providerModel: manifest.video[mode].model,
  durationSeconds: result.video.duration ?? manifest.video[mode].durationSeconds,
  sourceImage,
  disclosure: manifest.metadata.historicalFigureDisclosure,
  caption: manifest.metadata.caption,
  transcript: manifest.metadata.transcript,
  playback: manifest.playback,
  review: {
    hardGatesPassed: null,
    hardGateNotes: [],
    scores: {},
    observations: [],
    status: "pending-frame-audio-and-motion-review",
  },
});
await writeJsonAtomic(reviewPath, reviewManifest);

console.log(`Validated ${downloaded.mimeType} video: ${resolve(outputDirectory, relativeFilename)}`);
console.log("The candidate remains private and requires frame, motion, and audio review.");
