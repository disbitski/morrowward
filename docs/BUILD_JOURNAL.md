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
- Make all financial math deterministic and testable; use GPT-5.6 only for bounded education or source-backed public-data retrieval, never projection math or recommendations.
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

Latest protected preview: `https://morrowward-n2yjetgif-thedavedev.vercel.app`

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

Dave's next product session produced four concrete questions: can the final URL stay stable, can Practice show current daily prices, can the universe include five additional public companies, and can every asset explain what it is, its historical context, category, and risk? He also proposed optional motivational media made by a specialized Grok workflow while Codex remained the coordinating system.

Codex split the pass into bounded market-contract, UI, media-pipeline, and integration/review workstreams, then consolidated them in the primary GPT-5.6 Sol session. The implementation:

- Expanded Practice from six to eleven assets: VTI, BND, AAPL, TSLA, SPCX, NVDA, MRVL, MU, AVGO, BTC, and ETH.
- Verified SPCX against SpaceX's June 2026 investor-relations release and SEC filing, recorded the June 12 public-trading start, and added a symbol-identity guard because an unrelated ETF previously used SPCX before changing to SPCK.
- Migrated saved data from schema v1 to v2 while preserving every existing cash balance, holding, and transaction and adding the five new holdings at zero.
- Added an educational-price panel whose UI contract shows source, observation time, freshness, change basis, methodology, and per-symbol fallback status.
- Added keyboard-accessible asset-detail dialogs with focus return, plain-language identity/category/risk context, on-demand bounded one-year charts, source links, and limited-history labels.
- Kept current-data retrieval optional. The public demo remains useful with deterministic synthetic values whenever the server-side OpenAI path, source validation, or network is unavailable.
- Made synthetic history visually and semantically explicit: its heading says **synthetic sample path**, the 1-year change says **Sample 1Y**, and the disclosure says it is not actual historical performance.

The first desktop/mobile browser run found a near-threshold Dawn contrast defect in the selected-asset button. Codex changed the semantic foreground token and reran the complete four-theme accessibility matrix; all four desktop/mobile Playwright journeys then passed, including the quote panel, all eleven asset cards, SPCX details, the synthetic-history disclosure, fractional purchase, offline reload, and automated serious/critical WCAG checks.

### Fresh specialist-media pipeline, with an explicit consent stop

The Grok workflow was implemented from scratch inside `scripts/grok/`; no earlier script, prompt file, or asset was copied. It validates a campaign, requests four 2K candidates, polls image-to-video or text-to-video jobs, creates narration with a built-in synthetic voice, writes WebVTT captions, composes with ffmpeg, validates MIME signatures and transcript drift, hashes outputs, and keeps raw candidates in ignored `.media-review/` storage.

Codex added a deliberate `--confirm-xai-upload` gate because running the scripts sends Morrowward prompts/narration—and later a selected generated still—to the third-party xAI API. No media request was made before Dave's explicit informed approval. The proposed Marcus Aurelius greeting is labeled an AI-generated historical interpretation, uses no cloned voice, does not autoplay, and attributes its short quotation to the public-domain George Long translation of *Meditations* 5.1.

### Stable deployment decision

Vercel's changing commit preview URLs are expected: each identifies an immutable deployment. Morrowward will publish the stable production alias `https://morrowward.vercel.app` on July 20 and use that address in the README and Devpost. Future production deployments can change behind the same public URL; protected previews remain private during the build.

This pass reached 122 deterministic unit/integration tests, clean ESLint and TypeScript checks, both production builds, and six passing Playwright journeys across desktop Chrome and Pixel 7. The browser suite now covers quote and history failures, Escape/backdrop closing, and trigger-focus restoration in addition to the golden path and offline/accessibility matrix. A sandbox-only Turbopack port restriction was rerun in the approved local build environment and compiled successfully; it was not a product-code failure.

Milestone commit `74f77ad` was pushed to the private `main` history and cloned from GitHub into an empty temporary directory. Following the README workflow, that clone completed `npm install`, all 122 unit/integration tests, lint, the no-spend Grok campaign check, the vinext production build, and the Vercel/Next production build. Vercel then built protected preview `https://morrowward-q0us50u15-thedavedev.vercel.app` from the milestone. Anonymous HTTP receives the expected authentication redirect; authenticated verification confirmed GPT-5.6 is configured, the quote endpoint safely returns sample data, SPCX returns an explicitly limited synthetic sample history, and the bounded educator returns a labeled GPT-5.6 response. The stable public production alias remains intentionally unassigned until July 20.

### Current market quotes became one daily GPT-5.6 snapshot

Dave rejected a button that would create repeated upstream calls. The settled experience is **current market quotes via GPT-5.6 web search, refreshed daily**. The UI updates automatically and says **Updated daily from current market sources**, never “real-time.” This turns a variable per-visitor feature into one shared educational snapshot with a visible last-successful-update time, source/citations when available, and explicit freshness.

