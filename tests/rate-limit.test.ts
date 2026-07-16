import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enforceGlobalRateLimit,
  productionAiRequiresDurableRateLimiter,
  RateLimitStoreUnavailableError,
  RedisRateLimiter,
  setRateLimiterForTests,
} from "../src/server/rate-limit";

function sharedRedisFetch() {
  const counters = new Map<string, number>();
  return vi.fn<typeof fetch>(async (_input, init) => {
    const command = JSON.parse(String(init?.body)) as string[];
    const key = command[3];
    const ttlMs = Number(command[4]);
    const count = (counters.get(key) ?? 0) + 1;
    counters.set(key, count);
    return Response.json({ result: [count, ttlMs] });
  });
}

describe("shared Redis fixed-window rate limits", () => {
  afterEach(() => {
    setRateLimiterForTests();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("requires durable limits only for Vercel Production AI traffic", () => {
    vi.stubEnv("OPENAI_API_KEY", "server-secret");
    vi.stubEnv("VERCEL_TARGET_ENV", "");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(productionAiRequiresDurableRateLimiter()).toBe(true);

    vi.stubEnv("VERCEL_ENV", "preview");
    expect(productionAiRequiresDurableRateLimiter()).toBe(false);

    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL_TARGET_ENV", "production");
    expect(productionAiRequiresDurableRateLimiter()).toBe(true);

    vi.stubEnv("VERCEL_TARGET_ENV", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(productionAiRequiresDurableRateLimiter()).toBe(false);
  });

  it("lets tests clear overrides and select the durable runtime after env changes", async () => {
    const fetchImpl = sharedRedisFetch();
    vi.stubEnv("KV_REST_API_URL", "https://redis.example.test");
    vi.stubEnv("KV_REST_API_TOKEN", "redis-secret");
    vi.stubGlobal("fetch", fetchImpl);
    setRateLimiterForTests(null);

    const result = await enforceGlobalRateLimit("education-daily", {
      limit: 100,
      windowMs: 24 * 60 * 60_000,
      failClosed: true,
    });

    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("uses one atomic EVAL counter across independent server instances", async () => {
    const fetchImpl = sharedRedisFetch();
    const credentials = {
      url: "https://redis.example.test",
      token: "redis-secret",
    };
    const firstInstance = new RedisRateLimiter(
      credentials,
      fetchImpl,
      "production",
    );
    const secondInstance = new RedisRateLimiter(
      credentials,
      fetchImpl,
      "production",
    );
    const now = Date.parse("2026-07-16T12:00:00.000Z");

    const first = await firstInstance.consume("education:client-a", {
      limit: 2,
      windowMs: 60_000,
      now,
    });
    const second = await secondInstance.consume("education:client-a", {
      limit: 2,
      windowMs: 60_000,
      now: now + 1_000,
    });

    expect(first).toMatchObject({ allowed: true, remaining: 1 });
    expect(second).toMatchObject({ allowed: true, remaining: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const commands = fetchImpl.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body)) as string[],
    );
    expect(commands[0][0]).toBe("EVAL");
    expect(commands[0][1]).toMatch(/INCR/u);
    expect(commands[0][1]).toMatch(/PEXPIRE/u);
    expect(commands[0][2]).toBe("1");
    expect(commands[0][3]).toBe(commands[1][3]);
    expect(commands[0][3]).toMatch(
      /^morrowward:rate:v1:production:education:client-a:/u,
    );
    expect(
      (fetchImpl.mock.calls[0][1]?.headers as Record<string, string>)
        .authorization,
    ).toBe("Bearer redis-secret");
  });

  it("rejects the request after the shared fixed-window limit is exhausted", async () => {
    const fetchImpl = sharedRedisFetch();
    const limiter = new RedisRateLimiter(
      {
        url: "https://redis.example.test",
        token: "redis-secret",
      },
      fetchImpl,
      "production",
    );
    const now = Date.parse("2026-07-16T12:00:00.000Z");

    await limiter.consume("education:client-b", {
      limit: 1,
      windowMs: 60_000,
      now,
    });
    const rejected = await limiter.consume("education:client-b", {
      limit: 1,
      windowMs: 60_000,
      now: now + 1_000,
    });

    expect(rejected).toMatchObject({
      allowed: false,
      limit: 1,
      remaining: 0,
    });
  });

  it("reports a configured Redis outage instead of silently using memory", async () => {
    const limiter = new RedisRateLimiter(
      {
        url: "https://redis.example.test",
        token: "redis-secret",
      },
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("unavailable", { status: 503 })),
      "production",
    );

    await expect(
      limiter.consume("education:client-c", {
        limit: 12,
        windowMs: 60_000,
      }),
    ).rejects.toBeInstanceOf(RateLimitStoreUnavailableError);
  });
});
