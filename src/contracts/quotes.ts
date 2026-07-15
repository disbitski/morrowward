import { z } from "zod";

export const QUOTE_SYMBOLS = [
  "VTI",
  "BND",
  "AAPL",
  "TSLA",
  "BTC",
  "ETH",
] as const;

export const QuoteSymbolSchema = z.enum(QUOTE_SYMBOLS);

export const EducationalQuoteSchema = z
  .object({
    symbol: QuoteSymbolSchema,
    name: z.string(),
    assetType: z.enum(["etf", "stock", "crypto"]),
    currency: z.literal("USD"),
    price: z.number().nonnegative(),
    changePercent: z.number(),
    asOf: z.string(),
    source: z
      .object({
        name: z.string(),
        kind: z.literal("deterministic-educational-sample"),
      })
      .strict(),
    freshness: z
      .object({
        status: z.literal("delayed-sample"),
        label: z.string(),
        isLive: z.literal(false),
      })
      .strict(),
  })
  .strict();

export const QuotesResponseSchema = z
  .object({
    quotes: z.array(EducationalQuoteSchema),
    allowlist: z.array(QuoteSymbolSchema),
    generatedAt: z.string(),
    disclosure: z.string(),
  })
  .strict();

export type QuoteSymbol = (typeof QUOTE_SYMBOLS)[number];
export type EducationalQuote = z.infer<typeof EducationalQuoteSchema>;
export type QuotesResponse = z.infer<typeof QuotesResponseSchema>;