Codex verified the design against OpenAI's primary [Responses API web-search guide](https://developers.openai.com/api/docs/guides/tools-web-search) and [API pricing](https://developers.openai.com/api/docs/pricing), then split quote retrieval, UI, scheduling, test, and documentation work across bounded agents. The implementation contract is:

- one server-side GPT-5.6 Responses request for all eleven allowlisted assets;
- required hosted `web_search`, `reasoning: { effort: "low" }`, `store: false`, strict structured output, returned source metadata, and at most one search tool call;
- rejection of memory-only, malformed, or unsourced output, with no invented URL for a hosted source that does not expose one;
- no plan, balance, holding, transaction, question, identity, or medical context in the quote request;
- a protected `GET`/`POST /api/v1/quotes/generate` route, with the Production cron scheduled at 22:15 UTC after the regular U.S. equity session;
- one shared schema-validated Redis/KV snapshot with a 48-hour expiry; and
- deterministic synthetic values and paths whenever search, validation, storage, or the network fails.

Cron is the primary refresh mechanism. Because Vercel cron delivery is Production-only and best effort, the normal quote GET also has a non-blocking self-healing path: if the daily snapshot is missing or stale, the first request may start the same batch while returning saved or synthetic content immediately. A warm-runtime singleflight collapses local concurrency; a 12-hour Redis/KV `NX` retry guard coordinates across serverless instances. A successful snapshot is reused while it is no more than 24 hours old, while persistent failures retry no more frequently than every 12 hours. This avoids turning a traffic spike into repeated spend and keeps a missed cron from leaving the demo permanently stale. Protected Preview deployments do not run Vercel cron jobs, per Vercel's [Cron Jobs quickstart](https://vercel.com/docs/cron-jobs/quickstart); the Production behavior must still be smoke-tested after launch configuration.

An independent adversarial review then tightened the implementation before release: URL evidence is associated with the individual quote object it annotates, crypto and equity observations have separate recency bounds, durable lock/write outages cannot masquerade as a successful persisted refresh, and store misses/outages are negatively cached for bounded intervals. The scheduled route uses UTC-calendar-day freshness so a job finishing seconds after one run cannot make the next day's run look “under 24 hours” and skip every other day. The initiating Practice screen makes two observation-only rechecks so a finished background snapshot can appear without a manual reload; those reads cannot launch another generation. In the same feedback pass, the ambiguous header badge reading **Local & private** was removed while all four theme controls remained intact; privacy status stays explicit in onboarding, Settings, disclosures, and the local-data boundary.

At the documented build-time rate, the web-search tool costs $10 per 1,000 calls ($0.01 per call) plus GPT-5.6 model and search-content tokens. Normal operation makes the expected search-tool portion roughly one cent per successful daily snapshot; the 12-hour failure backoff bounds repeated search-tool attempts to roughly two cents per day before tokens during a persistent outage. This is not described as a hard cap because API pricing and usage reporting can change.

Final local verification for this pass reached **136 passing unit/integration tests across 12 files**, clean ESLint and TypeScript checks, a clean vinext production build, a clean Next/Vercel production build, four rendered-worker checks, and all six Playwright journeys across desktop and mobile Chrome. The browser suite confirms the removed header badge stays absent, the theme controls remain available, the automatic Practice snapshot experience has no manual refresh button, all four themes have no serious/critical automated accessibility violations, and the PWA still reloads offline. A Production environment smoke test remains intentionally pending until the server-only key, cron secret, and shared KV/Upstash pair are configured there.

### Codex-led specialist media became an approved welcome

After Dave explicitly approved the third-party xAI uploads, Codex used only the scripts, manifests, prompts, and review gates written fresh inside this repository during the hackathon. Earlier dashboard assets and media-generation code were not copied. The Space/Horizon palette and the team's prior creative lessons informed the direction, while Git records the new implementation and decisions in the hackathon window.

The first controlled run:

- generated four new 2816×1584 Marcus Aurelius-inspired stills with `grok-imagine-image-quality`;
- inspected every image at original resolution and rejected two for subtle hand-geometry defects;
- selected the strongest still through a recorded 29/30 Codex review while retaining human approval as a required final gate;
- animated only the selected SHA-256-locked image with `grok-imagine-video-1.5` at 15 seconds and 720p;
- reviewed a 30-frame motion sheet plus six full-resolution checkpoints for mouth, face, hand, architecture, line, and flicker stability;
- generated a separate built-in xAI narrator track and timestamped WebVTT captions, never a Marcus Aurelius voice clone or impersonation;
- discarded all provider-video audio, normalized the declared narrator to a spoken-word target, and recomposed locally with ffmpeg; and
- re-probed the final bytes as 1280×720, 15.041667 seconds, with a 9.634853-second narration and 5.406814 seconds of tail headroom.

The exact short quotation—“I am rising to the work of a human being.”—was verified in the public-domain George Long translation of *Meditations* 5.1. Dave played the complete composition and approved it at `2026-07-15T19:52:58Z` with “Looks great bro!” The approved bytes are now integrated behind an explicit play button; nothing autoplays. The player keeps a visible **AI-generated historical interpretation** badge, identifies the built-in voice as AI narration rather than Marcus Aurelius, and includes English captions, the exact transcript, primary quote source, controls, and a reduced-motion poster experience.

