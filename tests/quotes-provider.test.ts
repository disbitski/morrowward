import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  QUOTE_SYMBOLS,
  QuotesResponseSchema,
} from "../src/contracts";
import { EDUCATIONAL_QUOTES } from "../src/data";
import {
  getMarketQuotes,
  parseQuoteHistory,
  parseQuoteSymbols,
  resetQuoteCacheForTests,
} from "../src/server/quotes";

const NOW = new Date("2026-07-15T14:30:00.000Z");
const OBSERVED = "2026-07-15T14:29:00.000Z";
const OBSERVED_TIMESTAMP = Date.parse(OBSERVED) / 1_000;

function providerQuote(overrides: Record<string, unknown> = {}) {
  return {
    symbol: "AAPL",
    close: "250.50",
    change: "2.50",
    percent_change: "1.00806",
    previous_close: "248.00",
    timestamp: OBSERVED_TIMESTAMP,
    is_market_open: true,
    ...overrides,
  };
}

describe("educational market-data provider", () => {
  beforeEach(() => {
    resetQuoteCacheForTests();
  });

  it("expands the bounded universe and identifies newly public SPCX", () => {
    expect(QUOTE_SYMBOLS).toEqual([
      "VTI",
      "BND",
      "AAPL",
      "TSLA",
      "SPCX",
      "NVDA",
      "MRVL",
      "MU",
      "AVGO",
      "BTC",
      "ETH",
    ]);
    expect(parseQuoteSymbols("spcx,nvda,avgo")).toEqual({
      ok: true,
      symbols: ["SPCX", "NVDA", "AVGO"],
    });
    expect(EDUCATIONAL_QUOTES.SPCX).toMatchObject({
      name: "Space Exploration Technologies Corp.",
      profile: {
        category: "Aerospace and communications",
        educationalRisk: "higher",
        publicTradingSince: "2026-06-12",
      },
    });
  });

  it("requires one symbol for the optional bounded history", () => {
    expect(parseQuoteHistory("1y", ["AAPL"])).toEqual({
      ok: true,
      includeHistory: true,
    });
    expect(parseQuoteHistory("5y", ["AAPL"])).toEqual({
      ok: false,
      reason: "unsupported_range",
    });
    expect(parseQuoteHistory("1y", ["AAPL", "VTI"])).toEqual({
      ok: false,
      reason: "requires_one_symbol",
    });
  });

  it("fails closed despite a key and mode until public display rights are explicitly confirmed", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const response = await getMarketQuotes(["AAPL"], {
      apiKey: "server-secret",
      displayMode: "live",
      fetchImpl,
      includeHistory: true,
      now: NOW,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(response.provider).toEqual({
      name: null,
      configured: false,
      status: "not-configured",
      succeededSymbols: [],
      fallbackSymbols: ["AAPL"],
    });
    expect(response.quotes[0]).toMatchObject({
      mode: "sample",
      observedAtKind: "sample",
      freshness: { status: "sample", isLive: false },
      history: { range: "1y", interval: "1week", mode: "sample" },
    });
    expect(response.quotes[0].history?.points.length).toBeLessThanOrEqual(260);
    expect(() => QuotesResponseSchema.parse(response)).not.toThrow();
  });

  it("uses server-only authorization and maps equity and rolling 24-hour crypto changes", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        AAPL: providerQuote(),
        "BTC/USD": providerQuote({
          symbol: "BTC/USD",
          close: "120000.00",
          rolling_1d_change: "2.5",
          change: "100.00",
          percent_change: "0.1",
          is_market_open: undefined,
        }),
      }),
    );
    const response = await getMarketQuotes(["AAPL", "BTC"], {
      apiKey: "server-secret",
      displayMode: "live",
      publicDisplayAllowed: true,
      fetchImpl,
      now: NOW,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [rawUrl, init] = fetchImpl.mock.calls[0];
    const url = new URL(String(rawUrl));
    expect(url.origin + url.pathname).toBe("https://api.twelvedata.com/quote");
    expect(url.searchParams.get("symbol")).toBe("AAPL,BTC/USD");
    expect(url.toString()).not.toContain("server-secret");
    expect((init?.headers as Record<string, string>).authorization).toBe(
      "apikey server-secret",
    );
    expect(response.provider).toMatchObject({
      configured: true,
      status: "ok",
      succeededSymbols: ["AAPL", "BTC"],
      fallbackSymbols: [],
    });
    expect(response.quotes[0]).toMatchObject({
      symbol: "AAPL",
      price: 250.5,
      changeBasis: "previous-close",
      mode: "live",
      observedAt: OBSERVED,
      observedAtKind: "provider",
      source: { kind: "twelve-data" },
      freshness: { status: "fresh", isLive: true, ageSeconds: 60 },
    });
    expect(response.quotes[1]).toMatchObject({
      symbol: "BTC",
      price: 120000,
      changePercent: 2.5,
      changeBasis: "rolling-24h",
      mode: "live",
      freshness: { status: "fresh", isLive: true },
    });
    expect(response.quotes[1].change).toBeCloseTo(2926.8293, 3);
    expect(() => QuotesResponseSchema.parse(response)).not.toThrow();
  });

  it("merges a partial provider response with clearly labeled fallback data", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        NVDA: providerQuote({ symbol: "NVDA", close: "199.25" }),
        MRVL: { status: "error", message: "symbol unavailable" },
      }),
    );
    const response = await getMarketQuotes(["NVDA", "MRVL"], {
      apiKey: "server-secret",
      displayMode: "delayed",
      publicDisplayAllowed: true,
      fetchImpl,
      now: NOW,
    });

    expect(response.provider).toMatchObject({
      status: "partial",
      succeededSymbols: ["NVDA"],
      fallbackSymbols: ["MRVL"],
    });
    expect(response.quotes[0]).toMatchObject({
      symbol: "NVDA",
      mode: "delayed",
      source: { kind: "twelve-data" },
    });
    expect(response.quotes[1]).toMatchObject({
      symbol: "MRVL",
      mode: "sample",
      source: { kind: "deterministic-educational-sample" },
    });
  });

  it("rejects a stale SPCX directory match for the former ETF", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        providerQuote({
          symbol: "SPCX",
          name: "The SPAC and New Issue ETF",
          close: "31.50",
        }),
      ),
    );
    const response = await getMarketQuotes(["SPCX"], {
      apiKey: "server-secret",
      displayMode: "delayed",
      publicDisplayAllowed: true,
      fetchImpl,
      now: NOW,
    });

    expect(response.provider).toMatchObject({
      status: "fallback",
      succeededSymbols: [],
      fallbackSymbols: ["SPCX"],
    });
    expect(response.quotes[0]).toMatchObject({
      symbol: "SPCX",
      name: "Space Exploration Technologies Corp.",
      mode: "sample",
    });
  });

  it("fetches bounded adjusted one-year history and sorts it chronologically", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/quote") {
        return Response.json(providerQuote());
      }
      return Response.json({
        meta: { symbol: "AAPL" },
        values: [
          { datetime: "2026-07-14", close: "249.25" },
          { datetime: "2025-07-15", close: "200.00" },
          { datetime: "2026-01-15", close: "225.00" },
        ],
      });
    });
    const response = await getMarketQuotes(["AAPL"], {
      apiKey: "server-secret",
      displayMode: "delayed",
      publicDisplayAllowed: true,
      fetchImpl,
      includeHistory: true,
      now: NOW,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const historyUrl = new URL(String(fetchImpl.mock.calls[1][0]));
    expect(historyUrl.pathname).toBe("/time_series");
    expect(historyUrl.searchParams.get("symbol")).toBe("AAPL");
    expect(historyUrl.searchParams.get("outputsize")).toBe("260");
    expect(historyUrl.searchParams.get("adjust")).toBe("all");
    expect(historyUrl.toString()).not.toContain("server-secret");
    expect(response.quotes[0].history).toMatchObject({
      interval: "1day",
      mode: "delayed",
      startDate: "2025-07-15",
      endDate: "2026-07-14",
      limited: false,
      priceChangePercent: 24.625,
      source: { kind: "twelve-data" },
    });
    expect(response.quotes[0].history?.points.map((point) => point.date)).toEqual([
      "2025-07-15",
      "2026-01-15",
      "2026-07-14",
    ]);
  });

  it("never presents a receipt-time fallback as a fresh or live observation", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        providerQuote({
          timestamp: undefined,
          datetime: undefined,
        }),
      ),
    );
    const response = await getMarketQuotes(["AAPL"], {
      apiKey: "server-secret",
      displayMode: "live",
      publicDisplayAllowed: true,
      fetchImpl,
      now: NOW,
    });

    expect(response.quotes[0]).toMatchObject({
      mode: "live",
      observedAt: NOW.toISOString(),
      observedAtKind: "received",
      freshness: {
        status: "delayed",
        isLive: false,
        ageSeconds: 0,
        label: "Provider observation time unavailable; response receipt time shown",
      },
    });

    const cached = await getMarketQuotes(["AAPL"], {
      apiKey: "server-secret",
      displayMode: "live",
      publicDisplayAllowed: true,
      fetchImpl,
      now: new Date(NOW.getTime() + 60_000),
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(cached.quotes[0].freshness).toMatchObject({
      status: "delayed",
      isLive: false,
      ageSeconds: 60,
    });
  });

  it("rejects provider quotes whose embedded symbol does not match the request", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        AAPL: providerQuote({ symbol: "TSLA" }),
      }),
    );
    const response = await getMarketQuotes(["AAPL"], {
      apiKey: "server-secret",
      displayMode: "delayed",
      publicDisplayAllowed: true,
      fetchImpl,
      now: NOW,
    });

    expect(response.provider).toMatchObject({
      status: "fallback",
      succeededSymbols: [],
      fallbackSymbols: ["AAPL"],
    });
    expect(response.quotes[0]).toMatchObject({
      symbol: "AAPL",
      mode: "sample",
      observedAtKind: "sample",
    });
  });

  it("rejects history whose provider metadata identifies another instrument", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/quote") return Response.json(providerQuote());
      return Response.json({
        meta: { symbol: "TSLA" },
        values: [
          { datetime: "2025-07-15", close: "200.00" },
          { datetime: "2026-07-14", close: "250.00" },
        ],
      });
    });
    const response = await getMarketQuotes(["AAPL"], {
      apiKey: "server-secret",
      displayMode: "delayed",
      publicDisplayAllowed: true,
      fetchImpl,
      includeHistory: true,
      now: NOW,
    });

    expect(response.quotes[0]).toMatchObject({
      mode: "delayed",
      history: {
        mode: "sample",
        source: { kind: "deterministic-educational-sample" },
      },
    });
  });

  it("requests 53 weekly crypto observations and recognizes full-year date coverage", async () => {
    const start = Date.parse("2025-07-16T00:00:00.000Z");
    const values = Array.from({ length: 53 }, (_, index) => ({
      datetime: new Date(start + index * 7 * 86_400_000)
        .toISOString()
        .slice(0, 10),
      close: String(100_000 + index * 500),
    }));
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/quote") {
        return Response.json(
          providerQuote({
            symbol: "BTC/USD",
            close: "126000",
            rolling_1d_change: "1.25",
          }),
        );
      }
      return Response.json({ meta: { symbol: "BTC/USD" }, values });
    });
    const response = await getMarketQuotes(["BTC"], {
      apiKey: "server-secret",
      displayMode: "delayed",
      publicDisplayAllowed: true,
      fetchImpl,
      includeHistory: true,
      now: NOW,
    });

    const historyUrl = new URL(String(fetchImpl.mock.calls[1][0]));
    expect(historyUrl.searchParams.get("symbol")).toBe("BTC/USD");
    expect(historyUrl.searchParams.get("interval")).toBe("1week");
    expect(historyUrl.searchParams.get("outputsize")).toBe("53");
    expect(response.quotes[0].history).toMatchObject({
      interval: "1week",
      startDate: "2025-07-16",
      endDate: "2026-07-15",
      limited: false,
      mode: "delayed",
    });
    expect(response.quotes[0].history?.points).toHaveLength(53);
    expect(() => QuotesResponseSchema.parse(response)).not.toThrow();
  });

  it("marks short provider history as limited based on its date span", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/quote") return Response.json(providerQuote());
      return Response.json({
        meta: { symbol: "AAPL" },
        values: [
          { datetime: "2026-06-15", close: "240.00" },
          { datetime: "2026-07-14", close: "250.00" },
        ],
      });
    });
    const response = await getMarketQuotes(["AAPL"], {
      apiKey: "server-secret",
      displayMode: "delayed",
      publicDisplayAllowed: true,
      fetchImpl,
      includeHistory: true,
      now: NOW,
    });

    expect(response.quotes[0].history).toMatchObject({
      mode: "delayed",
      startDate: "2026-06-15",
      endDate: "2026-07-14",
      limited: true,
    });
  });

  it("uses cached provider observations and survives a complete provider failure", async () => {
    const successFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(providerQuote()));
    const first = await getMarketQuotes(["AAPL"], {
      apiKey: "server-secret",
      displayMode: "delayed",
      publicDisplayAllowed: true,
      fetchImpl: successFetch,
      now: NOW,
    });
    const second = await getMarketQuotes(["AAPL"], {
      apiKey: "server-secret",
      displayMode: "delayed",
      publicDisplayAllowed: true,
      fetchImpl: successFetch,
      now: new Date(NOW.getTime() + 60_000),
    });
    expect(successFetch).toHaveBeenCalledOnce();
    expect(second.quotes[0].price).toBe(first.quotes[0].price);
    expect(first.quotes[0].freshness.ageSeconds).toBe(60);
    expect(second.quotes[0].freshness.ageSeconds).toBe(120);

    resetQuoteCacheForTests();
    const failedFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("upstream unavailable"));
    const fallback = await getMarketQuotes(["AAPL"], {
      apiKey: "server-secret",
      displayMode: "delayed",
      publicDisplayAllowed: true,
      fetchImpl: failedFetch,
      now: NOW,
    });
    expect(fallback.provider.status).toBe("fallback");
    expect(fallback.quotes[0].mode).toBe("sample");
    expect(JSON.stringify(fallback)).not.toContain("upstream unavailable");
  });
});
