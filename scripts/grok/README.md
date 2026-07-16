# Morrowward Grok media pipeline

This is a fresh, project-owned review pipeline for optional Morrowward greeting media. It is not imported from the Real World AI Lab or its field-note scripts. Builds and tests never call xAI; generation runs only through the explicit commands below.

All unapproved output goes to the gitignored `.media-review/` directory. Nothing is copied into `public/`, committed, or published automatically.

## External-data boundary

Generation sends private work-in-progress data to the third-party xAI API: image and video prompts are sent as text, image-to-video also sends the selected local still as a data URI, and narration sends the transcript. The scripts refuse every xAI generation request unless the operator adds the exact bare `--confirm-xai-upload` flag. Use it only after the project owner explicitly approves that upload. Validation, tests, and composition remain local and do not need the flag.

## What it creates

- four private 2K, 16:9 image candidates from one controlled prompt;
- one optional 15-second, 720p image-to-video greeting from a selected local candidate;
- one optional 15-second, 720p text-to-video comparison;
- one optional local 15-second, 720p still-motion visual using only a deterministic, center-anchored camera push of at most 2%;
- lossless narration from a verified xAI **built-in** voice, plus transcript and WebVTT captions;
- an optional MP4 composed with the built-in narration replacing any model-generated audio;
- a structured `review.json` for Codex/GPT-led original-resolution review and human final approval.

Every campaign labels its subject as an **AI-generated historical interpretation**. The narration uses an xAI built-in voice and never clones, imitates, or claims to reproduce the historical figure's voice.

## Campaign manifests

The Marcus Aurelius campaign remains the default for backward compatibility:

```text
scripts/grok/manifests/morrowward-greeting.json
```

Pass `--manifest` to validate or generate a different, isolated campaign. The Benjamin Franklin campaign is:

```text
scripts/grok/manifests/morrowward-franklin-greeting.json
```

Each campaign owns four dedicated prompts, its quote/source metadata, disclosure wording, narration, output campaign ID, and review policy. Never mix a run directory, selected candidate, or review file between campaigns.

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

This validates the default campaign and prompt paths without making an API call. Validate another campaign explicitly:

```sh
npm run media:grok:check -- \
  --manifest scripts/grok/manifests/morrowward-franklin-greeting.json
```

## Generate and review

Generate four images:

```sh
npm run media:grok:images -- \
  --confirm-xai-upload \
  --manifest scripts/grok/manifests/morrowward-franklin-greeting.json
```

The command prints a new ignored run directory. Inspect all four files at original resolution, record hard-gate results and scores in that run’s `review.json`, and identify a provisional winner. Follow [REVIEW_RUBRIC.md](REVIEW_RUBRIC.md).

Animate the provisional winner:

```sh
npm run media:grok:video -- \
  --confirm-xai-upload \
  --manifest scripts/grok/manifests/morrowward-franklin-greeting.json \
  --mode image-to-video \
  --image .media-review/grok/<campaign-id>/<run>/<selected-candidate-filename> \
  --run .media-review/grok/<campaign-id>/<run>
```

Use the selected candidate's exact `filename` from `review.json`; the generated extension may be `.png`, `.jpg`, `.webp`, or `.gif`. Image-to-video fails closed unless `selection.selectedCandidateId` names that candidate, its `review.hardGatesPassed` value is `true`, the path stays inside that run's `images/` directory, and the file still matches its recorded SHA-256. This prevents an unrelated local image from being uploaded accidentally.

If generative animation adds facial, mouth, hand, or object motion that cannot
pass review, render the reviewed still locally instead:

```sh
npm run media:grok:still-motion -- \
  --manifest scripts/grok/manifests/morrowward-franklin-greeting.json \
  --run .media-review/grok/<campaign-id>/<run>
```

This command makes no network request and accepts no image, output, duration,
zoom, audio, or encoder override. It resolves the selected candidate from
`review.json`, verifies its hard gates, review scores, SHA-256, byte length,
dimensions, and campaign, then renders exactly 450 frames at 30 fps with
ffmpeg. The smooth center push starts at 100% and ends at 102%; the pictured
person, objects, and environment remain the same still pixels throughout. The
MP4 contains no audio. Its exact motion/filter/encoder specification, local
ffmpeg version, source-image provenance, output hash, bytes, and measured probe
are recorded in `review.json`. Review the result before composition just like
an xAI video.

Generate the text-to-video comparison only when useful:

