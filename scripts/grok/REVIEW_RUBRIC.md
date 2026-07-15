# Morrowward Grok media review rubric

Codex/GPT leads the first review, but no asset is selected or published until a human approves it. Review every image at original resolution and every video as a frame sequence with audio, captions, and transcript.

## Hard gates

Reject a candidate immediately when any structured hard gate in `manifests/morrowward-greeting.json` fails. In particular, reject extra or malformed anatomy, pseudo-text, surprise logos, facial warping, generated speech from the pictured figure, unplanned audio, financial promises, or missing disclosure metadata.

## Scoring

For passing candidates, score each manifest dimension from 1 to 5 and record concrete observations in the ignored run’s `review.json`. A selectable candidate must:

- pass every hard gate;
- score at least 24 of 30;
- work as a still poster when motion is disabled;
- remain understandable with audio muted;
- retain the exact disclosure, caption, transcript, public-domain source, and paraphrase label.

When candidates are close, prefer the simpler composition, clearer anatomy, calmer movement, and stronger connection to patient daily action. Do not reward a more dramatic Marcus Aurelius likeness; this is an interpretive educational visual, not impersonation or historical reconstruction.

## Required publication metadata

- Caption: use the manifest caption unchanged.
- Disclosure: use the historical-figure disclosure unchanged.
- Transcript and captions: publish both the plain transcript and the generated WebVTT sidecar.
- Voice: label the xAI voice as a built-in AI narrator. Never describe it as Marcus Aurelius speaking.
- Playback: provide controls and a poster. Never use autoplay. Under reduced motion, display the poster until the user explicitly starts playback.
