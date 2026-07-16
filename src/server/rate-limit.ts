import { apiError, noStoreHeaders } from "./http";

const REDIS_TIMEOUT_MS = 1_500;
const RATE_LIMIT_KEY_PREFIX = "morrowward:rate:v1";
const MAX_REDIS_KEY_CHARACTERS = 240;

const FIXED_WINDOW_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`.trim();

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

export interface RateLimiter {
  consume(
    key: string,
    options: { limit: number; windowMs: number; now?: number },
  ): Promise<RateLimitDecision> | RateLimitDecision;
  reset?(): void;
}

type Bucket = { count: number; resetAt: number };
type RedisCredentials = { url: string; token: string };

function fixedWindow(now: number, windowMs: number): {
  bucket: number;
  resetAt: number;
  ttlMs: number;
} {
  if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new Error("Rate-limit windowMs must be a positive integer.");
  }
  const bucket = Math.floor(now / windowMs);
  const resetAt = (bucket + 1) * windowMs;
  return { bucket, resetAt, ttlMs: Math.max(1, resetAt - now) };
}

function assertLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("Rate-limit limit must be a positive integer.");
  }
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private operations = 0;

  constructor(private readonly maxBuckets = 5_000) {}

  consume(
    key: string,
    options: { limit: number; windowMs: number; now?: number },
  ): RateLimitDecision {
    assertLimit(options.limit);
    const now = options.now ?? Date.now();
    const window = fixedWindow(now, options.windowMs);
    const existing = this.buckets.get(key);
    const bucket =
      !existing || existing.resetAt !== window.resetAt
        ? { count: 0, resetAt: window.resetAt }
        : existing;

    bucket.count += 1;
    // Refresh insertion order so the bounded map evicts least-recently-used
    // buckets first when an address spray reaches the safety ceiling.
    if (existing) this.buckets.delete(key);
    this.buckets.set(key, bucket);
    this.prune(now);

    return {
      allowed: bucket.count <= options.limit,
      limit: options.limit,
      remaining: Math.max(0, options.limit - bucket.count),
      resetAt: bucket.resetAt,
    };
  }

  reset(): void {
    this.buckets.clear();
  }

  private prune(now: number): void {
    this.operations += 1;
    if (this.buckets.size <= this.maxBuckets && this.operations % 128 !== 0) {
      return;
    }
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    while (this.buckets.size > this.maxBuckets) {
      const oldestKey = this.buckets.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.buckets.delete(oldestKey);
    }
  }
}

export class RateLimitStoreUnavailableError extends Error {
  constructor() {
    super("The configured durable rate-limit store is unavailable.");
    this.name = "RateLimitStoreUnavailableError";
  }
}

function configuredRedisCredentials(): RedisCredentials | null {
  const pairs = [
    [process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN],
    [process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN],
  ] as const;
  for (const [rawUrl, rawToken] of pairs) {
    const url = rawUrl?.trim();
    const token = rawToken?.trim();
    if (url && token) return { url: url.replace(/\/$/u, ""), token };
  }
  return null;
}

function hasAnyRedisConfiguration(): boolean {
  return [
    process.env.KV_REST_API_URL,
    process.env.KV_REST_API_TOKEN,
    process.env.UPSTASH_REDIS_REST_URL,
    process.env.UPSTASH_REDIS_REST_TOKEN,
  ].some((value) => Boolean(value?.trim()));
}

export function productionAiRequiresDurableRateLimiter(): boolean {
  const isVercelProduction = [
    process.env.VERCEL_TARGET_ENV,
    process.env.VERCEL_ENV,
  ].some((value) => value?.trim().toLowerCase() === "production");
  return isVercelProduction && Boolean(process.env.OPENAI_API_KEY?.trim());
}

function rateLimitEnvironment(): string {
  const raw =
    process.env.VERCEL_TARGET_ENV ??
    process.env.VERCEL_ENV ??
    process.env.NODE_ENV ??
    "local";
  const safe = raw.toLowerCase().replace(/[^a-z0-9_-]+/gu, "-").slice(0, 40);
  return safe || "local";
}

function safeRedisKey(key: string): string {
  if (
    !/^[a-z0-9:_-]+$/iu.test(key) ||
    key.length < 1 ||
    key.length > MAX_REDIS_KEY_CHARACTERS
  ) {
    throw new Error("Rate-limit key must be a bounded safe identifier.");
  }
  return key;
}

export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly credentials: RedisCredentials,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly environment = rateLimitEnvironment(),
  ) {}

  async consume(
    key: string,
    options: { limit: number; windowMs: number; now?: number },
  ): Promise<RateLimitDecision> {
    assertLimit(options.limit);
    const now = options.now ?? Date.now();
    const window = fixedWindow(now, options.windowMs);
    const redisKey = safeRedisKey(
      `${RATE_LIMIT_KEY_PREFIX}:${this.environment}:${key}:${window.bucket}`,
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REDIS_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(this.credentials.url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.credentials.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify([
          "EVAL",
          FIXED_WINDOW_SCRIPT,
          "1",
          redisKey,
          String(window.ttlMs),
        ]),
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new RateLimitStoreUnavailableError();
      const payload = (await response.json()) as { result?: unknown };
      if (!Array.isArray(payload.result) || payload.result.length < 2) {
        throw new RateLimitStoreUnavailableError();
      }
      const count = Number(payload.result[0]);
      const ttlMs = Number(payload.result[1]);
      if (
        !Number.isSafeInteger(count) ||
        count < 1 ||
        !Number.isFinite(ttlMs) ||
        ttlMs < 0
      ) {
        throw new RateLimitStoreUnavailableError();
      }
      return {
        allowed: count <= options.limit,
        limit: options.limit,
        remaining: Math.max(0, options.limit - count),
        resetAt: now + ttlMs,
      };
    } catch (error) {
      if (error instanceof RateLimitStoreUnavailableError) throw error;
      throw new RateLimitStoreUnavailableError();
    } finally {
      clearTimeout(timeout);
    }
  }
}

const unavailableDurableLimiter: RateLimiter = {
  consume() {
    throw new RateLimitStoreUnavailableError();
  },
};

type RateLimitRuntime = typeof globalThis & {
  __morrowwardRateLimiterOverrideV3?: RateLimiter;
  __morrowwardMemoryRateLimiterV3?: RateLimiter;
  __morrowwardRedisRateLimiterV3?: {
    url: string;
    token: string;
    limiter: RateLimiter;
  };
  __morrowwardRateLimitSaltV3?: string;
};

function runtimeRateLimiter(): {
  limiter: RateLimiter;
  durableConfigured: boolean;
} {
  const runtime = globalThis as RateLimitRuntime;
  if (runtime.__morrowwardRateLimiterOverrideV3) {
    return {
      limiter: runtime.__morrowwardRateLimiterOverrideV3,
      durableConfigured: hasAnyRedisConfiguration(),
    };
  }

  const credentials = configuredRedisCredentials();
  if (credentials) {
    let cached = runtime.__morrowwardRedisRateLimiterV3;
    if (
      !cached ||
      cached.url !== credentials.url ||
      cached.token !== credentials.token
    ) {
      cached = {
        ...credentials,
        limiter: new RedisRateLimiter(credentials),
      };
      runtime.__morrowwardRedisRateLimiterV3 = cached;
    }
    return {
      limiter: cached.limiter,
      durableConfigured: true,
    };
  }

  if (
    hasAnyRedisConfiguration() ||
    productionAiRequiresDurableRateLimiter()
  ) {
    return {
      limiter: unavailableDurableLimiter,
      durableConfigured: true,
    };
  }

  runtime.__morrowwardMemoryRateLimiterV3 ??= new MemoryRateLimiter();
  return {
    limiter: runtime.__morrowwardMemoryRateLimiterV3,
    durableConfigured: false,
  };
}

function runtimeClientKeySalt(): string {
  const credentials = configuredRedisCredentials();
  if (credentials) {
    // A token-derived salt is stable across server instances but never leaves
    // the process or appears in the Redis key.
    return `durable:${credentials.token}`;
  }

  const runtime = globalThis as RateLimitRuntime;
  if (runtime.__morrowwardRateLimitSaltV3) {
    return runtime.__morrowwardRateLimitSaltV3;
  }
  if (globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    runtime.__morrowwardRateLimitSaltV3 = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  } else {
    runtime.__morrowwardRateLimitSaltV3 = `runtime-${Date.now().toString(36)}`;
  }
  return runtime.__morrowwardRateLimitSaltV3;
}

export function setRateLimiterForTests(
  limiter?: RateLimiter | null,
): void {
  const runtime = globalThis as RateLimitRuntime;
  delete runtime.__morrowwardRedisRateLimiterV3;
  delete runtime.__morrowwardMemoryRateLimiterV3;
  delete runtime.__morrowwardRateLimitSaltV3;
  if (limiter === null) {
    delete runtime.__morrowwardRateLimiterOverrideV3;
    return;
  }
  runtime.__morrowwardRateLimiterOverrideV3 =
    limiter ?? new MemoryRateLimiter();
}

async function anonymousClientKey(request: Request): Promise<string> {
  const vercelForwarded = request.headers
    .get("x-vercel-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const address =
    vercelForwarded ??
    forwarded ??
    request.headers.get("x-real-ip") ??
    "local";
  const normalizedAddress = address.trim().toLowerCase().slice(0, 160);
  const material = `morrowward-rate-limit-v3|${runtimeClientKeySalt()}|${normalizedAddress}`;

  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(material),
    );
    return Array.from(new Uint8Array(digest).slice(0, 12), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }

  let hash = 2_166_136_261;
  for (let index = 0; index < material.length; index += 1) {
    hash ^= material.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `fallback-${(hash >>> 0).toString(16)}`;
}

function decisionHeaders(
  decision: RateLimitDecision,
  prefix = "x-ratelimit",
): Headers {
  return new Headers({
    [`${prefix}-limit`]: String(decision.limit),
    [`${prefix}-remaining`]: String(decision.remaining),
    [`${prefix}-reset`]: String(Math.ceil(decision.resetAt / 1_000)),
  });
}

function unavailableResponse(): Response {
  return apiError(
    503,
    "service_unavailable",
    "The educator is temporarily unavailable because its shared safety limit cannot be verified.",
    { headers: noStoreHeaders() },
  );
}

function rateLimitedResponse(
  decision: RateLimitDecision,
  headers: Headers,
  message: string,
): Response {
  const resetSeconds = Math.max(
    1,
    Math.ceil((decision.resetAt - Date.now()) / 1_000),
  );
  headers.set("retry-after", String(resetSeconds));
  return apiError(429, "rate_limited", message, {
    headers: noStoreHeaders(headers),
  });
}

type EnforceOptions = {
  limit: number;
  windowMs: number;
  failClosed?: boolean;
};

async function consumeSafely(
  key: string,
  options: EnforceOptions,
): Promise<
  | { status: "ok"; decision: RateLimitDecision }
  | { status: "unavailable"; durableConfigured: boolean }
> {
  const { limiter, durableConfigured } = runtimeRateLimiter();
  try {
    return {
      status: "ok",
      decision: await limiter.consume(key, options),
    };
  } catch {
    return { status: "unavailable", durableConfigured };
  }
}

export async function enforceRateLimit(
  request: Request,
  namespace: string,
  options: EnforceOptions,
): Promise<{ ok: true; headers: Headers } | { ok: false; response: Response }> {
  const clientKey = await anonymousClientKey(request);
  const result = await consumeSafely(`${namespace}:${clientKey}`, options);
  if (result.status === "unavailable") {
    if (result.durableConfigured && options.failClosed) {
      return { ok: false, response: unavailableResponse() };
    }
    return { ok: true, headers: new Headers() };
  }

  const headers = decisionHeaders(result.decision);
  if (!result.decision.allowed) {
    return {
      ok: false,
      response: rateLimitedResponse(
        result.decision,
        headers,
        "Too many requests. Please wait and try again.",
      ),
    };
  }
  return { ok: true, headers };
}

export async function enforceGlobalRateLimit(
  namespace: string,
  options: EnforceOptions,
): Promise<{ ok: true; headers: Headers } | { ok: false; response: Response }> {
  const result = await consumeSafely(`${namespace}:global`, options);
  if (result.status === "unavailable") {
    if (result.durableConfigured && options.failClosed) {
      return { ok: false, response: unavailableResponse() };
    }
    return { ok: true, headers: new Headers() };
  }

  const headers = decisionHeaders(result.decision, "x-educator-daily");
  if (!result.decision.allowed) {
    return {
      ok: false,
      response: rateLimitedResponse(
        result.decision,
        headers,
        "The educator's daily AI request budget has been reached. Try again after the UTC reset.",
      ),
    };
  }
  return { ok: true, headers };
}
