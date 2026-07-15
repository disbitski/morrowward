import type { EducationalQuote, QuoteSymbol } from "../contracts";

export const EDUCATIONAL_QUOTE_SAMPLE_AS_OF = "2026-07-14T20:00:00.000Z";
export const EDUCATIONAL_QUOTE_SOURCE = {
  name: "Morrowward delayed educational sample",
  kind: "deterministic-educational-sample",
} as const;
export const EDUCATIONAL_QUOTE_FRESHNESS = {
  status: "delayed-sample",
  label: "Deterministic delayed sample — not a live trading quote",
  isLive: false,
} as const;

export const EDUCATIONAL_QUOTES: Readonly<Record<QuoteSymbol, EducationalQuote>> = {
  VTI: {
    symbol: "VTI",
    name: "Vanguard Total Stock Market ETF",
    assetType: "etf",
    currency: "USD",
    price: 326.42,
    changePercent: 0.38,
    asOf: EDUCATIONAL_QUOTE_SAMPLE_AS_OF,
    source: EDUCATIONAL_QUOTE_SOURCE,
    freshness: EDUCATIONAL_QUOTE_FRESHNESS,
  },
  BND: {
    symbol: "BND",
    name: "Vanguard Total Bond Market ETF",
    assetType: "etf",
    currency: "USD",
    price: 73.91,
    changePercent: -0.12,
    asOf: EDUCATIONAL_QUOTE_SAMPLE_AS_OF,
    source: EDUCATIONAL_QUOTE_SOURCE,
    freshness: EDUCATIONAL_QUOTE_FRESHNESS,
  },
  AAPL: {
    symbol: "AAPL",
    name: "Apple Inc.",
    assetType: "stock",
    currency: "USD",
    price: 252.64,
    changePercent: 0.71,
    asOf: EDUCATIONAL_QUOTE_SAMPLE_AS_OF,
    source: EDUCATIONAL_QUOTE_SOURCE,
    freshness: EDUCATIONAL_QUOTE_FRESHNESS,
  },
  TSLA: {
    symbol: "TSLA",
    name: "Tesla, Inc.",
    assetType: "stock",
    currency: "USD",
    price: 348.17,
    changePercent: -1.26,
    asOf: EDUCATIONAL_QUOTE_SAMPLE_AS_OF,
    source: EDUCATIONAL_QUOTE_SOURCE,
    freshness: EDUCATIONAL_QUOTE_FRESHNESS,
  },
  BTC: {
    symbol: "BTC",
    name: "Bitcoin",
    assetType: "crypto",
    currency: "USD",
    price: 121_840.5,
    changePercent: 1.84,
    asOf: EDUCATIONAL_QUOTE_SAMPLE_AS_OF,
    source: EDUCATIONAL_QUOTE_SOURCE,
    freshness: EDUCATIONAL_QUOTE_FRESHNESS,
  },
  ETH: {
    symbol: "ETH",
    name: "Ether",
    assetType: "crypto",
    currency: "USD",
    price: 4_218.32,
    changePercent: -0.64,
    asOf: EDUCATIONAL_QUOTE_SAMPLE_AS_OF,
    source: EDUCATIONAL_QUOTE_SOURCE,
    freshness: EDUCATIONAL_QUOTE_FRESHNESS,
  },
};