The first-run experience now appears as a one-time celebratory overlay after the Horizon Reveal: **Congratulations—you started your journey. Every future begins with one small step.** When the video ends, Morrowward brings **Practice your first $10 week** into view, with the dashboard as the secondary path. Escape, close, skip, focus trapping, keyboard navigation, mobile sizing, and complete reset are covered. Our Why keeps a permanent replay card. A versioned roster selects one approved greeting once and preserves that assignment. At this July 15 milestone Marcus was intentionally the only live entry; the roster would expand only after another figure passed the same review and human-approval gates.

A committed sanitized publication record binds the shipped MP4 (`4a254a…`), WebVTT (`b2e5b4…`), poster (`1d980a…`), and publication metadata (`9828fb…`) to the transcript, quotation source, disclosures, generation models, and human approval. Raw provider responses, request identifiers, rejected candidates, and private review paths remain ignored. The web app has no xAI runtime dependency. Its service worker treats this media as optional, cannot let a media warmup delay core installation, versions the isolated cache by every publication hash, preserves valid network range responses, and can synthesize offline MP4 byte ranges from the approved cached file.

Independent adversarial review substantially hardened the fresh pipeline before publication. Campaign review rules must exactly match the committed manifest; malformed or weakened gates fail closed. JSON responses have abort deadlines and streamed size limits. Paid commands validate output viability and hold private exclusive locks before reading the API key. Image, video, narration, and composition outputs use private temporary files, atomic commits, and rollback cleanup. Every composition source is path-, size-, and SHA-256-locked, generated-video audio is discarded, and an approved composition cannot be overwritten silently. Caption generation now retains closing quotation marks with the sentence they belong to.

Final verification for this media pass reached **199 passing unit/integration tests**, clean ESLint and TypeScript checks, clean vinext and Next/Vercel production builds, rendered-worker validation, and the full desktop/mobile Playwright suite. This is a concrete example of GPT-5.6/Codex coordinating specialist models for their strongest media jobs, independently reviewing their output, hardening the orchestration code, and preserving a human final decision.

### Hands-on use connected the practice balance to the future journey

Dave's next real session found two pieces of technically correct UI that still exposed implementation language instead of answering a user's natural questions. The quote header described mixed fallback mechanics, while Market Journey always used the Horizon starting amount even after someone had built a simulated portfolio.

The refinement keeps those mechanics auditable in code and documentation while simplifying the experience:

- After a sourced refresh, the quote header says **Real Prices Updated Every 24 Hours**, gives the exact **Last updated** timestamp, and calculates **Current as of _n_ hours ago** in the browser. Per-asset sheets retain the more detailed source, observation time, freshness, and synthetic-history disclosures.
- The relative age clamps future clock skew to zero, handles singular and plural hours, and updates while the page remains open.
- Market Journey replaces its passive top-right badge with two accessible, mutually exclusive balance cards: **Use Sample Data** with the Horizon starting amount and **Use My Practice Portfolio** with simulated cash plus marked-to-price holdings.
- A positive Practice balance becomes the automatic initial choice. A zero balance defaults to Sample Data, and a user's explicit Sample selection remains stable through later quote changes.
- The selected amount is only the opening dollar value for the existing deterministic synthetic index. Practice allocation, individual asset history, and predicted asset performance never enter the model or leave the device.
- The portfolio input is bounded to the Market Journey engine's existing $1 billion educational limit so even an extreme valid import cannot crash the lab.

This was another direct build–use–refine loop: current prices answer “when was this refreshed?” and the journey now answers “what could my practice habit look like from where I am today?” without weakening any simulation or advice boundary.

The refinement closed with **201 passing unit/integration tests**, clean ESLint and TypeScript checks, clean vinext and Next/Vercel production builds, four rendered-worker checks, and all ten Playwright journeys across desktop and mobile Chrome. The browser suite verifies the sourced refresh timestamp and calculated age, automatic funded-portfolio selection, both balance toggles, exact starting-balance changes, no horizontal overflow, all four themes, serious/critical accessibility checks, and offline reload.

## July 16 — Practice, education, and AI

Planned milestone: weekly simulation, practice portfolio, Education Center, GPT-5.6 educator, daily brief, provenance, and AI safety tests.

### Education Center expansion and creative polish

The hands-on pass turned Learn from a compact question surface into a more complete financial-literacy center while preserving the bounded educator and non-advice contract:

