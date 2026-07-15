# Morrowward build journal

This journal records what Dave and Codex built, the decisions behind it, and where AI accelerated the work. It is intentionally part of the repository so judges can follow the project from an empty workspace to the submitted release.

## July 14, 2026 — Day 0: mission, constraints, and architecture

### The human problem

Morrowward started with a belief: financial literacy can give people hope and agency long before they have wealth. Dave grew up with very little, was diagnosed with Type 1 diabetes at age ten, and learned early that his future would require preparation. At that same age, money saved from a paper route bought a Commodore 64. Writing BASIC programs became the first of many small steps that changed the direction of his life.

The product therefore focuses on a repeatable weekly habit and a future someone can see—not market hype, predictions, or a promise of returns.

### Decisions locked with Codex

- Build a web MVP and installable PWA; make native iOS and macOS apps roadmap items.
- Serve adults 18+ and begin with a plain-language experience that can reveal advanced depth.
- Keep plans, balances, and simulated holdings on the device with no account required.
- Make all financial math deterministic and testable; use GPT-5.6 only for bounded education.
- Use editable 3%, 6%, and 9% illustrative return scenarios with 3% inflation—not “expected returns.”
- Simulate fractional practice purchases of VTI, BND, AAPL, TSLA, BTC, and ETH.
- Label every quote and purchase as educational or simulated.
- Keep the repository private during the build, then publish its complete history for judging.

### How Codex accelerated the day

- Audited patterns from earlier local-first dashboards and tools without copying credentials or personal holdings.
- Compared product, safety, persistence, API, deployment, and judging constraints in parallel.
- Converted the product vision into deterministic interfaces, acceptance tests, and a compressed release schedule.
- Verified the current GPT-5.6 Responses API and structured-output approach against official OpenAI documentation.
- Started implementation across the finance engine, UI, and server safety layer in parallel while maintaining one integrated architecture.

### Working software reached ahead of schedule

- Implemented the projection engine with cents/basis-points boundaries and property-based invariants.
- Implemented versioned IndexedDB state, validated migration, export/import, reset, and an in-memory fallback.
- Implemented precise simulated deposits and fractional buys across the six-asset practice universe.
- Implemented all five API routes, GPT-5.6 strict structured output, bounded context, prompt-injection rejection, and deterministic fallbacks.
- Built the complete responsive interface, PWA shell, three themes, and mission section using Dave’s authentic age-ten Commodore 64 photograph.
- Created a bespoke Morrowward social card and code-rendered install icons after the visual direction stabilized.
- Established passing domain, property, persistence, API, and AI-safety coverage before final UI integration and browser QA.

### Ahead-of-schedule feature-complete milestone

- Recorded the feature-complete root commit as `f7f645f` and pushed it to the private `disbitski/morrowward` repository.
- Reconstructed the staged repository in a clean temporary directory, ran a fresh `npm ci`, and passed lint, all 71 deterministic tests, and the vinext production build without relying on untracked workspace files.
- Passed four Playwright journeys across desktop Chrome and a Pixel 7 viewport, covering the full golden path, keyboard navigation, export/import/reset, serious/critical WCAG checks, service-worker control, and offline reload.
- Passed the Next.js/Vercel production build, four rendered-worker checks, and a production dependency audit with zero known production vulnerabilities.
- Deployed the exact committed archive to a Vercel **Preview** environment and verified Vercel Authentication on both its generated URL and branch alias. Anonymous requests redirect to login, while authenticated checks return the expected application shell and `/api/v1/health` response.
- Removed the first-deployment production alias and its deployment after Vercel assigned it unexpectedly. `morrowward.vercel.app` now returns `DEPLOYMENT_NOT_FOUND`; only protected preview deployments remain.
- Connected a dedicated, restricted OpenAI project key to the Vercel Preview environment as an unreadable sensitive variable. The key can call only the Responses API; it is not available to the browser or Production environment.
- Verified the live educator end to end: health reported GPT-5.6 configured, a bounded request returned `mode: ai` with `model: gpt-5.6`, and the public preview URL continued to redirect anonymous visitors to Vercel Authentication.
- Used the first live requests to find a real reliability boundary: a longer structured response safely fell back when it crossed the original 12-second timeout. Codex increased the bounded timeout to 25 seconds, added metadata-only fallback diagnostics that never log prompts, numeric context, headers, or credentials, and verified the same complex request completed with GPT-5.6 in 21.9 seconds.

