import { z } from "zod";

export const BriefGenerationSchema = z
  .object({
    headline: z.string().trim().min(1).max(140),
    sentimentLabel: z.enum(["cautious", "mixed", "constructive"]),
    sentimentSummary: z.string().trim().min(1).max(500),
    uncertainty: z.array(z.string().trim().min(1).max(260)).min(1).max(4),
    education: z.array(z.string().trim().min(1).max(260)).min(1).max(4),
  })
  .strict();

export const BRIEF_JSON_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", minLength: 1, maxLength: 140 },
    sentimentLabel: {
      type: "string",
      enum: ["cautious", "mixed", "constructive"],
    },
    sentimentSummary: { type: "string", minLength: 1, maxLength: 500 },
    uncertainty: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: { type: "string", minLength: 1, maxLength: 260 },
    },
    education: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: { type: "string", minLength: 1, maxLength: 260 },
    },
  },
  required: [
    "headline",
    "sentimentLabel",
    "sentimentSummary",
    "uncertainty",
    "education",
  ],
  additionalProperties: false,
} as const;

export const BriefFactDetailSchema = z
  .object({
    fact: z.string(),
    source: z.string(),
    asOf: z.string(),
    freshness: z.literal("delayed-sample"),
  })
  .strict();

export const DailyBriefResponseSchema = z
  .object({
    headline: z.string(),
    facts: z.array(z.string()),
    factDetails: z.array(BriefFactDetailSchema),
    sentiment: z.string(),
    sentimentLabel: z.enum(["cautious", "mixed", "constructive"]),
    uncertainty: z.array(z.string()),
    takeaway: z.string(),
    education: z.array(z.string()),
    generatedAt: z.string(),
    disclosure: z.string(),
    meta: z
      .object({
        mode: z.enum(["ai", "fallback"]),
        model: z.string().nullable(),
        source: z.literal("Morrowward delayed educational sample"),
      })
      .strict(),
  })
  .strict();

export type BriefGeneration = z.infer<typeof BriefGenerationSchema>;
export type DailyBriefResponse = z.infer<typeof DailyBriefResponseSchema>;
