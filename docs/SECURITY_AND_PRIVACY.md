# Security and privacy notes

Morrowward is an educational simulator. Its safest path is also its default path: no account, no brokerage connection, no real transaction capability, no live quote dependency, and no OpenAI key required.

## Data boundaries

- Age, plan assumptions, simulated cash, holdings, habits, experience level, and theme are stored in the browser with IndexedDB.
- The persisted schema intentionally has no name, email, birthdate, account number, brokerage credential, or analytics identifier.
- Export files contain the same local simulation state and should be treated as private by the user.
- If IndexedDB is unavailable, the app visibly reports that changes are session-only.
- Market Journey is calculated in the browser from bounded plan values or the local cash-plus-holdings total of the simulated Practice Portfolio and ephemeral display controls. Its selected starting balance, synthetic path, drawdown, CAGR, money-weighted return, and strongest-day comparison do not call an external service or leave the device. Portfolio mode never sends or forecasts the underlying allocation.
- Practice quote/history reads contain only allowlisted public symbols and an optional fixed `history=1y` selector. The daily GPT-5.6 quote job always uses the same fixed eleven-symbol public allowlist and never includes the local plan, simulated cash, holdings, transaction history, identity, or educator question.
- The daily GPT-5.6 briefing job receives only a request timestamp/time zone, a fixed public benchmark/watchlist, and a hypothetical $100,000 Frontier Growth & Resilience learning scenario. It never receives a user's plan, balance, simulated cash, holdings, transactions, questions, identity, or health story. The scenario is an educational case study, not a recommended strategy or claim about the reader.
- The educator receives only a sanitized question, experience level, and four bounded illustrative values: years remaining, weekly contribution, return, and inflation. It never receives starting balances or practice holdings.

## AI boundary

- OpenAI access is server-side only through the Responses API.
- Requests use GPT-5.6, `store: false`, strict structured output, bounded input and output, and a timeout.
- Daily quote generation additionally requires hosted `web_search`, includes source metadata, limits each Responses request to at most one search tool call, and rejects memory-only, malformed, or unsourced output. A completed result is still educational and updated daily—not real-time or trading-grade.
- Daily briefing generation also requires hosted `web_search`, uses up to four bounded search calls, and accepts only its strict three-section schema after citation, timestamp, asset-identity, Federal Reserve-source, and non-advice validation. URL evidence removes only recognized click-tracking parameters and normalizes AP News variants only when the stable article ID matches. Unsupported sentences are omitted and unsupported internal asset checks become unavailable; publication still fails unless all three sections retain verified source-bound copy. RFC 3339 timestamps, including numeric offsets, may be no more than 36 hours old and no more than 15 minutes in the future. Its protected route and upstream request each allow 150 seconds; the visitor-facing read never invokes OpenAI.
- Input checks reject prompt injection, direct individualized trading requests, and obvious sensitive identifiers. Generated text is checked again for direct recommendations, concentrated allocations, guarantees, and urgency.
- Safe deterministic explanations, a source-linked evergreen briefing with no current claims, and synthetic quote values remain available when OpenAI is unconfigured, unavailable, or returns invalid output. A failed briefing attempt never replaces the last validated edition. When the educator's shared daily AI quota is exhausted, model-eligible requests receive a retryable rate-limit response until the UTC reset; locally handled safety and professional-support boundaries remain available without spending that quota.
- `store: false` disables response storage, but API inputs may still be retained temporarily for abuse monitoring under OpenAI's applicable data controls. Users are told not to submit account numbers or other private information.

## HTTP and deployment controls

- State-changing routes require `application/json` and reject cross-site browser requests using Origin and Fetch Metadata.
- Requests and responses have bounded schemas and sizes.
- Rate limiting is keyed to a salted hash of Vercel's platform `x-vercel-forwarded-for`, then `x-forwarded-for`, then `x-real-ip`; it never uses the User-Agent, `cf-connecting-ip`, or a stored raw address.
- With a complete Redis REST credential pair, per-client limits and the educator's 100-request UTC-day circuit breaker use atomic increment-and-expiry operations shared across cold starts, regions, and parallel instances. Prompt injection, sensitive identifiers, personalized trading requests, and crisis/debt/tax boundaries resolve locally before the daily quota. Provider-eligible attempts reserve quota before the call, so upstream failures still count. Vercel Production refuses model-eligible work whenever OpenAI is enabled without a complete available durable pair. Preview/local deployments with no store configured may use the bounded warm-runtime limiter; Vercel Firewall/WAF remains useful defense in depth.
- Vercel and vinext/worker targets return anti-framing, MIME-sniffing, referrer, permissions, opener, and Content Security Policy headers.
- Daily AI content can use a Vercel KV-compatible or Upstash REST store. Configure either the complete `KV_REST_API_URL` + `KV_REST_API_TOKEN` pair or the complete `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` pair; the KV pair takes precedence when both are complete. Saved briefs and quote snapshots are schema-validated, expire after 48 hours, and store operations time out after 1.5 seconds. Missing, slow, unavailable, or malformed store data degrades to labeled in-process content, an evergreen no-current-claims briefing, or deterministic quote values as appropriate.
- Vercel Cron uses authenticated `GET /api/v1/briefs/generate` and `GET /api/v1/quotes/generate` with `CRON_SECRET`. Operator-controlled JSON `POST` generation may use either `CRON_SECRET` or `ADMIN_API_TOKEN`. Vercel invokes cron jobs only for Production deployments, not protected Preview deployments.
- The briefing cron runs once daily at 12:00 UTC and is idempotent by America/New_York calendar date. A five-minute date-scoped distributed lease collapses concurrent protected scheduler/admin calls while still allowing a deliberate retry after a transient or validation failure; the shared latest validated edition lasts up to 48 hours. No first-visitor, refresh-button, or public self-healing path can start briefing generation.
- The quote cron runs once per UTC day after the regular U.S. equity session. If it misses a run or the saved snapshot is stale, the first normal quote read may start one background self-healing refresh. An in-process singleflight collapses concurrent requests in one warm runtime; the configured Redis/KV store supplies a 12-hour distributed `NX` retry guard across instances. Normal reads reuse a successful snapshot for up to 24 hours; the scheduled route uses a UTC-day policy so boundary timing cannot make it skip every other day. The initiating UI makes only two observation-only rechecks, which cannot start generation. Persistent failures retry no more frequently than once per 12 hours.
- Quote generation batches the fixed eleven-symbol allowlist into one GPT-5.6 Responses request with required web search, strict per-asset schema/identity/time/source validation, `store: false`, and at most one search tool call. URL citations must both occur in the search source list and annotate the matching quote object; hosted source URLs are never invented. Equity/ETF observations are limited to a long-weekend window and crypto observations to six hours at ingestion. Durable lock and write failures are distinguished from contention and return a protected-route failure instead of claiming a persisted success.
- xAI is not a runtime product dependency. Local media scripts require both `XAI_API_KEY` and an explicit `--confirm-xai-upload` flag before prompts, narration, or a selected image can leave the workspace. Raw candidates are ignored by Git, and no personal financial data is part of the media campaign.

