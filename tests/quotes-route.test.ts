import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/v1/quotes/route";
import { setRateLimiterForTests } from "../src/server/rate-limit";

const getMarketQuotes = vi.hoisted(() => vi.fn());
const ensureCurrentMarketQuoteSnapshot = vi.hoisted(() => vi.fn());

vi.mock("next/server", () => ({
  after: (work: () => unknown) => {
    void work();
  },
}));

vi.mock("../src/server/quotes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/server/quotes")>();
  return {
    ...actual,
    getMarketQuotes,
    ensureCurrentMarketQuoteSnapshot,
  };
});

function quoteResponse(lastSuccessfulUpdate: string | null) {
  return {
    quotes: [],
    allowlist: [],
    generatedAt: "2026-07-16T17:01:45.544Z",
    provider: {
      name: "OpenAI web search",
      configured: true,
      status: lastSuccessfulUpdate ? "partial" : "fallback",
      succeededSymbols: [],
      fallbackSymbols: [],
      lastSuccessfulUpdate,
    },
    disclosure: "Educational simulation only.",
  };
}

describe.sequential("public quote route cache behavior", () => {
  beforeEach(() => {
    setRateLimiterForTests();
    getMarketQuotes.mockReset();
    ensureCurrentMarketQuoteSnapshot.mockReset().mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not edge-cache the fallback that starts first-load recovery", async () => {
    getMarketQuotes.mockResolvedValue(quoteResponse(null));

    const response = await GET(
      new Request("https://morrowward.test/api/v1/quotes"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getMarketQuotes).toHaveBeenCalledWith(expect.any(Array), {
      bypassDurableReadCache: false,
      includeHistory: false,
    });
    expect(ensureCurrentMarketQuoteSnapshot).toHaveBeenCalledOnce();
  });

  it("lets observation reads bypass a warm durable-store miss", async () => {
    getMarketQuotes.mockResolvedValue(
      quoteResponse("2026-07-16T17:01:45.544Z"),
    );

    const response = await GET(
      new Request("https://morrowward.test/api/v1/quotes?observe=1"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getMarketQuotes).toHaveBeenCalledWith(expect.any(Array), {
      bypassDurableReadCache: true,
      includeHistory: false,
    });
    expect(ensureCurrentMarketQuoteSnapshot).not.toHaveBeenCalled();
  });

  it("briefly edge-caches only a saved successful snapshot", async () => {
    getMarketQuotes.mockResolvedValue(
      quoteResponse("2026-07-16T17:01:45.544Z"),
    );

    const response = await GET(
      new Request("https://morrowward.test/api/v1/quotes"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=300, stale-while-revalidate=900",
    );
  });
});
