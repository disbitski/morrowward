import {
  FINANCIAL_EDUCATION_DISCLOSURE,
  QUOTE_SYMBOLS,
  type EducationalQuote,
  type QuoteHistory,
  type QuoteMode,
  type QuoteSymbol,
  type QuotesResponse,
} from "../contracts";
import {
  EDUCATIONAL_QUOTES,
  EDUCATIONAL_QUOTE_SAMPLE_AS_OF,
  EDUCATIONAL_QUOTE_SOURCE,
} from "../data/educational-quotes";

const TWELVE_DATA_BASE_URL = "https://api.twelvedata.com";
const TWELVE_DATA_SOURCE = {
  name: "Twelve Data",
  kind: "twelve-data",
  url: "https://twelvedata.com/",
} as const;
const QUOTE_CACHE_MS = 5 * 60_000;
const HISTORY_CACHE_MS = 6 * 60 * 60_000;
const PROVIDER_TIMEOUT_MS = 4_000;
const MAX_HISTORY_POINTS = 260;
const CRYPTO_HISTORY_POINTS = 53;
const DAY_MS = 86_400_000;

const PROVIDER_SYMBOLS: Readonly<Record<QuoteSymbol, string>> = {
  VTI: "VTI",
  BND: "BND",
  AAPL: "AAPL",
  TSLA: "TSLA",
  SPCX: "SPCX",
  NVDA: "NVDA",
  MRVL: "MRVL",
  MU: "MU",
  AVGO: "AVGO",
  BTC: "BTC/USD",
  ETH: "ETH/USD",
};

type TimedValue<T> = { expiresAt: number; value: T };
const quoteCache = new Map<QuoteSymbol, TimedValue<EducationalQuote>>();
const historyCache = new Map<QuoteSymbol, TimedValue<QuoteHistory>>();

export type QuoteSelectionResult =
  | { ok: true; symbols: QuoteSymbol[] }
  | { ok: false; unknown: string[] };

export type HistorySelectionResult =
  | { ok: true; includeHistory: boolean }
  | { ok: false; reason: "unsupported_range" | "requires_one_symbol" };

export interface MarketQuoteOptions {
  apiKey?: string;
  displayMode?: string;
  publicDisplayAllowed?: boolean | string;
  fetchImpl?: typeof fetch;
  includeHistory?: boolean;
  now?: Date;
}

