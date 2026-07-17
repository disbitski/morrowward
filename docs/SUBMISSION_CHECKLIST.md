# Submission checklist

## Project

- [x] Repository and preview deployments remain private through July 19, 2026.
- [x] Production was intentionally moved to a stable public-but-unannounced URL on July 16 for web/Apple integration testing; search indexing remains disabled.
- [x] Build journal preserves the Preview-versus-Production tradeoff, sensitive-key promotion friction, stable Apple backend decision, and the explicit risk that bots could discover the public educator/chat route—prompting distributed limits and a daily AI spend circuit breaker—for the post-submission field note.
- [ ] On July 20, make `disbitski/morrowward` public and enable production search indexing before submission.
- [x] Production URL is public and unrestricted while remaining unannounced and excluded from indexing until July 20.
- [ ] `disbitski/morrowward` is public with its full history and MIT license.
- [x] Commit `74f77ad` passes a clean-clone `npm install`, 122 tests, lint, Grok dry run, vinext production build, and Vercel/Next production build using the README workflow.
- [x] No credentials, personal portfolio data, or private reference folders appear in Git history.
- [x] Demo seed state works without network access or live market conditions.
- [x] API-offline and quote-offline fallbacks are verified.
- [x] Daily GPT-5.6 quote batching, required web search, strict per-asset source/schema/time rejection, eleven-asset allowlist, durable snapshot/lock behavior, self-healing first load, bounded observation-only rechecks, freshness, and synthetic fallback are covered by the July 15 passing local suite.
- [x] Education Center has four paths, 48 level-specific prompts, explicit topic payloads, deterministic follow-ups, source-tier labels, verified supplemental Grokipedia links, and no retired “may be offered later” copy.
- [x] Marcus Aurelius and Benjamin Franklin welcomes have approved publication records binding exact video, captions, poster, transcript, primary quotation source, AI disclosures, generation provenance, and Dave's final approval; the app makes no xAI runtime call.
- [x] The two-entry greeting roster assigns one approved welcome randomly once per browser, preserves that local assignment, never autoplays, and offers user-controlled playback and replay from Our Why.
- [x] Creative video scope is frozen at the two approved welcomes after both random assignments were verified through complete-reset testing.
- [x] Today’s Morrowward horizon artwork is visible, responsive, theme-compatible, cached for offline use, and does not displace the deterministic projection or its disclosure.
- [x] Production has one complete KV/Upstash REST credential pair so the daily quote snapshot, 12-hour distributed `NX` retry guard, shared request limits, and educator circuit breaker work across serverless instances.
- [ ] iPhone-sized and macOS-sized PWA flows are verified.
- [x] `npm run test:e2e` passes its desktop Chrome and mobile Pixel 7 projects from a production build.

## Apple companion shells

- [x] About page uses the polished three-card companion layout for **Morrowward for iPhone**, **Morrowward for Mac**, and **Follow Dave online**.
- [x] The iPhone and Mac source cards link to their exact GitHub folders. They resolve now for repository-authorized collaborators and become publicly accessible at the same URLs when the repository is made public on July 20.
- [x] **Follow Dave online** links to `https://thedavedev.com`.
- [x] No App Store download badge or availability claim is used for companion builds distributed as source.
- [x] Fresh `apple/` project contains shared SwiftUI/WebKit code plus separate iPhone and Mac entry points.
- [x] Fresh generated app-icon assets, a reproducible icon generator, and branded loading/error/retry states exist in source.
- [x] Debug origin is allowlisted and configurable for the local server; Release is pinned to `https://morrowward.vercel.app`.
- [x] Final July 17 secret scan confirms no OpenAI key, Vercel token, protected-preview URL, or bypass credential appears in Apple source or built Apple products.
- [x] The tested source navigation policy keeps the exact Morrowward origin inside the shell, rejects lookalikes/downgrades/wrong ports, and implements system-browser handoff for user-activated external educational HTTP(S) links.
- [x] iPhone 17 Pro Simulator Release build and Production launch pass.
- [x] Ad-hoc signed macOS Release build and launch pass; strict signature verification and expected sandbox/network/user-selected-file entitlements pass.
- [x] Both built products contain their generated app-icon assets and privacy manifest; branded loading and error/retry states exist in shared source.
- [x] Local plan data survives complete app termination and relaunch in the 1/1 passing iPhone and 1/1 passing Mac Production UI journeys.
- [x] Native origin and backup-payload unit suite passes 7/7.
- [x] Actual iPhone and Mac runtime captures are saved under `docs/screenshots/` and embedded in the root README.
- [x] **Hackathon companion acceptance signed off July 17.** Dave accepted the finished end-user experience after using Production; Release build/launch, exact-origin policy, native unit coverage, and local-persistence journeys provide the intended lightweight-companion proof.
- **N/A — explicitly waived as additional hackathon gates, not represented as tested:** forced native offline/retry recovery; native export and import panels; external-link handoff; historical video playback; warmed offline reload; and keyboard, Reduce Motion, and VoiceOver smoke checks. These remain worthwhile post-hackathon validation for any distributed release, but they are not blockers for the honest source-distributed SwiftUI/WebKit companion scope Dave accepted.
- [x] Same-day demo setup complete: the verified iPhone Release build is installed and running in the booted iPhone 17 Pro Simulator; the verified ad-hoc signed Mac build is installed at `~/Applications/Morrowward.app` and running for Dave's hands-on use and recording.
- [x] Root and Apple READMEs document the shared architecture, XcodeGen, local-server testing, Release origin, Simulator, unsigned and ad-hoc signed Mac verification, and optional physical-device signing.

