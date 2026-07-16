import { afterEach, describe, expect, it, vi } from "vitest";
import { fallbackDailyBrief } from "../src/server/briefs";
import {
  BRIEF_STORE_TIMEOUT_MS,
  claimDailyBriefRefresh,
  hasDurableBriefStore,
  readLatestDailyBrief,
  writeLatestDailyBrief,
} from "../src/server/brief-store";

const originalUrl = process.env.KV_REST_API_URL;
const originalToken = process.env.KV_REST_API_TOKEN;
const originalUpstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const originalUpstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

afterEach(() => {
  if (originalUrl === undefined) delete process.env.KV_REST_API_URL;
  else process.env.KV_REST_API_URL = originalUrl;
  if (originalToken === undefined) delete process.env.KV_REST_API_TOKEN;
  else process.env.KV_REST_API_TOKEN = originalToken;
  if (originalUpstashUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = originalUpstashUrl;
  if (originalUpstashToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = originalUpstashToken;
  vi.useRealTimers();
});

describe("durable daily brief store", () => {
  it("is optional and safely unavailable without credentials", async () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    expect(hasDurableBriefStore()).toBe(false);
    expect(await readLatestDailyBrief()).toBeNull();
    await expect(claimDailyBriefRefresh("2026-07-14")).resolves.toEqual({
      status: "not-configured",
    });
  });

  it("uses a complete Upstash pair when blank KV variables are present", async () => {
    process.env.KV_REST_API_URL = "";
    process.env.KV_REST_API_TOKEN = "";
    process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token";
    let requestedUrl = "";
    const fetchImpl: typeof fetch = async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ result: null }), { status: 200 });
    };
    await readLatestDailyBrief(fetchImpl);
    expect(requestedUrl).toBe("https://upstash.example.test");
  });

  it("times out a stalled store read and returns the safe fallback signal", async () => {
    vi.useFakeTimers();
    process.env.KV_REST_API_URL = "https://example.upstash.test";
    process.env.KV_REST_API_TOKEN = "test-token";
    const fetchImpl: typeof fetch = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    const pending = readLatestDailyBrief(fetchImpl);
    await vi.advanceTimersByTimeAsync(BRIEF_STORE_TIMEOUT_MS + 1);
    await expect(pending).resolves.toBeNull();
  });

  it("writes the latest validated brief with a 48-hour TTL", async () => {
    process.env.KV_REST_API_URL = "https://example.upstash.test";
    process.env.KV_REST_API_TOKEN = "test-token";
    const brief = fallbackDailyBrief();
    let requestBody = "";
    const fetchImpl: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ result: "OK" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    expect(await writeLatestDailyBrief(brief, fetchImpl)).toBe(true);
    const command = JSON.parse(requestBody) as string[];
    expect(command.slice(0, 2)).toEqual([
      "SET",
      "morrowward:daily-brief:latest",
    ]);
    expect(command.at(-2)).toBe("EX");
    expect(Number(command.at(-1))).toBe(60 * 60 * 48);
  });

  it("reads and validates the latest shared brief", async () => {
    process.env.KV_REST_API_URL = "https://example.upstash.test";
    process.env.KV_REST_API_TOKEN = "test-token";
    const brief = fallbackDailyBrief();
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ result: JSON.stringify(brief) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    await expect(readLatestDailyBrief(fetchImpl)).resolves.toEqual(brief);
  });

  it("rejects malformed or schema-invalid latest values", async () => {
    process.env.KV_REST_API_URL = "https://example.upstash.test";
    process.env.KV_REST_API_TOKEN = "test-token";
    const malformedFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ result: "not-json" }), { status: 200 });
    const invalidFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ result: JSON.stringify({ headline: 42 }) }), {
        status: 200,
      });

    await expect(readLatestDailyBrief(malformedFetch)).resolves.toBeNull();
    await expect(readLatestDailyBrief(invalidFetch)).resolves.toBeNull();
  });

  it("claims a per-Eastern-day refresh window with a 12-hour NX lock", async () => {
    process.env.KV_REST_API_URL = "https://example.upstash.test";
    process.env.KV_REST_API_TOKEN = "test-token";
    let requestBody = "";
    const fetchImpl: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ result: "OK" }), { status: 200 });
    };

    await expect(
      claimDailyBriefRefresh("2026-07-16", fetchImpl),
    ).resolves.toEqual({ status: "claimed" });
    expect(JSON.parse(requestBody)).toEqual([
      "SET",
      "morrowward:daily-brief:refresh-lock:2026-07-16",
      "2026-07-16",
      "NX",
      "EX",
      String(60 * 60 * 12),
    ]);
  });

  it("reports contended and unavailable refresh claims distinctly", async () => {
    process.env.KV_REST_API_URL = "https://example.upstash.test";
    process.env.KV_REST_API_TOKEN = "test-token";
    const contendedFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ result: null }), { status: 200 });
    const unavailableFetch: typeof fetch = async () =>
      new Response("unavailable", { status: 503 });

    await expect(
      claimDailyBriefRefresh("2026-07-16", contendedFetch),
    ).resolves.toEqual({ status: "contended" });
    await expect(
      claimDailyBriefRefresh("2026-07-16", unavailableFetch),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("rejects an unsafe refresh-date key", async () => {
    await expect(
      claimDailyBriefRefresh("../../other-key"),
    ).rejects.toThrow(/YYYY-MM-DD/u);
  });
});
