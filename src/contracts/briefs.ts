import { z } from "zod";

export const BRIEF_SCENARIO_BALANCE_USD = 100_000 as const;

export const BriefCitationSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    url: z
      .string()
      .trim()
      .url()
      .max(2_048)
      .refine((value) => {
        const protocol = new URL(value).protocol;
        return protocol === "https:" || protocol === "http:";
      }, "Citation URL must use HTTP or HTTPS"),
  })
  .strict();

export const BriefSentenceSchema = z
  .object({
    text: z.string().trim().min(1).max(360),
    classification: z.enum([
      "verified-fact",
      "interpretation",
      "uncertainty",
    ]),
    citations: z.array(BriefCitationSchema).min(1).max(4),
  })
  .strict();

const BriefGeneratedSectionSchema = z
  .object({
    sentences: z.array(BriefSentenceSchema).min(1).max(5),
  })
  .strict();

export const BRIEF_ASSET_IDS = [
  "SP500_INDEX",
  "NASDAQ_COMPOSITE",
  "VTI",
  "BND",
  "AAPL",
  "TSLA",
  "SPCX",
  "NVDA",
  "MRVL",
  "MU",
  "AVGO",
  "BTC",
  "ETH",
] as const;

export const BriefAssetCheckSchema = z
  .object({
    assetId: z.enum(BRIEF_ASSET_IDS),
    status: z.enum(["verified", "ambiguous", "unavailable"]),
    identity: z.string().trim().min(1).max(180),
    sourceUrl: z.string().trim().url().max(2_048).nullable(),
  })
  .strict();

export const BriefFedEventSchema = z
  .object({
    kind: z.enum([
      "fomc-decision",
      "press-conference",
      "minutes",
      "beige-book",
      "chair-speech",
    ]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    timeEt: z.string().trim().min(1).max(40).nullable(),
    title: z.string().trim().min(1).max(180),
    sourceUrl: z.string().trim().url().max(2_048),
  })
  .strict();

export const BriefGenerationSchema = z
  .object({
    headline: z.string().trim().min(1).max(140),
    asOf: z.string().datetime(),
    marketSession: z.enum(["pre-market", "open", "closed", "unknown"]),
    sentimentLabel: z.enum([
      "bullish",
      "cautiously-bullish",
      "neutral",
      "cautious",
      "bearish",
      "unknown",
    ]),
    sections: z
      .object({
        marketAndSentiment: BriefGeneratedSectionSchema,
        frontierAssets: BriefGeneratedSectionSchema,
        learningLensAndFedWatch: BriefGeneratedSectionSchema,
      })
      .strict(),
    assetChecks: z.array(BriefAssetCheckSchema).length(BRIEF_ASSET_IDS.length),
    fedEvents: z.array(BriefFedEventSchema).max(4),
    uncertainty: z.array(z.string().trim().min(1).max(260)).min(1).max(4),
  })
  .strict();

const citationJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, maxLength: 180 },
    url: { type: "string", minLength: 1, maxLength: 2_048 },
  },
  required: ["title", "url"],
  additionalProperties: false,
} as const;

const sentenceJsonSchema = {
  type: "object",
  properties: {
    text: { type: "string", minLength: 1, maxLength: 360 },
    classification: {
      type: "string",
      enum: ["verified-fact", "interpretation", "uncertainty"],
    },
    citations: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: citationJsonSchema,
    },
  },
  required: ["text", "classification", "citations"],
  additionalProperties: false,
} as const;

const sectionJsonSchema = {
  type: "object",
  properties: {
    sentences: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: sentenceJsonSchema,
    },
  },
  required: ["sentences"],
  additionalProperties: false,
} as const;

export const BRIEF_JSON_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", minLength: 1, maxLength: 140 },
    asOf: { type: "string", format: "date-time" },
    marketSession: {
      type: "string",
      enum: ["pre-market", "open", "closed", "unknown"],
    },
    sentimentLabel: {
      type: "string",
      enum: [
        "bullish",
        "cautiously-bullish",
        "neutral",
        "cautious",
        "bearish",
        "unknown",
      ],
    },
    sections: {
      type: "object",
      properties: {
        marketAndSentiment: sectionJsonSchema,
        frontierAssets: sectionJsonSchema,
        learningLensAndFedWatch: sectionJsonSchema,
      },
      required: [
        "marketAndSentiment",
        "frontierAssets",
        "learningLensAndFedWatch",
      ],
      additionalProperties: false,
    },
    assetChecks: {
      type: "array",
      minItems: BRIEF_ASSET_IDS.length,
      maxItems: BRIEF_ASSET_IDS.length,
      items: {
        type: "object",
        properties: {
          assetId: { type: "string", enum: BRIEF_ASSET_IDS },
          status: {
            type: "string",
            enum: ["verified", "ambiguous", "unavailable"],
          },
          identity: { type: "string", minLength: 1, maxLength: 180 },
          sourceUrl: {
            anyOf: [
              { type: "string", minLength: 1, maxLength: 2_048 },
              { type: "null" },
            ],
          },
        },
        required: ["assetId", "status", "identity", "sourceUrl"],
        additionalProperties: false,
      },
    },
    fedEvents: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: [
              "fomc-decision",
              "press-conference",
              "minutes",
              "beige-book",
              "chair-speech",
            ],
          },
          date: {
            type: "string",
            pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          },
          timeEt: {
            anyOf: [
              { type: "string", minLength: 1, maxLength: 40 },
              { type: "null" },
            ],
          },
          title: { type: "string", minLength: 1, maxLength: 180 },
          sourceUrl: { type: "string", minLength: 1, maxLength: 2_048 },
        },
        required: ["kind", "date", "timeEt", "title", "sourceUrl"],
        additionalProperties: false,
      },
    },
    uncertainty: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: { type: "string", minLength: 1, maxLength: 260 },
    },
  },
  required: [
    "headline",
    "asOf",
    "marketSession",
    "sentimentLabel",
    "sections",
    "assetChecks",
    "fedEvents",
    "uncertainty",
  ],
  additionalProperties: false,
} as const;

export const BriefSectionSchema = z
  .object({
    id: z.enum([
      "market-and-sentiment",
      "frontier-assets",
      "learning-lens-and-fed-watch",
    ]),
    title: z.string().trim().min(1).max(80),
    body: z.string().trim().min(1).max(1_800),
    sources: z.array(BriefCitationSchema).min(1).max(12),
  })
  .strict();

export const DailyBriefResponseSchema = z
  .object({
    headline: z.string().trim().min(1).max(140),
    sections: z.array(BriefSectionSchema).length(3),
    generatedAt: z.string().datetime().nullable(),
    marketSession: z.enum(["pre-market", "open", "closed", "unknown"]),
    sentimentLabel: z.enum([
      "bullish",
      "cautiously-bullish",
      "neutral",
      "cautious",
      "bearish",
      "unknown",
    ]),
    scenarioBalanceUsd: z.literal(BRIEF_SCENARIO_BALANCE_USD),
    disclosure: z.string().trim().min(1).max(700),
    meta: z
      .object({
        mode: z.enum(["ai", "fallback"]),
        model: z.string().nullable(),
        source: z.enum([
          "OpenAI web search",
          "Morrowward evergreen educational edition",
        ]),
      })
      .strict(),
  })
  .strict();

export type BriefCitation = z.infer<typeof BriefCitationSchema>;
export type BriefGeneration = z.infer<typeof BriefGenerationSchema>;
export type BriefSection = z.infer<typeof BriefSectionSchema>;
export type DailyBriefResponse = z.infer<typeof DailyBriefResponseSchema>;