```sh
npm run media:grok:video -- \
  --confirm-xai-upload \
  --manifest scripts/grok/manifests/morrowward-franklin-greeting.json \
  --mode text-to-video \
  --run .media-review/grok/<campaign-id>/<run>
```

Generate narration with a verified built-in voice and timestamped captions:

```sh
npm run media:grok:narration -- \
  --confirm-xai-upload \
  --manifest scripts/grok/manifests/morrowward-franklin-greeting.json \
  --run .media-review/grok/<campaign-id>/<run>
```

Compose a private MP4 after reviewing the raw visual and narration:

```sh
npm run media:grok:compose -- \
  --manifest scripts/grok/manifests/morrowward-franklin-greeting.json \
  --video .media-review/grok/<campaign-id>/<run>/videos/image-to-video.mp4 \
  --audio .media-review/grok/<campaign-id>/<run>/narration/narration.wav \
  --captions .media-review/grok/<campaign-id>/<run>/narration/narration.en.vtt \
  --run .media-review/grok/<campaign-id>/<run>
```

Composition requires `ffmpeg`. It discards any generated video audio, uses only the declared built-in narrator, and normalizes that narration to a spoken-word target of -16 LUFS with a -1.5 dBTP ceiling before padding the silent tail. The WebVTT file remains a sidecar so the application can expose real captions.

## Validation and data handling

- Image generation uses `b64_json`; the script verifies the provider MIME type against decoded magic bytes, validates dimensions, hashes each file, and preserves the matching extension.
- Paid generation commands complete output-path, collision, permission, and exclusive-lock preflight before reading the API key or calling xAI. Candidate files are staged privately and committed atomically; a partial failure removes the run instead of leaving publishable-looking output.
- Every custom `--run` or `--output` path must remain inside this repository's gitignored `.media-review/` directory; existing symbolic-link path components are rejected.
- JSON API responses are streamed behind a 60-second per-request timeout and a 100 MiB ceiling large enough for the four requested base64 2K images. Video generation starts asynchronously, cannot poll beyond its overall deadline, downloads only over HTTPS, validates MIME against magic bytes, checks a minimum size, and hashes the result.
- TTS first confirms that the configured voice appears in `GET /v1/tts/voices`. It requests WAV with character timestamps, validates that timings are monotonic, non-overlapping, and within the declared duration, and derives WebVTT captions from those timings.
- Review policy must exactly match the committed campaign manifest. Composition accepts only SHA-256-locked source video, narration, captions, and transcript; writes locked private temporary files; commits the MP4 and VTT together; and refuses to replace a human-approved composition.
- The local still-motion path holds an exclusive run lock, refuses output or metadata collisions, renders to a bounded pipe, atomically stages only validated MP4 bytes, and removes its final output if `review.json` changed during rendering or could not be updated. Composition rechecks the original selected still's hash and rejects audio or any drift from the exact 2% motion specification.
- API keys are never stored in output metadata. Provider request IDs and temporary URLs stay only inside the ignored review directory; downloaded video URLs are not retained.
- xAI pricing and model availability can change. Review the xAI console before generating a new batch.

## Historical wording and sources

Each manifest locks one short direct quotation to its transcript, named author, attribution, source credit, HTTPS source, and publication or translation year. The author must appear in the transcript or visible attribution. The Marcus campaign cites [Project Gutenberg’s public-domain George Long translation of *Meditations*](https://www.gutenberg.org/files/6920/6920-h/6920-h.htm) and retains its legacy exact-text field. The Franklin campaign cites [Founders Online’s *Poor Richard Improved, 1750*](https://founders.archives.gov/documents/Franklin/01-03-02-0176): its source metadata preserves the archival capitalization, comma, and line break separately from the normalized spoken quotation, with a required normalization note and an automated check that wording and word order did not change. All surrounding narration is original Morrowward copy. The interface must identify the audio as a separate built-in AI narrator rather than the historical figure's voice. If a campaign permits minor incidental facial motion, reviewers must confirm that it is natural, not synchronized to the narration, and never presented as authentic speech.

## Playback requirements

Approved media must require a user gesture and provide controls, a poster, transcript, and captions. Do not rely on audio to communicate meaning, and honor reduced-motion preferences with the poster fallback.

```html
<video controls preload="none" poster="/approved-poster.webp">
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
- [Founders Online, *Poor Richard Improved, 1750*](https://founders.archives.gov/documents/Franklin/01-03-02-0176)
