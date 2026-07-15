import { apiError, noStoreHeaders } from "./http";

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

export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private operations = 0;

  constructor(private readonly maxBuckets = 5_000) {}

  consume(
    key: string,
    options: { limit: number; windowMs: number; now?: number },
  ): RateLimitDecision {
    const now = options.now ?? Date.now();
    const existing = this.buckets.get(key);
    const bucket =
      !existing || existing.resetAt <= now
        ? { count: 0, resetAt: now + options.windowMs }
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

type RateLimitRuntime = typeof globalThis & {
  __morrowwardRateLimiterV2?: RateLimiter;
  __morrowwardRateLimitSaltV2?: string;
};

function runtimeRateLimiter(): RateLimiter {
  const runtime = globalThis as RateLimitRuntime;
  runtime.__morrowwardRateLimiterV2 ??= new MemoryRateLimiter();
  return runtime.__morrowwardRateLimiterV2;
}

function runtimeClientKeySalt(): string {
  const runtime = globalThis as RateLimitRuntime;
  if (runtime.__morrowwardRateLimitSaltV2) {
    return runtime.__morrowwardRateLimitSaltV2;
  }

  if (globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    runtime.__morrowwardRateLimitSaltV2 = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  } else {
    // Supported runtimes provide Web Crypto. Keep an instance-varying fallback
    // so an unusual test runtime still avoids a stable, reusable address hash.
    runtime.__morrowwardRateLimitSaltV2 = `runtime-${Date.now().toString(36)}`;
  }
  return runtime.__morrowwardRateLimitSaltV2;
}

export function setRateLimiterForTests(limiter?: RateLimiter): void {
  (globalThis as RateLimitRuntime).__morrowwardRateLimiterV2 =
    limiter ?? new MemoryRateLimiter();
}

async function anonymousClientKey(request: Request): Promise<string> {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address =
    request.headers.get("cf-connecting-ip") ??
    forwarded ??
    request.headers.get("x-real-ip") ??
    "local";
  const normalizedAddress = address.trim().toLowerCase().slice(0, 160);
  const material = `morrowward-rate-limit-v2|${runtimeClientKeySalt()}|${normalizedAddress}`;

  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(material),
    );
    return Array.from(new Uint8Array(digest).slice(0, 12), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }

  // Web Crypto exists on supported runtimes. This fallback avoids retaining a
  // raw address if a test or unusual runtime omits it.
  let hash = 2_166_136_261;
  for (let index = 0; index < material.length; index += 1) {
    hash ^= material.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `fallback-${(hash >>> 0).toString(16)}`;
}

export async function enforceRateLimit(
  request: Request,
  namespace: string,
  options: { limit: number; windowMs: number },
): Promise<{ ok: true; headers: Headers } | { ok: false; response: Response }> {
  const clientKey = await anonymousClientKey(request);
  const decision = await runtimeRateLimiter().consume(
    `${namespace}:${clientKey}`,
    options,
  );
  const resetSeconds = Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1_000));
  const headers = new Headers({
    "x-ratelimit-limit": String(decision.limit),
    "x-ratelimit-remaining": String(decision.remaining),
    "x-ratelimit-reset": String(Math.ceil(decision.resetAt / 1_000)),
  });

  if (!decision.allowed) {
    headers.set("retry-after", String(resetSeconds));
    return {
      ok: false,
      response: apiError(
        429,
        "rate_limited",
        "Too many requests. Please wait and try again.",
        { headers: noStoreHeaders(headers) },
      ),
    };
  }

  return { ok: true, headers };
}
