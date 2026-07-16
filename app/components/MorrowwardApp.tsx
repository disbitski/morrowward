"use client";

import Image from "next/image";
import {
  ArrowRight,
  Bitcoin,
  BookOpen,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Compass,
  Database,
  Download,
  ExternalLink,
  FlaskConical,
  Globe2,
  Heart,
  Home,
  Info,
  Landmark,
  Leaf,
  Lightbulb,
  LineChart,
  Lock,
  Menu,
  Monitor,
  Moon,
  PiggyBank,
  Plus,
  Quote,
  RefreshCw,
  Rocket,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  Upload,
  UserRound,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MICRO_UNITS_PER_ASSET,
  PRACTICE_ASSETS,
  buySimulatedAsset,
  calculateHabitProgress,
  calculateProjection,
  calculateProjectionScenarios,
  createHabitLog,
  depositWeeklyContribution,
  formatAssetMicroUnits,
  isoWeekKey,
  multiplyDivideFloor,
  recordCompletedWeek,
  valuePracticePortfolio,
  type EducationalQuoteMap,
  type HabitLog,
  type PracticeAssetSymbol,
  type PracticePortfolio,
  type ProjectionResult,
} from "../../src/domain";
import {
  CURRENT_STATE_VERSION,
  EDUCATION_PATHS,
  EDUCATIONAL_QUOTES,
  MAX_IMPORT_BYTES,
  createDefaultState,
  educationPath,
  educationPrompts,
  educationResources,
  inferEducationTopic,
  parseStateExport,
  relatedEducationPrompts,
  resourceTierLabel,
  serializeStateExport,
  validateState,
  type EducationIconKey,
  type EducationPathId,
  type EducationPrompt,
  type MorrowwardState,
} from "../../src/data";
import {
  QuotesResponseSchema,
  type EducationTopic,
  type EducationalQuote as MarketEducationalQuote,
} from "../../src/contracts";
import {
  usePersistedState,
  type PersistenceStatus,
  type PersistNow,
  type PersistedStateAdapter,
} from "../hooks/usePersistedState";
import { MarketJourney } from "./MarketJourney";
import {
  GREETING_ROSTER,
  HistoricalGreetingDialog,
  HistoricalGreetingReplayCard,
  clearGreetingWelcomeState,
  getOrCreateGreetingWelcomeState,
  greetingById,
  markGreetingWelcomeSeen,
} from "./HistoricalGreeting";
import {
  PracticeMarketPanel,
  type PracticeMarketAsset,
  type PracticeRefreshStatus,
} from "./PracticeMarketPanel";

type Theme = "dawn" | "horizon" | "alchemy" | "space";
type Experience = "new" | "familiar" | "advanced";
type View = "today" | "plan" | "practice" | "learn" | "mission" | "settings";

type Plan = {
  currentAge: number;
  targetAge: number;
  startingCents: number;
  weeklyCents: number;
  returnBps: number;
  inflationBps: number;
};

export type AppData = {
  schemaVersion: typeof CURRENT_STATE_VERSION;
  onboarded: boolean;
  experience: Experience;
  theme: Theme;
  plan: Plan;
  practice: PracticePortfolio;
  habitLog: HabitLog;
};

type Projection = {
  years: number;
  weeks: number;
  totalContributionsCents: number;
  futureCents: number;
  realCents: number;
  growthCents: number;
};

type Brief = {
  headline: string;
  sections: Array<{
    id:
      | "market-and-sentiment"
      | "frontier-assets"
      | "learning-lens-and-fed-watch";
    title: string;
    body: string;
    sources: Array<{
      title: string;
      url: string;
    }>;
  }>;
  generatedAt: string | null;
  marketSession: "pre-market" | "open" | "closed" | "unknown";
  sentimentLabel:
    | "bullish"
    | "cautiously-bullish"
    | "neutral"
    | "cautious"
    | "bearish"
    | "unknown";
  scenarioBalanceUsd: number;
  disclosure: string;
  provenance: {
    mode: "ai" | "fallback";
    model: string | null;
    source: string;
  };
};

type EducatorReply = {
  title: string;
  answer: string;
  keyPoints: string[];
  assumptions: string[];
  nextStep: string;
  disclosure: string;
  meta: {
    mode: "ai" | "fallback" | "guardrail";
    model: string | null;
    requestId: string | null;
    generatedAt: string | null;
  };
};

type Asset = {
  symbol: PracticeAssetSymbol;
  name: string;
  kind: "ETF" | "Stock" | "Crypto";
};

type MarketQuoteMap = Partial<
  Record<PracticeAssetSymbol, MarketEducationalQuote>
>;

const STORAGE_KEY = "morrowward.app.v1";

function samplePriceCents(symbol: PracticeAssetSymbol): number {
  return Math.round(EDUCATIONAL_QUOTES[symbol].price * 100);
}

const ASSETS: Asset[] = PRACTICE_ASSETS.map((asset) => ({
  symbol: asset.symbol,
  name: asset.name,
  kind:
    asset.kind === "etf"
      ? "ETF"
      : asset.kind === "stock"
        ? "Stock"
        : "Crypto",
}));

const FALLBACK_BRIEF: Brief = {
  headline: "Today’s verified market briefing is not available yet",
  sections: [
    {
      id: "market-and-sentiment",
      title: "Market & sentiment",
      body: "Live market direction, session status, and sentiment could not be verified. Check a current market source before drawing conclusions from today’s movement.",
      sources: [
        {
          title: "NYSE market hours and calendars",
          url: "https://www.nyse.com/markets/hours-calendars",
        },
      ],
    },
    {
      id: "frontier-assets",
      title: "Frontier assets",
      body: "Current developments for the frontier watchlist could not be verified. Morrowward will not invent prices, catalysts, ticker identities, or headlines when the sourced edition is unavailable.",
      sources: [
        {
          title: "SEC EDGAR company filings",
          url: "https://www.sec.gov/edgar/search/",
        },
      ],
    },
    {
      id: "learning-lens-and-fed-watch",
      title: "$100K learning lens & Fed watch",
      body: "No current posture or Federal Reserve calendar is inferred without verified sources. The fixed $100,000 scenario remains an educational case study, and the next sourced edition will replace this fallback after the protected daily run succeeds.",
      sources: [
        {
          title: "Federal Reserve FOMC calendars",
          url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
        },
      ],
    },
  ],
  generatedAt: null,
  marketSession: "unknown",
  sentimentLabel: "unknown",
  scenarioBalanceUsd: 100_000,
  disclosure: "Educational information only—not individualized financial advice. Live information could not be verified, so this edition contains no current market claims.",
  provenance: {
    mode: "fallback",
    model: null,
    source: "Morrowward evergreen educational edition",
  },
};

const EDUCATION_ICONS: Record<EducationIconKey, LucideIcon> = {
  bitcoin: Bitcoin,
  book: BookOpen,
  calendar: Calendar,
  clock: Clock,
  compass: Compass,
  landmark: Landmark,
  "line-chart": LineChart,
  "piggy-bank": PiggyBank,
  sliders: SlidersHorizontal,
  "trending-up": TrendingUp,
  wallet: WalletCards,
};

const EDUCATION_PATH_ICONS: Record<EducationPathId, LucideIcon> = {
  "start-here": BookOpen,
  "build-the-habit": Calendar,
  "understand-risk": ShieldCheck,
  "go-deeper": SlidersHorizontal,
};

const DEMO_QUOTES = Object.fromEntries(
  ASSETS.map((asset) => [
    asset.symbol,
    {
      symbol: asset.symbol,
      priceCents: samplePriceCents(asset.symbol),
      asOf: EDUCATIONAL_QUOTES[asset.symbol].asOf,
      source: EDUCATIONAL_QUOTES[asset.symbol].source.name,
      status: "delayed" as const,
    },
  ]),
) as EducationalQuoteMap;

const DEMO_MARKET_QUOTES = { ...EDUCATIONAL_QUOTES } as MarketQuoteMap;

const DAILY_MARKET_SNAPSHOT_MS = 24 * 60 * 60_000;
const MARKET_SNAPSHOT_FUTURE_SKEW_MS = 5 * 60_000;

export function shouldRecheckDailyMarketSnapshot(
  provider: {
    configured: boolean;
    lastSuccessfulUpdate: string | null;
  },
  nowMs = Date.now(),
): boolean {
  if (!provider.configured) return false;
  if (!provider.lastSuccessfulUpdate) return true;
  const updatedAtMs = Date.parse(provider.lastSuccessfulUpdate);
  const ageMs = nowMs - updatedAtMs;
  return (
    !Number.isFinite(updatedAtMs) ||
    ageMs < -MARKET_SNAPSHOT_FUTURE_SKEW_MS ||
    ageMs >= DAILY_MARKET_SNAPSHOT_MS
  );
}

export function quotesResponseToMarketQuotes(
  payload: unknown,
): MarketQuoteMap | null {
  const parsed = QuotesResponseSchema.safeParse(payload);
  if (!parsed.success) return null;
  return Object.fromEntries(
    parsed.data.quotes.map((quote) => [quote.symbol, quote]),
  ) as MarketQuoteMap;
}

export function quotesResponseToMap(payload: unknown): EducationalQuoteMap | null {
  const parsed = QuotesResponseSchema.safeParse(payload);
  if (!parsed.success) return null;
  return Object.fromEntries(
    parsed.data.quotes.map((quote) => [
      quote.symbol,
      {
        symbol: quote.symbol,
        priceCents: Math.round(quote.price * 100),
        asOf: quote.observedAt,
        source: quote.source.name,
        status:
          quote.freshness.isLive || quote.freshness.status === "fresh"
            ? ("fresh" as const)
            : ("delayed" as const),
      },
    ]),
  ) as EducationalQuoteMap;
}

function quoteChangeMethod(quote: MarketEducationalQuote): string {
  if (quote.mode === "sample") {
    return "A fixed synthetic teaching value bundled with Morrowward; it is not a market observation.";
  }
  if (quote.changeBasis === "rolling-24h") {
    return "The displayed short-term change uses the provider's rolling 24-hour comparison.";
  }
  if (quote.changeBasis === "previous-close") {
    return "The displayed short-term change compares the observation with the previous market close.";
  }
  return "The provider did not supply a usable short-term comparison.";
}

