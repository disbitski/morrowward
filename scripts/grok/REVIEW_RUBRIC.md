# Morrowward Grok media review rubric

Codex/GPT leads the first review, but no asset is selected or published until a human approves it. Review every image at original resolution and every video as a frame sequence with audio, captions, and transcript.

## Hard gates

Reject a candidate immediately when any structured hard gate in the selected campaign manifest fails. Record the manifest used for the run and pass that same file with `--manifest` throughout validation and generation. In particular, reject extra or malformed anatomy, pseudo-text, surprise logos, facial warping, unplanned audio, financial promises, or missing disclosure metadata. A campaign may permit minor incidental facial motion only when it is not synchronized to narration, remains natural, and the application unmistakably identifies the separate built-in narrator.

## Scoring

For passing candidates, score each manifest dimension from 1 to 5, store their exact sum as `review.totalScore`, and record concrete observations in the ignored run’s `review.json`. A selectable candidate must:

- pass every hard gate;
- score at least 26 of 30, with no dimension below 4 of 5;
- work as a still poster when motion is disabled;
- remain understandable with audio muted;
- retain the exact disclosure, caption, transcript, public-domain source, and direct-quote attribution; the surrounding narration is original Morrowward copy.

When candidates are close, prefer the simpler composition, clearer anatomy, calmer movement, and stronger connection to patient daily action. Do not reward a more dramatic or photorealistic historical likeness; this is an interpretive educational visual, not impersonation or historical reconstruction.

## Deterministic still-motion review

Use the local still-motion workflow when generative video cannot preserve the
approved still. Confirm that the entire 15-second visual is the same selected
image with only a nearly imperceptible, smooth center push:

- no mouth, face, eye, hand, clothing, object, light, or background motion;
- no reframing jump, edge reveal, pulsing, or scale beyond the recorded 102%
  endpoint;
- exactly 1280×720, 15 seconds, 30 fps, 450 frames, and no audio stream;
- source still, motion specification, renderer, hash, byte length, and probe
  metadata remain intact in `review.json`.

The deterministic renderer removes generative motion risk, but its MP4 still
requires the normal video hard gates, scorecard, observations, and human final
approval before composition or publication.

## Required publication metadata

- Caption: use the manifest caption unchanged.
- Disclosure: use the historical-figure disclosure unchanged.
- On-player labels: keep the AI-interpretation badge and built-in narrator disclosure visible; render them in the application, never inside Grok-generated pixels.
- Quote: show the direct-quote attribution and source below the player so it does not compete with WebVTT captions.
- Transcript and captions: publish both the plain transcript and the generated WebVTT sidecar.
- Voice: label the xAI voice as a built-in AI narrator. Never describe it as the pictured historical figure speaking, even when the approved visual contains minor incidental mouth movement.
- Playback: provide controls and a poster. Never use autoplay. Under reduced motion, display the poster until the user explicitly starts playback.