type ProviderConfig = {
  apiKey: string;
  mode: Exclude<QuoteMode, "sample">;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function providerConfig(options: MarketQuoteOptions): ProviderConfig | null {
  const apiKey = (options.apiKey ?? process.env.TWELVE_DATA_API_KEY ?? "").trim();
  const rawMode = (
    options.displayMode ??
    process.env.TWELVE_DATA_DISPLAY_MODE ??
    ""
  )
    .trim()
    .toLowerCase();
  const publicDisplayAllowed =
    options.publicDisplayAllowed === true ||
    String(
      options.publicDisplayAllowed ??
        process.env.MARKET_DATA_PUBLIC_DISPLAY_ALLOWED ??
        "",
    )
      .trim()
      .toLowerCase() === "true";

  // Fail closed: a key alone is insufficient. The deployer must explicitly
  // attest to public-display rights and declare the licensed display mode.
  if (
    !apiKey ||
    !publicDisplayAllowed ||
    (rawMode !== "live" && rawMode !== "delayed")
  ) {
    return null;
  }
  return { apiKey, mode: rawMode };
}

export function marketDataHealth(): {
  provider: "Twelve Data" | null;
  configured: boolean;
  mode: QuoteMode;
  publicDisplayAllowed: boolean;
  fallbackAvailable: true;
} {
  const config = providerConfig({});
  return {
    provider: config ? "Twelve Data" : null,
    configured: Boolean(config),
    mode: config?.mode ?? "sample",
    publicDisplayAllowed: Boolean(config),
    fallbackAvailable: true,
  };
}

export function parseQuoteSymbols(raw: string | null): QuoteSelectionResult {
  if (!raw?.trim()) return { ok: true, symbols: [...QUOTE_SYMBOLS] };

  const requested = Array.from(
    new Set(raw.split(",").map((symbol) => symbol.trim().toUpperCase())),
  ).filter(Boolean);
  const allowed = new Set<string>(QUOTE_SYMBOLS);
  const unknown = requested.filter((symbol) => !allowed.has(symbol));
  if (unknown.length) return { ok: false, unknown };

  return { ok: true, symbols: requested as QuoteSymbol[] };
}

export function parseQuoteHistory(
  raw: string | null,
  symbols: QuoteSymbol[],
): HistorySelectionResult {
  if (!raw?.trim()) return { ok: true, includeHistory: false };
  if (raw.trim().toLowerCase() !== "1y") {
    return { ok: false, reason: "unsupported_range" };
  }
  if (symbols.length !== 1) {
    return { ok: false, reason: "requires_one_symbol" };
  }
  return { ok: true, includeHistory: true };
}

function sampleHistory(symbol: QuoteSymbol): QuoteHistory {
  const quote = EDUCATIONAL_QUOTES[symbol];
  const end = new Date(EDUCATIONAL_QUOTE_SAMPLE_AS_OF);
  const publicSince = quote.profile.publicTradingSince;
  const defaultStart = new Date(end);
  defaultStart.setUTCFullYear(defaultStart.getUTCFullYear() - 1);
  const start = publicSince
    ? new Date(`${publicSince}T00:00:00.000Z`)
    : defaultStart;
  const dayMs = 86_400_000;
  const stepMs = 7 * dayMs;
  const count = Math.max(2, Math.floor((end.getTime() - start.getTime()) / stepMs) + 1);
  const seed = QUOTE_SYMBOLS.indexOf(symbol) + 1;
  const riskAmplitude =
    quote.profile.educationalRisk === "very-high"
      ? 0.065
      : quote.profile.educationalRisk === "higher"
        ? 0.038
        : quote.profile.educationalRisk === "medium"
          ? 0.022
          : 0.009;
  const rawValues: number[] = [];
  let value = 100;
  for (let index = 0; index < count; index += 1) {
    if (index > 0) {
      const wave = Math.sin((index + seed) * 1.31) * riskAmplitude;
      const smallerWave = Math.cos((index * seed + 3) * 0.37) * riskAmplitude * 0.35;
      const drift = quote.assetType === "etf" ? 0.0011 : 0.0016;
      value = Math.max(5, value * (1 + drift + wave + smallerWave));
    }
    rawValues.push(value);
  }
  const scale = quote.price / rawValues.at(-1)!;
  const dates = rawValues.map((_, index) => {
    const at = Math.min(start.getTime() + index * stepMs, end.getTime());
    return new Date(at).toISOString().slice(0, 10);
  });
  dates[dates.length - 1] = end.toISOString().slice(0, 10);
  const points = rawValues.map((raw, index) => ({
    date: dates[index],
    close: Number((raw * scale).toFixed(4)),
  }));
  const first = points[0];
  const last = points.at(-1)!;

  return {
    range: "1y",
    interval: "1week",
    points,
    priceChangePercent: Number(
      (((last.close - first.close) / first.close) * 100).toFixed(4),
    ),
    startDate: first.date,
    endDate: last.date,
    limited: Boolean(publicSince),
    mode: "sample",
    source: EDUCATIONAL_QUOTE_SOURCE,
  };
}

function sampleQuoteWithHistory(
  symbol: QuoteSymbol,
  includeHistory: boolean,
): EducationalQuote {
  const quote = EDUCATIONAL_QUOTES[symbol];
  return includeHistory ? { ...quote, history: sampleHistory(symbol) } : quote;
}

/** Synchronous deterministic mode retained for offline and test use. */
export function getEducationalQuotes(
  symbols: QuoteSymbol[],
  now = new Date(),
  includeHistory = false,
): QuotesResponse {
  return {
    quotes: symbols.map((symbol) => sampleQuoteWithHistory(symbol, includeHistory)),
    allowlist: [...QUOTE_SYMBOLS],
    generatedAt: now.toISOString(),
    provider: {
      name: null,
      configured: false,
      status: "not-configured",
      succeededSymbols: [],
      fallbackSymbols: [...symbols],
    },
    disclosure: `${FINANCIAL_EDUCATION_DISCLOSURE} Prices and history in this response are synthetic samples and must not be used for trading.`,
  };
}

function observedAtFromProvider(
  payload: Record<string, unknown>,
  now: Date,
): { observedAt: string; kind: "provider" | "received" } {
  for (const candidate of [payload.last_quote_at, payload.timestamp]) {
    const timestamp = finiteNumber(candidate);
    if (timestamp === null || timestamp <= 0) continue;
    const date = new Date(timestamp * 1_000);
    if (
      Number.isFinite(date.getTime()) &&
      date.getTime() <= now.getTime() + 5 * 60_000
    ) {
      return { observedAt: date.toISOString(), kind: "provider" };
    }
  }

  const datetime = typeof payload.datetime === "string" ? payload.datetime : "";
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(datetime)
    ? `${datetime}T00:00:00.000Z`
    : datetime.includes(" ")
      ? `${datetime.replace(" ", "T")}Z`
      : datetime;
  const parsed = Date.parse(normalized);
  if (Number.isFinite(parsed) && parsed <= now.getTime() + 5 * 60_000) {
    return { observedAt: new Date(parsed).toISOString(), kind: "provider" };
  }
  return { observedAt: now.toISOString(), kind: "received" };
}

function freshnessFor(
  mode: Exclude<QuoteMode, "sample">,
  observedAt: string,
  observedAtKind: "provider" | "received",
  marketStatus: "open" | "closed" | "unknown",
  now: Date,
): EducationalQuote["freshness"] {
  const ageSeconds = Math.max(
    0,
    Math.floor((now.getTime() - Date.parse(observedAt)) / 1_000),
  );
  if (observedAtKind === "received") {
    return {
      status: "delayed",
      label: "Provider observation time unavailable; response receipt time shown",
      isLive: false,
      ageSeconds,
    };
  }
  if (ageSeconds > 86_400) {
    return {
      status: "stale",
      label: "Provider observation is more than 24 hours old",
      isLive: false,
      ageSeconds,
    };
  }
  if (mode === "live" && marketStatus === "open" && ageSeconds <= 15 * 60) {
    return {
      status: "fresh",
      label: "Near-live provider observation",
      isLive: true,
      ageSeconds,
    };
  }
  return {
    status: "delayed",
    label:
      marketStatus === "closed"
        ? "Latest available provider observation; market is closed"
        : "Delayed or recently cached provider observation",
    isLive: false,
    ageSeconds,
  };
}

function providerSymbolMatches(
  symbol: QuoteSymbol,
  providerSymbol: unknown,
): boolean {
  return (
    typeof providerSymbol === "string" &&
    providerSymbol.trim().toUpperCase() === PROVIDER_SYMBOLS[symbol]
  );
}

function quotePayloadFor(
  payload: unknown,
  symbol: QuoteSymbol,
  requestedCount: number,
): Record<string, unknown> | null {
  if (!isRecord(payload)) return null;
  if (requestedCount === 1 && finiteNumber(payload.close) !== null) return payload;

  const providerSymbol = PROVIDER_SYMBOLS[symbol];
  const candidates = [providerSymbol, symbol, providerSymbol.toUpperCase()];
  for (const candidate of candidates) {
    const direct = payload[candidate];
    if (isRecord(direct)) return direct;
  }
  const matchingEntry = Object.entries(payload).find(
    ([key]) => key.toUpperCase() === providerSymbol.toUpperCase(),
  );
  return matchingEntry && isRecord(matchingEntry[1]) ? matchingEntry[1] : null;
}

function parseProviderQuote(
  symbol: QuoteSymbol,
  payload: Record<string, unknown>,
  mode: Exclude<QuoteMode, "sample">,
  now: Date,
): EducationalQuote | null {
  if (!providerSymbolMatches(symbol, payload.symbol)) return null;

  // SPCX was reassigned in 2026 after an ETF moved to SPCK. Reject stale
  // symbol-directory matches rather than displaying a different instrument.
  if (
    symbol === "SPCX" &&
    (typeof payload.name !== "string" ||
      !/(?:spacex|space exploration technologies)/i.test(payload.name))
  ) {
    return null;
  }
  const price = finiteNumber(payload.close);
  if (price === null || price <= 0 || price > 1_000_000_000_000) return null;
  const fallback = EDUCATIONAL_QUOTES[symbol];
  const isCrypto = fallback.assetType === "crypto";
  const marketStatus =
    payload.is_market_open === true
      ? "open"
      : payload.is_market_open === false
        ? "closed"
        : isCrypto
          ? "open"
          : "unknown";
  const observed = observedAtFromProvider(payload, now);

  const rollingPercent = finiteNumber(payload.rolling_1d_change);
  const previousPercent = finiteNumber(payload.percent_change);
  const usablePercent = isCrypto && rollingPercent !== null
    ? rollingPercent
    : previousPercent;
  const safePercent =
    usablePercent !== null && Math.abs(usablePercent) <= 10_000
      ? usablePercent
      : null;
  const providerChange = finiteNumber(payload.change);
  const rollingChange =
    safePercent !== null && safePercent > -100
      ? price - price / (1 + safePercent / 100)
      : null;
  const change = isCrypto && rollingPercent !== null
    ? rollingChange
    : providerChange;

  return {
    ...fallback,
    price,
    change: change !== null && Number.isFinite(change) ? change : null,
    changePercent: safePercent,
    changeBasis:
      safePercent === null
        ? "unavailable"
        : isCrypto && rollingPercent !== null
          ? "rolling-24h"
          : "previous-close",
    asOf: observed.observedAt,
    observedAt: observed.observedAt,
    observedAtKind: observed.kind,
    mode,
    marketStatus,
    source: TWELVE_DATA_SOURCE,
    freshness: freshnessFor(
      mode,
      observed.observedAt,
      observed.kind,
      marketStatus,
      now,
    ),
  };
}

async function fetchJsonWithTimeout(
  url: URL,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `apikey ${apiKey}`,
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchProviderQuotes(
  symbols: QuoteSymbol[],
  config: ProviderConfig,
  fetchImpl: typeof fetch,
  now: Date,
): Promise<Partial<Record<QuoteSymbol, EducationalQuote>>> {
  if (symbols.length === 0) return {};
  const url = new URL("/quote", TWELVE_DATA_BASE_URL);
  url.searchParams.set(
    "symbol",
    symbols.map((symbol) => PROVIDER_SYMBOLS[symbol]).join(","),
  );
  const payload = await fetchJsonWithTimeout(url, config.apiKey, fetchImpl);
  const parsed: Partial<Record<QuoteSymbol, EducationalQuote>> = {};
  for (const symbol of symbols) {
    const raw = quotePayloadFor(payload, symbol, symbols.length);
    if (!raw) continue;
    const quote = parseProviderQuote(symbol, raw, config.mode, now);
    if (quote) parsed[symbol] = quote;
  }
  return parsed;
}

function parseProviderHistory(
  payload: unknown,
  symbol: QuoteSymbol,
  mode: Exclude<QuoteMode, "sample">,
  interval: QuoteHistory["interval"],
): QuoteHistory | null {
  if (!isRecord(payload) || !Array.isArray(payload.values)) return null;
  if (
    !isRecord(payload.meta) ||
    !providerSymbolMatches(symbol, payload.meta.symbol)
  ) {
    return null;
  }
  const byDate = new Map<string, number>();
  for (const value of payload.values.slice(0, MAX_HISTORY_POINTS)) {
    if (!isRecord(value) || typeof value.datetime !== "string") continue;
    const date = value.datetime.slice(0, 10);
    const close = finiteNumber(value.close);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || close === null || close <= 0) {
      continue;
    }
    byDate.set(date, close);
  }
  const points = [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-MAX_HISTORY_POINTS)
    .map(([date, close]) => ({ date, close }));
  if (points.length < 2) return null;
  const first = points[0];
  const last = points.at(-1)!;
  const expectedStart = new Date(`${last.date}T00:00:00.000Z`);
  expectedStart.setUTCFullYear(expectedStart.getUTCFullYear() - 1);
  const coverageSlackDays = interval === "1week" ? 8 : 7;
  const limited =
    Date.parse(`${first.date}T00:00:00.000Z`) >
    expectedStart.getTime() + coverageSlackDays * DAY_MS;
  return {
    range: "1y",
    interval,
    points,
    priceChangePercent: Number(
      (((last.close - first.close) / first.close) * 100).toFixed(4),
    ),
    startDate: first.date,
    endDate: last.date,
    limited,
    mode,
    source: TWELVE_DATA_SOURCE,
  };
}

async function getProviderHistory(
  symbol: QuoteSymbol,
  config: ProviderConfig,
  fetchImpl: typeof fetch,
  now: Date,
): Promise<QuoteHistory | null> {
  const cached = historyCache.get(symbol);
  if (cached && cached.expiresAt > now.getTime()) return cached.value;

  const url = new URL("/time_series", TWELVE_DATA_BASE_URL);
  const isCrypto = EDUCATIONAL_QUOTES[symbol].assetType === "crypto";
  const interval: QuoteHistory["interval"] = isCrypto ? "1week" : "1day";
  url.searchParams.set("symbol", PROVIDER_SYMBOLS[symbol]);
  url.searchParams.set("interval", interval);
  url.searchParams.set(
    "outputsize",
    String(isCrypto ? CRYPTO_HISTORY_POINTS : MAX_HISTORY_POINTS),
  );
  url.searchParams.set("order", "asc");
  url.searchParams.set("adjust", "all");
  const payload = await fetchJsonWithTimeout(url, config.apiKey, fetchImpl);
  const parsed = parseProviderHistory(payload, symbol, config.mode, interval);
  if (parsed) {
    historyCache.set(symbol, {
      expiresAt: now.getTime() + HISTORY_CACHE_MS,
      value: parsed,
    });
  }
  return parsed;
}

export async function getMarketQuotes(
  symbols: QuoteSymbol[],
  options: MarketQuoteOptions = {},
): Promise<QuotesResponse> {
  const now = options.now ?? new Date();
  const config = providerConfig(options);
  if (!config) {
    return getEducationalQuotes(symbols, now, Boolean(options.includeHistory));
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const providerQuotes: Partial<Record<QuoteSymbol, EducationalQuote>> = {};
  const missing: QuoteSymbol[] = [];
  for (const symbol of symbols) {
    const cached = quoteCache.get(symbol);
    if (cached && cached.expiresAt > now.getTime()) {
      providerQuotes[symbol] = {
        ...cached.value,
        freshness: freshnessFor(
          cached.value.mode as Exclude<QuoteMode, "sample">,
          cached.value.observedAt,
          cached.value.observedAtKind as "provider" | "received",
          cached.value.marketStatus,
          now,
        ),
      };
    } else {
      missing.push(symbol);
    }
  }

  const fetched = await fetchProviderQuotes(missing, config, fetchImpl, now);
  for (const symbol of missing) {
    const quote = fetched[symbol];
    if (!quote) continue;
    providerQuotes[symbol] = quote;
    quoteCache.set(symbol, {
      expiresAt: now.getTime() + QUOTE_CACHE_MS,
      value: quote,
    });
  }

  const succeededSymbols = symbols.filter((symbol) => providerQuotes[symbol]);
  const fallbackSymbols = symbols.filter((symbol) => !providerQuotes[symbol]);
  const quotes = symbols.map(
    (symbol) => providerQuotes[symbol] ?? sampleQuoteWithHistory(symbol, false),
  );

  if (options.includeHistory && symbols.length === 1) {
    const symbol = symbols[0];
    const history =
      (providerQuotes[symbol]
        ? await getProviderHistory(symbol, config, fetchImpl, now)
        : null) ??
      sampleHistory(symbol);
    quotes[0] = { ...quotes[0], history };
  }

  return {
    quotes,
    allowlist: [...QUOTE_SYMBOLS],
    generatedAt: now.toISOString(),
    provider: {
      name: "Twelve Data",
      configured: true,
      status:
        succeededSymbols.length === symbols.length
          ? "ok"
          : succeededSymbols.length > 0
            ? "partial"
            : "fallback",
      succeededSymbols,
      fallbackSymbols,
    },
    disclosure: `${FINANCIAL_EDUCATION_DISCLOSURE} Provider observations may be delayed or cached; fallback values and fallback history are synthetic. Historical percentage is an adjusted-price illustration, not a total-return calculation. Do not use this endpoint for trading.`,
  };
}

export function allEducationalQuotes(): EducationalQuote[] {
  return QUOTE_SYMBOLS.map((symbol) => EDUCATIONAL_QUOTES[symbol]);
}

export function resetQuoteCacheForTests(): void {
  quoteCache.clear();
  historyCache.clear();
}