Latest protected preview: `https://morrowward-qui11xo7k-thedavedev.vercel.app`

### Hands-on feedback turned a starter portfolio into Market Journey

The first real product session exposed an important gap: Practice mode taught the mechanics of adding simulated cash and making a fractional purchase, but it stopped at the starter portfolio. It did not yet show what a weekly habit could feel like through years of uneven markets. Dave brought a lesson learned over decades of investing: long-term participation can matter because a small number of unusually strong trading days may have an outsized effect, yet those days cannot be known in advance.

Codex converted that feedback into a bounded, deterministic Market Journey lab:

- Added 1-, 5-, 10-, and 20-year synthetic journeys with 3%, 6%, and 9% editable long-term drift assumptions.
- Separated the return assumption from market bumpiness so greater volatility does not automatically earn a better destination; sequence can still change the realized result.
- Added full-cycle, late-decline, and strong-recovery sequences; the late-decline path can end without regaining its prior peak.
- Modeled five simulated trading days per week and 52 end-of-week contributions per year, then exposed weekly chart points for a responsive interface.
- Kept market-path CAGR distinct from an XIRR-style, cash-flow-aware annualized result.
- Measured maximum drawdown at visible weekly checkpoints on the unitized synthetic market path so new deposits cannot disguise a decline.
- Compared the same path with all simulated days included versus its strongest five and ten days removed after the fact. The interface labels this as a counterfactual sequence lesson, not timing advice.
- Added explicit statements that regular contributions do not guarantee profit, time does not remove risk, and recovery may not occur during the selected horizon.

The same feedback pass added a fourth **Space** theme, adapted from the prior Space dashboard without its branding: deep black space, white star glow, rocket-fire orange, warm planetary light, and restrained gradients. The persisted theme, onboarding preview, browser chrome color, charts, responsive layouts, and reduced-motion behavior all use the same accessible token system.

This is the collaboration loop the project was meant to support: build a complete idea, use it, notice what the lesson still cannot teach, and turn lived experience into a safer, testable interaction.

The hardening pass finished with 91 deterministic unit/integration tests, lint, TypeScript, both production builds, and rendered-worker checks passing. Four Playwright journeys passed across desktop Chrome and a Pixel 7 viewport. The browser suite exercises the Market Journey controls and unrecovered late-decline state, runs serious/critical accessibility checks on the Practice page in all four themes, and re-verifies offline reload. That broader theme matrix found two pre-existing near-threshold Dawn contrast values plus an invalid definition-list structure in the new metrics; both were corrected before the final screenshots were captured.

The Market Journey and Space work landed in milestone commit `f744de5`. A live protected-preview evaluation then found a subtler product-contract issue: GPT-5.6 explained market timing safely, but its suggested experiment mentioned historical data and removing weak days—controls Morrowward does not provide. Codex tightened the educator instructions, deterministically aligned market-timing next steps to the actual synthetic all-days versus strongest-days lab, and added a regression test in commit `7da9fd1`. The corrected preview returned `mode: ai` with `model: gpt-5.6` and the exact supported experiment. Anonymous access still redirects to Vercel Authentication, `/api/v1/health` reports the expected local-first configuration, and `morrowward.vercel.app` remains unassigned.

## July 15 — Foundation and core experience

Planned milestone: themes, onboarding, projection engine, Horizon Reveal, local state, dashboard, disclosures, tests, and first protected preview.

### Hands-on feedback expanded Practice into an explainable market sandbox

Dave's next product session produced four concrete questions: can the final URL stay stable, can Practice refresh recent prices, can the universe include five additional public companies, and can every asset explain what it is, its historical context, category, and risk? He also proposed optional motivational media made by a specialized Grok workflow while Codex remained the coordinating system.

Codex split the pass into bounded market-contract, UI, media-pipeline, and integration/review workstreams, then consolidated them in the primary GPT-5.6 Sol session. The implementation:

- Expanded Practice from six to eleven assets: VTI, BND, AAPL, TSLA, SPCX, NVDA, MRVL, MU, AVGO, BTC, and ETH.
- Verified SPCX against SpaceX's June 2026 investor-relations release and SEC filing, recorded the June 12 public-trading start, and added a symbol-identity guard because an unrelated ETF previously used SPCX before changing to SPCK.
- Migrated saved data from schema v1 to v2 while preserving every existing cash balance, holding, and transaction and adding the five new holdings at zero.
- Added a refreshable educational-price panel whose UI shows source, observation time, freshness, change basis, methodology, and per-symbol fallback status; the validated API also carries the declared market-data mode.
- Added keyboard-accessible asset-detail dialogs with focus return, plain-language identity/category/risk context, on-demand bounded one-year charts, source links, and limited-history labels.
- Kept the provider optional. The server calls Twelve Data only when a key, licensed `live`/`delayed` mode, and explicit public-display-rights attestation are all present. A key alone is insufficient. The public demo therefore remains useful with deterministic synthetic values.
- Made synthetic history visually and semantically explicit: its heading says **synthetic sample path**, the 1-year change says **Sample 1Y**, and the disclosure says it is not actual historical performance.

The first desktop/mobile browser run found a near-threshold Dawn contrast defect in the selected-asset button. Codex changed the semantic foreground token and reran the complete four-theme accessibility matrix; all four desktop/mobile Playwright journeys then passed, including refresh, all eleven asset cards, SPCX details, the synthetic-history disclosure, fractional purchase, offline reload, and automated serious/critical WCAG checks.

### Fresh specialist-media pipeline, with an explicit consent stop

The Grok workflow was implemented from scratch inside `scripts/grok/`; no earlier script, prompt file, or asset was copied. It validates a campaign, requests four 2K candidates, polls image-to-video or text-to-video jobs, creates narration with a built-in synthetic voice, writes WebVTT captions, composes with ffmpeg, validates MIME signatures and transcript drift, hashes outputs, and keeps raw candidates in ignored `.media-review/` storage.

Codex added a deliberate `--confirm-xai-upload` gate because running the scripts sends Morrowward prompts/narration—and later a selected generated still—to the third-party xAI API. No media request was made before Dave's explicit informed approval. The proposed Marcus Aurelius greeting is labeled an AI-generated historical interpretation, uses no cloned voice, does not autoplay, and attributes its short quotation to the public-domain George Long translation of *Meditations* 5.1.

### Stable deployment decision

Vercel's changing commit preview URLs are expected: each identifies an immutable deployment. Morrowward will publish the stable production alias `https://morrowward.vercel.app` on July 20 and use that address in the README and Devpost. Future production deployments can change behind the same public URL; protected previews remain private during the build.

This pass reached 122 deterministic unit/integration tests, clean ESLint and TypeScript checks, both production builds, and six passing Playwright journeys across desktop Chrome and Pixel 7. The browser suite now covers refresh and history failures, Escape/backdrop closing, and trigger-focus restoration in addition to the golden path and offline/accessibility matrix. A sandbox-only Turbopack port restriction was rerun in the approved local build environment and compiled successfully; it was not a product-code failure.

Milestone commit `74f77ad` was pushed to the private `main` history and cloned from GitHub into an empty temporary directory. Following the README workflow, that clone completed `npm install`, all 122 unit/integration tests, lint, the no-spend Grok campaign check, the vinext production build, and the Vercel/Next production build. Vercel then built protected preview `https://morrowward-q0us50u15-thedavedev.vercel.app` from the milestone. Anonymous HTTP receives the expected authentication redirect; authenticated verification confirmed GPT-5.6 is configured, external market data remains deliberately disabled, SPCX returns an explicitly limited synthetic sample history, and the bounded educator returns a labeled GPT-5.6 response. The stable public production alias remains intentionally unassigned until July 20.

## July 16 — Practice, education, and AI

Planned milestone: weekly simulation, practice portfolio, Education Center, GPT-5.6 educator, daily brief, provenance, and AI safety tests.

## July 17 — Feature-complete release candidate

Planned milestone: data portability, offline behavior, accessibility, security review, documentation, demo seed state, and production rehearsal.

## July 18 — Hands-on evaluation

Reserved for evidence-based adjustments from real desktop and mobile use.

## July 19 — Code freeze

Reserved for final QA, clean-room setup verification, security checks, release commit, and tag.

## July 20 — Publish and submit

Reserved for public repository access, public production deployment, the under-three-minute YouTube demo, and Devpost submission.
