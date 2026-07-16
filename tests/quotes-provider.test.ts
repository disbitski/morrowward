import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QUOTE_SYMBOLS, QuotesResponseSchema, type QuoteSymbol } from "../src/contracts";
import { EDUCATIONAL_QUOTES } from "../src/data";
import {
  MarketQuoteRefreshError,
  ensureCurrentMarketQuoteSnapshot,
  getMarketQuotes,
  parseQuoteHistory,
  parseQuoteSymbols,
  refreshMarketQuoteSnapshot,
  resetQuoteCacheForTests,
} from "../src/server/quotes";

const NOW = new Date("2026-07-15T20:30:00.000Z");
const OBSERVED = "2026-07-15T20:29:00.000Z";

const IDENTITIES: Readonly<Record<QuoteSymbol, string>> = {
  VTI: "Vanguard Total Stock Market ETF",
  BND: "Vanguard Total Bond Market ETF",
  AAPL: "Apple Inc.",
  TSLA: "Tesla, Inc.",
  SPCX: "Space Exploration Technologies Corp. (SpaceX)",
  NVDA: "NVIDIA Corporation",
  MRVL: "Marvell Technology, Inc.",
  MU: "Micron Technology, Inc.",
  AVGO: "Broadcom Inc.",
  BTC: "Bitcoin",
  ETH: "Ether (Ethereum)",
};

function modelQuote(
  symbol: QuoteSymbol,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const asset = EDUCATIONAL_QUOTES[symbol];
  const price = 100 + QUOTE_SYMBOLS.indexOf(symbol) * 10;
  return {
    symbol,
    instrumentName: IDENTITIES[symbol],
    assetType: asset.assetType,
    currency: "USD",
    price,
    referencePrice: price - 1,
    changeBasis: asset.assetType === "crypto" ? "rolling-24h" : "previous-close",
    observedAt: OBSERVED,
    marketStatus: asset.assetType === "crypto" ? "open" : "closed",
    ...overrides,
  };
}

function allModelQuotes(): Record<string, unknown>[] {
  return QUOTE_SYMBOLS.map((symbol) => modelQuote(symbol));
}

function responsesPayload(options: {
  annotations?: unknown[];
  quotes?: unknown[];
  responseStatus?: string;
  searchStatus?: string;
  sources?: unknown[];
} = {}): Record<string, unknown> {
  const text = JSON.stringify({ quotes: options.quotes ?? allModelQuotes() });
  return {
    status: options.responseStatus ?? "completed",
    output: [
      {
        type: "web_search_call",
        status: options.searchStatus ?? "completed",
        action: {
          type: "search",
          sources: options.sources ?? [{ type: "oai-finance" }],
        },
      },
      {
        type: "message",
        status: "completed",
        content: [
          {
            type: "output_text",
            text,
            annotations: options.annotations ?? [],
          },
        ],
      },
    ],
  };
}