- Expand the guided question library across compounding, dollar-cost averaging, diversification, ETFs, inflation, volatility, drawdowns, bear markets, CAGR versus personal return, stocks, crypto, options, market timing, and common terminology.
- Tailor prompt sets and explanation depth for **New**, **Familiar**, and **Advanced** experience levels.
- Organize content into approachable learning paths such as **Start Here**, **Build the Habit**, **Understand Risk**, and **Go Deeper**.
- Offer relevant follow-up questions after each explanation so a learner always has a clear next step.
- Expand canonical links using verified primary and authoritative sources such as Investor.gov, FINRA, the Federal Reserve, IRS materials, and official fund or issuer education pages.
- Add verified Grokipedia pages as clearly labeled **Supplemental reading** beside the relevant topics. Remove the separate Grokipedia-specific disclaimer while retaining Morrowward's central educational/non-advice disclosure and transparent source labels.
- Add a small number of purposeful, freshly generated educational or motivational visuals that strengthen comprehension and fit the established four-theme design system.
- Produce and review up to two additional 15-second historical greetings, then activate roster rotation only after each asset passes quote verification, media review, accessibility checks, and Dave's explicit approval.
- Re-evaluate the complete onboarding → Practice → Market Journey → Learn flow on desktop and mobile, then make evidence-based spacing, copy, navigation, and interaction refinements.

Acceptance for this pass includes verified non-broken links, keyboard and screen-reader access, responsive layouts, useful deterministic/offline education, experience-appropriate prompt coverage, and continued rejection of personalized buy/sell instructions, guarantees, urgency, and prompt-injection attempts.

The completed implementation:

- Adds four stable learning paths: **Start Here**, **Build the Habit**, **Understand Risk**, and **Go Deeper**.
- Provides 48 unique guided questions across New, Familiar, and Advanced modes, each mapped to one bounded educator topic.
- Sends that topic explicitly with guided questions and infers it locally for freeform questions; neither path adds balances, holdings, transactions, identity, or medical context.
- Renders the educator's structured title, key ideas, assumptions, disclosure, and safe simulator activity instead of flattening the response into one paragraph.
- Adds deterministic related-question chips that fill and focus the question field without automatically creating another API call.
- Expands the library to 14 topic cards with visible source tiers: **Primary resource**, **Authoritative education**, **Industry research**, and **Supplemental reading · Grokipedia**.
- Verifies direct Grokipedia article routes and removes the old “may be offered later” note. Supplemental links always appear beside a primary or authoritative resource; no external article content is scraped into Morrowward.
- Makes the four-path selector a compact horizontal exploration row on small screens so the educator remains close to the page opening.
- Fixes the onboarding theme-step heading, removes remaining fallback implementation language from the Practice introduction, adds direct Practice shortcuts, keeps Our Why in the five-item mobile navigation, and adds outside-click plus focus containment to the mobile drawer.
- Replaces the hard-coded welcome CTA amount with **Practice this week's step**, shortens Market Journey's opening explanation, and makes screenshot capture dismiss the one-time welcome reliably.

The visual review produced new desktop and mobile Education Center captures, refreshed every existing product screenshot from the current build, and confirmed the Space theme keeps its contrast and hierarchy at both sizes.

Verification closed with **206 passing unit/integration tests across 21 files**, clean ESLint and TypeScript checks, clean vinext and Next/Vercel production builds, four rendered-worker checks, and all ten Playwright journeys across desktop and mobile Chrome. The browser path now verifies all four learning paths, the selected level's wording, the exact educator topic payload, structured key ideas, deterministic follow-up focus, visible Grokipedia source-tier labels, absence of the retired disclaimer, offline reload, and serious/critical accessibility checks on both Practice and Learn in all four themes.

### Human judgment produced a second approved welcome