export function marketQuotesToPracticeAssets(
  quotes: MarketQuoteMap,
): PracticeMarketAsset[] {
  return PRACTICE_ASSETS.map((asset) => {
    const quote = quotes[asset.symbol] ?? EDUCATIONAL_QUOTES[asset.symbol];
    const source = quote.source;
    const history = quote.history;
    const syntheticHistory = history?.mode === "sample";
    const historyMethodology = history
      ? syntheticHistory
        ? "A deterministic Morrowward teaching path. It is not a replay of this asset's market history."
        : `Adjusted closing-price observations from ${history.source.name}; dividends and investor cash flows are not modeled as a total return.`
      : undefined;
    const freshness = quote.freshness.isLive
      ? ("live" as const)
      : quote.freshness.status;
    const publicTradingNote = quote.profile.publicTradingSince
      ? ` Public trading began ${new Date(`${quote.profile.publicTradingSince}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}, so available history is limited.`
      : "";
    const whatItIs =
      asset.kind === "etf"
        ? `${quote.profile.summary} An ETF pools assets and trades in shares; owning one is not the same as owning every holding directly.`
        : asset.kind === "stock"
          ? `${quote.profile.summary} A share represents fractional ownership in one public company.${publicTradingNote}`
          : `${quote.profile.summary} It is not a company share or a bank deposit, and its market can trade around the clock.`;

    return {
      symbol: asset.symbol,
      name: quote.name,
      category: quote.profile.category,
      shortDescription: `${quote.profile.summary}${publicTradingNote}`,
      whatItIs,
      educationalRisk: {
        level: quote.profile.educationalRisk,
        summary: quote.profile.summary,
        methodology:
          "A qualitative teaching label based on diversification, concentration, and typical price variability—not a suitability score or complete risk analysis.",
      },
      quote: {
        priceCents: Math.round(quote.price * 100),
        change1dBps:
          quote.changePercent === null
            ? null
            : Math.round(quote.changePercent * 100),
        change1dLabel:
          quote.mode === "sample"
            ? "Sample 1D"
            : quote.changeBasis === "rolling-24h"
              ? "24H"
              : "1D",
        change1yBps: history
          ? Math.round(history.priceChangePercent * 100)
          : null,
        change1yLabel: syntheticHistory ? "Sample 1Y" : "1Y",
        asOf: quote.observedAt,
        sourceName: source.name,
        sourceUrl: source.url ?? undefined,
        sourceKind: source.kind,
        sourceCitations: source.citations,
        freshness,
        freshnessNote: quote.freshness.label,
        methodology: quoteChangeMethod(quote),
      },
      history: history
        ? {
            periodLabel: "1-year",
            kind: syntheticHistory ? "synthetic" : "historical",
            limited: history.limited,
            points: history.points.map((point) => ({
              timestamp: `${point.date}T00:00:00.000Z`,
              priceCents: Math.round(point.close * 100),
            })),
            sourceName: history.source.name,
            sourceUrl: history.source.url,
            asOf: `${history.endDate}T00:00:00.000Z`,
            methodology: historyMethodology,
          }
        : null,
      selectable: true,
    };
  });
}

export function stateToAppData(input: MorrowwardState): AppData {
  const state = validateState(input);
  return {
    schemaVersion: CURRENT_STATE_VERSION,
    onboarded: state.profile.onboardingComplete,
    experience: state.profile.experienceLevel,
    theme: state.profile.theme,
    plan: {
      currentAge: state.plan.currentAge,
      targetAge: state.plan.targetAge,
      startingCents: state.plan.startingBalanceCents,
      weeklyCents: state.plan.weeklyContributionCents,
      returnBps: state.plan.annualReturnBps,
      inflationBps: state.plan.annualInflationBps,
    },
    practice: state.practicePortfolio,
    habitLog: state.habitLog,
  };
}

export function appDataToState(
  data: AppData,
  updatedAt = new Date().toISOString(),
): MorrowwardState {
  return validateState({
    schemaVersion: CURRENT_STATE_VERSION,
    profile: {
      experienceLevel: data.experience,
      theme: data.theme,
      onboardingComplete: data.onboarded,
    },
    plan: {
      currentAge: data.plan.currentAge,
      targetAge: data.plan.targetAge,
      startingBalanceCents: data.plan.startingCents,
      weeklyContributionCents: data.plan.weeklyCents,
      annualReturnBps: data.plan.returnBps,
      annualInflationBps: data.plan.inflationBps,
    },
    practicePortfolio: data.practice,
    habitLog: data.habitLog,
    updatedAt,
  });
}

const APP_DATA_ADAPTER: PersistedStateAdapter<AppData> = {
  fromCanonical: stateToAppData,
  toCanonical: appDataToState,
};

function createDefaultData(): AppData {
  return stateToAppData(createDefaultState());
}

function planToProjectionInput(plan: Plan, annualReturnBps = plan.returnBps) {
  return {
    currentAge: plan.currentAge,
    targetAge: plan.targetAge,
    startingBalanceCents: plan.startingCents,
    weeklyContributionCents: plan.weeklyCents,
    annualReturnBps,
    annualInflationBps: plan.inflationBps,
  };
}

function projectionForUi(result: ProjectionResult): Projection {
  return {
    years: result.yearsRemaining,
    weeks: result.weeksRemaining,
    totalContributionsCents: result.totalContributionsCents,
    futureCents: result.nominalFutureValueCents,
    realCents: result.inflationAdjustedFutureValueCents,
    growthCents: result.estimatedGrowthCents,
  };
}

function calculateUiProjection(
  plan: Plan,
  annualReturnBps = plan.returnBps,
): Projection {
  return projectionForUi(
    calculateProjection(planToProjectionInput(plan, annualReturnBps)),
  );
}

function practiceStatus(data: AppData, referenceDate = new Date()) {
  const currentWeek = isoWeekKey(referenceDate);
  const currentTransactions = data.practice.transactions.filter(
    (transaction) => isoWeekKey(transaction.occurredAt) === currentWeek,
  );
  const progress = calculateHabitProgress(data.habitLog, referenceDate);
  return {
    weeklyAdded: currentTransactions.some(
      (transaction) => transaction.type === "deposit",
    ),
    purchaseDone: currentTransactions.some(
      (transaction) => transaction.type === "buy",
    ),
    streak: progress.currentStreakWeeks,
  };
}

function sixPriorWeeks(referenceDate = new Date()): HabitLog {
  let log = createHabitLog();
  for (let weeksAgo = 6; weeksAgo >= 1; weeksAgo -= 1) {
    const date = new Date(referenceDate);
    date.setUTCDate(date.getUTCDate() - weeksAgo * 7);
    log = recordCompletedWeek(log, date);
  }
  return log;
}

const compactMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
  notation: "compact",
});

const exactMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatMoney(cents: number, compact = false) {
  return (compact ? compactMoney : exactMoney).format(cents / 100);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function fallbackEducator(question: string): EducatorReply {
  const lower = question.toLowerCase();
  let title = "Learn one tradeoff at a time";
  let answer =
    "A long-term projection is a way to explore how your starting amount, recurring contributions, time, and an illustrative return interact. It is a learning model—not a prediction.";
  let keyPoints = [
    "Time, contributions, fees, and diversification are inputs you can examine.",
    "Future returns remain uncertain, so scenarios compare possibilities rather than predict outcomes.",
  ];
  if (lower.includes("compound")) {
    title = "Compounding rewards time and consistency";
    answer =
      "Compounding means growth can earn growth of its own. In this simulation, each week begins with the prior balance, applies the selected illustrative rate, and then adds your weekly contribution. More time gives that repeated process more chances to work.";
    keyPoints = [
      "Starting earlier gives each contribution more periods to participate.",
      "A higher illustrative rate also represents greater uncertainty—not a promise.",
    ];
  } else if (lower.includes("inflation")) {
    title = "Inflation changes what future money can buy";
    answer =
      "Inflation-adjusted value translates a future amount into an estimate of today's purchasing power. If prices rise over time, the same number of dollars may buy less, so Morrowward shows both nominal and inflation-adjusted illustrations.";
    keyPoints = [
      "Nominal value counts future dollars.",
      "Inflation-adjusted value estimates what those dollars may buy in today's terms.",
    ];
  } else if (lower.includes("divers")) {
    title = "Diversification spreads exposure";
    answer =
      "Diversification means spreading exposure across different investments rather than relying on one outcome. It can reduce concentration risk, but it cannot prevent losses or guarantee returns.";
    keyPoints = [
      "Different assets can respond differently to the same event.",
      "Diversification manages concentration; it does not make investing risk-free.",
    ];
  } else if (lower.includes("return") || lower.includes("vary") || lower.includes("risk")) {
    title = "Risk and return belong in the same conversation";
    answer =
      "Real returns change from year to year and can be negative. Morrowward's 3%, 6%, and 9% scenarios are editable illustrations chosen to compare possibilities—not forecasts or expected results.";
    keyPoints = [
      "Average returns can hide large gains and losses along the way.",
      "A long horizon may create recovery time, but it never removes risk.",
    ];
  }
  return {
    title,
    answer,
    keyPoints,
    assumptions: ["The simulator uses a steady illustrative rate.", "Taxes, fees, and market swings are not modeled in this view."],
    nextStep: "Try changing one assumption at a time and compare the three scenarios.",
    disclosure: "Educational information only—not individualized financial advice.",
    meta: {
      mode: "fallback",
      model: null,
      requestId: null,
      generatedAt: null,
    },
  };
}

export function parseEducatorReply(payload: unknown, question: string): EducatorReply {
  if (!isRecord(payload)) return fallbackEducator(question);
  const nested = isRecord(payload.explanation) ? payload.explanation : payload;
  const meta = isRecord(payload.meta) ? payload.meta : {};
  const answer =
    (typeof payload.answer === "string" && payload.answer) ||
    (typeof nested.answer === "string" && nested.answer) ||
    (typeof nested.summary === "string" && nested.summary) ||
    false;
  if (!answer) return fallbackEducator(question);

  const mode =
    meta.mode === "ai" || meta.mode === "guardrail" || meta.mode === "fallback"
      ? meta.mode
      : "fallback";
  const topLevelAssumptions = stringArray(payload.assumptions);
  const tryNext = stringArray(nested.tryNext);

  return {
    title:
      (typeof nested.title === "string" && nested.title) ||
      "Morrow’s explanation",
    answer,
    keyPoints: stringArray(nested.keyPoints),
    assumptions:
      topLevelAssumptions.length > 0
        ? topLevelAssumptions
        : stringArray(nested.assumptions),
    nextStep:
      (typeof payload.nextStep === "string" && payload.nextStep) ||
      (typeof nested.nextStep === "string" && nested.nextStep) ||
      tryNext[0] ||
      "Compare the result with another assumption and notice what changes.",
    disclosure:
      (typeof payload.disclosure === "string" && payload.disclosure) ||
      (typeof nested.disclosure === "string" && nested.disclosure) ||
      "Educational information only—not individualized financial advice.",
    meta: {
      mode,
      model: typeof meta.model === "string" ? meta.model : null,
      requestId: typeof meta.requestId === "string" ? meta.requestId : null,
      generatedAt:
        typeof meta.generatedAt === "string" ? meta.generatedAt : null,
    },
  };
}

function safeBriefSourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password
    ) {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function parseBriefSources(value: unknown): Brief["sections"][number]["sources"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item.title !== "string"
    ) {
      return [];
    }
    const url = safeBriefSourceUrl(item.url);
    if (!url) return [];
    return [
      {
        title: item.title,
        url,
      },
    ];
  });
}

export function parseBrief(payload: unknown): Brief {
  if (!isRecord(payload)) return FALLBACK_BRIEF;
  const nested = isRecord(payload.brief) ? payload.brief : payload;
  if (
    typeof nested.headline !== "string" ||
    !Array.isArray(nested.sections)
  ) {
    return FALLBACK_BRIEF;
  }
  const sectionIds = [
    "market-and-sentiment",
    "frontier-assets",
    "learning-lens-and-fed-watch",
  ] as const;
  const rawSections = nested.sections as unknown[];
  const sections = sectionIds.flatMap((id) => {
    const section = rawSections.find(
      (item) => isRecord(item) && item.id === id,
    );
    if (
      !isRecord(section) ||
      typeof section.title !== "string" ||
      typeof section.body !== "string"
    ) {
      return [];
    }
    const sources = parseBriefSources(section.sources);
    if (sources.length === 0) return [];
    return [
      {
        id,
        title: section.title,
        body: section.body,
        sources,
      },
    ];
  });
  if (sections.length !== 3) return FALLBACK_BRIEF;

  const meta = isRecord(nested.meta)
    ? nested.meta
    : isRecord(payload.meta)
      ? payload.meta
      : {};
  const suppliedGeneratedAt =
    typeof nested.generatedAt === "string" &&
    Number.isFinite(Date.parse(nested.generatedAt))
      ? nested.generatedAt
      : null;
  const mode =
    meta.mode === "ai" && suppliedGeneratedAt ? "ai" : "fallback";
  const source =
    (typeof meta.source === "string" && meta.source) ||
    "Morrowward educational edition";
  const marketSession = [
    "pre-market",
    "open",
    "closed",
    "unknown",
  ].includes(String(nested.marketSession))
    ? nested.marketSession as Brief["marketSession"]
    : "unknown";
  const sentimentLabel = [
    "bullish",
    "cautiously-bullish",
    "neutral",
    "cautious",
    "bearish",
    "unknown",
  ].includes(String(nested.sentimentLabel))
    ? nested.sentimentLabel as Brief["sentimentLabel"]
    : "unknown";

  return {
    headline: nested.headline,
    sections,
    generatedAt: mode === "ai" ? suppliedGeneratedAt : null,
    marketSession,
    sentimentLabel,
    scenarioBalanceUsd: 100_000,
    disclosure:
      typeof nested.disclosure === "string"
        ? nested.disclosure
        : "Educational information only—not individualized financial advice.",
    provenance: {
      mode,
      model: typeof meta.model === "string" ? meta.model : null,
      source,
    },
  };
}

const NAV_ITEMS: Array<{ id: View; label: string; icon: LucideIcon }> = [
  { id: "today", label: "Today", icon: Home },
  { id: "plan", label: "My horizon", icon: LineChart },
  { id: "practice", label: "Practice", icon: FlaskConical },
  { id: "learn", label: "Learn", icon: BookOpen },
  { id: "mission", label: "Our why", icon: Heart },
];

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="Morrowward home">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="brand-copy">
        <strong>Morrowward</strong>
        {!compact && <small>A financial future simulator</small>}
      </span>
    </div>
  );
}

function ThemePicker({ theme, onChange, compact = false }: { theme: Theme; onChange: (theme: Theme) => void; compact?: boolean }) {
  const themes: Array<{ id: Theme; label: string; icon: LucideIcon }> = [
    { id: "dawn", label: "Dawn", icon: Sun },
    { id: "horizon", label: "Horizon", icon: Moon },
    { id: "alchemy", label: "Alchemy", icon: FlaskConical },
    { id: "space", label: "Space", icon: Rocket },
  ];
  return (
    <div className={compact ? "theme-picker compact" : "theme-picker"} role="group" aria-label="Choose a color theme">
      {themes.map((item) => {
        const Icon = item.icon;
        return (
          <button
            className={theme === item.id ? "theme-button active" : "theme-button"}
            data-testid={`theme-${item.id}`}
            type="button"
            key={item.id}
            onClick={() => onChange(item.id)}
            aria-pressed={theme === item.id}
            aria-label={compact ? `Use ${item.label} theme` : undefined}
          >
            <Icon size={compact ? 15 : 18} aria-hidden="true" />
            {!compact && <span>{item.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  prefix,
  suffix,
  testId,
  integer = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  prefix?: string;
  suffix?: string;
  testId?: string;
  integer?: boolean;
}) {
  const accessibleUnit =
    prefix === "$"
      ? " in US dollars"
      : suffix === "%"
        ? " in percent"
        : suffix
          ? ` in ${suffix}`
          : "";

  return (
    <label className="number-field">
      <span>{label}<span className="sr-only">{accessibleUnit}</span></span>
      <span className="input-shell">
        {prefix && <span aria-hidden="true">{prefix}</span>}
        <input
          data-testid={testId}
          type="number"
          inputMode={integer ? "numeric" : "decimal"}
          value={value}
          min={min}
          max={max}
          step={integer ? 1 : "any"}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (!Number.isFinite(parsed)) return;
            const bounded = clamp(parsed, min, max);
            onChange(integer ? Math.round(bounded) : bounded);
          }}
        />
        {suffix && <span aria-hidden="true">{suffix}</span>}
      </span>
    </label>
  );
}

function Onboarding({ data, setData }: { data: AppData; setData: (data: AppData) => void }) {
  const [step, setStep] = useState(1);
  const setupTitleRef = useRef<HTMLHeadingElement>(null);
  const initialStepRef = useRef(true);
  const preview = useMemo(() => calculateUiProjection(data.plan), [data.plan]);

  useEffect(() => {
    if (initialStepRef.current) {
      initialStepRef.current = false;
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      setupTitleRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [step]);

  const complete = (demo = false) => {
    if (demo) {
      setData({
        ...data,
        onboarded: true,
        experience: "new",
        theme: "horizon",
        plan: { ...data.plan, currentAge: 30, targetAge: 60, startingCents: 400000, weeklyCents: 5000 },
        practice: { ...data.practice, cashCents: 25000 },
        habitLog: sixPriorWeeks(),
      });
      return;
    }
    setData({ ...data, onboarded: true });
  };

  return (
    <main className="onboarding">
      <a className="skip-link" href="#setup-title">Skip to setup</a>
      <header className="onboarding-header">
        <Brand />
        <button className="text-button" data-testid="onboarding-demo" type="button" onClick={() => complete(true)}>
          Explore a sample plan <ArrowRight size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="onboarding-grid">
        <section className="onboarding-story" aria-labelledby="welcome-title">
          <div className="eyebrow"><Leaf size={16} aria-hidden="true" /> Built for steady progress</div>
          <h1 id="welcome-title">Small steps.<br /><em>A future you can see.</em></h1>
          <p className="lead">Turn a weekly habit into a long-view illustration, practice without real money, and learn at your own pace.</p>
          <div className="preview-window" aria-label="Example Morrowward projection">
            <div className="preview-topline">
              <span>Illustrative horizon</span>
              <span>{preview.years} years</span>
            </div>
            <strong>{formatMoney(preview.futureCents, true)}</strong>
            <span>at age {data.plan.targetAge} in the {data.plan.returnBps / 100}% scenario</span>
            <div className="mini-trajectory" aria-hidden="true">
              {[18, 24, 31, 42, 56, 73, 96].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
            </div>
            <div className="preview-note"><Sparkles size={16} aria-hidden="true" /> An illustration, never a promise.</div>
          </div>
          <div className="trust-row">
            <span><Lock size={15} aria-hidden="true" /> No sign-up</span>
            <span><Database size={15} aria-hidden="true" /> Data stays local</span>
            <span><FlaskConical size={15} aria-hidden="true" /> Practice only</span>
          </div>
        </section>

        <section className="setup-card" id="onboarding-form" aria-labelledby="setup-title">
          <div
            className="step-line"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={1}
            aria-valuemax={3}
            aria-valuenow={step}
            aria-valuetext={`Step ${step} of 3`}
          >
            {[1, 2, 3].map((item) => <span aria-hidden="true" key={item} className={item <= step ? "active" : ""} />)}
          </div>
          {step === 1 && (
            <div className="setup-step">
              <div className="setup-heading">
                <span>Step 1 of 3</span>
                <h2 id="setup-title" ref={setupTitleRef} tabIndex={-1}>Meet me where I am</h2>
                <p>This changes the language and detail—not the math.</p>
              </div>
              <div className="choice-list" role="group" aria-labelledby="setup-title">
                {([
                  ["new", "New to investing", "Plain language, clear milestones, fewer moving parts", Leaf],
                  ["familiar", "I know the basics", "More context, comparisons, and allocation ideas", Compass],
                  ["advanced", "I like the details", "Assumptions, real values, and deeper analysis", LineChart],
                ] as Array<[Experience, string, string, LucideIcon]>).map(([id, title, copy, Icon]) => (
                  <button
                    key={id}
                    className={data.experience === id ? "choice-card selected" : "choice-card"}
                    data-testid={`experience-${id}`}
                    type="button"
                    onClick={() => setData({ ...data, experience: id })}
                    aria-pressed={data.experience === id}
                  >
                    <span className="choice-icon"><Icon size={21} aria-hidden="true" /></span>
                    <span><strong>{title}</strong><small>{copy}</small></span>
                    <span className="choice-check"><Check size={15} aria-hidden="true" /></span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="setup-step">
              <div className="setup-heading">
                <span>Step 2 of 3</span>
                <h2 id="setup-title" ref={setupTitleRef} tabIndex={-1}>Choose your atmosphere</h2>
                <p>Pick the atmosphere that helps the future feel inviting.</p>
              </div>
              <div className="theme-cards" role="group" aria-labelledby="setup-title">
                {([
                  ["dawn", "Dawn", "Warm, bright, grounded", Sun],
                  ["horizon", "Horizon", "Deep blue, calm, expansive", Moon],
                  ["alchemy", "Alchemy", "Charcoal, violet, luminous", FlaskConical],
                  ["space", "Space", "Star glow, rocket fire, infinite", Rocket],
                ] as Array<[Theme, string, string, LucideIcon]>).map(([id, title, copy, Icon]) => (
                  <button
                    key={id}
                    className={`theme-card theme-${id} ${data.theme === id ? "selected" : ""}`}
                    data-testid={`onboarding-theme-${id}`}
                    type="button"
                    onClick={() => setData({ ...data, theme: id })}
                    aria-pressed={data.theme === id}
                  >
                    <span className="theme-card-art" aria-hidden="true"><i /><i /><Icon size={22} /></span>
                    <strong>{title}</strong>
                    <small>{copy}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="setup-step">
              <div className="setup-heading">
                <span>Step 3 of 3</span>
                <h2 id="setup-title" ref={setupTitleRef} tabIndex={-1}>Sketch my first plan</h2>
                <p>Use rough numbers. Everything stays editable and on this device.</p>
              </div>
              <div className="field-grid">
                <NumberField integer label="My age now" value={data.plan.currentAge} min={18} max={90} suffix="years" testId="plan-current-age" onChange={(currentAge) => setData({ ...data, plan: { ...data.plan, currentAge, targetAge: Math.max(currentAge + 1, data.plan.targetAge) } })} />
                <NumberField integer label="Age to look toward" value={data.plan.targetAge} min={data.plan.currentAge + 1} max={100} suffix="years" testId="plan-target-age" onChange={(targetAge) => setData({ ...data, plan: { ...data.plan, targetAge } })} />
                <NumberField label="Starting amount" value={data.plan.startingCents / 100} min={0} max={10000000} prefix="$" testId="plan-starting-balance" onChange={(value) => setData({ ...data, plan: { ...data.plan, startingCents: Math.round(value * 100) } })} />
                <NumberField label="Weekly habit" value={data.plan.weeklyCents / 100} min={0} max={100000} prefix="$" testId="plan-weekly-contribution" onChange={(value) => setData({ ...data, plan: { ...data.plan, weeklyCents: Math.round(value * 100) } })} />
              </div>
              <div className="scenario-choice">
                <span>Start with an illustrative return</span>
                <div role="group" aria-label="Illustrative annual return">
                  {[300, 600, 900].map((rate) => (
                    <button key={rate} type="button" className={data.plan.returnBps === rate ? "active" : ""} onClick={() => setData({ ...data, plan: { ...data.plan, returnBps: rate } })} aria-pressed={data.plan.returnBps === rate}>
                      {rate / 100}%
                    </button>
                  ))}
                </div>
                <small>Not expected returns. Compare possibilities and edit later.</small>
              </div>
            </div>
          )}

          <div className="setup-actions">
            {step > 1 ? <button className="button secondary" type="button" onClick={() => setStep(step - 1)}>Back</button> : <span />}
            <button
              className="button primary"
              data-testid={step === 3 ? "onboarding-complete" : "onboarding-next"}
              type="button"
              onClick={() => step < 3 ? setStep(step + 1) : complete()}
            >
              {step < 3 ? "Continue" : "Reveal my horizon"} <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        </section>
      </div>
      <p className="onboarding-disclosure">For education and simulation only. No real trades. No financial advice.</p>
    </main>
  );
}

function TopBar({
  active,
  theme,
  onNavigate,
  onTheme,
  menuOpen,
  setMenuOpen,
}: {
  active: View;
  theme: Theme;
  onNavigate: (view: View) => void;
  onTheme: (theme: Theme) => void;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
}) {
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const frame = window.requestAnimationFrame(() => {
      mobileMenuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    });
    const handleMenuKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        menuTriggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !mobileMenuRef.current) return;
      const focusable = Array.from(
        mobileMenuRef.current.querySelectorAll<HTMLButtonElement>("button"),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        mobileMenuRef.current?.contains(target) ||
        menuTriggerRef.current?.contains(target)
      ) {
        return;
      }
      setMenuOpen(false);
    };
    document.addEventListener("keydown", handleMenuKeyDown);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleMenuKeyDown);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [menuOpen, setMenuOpen]);

  return (
    <>
      <header className="app-header">
        <button className="brand-button" type="button" onClick={() => onNavigate("today")}><Brand /></button>
        <nav className="desktop-nav" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <button data-testid={`nav-${item.id}`} key={item.id} type="button" className={active === item.id ? "active" : ""} onClick={() => onNavigate(item.id)} aria-current={active === item.id ? "page" : undefined}>{item.label}</button>
          ))}
        </nav>
        <div className="header-actions">
          <ThemePicker theme={theme} onChange={onTheme} compact />
          <button className="icon-button settings-button" data-testid="nav-settings" type="button" onClick={() => onNavigate("settings")} aria-label="Open settings" aria-current={active === "settings" ? "page" : undefined}><Settings size={19} aria-hidden="true" /></button>
          <button ref={menuTriggerRef} className="icon-button menu-button" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="mobile-menu" aria-label={menuOpen ? "Close menu" : "Open menu"}>{menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}</button>
        </div>
      </header>
      {menuOpen && (
        <nav ref={mobileMenuRef} className="mobile-drawer" id="mobile-menu" aria-label="Mobile menu">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} type="button" onClick={() => onNavigate(item.id)} className={active === item.id ? "active" : ""} aria-current={active === item.id ? "page" : undefined}><Icon size={18} aria-hidden="true" />{item.label}<ChevronRight size={16} aria-hidden="true" /></button>;
          })}
          <button type="button" onClick={() => onNavigate("settings")} className={active === "settings" ? "active" : ""} aria-current={active === "settings" ? "page" : undefined}><Settings size={18} aria-hidden="true" />Settings<ChevronRight size={16} aria-hidden="true" /></button>
        </nav>
      )}
    </>
  );
}

function HorizonHero({ data, projection, onNavigate }: { data: AppData; projection: Projection; onNavigate: (view: View) => void }) {
  const trajectory = useMemo(() => {
    const points = Array.from({ length: 7 }, (_, index) => {
      const age = Math.round(data.plan.currentAge + (projection.years * index) / 6);
      return {
        age,
        value:
          age <= data.plan.currentAge
            ? data.plan.startingCents
            : calculateUiProjection({ ...data.plan, targetAge: age }).futureCents,
      };
    });
    const max = Math.max(1, ...points.map((point) => point.value));
    return points.map((point) => ({ ...point, height: 14 + (point.value / max) * 76 }));
  }, [data.plan, projection.years]);

  return (
    <section className="horizon-hero" aria-labelledby="horizon-title">
      <div className="hero-orbits" aria-hidden="true"><i /><i /><i /></div>
      <div className="horizon-copy">
        <div className="eyebrow"><Sparkles size={15} aria-hidden="true" /> Your horizon reveal</div>
        <h2 id="horizon-title">Your small steps could become <strong>{formatMoney(projection.futureCents, true)}</strong></h2>
        <p>by age {data.plan.targetAge} in a steady {data.plan.returnBps / 100}% illustration.</p>
        <div className="hero-actions">
          <button className="button light" type="button" onClick={() => onNavigate("plan")}>Explore the assumptions <ArrowRight size={17} aria-hidden="true" /></button>
          <span><Info size={15} aria-hidden="true" /> Illustration, not a forecast</span>
        </div>
      </div>
      <div className="horizon-visual">
        <div className="horizon-art" aria-hidden="true" data-testid="horizon-future-image">
          {/* Static, precached PWA artwork intentionally avoids an optimizer-only URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/morrowward-future-horizon.jpg"
            alt=""
            width="1794"
            height="877"
            decoding="async"
          />
        </div>
        <div className="trajectory-card">
          <div className="trajectory-head"><span>Illustrative path</span><strong>{projection.years} years</strong></div>
          <div className="trajectory-bars" role="img" aria-label={`Illustrative growth from ${formatMoney(data.plan.startingCents)} to ${formatMoney(projection.futureCents)}`}>
            {trajectory.map((point) => <span key={point.age} style={{ height: `${point.height}%` }}><i /><small>{point.age}</small></span>)}
          </div>
          <div className="trajectory-legend"><span>Today</span><span>Age {data.plan.targetAge}</span></div>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <span className="metric-icon"><Icon size={20} aria-hidden="true" /></span>
      <div><small>{label}</small><strong>{value}</strong><span>{detail}</span></div>
    </article>
  );
}

const HUNDRED_K_MILESTONE_SOURCES = [
  {
    title: "Investor.gov · Introduction to investing",
    url: "https://www.investor.gov/introduction-investing",
  },
  {
    title: "Investor.gov · Compound interest calculator",
    url: "https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator",
  },
  {
    title: "Investor.gov · A $100K savings example",
    url: "https://www.investor.gov/money-smarts-quiz-answer-7c",
  },
] as const;

function HundredKMilestoneDetails() {
  return (
    <details className="hundred-k-details" data-testid="hundred-k-details">
      <summary>
        <Info size={13} aria-hidden="true" />
        Why $100K?
        <ChevronRight size={13} aria-hidden="true" />
      </summary>
      <div className="hundred-k-panel">
        <span className="section-kicker">A useful marker—not magic</span>
        <h4>The first six figures can make compounding feel visible.</h4>
        <p>
          Early progress is driven mostly by consistent contributions because
          the invested base is still small. At the same illustrative 6% annual
          return, $10K would gain about $600 in one year while $100K would gain
          about $6,000—before fees, taxes, and market losses.
        </p>
        <div className="hundred-k-math" aria-label="One hundred thousand dollar milestone comparison">
          <span><strong>$1 → $100K</strong><small>100,000× the starting amount</small></span>
          <ArrowRight size={14} aria-hidden="true" />
          <span><strong>$100K → $1M</strong><small>10× the starting amount</small></span>
        </div>
        <p>
          That explains the popular milestone, but it does not mean the next
          $900K will take less time. Contributions, returns, risk, fees, taxes,
          and setbacks determine every real path.
        </p>
        <nav aria-label="Why one hundred thousand dollars sources">
          {HUNDRED_K_MILESTONE_SOURCES.map((source) => (
            <a
              href={source.url}
              key={source.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {source.title}
              <ExternalLink size={11} aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ))}
        </nav>
      </div>
    </details>
  );
}

export function formatBriefUpdatedAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(date);
}

function BriefCard({ brief, loading }: { brief: Brief; loading: boolean }) {
  const updatedAt = formatBriefUpdatedAt(brief.generatedAt);
  const editionLabel =
    brief.provenance.mode === "ai"
      ? `${brief.sentimentLabel.replace("-", " ")} · ${brief.marketSession}`
      : "Verified daily edition pending";
  return (
    <article className="panel brief-card" aria-busy={loading} data-testid="daily-brief">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {loading ? "Checking today’s daily briefing." : `Daily briefing ready. ${editionLabel}.`}
      </p>
      <div className="panel-heading">
        <div><span className="section-kicker">Today’s 90-second brief</span><h2>{brief.headline}</h2></div>
        <div className="brief-updated" data-testid="brief-last-updated">
          <Clock size={17} aria-hidden="true" />
          <span>
            <strong>Briefing last updated</strong>
            {updatedAt && brief.generatedAt ? (
              <time dateTime={brief.generatedAt}>{updatedAt}</time>
            ) : (
              <small>Waiting for today’s verified edition</small>
            )}
          </span>
        </div>
      </div>
      <div className="brief-grid">
        {brief.sections.map((section) => {
          const Icon =
            section.id === "market-and-sentiment"
              ? LineChart
              : section.id === "frontier-assets"
                ? Sparkles
                : Landmark;
          return (
            <section data-testid={`brief-section-${section.id}`} key={section.id}>
              <div className="brief-section-heading">
                <h3 className="brief-label"><Icon size={15} aria-hidden="true" /> {section.title}</h3>
                {section.id === "learning-lens-and-fed-watch" && (
                  <HundredKMilestoneDetails />
                )}
              </div>
              <p>{section.body}</p>
              <div className="brief-sources" aria-label={`${section.title} sources`}>
                <span>Sources</span>
                {section.sources.map((source) => (
                  <a href={source.url} key={source.url} target="_blank" rel="noopener noreferrer">
                    {source.title}<ExternalLink size={11} aria-hidden="true" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <footer>
        <span>{brief.disclosure}</span>
        <span title={`Source: ${brief.provenance.source}`}>{brief.provenance.mode === "ai" ? <Sparkles size={13} aria-hidden="true" /> : <Database size={13} aria-hidden="true" />}{brief.provenance.source}</span>
      </footer>
    </article>
  );
}

function TodayView({ data, projection, brief, briefLoading, onNavigate }: { data: AppData; projection: Projection; brief: Brief; briefLoading: boolean; onNavigate: (view: View) => void }) {
  const nextMilestone = [1_000_000, 2_500_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000].find((value) => value > data.plan.startingCents) ?? 250_000_000;
  const habit = practiceStatus(data);
  return (
    <div className="view-stack">
      <div className="page-intro">
        <div><span className="section-kicker">Today · Week {Math.max(1, habit.streak + 1)}</span><h1>Good to see you. Your future is still in motion.</h1><p>One calm action is enough for today.</p></div>
        <button className="button secondary" type="button" onClick={() => onNavigate("practice")}><FlaskConical size={17} aria-hidden="true" /> Open practice mode</button>
      </div>
      <HorizonHero data={data} projection={projection} onNavigate={onNavigate} />
      <section className="metrics-grid" aria-label="Plan summary">
        <MetricCard icon={PiggyBank} label="You contribute" value={formatMoney(projection.totalContributionsCents, true)} detail="starting amount + weekly habits" />
        <MetricCard icon={TrendingUp} label="Illustrative growth" value={formatMoney(projection.growthCents, true)} detail="not guaranteed or expected" />
        <MetricCard icon={Clock} label="In today’s dollars" value={formatMoney(projection.realCents, true)} detail={`using ${data.plan.inflationBps / 100}% inflation`} />
        <MetricCard icon={Target} label="Next marker" value={formatMoney(nextMilestone, true)} detail={`${projection.years} years remain in this view`} />
      </section>
      <aside className={`experience-context ${data.experience}`} aria-label={`${data.experience} experience context`}>
        <span><SlidersHorizontal size={17} aria-hidden="true" /></span>
        <div>
          <strong>{data.experience === "new" ? "Your simple view" : data.experience === "familiar" ? "Your context view" : "Your model detail"}</strong>
          <p>
            {data.experience === "new"
              ? `Focus on the repeatable habit: ${formatMoney(data.plan.weeklyCents)} each week over ${projection.years} years. Every result remains an illustration.`
              : data.experience === "familiar"
                ? `This view uses a ${data.plan.returnBps / 100}% illustrative return and ${data.plan.inflationBps / 100}% inflation so you can compare contributions with modeled growth.`
                : `Inputs: ${data.plan.returnBps} bps annual return, ${data.plan.inflationBps} bps inflation, and weekly compounding. Taxes, fees, volatility paths, and account rules are excluded.`}
          </p>
        </div>
      </aside>
      <section className="today-grid">
        <article className="panel weekly-card">
          <div className="panel-heading"><div><span className="section-kicker">Your next small step</span><h2>{habit.purchaseDone ? "Habit complete. Nicely done." : "Practice this week’s $" + (data.plan.weeklyCents / 100).toLocaleString()}</h2></div><span className={habit.purchaseDone ? "status success" : "status"}>{habit.purchaseDone ? "Complete" : "Ready"}</span></div>
          <p>{habit.purchaseDone ? "The practice is the win—not what prices did today." : "Add your weekly amount, choose one illustrative asset, and see a simulated fractional purchase."}</p>
          <div className="habit-progress" aria-label={`${Math.min(3, Number(habit.weeklyAdded) + Number(habit.purchaseDone) + 1)} of 3 habit steps`}>
            {["Plan", "Add", "Practice"].map((label, index) => <span key={label} className={index === 0 || (index === 1 && habit.weeklyAdded) || (index === 2 && habit.purchaseDone) ? "done" : ""}><i>{index === 0 || (index === 1 && habit.weeklyAdded) || (index === 2 && habit.purchaseDone) ? <Check size={13} /> : index + 1}</i>{label}</span>)}
          </div>
          <button className="button primary wide" type="button" onClick={() => onNavigate("practice")}>{habit.purchaseDone ? "Review my practice portfolio" : "Take this week’s step"}<ArrowRight size={17} aria-hidden="true" /></button>
        </article>
        <article className="panel streak-card">
          <span className="streak-icon"><Leaf size={24} aria-hidden="true" /></span>
          <span className="section-kicker">Consistency, not perfection</span>
          <strong>{habit.streak}<small>-week</small></strong>
          <h2>learning streak</h2>
          <p>Small actions are beginning to form a system.</p>
          <div className="week-dots" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <i className={index < Math.min(7, habit.streak) ? "filled" : ""} key={index} />)}</div>
        </article>
      </section>
      <BriefCard brief={brief} loading={briefLoading} />
      <article className="learn-invite">
        <span className="learn-invite-icon"><BookOpen size={24} aria-hidden="true" /></span>
        <div><span className="section-kicker">Learn one thing</span><h2>Why does time matter so much?</h2><p>Ask the Morrow guide for a plain-language explanation grounded in your selected experience level.</p></div>
        <button className="button secondary" type="button" onClick={() => onNavigate("learn")}>Ask Morrow <ArrowRight size={17} aria-hidden="true" /></button>
      </article>
    </div>
  );
}

function PlanView({ data, setData, projection }: { data: AppData; setData: (data: AppData) => void; projection: Projection }) {
  const scenarios = calculateProjectionScenarios({
    currentAge: data.plan.currentAge,
    targetAge: data.plan.targetAge,
    startingBalanceCents: data.plan.startingCents,
    weeklyContributionCents: data.plan.weeklyCents,
    annualInflationBps: data.plan.inflationBps,
  }).map(({ definition, projection: scenario }) => ({
    rate: definition.annualReturnBps,
    projection: projectionForUi(scenario),
  }));
  return (
    <div className="view-stack">
      <div className="page-intro"><div><span className="section-kicker">My horizon</span><h1>Change the inputs. Keep the hope.</h1><p>Explore possibilities one assumption at a time. Nothing here predicts a result.</p></div><span className="private-pill"><Lock size={15} aria-hidden="true" /> Saved only on this device</span></div>
      <section className="plan-layout">
        <article className="panel plan-controls">
          <div className="panel-heading"><div><span className="section-kicker">Plan inputs</span><h2>Your editable sketch</h2></div><SlidersHorizontal size={20} aria-hidden="true" /></div>
          <div className="field-grid">
            <NumberField integer label="Current age" value={data.plan.currentAge} min={18} max={90} suffix="years" testId="plan-edit-current-age" onChange={(currentAge) => setData({ ...data, plan: { ...data.plan, currentAge, targetAge: Math.max(currentAge + 1, data.plan.targetAge) } })} />
            <NumberField integer label="Target age" value={data.plan.targetAge} min={data.plan.currentAge + 1} max={100} suffix="years" testId="plan-edit-target-age" onChange={(targetAge) => setData({ ...data, plan: { ...data.plan, targetAge } })} />
            <NumberField label="Starting amount" value={data.plan.startingCents / 100} min={0} max={10000000} prefix="$" testId="plan-edit-starting" onChange={(value) => setData({ ...data, plan: { ...data.plan, startingCents: Math.round(value * 100) } })} />
            <NumberField label="Every week" value={data.plan.weeklyCents / 100} min={0} max={100000} prefix="$" testId="plan-edit-weekly" onChange={(value) => setData({ ...data, plan: { ...data.plan, weeklyCents: Math.round(value * 100) } })} />
            <NumberField label="Illustrative return" value={data.plan.returnBps / 100} min={0} max={15} suffix="%" testId="plan-edit-return" onChange={(value) => setData({ ...data, plan: { ...data.plan, returnBps: Math.round(value * 100) } })} />
            <NumberField label="Illustrative inflation" value={data.plan.inflationBps / 100} min={0} max={15} suffix="%" testId="plan-edit-inflation" onChange={(value) => setData({ ...data, plan: { ...data.plan, inflationBps: Math.round(value * 100) } })} />
          </div>
          <div className="assumption-note"><Info size={17} aria-hidden="true" /><span><strong>Steady-rate simplification</strong>Real markets rise and fall. This learning model applies one constant rate and excludes taxes, fees, and account rules.</span></div>
        </article>
        <article className="plan-result">
          <span className="section-kicker">Selected illustration</span>
          <span className="result-rate">{data.plan.returnBps / 100}% <small>each year</small></span>
          <strong>{formatMoney(projection.futureCents, true)}</strong>
          <p>nominal value at age {data.plan.targetAge}</p>
          <dl>
            <div><dt>Contributed</dt><dd>{formatMoney(projection.totalContributionsCents)}</dd></div>
            <div><dt>Illustrative growth</dt><dd>{formatMoney(projection.growthCents)}</dd></div>
            <div><dt>Today’s dollars</dt><dd>{formatMoney(projection.realCents)}</dd></div>
          </dl>
          <span className="result-disclaimer">Illustrative only · not promised or expected</span>
        </article>
      </section>
      <section aria-labelledby="scenario-title">
        <div className="section-heading"><div><span className="section-kicker">Perspective, not prediction</span><h2 id="scenario-title">Compare three rates</h2></div><p>Use the range to see how sensitive a long-term result is to a single assumption.</p></div>
        <div className="scenario-grid">
          {scenarios.map(({ rate, projection: item }) => (
            <button key={rate} data-testid={`scenario-${rate}`} className={data.plan.returnBps === rate ? "scenario-card selected" : "scenario-card"} type="button" onClick={() => setData({ ...data, plan: { ...data.plan, returnBps: rate } })} aria-pressed={data.plan.returnBps === rate}>
              <span>{rate === 300 ? "Lower" : rate === 600 ? "Middle" : "Higher"} illustration</span><strong>{rate / 100}%</strong><b>{formatMoney(item.futureCents, true)}</b><small>{formatMoney(item.realCents, true)} in today’s dollars</small><i>Not a forecast</i>
            </button>
          ))}
        </div>
      </section>
      <article className="panel literacy-note"><span className="literacy-icon"><Lightbulb size={22} /></span><div><span className="section-kicker">The important lesson</span><h2>Your weekly amount is controllable. The return is not.</h2><p>That is why Morrowward puts the habit beside the outcome and labels every rate as illustrative.</p></div></article>
    </div>
  );
}

function PracticeView({ data, setData }: { data: AppData; setData: (data: AppData) => void }) {
  const [selected, setSelected] = useState<PracticeAssetSymbol>("VTI");
  const [buyCents, setBuyCents] = useState(Math.max(100, Math.min(data.plan.weeklyCents, data.practice.cashCents)));
  const [message, setMessage] = useState("");
  const [quotes, setQuotes] = useState<EducationalQuoteMap>(DEMO_QUOTES);
  const [marketQuotes, setMarketQuotes] =
    useState<MarketQuoteMap>(DEMO_MARKET_QUOTES);
  const [refreshStatus, setRefreshStatus] =
    useState<PracticeRefreshStatus>("loading");
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [marketProviderConfigured, setMarketProviderConfigured] = useState(false);
  const [lastMarketUpdatedAt, setLastMarketUpdatedAt] = useState<string | null>(null);
  const selectedAsset = ASSETS.find((asset) => asset.symbol === selected) ?? ASSETS[0];
  const selectedQuote = quotes[selected] ?? DEMO_QUOTES[selected]!;
  const practiceMarketAssets = useMemo(
    () => marketQuotesToPracticeAssets(marketQuotes),
    [marketQuotes],
  );
  const habit = practiceStatus(data);
  const valuation = valuePracticePortfolio(data.practice, quotes);
  const holdingsValue = valuation.investedValueCents;

  const refreshPrices = useCallback(async ({
    signal,
    recheckAttempt = 0,
  }: {
    signal?: AbortSignal;
    recheckAttempt?: number;
  } = {}): Promise<boolean> => {
    const isRecheck = recheckAttempt > 0;
    if (!isRecheck) {
      setRefreshStatus("loading");
      setRefreshError(null);
    }
    try {
      const endpoint = isRecheck
        ? `/api/v1/quotes?observe=1&recheck=${recheckAttempt}`
        : "/api/v1/quotes";
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("Quotes unavailable");
      const payload: unknown = await response.json();
      const parsed = QuotesResponseSchema.safeParse(payload);
      const market = quotesResponseToMarketQuotes(payload);
      const valuationQuotes = quotesResponseToMap(payload);
      if (!parsed.success || !market || !valuationQuotes) {
        throw new Error("Quotes invalid");
      }
      if (signal?.aborted) return false;
      setMarketQuotes((current) => {
        const next = { ...DEMO_MARKET_QUOTES, ...market };
        for (const symbol of Object.keys(next) as PracticeAssetSymbol[]) {
          const previous = current[symbol];
          const incoming = next[symbol];
          if (
            previous?.history &&
            incoming &&
            !incoming.history &&
            previous.mode === incoming.mode &&
            previous.source.kind === incoming.source.kind
          ) {
            next[symbol] = { ...incoming, history: previous.history };
          }
        }
        return next;
      });
      setQuotes({ ...DEMO_QUOTES, ...valuationQuotes });
      setMarketProviderConfigured(parsed.data.provider.configured);
      setLastMarketUpdatedAt(parsed.data.provider.lastSuccessfulUpdate);
      setRefreshStatus("success");
      return shouldRecheckDailyMarketSnapshot(parsed.data.provider);
    } catch {
      if (signal?.aborted) return false;
      if (isRecheck) return false;
      setRefreshError(
        "You can keep practicing while prices reconnect automatically.",
      );
      setRefreshStatus("error");
      return false;
    }
  }, []);

  const loadOneYearHistory = useCallback(async (rawSymbol: string) => {
    const asset = ASSETS.find((candidate) => candidate.symbol === rawSymbol);
    if (!asset) throw new Error("Unknown practice asset");
    const response = await fetch(
      `/api/v1/quotes?symbols=${encodeURIComponent(asset.symbol)}&history=1y`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
    if (!response.ok) throw new Error("History unavailable");
    const payload: unknown = await response.json();
    const market = quotesResponseToMarketQuotes(payload);
    const valuationQuotes = quotesResponseToMap(payload);
    const quote = market?.[asset.symbol];
    if (!quote?.history || !valuationQuotes) {
      throw new Error("History invalid");
    }
    setMarketQuotes((current) => ({ ...current, [asset.symbol]: quote }));
    setQuotes((current) => ({ ...current, ...valuationQuotes }));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timers = new Set<number>();
    const wait = (delayMs: number) =>
      new Promise<boolean>((resolve) => {
        const timer = window.setTimeout(() => {
          timers.delete(timer);
          resolve(!controller.signal.aborted);
        }, delayMs);
        timers.add(timer);
      });

    void (async () => {
      let shouldRecheck = await refreshPrices({ signal: controller.signal });
      const recheckDelays = [8_000, 20_000] as const;
      for (const [index, delayMs] of recheckDelays.entries()) {
        if (!shouldRecheck || !(await wait(delayMs))) return;
        shouldRecheck = await refreshPrices({
          signal: controller.signal,
          recheckAttempt: index + 1,
        });
      }
    })();

    return () => {
      controller.abort();
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [refreshPrices]);

  useEffect(() => {
    if (!marketProviderConfigured || lastMarketUpdatedAt) return;
    let observing = false;
    const observeSavedSnapshot = () => {
      if (observing) return;
      observing = true;
      void refreshPrices({ recheckAttempt: 3 }).finally(() => {
        observing = false;
      });
    };
    const observeWhenVisible = () => {
      if (document.visibilityState === "visible") observeSavedSnapshot();
    };
    window.addEventListener("focus", observeSavedSnapshot);
    document.addEventListener("visibilitychange", observeWhenVisible);
    return () => {
      window.removeEventListener("focus", observeSavedSnapshot);
      document.removeEventListener("visibilitychange", observeWhenVisible);
    };
  }, [lastMarketUpdatedAt, marketProviderConfigured, refreshPrices]);

  const deposit = () => {
    if (habit.weeklyAdded) return;
    if (data.plan.weeklyCents < 1) {
      setMessage("Set a weekly amount above $0 before adding practice cash.");
      return;
    }
    const now = new Date().toISOString();
    try {
      const practice = depositWeeklyContribution(
        data.practice,
        data.plan.weeklyCents,
        { occurredAt: now, transactionId: `deposit-${now}` },
      );
      setData({ ...data, practice });
      setBuyCents(data.plan.weeklyCents);
      setMessage("Practice cash added. No money moved in the real world.");
    } catch {
      setMessage("Practice cash could not be added. Your saved data was not changed.");
    }
  };

  const buy = () => {
    const amount = Math.round(clamp(buyCents, 100, data.practice.cashCents));
    if (!habit.weeklyAdded) {
      setMessage("Add this week’s practice amount first.");
      return;
    }
    if (data.practice.cashCents < 100 || amount > data.practice.cashCents) {
      setMessage("Choose an amount within your simulated cash balance.");
      return;
    }
    const now = new Date().toISOString();
    try {
      const result = buySimulatedAsset(data.practice, {
        symbol: selected,
        amountCents: amount,
        priceCents: selectedQuote.priceCents,
        occurredAt: now,
        transactionId: `buy-${now}`,
      });
      setData({
        ...data,
        practice: result.portfolio,
        habitLog: recordCompletedWeek(data.habitLog, now),
      });
      setMessage(`Simulated ${formatMoney(result.transaction.spentCents)} purchase complete. You practiced—nothing was traded.`);
    } catch {
      setMessage("That simulated purchase could not be completed. Try a different amount.");
    }
  };

  return (
    <div className="view-stack">
      <div className="page-intro"><div><span className="section-kicker">Practice mode</span><h1>Learn the motion before risking money.</h1><p>Cash, holdings, purchases, and results are simulated. Price inputs are labeled with their source and freshness so you can see exactly what each practice value represents.</p></div><span className="simulation-badge"><FlaskConical size={16} /> 100% simulation</span></div>
      <section className="practice-summary">
        <article><span><WalletCards size={19} /> Simulated cash</span><strong>{formatMoney(data.practice.cashCents)}</strong><small>available to practice</small></article>
        <article><span><LineChart size={19} /> Practice holdings</span><strong>{formatMoney(Math.round(holdingsValue))}</strong><small>using labeled educational prices</small></article>
        <article><span><Leaf size={19} /> Learning streak</span><strong>{habit.streak} weeks</strong><small>consistency over outcomes</small></article>
      </section>
      <nav className="practice-jump-nav" aria-label="Practice page shortcuts">
        <a href="#practice-assets"><LineChart size={16} aria-hidden="true" /><span><strong>Explore assets</strong><small>Learn what each one is</small></span></a>
        <a href="#practice-weekly"><Leaf size={16} aria-hidden="true" /><span><strong>Practice this week</strong><small>Add cash and simulate</small></span></a>
        <a href="#practice-journey"><TrendingUp size={16} aria-hidden="true" /><span><strong>Open Market Journey</strong><small>See risk and time together</small></span></a>
      </nav>
      <div className="scroll-anchor" id="practice-assets">
        <PracticeMarketPanel
          assets={practiceMarketAssets}
          selectedSymbol={selected}
          onSelect={(symbol) => {
            const asset = ASSETS.find((candidate) => candidate.symbol === symbol);
            if (asset) setSelected(asset.symbol);
          }}
          onRequestHistory={loadOneYearHistory}
          refreshStatus={refreshStatus}
          refreshError={refreshError}
          lastUpdatedAt={lastMarketUpdatedAt}
          providerConfigured={marketProviderConfigured}
          title="Explore eleven practice assets"
          description="Compare broad funds, public companies, and crypto assets. The daily snapshot loads automatically, and every value keeps its freshness and provenance. Inclusion is not endorsement."
        />
      </div>
      <section className="practice-layout">
        <article className="panel habit-flow scroll-anchor" id="practice-weekly">
          <div className="panel-heading"><div><span className="section-kicker">This week’s habit</span><h2>Three small moves</h2></div><span className="step-count">{habit.purchaseDone ? "3" : habit.weeklyAdded ? "2" : "1"} / 3</span></div>
          <ol className="flow-steps">
            <li className="complete"><span><Check size={16} /></span><div><strong>Choose the weekly amount</strong><small>{formatMoney(data.plan.weeklyCents)} comes from your plan</small></div></li>
            <li className={habit.weeklyAdded ? "complete" : "active"}><span>{habit.weeklyAdded ? <Check size={16} /> : "2"}</span><div><strong>Add simulated cash</strong><small>No bank. No transfer. Just practice.</small></div><button className="button secondary small" data-testid="practice-deposit" type="button" onClick={deposit} disabled={habit.weeklyAdded || data.plan.weeklyCents < 1}>{habit.weeklyAdded ? "Added" : `Add ${formatMoney(data.plan.weeklyCents)}`}</button></li>
            <li className={habit.purchaseDone ? "complete" : habit.weeklyAdded ? "active" : ""}><span>{habit.purchaseDone ? <Check size={16} /> : "3"}</span><div><strong>Make a simulated purchase</strong><small>Fractional units make small amounts visible.</small></div></li>
          </ol>
          <div className="purchase-box">
            <div className="purchase-asset"><span className="asset-symbol">{selectedAsset.symbol}</span><div><strong>{selectedAsset.name}</strong><small>{selectedAsset.kind} · illustrative price {formatMoney(selectedQuote.priceCents)}</small></div></div>
            <NumberField label="Simulated amount" value={buyCents / 100} min={1} max={Math.max(1, data.practice.cashCents / 100)} prefix="$" testId="practice-buy-amount" onChange={(value) => setBuyCents(Math.round(value * 100))} />
            <div className="fraction-preview"><span>Fractional units</span><strong>{formatAssetMicroUnits(multiplyDivideFloor(Math.max(0, buyCents), MICRO_UNITS_PER_ASSET, selectedQuote.priceCents), selectedAsset.kind === "Crypto" ? 6 : 4)}</strong></div>
            <button className="button primary wide" data-testid="practice-buy" type="button" onClick={buy} disabled={!habit.weeklyAdded || data.practice.cashCents < 100}>Simulate purchase <ArrowRight size={17} /></button>
            <p className="action-message" role="status" aria-live="polite">{message}</p>
          </div>
        </article>
        <aside className="panel holdings-panel">
          <div className="panel-heading"><div><span className="section-kicker">My practice portfolio</span><h2>Holdings</h2></div><FlaskConical size={20} /></div>
          {Object.values(data.practice.holdingsMicro).some((amount) => amount > 0) ? (
            <div className="holding-list">{ASSETS.filter((asset) => data.practice.holdingsMicro[asset.symbol] > 0).map((asset) => { const holding = valuation.holdings.find((item) => item.symbol === asset.symbol); return <div key={asset.symbol}><span className="asset-symbol mini">{asset.symbol}</span><div><strong>{asset.name}</strong><small>{formatAssetMicroUnits(data.practice.holdingsMicro[asset.symbol], asset.kind === "Crypto" ? 6 : 4)} units</small></div><b>{formatMoney(holding?.valueCents ?? 0)}</b></div>; })}</div>
          ) : (
            <div className="empty-holdings"><span><Leaf size={25} /></span><h3>Your first practice position will appear here.</h3><p>No pressure. The goal is to understand the steps.</p></div>
          )}
          <div className="price-note"><Clock size={15} aria-hidden="true" /><span><strong>Portfolio valuation</strong>Uses the labeled prices above only inside Practice mode.</span></div>
        </aside>
      </section>
      <div className="scroll-anchor" id="practice-journey">
        <MarketJourney
          startingBalanceCents={data.plan.startingCents}
          practicePortfolioBalanceCents={valuation.totalValueCents}
          weeklyContributionCents={data.plan.weeklyCents}
          initialReturnBps={data.plan.returnBps}
          experienceLevel={data.experience}
        />
      </div>
      {data.practice.transactions.length > 0 && <section className="panel activity-panel"><div className="panel-heading"><div><span className="section-kicker">Practice receipt</span><h2>Recent activity</h2></div><ShieldCheck size={20} /></div><div className="activity-list">{[...data.practice.transactions].reverse().slice(0, 5).map((item) => <div key={item.id}><span className={item.type === "deposit" ? "activity-icon deposit" : "activity-icon"}>{item.type === "deposit" ? <Plus size={16} /> : <FlaskConical size={16} />}</span><div><strong>{item.type === "deposit" ? "Weekly practice deposit" : `${item.symbol} simulated purchase`}</strong><small>{new Date(item.occurredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</small></div><b>{item.type === "deposit" ? "+" : "−"}{formatMoney(item.type === "deposit" ? item.amountCents : item.spentCents)}</b></div>)}</div></section>}
    </div>
  );
}

function LearnView({ data }: { data: AppData }) {
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState<EducatorReply | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPathId, setSelectedPathId] =
    useState<EducationPathId>("start-here");
  const [selectedTopic, setSelectedTopic] =
    useState<EducationTopic>("general");
  const [replyTopic, setReplyTopic] =
    useState<EducationTopic>("general");
  const responseRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const selectedPath = educationPath(selectedPathId);
  const prompts = educationPrompts(selectedPathId, data.experience);
  const resources = educationResources(selectedPathId);
  const followUps = reply
    ? relatedEducationPrompts(replyTopic, data.experience, question)
    : [];

  const choosePrompt = (prompt: EducationPrompt) => {
    setQuestion(prompt.question);
    setSelectedTopic(prompt.topic);
    window.setTimeout(() => questionRef.current?.focus(), 50);
  };

  const ask = async (event?: FormEvent) => {
    event?.preventDefault();
    const clean = question.trim().slice(0, 600);
    if (!clean || loading) return;
    const resolvedTopic =
      selectedTopic === "general"
        ? inferEducationTopic(clean)
        : selectedTopic;
    setLoading(true);
    try {
      const response = await fetch("/api/v1/education/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: clean,
          experienceLevel: data.experience,
          topic: resolvedTopic,
          context: {
            yearsRemaining: data.plan.targetAge - data.plan.currentAge,
            weeklyContributionCents: data.plan.weeklyCents,
            illustrativeReturnBps: data.plan.returnBps,
            illustrativeInflationBps: data.plan.inflationBps,
          },
        }),
      });
      if (!response.ok) throw new Error("Educator unavailable");
      setReply(parseEducatorReply(await response.json(), clean));
      setReplyTopic(resolvedTopic);
    } catch {
      setReply(fallbackEducator(clean));
      setReplyTopic(resolvedTopic);
    } finally {
      setLoading(false);
      window.setTimeout(() => responseRef.current?.focus(), 50);
    }
  };

  return (
    <div className="view-stack">
      <div className="page-intro"><div><span className="section-kicker">Education center</span><h1>Understanding is a form of freedom.</h1><p>Start with one honest question. Build from there.</p></div></div>
      <section className="learning-path-section" aria-labelledby="learning-path-title">
        <div className="section-heading">
          <div>
            <span className="section-kicker">Choose a learning path</span>
            <h2 id="learning-path-title">One idea at a time. No gatekeeping.</h2>
          </div>
          <p>Your experience level changes the questions and depth—not the safety boundaries.</p>
        </div>
        <div className="learning-path-grid" role="group" aria-label="Education learning paths">
          {EDUCATION_PATHS.map((path) => {
            const Icon = EDUCATION_PATH_ICONS[path.id];
            const selected = path.id === selectedPathId;
            return (
              <button
                aria-pressed={selected}
                className={selected ? "learning-path-card selected" : "learning-path-card"}
                data-testid={`education-path-${path.id}`}
                key={path.id}
                onClick={() => setSelectedPathId(path.id)}
                type="button"
              >
                <span className="learning-path-icon"><Icon size={20} aria-hidden="true" /></span>
                <span className="section-kicker">{path.eyebrow}</span>
                <strong>{path.title}</strong>
                <small>{path.description}</small>
                <span className="learning-path-action">{selected ? "Exploring now" : "Explore path"} <ArrowRight size={14} aria-hidden="true" /></span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="educator-panel" aria-labelledby="educator-title" aria-busy={loading}>
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{loading ? "Morrow is preparing an explanation." : reply ? "Morrow’s explanation is ready." : ""}</p>
        <div className="educator-intro">
          <span className="morrow-avatar"><Sparkles size={24} aria-hidden="true" /></span>
          <div><span className="section-kicker">Ask Morrow · {selectedPath.title} · GPT-5.6 when available</span><h2 id="educator-title">What would you like to understand?</h2><p>I explain concepts and assumptions at your selected level. I do not tell you what to buy, sell, or do with your money.</p></div>
        </div>
        <div className="guided-prompt-grid" role="group" aria-label={`${selectedPath.title} suggested questions`}>
          {prompts.map((prompt, index) => (
            <button
              data-testid={`educator-chip-${index}`}
              key={prompt.id}
              onClick={() => choosePrompt(prompt)}
              type="button"
            >
              <span>{prompt.question}</span>
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          ))}
        </div>
        <form className="question-form" onSubmit={ask}>
          <label htmlFor="educator-question">Your question</label>
          <div><textarea data-testid="educator-question" id="educator-question" ref={questionRef} value={question} maxLength={600} onChange={(event) => { setQuestion(event.target.value); setSelectedTopic(inferEducationTopic(event.target.value)); }} placeholder="Try: Why does the 6% scenario grow faster over time?" rows={3} /><button className="button primary" data-testid="educator-submit" type="submit" disabled={!question.trim() || loading}>{loading ? <RefreshCw className="spin" size={18} aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}<span>{loading ? "Explaining…" : "Explain it"}</span></button></div><small>{question.length}/600 · Please don’t share account numbers or private information. When GPT is configured, this question and four bounded illustration values pass through Morrowward’s server to OpenAI.</small>
        </form>
        {reply && (
          <div className="educator-response" ref={responseRef} tabIndex={-1} role="region" aria-labelledby="morrow-response-title">
            <div className="response-label"><Sparkles size={15} aria-hidden="true" /> Morrow’s explanation <span>{reply.meta.mode === "ai" ? <><Sparkles size={12} aria-hidden="true" /> {reply.meta.model?.toUpperCase() ?? "AI"} generated</> : reply.meta.mode === "guardrail" ? <><ShieldCheck size={12} aria-hidden="true" /> Safety-guided response</> : <><Database size={12} aria-hidden="true" /> Deterministic fallback</>}</span></div>
            <h3 id="morrow-response-title">{reply.title}</h3>
            <p>{reply.answer}</p>
            {reply.keyPoints.length > 0 && <div className="key-point-list"><strong>Key ideas</strong><ul>{reply.keyPoints.map((item) => <li key={item}>{item}</li>)}</ul></div>}
            {reply.assumptions.length > 0 && <div className="assumption-list"><strong>Assumptions to notice</strong><ul>{reply.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></div>}
            <div className="next-step"><ArrowRight size={17} aria-hidden="true" /><span><strong>Try next</strong>{reply.nextStep}</span></div>
            {followUps.length > 0 && (
              <div className="follow-up-prompts" role="group" aria-label="Related questions">
                <strong>Keep learning</strong>
                <div>
                  {followUps.map((prompt) => (
                    <button
                      data-testid={`educator-follow-up-${prompt.id}`}
                      key={prompt.id}
                      onClick={() => choosePrompt(prompt)}
                      type="button"
                    >
                      {prompt.question}<ChevronRight size={13} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <small>{reply.disclosure}</small>
          </div>
        )}
      </section>
      <section aria-labelledby="library-title">
        <div className="section-heading"><div><span className="section-kicker">Learning library · {selectedPath.title}</span><h2 id="library-title">Build your financial vocabulary</h2></div><p>Canonical resources lead each topic. Grokipedia links are clearly labeled supplemental reading.</p></div>
        <div className="topic-grid">
          {resources.map((resource) => {
            const Icon = EDUCATION_ICONS[resource.icon];
            return (
              <article className="topic-card" key={resource.id}>
                <span className="topic-icon"><Icon size={22} aria-hidden="true" /></span>
                <span className="section-kicker">{resource.kicker}</span>
                <h3>{resource.title}</h3>
                <p>{resource.description}</p>
                <div className="resource-links">
                  {resource.links.map((link) => (
                    <a href={link.href} key={`${resource.id}-${link.href}`} target="_blank" rel="noreferrer">
                      <span className={`resource-tier ${link.tier}`}>{resourceTierLabel(link.tier)}</span>
                      <span>{link.label} · {link.source}<ExternalLink size={13} aria-hidden="true" /></span>
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function MissionView({
  greetingId,
  onNavigate,
}: {
  greetingId: string;
  onNavigate: (view: View) => void;
}) {
  return (
    <div className="view-stack mission-view">
      <section className="mission-hero" aria-labelledby="mission-title">
        <div className="mission-copy">
          <div className="eyebrow"><Heart size={16} aria-hidden="true" /> Why Morrowward exists</div>
          <h1 id="mission-title">Hope gets stronger when the future becomes visible.</h1>
          <p className="mission-lead">This project began with a ten-year-old, a paper route, and a first glimpse of what small, steady effort could unlock.</p>
          <blockquote><Quote size={24} aria-hidden="true" /><p>“I want Morrowward to give someone the feeling I had at that keyboard: my future can be different, and I can begin today.”</p><cite>— Dave, creator of Morrowward</cite></blockquote>
        </div>
        <figure className="mission-photo">
          <div className="photo-frame">
            <Image src="/dave-age-10-commodore-64.jpg" alt="Dave at age 10 sitting beside his Commodore 64" width={447} height={447} priority />
            <span aria-hidden="true" className="photo-label" data-testid="mission-photo-label">Dave</span>
          </div>
          <figcaption>Age 10 · A Commodore 64 bought with paper-route savings</figcaption>
        </figure>
      </section>
      <section className="story-panel">
        <article><span>01</span><h2>A reason to plan</h2><p>I was diagnosed with Type 1 diabetes at age ten. It made the future feel real early—and taught me that caring for tomorrow starts with what we do today.</p></article>
        <article><span>02</span><h2>A first tool</h2><p>I saved money from a paper route to buy this Commodore 64. Writing BASIC showed me that patient learning could turn imagination into something real.</p></article>
        <article><span>03</span><h2>A twenty-year lesson</h2><p>Small daily habits in technology, health, and work compounded over decades. They gave me hope, changed my life, and created opportunities I could not see at age ten.</p></article>
      </section>
      <section className="mission-statement">
        <span className="mission-symbol"><Leaf size={28} aria-hidden="true" /></span>
        <div><span className="section-kicker">The mission</span><h2>Make long-term financial thinking feel possible—not exclusive.</h2><p>Morrowward is for the person starting with ten dollars, one question, or no investing experience at all. Financial literacy should not be a gate. It should be a light.</p></div>
      </section>
      <HistoricalGreetingReplayCard
        greetingId={greetingId}
        onPractice={() => onNavigate("practice")}
        onExplore={() => onNavigate("today")}
      />
      <section aria-labelledby="values-title">
        <div className="section-heading"><div><span className="section-kicker">What guides us</span><h2 id="values-title">Built around human agency</h2></div></div>
        <div className="values-grid">
          <article><span><Sparkles size={21} aria-hidden="true" /></span><h3>Hope without hype</h3><p>Show possibilities while naming uncertainty honestly.</p></article>
          <article><span><BookOpen size={21} aria-hidden="true" /></span><h3>Learning before action</h3><p>Explain concepts without pretending to know what someone should do.</p></article>
          <article><span><ShieldCheck size={21} aria-hidden="true" /></span><h3>Privacy by default</h3><p>No account required. The full saved plan and holdings stay on this device; educator requests use only bounded illustration context.</p></article>
          <article><span><Leaf size={21} aria-hidden="true" /></span><h3>Consistency over perfection</h3><p>Celebrate the repeatable habit, not a lucky market outcome.</p></article>
        </div>
      </section>
      <section className="roadmap-panel" aria-labelledby="companion-title" data-testid="companion-panel">
        <div className="roadmap-panel-copy">
          <div>
            <span className="section-kicker">Beyond the browser</span>
            <h2 id="companion-title">Take Morrowward with you.</h2>
          </div>
          <p>iPhone and Mac companion builds are next. Their source links will activate as soon as the local projects are ready; Dave’s work is already one click away.</p>
        </div>
        <ul>
          <li>
            <article className="roadmap-source-card" data-state="pending" data-testid="mission-source-iphone">
              <span className="roadmap-source-icon"><Smartphone size={22} aria-hidden="true" /></span>
              <div className="roadmap-source-copy">
                <span className="roadmap-source-platform">iPhone source</span>
                <h3>Morrowward for iPhone</h3>
                <p>A lightweight Apple companion for the same local-first Morrowward experience.</p>
              </div>
              <span className="roadmap-source-status">Source link coming after the build</span>
            </article>
          </li>
          <li>
            <article className="roadmap-source-card" data-state="pending" data-testid="mission-source-mac">
              <span className="roadmap-source-icon"><Monitor size={22} aria-hidden="true" /></span>
              <div className="roadmap-source-copy">
                <span className="roadmap-source-platform">Mac source</span>
                <h3>Morrowward for Mac</h3>
                <p>A focused desktop companion backed by the same stable Morrowward web app.</p>
              </div>
              <span className="roadmap-source-status">Source link coming after the build</span>
            </article>
          </li>
          <li>
            <a
              className="roadmap-source-card"
              data-state="active"
              data-testid="mission-follow-dave"
              href="https://thedavedev.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="roadmap-source-icon"><Globe2 size={22} aria-hidden="true" /></span>
              <div className="roadmap-source-copy">
                <span className="roadmap-source-platform">TheDaveDev.com</span>
                <h3>Follow Dave online</h3>
                <p>Field notes, projects, and practical experiments in real-world AI.</p>
              </div>
              <span className="roadmap-source-cta">Visit Dave’s site <ExternalLink size={15} aria-hidden="true" /></span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}

function SettingsView({
  data,
  setData,
  persistence,
  persistNow,
  onResetGreeting,
}: {
  data: AppData;
  setData: (data: AppData) => void;
  persistence: PersistenceStatus;
  persistNow: PersistNow<AppData>;
  onResetGreeting: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  const download = () => {
    const now = new Date().toISOString();
    const blob = new Blob(
      [serializeStateExport(appDataToState(data, now), now)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "morrowward-backup.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Backup exported. Keep it somewhere private.");
  };

  const importData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT_BYTES) {
        setMessage("That backup is larger than the 1 MB safety limit. Nothing changed.");
        return;
      }
      const nextData = stateToAppData(parseStateExport(await file.text()));
      await persistNow(nextData);
      setMessage(persistence.mode === "indexeddb" ? "Backup restored on this device." : "Backup restored for this session; persistent browser storage is unavailable.");
    } catch {
      setMessage("That file is not a valid Morrowward backup. Nothing changed.");
    } finally {
      event.target.value = "";
    }
  };

  const reset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setMessage("Press reset again to erase this device’s Morrowward data.");
      return;
    }
    try {
      await persistNow(stateToAppData(createDefaultState()));
      onResetGreeting();
      setMessage(persistence.mode === "indexeddb" ? "Local Morrowward data reset." : "Morrowward reset for this session; persistent browser storage is unavailable.");
    } catch {
      setMessage("Morrowward could not reset local storage. Nothing changed.");
    }
    setConfirmReset(false);
  };

  return (
    <div className="view-stack settings-view">
      <div className="page-intro"><div><span className="section-kicker">Settings & privacy</span><h1>Your plan belongs to you.</h1><p>Change your experience, preserve a backup, or start fresh.</p></div></div>
      <section className="settings-grid">
        <article className="panel setting-card"><div className="setting-icon"><Sun size={21} aria-hidden="true" /></div><div><span className="section-kicker">Appearance</span><h2>Choose a theme</h2><p>The math stays the same. Choose the atmosphere that helps you return.</p><ThemePicker theme={data.theme} onChange={(theme) => setData({ ...data, theme })} /></div></article>
        <article className="panel setting-card"><div className="setting-icon"><UserRound size={21} aria-hidden="true" /></div><div><span className="section-kicker">Experience</span><h2>Set the level of detail</h2><p>This changes explanations and dashboard context—not calculation results.</p><div className="segmented" role="group" aria-label="Experience detail level">{(["new", "familiar", "advanced"] as Experience[]).map((level) => <button data-testid={`settings-experience-${level}`} key={level} type="button" className={data.experience === level ? "active" : ""} onClick={() => setData({ ...data, experience: level })} aria-pressed={data.experience === level}>{level === "new" ? "New" : level === "familiar" ? "Familiar" : "Advanced"}</button>)}</div></div></article>
        <article className="panel setting-card"><div className="setting-icon"><Database size={21} aria-hidden="true" /></div><div><span className="section-kicker">My data</span><h2>Export or restore</h2><p>Download a readable JSON backup. Importing replaces the current local plan after validation.</p><div className="button-row"><button className="button secondary" data-testid="settings-export" type="button" onClick={download}><Download size={17} aria-hidden="true" /> Export</button><button className="button secondary" data-testid="settings-import" type="button" onClick={() => fileRef.current?.click()} disabled={persistence.saving}><Upload size={17} aria-hidden="true" /> Import</button><input ref={fileRef} type="file" accept="application/json,.json" onChange={importData} hidden /></div></div></article>
        <article className="panel setting-card danger-card"><div className="setting-icon"><RefreshCw size={21} aria-hidden="true" /></div><div><span className="section-kicker">Fresh start</span><h2>Reset this device</h2><p>Erase the saved plan, practice portfolio, and preferences from this browser.</p><button className={confirmReset ? "button danger confirm" : "button danger"} data-testid="settings-reset" type="button" onClick={() => void reset()} disabled={persistence.saving}>{confirmReset ? "Confirm reset" : "Reset local data"}</button></div></article>
      </section>
      <p className="settings-message" role="status" aria-live="polite">{message}</p>
      <section className="privacy-panel">
        <span><Lock size={26} aria-hidden="true" /></span><div><span className="section-kicker">Privacy architecture</span><h2>Your full saved plan never leaves this browser.</h2><p>Morrowward does not require an account. Educator requests send only the question, experience level, years remaining, weekly contribution, and illustrative return/inflation through the server—never starting balances, holdings, or transaction history. OpenAI API content can be retained temporarily for abuse monitoring under its <a href="https://platform.openai.com/docs/models/default-usage-policies-by-endpoint" target="_blank" rel="noreferrer">data controls<span className="sr-only"> (opens in a new tab)</span></a>.</p></div><ul><li><Check size={15} aria-hidden="true" /> No brokerage credentials</li><li><Check size={15} aria-hidden="true" /> No ad tracking</li><li><Check size={15} aria-hidden="true" /> No real trades</li></ul>
      </section>
    </div>
  );
}

function AppFooter({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <footer className="app-footer">
      <div><Brand compact /><p>Small steps. A future you can see.</p></div>
      <p><strong>Important:</strong> Morrowward is an educational simulation, not financial, investment, tax, or legal advice. Illustrations are not guarantees or expected results. You are responsible for your decisions; consult a qualified professional when appropriate.</p>
      <nav aria-label="Footer navigation"><button type="button" onClick={() => onNavigate("mission")}>Our why</button><button type="button" onClick={() => onNavigate("learn")}>Education</button><button type="button" onClick={() => onNavigate("settings")}>Privacy & data</button></nav>
    </footer>
  );
}

function MobileNav({ active, onNavigate }: { active: View; onNavigate: (view: View) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Mobile primary navigation">
      {NAV_ITEMS.map((item) => { const Icon = item.icon; return <button data-testid={`mobile-nav-${item.id}`} key={item.id} type="button" className={active === item.id ? "active" : ""} onClick={() => onNavigate(item.id)} aria-current={active === item.id ? "page" : undefined}><Icon size={19} aria-hidden="true" /><span>{item.label}</span></button>; })}
    </nav>
  );
}

export function MorrowwardApp() {
  const [data, setData, hydrated, persistence, persistNow] = usePersistedState<AppData>(
    STORAGE_KEY,
    createDefaultData(),
    APP_DATA_ADAPTER,
  );
  const [active, setActive] = useState<View>("today");
  const [menuOpen, setMenuOpen] = useState(false);
  const [brief, setBrief] = useState<Brief>(FALLBACK_BRIEF);
  const [briefLoading, setBriefLoading] = useState(false);
  const [greetingOpen, setGreetingOpen] = useState(false);
  const [selectedGreetingId, setSelectedGreetingId] = useState(
    GREETING_ROSTER[0].id,
  );
  const greetingEligibilityCheckedRef = useRef(false);
  const mainRef = useRef<HTMLElement>(null);
  const projection = useMemo(() => calculateUiProjection(data.plan), [data.plan]);
  const activeLabel = active === "settings"
    ? "Settings"
    : NAV_ITEMS.find((item) => item.id === active)?.label ?? "Morrowward";

  const navigate = (view: View) => {
    setActive(view);
    setMenuOpen(false);
    const label = view === "settings" ? "Settings" : NAV_ITEMS.find((item) => item.id === view)?.label ?? "Morrowward";
    document.title = `${label} · Morrowward`;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
  };

  const rememberGreetingSeen = useCallback(() => {
    try {
      markGreetingWelcomeSeen(window.localStorage, selectedGreetingId);
    } catch {
      // The in-memory guard still prevents a repeat during this session.
    }
  }, [selectedGreetingId]);

  const dismissGreeting = useCallback(() => {
    rememberGreetingSeen();
    setGreetingOpen(false);
  }, [rememberGreetingSeen]);

  const resetGreeting = useCallback(() => {
    try {
      clearGreetingWelcomeState(window.localStorage);
    } catch {
      // IndexedDB reset still succeeds if localStorage is unavailable.
    }
    greetingEligibilityCheckedRef.current = false;
    setSelectedGreetingId(GREETING_ROSTER[0].id);
    setGreetingOpen(false);
  }, []);

  const loadBrief = useCallback(async () => {
    setBriefLoading(true);
    try {
      const response = await fetch("/api/v1/briefs/today", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Brief unavailable");
      setBrief(parseBrief(await response.json()));
    } catch {
      setBrief(FALLBACK_BRIEF);
    } finally {
      setBriefLoading(false);
    }
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    document.documentElement.style.colorScheme = data.theme === "dawn" ? "light" : "dark";
    let themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"][data-morrowward]');
    if (!themeMeta) {
      themeMeta = document.createElement("meta");
      themeMeta.name = "theme-color";
      themeMeta.dataset.morrowward = "true";
      document.head.append(themeMeta);
    }
    themeMeta.content = data.theme === "dawn"
      ? "#f4efe4"
      : data.theme === "alchemy"
        ? "#17131f"
        : data.theme === "space"
          ? "#050608"
          : "#081421";
    document.body.style.backgroundColor = themeMeta.content;
  }, [data.theme]);

  useEffect(() => {
    if (!hydrated || !data.onboarded) return;
    const timer = window.setTimeout(() => void loadBrief(), 0);
    return () => window.clearTimeout(timer);
  }, [hydrated, data.onboarded, loadBrief]);

  useEffect(() => {
    if (!hydrated) return;
    if (!data.onboarded) {
      greetingEligibilityCheckedRef.current = false;
      return;
    }
    if (greetingEligibilityCheckedRef.current) return;
    greetingEligibilityCheckedRef.current = true;

    let state = {
      greetingId: GREETING_ROSTER[0].id,
      seen: false,
    };
    try {
      const random = new Uint32Array(1);
      window.crypto.getRandomValues(random);
      state = getOrCreateGreetingWelcomeState(
        window.localStorage,
        random[0] / 2 ** 32,
      );
    } catch {
      // A bounded session-only welcome remains available without localStorage.
    }
    setSelectedGreetingId(state.greetingId);
    if (state.seen) return;

    const timer = window.setTimeout(() => setGreetingOpen(true), 700);
    return () => window.clearTimeout(timer);
  }, [hydrated, data.onboarded]);

  if (!hydrated) {
    return <div className="app-shell loading-shell" data-theme="horizon"><Brand /><span className="loading-pulse" /><p>Looking toward your horizon…</p></div>;
  }

  if (!data.onboarded) {
    return <div className="app-shell" data-theme={data.theme}><Onboarding data={data} setData={setData} /></div>;
  }

  return (
    <div className="app-shell" data-theme={data.theme}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <TopBar active={active} theme={data.theme} onNavigate={navigate} onTheme={(theme) => setData({ ...data, theme })} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      {persistence.mode === "memory" && (
        <div className="storage-warning" role="status">
          <Database size={16} aria-hidden="true" />
          <span>Persistent browser storage is unavailable. Changes last only for this session; export a backup before closing.</span>
        </div>
      )}
      <main ref={mainRef} className="app-main" id="main-content" tabIndex={-1} aria-label={`${activeLabel} view`}>
        {active === "today" && <TodayView data={data} projection={projection} brief={brief} briefLoading={briefLoading} onNavigate={navigate} />}
        {active === "plan" && <PlanView data={data} setData={setData} projection={projection} />}
        {active === "practice" && <PracticeView data={data} setData={setData} />}
        {active === "learn" && <LearnView data={data} />}
        {active === "mission" && <MissionView greetingId={selectedGreetingId} onNavigate={navigate} />}
        {active === "settings" && <SettingsView data={data} setData={setData} persistence={persistence} persistNow={persistNow} onResetGreeting={resetGreeting} />}
      </main>
      <AppFooter onNavigate={navigate} />
      <MobileNav active={active} onNavigate={navigate} />
      <HistoricalGreetingDialog
        open={greetingOpen}
        greeting={greetingById(selectedGreetingId)}
        onDismiss={dismissGreeting}
        onComplete={rememberGreetingSeen}
        onPractice={() => {
          rememberGreetingSeen();
          setGreetingOpen(false);
          navigate("practice");
        }}
        onExplore={() => {
          rememberGreetingSeen();
          setGreetingOpen(false);
          navigate("today");
        }}
      />
    </div>
  );
}
