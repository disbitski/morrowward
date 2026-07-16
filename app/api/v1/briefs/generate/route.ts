import { isAuthorizedBriefGenerator } from "../../../../../src/server/admin-auth";
import {
  DailyBriefRefreshError,
  refreshDailyBrief,
} from "../../../../../src/server/briefs";
import {
  apiError,
  jsonResponse,
  noStoreHeaders,
  protectJsonPost,
} from "../../../../../src/server/http";
import { enforceRateLimit } from "../../../../../src/server/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 150;

async function generateAuthorizedBrief(
  request: Request,
  status: 200 | 201,
): Promise<Response> {
  const rateLimit = await enforceRateLimit(request, "briefs-generate", {
    limit: 6,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) return rateLimit.response;

  if (!isAuthorizedBriefGenerator(request)) {
    const headers = noStoreHeaders(rateLimit.headers);
    headers.set("www-authenticate", "Bearer");
    return apiError(
      401,
      "unauthorized",
      "A valid CRON_SECRET or admin bearer token is required.",
      { headers },
    );
  }

  try {
    const brief = await refreshDailyBrief();
    return jsonResponse(brief, {
      status,
      headers: noStoreHeaders(rateLimit.headers),
    });
  } catch (error) {
    console.warn("Morrowward daily briefing refresh failed safely.", {
      reason:
        error instanceof DailyBriefRefreshError
          ? error.reason
          : "unknown_error",
      diagnostic:
        error instanceof DailyBriefRefreshError
          ? error.diagnostic
          : null,
    });
    return apiError(
      503,
      "service_unavailable",
      "Today’s sourced briefing could not be refreshed. The last validated edition, when available, remains readable.",
      { headers: noStoreHeaders(rateLimit.headers) },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const protection = protectJsonPost(request);
  if (!protection.ok) return protection.response;
  return generateAuthorizedBrief(request, 201);
}

/** Vercel Cron invokes configured paths with GET and a CRON_SECRET bearer token. */
export async function GET(request: Request): Promise<Response> {
  return generateAuthorizedBrief(request, 200);
}
