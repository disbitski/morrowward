import {
  DailyBriefResponseSchema,
  type DailyBriefResponse,
} from "../contracts";

const KEY_PREFIX = "morrowward:daily-brief:";
const BRIEF_TTL_SECONDS = 60 * 60 * 48;
export const BRIEF_STORE_TIMEOUT_MS = 1_500;

type RedisCredentials = { url: string; token: string };

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
): Promise<unknown> {
  const auth = credentials();
  if (!auth) return null;
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
    if (!response.ok) return null;
    const payload = (await response.json()) as { result?: unknown };
    return payload.result ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function hasDurableBriefStore(): boolean {
  return credentials() !== null;
}

export async function readDailyBrief(
  calendarDate: string,
  fetchImpl?: typeof fetch,
): Promise<DailyBriefResponse | null> {
  const result = await command(["GET", `${KEY_PREFIX}${calendarDate}`], fetchImpl);
  if (typeof result !== "string") return null;
  try {
    const parsed = DailyBriefResponseSchema.safeParse(JSON.parse(result));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeDailyBrief(
  calendarDate: string,
  brief: DailyBriefResponse,
  fetchImpl?: typeof fetch,
): Promise<boolean> {
  const valid = DailyBriefResponseSchema.parse(brief);
  const result = await command(
    [
      "SET",
      `${KEY_PREFIX}${calendarDate}`,
      JSON.stringify(valid),
      "EX",
      String(BRIEF_TTL_SECONDS),
    ],
    fetchImpl,
  );
  return result === "OK";
}
