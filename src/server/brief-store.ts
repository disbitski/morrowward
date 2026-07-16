import {
  DailyBriefResponseSchema,
  type DailyBriefResponse,
} from "../contracts";

const BRIEF_LATEST_KEY = "morrowward:daily-brief:latest";
const BRIEF_REFRESH_LOCK_KEY_PREFIX =
  "morrowward:daily-brief:refresh-lock:";
const BRIEF_TTL_SECONDS = 60 * 60 * 48;
const BRIEF_REFRESH_LOCK_SECONDS = 60 * 60 * 12;
export const BRIEF_STORE_TIMEOUT_MS = 1_500;

type RedisCredentials = { url: string; token: string };

type StoreCommandResult =
  | { status: "ok"; result: unknown }
  | { status: "not-configured" | "unavailable" };

export type DailyBriefRefreshClaimResult =
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
  const timeout = setTimeout(() => controller.abort(), BRIEF_STORE_TIMEOUT_MS);
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

export function hasDurableBriefStore(): boolean {
  return credentials() !== null;
}

/** Reads the latest validated successful brief, regardless of calendar rollover. */
export async function readLatestDailyBrief(
  fetchImpl?: typeof fetch,
): Promise<DailyBriefResponse | null> {
  const commandResult = await command(["GET", BRIEF_LATEST_KEY], fetchImpl);
  if (
    commandResult.status !== "ok" ||
    typeof commandResult.result !== "string"
  ) {
    return null;
  }
  try {
    const parsed = DailyBriefResponseSchema.safeParse(
      JSON.parse(commandResult.result),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Persists only the caller-approved successful edition for up to 48 hours. */
export async function writeLatestDailyBrief(
  brief: DailyBriefResponse,
  fetchImpl?: typeof fetch,
): Promise<boolean> {
  const valid = DailyBriefResponseSchema.parse(brief);
  const commandResult = await command(
    [
      "SET",
      BRIEF_LATEST_KEY,
      JSON.stringify(valid),
      "EX",
      String(BRIEF_TTL_SECONDS),
    ],
    fetchImpl,
  );
  return commandResult.status === "ok" && commandResult.result === "OK";
}

/**
 * Claims one bounded generation window for an America/New_York calendar day.
 * The lock remains after a failed attempt so public traffic cannot repeatedly
 * spend model budget; a later attempt may retry after the twelve-hour TTL.
 */
export async function claimDailyBriefRefresh(
  easternCalendarDate: string,
  fetchImpl?: typeof fetch,
): Promise<DailyBriefRefreshClaimResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(easternCalendarDate)) {
    throw new Error("Daily-brief refresh date must use YYYY-MM-DD.");
  }
  const commandResult = await command(
    [
      "SET",
      `${BRIEF_REFRESH_LOCK_KEY_PREFIX}${easternCalendarDate}`,
      easternCalendarDate,
      "NX",
      "EX",
      String(BRIEF_REFRESH_LOCK_SECONDS),
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

/** @deprecated Use readLatestDailyBrief; retained during the v1 migration. */
export async function readDailyBrief(
  _calendarDate: string,
  fetchImpl?: typeof fetch,
): Promise<DailyBriefResponse | null> {
  return readLatestDailyBrief(fetchImpl);
}

/** @deprecated Use writeLatestDailyBrief; retained during the v1 migration. */
export async function writeDailyBrief(
  _calendarDate: string,
  brief: DailyBriefResponse,
  fetchImpl?: typeof fetch,
): Promise<boolean> {
  return writeLatestDailyBrief(brief, fetchImpl);
}
