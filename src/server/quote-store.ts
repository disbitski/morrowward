import { QuotesResponseSchema, type QuotesResponse } from "../contracts";

const QUOTE_SNAPSHOT_KEY = "morrowward:quotes:latest";
const QUOTE_REFRESH_LOCK_KEY = "morrowward:quotes:refresh-lock";
const QUOTE_SNAPSHOT_TTL_SECONDS = 60 * 60 * 48;
const QUOTE_REFRESH_LOCK_SECONDS = 12 * 60 * 60;
const STORE_TIMEOUT_MS = 1_500;

type RedisCredentials = { url: string; token: string };

type StoreCommandResult =
  | { status: "ok"; result: unknown }
  | { status: "not-configured" | "unavailable" };

export type MarketQuoteSnapshotReadResult =
  | { status: "ok"; snapshot: QuotesResponse | null }
  | { status: "not-configured" | "unavailable" };

export type MarketQuoteSnapshotWriteResult =
  | { status: "written" }
  | { status: "not-configured" | "unavailable" };

export type MarketQuoteRefreshClaimResult =
  | { status: "claimed" | "contended" }
  | { status: "not-configured" | "unavailable" };

function credentials(): RedisCredentials | null {
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

async function command(
  args: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<StoreCommandResult> {
  const auth = credentials();
  if (!auth) return { status: "not-configured" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STORE_TIMEOUT_MS);
  try {
    const response = await fetchImpl(auth.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return { status: "unavailable" };
    const payload = (await response.json()) as unknown;
    if (
      typeof payload !== "object" ||
      payload === null ||
      !Object.prototype.hasOwnProperty.call(payload, "result")
    ) {
      return { status: "unavailable" };
    }
    return {
      status: "ok",
      result: (payload as { result: unknown }).result,
    };
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

export function hasDurableQuoteStore(): boolean {
  return credentials() !== null;
}

export async function readMarketQuoteSnapshot(
  fetchImpl?: typeof fetch,
): Promise<MarketQuoteSnapshotReadResult> {
  const commandResult = await command(["GET", QUOTE_SNAPSHOT_KEY], fetchImpl);
  if (commandResult.status !== "ok") return commandResult;
  if (commandResult.result === null) return { status: "ok", snapshot: null };
  if (typeof commandResult.result !== "string") {
    return { status: "unavailable" };
  }
  try {
    const parsed = QuotesResponseSchema.safeParse(JSON.parse(commandResult.result));
    return parsed.success
      ? { status: "ok", snapshot: parsed.data }
      : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export async function writeMarketQuoteSnapshot(
  snapshot: QuotesResponse,
  fetchImpl?: typeof fetch,
): Promise<MarketQuoteSnapshotWriteResult> {
  const valid = QuotesResponseSchema.parse(snapshot);
  const commandResult = await command(
    [
      "SET",
      QUOTE_SNAPSHOT_KEY,
      JSON.stringify(valid),
      "EX",
      String(QUOTE_SNAPSHOT_TTL_SECONDS),
    ],
    fetchImpl,
  );
  if (commandResult.status !== "ok") return commandResult;
  return commandResult.result === "OK"
    ? { status: "written" }
    : { status: "unavailable" };
}

/**
 * Claims the shared refresh window. The lock intentionally remains after a
 * failed generation so public traffic cannot repeatedly spend API budget; a
 * later request may retry after the twelve-hour backoff.
 */
export async function claimMarketQuoteRefresh(
  marker: string,
  fetchImpl?: typeof fetch,
): Promise<MarketQuoteRefreshClaimResult> {
  const commandResult = await command(
    [
      "SET",
      QUOTE_REFRESH_LOCK_KEY,
      marker,
      "NX",
      "EX",
      String(QUOTE_REFRESH_LOCK_SECONDS),
    ],
    fetchImpl,
  );
  if (commandResult.status !== "ok") return commandResult;
  return commandResult.result === "OK"
    ? { status: "claimed" }
    : commandResult.result === null
      ? { status: "contended" }
      : { status: "unavailable" };
}
