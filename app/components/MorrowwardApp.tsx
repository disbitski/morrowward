"use client";

import Image from "next/image";
import {
  ArrowRight,
  Bitcoin,
  BookOpen,
  Building,
  Calendar,
  Check,
  ChevronRight,
  CircleAlert,
  Clock,
  Coins,
  Compass,
  Database,
  Download,
  ExternalLink,
  FlaskConical,
  Heart,
  Home,
  Info,
  Landmark,
  Leaf,
  Lightbulb,
  LineChart,
  Lock,
  Mail,
  Menu,
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
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  Upload,
  UserRound,
  WalletCards,
  X,
  Zap,
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
  EDUCATIONAL_QUOTES,
  MAX_IMPORT_BYTES,
  createDefaultState,
  parseStateExport,
  serializeStateExport,
  validateState,
  type MorrowwardState,
} from "../../src/data";
import { QuotesResponseSchema } from "../../src/contracts";
import {
  usePersistedState,
  type PersistenceStatus,
  type PersistNow,
  type PersistedStateAdapter,
} from "../hooks/usePersistedState";

type Theme = "dawn" | "horizon" | "alchemy";
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
  schemaVersion: 1;
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
  facts: string[];
  sentiment: string;
  uncertainty: string[];
  takeaway: string;
  generatedAt: string;
  factDetails: Array<{
    fact: string;
    source: string;
    asOf: string;
    freshness: string;
  }>;
  provenance: {
    mode: "ai" | "fallback";
    model: string | null;
    source: string;
    freshness: "fresh" | "delayed" | "unknown";
  };
};

type EducatorReply = {
  answer: string;
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
  icon: LucideIcon;
  note: string;
};

const STORAGE_KEY = "morrowward.app.v1";

function samplePriceCents(symbol: PracticeAssetSymbol): number {
  return Math.round(EDUCATIONAL_QUOTES[symbol].price * 100);
}

const ASSETS: Asset[] = [
  { symbol: "VTI", name: "Total US Market", kind: "ETF", icon: Landmark, note: "Broad-market ETF" },
  { symbol: "BND", name: "Total Bond Market", kind: "ETF", icon: ShieldCheck, note: "Broad bond ETF" },
  { symbol: "AAPL", name: "Apple", kind: "Stock", icon: Building, note: "Individual company" },
  { symbol: "TSLA", name: "Tesla", kind: "Stock", icon: Zap, note: "Individual company" },
  { symbol: "BTC", name: "Bitcoin", kind: "Crypto", icon: Bitcoin, note: "Crypto asset" },
  { symbol: "ETH", name: "Ethereum", kind: "Crypto", icon: Coins, note: "Crypto asset" },
];

const FALLBACK_BRIEF: Brief = {
  headline: "A calm plan can outlast a noisy market",
  facts: [
    "Prices move every day, but your practice plan spans decades.",
    "Diversification spreads exposure; it does not eliminate risk.",
  ],
  sentiment: "Mixed — a useful reminder that a mood is not a forecast.",
  uncertainty: ["Short-term market direction cannot be known in advance."],
  takeaway: "Review your assumptions, then focus on the next repeatable habit within your control.",
  generatedAt: "Evergreen offline edition",
  factDetails: [],
  provenance: {
    mode: "fallback",
    model: null,
    source: "Morrowward evergreen educational edition",
    freshness: "unknown",
  },
};

const EDUCATION_TOPICS: Array<{
  title: string;
  kicker: string;
  description: string;
  source: string;
  href: string;
  icon: LucideIcon;
}> = [
  {
    title: "Compounding",
    kicker: "Start with time",
    description: "Learn why returns can build on prior growth—and why the path is never perfectly smooth.",
    source: "Investor.gov",
    href: "https://www.investor.gov/introduction-investing",
    icon: TrendingUp,
  },
  {
    title: "Diversification",
    kicker: "Spread exposure",
    description: "See how an allocation can combine different assets and risks without promising safety.",
    source: "Investor.gov",
    href: "https://www.investor.gov/introduction-investing/getting-started/asset-allocation",
    icon: Compass,
  },
  {
    title: "Dollar-cost averaging",
    kicker: "Build a rhythm",
    description: "Understand the habit of investing equal amounts at regular intervals.",
    source: "Investor.gov",
    href: "https://www.investor.gov/introduction-investing/investing-basics/glossary/dollar-cost-averaging",
    icon: Calendar,
  },
  {
    title: "Risk & volatility",
    kicker: "Name the tradeoffs",
    description: "Explore why potential return and uncertainty belong in the same conversation.",
    source: "Investor.gov",
    href: "https://www.investor.gov/introduction-investing",
    icon: LineChart,
  },
  {
    title: "Options basics",
    kicker: "Advanced lesson",
    description: "Learn the language of contracts, expiration, and the Greeks before considering real-world use.",
    source: "FINRA",
    href: "https://www.finra.org/investors/insights/options-z-basics-greeks",
    icon: SlidersHorizontal,
  },
  {
    title: "Crypto assets",
    kicker: "Know the risks",
    description: "Review custody, volatility, scams, and regulatory uncertainty in plain language.",
    source: "FINRA",
    href: "https://www.finra.org/investors/investing/investment-products/crypto-assets/overview",
    icon: Bitcoin,
  },
];