describe("GPT-5.6 educational quote snapshots", () => {
  beforeEach(() => {
    resetQuoteCacheForTests();
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("keeps the request universe allowlisted and history bounded to one symbol", () => {
    expect(parseQuoteSymbols("spcx,nvda,avgo")).toEqual({
      ok: true,
      symbols: ["SPCX", "NVDA", "AVGO"],
    });
    expect(parseQuoteSymbols("AAPL,GME")).toEqual({
      ok: false,
      unknown: ["GME"],
    });
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

  it("serves deterministic data without spending when OpenAI is not configured", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const response = await getMarketQuotes(["AAPL"], {
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
      lastSuccessfulUpdate: null,
    });
    expect(response.quotes[0]).toMatchObject({
      mode: "sample",
      source: { kind: "deterministic-educational-sample" },
      history: { mode: "sample", interval: "1week" },
    });
    expect(() => QuotesResponseSchema.parse(response)).not.toThrow();
  });

  it("reports a configured provider while a missing snapshot safely falls back", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const response = await getMarketQuotes(["AAPL"], {
      apiKey: "server-secret",
      fetchImpl,
      now: NOW,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(response.provider).toEqual({
      name: "OpenAI web search",
      configured: true,
      status: "fallback",
      succeededSymbols: [],
      fallbackSymbols: ["AAPL"],
      lastSuccessfulUpdate: null,
    });
    expect(response.quotes[0].source.kind).toBe(
      "deterministic-educational-sample",
    );
  });

  it("batches the full allowlist in one forced, sourced, server-only web search", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json(responsesPayload()));

    const response = await refreshMarketQuoteSnapshot({
      apiKey: "server-secret",
      fetchImpl,
      now: NOW,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [rawUrl, init] = fetchImpl.mock.calls[0];
    expect(String(rawUrl)).toBe("https://api.openai.com/v1/responses");
    expect((init?.headers as Record<string, string>).authorization).toBe(
      "Bearer server-secret",
    );
    expect(String(rawUrl)).not.toContain("server-secret");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: "gpt-5.6",
      store: false,
      reasoning: { effort: "low" },
      tools: [
        {
          type: "web_search",
          search_context_size: "low",
          external_web_access: true,
        },
      ],
      tool_choice: "required",
      max_tool_calls: 1,
      include: ["web_search_call.action.sources"],
      text: {
        format: {
          type: "json_schema",
          name: "morrowward_quote_snapshot",
          strict: true,
        },
      },
    });
    const input = JSON.parse(body.input);
    expect(input.instruments.map((asset: { symbol: string }) => asset.symbol)).toEqual(
      QUOTE_SYMBOLS,
    );
    expect(JSON.stringify(body)).not.toContain("server-secret");

    expect(response.provider).toEqual({
      name: "OpenAI web search",
      configured: true,
      status: "ok",
      succeededSymbols: [...QUOTE_SYMBOLS],
      fallbackSymbols: [],
      lastSuccessfulUpdate: NOW.toISOString(),
    });
    expect(response.generatedAt).toBe(NOW.toISOString());
    expect(response.quotes[0]).toMatchObject({
      symbol: "VTI",
      price: 100,
      change: 1,
      changeBasis: "previous-close",
      observedAt: OBSERVED,
      observedAtKind: "provider",
      mode: "delayed",
      source: { name: "OpenAI web search", kind: "openai-web-search" },
      freshness: { status: "delayed", isLive: false, ageSeconds: 60 },
    });
    expect(response.quotes[0].source.url).toBeUndefined();
    expect(() => QuotesResponseSchema.parse(response)).not.toThrow();
  });

  it("binds a validated URL citation only to the asset object it annotates", async () => {
    const text = JSON.stringify({ quotes: allModelQuotes() });
    const firstQuoteText = JSON.stringify(allModelQuotes()[0]);
    const firstQuoteStart = text.indexOf(firstQuoteText);
    const citation = {
      type: "url_citation",
      start_index: firstQuoteStart,
      end_index: firstQuoteStart + firstQuoteText.length,
      url: "https://example.com/market-snapshot#latest",
      title: "Market snapshot",
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        responsesPayload({
          annotations: [citation],
          sources: [{ type: "url", url: citation.url }],
        }),
      ),
    );

    const response = await refreshMarketQuoteSnapshot({
      apiKey: "server-secret",
      fetchImpl,
      now: NOW,
    });

    expect(response.quotes[0].source).toEqual({
      name: "OpenAI web search",
      kind: "openai-web-search",
      url: "https://example.com/market-snapshot",
      citations: [
        {
          title: "Market snapshot",
          url: "https://example.com/market-snapshot",
        },
      ],
    });
    expect(response.provider.succeededSymbols).toEqual(["VTI"]);
    expect(response.quotes[1].source.kind).toBe(
      "deterministic-educational-sample",
    );
  });

  it("does not trust a URL annotation absent from the completed search sources", async () => {
    const text = JSON.stringify({ quotes: allModelQuotes() });
    const firstQuoteText = JSON.stringify(allModelQuotes()[0]);
    const firstQuoteStart = text.indexOf(firstQuoteText);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        responsesPayload({
          annotations: [
            {
              type: "url_citation",
              start_index: firstQuoteStart,
              end_index: firstQuoteStart + firstQuoteText.length,
              url: "https://unreturned.example.test/quote",
              title: "Unreturned source",
            },
          ],
          sources: [{ type: "url", url: "https://example.com/other" }],
        }),
      ),
    );

    await expect(
      refreshMarketQuoteSnapshot({
        apiKey: "server-secret",
        fetchImpl,
        now: NOW,
      }),
    ).rejects.toMatchObject({ reason: "provider_unavailable" });
  });

  it("rejects model-memory-only output without completed sourced search evidence", async () => {
    const noEvidenceFetch = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(responsesPayload({ sources: [], annotations: [] })),
    );
    await expect(
      refreshMarketQuoteSnapshot({
        apiKey: "server-secret",
        fetchImpl: noEvidenceFetch,
        now: NOW,
      }),
    ).rejects.toMatchObject({
      name: "MarketQuoteRefreshError",
      reason: "provider_unavailable",
    });

    resetQuoteCacheForTests();
    const incompleteSearchFetch = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(responsesPayload({ searchStatus: "incomplete" })),
    );
    await expect(
      refreshMarketQuoteSnapshot({
        apiKey: "server-secret",
        fetchImpl: incompleteSearchFetch,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(MarketQuoteRefreshError);
  });

  it("falls back per symbol for duplicates, wrong instruments, and invalid timestamps", async () => {
    const quotes: unknown[] = [
      modelQuote("VTI"),
      modelQuote("BND"),
      modelQuote("AAPL", { instrumentName: "Tesla, Inc." }),
      modelQuote("TSLA", { observedAt: "2026-07-16T20:30:00.000Z" }),
      modelQuote("SPCX", { instrumentName: "The SPAC and New Issue ETF" }),
      modelQuote("NVDA"),
      modelQuote("NVDA", { price: 200 }),
      modelQuote("MRVL"),
      modelQuote("MU"),
      modelQuote("AVGO"),
      modelQuote("BTC", { referencePrice: null, changeBasis: "previous-close" }),
      modelQuote("ETH"),
    ];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(responsesPayload({ quotes })));

    const response = await refreshMarketQuoteSnapshot({
      apiKey: "server-secret",
      fetchImpl,
      now: NOW,
    });

    expect(response.provider.status).toBe("partial");
    expect(response.provider.succeededSymbols).toEqual([
      "VTI",
      "BND",
      "MRVL",
      "MU",
      "AVGO",
      "ETH",
    ]);
    expect(response.provider.fallbackSymbols).toEqual([
      "AAPL",
      "TSLA",
      "SPCX",
      "NVDA",
      "BTC",
    ]);
    for (const symbol of response.provider.fallbackSymbols) {
      expect(response.quotes.find((quote) => quote.symbol === symbol)?.source.kind).toBe(
        "deterministic-educational-sample",
      );
    }
    expect(() => QuotesResponseSchema.parse(response)).not.toThrow();
  });

  it("allows extended stock-market closures but rejects old stock and crypto observations", async () => {
    const quotes = [
      modelQuote("VTI", {
        observedAt: new Date(NOW.getTime() - 95 * 60 * 60_000).toISOString(),
      }),
      modelQuote("BND", {
        observedAt: new Date(NOW.getTime() - 97 * 60 * 60_000).toISOString(),
      }),
      modelQuote("BTC", {
        observedAt: new Date(NOW.getTime() - 5 * 60 * 60_000).toISOString(),
      }),
      modelQuote("ETH", {
        observedAt: new Date(NOW.getTime() - 7 * 60 * 60_000).toISOString(),
      }),
    ];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(responsesPayload({ quotes })));

    const response = await refreshMarketQuoteSnapshot({
      apiKey: "server-secret",
      fetchImpl,
      now: NOW,
    });

    expect(response.provider.succeededSymbols).toEqual(["VTI", "BTC"]);
    expect(response.provider.fallbackSymbols).toContain("BND");
    expect(response.provider.fallbackSymbols).toContain("ETH");
  });

  it("does not treat a fresh success timestamp as masking stale observations", async () => {
    const seedFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(responsesPayload()));
    const seed = await refreshMarketQuoteSnapshot({
      apiKey: "server-secret",
      fetchImpl: seedFetch,
      now: NOW,
    });
    const masked = {
      ...seed,
      quotes: seed.quotes.map((quote) =>
        quote.symbol === "BTC"
          ? {
              ...quote,
              asOf: new Date(NOW.getTime() - 7 * 60 * 60_000).toISOString(),
              observedAt: new Date(
                NOW.getTime() - 7 * 60 * 60_000,
              ).toISOString(),
            }
          : quote,
      ),
    };

    resetQuoteCacheForTests();
    vi.stubEnv("KV_REST_API_URL", "https://kv.example.test");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-secret");
    const storeFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ result: JSON.stringify(masked) }))
      .mockResolvedValueOnce(Response.json({ result: "OK" }))
      .mockResolvedValueOnce(Response.json({ result: "OK" }));
    const refreshFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(responsesPayload()));

    const refreshed = await ensureCurrentMarketQuoteSnapshot({
      apiKey: "server-secret",
      fetchImpl: refreshFetch,
      storeFetchImpl: storeFetch,
      now: NOW,
    });

    expect(refreshFetch).toHaveBeenCalledOnce();
    expect(refreshed?.quotes.find((quote) => quote.symbol === "BTC")?.observedAt).toBe(
      OBSERVED,
    );
  });

  it("serves a current generated snapshot without another OpenAI call", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(responsesPayload()));
    const generated = await refreshMarketQuoteSnapshot({
      apiKey: "server-secret",
      fetchImpl,
      now: NOW,
    });
    const read = await getMarketQuotes(["AAPL"], {
      apiKey: "server-secret",
      fetchImpl,
      includeHistory: true,
      now: new Date(NOW.getTime() + 23 * 60 * 60_000),
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(read.generatedAt).toBe(generated.generatedAt);
    expect(read.provider.lastSuccessfulUpdate).toBe(NOW.toISOString());
    expect(read.quotes[0]).toMatchObject({
      symbol: "AAPL",
      source: { kind: "openai-web-search" },
      freshness: { status: "delayed", isLive: false },
      history: {
        mode: "sample",
        source: { kind: "deterministic-educational-sample" },
      },
    });
    expect(read.quotes[0].freshness.ageSeconds).toBe(82_860);
  });

  it("refreshes on the next UTC cron day even when less than 24 hours elapsed", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json(responsesPayload()));
    await refreshMarketQuoteSnapshot({
      apiKey: "server-secret",
      fetchImpl,
      now: NOW,
      refreshPolicy: "utc-day",
    });

    const nextCron = new Date(NOW.getTime() + 24 * 60 * 60_000 - 5_000);
    const refreshed = await refreshMarketQuoteSnapshot({
      apiKey: "server-secret",
      fetchImpl,
      now: nextCron,
      refreshPolicy: "utc-day",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(refreshed.provider.lastSuccessfulUpdate).toBe(nextCron.toISOString());
  });

  it("singleflights concurrent first-load refreshes without a durable store", async () => {
    let release: ((response: Response) => void) | undefined;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );

    const first = ensureCurrentMarketQuoteSnapshot({
      apiKey: "server-secret",
      fetchImpl,
      now: NOW,
    });
    const second = ensureCurrentMarketQuoteSnapshot({
      apiKey: "server-secret",
      fetchImpl,
      now: NOW,
    });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
    release!(Response.json(responsesPayload()));

    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(firstResponse?.provider.lastSuccessfulUpdate).toBe(NOW.toISOString());
    expect(secondResponse?.provider.lastSuccessfulUpdate).toBe(NOW.toISOString());
  });

  it("uses a durable NX lock, persists for 48 hours, and reads the shared snapshot", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://kv.example.test");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-secret");
    const apiFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(responsesPayload()));
    const storeFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ result: null }))
      .mockResolvedValueOnce(Response.json({ result: "OK" }))
      .mockResolvedValueOnce(Response.json({ result: "OK" }));

    const generated = await refreshMarketQuoteSnapshot({
      apiKey: "server-secret",
      fetchImpl: apiFetch,
      storeFetchImpl: storeFetch,
      now: NOW,
    });

    expect(apiFetch).toHaveBeenCalledOnce();
    expect(storeFetch).toHaveBeenCalledTimes(3);
    const lockCommand = JSON.parse(String(storeFetch.mock.calls[1][1]?.body));
    expect(lockCommand).toEqual([
      "SET",
      "morrowward:quotes:refresh-lock",
      NOW.toISOString(),
      "NX",
      "EX",
      "43200",
    ]);
    const writeCommand = JSON.parse(String(storeFetch.mock.calls[2][1]?.body));
    expect(writeCommand[0]).toBe("SET");
    expect(writeCommand[1]).toBe("morrowward:quotes:latest");
    expect(writeCommand.slice(-2)).toEqual(["EX", "172800"]);
    expect(JSON.stringify(storeFetch.mock.calls)).not.toContain("server-secret");

    resetQuoteCacheForTests();
    const readStoreFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ result: JSON.stringify(generated) }));
    const shouldNotCallOpenAI = vi.fn<typeof fetch>();
    const read = await getMarketQuotes(["NVDA"], {
      apiKey: "server-secret",
      fetchImpl: shouldNotCallOpenAI,
      storeFetchImpl: readStoreFetch,
      now: new Date(NOW.getTime() + 60_000),
    });

    expect(readStoreFetch).toHaveBeenCalledOnce();
    expect(shouldNotCallOpenAI).not.toHaveBeenCalled();
    expect(read.generatedAt).toBe(generated.generatedAt);
    expect(read.quotes[0].symbol).toBe("NVDA");
  });

  it("a durable lock loser returns fallback without making another OpenAI request", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://kv.example.test");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-secret");
    const storeFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ result: null }))
      .mockResolvedValueOnce(Response.json({ result: null }))
      .mockResolvedValueOnce(Response.json({ result: null }))
      .mockResolvedValueOnce(Response.json({ result: null }));
    const apiFetch = vi.fn<typeof fetch>();

    const ensured = await ensureCurrentMarketQuoteSnapshot({
      apiKey: "server-secret",
      fetchImpl: apiFetch,
      storeFetchImpl: storeFetch,
      now: NOW,
    });
    const response = await getMarketQuotes(["AAPL"], {
      storeFetchImpl: storeFetch,
      now: NOW,
    });

    expect(ensured).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(response.provider.status).toBe("not-configured");
    expect(response.quotes[0].mode).toBe("sample");
    expect(storeFetch).toHaveBeenCalledTimes(2);
  });

  it("distinguishes durable lock contention from a durable-store outage", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://kv.example.test");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-secret");
    const contendedStore = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ result: null }))
      .mockResolvedValueOnce(Response.json({ result: null }));

    await expect(
      refreshMarketQuoteSnapshot({
        apiKey: "server-secret",
        fetchImpl: vi.fn<typeof fetch>(),
        storeFetchImpl: contendedStore,
        now: NOW,
      }),
    ).rejects.toMatchObject({ reason: "refresh_contended" });

    resetQuoteCacheForTests();
    const unavailableStore = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ result: null }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    const apiFetch = vi.fn<typeof fetch>();
    await expect(
      refreshMarketQuoteSnapshot({
        apiKey: "server-secret",
        fetchImpl: apiFetch,
        storeFetchImpl: unavailableStore,
        now: NOW,
      }),
    ).rejects.toMatchObject({ reason: "store_unavailable" });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("briefly caches durable misses and outages for public reads", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://kv.example.test");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-secret");
    const missedStore = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ result: null }));

    await getMarketQuotes(["AAPL"], { storeFetchImpl: missedStore, now: NOW });
    await getMarketQuotes(["AAPL"], {
      storeFetchImpl: missedStore,
      now: new Date(NOW.getTime() + 10_000),
    });
    expect(missedStore).toHaveBeenCalledOnce();

    resetQuoteCacheForTests();
    const unavailableStore = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("unavailable", { status: 503 }));
    await getMarketQuotes(["AAPL"], {
      storeFetchImpl: unavailableStore,
      now: NOW,
    });
    await getMarketQuotes(["AAPL"], {
      storeFetchImpl: unavailableStore,
      now: new Date(NOW.getTime() + 10_000),
    });
    expect(unavailableStore).toHaveBeenCalledOnce();
  });

  it("lets observation reads bypass a cached durable miss", async () => {
    const apiFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(responsesPayload()));
    const generated = await refreshMarketQuoteSnapshot({
      apiKey: "server-secret",
      fetchImpl: apiFetch,
      now: NOW,
    });

    resetQuoteCacheForTests();
    vi.stubEnv("KV_REST_API_URL", "https://kv.example.test");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-secret");
    const storeFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ result: null }))
      .mockResolvedValueOnce(
        Response.json({ result: JSON.stringify(generated) }),
      );

    const initial = await getMarketQuotes(["AAPL"], {
      apiKey: "server-secret",
      storeFetchImpl: storeFetch,
      now: NOW,
    });
    const observed = await getMarketQuotes(["AAPL"], {
      apiKey: "server-secret",
      bypassDurableReadCache: true,
      storeFetchImpl: storeFetch,
      now: new Date(NOW.getTime() + 10_000),
    });

    expect(initial.provider.lastSuccessfulUpdate).toBeNull();
    expect(observed.provider.lastSuccessfulUpdate).toBe(NOW.toISOString());
    expect(observed.quotes[0].source.kind).toBe("openai-web-search");
    expect(storeFetch).toHaveBeenCalledTimes(2);
  });

  it("reports a durable write failure without replacing the last good snapshot", async () => {
    const firstFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(responsesPayload()));
    const previous = await refreshMarketQuoteSnapshot({
      apiKey: "server-secret",
      fetchImpl: firstFetch,
      now: NOW,
    });

    vi.stubEnv("KV_REST_API_URL", "https://kv.example.test");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-secret");
    const later = new Date(NOW.getTime() + 25 * 60 * 60_000);
    const storeFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ result: JSON.stringify(previous) }),
      )
      .mockResolvedValueOnce(Response.json({ result: "OK" }))
      .mockResolvedValueOnce(new Response("write failed", { status: 503 }));
    const secondFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(responsesPayload()));

    await expect(
      refreshMarketQuoteSnapshot({
        apiKey: "server-secret",
        fetchImpl: secondFetch,
        storeFetchImpl: storeFetch,
        now: later,
      }),
    ).rejects.toMatchObject({ reason: "store_unavailable" });

    const afterFailure = await getMarketQuotes(["AAPL"], {
      storeFetchImpl: storeFetch,
      now: later,
    });
    expect(secondFetch).toHaveBeenCalledOnce();
    expect(afterFailure.generatedAt).toBe(previous.generatedAt);
    expect(afterFailure.provider.lastSuccessfulUpdate).toBe(NOW.toISOString());
  });

  it("keeps the previous <=48-hour snapshot when a stale refresh fails", async () => {
    const successFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(responsesPayload()));
    const first = await refreshMarketQuoteSnapshot({
      apiKey: "server-secret",
      fetchImpl: successFetch,
      now: NOW,
    });
    const failedFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("upstream unavailable"));
    const later = new Date(NOW.getTime() + 25 * 60 * 60_000);
    await ensureCurrentMarketQuoteSnapshot({
      apiKey: "server-secret",
      fetchImpl: failedFetch,
      now: later,
    });
    const fallback = await getMarketQuotes(["AAPL"], {
      now: later,
    });

    expect(failedFetch).toHaveBeenCalledOnce();
    expect(fallback.generatedAt).toBe(first.generatedAt);
    expect(fallback.provider.lastSuccessfulUpdate).toBe(NOW.toISOString());
    expect(fallback.quotes[0].source.kind).toBe("openai-web-search");
    expect(fallback.quotes[0].freshness.status).toBe("stale");
  });

  it("expires snapshots after 48 hours and degrades to deterministic data", async () => {
    const successFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(responsesPayload()));
    await refreshMarketQuoteSnapshot({
      apiKey: "server-secret",
      fetchImpl: successFetch,
      now: NOW,
    });
    const failedFetch = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    const expiredAt = new Date(NOW.getTime() + 49 * 60 * 60_000);
    await ensureCurrentMarketQuoteSnapshot({
      apiKey: "server-secret",
      fetchImpl: failedFetch,
      now: expiredAt,
    });
    const response = await getMarketQuotes(["AAPL"], {
      now: expiredAt,
    });

    expect(response.provider.lastSuccessfulUpdate).toBeNull();
    expect(response.quotes[0].source.kind).toBe(
      "deterministic-educational-sample",
    );
  });
});
