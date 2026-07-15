import { getDailyBrief } from "../../../../../src/server/briefs";
import { jsonResponse } from "../../../../../src/server/http";
import { enforceRateLimit } from "../../../../../src/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const rateLimit = await enforceRateLimit(request, "briefs-today", {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) return rateLimit.response;

  const headers = new Headers(rateLimit.headers);
  headers.set("cache-control", "public, max-age=300, stale-while-revalidate=3600");
  return jsonResponse(await getDailyBrief(), { headers });
}
