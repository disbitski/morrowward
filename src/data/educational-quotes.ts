import type { EducationalQuote, QuoteSymbol } from "../contracts";
import { PRACTICE_ASSETS } from "../domain";

export const EDUCATIONAL_QUOTE_SAMPLE_AS_OF = "2026-07-14T20:00:00.000Z";
export const EDUCATIONAL_QUOTE_SOURCE = {
  name: "Morrowward synthetic educational sample",
  kind: "deterministic-educational-sample",
  url: "https://github.com/disbitski/morrowward",
} as const;
export const EDUCATIONAL_QUOTE_FRESHNESS = {
  status: "sample",
  label: "Synthetic educational sample — not a live trading quote",
  isLive: false,
  ageSeconds: null,
} as const;

function sampleQuote(
  symbol: QuoteSymbol,
  price: number,
  change: number,
  changePercent: number,
): EducationalQuote {
  const asset = PRACTICE_ASSETS.find((candidate) => candidate.symbol === symbol);
  if (!asset) throw new Error(`Missing practice asset metadata for ${symbol}.`);
  const publicTradingSince =
    "publicTradingSince" in asset ? asset.publicTradingSince : undefined;

  return {
    symbol,
    name: asset.name,
    assetType: asset.kind,
    currency: "USD",
    price,
    change,
    changePercent,
    changeBasis: asset.kind === "crypto" ? "rolling-24h" : "previous-close",
    asOf: EDUCATIONAL_QUOTE_SAMPLE_AS_OF,
    observedAt: EDUCATIONAL_QUOTE_SAMPLE_AS_OF,
    observedAtKind: "sample",
    mode: "sample",
    marketStatus: "unknown",
    source: EDUCATIONAL_QUOTE_SOURCE,
    freshness: EDUCATIONAL_QUOTE_FRESHNESS,
    profile: {
      category: asset.category,
      educationalRisk: asset.educationalRisk,
      summary: asset.summary,
      learnMoreUrl: asset.learnMoreUrl,
      ...(publicTradingSince
        ? { publicTradingSince }
        : {}),
    },
  };
}

/**
 * Stable, invented values used when no appropriately licensed display feed is
 * configured. They are intentionally not snapshots of a real market session.
 */
export const EDUCATIONAL_QUOTES: Readonly<Record<QuoteSymbol, EducationalQuote>> = {
  VTI: sampleQuote("VTI", 326.42, 1.24, 0.38),
  BND: sampleQuote("BND", 73.91, -0.09, -0.12),
  AAPL: sampleQuote("AAPL", 252.64, 1.78, 0.71),
  TSLA: sampleQuote("TSLA", 348.17, -4.44, -1.26),
  SPCX: sampleQuote("SPCX", 142.35, 1.51, 1.07),
  NVDA: sampleQuote("NVDA", 198.72, 2.18, 1.11),
  MRVL: sampleQuote("MRVL", 82.14, -0.69, -0.83),
  MU: sampleQuote("MU", 181.64, 2.76, 1.54),
  AVGO: sampleQuote("AVGO", 312.48, 1.03, 0.33),
  BTC: sampleQuote("BTC", 121_840.5, 2_203.56, 1.84),
  ETH: sampleQuote("ETH", 4_218.32, -27.19, -0.64),
};