const GUIDED_QUESTIONS = [
  "How does compounding work here?",
  "What does inflation-adjusted mean?",
  "Why can returns vary so much?",
  "Explain diversification simply.",
];

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

export function quotesResponseToMap(payload: unknown): EducationalQuoteMap | null {
  const parsed = QuotesResponseSchema.safeParse(payload);
  if (!parsed.success) return null;
  return Object.fromEntries(
    parsed.data.quotes.map((quote) => [
      quote.symbol,
      {
        symbol: quote.symbol,
        priceCents: Math.round(quote.price * 100),
        asOf: quote.asOf,
        source: quote.source.name,
        status: "delayed" as const,
      },
    ]),
  ) as EducationalQuoteMap;
}

export function stateToAppData(input: MorrowwardState): AppData {
  const state = validateState(input);
  return {
    schemaVersion: 1,
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
  let answer =
    "A long-term projection is a way to explore how your starting amount, recurring contributions, time, and an illustrative return interact. It is a learning model—not a prediction.";
  if (lower.includes("compound")) {
    answer =
      "Compounding means growth can earn growth of its own. In this simulation, each week begins with the prior balance, applies the selected illustrative rate, and then adds your weekly contribution. More time gives that repeated process more chances to work.";
  } else if (lower.includes("inflation")) {
    answer =
      "Inflation-adjusted value translates a future amount into an estimate of today's purchasing power. If prices rise over time, the same number of dollars may buy less, so Morrowward shows both nominal and inflation-adjusted illustrations.";
  } else if (lower.includes("divers")) {
    answer =
      "Diversification means spreading exposure across different investments rather than relying on one outcome. It can reduce concentration risk, but it cannot prevent losses or guarantee returns.";
  } else if (lower.includes("return") || lower.includes("vary") || lower.includes("risk")) {
    answer =
      "Real returns change from year to year and can be negative. Morrowward's 3%, 6%, and 9% scenarios are editable illustrations chosen to compare possibilities—not forecasts or expected results.";
  }
  return {
    answer,
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
    answer,
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

function parseFactDetails(value: unknown): Brief["factDetails"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item.fact !== "string" ||
      typeof item.source !== "string" ||
      typeof item.asOf !== "string" ||
      typeof item.freshness !== "string"
    ) {
      return [];
    }
    return [
      {
        fact: item.fact,
        source: item.source,
        asOf: item.asOf,
        freshness: item.freshness,
      },
    ];
  });
}

