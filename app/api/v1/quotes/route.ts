import { after } from "next/server";
import { QUOTE_SYMBOLS } from "../../../../src/contracts";
import { apiError, jsonResponse } from "../../../../src/server/http";
import {
  getMarketQuotes,
  ensureCurrentMarketQuoteSnapshot,
  parseQuoteHistory,
  parseQuoteSymbols,
} from "../../../../src/server/quotes";
import { enforceRateLimit } from "../../../../src/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const rateLimit = await enforceRateLimit(request, "quotes", {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) return rateLimit.response;

  const searchParams = new URL(request.url).searchParams;
  const observeOnly = searchParams.get("observe") === "1";
  const rawSymbols = searchParams.get("symbols");
  if (rawSymbols && rawSymbols.length > 128) {
    return apiError(
      400,
      "invalid_request",
      `Use at most ${QUOTE_SYMBOLS.length} symbols from: ${QUOTE_SYMBOLS.join(", ")}.`,
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

  const historySelection = parseQuoteHistory(
    searchParams.get("history"),
    selection.symbols,
  );
  if (!historySelection.ok) {
    return apiError(
      400,
      "invalid_request",
      historySelection.reason === "requires_one_symbol"
        ? "Request history=1y with exactly one allowlisted symbol."
        : "The only supported history range is history=1y.",
      {
        headers: rateLimit.headers,
        issues: [{
          path: "history",
          message:
            historySelection.reason === "requires_one_symbol"
              ? "One symbol is required for bounded history"
              : "Unsupported history range",
        }],
      },
    );
  }

  const response = await getMarketQuotes(selection.symbols, {
    bypassDurableReadCache: observeOnly,
    includeHistory: historySelection.includeHistory,
  });
  const headers = new Headers(rateLimit.headers);
  headers.set(
    "cache-control",
    observeOnly || !response.provider.lastSuccessfulUpdate
      ? "private, no-store"
      : "public, max-age=0, s-maxage=300, stale-while-revalidate=900",
  );
  if (!observeOnly) {
    try {
      after(async () => {
        await ensureCurrentMarketQuoteSnapshot();
      });
    } catch (error) {
      // Direct route-unit calls do not establish Next's request work store.
      if (
        process.env.NODE_ENV !== "test" ||
        !(error instanceof Error) ||
        !error.message.includes("outside a request scope")
      ) {
        throw error;
      }
    }
  }
  return jsonResponse(response, { headers });
}
