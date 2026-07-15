# Security and privacy notes

Morrowward is an educational simulator. Its safest path is also its default path: no account, no brokerage connection, no real transaction capability, no live quote dependency, and no OpenAI key required.

## Data boundaries

- Age, plan assumptions, simulated cash, holdings, habits, experience level, and theme are stored in the browser with IndexedDB.
- The persisted schema intentionally has no name, email, birthdate, account number, brokerage credential, or analytics identifier.
- Export files contain the same local simulation state and should be treated as private by the user.
- If IndexedDB is unavailable, the app visibly reports that changes are session-only.
- The educator receives only a sanitized question, experience level, and four bounded illustrative values: years remaining, weekly contribution, return, and inflation. It never receives starting balances or practice holdings.

## AI boundary

- OpenAI access is server-side only through the Responses API.
- Requests use GPT-5.6, `store: false`, strict structured output, bounded input and output, and a timeout.
- Input checks reject prompt injection, direct individualized trading requests, and obvious sensitive identifiers. Generated text is checked again for direct recommendations, concentrated allocations, guarantees, and urgency.
- Safe deterministic explanations and briefs remain available when OpenAI is unconfigured, unavailable, over budget, or returns invalid output.
- `store: false` disables response storage, but API inputs may still be retained temporarily for abuse monitoring under OpenAI's applicable data controls. Users are told not to submit account numbers or other private information.

## HTTP and deployment controls

- State-changing routes require `application/json` and reject cross-site browser requests using Origin and Fetch Metadata.
- Requests and responses have bounded schemas and sizes.
- Rate limiting is keyed to a salted hash of the platform-provided client address, never the User-Agent or a raw address.
- The included limiter is best-effort within a warm runtime. A public high-traffic deployment should also use Vercel Firewall/WAF or an atomic Redis/KV limiter because cold starts and regions do not share process memory.
- Vercel and vinext/worker targets return anti-framing, MIME-sniffing, referrer, permissions, opener, and Content Security Policy headers.
- Daily AI briefs can use an optional date-keyed Vercel KV or Upstash REST cache. Configure either the complete `KV_REST_API_URL` + `KV_REST_API_TOKEN` pair or the complete `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` pair; the KV pair takes precedence when both are complete. Saved briefs are schema-validated, expire after 48 hours, and store operations time out after 1.5 seconds. Missing, slow, unavailable, or malformed store data degrades to the labeled in-process/deterministic brief.
- Vercel Cron uses authenticated `GET /api/v1/briefs/generate` with `CRON_SECRET`. Manual generation uses an authenticated JSON `POST` and may use either `CRON_SECRET` or `ADMIN_API_TOKEN`.

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
5. Configure KV/Redis if AI-generated briefs must persist across serverless instances.
6. Enable a platform-level request/spend circuit breaker for unexpected public traffic.
7. Run `npm audit --omit=dev`, both production builds, the full unit/integration suite, and `npm run test:e2e` for the Playwright desktop/mobile suite.
8. Confirm no secrets or private reference files exist in the Git history.
9. Keep the repository and preview deployments private through July 19, 2026; make both the production site and full repository history public on July 20 for judging.

## Reporting

This hackathon project does not yet publish a formal vulnerability-disclosure program. Please avoid including personal financial information in a report. Open a GitHub issue after the repository is public, or contact the repository owner privately for anything sensitive.
