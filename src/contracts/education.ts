import { z } from "zod";

export const EXPERIENCE_LEVELS = ["new", "familiar", "advanced"] as const;
export const EDUCATION_TOPICS = [
  "general",
  "compounding",
  "diversification",
  "volatility",
  "risk",
  "inflation",
  "etfs",
  "stocks",
  "crypto",
  "options",
  "dollar-cost-averaging",
] as const;

function normalizePlainText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export const EducationScenarioContextSchema = z
  .object({
    yearsRemaining: z.number().int().min(1).max(80).optional(),
    weeklyContributionCents: z.number().int().min(0).max(100_000_000).optional(),
    illustrativeReturnBps: z.number().int().min(-5_000).max(5_000).optional(),
    illustrativeInflationBps: z
      .number()
      .int()
      .min(-1_000)
      .max(5_000)
      .optional(),
  })
  .strict();

export const EducationExplainRequestSchema = z
  .object({
    question: z
      .string()
      .trim()
      .min(3, "Question must be at least 3 characters")
      .max(600, "Question must be 600 characters or fewer")
      .transform(normalizePlainText),
    experienceLevel: z.enum(EXPERIENCE_LEVELS).default("new"),
    topic: z.enum(EDUCATION_TOPICS).default("general"),
    context: EducationScenarioContextSchema.optional(),
  })
  .strict();

export const EducationalExplanationSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    summary: z.string().trim().min(1).max(900),
    keyPoints: z.array(z.string().trim().min(1).max(300)).min(1).max(5),
    assumptions: z.array(z.string().trim().min(1).max(300)).min(1).max(4),
    tryNext: z.array(z.string().trim().min(1).max(240)).min(1).max(3),
  })
  .strict();

export const EXPLANATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, maxLength: 100 },
    summary: { type: "string", minLength: 1, maxLength: 900 },
    keyPoints: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: { type: "string", minLength: 1, maxLength: 300 },
    },
    assumptions: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: { type: "string", minLength: 1, maxLength: 300 },
    },
    tryNext: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: { type: "string", minLength: 1, maxLength: 240 },
    },
  },
  required: ["title", "summary", "keyPoints", "assumptions", "tryNext"],
  additionalProperties: false,
} as const;

export const EducationExplainResponseSchema = z
  .object({
    answer: z.string(),
    assumptions: z.array(z.string()),
    nextStep: z.string(),
    disclosure: z.string(),
    explanation: EducationalExplanationSchema,
    meta: z
      .object({
        mode: z.enum(["ai", "fallback", "guardrail"]),
        model: z.string().nullable(),
        requestId: z.string(),
        generatedAt: z.string(),
      })
      .strict(),
  })
  .strict();

export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];
export type EducationTopic = (typeof EDUCATION_TOPICS)[number];
export type EducationScenarioContext = z.infer<
  typeof EducationScenarioContextSchema
>;
export type EducationExplainRequest = z.infer<
  typeof EducationExplainRequestSchema
>;
export type EducationalExplanation = z.infer<
  typeof EducationalExplanationSchema
>;
export type EducationExplainResponse = z.infer<
  typeof EducationExplainResponseSchema
>;
