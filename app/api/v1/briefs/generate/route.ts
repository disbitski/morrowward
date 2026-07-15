import { isAuthorizedBriefGenerator } from "../../../../../src/server/admin-auth";
import { generateDailyBrief } from "../../../../../src/server/briefs";
import {
  apiError,
  jsonResponse,
  noStoreHeaders,
  protectJsonPost,
} from "../../../../../src/server/http";
import { enforceRateLimit } from "../../../../../src/server/rate-limit";

export const dynamic = "force-dynamic";

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

  const brief = await generateDailyBrief();
  return jsonResponse(brief, {
    status,
    headers: noStoreHeaders(rateLimit.headers),
  });
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