The July 16 creative pass used the same fresh, consent-gated Morrowward pipeline for a Benjamin Franklin greeting. The run generated four new 2816×1584 stills; Codex inspected them at original resolution and selected image 3 with a 30/30 recorded review. The narration's short quotation—“Little strokes fell great oaks.”—was verified against the Founders Online transcription of Benjamin Franklin's *Poor Richard Improved, 1750*, where the archival text has a line break after “Little Strokes,” before “Fell great Oaks.” Morrowward normalized only capitalization, the comma, and that line break; wording and word order were unchanged. Source: [Founders Online](https://founders.archives.gov/documents/Franklin/01-03-02-0176).

The first 15-second Grok image-to-video result showed minor incidental, nonsynchronized mouth movement. A complete frame-sequence review found no impression of synchronized speech and scored the visual 29/30. Codex nevertheless tested two alternatives rather than treating the first generation as automatically final:

- A stricter second Grok retry was rejected because it introduced more pronounced facial and mouth movement.
- A deterministic, technically valid still-motion fallback was rendered and validated, but Dave rejected its creative result because the frozen-frame treatment did not feel right.
- The team returned to the stronger first Grok animation. Its provider audio was discarded, a separate xAI built-in **Sal** narrator supplied the voice track, and exact English captions carried the transcript. The visible AI-interpretation and voice disclosures make clear that Franklin is not being presented as speaking or endorsing Morrowward.

The locally composed result was re-probed at 1280×720 and 15.041667 seconds. Dave reviewed the exact video bytes and approved SHA-256 `e261c75caead502f2da0efeb25a157f0273427d86495e9d2e39165e74c030b7f` at `2026-07-16T15:52:21Z`, saying: “Video is perfect!” The public caption SHA-256 is `f2be000a2065b8bae7a22315cc20952a3935e386608ed50b8fa12ec2f0389425`; the poster SHA-256 is `f007a175b2d894b90420a0b03dad315630094e85936e2aa86f41c307970dc113`.

Franklin and Marcus now form a two-entry approved roster. A browser receives one random selection once, stores that assignment locally, and continues to see the same welcome rather than changing on every visit. Nothing autoplays: the user chooses whether to play, can close or skip the first-run overlay, and can replay the assigned welcome from Our Why. Both publication records bind exact assets, transcripts, primary quotation sources, model provenance, disclosures, and human approval. The shipped app has no xAI runtime dependency.

After resetting the application several times, Dave confirmed that both random assignments appeared and that each welcome worked in the complete first-run flow. The creative roster was then deliberately frozen at these two videos for the hackathon release: Marcus supplies the reflective Stoic voice, Franklin supplies the practical habit-building voice, and additional figures would add demo length and review surface without materially improving the submission.

The final planned still-image slot went to Today rather than another gallery or decorative section. OpenAI's built-in image generator created a fresh Morrowward horizon scene specifically for the open space above the illustrative path: a person looking toward a distant dawn while small illuminated steps become a long golden route. Codex constrained the composition to the Space palette, kept the right edge dark for interface blending, removed all text, currency, charts, logos, and trading imagery, converted the selected 1794×877 source into a 207 KB project JPEG (SHA-256 `1224434cc7d6a43d08c04673047b8818a8394583d3fcddde8d1cce20754d4a79`), and integrated it as optional visual storytelling while the deterministic projection remains the accessible product content.

This sequence became a better orchestration example than simply accepting the newest output. GPT-5.6/Codex generated alternatives, measured and reviewed each one, preserved the technical evidence, and then used Dave's creative judgment to choose the version that best served the experience while retaining truthful presentation boundaries.

Verification for the two-entry roster closed with **226 passing unit/integration tests across 22 files**, clean ESLint and TypeScript checks, clean vinext and Next/Vercel production builds, both campaign-manifest dry runs, four rendered-worker checks, and all ten Playwright journeys across desktop and mobile Chrome. Publication tests bind both asset sets byte-for-byte; roster tests cover stable old assignments and deterministic selection boundaries; service-worker tests cover lazy MP4 loading, immediate online range playback, one deduplicated full-file cache fill, and offline range replay. The browser journey accepts either approved assignment while verifying no autoplay, the matching captions, separate narrator disclosure, replay, and offline application behavior.

### Scope evolution: Apple companion demonstrations

The original July 14 decision correctly kept the web/PWA as the complete hackathon product and treated native apps as future work. After the web experience matured ahead of schedule, Dave and Codex revisited that boundary for a narrower purpose: demonstrate how Codex can carry a finished product into Apple tooling without pretending that two rushed native rewrites improve the product.

Friday's target is therefore a fresh shared SwiftUI project with thin iOS and macOS companion shells around the proven Morrowward web experience:

- Share one SwiftUI/WebKit implementation across two targets, following Apple's [multiplatform target guidance](https://developer.apple.com/documentation/Xcode/configuring-a-multiplatform-app-target) and current [WebKit for SwiftUI](https://developer.apple.com/documentation/webkit/webkit-for-swiftui) APIs.
- Preserve the React UI, deterministic engines, local browser data, and server API boundaries rather than duplicating them in Swift.
- Add only the native value needed for an honest hackathon demonstration: launch/loading/error states, restrained Apple navigation chrome, app icons, external-link handling, simulator/Mac build verification, and platform documentation. Apple's [Liquid Glass guidance](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass) will inform controls and navigation rather than replacing Morrowward's content layer.
- Keep Debug origin configurable for a local server and point Release at the stable public production alias. Never embed a protected preview URL, Vercel credential, OpenAI key, or bypass token.
- Describe the result as a companion shell and portability demonstration, not an App Store-ready native rewrite; Apple's [App Review Guideline 4.2](https://developer.apple.com/app-store/review/guidelines/) sets a higher bar for a future store release.
- Journal every Xcode, simulator, signing, design, and verification decision so the process itself demonstrates Codex capability.

The local audit confirmed Xcode 26.6, Swift 6.3.3, XcodeGen 2.45.4, an iOS 26.5 runtime, and an iPhone 17 Pro simulator are ready. Simulator and unsigned local Mac builds do not require the currently absent signing identity; physical-device installation remains optional and would require selecting an Apple development team.

### One public production backend, still an unannounced build

Hands-on testing exposed unnecessary friction from treating protected Preview deployments as the eventual product backend. Preview URLs are intentionally immutable and change with each deployment, Vercel Cron runs only in Production, and the planned iOS/macOS companion shells need one stable Release origin. Dave and Codex therefore moved the stable Vercel Production site forward from July 20 to July 16 while preserving the original idea-protection boundary where it matters most:

- The GitHub repository and full source history remain private through July 19.
- Generated Preview deployment URLs remain protected by Vercel Authentication.
- The stable Production URL is public but unannounced, with `noindex`/`nofollow` metadata, a restrictive `robots.txt`, and API-specific `X-Robots-Tag` headers.
- On July 20, the repository becomes public and search indexing is deliberately enabled; the stable application URL does not change.

Before opening Production, Codex independently audited every public route. Dave specifically called out the realistic possibility that bots could discover the unannounced educator/chat page and turn a public demo into unbounded model spend. The review found that bounded schemas and warm-instance limits were not enough for a public cost-bearing API because serverless instances do not share memory. The production hardening therefore reused one small Upstash Redis dependency for all shared state: durable quote/brief snapshots, the quote refresh lock, atomic per-client fixed-window limits, and a 100-provider-attempt UTC-day GPT educator circuit breaker. The free Redis plan is scoped only to Production, uses the Vercel function region, has eviction and automatic upgrades disabled, and contains no plan or portfolio data. Vercel Production refuses model-eligible educator work if OpenAI is enabled without a complete available durable store; deterministic no-key development remains available.

A new long random Production-only `CRON_SECRET`, stable canonical origin, disabled-indexing flag, and bounded educator limit were added through Vercel's encrypted settings. The restricted Production OpenAI key required a fresh one-time entry because Vercel correctly prevents a Sensitive Preview value from being read back or copied by automation. A live, temporary Production Redis smoke test proved the exact atomic `EVAL` increment-and-expiry operation works; its test key was deleted immediately. A second adversarial review then moved quota reservation behind the pure local safety/guardrail classifier, so prompt injection, sensitive identifiers, personalized trading requests, and crisis/debt/tax boundaries consume no shared GPT quota while genuine provider attempts—including upstream failures—do. Per-client hashing now prefers Vercel's anti-spoofed `x-vercel-forwarded-for` header. The code and configuration closed with 239 passing tests, clean lint and TypeScript checks, and successful vinext plus Next/Vercel production builds before the staged Production deployment.

The first public Production visit then exposed a timing race that protected Preview testing could not reproduce. The request correctly returned deterministic data immediately and started the GPT-5.6 quote batch after the response. The batch succeeded at `2026-07-16T17:01:45.544Z`, persisting nine validated web-sourced stock/ETF prices while BTC and ETH remained explicit per-symbol fallbacks. However, the response that initiated that work was eligible for a five-minute edge cache, and a warm function could cache its empty Redis read for 30 seconds. The Practice UI's observation checks at roughly eight and 28 seconds could therefore miss a snapshot that another function had already saved, leaving the mounted page on the ambiguous **Daily Price Refresh** label.

The repair preserved all spend controls: fallback responses are now `private, no-store`, observation-only reads bypass the short durable-miss cache, and a configured first run says **Preparing today’s first price update…** until a valid timestamp exists. A long-open page also performs one read-only observation when it regains focus or visibility; this cannot invoke GPT. Once saved data appears, the interface switches to **Real Prices Updated Every 24 Hours**, the exact **Last updated** time, and the calculated completed-hours age. Three route regressions and a provider-level cache-race test cover the boundary.

The combined Production-race and Today-art pass closed with **243 passing unit/integration tests across 24 files**, clean ESLint and TypeScript checks, four rendered-worker checks, clean vinext and Next/Vercel production builds, and all ten Playwright journeys across desktop and mobile Chrome. Separate visual captures confirmed the horizon composition in Dawn, Horizon, Alchemy, Space, and the mobile Space layout; the browser suite also reverified offline reload and no serious or critical automated accessibility violations.

Commit `38cc0c1` was pushed to the private `main` history and deployed as Production deployment `dpl_5atjQaBAqir5aG52Niq6gJ7YUMs7`, which Vercel assigned to the unchanged stable alias. A clean public-browser smoke loaded the exact 1794×877 artwork, displayed **Real Prices Updated Every 24 Hours**, the saved `2026-07-16T17:01:45.544Z` update, and an age of less than one hour. The observation route returned `private, no-store`, nine web-sourced symbols, explicit BTC/ETH fallbacks, and no new generation. Health reported GPT-5.6 plus the durable quote and brief stores configured, while `robots.txt` continued to disallow indexing during the unannounced-build window.

This is a field-note lesson worth preserving in full. The original private-preview decision was sensible while the idea and repository were young, but privacy at the deployment layer created a second environment to maintain: separate secrets, separate storage scope, protected URLs, Preview-specific testing behavior, and no scheduled cron execution. Sensitive variables could not be promoted by reading them back, which correctly protected the key but required a fresh Production credential. Once the product needed a stable URL for documentation, repeatable demos, and two Apple companion shells, that duplication stopped buying much additional protection. The simpler boundary became:

- Keep one stable Vercel Production application and backend as the engineering truth.
- Keep its URL public but unannounced and out of search indexes during the build.
- Keep disposable Preview deployments protected for isolated checks rather than treating them as a second product environment.
- Keep the GitHub repository—and therefore the implementation history and discoverable project idea—private until July 20.
- Assume an unannounced public chat route can still be found by bots: add distributed rate limits and an explicit daily AI circuit breaker instead of relying on obscurity or a warm-process counter.

The useful lesson is not that private previews were a mistake. They were the right first boundary, then became operational friction as the architecture matured. GPT-5.6/Codex helped recognize when the tradeoff changed, audited the consequences of going public, and converted that decision into tested infrastructure rather than merely flipping a visibility setting.

### The companion destination arrived before the companion code

Dave chose not to wait for Friday's Apple work before replacing the About-page future-roadmap block. The page now presents the actual destination state: polished **Morrowward for iPhone** and **Morrowward for Mac** source cards plus an active **Follow Dave online** card. Because the Apple source folders do not exist yet, the first two cards are intentionally informational rather than fake links, disabled controls, private-repository URLs, or App Store claims. Their visible status says that the source link is coming after the build. Once the exact folders exist and the repository is public, those same cards can become verified GitHub links without redesigning the section.

The active Dave card links to `https://thedavedev.com`, opens in a new tab with explicit assistive text, and uses the same full-card interaction treatment planned for the source links. The childhood-photo overlay was also corrected from the vague decade label **1980s** to the personal label **Dave**.

This focused pass retained **243 passing unit/integration tests across 24 files**, clean ESLint and TypeScript checks, clean vinext and Next/Vercel production builds, and all ten Playwright journeys across desktop and mobile Chrome. Browser coverage now verifies the non-interactive Apple cards, the exact Dave destination and security attributes, the photo label, touch-target size, no horizontal overflow, keyboard focus, and no serious or critical Mission-page accessibility violations in Dawn, Horizon, Alchemy, or Space.

### The daily brief became a protected sourced publication

Dave's final Today-page review identified the last major mismatch between presentation and product truth: the attractive 90-second briefing card still showed deterministic sample copy and a manual refresh control. The replacement treats a market briefing as a publication job, not as a button a visitor should wait on or repeatedly invoke.

The settled design is one protected Vercel Production cron at 12:00 UTC. Its serverless route and GPT-5.6 Responses request each allow **150 seconds**, matching hands-on runs that often needed roughly 90 seconds for current web research. The job uses required hosted web search, `store: false`, strict structured output, source records, and no more than four search calls. Application validation then checks every displayed citation against returned search evidence, rejects stale timestamps and unsafe advice language, requires every tracked asset to be accounted for while downgrading unsupported internal checks to unavailable, protects SPCX from former-ticker confusion, and permits Federal Reserve dates only when an official `federalreserve.gov` source supports them.

The model sees no visitor plan or portfolio. Its entire financial lens is one fixed public **$100,000 Frontier Growth & Resilience** educational scenario plus a public benchmark/watchlist and request time. The number is a deliberately round case study for making accumulated principal and compounding visible, not a claim that every person should have $100,000, not Dave's or a visitor's balance, and not a recommended strategy or allocation. Investor.gov's [compound-interest calculator](https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator) and [savings-goal calculator](https://www.investor.gov/savings-goal-calculator) became the primary educational references for that boundary; whether a milestone is easy or hard depends on contributions, time, returns, fees, taxes, and risk.

The former four-part sample layout became exactly three source-linked cards in the existing visual language:

- **Market & sentiment** separates verified movement from interpretation.
- **Frontier assets** covers only material, source-supported developments.
- **$100K learning lens & Fed watch** connects conditions to diversification, volatility, and rate-sensitivity lessons without prescribing a trade.

The third card also has a compact **Why $100K?** disclosure. It uses simple scale math to show why accumulated principal can make compounding feel more visible, links directly to Investor.gov education, and says plainly that $100,000 is not magic and that the next $900,000 is not guaranteed to take less time.

The refresh button disappeared. Today now shows the last successful generation time, while public reads only retrieve the latest validated shared edition and never call OpenAI. A five-minute date-scoped distributed lease collapses concurrent protected calls; a successful edition makes the job idempotent for the rest of the America/New_York calendar day while a failed attempt can be deliberately retried. The durable last valid edition survives cold starts for up to 48 hours, and a failed run cannot replace it. When no valid edition exists, an evergreen source-linked edition says current conditions could not be verified and makes no invented price, headline, sentiment, posture, or Federal Reserve claim.

This decision also reinforced the July 16 deployment simplification. With one stable Production backend as the engineering truth, the scheduled job, shared Redis state, source-validation path, and eventual Apple shells all use the same environment. The repository remains private and the public site remains unannounced/noindex until launch, but spend safety comes from authenticated cron access, durable generation locks, the existing educator circuit breaker, strict validation, and no public generation path—not from trying to maintain a second pseudo-production Preview environment.

Final verification for the sourced-brief pass reached **251 passing unit/integration tests across 25 files**, clean ESLint and TypeScript checks, clean vinext and Next/Vercel production builds, and all **12 Playwright journeys** across desktop and mobile Chrome. The browser suite exercises the three cards, safe citations, exact update time, removed refresh control, removed Learn badge, expandable $100K explanation and sources, offline reload, and all four themes with no serious or critical automated accessibility violations.

The first protected Production publication became a valuable final integration lesson. Strict local fixtures had represented search citations as byte-identical URLs, while real Responses web search exposed several ordinary publisher shapes: RFC 3339 Eastern offsets, Bing's `msockid` click identifier on an otherwise identical Vanguard page, and AP News links that alternated between `/article/<id>` and `/article/<headline>-<same-id>`. Strict structured JSON also returned the complete `web_search_call.action.sources` set without native output-text citation annotations. Codex kept each failure closed, added bounded diagnostics containing only public host/path structure and counts, and tightened one boundary at a time:

- accept RFC 3339 timestamps, including numeric offsets, when no more than 36 hours old and no more than 15 minutes in the future;
- remove only recognized click-tracking parameters, including `msockid`;
- equate AP News variants only when the immutable 32-character article ID is identical;
- omit any sentence whose citation still cannot bind to returned evidence;
- downgrade an unsupported internal asset identity check to unavailable; and
- reject the complete edition if evidence pruning leaves any of the three public sections empty.

That last rule prevented a plausible but unreturned Nasdaq TSLA profile URL from becoming a visible citation. No hostname-only matching, arbitrary redirect following, path case folding, or blanket query removal was introduced.

Production deployment `dpl_GfhpHgfLfuvMWUPSDTafMxboUUaR` then published the first validated AI edition at `2026-07-16T23:47:25.413Z` on the unchanged `https://morrowward.vercel.app` alias. The public response reported `ai` mode, exactly three sections, source counts of 3, 7, and 6, at least one official Federal Reserve link in the third section, only HTTP(S) source URLs, and no rendered personalized or transaction language. A second same-day cron invocation preserved the exact generation timestamp and source counts, proving idempotent reuse instead of another GPT generation.

The production-hardening close reached **263 passing unit/integration tests across 25 files**, clean full-project ESLint and TypeScript checks, repeated clean Vercel builds, the already-passing 12 desktop/mobile Playwright journeys, and a live stable-alias API acceptance check. The safe evergreen edition remained visible throughout every rejected attempt and was replaced only after the complete sourced edition passed.

### Unreliable Vanguard routes became a tested compatibility boundary

Dave's final link check found that the individual-investor VTI and BND profile routes could return 404 pages in a normal browser, including citations already stored in the successful daily briefing. Morrowward moved its two static Practice destinations to Vanguard's current public advisor product pages and added a deliberately narrow compatibility map for only those retired profile paths. Future briefing publications canonicalize those citations on the server, while the client applies the same map when reading an already-cached edition. That second boundary repaired the current live brief immediately after deployment without paying for or waiting on another GPT generation.

The same pass rebuilt the public README gallery directly from the stable Production URL. Its reproducible Playwright capture now waits for decoded imagery, the completed sourced brief, and the completed daily quote snapshot before taking images. The gallery covers all five web pages, the final horizon artwork and live-source presentation, desktop and mobile layouts, and all four themes. It also preserves focused closeups of the daily briefing, Practice market, Market Journey, and SPCX educational sheet. Native iPhone and Mac captures remain explicitly reserved for the companion-shell build rather than being mocked ahead of the code.

The link-and-gallery close reached **264 passing unit/integration tests across 25 files**, clean full-project ESLint and TypeScript checks, clean vinext and Next/Vercel production builds, and all **12 Playwright journeys** across desktop and mobile Chrome.

## July 17 — Shared iOS and macOS companion shells

- Create the fresh `apple/` project and shared SwiftUI/WebKit source.
- Build the Morrowward icon and restrained native launch/navigation/error states.
- The About page now uses a three-card companion panel: **Morrowward for iPhone**, **Morrowward for Mac**, and **Follow Dave online**. The iPhone and Mac source cards are intentionally informational and non-interactive until their exact local source folders exist; turn them into links only after the corresponding public GitHub folder URLs have been verified. **Follow Dave online** is active now and links to `https://thedavedev.com`.
- Keep internal Morrowward navigation in the shell and open educational external links in the system browser.
- Verify clean iPhone 17 Pro simulator and unsigned macOS builds.
- Exercise onboarding, Practice, Market Journey, Education, themes, local persistence, export/import/reset, media playback, and network failure.
- Add Apple setup, XcodeGen, local-server, signing, and architecture documentation.

## July 18 — Submission package and recording

- Complete final web and Apple smoke tests.
- Finalize the Devpost description, README, screenshots, attribution, and three-minute demo path.
- Record the public demo showing the web app plus the iPhone and macOS companion shells.
- Keep the product demonstration independent from live market conditions by using repeatable seeded state.

## July 19 — Buffer and submission-blocking fixes

Reserved for issues discovered during recording, clean-room setup verification, final security/history review, and submission-blocking fixes only.

## July 20 — Publish and submit

- Make the full repository history public and enable indexing on the already-stable Production deployment.
- Recheck clean clone, public website, Apple project instructions, YouTube visibility, and every Devpost link.
- Submit during the evening, preserving the full-day buffer before the July 21, 8:00 PM ET deadline.
