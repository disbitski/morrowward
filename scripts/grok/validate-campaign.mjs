import {
  DEFAULT_MANIFEST_PATH,
  loadCampaignManifest,
  parseCliArguments,
} from "./media-lib.mjs";

const options = parseCliArguments(process.argv.slice(2));
const { manifest, prompts, manifestPath } = await loadCampaignManifest(
  options.manifest ?? DEFAULT_MANIFEST_PATH,
);

console.log(`Campaign manifest valid: ${manifestPath}`);
console.log(
  JSON.stringify(
    {
      campaignId: manifest.campaignId,
      images: {
        model: manifest.image.model,
        count: manifest.image.candidateCount,
        aspectRatio: manifest.image.aspectRatio,
        resolution: manifest.image.resolution,
        promptCharacters: prompts.image.length,
      },
      videos: {
        imageToVideo: manifest.video.imageToVideo,
        textToVideo: manifest.video.textToVideo,
      },
      narration: {
        voiceId: manifest.narration.voiceId,
        voiceType: manifest.narration.voiceType,
        promptCharacters: prompts.narration.length,
      },
      autoplay: manifest.playback.autoplay,
      reviewHardGates: manifest.review.hardGates.length,
    },
    null,
    2,
  ),
);
console.log("Dry run complete. No xAI request was made.");
