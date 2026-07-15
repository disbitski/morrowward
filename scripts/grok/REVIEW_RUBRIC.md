# Morrowward Grok media review rubric

Codex/GPT leads the first review, but no asset is selected or published until a human approves it. Review every image at original resolution and every video as a frame sequence with audio, captions, and transcript.

## Hard gates

Reject a candidate immediately when any structured hard gate in `manifests/morrowward-greeting.json` fails. In particular, reject extra or malformed anatomy, pseudo-text, surprise logos, facial warping, generated speech from the pictured figure, unplanned audio, financial promises, or missing disclosure metadata.

## Scoring

For passing candidates, score each manifest dimension from 1 to 5, store their exact sum as `review.totalScore`, and record concrete observations in the ignored run’s `review.json`. A selectable candidate must:

- pass every hard gate;
- score at least 26 of 30, with no dimension below 4 of 5;
- work as a still poster when motion is disabled;
- remain understandable with audio muted;
- retain the exact disclosure, caption, transcript, public-domain source, and direct-quote attribution; the surrounding narration is original Morrowward copy.

When candidates are close, prefer the simpler composition, clearer anatomy, calmer movement, and stronger connection to patient daily action. Do not reward a more dramatic Marcus Aurelius likeness; this is an interpretive educational visual, not impersonation or historical reconstruction.

## Required publication metadata

- Caption: use the manifest caption unchanged.
- Disclosure: use the historical-figure disclosure unchanged.
- On-player labels: keep the AI-interpretation badge and built-in narrator disclosure visible; render them in the application, never inside Grok-generated pixels.
- Quote: show the direct-quote attribution and source below the player so it does not compete with WebVTT captions.
- Transcript and captions: publish both the plain transcript and the generated WebVTT sidecar.
- Voice: label the xAI voice as a built-in AI narrator. Never describe it as Marcus Aurelius speaking.
- Playback: provide controls and a poster. Never use autoplay. Under reduced motion, display the poster until the user explicitly starts playback.
