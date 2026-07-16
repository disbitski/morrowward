# Submission checklist

## Project

- [x] Repository and preview deployments remain private through July 19, 2026.
- [ ] On July 20, make `disbitski/morrowward` and the production deployment public before recording/submitting.
- [ ] Production URL is public and unrestricted.
- [ ] `disbitski/morrowward` is public with its full history and MIT license.
- [x] Commit `74f77ad` passes a clean-clone `npm install`, 122 tests, lint, Grok dry run, vinext production build, and Vercel/Next production build using the README workflow.
- [x] No credentials, personal portfolio data, or private reference folders appear in Git history.
- [x] Demo seed state works without network access or live market conditions.
- [x] API-offline and quote-offline fallbacks are verified.
- [x] Daily GPT-5.6 quote batching, required web search, strict per-asset source/schema/time rejection, eleven-asset allowlist, durable snapshot/lock behavior, self-healing first load, bounded observation-only rechecks, freshness, and synthetic fallback are covered by the July 15 passing local suite.
- [x] Education Center has four paths, 48 level-specific prompts, explicit topic payloads, deterministic follow-ups, source-tier labels, verified supplemental Grokipedia links, and no retired “may be offered later” copy.
- [ ] Production has one complete KV/Upstash REST credential pair so the daily quote snapshot and 12-hour distributed `NX` retry guard are shared across serverless instances.
- [ ] iPhone-sized and macOS-sized PWA flows are verified.
- [x] `npm run test:e2e` passes its desktop Chrome and mobile Pixel 7 projects from a production build.

## Apple companion shells

- [ ] Fresh `apple/` project contains shared SwiftUI/WebKit code for iOS and macOS targets.
- [ ] Debug origin is configurable for the local server; Release uses `https://morrowward.vercel.app`.
- [ ] No OpenAI key, Vercel token, protected-preview URL, or bypass credential appears in the project or built products.
- [ ] External educational links open in the system browser; Morrowward-origin navigation remains inside the shell.
- [ ] iPhone 17 Pro simulator build and launch pass.
- [ ] Unsigned local macOS build and launch pass.
- [ ] App icon, loading, offline/error, retry, privacy/about, keyboard, Reduce Motion, and VoiceOver smoke checks pass.
- [ ] Local plan/practice data survives complete app termination and relaunch.
- [ ] README documents XcodeGen, local-server testing, Release origin, simulator, unsigned Mac build, and optional physical-device signing.

Earlier protected preview verified July 14: `https://morrowward-qui11xo7k-thedavedev.vercel.app`. Anonymous requests redirect to Vercel Authentication. Its health route reports GPT-5.6 configured, and its deployed GPT-5.6 educator response was verified. The July 15 market-milestone preview is recorded below. The public production alias remains unassigned until July 20.

- [x] July 15 milestone protected preview verified: `https://morrowward-q0us50u15-thedavedev.vercel.app`. Anonymous access redirects to Vercel Authentication; authenticated checks report GPT-5.6 configured, safe quote sample fallback, limited synthetic SPCX history, and a successful bounded GPT-5.6 educator response.

Final README link: `https://morrowward.vercel.app`. Commit preview URLs are expected to change; do not substitute one of them for the stable production alias in Devpost or the README.

## Devpost

- [ ] Category: **Apps for Your Life**.
- [ ] Submitter type: **Individual**.
- [ ] Project description finalized.
- [ ] Repository URL added.
- [ ] Website URL added.
- [ ] Reconfirm `/feedback` in the primary Codex build task and add Session ID `019f62f7-1709-7e11-8e8f-70951e9a2f7f` to Devpost.
- [ ] Built-with list includes Codex, GPT-5.6, OpenAI Responses API web search, React, TypeScript, Dexie, Vercel Cron, Redis/KV-compatible storage, Vercel, and—if selected generated media ships—the xAI image/video/TTS APIs.

## Video

- [ ] Public YouTube URL.
- [ ] Runtime is under three minutes.
- [ ] Audio explains what was built.
- [ ] Audio explicitly explains how Codex was used.
- [ ] Audio explicitly explains how GPT-5.6 was used.
- [ ] Product is shown working; no slides-only substitute.
- [ ] Show the stable web app plus brief iPhone simulator and macOS companion-shell proof without implying a full native rewrite or App Store readiness.
- [ ] If historical-figure media appears, the visible AI-interpretation label, source attribution, captions/transcript, and user-controlled playback are shown or readily discoverable.

## Final verification

- [ ] Add the restricted `OPENAI_API_KEY` to Vercel **Production**, redeploy, verify `/api/v1/health` reports AI configured, and confirm the bounded educator returns a labeled GPT-5.6 response before public launch.
- [ ] Set a long random `CRON_SECRET` and one complete KV/Upstash REST credential pair in **Production**; keep all values server-only.
- [ ] Confirm both Production cron jobs are registered. Vercel cron is Production-only; do not expect either job to run in protected Preview deployments.
- [ ] Invoke `GET /api/v1/quotes/generate` once with the Production cron bearer, verify the shared eleven-symbol snapshot stores validated sourced values plus explicit per-symbol fallbacks, and confirm the UI says **Real Prices Updated Every 24 Hours** with **Last updated** and **Current as of _n_ hours ago**. Verify source/freshness details remain in each asset sheet. Do not call it real-time.
- [ ] Verify a missing/stale-snapshot first load starts one guarded background refresh, concurrent reads receive saved/synthetic content, the initiating UI's two observation-only rechecks can adopt the result without retriggering generation, UTC-day cron cadence does not skip the next day, and Redis/KV `NX` plus warm-runtime singleflight enforce the 12-hour failure backoff.
- [ ] Disable OpenAI temporarily and verify quote reads, synthetic detail paths, projections, practice purchases, educator fallback, and cached brief remain usable without a paid call.
- [ ] Record and publish the under-three-minute demo on July 18; use July 19 only as a buffer for recording or submission-blocking defects.
- [ ] Submit during the evening of July 20, 2026 ET.
- [ ] Confirm submission is complete before the official deadline: **July 21, 2026 at 8:00 PM ET**.
- [ ] Save the Devpost confirmation URL and screenshot.
- [ ] Recheck website, repository, and video access after submission.
