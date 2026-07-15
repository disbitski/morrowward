# Morrowward Grok media pipeline

This is a fresh, project-owned review pipeline for optional Morrowward greeting media. It is not imported from the Real World AI Lab or its field-note scripts. Builds and tests never call xAI; generation runs only through the explicit commands below.

All unapproved output goes to the gitignored `.media-review/` directory. Nothing is copied into `public/`, committed, or published automatically.

## External-data boundary

Generation sends private work-in-progress data to the third-party xAI API: image and video prompts are sent as text, image-to-video also sends the selected local still as a data URI, and narration sends the transcript. The scripts refuse every xAI generation request unless the operator adds the exact bare `--confirm-xai-upload` flag. Use it only after the project owner explicitly approves that upload. Validation, tests, and composition remain local and do not need the flag.

## What it creates

- four private 2K, 16:9 image candidates from one controlled prompt;
- one optional 12-second image-to-video greeting from a selected local candidate;
- one optional 10-second text-to-video comparison;
- lossless narration from a verified xAI **built-in** voice, plus transcript and WebVTT captions;
- an optional MP4 composed with the built-in narration replacing any model-generated audio;
- a structured `review.json` for Codex/GPT-led original-resolution review and human final approval.

The historical figure is always labeled an **AI-generated historical interpretation of Marcus Aurelius**. The narration does not clone, imitate, or claim to reproduce his voice.

## Credential setup

Provide the key only through the process environment or an ignored local environment file:

```sh
export XAI_API_KEY="your-project-key"
```

Never pass the key on the command line, paste it into a prompt, place it in the manifest, add it to a `NEXT_PUBLIC_` variable, or configure it in the Morrowward web deployment. The tooling reads only `process.env.XAI_API_KEY` and never prints it.

## Validate without spending

```sh
npm run media:grok:check
```

This validates the committed manifest and prompt paths without making an API call.

## Generate and review

Generate four images:

```sh
npm run media:grok:images -- --confirm-xai-upload
```

The command prints a new ignored run directory. Inspect all four files at original resolution, record hard-gate results and scores in that run’s `review.json`, and identify a provisional winner. Follow [REVIEW_RUBRIC.md](REVIEW_RUBRIC.md).

Animate the provisional winner:

```sh
npm run media:grok:video -- \
  --confirm-xai-upload \
  --mode image-to-video \
  --image .media-review/grok/morrowward-marcus-greeting/<run>/<selected-candidate-filename> \
  --run .media-review/grok/morrowward-marcus-greeting/<run>
```

Use the selected candidate's exact `filename` from `review.json`; the generated extension may be `.png`, `.jpg`, `.webp`, or `.gif`. Image-to-video fails closed unless `selection.selectedCandidateId` names that candidate, its `review.hardGatesPassed` value is `true`, the path stays inside that run's `images/` directory, and the file still matches its recorded SHA-256. This prevents an unrelated local image from being uploaded accidentally.

Generate the text-to-video comparison only when useful:

```sh
npm run media:grok:video -- \
  --confirm-xai-upload \
  --mode text-to-video \
  --run .media-review/grok/morrowward-marcus-greeting/<run>
```

Generate narration with a verified built-in voice and timestamped captions:

```sh
npm run media:grok:narration -- \
  --confirm-xai-upload \
  --run .media-review/grok/morrowward-marcus-greeting/<run>
```

Compose a private MP4 after reviewing the raw visual and narration:

```sh
npm run media:grok:compose -- \
  --video .media-review/grok/morrowward-marcus-greeting/<run>/videos/image-to-video.mp4 \
  --audio .media-review/grok/morrowward-marcus-greeting/<run>/narration/narration.wav \
  --captions .media-review/grok/morrowward-marcus-greeting/<run>/narration/narration.en.vtt \
  --run .media-review/grok/morrowward-marcus-greeting/<run>
```

Composition requires `ffmpeg`. It discards any generated video audio and uses only the declared built-in narrator. The WebVTT file remains a sidecar so the application can expose real captions.

## Validation and data handling

- Image generation uses `b64_json`; the script verifies the provider MIME type against decoded magic bytes, validates dimensions, hashes each file, and preserves the matching extension.
- Every custom `--run` or `--output` path must remain inside this repository's gitignored `.media-review/` directory; existing symbolic-link path components are rejected.
- Video generation starts asynchronously, polls bounded by a timeout, downloads only over HTTPS, validates MIME against magic bytes, checks a minimum size, and hashes the result.
- TTS first confirms that the configured voice appears in `GET /v1/tts/voices`. It requests WAV with character timestamps, validates that timings are monotonic, non-overlapping, and within the declared duration, and derives WebVTT captions from those timings.
- API keys are never stored in output metadata. Provider request IDs and temporary URLs stay only inside the ignored review directory; downloaded video URLs are not retained.
- xAI pricing and model availability can change. Review the xAI console before generating a new batch.

## Historical wording

The narrator attributes one short direct line from *Meditations* V.1: “I am rising to the work of a human being.” The source is [Project Gutenberg’s public-domain George Long translation](https://www.gutenberg.org/files/6920/6920-h/6920-h.htm). All surrounding narration is original Morrowward copy. The pictured figure remains silent, and the interface must identify the audio as a built-in AI narrator rather than Marcus Aurelius's voice.

## Playback requirements

Approved media must require a user gesture and provide controls, a poster, transcript, and captions. Do not rely on audio to communicate meaning, and honor reduced-motion preferences with the poster fallback.

```html
<video controls preload="metadata" poster="/approved-poster.webp">
  <source src="/approved-greeting.mp4" type="video/mp4" />
  <track kind="captions" src="/approved-greeting.en.vtt" srclang="en" label="English" default />
</video>
```

There is intentionally no `autoplay` attribute.

## Official sources

- [xAI image generation](https://docs.x.ai/developers/model-capabilities/images/generation)
- [xAI video generation and asynchronous polling](https://docs.x.ai/developers/model-capabilities/video/generation)
- [xAI image-to-video](https://docs.x.ai/developers/model-capabilities/video/image-to-video)
- [xAI Text to Speech and built-in voices](https://docs.x.ai/developers/model-capabilities/audio/text-to-speech)
- [xAI REST OpenAPI schema](https://api.x.ai/api-docs/openapi.json)
- [Project Gutenberg public-domain George Long translation](https://www.gutenberg.org/files/6920/6920-h/6920-h.htm)
