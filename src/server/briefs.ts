import {
  BRIEF_JSON_SCHEMA,
  BriefGenerationSchema,
  FINANCIAL_EDUCATION_DISCLOSURE,
  type BriefGeneration,
  type DailyBriefResponse,
} from "../contracts";
import { OPENAI_MODEL, requestStructuredResponse } from "./openai";
import { readDailyBrief, writeDailyBrief } from "./brief-store";

const BRIEF_INSTRUCTIONS = `You create Morrowward's short educational market-reading brief for adults.

The provided facts are a deterministic delayed demo dataset, not live market data. Do not add facts, prices, news, events, causes, forecasts, or recommendations. Separate sentiment from fact and emphasize uncertainty. Never tell anyone to buy, sell, hold, trade, or allocate. Never imply certainty, urgency, guaranteed returns, or risk-free outcomes. The educational takeaway should teach how to interpret a snapshot rather than predict a market. Output only the requested JSON structure.`;

const SAMPLE_AS_OF = "2026-07-14T20:00:00.000Z";
const FACT_DETAILS = [
  {
    fact: "The practice universe contains two ETFs, two individual stocks, and two cryptoassets.",
    source: "Morrowward delayed educational sample",
    asOf: SAMPLE_AS_OF,
    freshness: "delayed-sample" as const,
  },
  {
    fact: "The deterministic sample includes both positive and negative one-period price changes.",
    source: "Morrowward delayed educational sample",
    asOf: SAMPLE_AS_OF,
    freshness: "delayed-sample" as const,
  },
  {
    fact: "These sample prices are fixed for repeatable demos and are not suitable for trading.",
    source: "Morrowward delayed educational sample",
    asOf: SAMPLE_AS_OF,
    freshness: "delayed-sample" as const,
  },
];

const FALLBACK_GENERATION: BriefGeneration = {
  headline: "Read the snapshot without trying to predict the future",
  sentimentLabel: "mixed",
  sentimentSummary:
    "The delayed sample contains gains and declines, so the responsible reading is mixed—not a signal about what happens next.",
  uncertainty: [
    "A single observation cannot establish a durable trend.",
    "The sample omits current news, liquidity, fees, taxes, and personal circumstances.",
  ],
  education: [
    "Separate observed facts from the story you are tempted to tell about them.",
    "Use a long-term plan and repeatable habits instead of reacting to one snapshot.",
  ],
};

let cachedBrief:
  | { calendarDate: string; response: DailyBriefResponse }
  | undefined;

function responseFromGeneration(
  generation: BriefGeneration,
  options: { now: Date; mode: "ai" | "fallback" },
): DailyBriefResponse {
  const facts = FACT_DETAILS.map(({ fact }) => fact);
  return {
    headline: generation.headline,
    facts,
    factDetails: FACT_DETAILS,
    sentiment: generation.sentimentSummary,
    sentimentLabel: generation.sentimentLabel,
    uncertainty: generation.uncertainty,
    takeaway: generation.education[0],
    education: generation.education,
    generatedAt: options.now.toISOString(),
    disclosure: `${FINANCIAL_EDUCATION_DISCLOSURE} This brief uses a deterministic delayed sample, not live market data.`,
    meta: {
      mode: options.mode,
      model: options.mode === "ai" ? OPENAI_MODEL : null,
      source: "Morrowward delayed educational sample",
    },
  };
}

function containsUnsafeBriefAdvice(generation: BriefGeneration): boolean {
  const text = [
    generation.headline,
    generation.sentimentSummary,
    ...generation.uncertainty,
    ...generation.education,
  ].join(" ");
  return [
    /\b(?:you|investors?) (?:should|must|need to) (?:buy|sell|hold|trade|invest)\b/iu,
    /\b(?:buy|sell|trade) (?:now|today|immediately)\b/iu,
    /\bguaranteed (?:return|profit|gain)\b/iu,
    /\brisk[- ]free\b/iu,
    /\bwill definitely\b/iu,
  ].some((pattern) => pattern.test(text));
}

export function fallbackDailyBrief(now = new Date()): DailyBriefResponse {
  return responseFromGeneration(FALLBACK_GENERATION, { now, mode: "fallback" });
}

export function getCachedDailyBrief(now = new Date()): DailyBriefResponse {
  const calendarDate = now.toISOString().slice(0, 10);
  if (!cachedBrief || cachedBrief.calendarDate !== calendarDate) {
    cachedBrief = { calendarDate, response: fallbackDailyBrief(now) };
  }
  return cachedBrief.response;
}

/** Reads the shared date-keyed brief when configured, then safely falls back. */
export async function getDailyBrief(
  now = new Date(),
  fetchImpl?: typeof fetch,
): Promise<DailyBriefResponse> {
  const calendarDate = now.toISOString().slice(0, 10);
  const persisted = await readDailyBrief(calendarDate, fetchImpl);
  if (persisted) {
    cachedBrief = { calendarDate, response: persisted };
    return persisted;
  }
  return getCachedDailyBrief(now);
}

export async function generateDailyBrief(options: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  now?: Date;
} = {}): Promise<DailyBriefResponse> {
  const now = options.now ?? new Date();
  const result = await requestStructuredResponse({
    apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
    fetchImpl: options.fetchImpl,
    instructions: BRIEF_INSTRUCTIONS,
    input: JSON.stringify({
      dataClassification: "deterministic delayed educational sample",
      facts: FACT_DETAILS.map(({ fact }) => fact),
    }),
    schemaName: "morrowward_daily_brief",
    jsonSchema: BRIEF_JSON_SCHEMA,
    validator: BriefGenerationSchema,
    maxOutputTokens: 900,
  });

  if (!result.ok && result.reason !== "not_configured") {
    console.warn("Morrowward daily brief used its deterministic fallback.", {
      reason: result.reason,
      model: OPENAI_MODEL,
    });
  }

  const response =
    result.ok && !containsUnsafeBriefAdvice(result.value)
      ? responseFromGeneration(result.value, { now, mode: "ai" })
      : fallbackDailyBrief(now);
  cachedBrief = {
    calendarDate: now.toISOString().slice(0, 10),
    response,
  };
  await writeDailyBrief(
    now.toISOString().slice(0, 10),
    response,
    options.fetchImpl,
  );
  return response;
}

export function resetBriefCacheForTests(): void {
  cachedBrief = undefined;
}
