import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GET as generateBriefCron,
  maxDuration,
} from "../app/api/v1/briefs/generate/route";
import { resetBriefCacheForTests } from "../src/server/briefs";
import { setRateLimiterForTests } from "../src/server/rate-limit";

describe.sequential("daily brief cron route", () => {
  beforeEach(() => {
    setRateLimiterForTests();
    resetBriefCacheForTests();
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("CRON_SECRET", "cron-test-token");
    vi.stubEnv("ADMIN_API_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a scheduler request without the configured bearer token", async () => {
    const response = await generateBriefCron(
      new Request("https://morrowward.test/api/v1/briefs/generate"),
    );
    expect(response.status).toBe(401);
  });

  it("allows 150 seconds for the protected sourced generation job", () => {
    expect(maxDuration).toBe(150);
  });

  it("accepts Vercel Cron authentication but returns 503 without AI", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await generateBriefCron(
      new Request("https://morrowward.test/api/v1/briefs/generate", {
        headers: {
          authorization: "Bearer cron-test-token",
          "user-agent": "vercel-cron/1.0",
        },
      }),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "service_unavailable" },
    });
    expect(warn).toHaveBeenCalledOnce();
  });
});