## Dependency status at the feature-complete milestone

- `npm audit --omit=dev` reports **0 known production vulnerabilities**.
- The full development tree reports 12 transitive advisories (1 low, 4 moderate, 6 high, and 1 critical) in build/test tooling. npm's complete automatic remediation path requires breaking or out-of-range upgrades, so those upgrades are intentionally deferred to a dedicated post-hackathon dependency pass rather than forced into the release candidate.
- The project therefore does not claim a vulnerability-free development toolchain; the verified statement is limited to the installed production dependency graph.

## Final artifact audit — July 17, 2026

- Current tracked source, ignored local files, every local/remote Git ref, and all commits reachable from the branch and release tag were scanned for common OpenAI, xAI, GitHub, AWS, JWT, and private-key signatures without printing candidate values. None were found.
- `.env.example` contains empty or documented placeholder values only. No other `.env`, PEM, provisioning profile, or signing credential is tracked. Apple source and the ad-hoc signed Mac Release contain no development team, provisioning profile, API credential, home-directory path, or temporary-machine path.
- Git commit metadata uses the intentional GitHub noreply identity `212058+disbitski@users.noreply.github.com`. No home-directory path occurs anywhere in reachable Git history.
- Tracked screenshots, image metadata, video metadata, captions, publication manifests, and representative frames from both welcome videos contain no personal contact details, browser profiles, notifications, machine-local paths, credentials, or private deployment identifiers. Dave reviewed the small, partially visible background figure in his deliberately published childhood photograph, identified him as his brother, and explicitly chose to preserve the family photo intact.
- The public client bundle was checked separately and contains the new mobile Settings control with no scanned credential or machine-path signature. The oversized intermediate Vercel source deployment was replaced by a clean tracked-source package and deleted; the stable alias now points to the 199-file clean deployment.

## Operational checklist

Before public launch:

1. Create a dedicated OpenAI API project.
2. Add $10 prepaid credit, leave auto-recharge disabled, and enable usage notifications. Reporting may be delayed, so this is not described as an absolute hard cap.
3. Set `OPENAI_API_KEY` only in server-side deployment settings.
4. Set a long random `CRON_SECRET` before enabling the daily Vercel cron.
5. Configure KV/Redis in Production so the last validated brief, shared quote snapshot, date-scoped generation guards, shared request limits, and educator daily AI circuit breaker persist across serverless instances.
6. Confirm `EDUCATOR_DAILY_AI_REQUEST_LIMIT` is set to the intended bounded daily budget (the code default is 100), and enable platform-level Firewall/WAF controls as defense in depth.
7. Verify both Production cron jobs: the briefing's exact three source-linked sections, 150-second function allowance, last-valid retention/evergreen fallback, plus the quote job's guarded self-healing read, source/freshness labels, and synthetic fallback with OpenAI disabled. Preview cron jobs do not run.
8. Run `npm audit --omit=dev`, both production builds, the full unit/integration suite, and `npm run test:e2e` for the Playwright desktop/mobile suite.
9. Confirm no secrets, raw media candidates, or private reference files exist in the Git history.
10. Keep the public Production site unannounced and `noindex` while the repository and preview deployments remain private through July 19, 2026. On July 20, enable indexing and publish the complete repository history for judging.

Primary implementation references: [OpenAI Responses API web search](https://developers.openai.com/api/docs/guides/tools-web-search), [OpenAI API pricing](https://developers.openai.com/api/docs/pricing), [Vercel Cron Jobs quickstart](https://vercel.com/docs/cron-jobs/quickstart), and [Vercel cron security/operations](https://vercel.com/docs/cron-jobs/manage-cron-jobs). At the documented build-time price, the web-search tool costs $10 per 1,000 calls ($0.01 per call) plus model and search-content tokens. Normal operation uses one successful search per 24-hour snapshot; during persistent failures, the configured retry guard permits no more than one attempt per 12 hours. Every Responses request remains limited to one search tool call.

## Reporting

This hackathon project does not yet publish a formal vulnerability-disclosure program. Please avoid including personal financial information in a report. Open a GitHub issue after the repository is public, or contact the repository owner privately for anything sensitive.
