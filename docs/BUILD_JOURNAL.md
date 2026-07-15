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

Latest protected preview: `https://morrowward-kf3ev2lpj-thedavedev.vercel.app`

## July 15 — Foundation and core experience

Planned milestone: themes, onboarding, projection engine, Horizon Reveal, local state, dashboard, disclosures, tests, and first protected preview.

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