export function parseBrief(payload: unknown): Brief {
  if (!isRecord(payload)) return FALLBACK_BRIEF;
  const nested = isRecord(payload.brief) ? payload.brief : payload;
  if (typeof nested.headline !== "string") return FALLBACK_BRIEF;
  const meta = isRecord(nested.meta)
    ? nested.meta
    : isRecord(payload.meta)
      ? payload.meta
      : {};
  const mode = meta.mode === "ai" ? "ai" : "fallback";
  const factDetails = parseFactDetails(nested.factDetails);
  const suppliedFacts = stringArray(nested.facts);
  const uncertainty = stringArray(nested.uncertainty);
  const education = stringArray(nested.education);
  const source =
    (typeof meta.source === "string" && meta.source) ||
    factDetails[0]?.source ||
    "Morrowward educational edition";
  const provenanceText = [
    source,
    ...factDetails.map((detail) => detail.freshness),
  ].join(" ");
  const delayed = /\b(?:delayed|sample|stale)\b/iu.test(provenanceText);
  const explicitlyFresh =
    factDetails.length > 0 &&
    factDetails.every((detail) => detail.freshness.toLowerCase() === "fresh");
  const freshness: Brief["provenance"]["freshness"] = delayed
    ? "delayed"
    : mode === "ai" && explicitlyFresh
      ? "fresh"
      : "unknown";

  return {
    headline: nested.headline,
    facts:
      suppliedFacts.length > 0
        ? suppliedFacts
        : factDetails.map((detail) => detail.fact),
    factDetails,
    sentiment: typeof nested.sentiment === "string" ? nested.sentiment : "No sentiment summary available.",
    uncertainty:
      uncertainty.length > 0
        ? uncertainty
        : typeof nested.uncertainty === "string"
          ? [nested.uncertainty]
          : ["Market outcomes remain uncertain."],
    takeaway:
      (typeof nested.takeaway === "string" && nested.takeaway) ||
      education[0] ||
      "Keep the focus on your repeatable learning habit.",
    generatedAt: typeof nested.generatedAt === "string" ? nested.generatedAt : "Today",
    provenance: {
      mode,
      model: typeof meta.model === "string" ? meta.model : null,
      source,
      freshness,
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
                <h2 id="setup-title" ref={setupTitleRef} tabIndex={-1}>Choose your horizon</h2>
                <p>Pick the atmosphere that helps the future feel inviting.</p>
              </div>
              <div className="theme-cards" role="group" aria-labelledby="setup-title">
                {([
                  ["dawn", "Dawn", "Warm, bright, grounded", Sun],
                  ["horizon", "Horizon", "Deep blue, calm, expansive", Moon],
                  ["alchemy", "Alchemy", "Charcoal, violet, luminous", FlaskConical],
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
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenuOpen(false);
      menuTriggerRef.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", closeOnEscape);
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
          <span className="local-badge"><Lock size={14} aria-hidden="true" /> Local & private</span>
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
      <div className="trajectory-card">
        <div className="trajectory-head"><span>Illustrative path</span><strong>{projection.years} years</strong></div>
        <div className="trajectory-bars" role="img" aria-label={`Illustrative growth from ${formatMoney(data.plan.startingCents)} to ${formatMoney(projection.futureCents)}`}>
          {trajectory.map((point) => <span key={point.age} style={{ height: `${point.height}%` }}><i /><small>{point.age}</small></span>)}
        </div>
        <div className="trajectory-legend"><span>Today</span><span>Age {data.plan.targetAge}</span></div>
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

function BriefCard({ brief, loading, onRefresh }: { brief: Brief; loading: boolean; onRefresh: () => void }) {
  const editionLabel =
    brief.provenance.freshness === "delayed"
      ? `${brief.provenance.mode === "ai" ? "GPT summary" : "Deterministic"} · delayed sample`
      : brief.provenance.mode === "ai"
        ? "AI-generated edition"
        : "Deterministic edition";
  return (
    <article className="panel brief-card" aria-busy={loading}>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {loading ? "Updating the daily brief." : `Daily brief ready. ${editionLabel}.`}
      </p>
      <div className="panel-heading">
        <div><span className="section-kicker">Today’s 90-second brief</span><h2>{brief.headline}</h2></div>
        <button className="icon-button" type="button" onClick={onRefresh} disabled={loading} aria-label={loading ? "Refreshing daily brief" : "Refresh daily brief"}><RefreshCw className={loading ? "spin" : ""} size={18} aria-hidden="true" /></button>
      </div>
      <div className="brief-grid">
        <div><span className="brief-label"><Check size={15} aria-hidden="true" /> What we know</span><ul>{brief.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul></div>
        <div><span className="brief-label"><LineChart size={15} aria-hidden="true" /> Broad mood</span><p>{brief.sentiment}</p></div>
        <div><span className="brief-label"><CircleAlert size={15} aria-hidden="true" /> Uncertainty</span><ul>{brief.uncertainty.map((item) => <li key={item}>{item}</li>)}</ul></div>
      </div>
      <div className="takeaway"><Lightbulb size={18} aria-hidden="true" /><div><strong>Learning takeaway</strong><span>{brief.takeaway}</span></div></div>
      <footer><span>{brief.provenance.source} · {brief.generatedAt}</span><span title={`Source: ${brief.provenance.source}`}>{brief.provenance.mode === "ai" ? <Sparkles size={13} aria-hidden="true" /> : <Database size={13} aria-hidden="true" />}{editionLabel}</span></footer>
    </article>
  );
}

function TodayView({ data, projection, brief, briefLoading, onRefreshBrief, onNavigate }: { data: AppData; projection: Projection; brief: Brief; briefLoading: boolean; onRefreshBrief: () => void; onNavigate: (view: View) => void }) {
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
      <BriefCard brief={brief} loading={briefLoading} onRefresh={onRefreshBrief} />
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
  const [quoteSource, setQuoteSource] = useState("Bundled deterministic delayed sample");
  const selectedAsset = ASSETS.find((asset) => asset.symbol === selected) ?? ASSETS[0];
  const selectedQuote = quotes[selected] ?? DEMO_QUOTES[selected]!;
  const habit = practiceStatus(data);
  const valuation = valuePracticePortfolio(data.practice, quotes);
  const holdingsValue = valuation.investedValueCents;

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/quotes", {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Quotes unavailable");
        const mapped = quotesResponseToMap(await response.json());
        if (!mapped) throw new Error("Quotes invalid");
        setQuotes({ ...DEMO_QUOTES, ...mapped });
        const first = Object.values(mapped)[0];
        setQuoteSource(first ? `${first.source} · as of ${new Date(first.asOf).toLocaleString()}` : "Deterministic delayed sample");
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

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
      <div className="page-intro"><div><span className="section-kicker">Practice mode</span><h1>Learn the motion before risking money.</h1><p>Every dollar, share, price, and result on this page is simulated.</p></div><span className="simulation-badge"><FlaskConical size={16} /> 100% simulation</span></div>
      <section className="practice-summary">
        <article><span><WalletCards size={19} /> Simulated cash</span><strong>{formatMoney(data.practice.cashCents)}</strong><small>available to practice</small></article>
        <article><span><LineChart size={19} /> Practice holdings</span><strong>{formatMoney(Math.round(holdingsValue))}</strong><small>using illustrative prices</small></article>
        <article><span><Leaf size={19} /> Learning streak</span><strong>{habit.streak} weeks</strong><small>consistency over outcomes</small></article>
      </section>
      <section className="practice-layout">
        <article className="panel habit-flow">
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
          <div className="price-note"><Clock size={15} aria-hidden="true" /><span><strong>Illustrative prices</strong>{quoteSource}. These are not live trading quotes and should never inform a real trade.</span></div>
        </aside>
      </section>
      <section aria-labelledby="asset-title">
        <div className="section-heading"><div><span className="section-kicker">Six ways to learn</span><h2 id="asset-title">Choose a practice asset</h2></div><p>These examples span broad funds, individual companies, and crypto assets. Inclusion is not endorsement.</p></div>
        <div className="asset-grid">
          {ASSETS.map((asset) => {
            const Icon = asset.icon;
            const quote = quotes[asset.symbol] ?? DEMO_QUOTES[asset.symbol]!;
            return <button data-testid={`asset-${asset.symbol}`} type="button" key={asset.symbol} className={selected === asset.symbol ? "asset-card selected" : "asset-card"} onClick={() => setSelected(asset.symbol)} aria-pressed={selected === asset.symbol}><span className="asset-icon"><Icon size={20} aria-hidden="true" /></span><span><strong>{asset.symbol}</strong><small>{asset.name}</small></span><span><b>{formatMoney(quote.priceCents)}</b><small>{asset.note}</small></span><i><Check size={14} aria-hidden="true" /></i></button>;
          })}
        </div>
      </section>
      {data.practice.transactions.length > 0 && <section className="panel activity-panel"><div className="panel-heading"><div><span className="section-kicker">Practice receipt</span><h2>Recent activity</h2></div><ShieldCheck size={20} /></div><div className="activity-list">{[...data.practice.transactions].reverse().slice(0, 5).map((item) => <div key={item.id}><span className={item.type === "deposit" ? "activity-icon deposit" : "activity-icon"}>{item.type === "deposit" ? <Plus size={16} /> : <FlaskConical size={16} />}</span><div><strong>{item.type === "deposit" ? "Weekly practice deposit" : `${item.symbol} simulated purchase`}</strong><small>{new Date(item.occurredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</small></div><b>{item.type === "deposit" ? "+" : "−"}{formatMoney(item.type === "deposit" ? item.amountCents : item.spentCents)}</b></div>)}</div></section>}
    </div>
  );
}

function LearnView({ data }: { data: AppData }) {
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState<EducatorReply | null>(null);
  const [loading, setLoading] = useState(false);
  const responseRef = useRef<HTMLDivElement>(null);

  const ask = async (event?: FormEvent) => {
    event?.preventDefault();
    const clean = question.trim().slice(0, 500);
    if (!clean || loading) return;
    setLoading(true);
    try {
      const response = await fetch("/api/v1/education/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: clean,
          experienceLevel: data.experience,
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
    } catch {
      setReply(fallbackEducator(clean));
    } finally {
      setLoading(false);
      window.setTimeout(() => responseRef.current?.focus(), 50);
    }
  };

  return (
    <div className="view-stack">
      <div className="page-intro"><div><span className="section-kicker">Education center</span><h1>Understanding is a form of freedom.</h1><p>Start with one honest question. Build from there.</p></div><span className="level-badge"><UserRound size={15} aria-hidden="true" /> {data.experience === "new" ? "Plain-language mode" : data.experience === "familiar" ? "Familiar mode" : "Advanced detail mode"}</span></div>
      <section className="educator-panel" aria-labelledby="educator-title" aria-busy={loading}>
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{loading ? "Morrow is preparing an explanation." : reply ? "Morrow’s explanation is ready." : ""}</p>
        <div className="educator-intro">
          <span className="morrow-avatar"><Sparkles size={24} aria-hidden="true" /></span>
          <div><span className="section-kicker">Ask Morrow · GPT-5.6 when available</span><h2 id="educator-title">What would you like to understand?</h2><p>I explain concepts and assumptions. I do not tell you what to buy, sell, or do with your money.</p></div>
        </div>
        <div className="prompt-chips" role="group" aria-label="Suggested questions">{GUIDED_QUESTIONS.map((prompt) => <button data-testid={`educator-chip-${GUIDED_QUESTIONS.indexOf(prompt)}`} key={prompt} type="button" onClick={() => setQuestion(prompt)}>{prompt}<ChevronRight size={14} aria-hidden="true" /></button>)}</div>
        <form className="question-form" onSubmit={ask}>
          <label htmlFor="educator-question">Your question</label>
          <div><textarea data-testid="educator-question" id="educator-question" value={question} maxLength={500} onChange={(event) => setQuestion(event.target.value)} placeholder="Try: Why does the 6% scenario grow faster over time?" rows={3} /><button className="button primary" data-testid="educator-submit" type="submit" disabled={!question.trim() || loading}>{loading ? <RefreshCw className="spin" size={18} aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}<span>{loading ? "Explaining…" : "Explain it"}</span></button></div><small>{question.length}/500 · Please don’t share account numbers or private information. When GPT is configured, this question and four bounded illustration values pass through Morrowward’s server to OpenAI.</small>
        </form>
        {reply && (
          <div className="educator-response" ref={responseRef} tabIndex={-1} role="region" aria-labelledby="morrow-response-title">
            <div className="response-label" id="morrow-response-title"><Sparkles size={15} aria-hidden="true" /> Morrow’s explanation <span>{reply.meta.mode === "ai" ? <><Sparkles size={12} aria-hidden="true" /> {reply.meta.model?.toUpperCase() ?? "AI"} generated</> : reply.meta.mode === "guardrail" ? <><ShieldCheck size={12} aria-hidden="true" /> Safety-guided response</> : <><Database size={12} aria-hidden="true" /> Deterministic fallback</>}</span></div>
            <p>{reply.answer}</p>
            {reply.assumptions.length > 0 && <div className="assumption-list"><strong>Assumptions to notice</strong><ul>{reply.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></div>}
            <div className="next-step"><ArrowRight size={17} aria-hidden="true" /><span><strong>Try next</strong>{reply.nextStep}</span></div>
            <small>{reply.disclosure}</small>
          </div>
        )}
      </section>
      <section aria-labelledby="library-title">
        <div className="section-heading"><div><span className="section-kicker">Learning library</span><h2 id="library-title">Build your financial vocabulary</h2></div><p>Approachable introductions with links to primary educational sources.</p></div>
        <div className="topic-grid">{EDUCATION_TOPICS.map((topic) => { const Icon = topic.icon; return <article className="topic-card" key={topic.title}><span className="topic-icon"><Icon size={22} aria-hidden="true" /></span><span className="section-kicker">{topic.kicker}</span><h3>{topic.title}</h3><p>{topic.description}</p><a href={topic.href} target="_blank" rel="noreferrer">Read at {topic.source}<ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a></article>; })}</div>
      </section>
      <aside className="supplemental-note"><Info size={18} aria-hidden="true" /><p><strong>About sources</strong> Morrowward prioritizes primary public-interest resources such as Investor.gov and FINRA. Grokipedia may be offered later as clearly labeled supplemental reading, never as the canonical source.</p></aside>
    </div>
  );
}

function MissionView() {
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
          <div className="photo-frame"><Image src="/dave-age-10-commodore-64.jpg" alt="Dave at age 10 sitting beside his Commodore 64" width={447} height={447} priority /></div>
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
      <section aria-labelledby="values-title">
        <div className="section-heading"><div><span className="section-kicker">What guides us</span><h2 id="values-title">Built around human agency</h2></div></div>
        <div className="values-grid">
          <article><span><Sparkles size={21} aria-hidden="true" /></span><h3>Hope without hype</h3><p>Show possibilities while naming uncertainty honestly.</p></article>
          <article><span><BookOpen size={21} aria-hidden="true" /></span><h3>Learning before action</h3><p>Explain concepts without pretending to know what someone should do.</p></article>
          <article><span><ShieldCheck size={21} aria-hidden="true" /></span><h3>Privacy by default</h3><p>No account required. The full saved plan and holdings stay on this device; educator requests use only bounded illustration context.</p></article>
          <article><span><Leaf size={21} aria-hidden="true" /></span><h3>Consistency over perfection</h3><p>Celebrate the repeatable habit, not a lucky market outcome.</p></article>
        </div>
      </section>
      <section className="roadmap-panel">
        <div><span className="section-kicker">Beyond build week</span><h2>Where Morrowward can go next</h2><p>The web app is the beginning. Every future connection will preserve the same educational, private, and user-controlled foundation.</p></div>
        <ul>
          <li><span><Rocket size={18} aria-hidden="true" /></span><div><strong>Native iOS & macOS</strong><small>A focused daily companion across devices</small></div></li>
          <li><span><Landmark size={18} aria-hidden="true" /></span><div><strong>Optional brokerage connections</strong><small>Read-only organization with explicit consent</small></div></li>
          <li><span><LineChart size={18} aria-hidden="true" /></span><div><strong>Options & LEAPS education</strong><small>Scenario modeling with clear risk boundaries</small></div></li>
          <li><span><Mail size={18} aria-hidden="true" /></span><div><strong>Scheduled learning briefs</strong><small>Opt-in reminders that support the habit</small></div></li>
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
}: {
  data: AppData;
  setData: (data: AppData) => void;
  persistence: PersistenceStatus;
  persistNow: PersistNow<AppData>;
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
  const items = NAV_ITEMS.slice(0, 4);
  return (
    <nav className="bottom-nav" aria-label="Mobile primary navigation">
      {items.map((item) => { const Icon = item.icon; return <button data-testid={`mobile-nav-${item.id}`} key={item.id} type="button" className={active === item.id ? "active" : ""} onClick={() => onNavigate(item.id)} aria-current={active === item.id ? "page" : undefined}><Icon size={19} aria-hidden="true" /><span>{item.label}</span></button>; })}
      <button type="button" className={active === "settings" ? "active" : ""} onClick={() => onNavigate("settings")} aria-current={active === "settings" ? "page" : undefined}><Settings size={19} aria-hidden="true" /><span>Settings</span></button>
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
    themeMeta.content = data.theme === "dawn" ? "#f4efe4" : data.theme === "alchemy" ? "#17131f" : "#081421";
  }, [data.theme]);

  useEffect(() => {
    if (!hydrated || !data.onboarded) return;
    const timer = window.setTimeout(() => void loadBrief(), 0);
    return () => window.clearTimeout(timer);
  }, [hydrated, data.onboarded, loadBrief]);

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
        {active === "today" && <TodayView data={data} projection={projection} brief={brief} briefLoading={briefLoading} onRefreshBrief={loadBrief} onNavigate={navigate} />}
        {active === "plan" && <PlanView data={data} setData={setData} projection={projection} />}
        {active === "practice" && <PracticeView data={data} setData={setData} />}
        {active === "learn" && <LearnView data={data} />}
        {active === "mission" && <MissionView />}
        {active === "settings" && <SettingsView data={data} setData={setData} persistence={persistence} persistNow={persistNow} />}
      </main>
      <AppFooter onNavigate={navigate} />
      <MobileNav active={active} onNavigate={navigate} />
    </div>
  );
}
