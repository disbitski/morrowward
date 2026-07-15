import {
  FINANCIAL_EDUCATION_DISCLOSURE,
  QUOTE_SYMBOLS,
  type EducationalQuote,
  type QuoteSymbol,
  type QuotesResponse,
} from "../contracts";
import { EDUCATIONAL_QUOTES } from "../data/educational-quotes";

export type QuoteSelectionResult =
  | { ok: true; symbols: QuoteSymbol[] }
  | { ok: false; unknown: string[] };

export function parseQuoteSymbols(raw: string | null): QuoteSelectionResult {
  if (!raw?.trim()) return { ok: true, symbols: [...QUOTE_SYMBOLS] };

  const requested = Array.from(
    new Set(raw.split(",").map((symbol) => symbol.trim().toUpperCase())),
  ).filter(Boolean);
  const allowed = new Set<string>(QUOTE_SYMBOLS);
  const unknown = requested.filter((symbol) => !allowed.has(symbol));
  if (unknown.length) return { ok: false, unknown };

  return { ok: true, symbols: requested as QuoteSymbol[] };
}

export function getEducationalQuotes(
  symbols: QuoteSymbol[],
  now = new Date(),
): QuotesResponse {
  return {
    quotes: symbols.map((symbol) => EDUCATIONAL_QUOTES[symbol]),
    allowlist: [...QUOTE_SYMBOLS],
    generatedAt: now.toISOString(),
    disclosure: `${FINANCIAL_EDUCATION_DISCLOSURE} Prices in this endpoint are deterministic samples and must not be used for trading.`,
  };
}

export function allEducationalQuotes(): EducationalQuote[] {
  return QUOTE_SYMBOLS.map((symbol) => EDUCATIONAL_QUOTES[symbol]);
}
