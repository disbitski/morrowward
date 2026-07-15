import { z } from "zod";

export const QUOTE_SYMBOLS = [
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

export const QuoteSymbolSchema = z.enum(QUOTE_SYMBOLS);
export const QuoteModeSchema = z.enum(["live", "delayed", "sample"]);

export const QuoteCitationSchema = z
  .object({
    title: z.string().min(1).max(200),
    url: z.string().url(),
  })
  .strict();

export const QuoteSourceSchema = z
  .object({
    name: z.string().min(1).max(100),
    kind: z.enum(["openai-web-search", "deterministic-educational-sample"]),
    // Hosted finance sources such as oai-finance do not expose a public URL.
    // Never manufacture one; preserve clickable web citations when returned.
    url: z.string().url().optional(),
    citations: z.array(QuoteCitationSchema).max(8).optional(),
  })
  .strict();

export const AssetProfileSchema = z
  .object({
    category: z.string().min(1).max(100),
    educationalRisk: z.enum(["lower", "medium", "higher", "very-high"]),
    summary: z.string().min(1).max(400),
    learnMoreUrl: z.string().url(),
    publicTradingSince: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();

export const QuoteHistoryPointSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    close: z.number().positive().finite(),
  })
  .strict();

export const QuoteHistorySchema = z
  .object({
    range: z.literal("1y"),
    interval: z.enum(["1day", "1week"]),
    points: z.array(QuoteHistoryPointSchema).min(2).max(260),
    priceChangePercent: z.number().finite(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    limited: z.boolean(),
    mode: QuoteModeSchema,
    source: QuoteSourceSchema,
  })
  .strict();

export const EducationalQuoteSchema = z
  .object({
    symbol: QuoteSymbolSchema,
    name: z.string().min(1).max(150),
    assetType: z.enum(["etf", "stock", "crypto"]),
    currency: z.literal("USD"),
    price: z.number().positive().finite(),
    change: z.number().finite().nullable(),
    changePercent: z.number().finite().nullable(),
    changeBasis: z.enum(["previous-close", "rolling-24h", "unavailable"]),
    asOf: z.string().datetime({ offset: true }),
    observedAt: z.string().datetime({ offset: true }),
    observedAtKind: z.enum(["provider", "received", "sample"]),
    mode: QuoteModeSchema,
    marketStatus: z.enum(["open", "closed", "unknown"]),
    source: QuoteSourceSchema,
    freshness: z
      .object({
        status: z.enum(["fresh", "delayed", "stale", "sample"]),
        label: z.string().min(1).max(160),
        isLive: z.boolean(),
        ageSeconds: z.number().int().nonnegative().nullable(),
      })
      .strict(),
    profile: AssetProfileSchema,
    history: QuoteHistorySchema.optional(),
  })
  .strict();

export const QuotesResponseSchema = z
  .object({
    quotes: z.array(EducationalQuoteSchema).max(QUOTE_SYMBOLS.length),
    allowlist: z.array(QuoteSymbolSchema),
    generatedAt: z.string().datetime({ offset: true }),
    provider: z
      .object({
        name: z.literal("OpenAI web search").nullable(),
        configured: z.boolean(),
        status: z.enum(["ok", "partial", "fallback", "not-configured"]),
        succeededSymbols: z.array(QuoteSymbolSchema),
        fallbackSymbols: z.array(QuoteSymbolSchema),
        lastSuccessfulUpdate: z
          .string()
          .datetime({ offset: true })
          .nullable(),
      })
      .strict(),
    disclosure: z.string(),
  })
  .strict();

export type QuoteSymbol = (typeof QUOTE_SYMBOLS)[number];
export type QuoteMode = z.infer<typeof QuoteModeSchema>;
export type QuoteHistory = z.infer<typeof QuoteHistorySchema>;
export type EducationalQuote = z.infer<typeof EducationalQuoteSchema>;
export type QuotesResponse = z.infer<typeof QuotesResponseSchema>;
