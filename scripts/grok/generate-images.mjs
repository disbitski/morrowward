import { resolve } from "node:path";
import {
  DEFAULT_MANIFEST_PATH,
  XAI_API_BASE_URL,
  assertImageMatchesRequest,
  buildImageGenerationRequest,
  decodeImageGenerationResponse,
  loadCampaignManifest,
  parseCliArguments,
  readImageDimensions,
  requestJson,
  resolveMediaReviewPath,
  requireXaiApiKey,
  requireXaiUploadConfirmation,
  sha256Hex,
  validateMediaBuffer,
  writeJsonAtomic,
} from "./media-lib.mjs";
import {
  acquireImageGenerationLock,
  assertImageOutputsAvailable,
  cleanupImagePaths,
  cleanupPrivateImageRun,
  initializePrivateImageRun,
  stageAndCommitImageCandidates,
} from "./image-preflight.mjs";

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
const requestBody = buildImageGenerationRequest(manifest, prompts.image);
await initializePrivateImageRun({ runDirectory, imageDirectory });
let imagePreflight;
try {
  imagePreflight = await assertImageOutputsAvailable({
    runDirectory,
    imageDirectory,
    reviewPath,
    candidateCount: manifest.image.candidateCount,
  });
} catch (error) {
  await cleanupPrivateImageRun({ runDirectory, imageDirectory });
  throw error;
}
let generationLock;
try {
  generationLock = await acquireImageGenerationLock(imagePreflight.lockPath);
} catch (error) {
  await cleanupPrivateImageRun({ runDirectory, imageDirectory });
  throw error;
}
let pipelineError = null;
let committedFinalPaths = [];
let reviewSaved = false;

try {
await assertImageOutputsAvailable({
  runDirectory,
  imageDirectory,
  reviewPath,
  candidateCount: manifest.image.candidateCount,
  allowExistingLock: true,
});
const apiKey = requireXaiApiKey();

const { payload } = await requestJson(
  fetch,
  `${XAI_API_BASE_URL}/images/generations`,
  { apiKey, method: "POST", body: requestBody },
);
const decodedImages = decodeImageGenerationResponse(
  payload,
  manifest.image.candidateCount,
);
const stagedImages = await stageAndCommitImageCandidates({
  imageDirectory,
  candidates: decodedImages,
  validateCandidate: ({ buffer, mimeType, index }) => {
    validateMediaBuffer(buffer, mimeType, { kind: "image" });
    if (sha256Hex(buffer) !== sha256Hex(decodedImages[index].buffer)) {
      throw new Error(`Candidate ${index + 1} staged bytes changed.`);
    }
    const dimensions = readImageDimensions(buffer, mimeType);
    assertImageMatchesRequest(
      dimensions,
      manifest.image,
      `Candidate ${index + 1}`,
    );
    return dimensions;
  },
});
committedFinalPaths = stagedImages.finalPaths;

const candidates = stagedImages.artifacts.map((candidate, index) => ({
    id: `image-${index + 1}`,
    filename: `images/${candidate.filename}`,
    mimeType: candidate.mimeType,
    bytes: candidate.buffer.length,
    sha256: sha256Hex(candidate.buffer),
    width: candidate.validation.width,
    height: candidate.validation.height,
    review: {
      hardGatesPassed: null,
      hardGateNotes: [],
      scores: {},
      totalScore: null,
      observations: [],
      status: "pending-original-resolution-review",
    },
  }));

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
  aiInterpretationBadge: manifest.metadata.aiInterpretationBadge,
  disclosure: manifest.metadata.historicalFigureDisclosure,
  caption: manifest.metadata.caption,
  voiceDisclosure: manifest.metadata.voiceDisclosure,
  transcript: manifest.metadata.transcript,
  directQuote: manifest.metadata.directQuote,
  directQuoteAttribution: manifest.metadata.directQuoteAttribution,
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
reviewSaved = true;

console.log(`Generated ${candidates.length} private review candidates.`);
console.log(`Review directory: ${runDirectory}`);
console.log("No candidate has been selected or copied into the repository.");
} catch (error) {
  pipelineError = error;
  if (!reviewSaved) {
    try {
      await cleanupImagePaths([
        ...committedFinalPaths,
        imagePreflight.reviewTemporaryPath,
      ]);
    } catch (cleanupError) {
      pipelineError = new AggregateError(
        [error, cleanupError],
        "Image generation failed and private partial output could not be removed.",
      );
    }
  }
}

try {
  await generationLock.release();
} catch (releaseError) {
  pipelineError = pipelineError
    ? new AggregateError(
        [pipelineError, releaseError],
        "Image generation failed and its private run lock could not be released.",
      )
    : releaseError;
}

if (pipelineError && !reviewSaved) {
  try {
    await cleanupPrivateImageRun({ runDirectory, imageDirectory });
  } catch (cleanupError) {
    pipelineError = new AggregateError(
      [pipelineError, cleanupError],
      "Image generation failed and its empty private run could not be removed.",
    );
  }
}
if (pipelineError) throw pipelineError;
