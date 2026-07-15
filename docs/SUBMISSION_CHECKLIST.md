# Submission checklist

## Project

- [x] Repository and preview deployments remain private through July 19, 2026.
- [ ] On July 20, make `disbitski/morrowward` and the production deployment public before recording/submitting.
- [ ] Production URL is public and unrestricted.
- [ ] `disbitski/morrowward` is public with its full history and MIT license.
- [ ] After the July 15 market milestone is committed, verify a clean clone passes setup, tests, and production build using only the README.
- [x] No credentials, personal portfolio data, or private reference folders appear in Git history.
- [x] Demo seed state works without network access or live market conditions.
- [x] API-offline and quote-offline fallbacks are verified.
- [x] Price refresh, eleven-asset allowlist, on-demand detail history, and synthetic/provider provenance are covered by tests.
- [ ] Leave Twelve Data disabled for the public demo unless appropriate external-display rights are confirmed; never set the attestation flag speculatively.
- [ ] iPhone-sized and macOS-sized PWA flows are verified.
- [x] `npm run test:e2e` passes its desktop Chrome and mobile Pixel 7 projects from a production build.

Earlier protected preview verified July 14: `https://morrowward-qui11xo7k-thedavedev.vercel.app`. Anonymous requests redirect to Vercel Authentication. Its health route reports GPT-5.6 configured, and its deployed GPT-5.6 educator response was verified. A fresh protected preview of the July 15 market milestone must be recorded below after deployment. The public production alias remains unassigned until July 20.

- [ ] July 15 milestone preview URL and verification evidence recorded.

Final README link: `https://morrowward.vercel.app`. Commit preview URLs are expected to change; do not substitute one of them for the stable production alias in Devpost or the README.

## Devpost

- [ ] Category: **Apps for Your Life**.
- [ ] Submitter type: **Individual**.
- [ ] Project description finalized.
- [ ] Repository URL added.
- [ ] Website URL added.
- [ ] Reconfirm `/feedback` in the primary Codex build task and add Session ID `019f62f7-1709-7e11-8e8f-70951e9a2f7f` to Devpost.
- [ ] Built-with list includes Codex, GPT-5.6, OpenAI Responses API, React, TypeScript, Dexie, Vercel, and—if selected generated media ships—the xAI image/video/TTS APIs.

## Video

- [ ] Public YouTube URL.
- [ ] Runtime is under three minutes.
- [ ] Audio explains what was built.
- [ ] Audio explicitly explains how Codex was used.
- [ ] Audio explicitly explains how GPT-5.6 was used.
- [ ] Product is shown working; no slides-only substitute.
- [ ] If historical-figure media appears, the visible AI-interpretation label, source attribution, captions/transcript, and user-controlled playback are shown or readily discoverable.

## Final verification

- [ ] Add the restricted `OPENAI_API_KEY` to Vercel **Production**, redeploy, verify `/api/v1/health` reports AI configured, and confirm the bounded educator returns a labeled GPT-5.6 response before public launch.
- [ ] Submit during the evening of July 20, 2026 ET.
- [ ] Confirm submission is complete before the official deadline: **July 21, 2026 at 8:00 PM ET**.
- [ ] Save the Devpost confirmation URL and screenshot.
- [ ] Recheck website, repository, and video access after submission.
