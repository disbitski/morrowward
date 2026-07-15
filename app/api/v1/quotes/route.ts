import { QUOTE_SYMBOLS } from "../../../../src/contracts";
import { apiError, jsonResponse } from "../../../../src/server/http";
import { getEducationalQuotes, parseQuoteSymbols } from "../../../../src/server/quotes";
import { enforceRateLimit } from "../../../../src/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const rateLimit = await enforceRateLimit(request, "quotes", {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) return rateLimit.response;

  const rawSymbols = new URL(request.url).searchParams.get("symbols");
  if (rawSymbols && rawSymbols.length > 128) {
    return apiError(
      400,
      "invalid_request",
      `Use at most six symbols from: ${QUOTE_SYMBOLS.join(", ")}.`,
      { headers: rateLimit.headers },
    );
  }

  const selection = parseQuoteSymbols(rawSymbols);
  if (!selection.ok) {
    return apiError(
      400,
      "invalid_request",
      `Quotes are available only for: ${QUOTE_SYMBOLS.join(", ")}.`,
      {
        headers: rateLimit.headers,
        issues: [{ path: "symbols", message: "Contains a symbol outside the allowlist" }],
      },
    );
  }

  const headers = new Headers(rateLimit.headers);
  headers.set("cache-control", "public, max-age=300, stale-while-revalidate=86400");
  return jsonResponse(getEducationalQuotes(selection.symbols), { headers });
}
