import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../app/api/v1/quotes/generate/route";
import { setRateLimiterForTests } from "../src/server/rate-limit";

const quoteRefresh = vi.hoisted(() => vi.fn());

vi.mock("../src/server/quotes", () => ({
  refreshMarketQuoteSnapshot: quoteRefresh,
}));

const snapshot = {
  quotes: [],
  allowlist: [],
  generatedAt: "2026-07-15T22:15:00.000Z",
  provider: {
    name: null,
    configured: false,
    status: "not-configured",
    succeededSymbols: [],
    fallbackSymbols: [],
    lastSuccessfulUpdate: null,
  },
  disclosure: "Educational simulation only.",
};

function cronRequest(token?: string): Request {
  return new Request("https://morrowward.test/api/v1/quotes/generate", {
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "user-agent": "vercel-cron/1.0",
    },
  });
}

describe.sequential("daily quote snapshot route", () => {
  beforeEach(() => {
    setRateLimiterForTests();
    quoteRefresh.mockReset().mockResolvedValue(snapshot);
    vi.stubEnv("CRON_SECRET", "cron-test-token");
    vi.stubEnv("ADMIN_API_TOKEN", "admin-test-token");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects an unauthenticated scheduler request before refreshing", async () => {
    const response = await GET(cronRequest());

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(quoteRefresh).not.toHaveBeenCalled();
  });

  it("accepts Vercel Cron's authenticated GET and disables response caching", async () => {
    const response = await GET(cronRequest("cron-test-token"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(quoteRefresh).toHaveBeenCalledTimes(1);
    expect(quoteRefresh).toHaveBeenCalledWith({ refreshPolicy: "utc-day" });
    await expect(response.json()).resolves.toMatchObject({
      provider: { status: "not-configured", lastSuccessfulUpdate: null },
    });
  });

  it("allows an authenticated JSON POST for an operator-controlled refresh", async () => {
    const response = await POST(
      new Request("https://morrowward.test/api/v1/quotes/generate", {
        method: "POST",
        headers: {
          authorization: "Bearer admin-test-token",
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(201);
    expect(quoteRefresh).toHaveBeenCalledTimes(1);
    expect(quoteRefresh).toHaveBeenCalledWith({ refreshPolicy: "rolling" });
  });

  it("returns a generic 503 without leaking an upstream error", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    quoteRefresh.mockRejectedValueOnce(
      new Error("upstream response contained secret diagnostics"),
    );

    const response = await GET(cronRequest("cron-test-token"));
    const raw = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(raw).not.toContain("secret diagnostics");
    expect(JSON.parse(raw)).toMatchObject({
      error: { code: "service_unavailable" },
    });
    expect(warning).toHaveBeenCalledWith(
      "Morrowward daily quote refresh failed safely.",
      { reason: "Error" },
    );
  });

  it("rate-limits repeated generation attempts", async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 7; index += 1) {
      statuses.push((await GET(cronRequest("cron-test-token"))).status);
    }

    expect(statuses.slice(0, 6)).toEqual(Array(6).fill(200));
    expect(statuses[6]).toBe(429);
    expect(quoteRefresh).toHaveBeenCalledTimes(6);
  });
});
