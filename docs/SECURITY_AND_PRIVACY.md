# Security and privacy notes

Morrowward is an educational simulator. Its safest path is also its default path: no account, no brokerage connection, no real transaction capability, no live quote dependency, and no OpenAI key required.

## Data boundaries

- Age, plan assumptions, simulated cash, holdings, habits, experience level, and theme are stored in the browser with IndexedDB.
- The persisted schema intentionally has no name, email, birthdate, account number, brokerage credential, or analytics identifier.
- Export files contain the same local simulation state and should be treated as private by the user.
- If IndexedDB is unavailable, the app visibly reports that changes are session-only.
- Market Journey is calculated in the browser from bounded plan values and ephemeral display controls. Its synthetic path, drawdown, CAGR, money-weighted return, and strongest-day comparison do not call an external market-data service or leave the device.
- Practice quote/history reads contain only allowlisted public symbols and an optional fixed `history=1y` selector. The daily GPT-5.6 quote job always uses the same fixed eleven-symbol public allowlist and never includes the local plan, simulated cash, holdings, transaction history, identity, or educator question.
- The educator receives only a sanitized question, experience level, and four bounded illustrative values: years remaining, weekly contribution, return, and inflation. It never receives starting balances or practice holdings.

## AI boundary

- OpenAI access is server-side only through the Responses API.
- Requests use GPT-5.6, `store: false`, strict structured output, bounded input and output, and a timeout.
- Daily quote generation additionally requires hosted `web_search`, includes source metadata, limits each Responses request to at most one search tool call, and rejects memory-only, malformed, or unsourced output. A completed result is still educational and updated daily—not real-time or trading-grade.
- Input checks reject prompt injection, direct individualized trading requests, and obvious sensitive identifiers. Generated text is checked again for direct recommendations, concentrated allocations, guarantees, and urgency.
- Safe deterministic explanations, briefs, and synthetic quote values remain available when OpenAI is unconfigured, unavailable, over budget, or returns invalid output.
- `store: false` disables response storage, but API inputs may still be retained temporarily for abuse monitoring under OpenAI's applicable data controls. Users are told not to submit account numbers or other private information.

## HTTP and deployment controls

- State-changing routes require `application/json` and reject cross-site browser requests using Origin and Fetch Metadata.
- Requests and responses have bounded schemas and sizes.
- Rate limiting is keyed to a salted hash of the platform-provided client address, never the User-Agent or a raw address.
- The included limiter is best-effort within a warm runtime. A public high-traffic deployment should also use Vercel Firewall/WAF or an atomic Redis/KV limiter because cold starts and regions do not share process memory.
- Vercel and vinext/worker targets return anti-framing, MIME-sniffing, referrer, permissions, opener, and Content Security Policy headers.
- Daily AI content can use a Vercel KV-compatible or Upstash REST store. Configure either the complete `KV_REST_API_URL` + `KV_REST_API_TOKEN` pair or the complete `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` pair; the KV pair takes precedence when both are complete. Saved briefs and quote snapshots are schema-validated, expire after 48 hours, and store operations time out after 1.5 seconds. Missing, slow, unavailable, or malformed store data degrades to labeled in-process/deterministic content.
- Vercel Cron uses authenticated `GET /api/v1/briefs/generate` and `GET /api/v1/quotes/generate` with `CRON_SECRET`. Operator-controlled JSON `POST` generation may use either `CRON_SECRET` or `ADMIN_API_TOKEN`. Vercel invokes cron jobs only for Production deployments, not protected Preview deployments.
- The quote cron runs once per UTC day after the regular U.S. equity session. If it misses a run or the saved snapshot is stale, the first normal quote read may start one background self-healing refresh. An in-process singleflight collapses concurrent requests in one warm runtime; the configured Redis/KV store supplies a 12-hour distributed `NX` retry guard across instances. Normal reads reuse a successful snapshot for up to 24 hours; the scheduled route uses a UTC-day policy so boundary timing cannot make it skip every other day. The initiating UI makes only two observation-only rechecks, which cannot start generation. Persistent failures retry no more frequently than once per 12 hours.
- Quote generation batches the fixed eleven-symbol allowlist into one GPT-5.6 Responses request with required web search, strict per-asset schema/identity/time/source validation, `store: false`, and at most one search tool call. URL citations must both occur in the search source list and annotate the matching quote object; hosted source URLs are never invented. Equity/ETF observations are limited to a long-weekend window and crypto observations to six hours at ingestion. Durable lock and write failures are distinguished from contention and return a protected-route failure instead of claiming a persisted success.
- xAI is not a runtime product dependency. Local media scripts require both `XAI_API_KEY` and an explicit `--confirm-xai-upload` flag before prompts, narration, or a selected image can leave the workspace. Raw candidates are ignored by Git, and no personal financial data is part of the media campaign.

## Dependency status at the feature-complete milestone

- `npm audit --omit=dev` reports **0 known production vulnerabilities**.
- The full development tree reports 12 transitive advisories (1 low, 4 moderate, 6 high, and 1 critical) in build/test tooling. npm's complete automatic remediation path requires breaking or out-of-range upgrades, so those upgrades are intentionally deferred to a dedicated post-hackathon dependency pass rather than forced into the release candidate.
- The project therefore does not claim a vulnerability-free development toolchain; the verified statement is limited to the installed production dependency graph.

## Operational checklist

Before public launch:

1. Create a dedicated OpenAI API project.
2. Add $10 prepaid credit, leave auto-recharge disabled, and enable usage notifications. Reporting may be delayed, so this is not described as an absolute hard cap.
3. Set `OPENAI_API_KEY` only in server-side deployment settings.
4. Set a long random `CRON_SECRET` before enabling the daily Vercel cron.
5. Configure KV/Redis in Production so generated briefs, the shared quote snapshot, and the 12-hour distributed quote retry guard persist across serverless instances.
6. Enable a platform-level request/spend circuit breaker for unexpected public traffic.
7. Verify the Production quote cron, one guarded self-healing read, source/freshness labels, and synthetic fallback with OpenAI disabled. Preview cron jobs do not run.
8. Run `npm audit --omit=dev`, both production builds, the full unit/integration suite, and `npm run test:e2e` for the Playwright desktop/mobile suite.
9. Confirm no secrets, raw media candidates, or private reference files exist in the Git history.
10. Keep the repository and preview deployments private through July 19, 2026; make both the production site and full repository history public on July 20 for judging.

Primary implementation references: [OpenAI Responses API web search](https://developers.openai.com/api/docs/guides/tools-web-search), [OpenAI API pricing](https://developers.openai.com/api/docs/pricing), [Vercel Cron Jobs quickstart](https://vercel.com/docs/cron-jobs/quickstart), and [Vercel cron security/operations](https://vercel.com/docs/cron-jobs/manage-cron-jobs). At the documented build-time price, the web-search tool costs $10 per 1,000 calls ($0.01 per call) plus model and search-content tokens. Normal operation uses one successful search per 24-hour snapshot; during persistent failures, the configured retry guard permits no more than one attempt per 12 hours. Every Responses request remains limited to one search tool call.

## Reporting

This hackathon project does not yet publish a formal vulnerability-disclosure program. Please avoid including personal financial information in a report. Open a GitHub issue after the repository is public, or contact the repository owner privately for anything sensitive.