Earlier protected preview verified July 14: `https://morrowward-qui11xo7k-thedavedev.vercel.app`. Anonymous requests redirect to Vercel Authentication. Its health route reports GPT-5.6 configured, and its deployed GPT-5.6 educator response was verified. The July 15 market-milestone preview is recorded below. The stable production alias moved to public-but-unannounced integration testing on July 16; protected previews remain private.

- [x] July 15 milestone protected preview verified: `https://morrowward-q0us50u15-thedavedev.vercel.app`. Anonymous access redirects to Vercel Authentication; authenticated checks report GPT-5.6 configured, safe quote sample fallback, limited synthetic SPCX history, and a successful bounded GPT-5.6 educator response.

Final README link: `https://morrowward.vercel.app`. Commit preview URLs are expected to change; do not substitute one of them for the stable production alias in Devpost or the README.

## Devpost

- [ ] Category: **Apps for Your Life**.
- [ ] Submitter type: **Individual**.
- [ ] Project description finalized.
- [ ] Repository URL added.
- [ ] Website URL added.
- [ ] Reconfirm `/feedback` in the primary Codex build task and add Session ID `019f62f7-1709-7e11-8e8f-70951e9a2f7f` to Devpost.
- [ ] Built-with list includes Codex, GPT-5.6, OpenAI Responses API web search, React, TypeScript, Dexie, Vercel Cron, Redis/KV-compatible storage, Vercel, and the xAI image/video/TTS APIs used to create the approved static welcome assets.

## Video

- [ ] Public YouTube URL.
- [ ] Runtime is under three minutes.
- [ ] Audio explains what was built.
- [ ] Audio explicitly explains how Codex was used.
- [ ] Audio explicitly explains how GPT-5.6 was used.
- [ ] Product is shown working; no slides-only substitute.
- [ ] Show the stable web app plus brief iPhone simulator and macOS companion-shell proof without implying a full native rewrite or App Store readiness.
- [ ] If an approved historical welcome appears, show or make readily discoverable its AI-interpretation label, separate narrator disclosure, primary quote attribution, captions/transcript, and user-controlled playback; do not imply that the depicted figure is speaking.

## Final verification

- [x] Add the restricted `OPENAI_API_KEY` to Vercel **Production**, redeploy, verify `/api/v1/health` reports AI configured, and confirm the bounded educator returns a labeled GPT-5.6 response before public launch.
- [x] Set a long random `CRON_SECRET`, one complete KV/Upstash REST credential pair, and `EDUCATOR_DAILY_AI_REQUEST_LIMIT=100` in **Production**; keep all secret values server-only.
- [x] Confirm both Production cron jobs are registered. Vercel cron is Production-only; do not expect either job to run in protected Preview deployments.
- [x] Invoke the protected briefing job once, allow its full 150-second function window, and verify Today shows exactly **Market & sentiment**, **Frontier assets**, and **$100K learning lens & Fed watch** with safe source links and the last-successful-update time. Open **Why $100K?** and verify its milestone caveat, illustrative math, and three safe education links. Confirm there is no refresh control, the scenario is fixed/public rather than a user's portfolio, a second same-day invocation is idempotent, and a failed run retains the last valid edition or serves the evergreen no-current-claims fallback.
- [ ] Invoke `GET /api/v1/quotes/generate` once with the Production cron bearer, verify the shared eleven-symbol snapshot stores validated sourced values plus explicit per-symbol fallbacks, and confirm the UI says **Real Prices Updated Every 24 Hours** with **Last updated** and **Current as of _n_ hours ago**. Verify source/freshness details remain in each asset sheet. Do not call it real-time.
- [ ] Verify a missing/stale-snapshot first load starts one guarded background refresh, concurrent reads receive saved/synthetic content, the initiating UI's two observation-only rechecks can adopt the result without retriggering generation, UTC-day cron cadence does not skip the next day, and Redis/KV `NX` plus warm-runtime singleflight enforce the 12-hour failure backoff.
- [ ] Disable OpenAI temporarily and verify quote reads, synthetic detail paths, projections, practice purchases, educator fallback, and the last-valid/evergreen briefing remain usable without a paid call.
- [ ] Record and publish the under-three-minute demo on July 18; use July 19 only as a buffer for recording or submission-blocking defects.
- [ ] Submit during the evening of July 20, 2026 ET.
- [ ] Confirm submission is complete before the official deadline: **July 21, 2026 at 8:00 PM ET**.
- [ ] Save the Devpost confirmation URL and screenshot.
- [ ] Recheck website, repository, and video access after submission.
