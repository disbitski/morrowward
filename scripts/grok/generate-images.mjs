import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DEFAULT_MANIFEST_PATH,
  XAI_API_BASE_URL,
  buildImageGenerationRequest,
  decodeImageGenerationResponse,
  extensionForMimeType,
  loadCampaignManifest,
  parseCliArguments,
  readImageDimensions,
  requestJson,
  resolveMediaReviewPath,
  requireXaiApiKey,
  requireXaiUploadConfirmation,
  sha256Hex,
  writeJsonAtomic,
} from "./media-lib.mjs";

function runId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

const options = parseCliArguments(process.argv.slice(2));
requireXaiUploadConfirmation(options, "the private image prompt");
const manifestLocation = options.manifest ?? DEFAULT_MANIFEST_PATH;
const outputRoot = await resolveMediaReviewPath(
  options.output ?? ".media-review/grok",
  "Image output root",
);
const { manifest, prompts } = await loadCampaignManifest(manifestLocation);
const runDirectory = await resolveMediaReviewPath(
  resolve(outputRoot, manifest.campaignId, runId()),
  "Image run directory",
);
const imageDirectory = await resolveMediaReviewPath(
  resolve(runDirectory, "images"),
  "Image candidate directory",
);
const reviewPath = await resolveMediaReviewPath(
  resolve(runDirectory, "review.json"),
  "Image review manifest",
);
const apiKey = requireXaiApiKey();
const requestBody = buildImageGenerationRequest(manifest, prompts.image);

const { payload } = await requestJson(
  fetch,
  `${XAI_API_BASE_URL}/images/generations`,
  { apiKey, method: "POST", body: requestBody },
);
const decodedImages = decodeImageGenerationResponse(
  payload,
  manifest.image.candidateCount,
);
const validatedImages = decodedImages.map((candidate, index) => {
  const dimensions = readImageDimensions(candidate.buffer, candidate.mimeType);
  if (
    Math.min(dimensions.width, dimensions.height) <
    manifest.image.minimumEdgePixels
  ) {
    throw new Error(
      `Candidate ${index + 1} is ${dimensions.width}x${dimensions.height}; expected a minimum edge of ${manifest.image.minimumEdgePixels}px.`,
    );
  }
  return { ...candidate, dimensions };
});

await mkdir(imageDirectory, { recursive: true, mode: 0o700 });

const candidates = [];
for (let index = 0; index < validatedImages.length; index += 1) {
  const candidate = validatedImages[index];
  const filename = `image-candidate-${String(index + 1).padStart(2, "0")}${extensionForMimeType(candidate.mimeType)}`;
  const path = resolve(imageDirectory, filename);
  await writeFile(path, candidate.buffer, { mode: 0o600, flag: "wx" });
  candidates.push({
    id: `image-${index + 1}`,
    filename: `images/${filename}`,
    mimeType: candidate.mimeType,
    bytes: candidate.buffer.length,
    sha256: sha256Hex(candidate.buffer),
    width: candidate.dimensions.width,
    height: candidate.dimensions.height,
    review: {
      hardGatesPassed: null,
      hardGateNotes: [],
      scores: {},
      observations: [],
      status: "pending-original-resolution-review",
    },
  });
}

const reviewManifest = {
  schemaVersion: 1,
  campaignId: manifest.campaignId,
  runCreatedAt: new Date().toISOString(),
  generatedBy: {
    provider: "xAI",
    model: manifest.image.model,
    request: {
      candidateCount: manifest.image.candidateCount,
      aspectRatio: manifest.image.aspectRatio,
      resolution: manifest.image.resolution,
      responseFormat: "b64_json",
    },
  },
  disclosure: manifest.metadata.historicalFigureDisclosure,
  caption: manifest.metadata.caption,
  source: manifest.metadata.source,
  prompt: prompts.image,
  reviewPolicy: manifest.review,
  candidates,
  videos: [],
  narration: null,
  selection: {
    leadReviewer: "Codex/GPT",
    selectedCandidateId: null,
    rationale: null,
    humanApproval: null,
  },
};
await writeJsonAtomic(reviewPath, reviewManifest);

console.log(`Generated ${candidates.length} private review candidates.`);
console.log(`Review directory: ${runDirectory}`);
console.log("No candidate has been selected or copied into the repository.");
