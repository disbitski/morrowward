import { isAuthorizedScheduledGenerator } from "../../../../../src/server/admin-auth";
import {
  apiError,
  jsonResponse,
  noStoreHeaders,
  protectJsonPost,
} from "../../../../../src/server/http";
import { refreshMarketQuoteSnapshot } from "../../../../../src/server/quotes";
import { enforceRateLimit } from "../../../../../src/server/rate-limit";

export const dynamic = "force-dynamic";

async function generateAuthorizedQuoteSnapshot(
  request: Request,
  status: 200 | 201,
): Promise<Response> {
  const rateLimit = await enforceRateLimit(request, "quotes-generate", {
    limit: 6,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) return rateLimit.response;

  if (!isAuthorizedScheduledGenerator(request)) {
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
    const snapshot = await refreshMarketQuoteSnapshot({
      refreshPolicy: request.method === "GET" ? "utc-day" : "rolling",
    });
    return jsonResponse(snapshot, {
      status,
      headers: noStoreHeaders(rateLimit.headers),
    });
  } catch (error) {
    console.warn("Morrowward daily quote refresh failed safely.", {
      reason: error instanceof Error ? error.name : "unknown_error",
    });
    return apiError(
      503,
      "service_unavailable",
      "The daily market snapshot could not be refreshed. The cached educational snapshot remains available.",
      { headers: noStoreHeaders(rateLimit.headers) },
    );
  }
}

/** Vercel Cron invokes configured paths with GET and a CRON_SECRET bearer token. */
export async function GET(request: Request): Promise<Response> {
  return generateAuthorizedQuoteSnapshot(request, 200);
}

/** Optional server-to-server trigger for an operator-controlled refresh. */
export async function POST(request: Request): Promise<Response> {
  const protection = protectJsonPost(request);
  if (!protection.ok) return protection.response;
  return generateAuthorizedQuoteSnapshot(request, 201);
}
