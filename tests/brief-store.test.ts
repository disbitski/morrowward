import { afterEach, describe, expect, it, vi } from "vitest";
import { fallbackDailyBrief } from "../src/server/briefs";
import {
  BRIEF_STORE_TIMEOUT_MS,
  hasDurableBriefStore,
  readDailyBrief,
  writeDailyBrief,
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
    expect(await readDailyBrief("2026-07-14")).toBeNull();
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
    await readDailyBrief("2026-07-14", fetchImpl);
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
    const pending = readDailyBrief("2026-07-14", fetchImpl);
    await vi.advanceTimersByTimeAsync(BRIEF_STORE_TIMEOUT_MS + 1);
    await expect(pending).resolves.toBeNull();
  });

  it("writes a validated date-keyed brief with a bounded TTL", async () => {
    process.env.KV_REST_API_URL = "https://example.upstash.test";
    process.env.KV_REST_API_TOKEN = "test-token";
    const brief = fallbackDailyBrief(new Date("2026-07-14T20:00:00.000Z"));
    let requestBody = "";
    const fetchImpl: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ result: "OK" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    expect(await writeDailyBrief("2026-07-14", brief, fetchImpl)).toBe(true);
    const command = JSON.parse(requestBody) as string[];
    expect(command.slice(0, 2)).toEqual(["SET", "morrowward:daily-brief:2026-07-14"]);
    expect(command.at(-2)).toBe("EX");
    expect(Number(command.at(-1))).toBeGreaterThan(0);
  });

  it("validates a shared brief before serving it", async () => {
    process.env.KV_REST_API_URL = "https://example.upstash.test";
    process.env.KV_REST_API_TOKEN = "test-token";
    const brief = fallbackDailyBrief(new Date("2026-07-14T20:00:00.000Z"));
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ result: JSON.stringify(brief) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    await expect(readDailyBrief("2026-07-14", fetchImpl)).resolves.toEqual(brief);
  });
});
