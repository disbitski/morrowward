import {
  MICRO_UNITS_PER_ASSET,
  DomainValidationError,
  MAX_SAFE_CENTS,
  assertIsoDateTime,
  assertSafeInteger,
  multiplyDivideCeil,
  multiplyDivideFloor,
  safeAdd,
} from "./money";

export const PRACTICE_ASSETS = [
  { symbol: "VTI", name: "Vanguard Total Stock Market ETF", kind: "etf" },
  { symbol: "BND", name: "Vanguard Total Bond Market ETF", kind: "etf" },
  { symbol: "AAPL", name: "Apple", kind: "stock" },
  { symbol: "TSLA", name: "Tesla", kind: "stock" },
  { symbol: "BTC", name: "Bitcoin", kind: "crypto" },
  { symbol: "ETH", name: "Ethereum", kind: "crypto" },
] as const;

export type PracticeAssetSymbol = (typeof PRACTICE_ASSETS)[number]["symbol"];
export type PracticeAssetKind = (typeof PRACTICE_ASSETS)[number]["kind"];

export const PRACTICE_ASSET_SYMBOLS = PRACTICE_ASSETS.map(
  (asset) => asset.symbol,
) as PracticeAssetSymbol[];

export type PracticeHoldings = Record<PracticeAssetSymbol, number>;

export interface DepositTransaction {
  id: string;
  type: "deposit";
  occurredAt: string;
  amountCents: number;
}

export interface BuyTransaction {
  id: string;
  type: "buy";
  occurredAt: string;
  symbol: PracticeAssetSymbol;
  requestedAmountCents: number;
  spentCents: number;
  priceCents: number;
  unitsMicro: number;
}

export type PracticeTransaction = DepositTransaction | BuyTransaction;

export interface PracticePortfolio {
  cashCents: number;
  holdingsMicro: PracticeHoldings;
  transactions: PracticeTransaction[];
}

export interface EducationalQuote {
  symbol: PracticeAssetSymbol;
  priceCents: number;
  asOf: string;
  source: string;
  status: "fresh" | "delayed";
}

export type EducationalQuoteMap = Partial<
  Record<PracticeAssetSymbol, EducationalQuote>
>;

export interface HoldingValuation {
  symbol: PracticeAssetSymbol;
  unitsMicro: number;
  priceCents: number | null;
  valueCents: number | null;
  investedAllocationBps: number;
  portfolioAllocationBps: number;
  quoteStatus: "fresh" | "delayed" | "unavailable";
}

export interface PortfolioValuation {
  cashCents: number;
  investedValueCents: number;
  totalValueCents: number;
  cashAllocationBps: number;
  hasUnavailableQuotes: boolean;
  holdings: HoldingValuation[];
}

export function emptyPracticeHoldings(): PracticeHoldings {
  return {
    VTI: 0,
    BND: 0,
    AAPL: 0,
    TSLA: 0,
    BTC: 0,
    ETH: 0,
  };
}

export function createPracticePortfolio(
  initialCashCents = 0,
): PracticePortfolio {
  assertSafeInteger(initialCashCents, "initialCashCents", {
    min: 0,
    max: MAX_SAFE_CENTS,
  });
  return {
    cashCents: initialCashCents,
    holdingsMicro: emptyPracticeHoldings(),
    transactions: [],
  };
}

function isPracticeSymbol(value: string): value is PracticeAssetSymbol {
  return (PRACTICE_ASSET_SYMBOLS as string[]).includes(value);
}

export function validatePracticePortfolio(portfolio: PracticePortfolio): void {
  if (!portfolio || typeof portfolio !== "object") {
    throw new DomainValidationError("portfolio", "portfolio is invalid.");
  }
  assertSafeInteger(portfolio.cashCents, "cashCents", {
    min: 0,
    max: MAX_SAFE_CENTS,
  });

  if (!portfolio.holdingsMicro || typeof portfolio.holdingsMicro !== "object") {
    throw new DomainValidationError(
      "holdingsMicro",
      "holdingsMicro is invalid.",
    );
  }
  for (const symbol of PRACTICE_ASSET_SYMBOLS) {
    assertSafeInteger(portfolio.holdingsMicro[symbol], `holdingsMicro.${symbol}`, {
      min: 0,
    });
  }
  if (!Array.isArray(portfolio.transactions)) {
    throw new DomainValidationError(
      "transactions",
      "transactions must be an array.",
    );
  }
  const transactionIds = new Set<string>();
  portfolio.transactions.forEach((transaction, index) => {
    if (!transaction || typeof transaction !== "object") {
      throw new DomainValidationError(
        `transactions.${index}`,
        "transaction is invalid.",
      );
    }
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(transaction.id)) {
      throw new DomainValidationError(
        `transactions.${index}.id`,
        "transaction ID is invalid.",
      );
    }
    if (transactionIds.has(transaction.id)) {
      throw new DomainValidationError(
        `transactions.${index}.id`,
        "transaction IDs must be unique.",
      );
    }
    transactionIds.add(transaction.id);
    assertIsoDateTime(transaction.occurredAt, `transactions.${index}.occurredAt`);

    if (transaction.type === "deposit") {
      assertSafeInteger(
        transaction.amountCents,
        `transactions.${index}.amountCents`,
        { min: 1, max: MAX_SAFE_CENTS },
      );
      return;
    }
    if (transaction.type !== "buy" || !isPracticeSymbol(transaction.symbol)) {
      throw new DomainValidationError(
        `transactions.${index}.type`,
        "transaction type or asset is invalid.",
      );
    }
    assertSafeInteger(
      transaction.requestedAmountCents,
      `transactions.${index}.requestedAmountCents`,
      { min: 1, max: MAX_SAFE_CENTS },
    );
    assertSafeInteger(
      transaction.spentCents,
      `transactions.${index}.spentCents`,
      { min: 1, max: transaction.requestedAmountCents },
    );
    assertSafeInteger(
      transaction.priceCents,
      `transactions.${index}.priceCents`,
      { min: 1, max: MAX_SAFE_CENTS },
    );
    assertSafeInteger(
      transaction.unitsMicro,
      `transactions.${index}.unitsMicro`,
      { min: 1, max: Number.MAX_SAFE_INTEGER },
    );
  });
}

function transactionMetadata(
  portfolio: PracticePortfolio,
  type: PracticeTransaction["type"],
  options: { occurredAt?: string; transactionId?: string },
): { occurredAt: string; id: string } {
  const occurredAt = options.occurredAt ?? new Date().toISOString();
  assertIsoDateTime(occurredAt, "occurredAt");
  const id =
    options.transactionId ??
    `${type}-${Date.parse(occurredAt)}-${portfolio.transactions.length + 1}`;
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(id)) {
    throw new DomainValidationError(
      "transactionId",
      "transactionId contains unsupported characters.",
    );
  }
  if (portfolio.transactions.some((transaction) => transaction.id === id)) {
    throw new DomainValidationError(
      "transactionId",
      "transactionId must be unique.",
    );
  }
  return { occurredAt, id };
}

/** Adds simulated cash; it cannot initiate a real transfer or transaction. */
export function depositWeeklyContribution(
  portfolio: PracticePortfolio,
  amountCents: number,
  options: { occurredAt?: string; transactionId?: string } = {},
): PracticePortfolio {
  validatePracticePortfolio(portfolio);
  assertSafeInteger(amountCents, "amountCents", {
    min: 1,
    max: MAX_SAFE_CENTS,
  });
  const metadata = transactionMetadata(portfolio, "deposit", options);
  const transaction: DepositTransaction = {
    ...metadata,
    type: "deposit",
    amountCents,
  };
  return {
    cashCents: safeAdd(portfolio.cashCents, amountCents, "cashCents"),
    holdingsMicro: { ...portfolio.holdingsMicro },
    transactions: [...portfolio.transactions, transaction],
  };
}

export interface SimulatedBuyOrder {
  symbol: PracticeAssetSymbol;
  amountCents: number;
  priceCents: number;
  occurredAt?: string;
  transactionId?: string;
}

export interface SimulatedBuyResult {
  portfolio: PracticePortfolio;
  transaction: BuyTransaction;
}

/** Buys the maximum whole micro-units that fit within the requested cash. */
export function buySimulatedAsset(
  portfolio: PracticePortfolio,
  order: SimulatedBuyOrder,
): SimulatedBuyResult {
  validatePracticePortfolio(portfolio);
  if (!isPracticeSymbol(order.symbol)) {
    throw new DomainValidationError(
      "symbol",
      "symbol is not in the practice universe.",
    );
  }
  assertSafeInteger(order.amountCents, "amountCents", {
    min: 1,
    max: MAX_SAFE_CENTS,
  });
  assertSafeInteger(order.priceCents, "priceCents", {
    min: 1,
    max: MAX_SAFE_CENTS,
  });
  if (order.amountCents > portfolio.cashCents) {
    throw new DomainValidationError(
      "amountCents",
      "The simulated portfolio does not have enough cash.",
    );
  }

  const unitsMicro = multiplyDivideFloor(
    order.amountCents,
    MICRO_UNITS_PER_ASSET,
    order.priceCents,
  );
  if (unitsMicro < 1) {
    throw new DomainValidationError(
      "amountCents",
      "The requested amount is too small to buy one micro-unit.",
    );
  }

  const spentCents = multiplyDivideCeil(
    unitsMicro,
    order.priceCents,
    MICRO_UNITS_PER_ASSET,
  );
  const metadata = transactionMetadata(portfolio, "buy", order);
  const transaction: BuyTransaction = {
    ...metadata,
    type: "buy",
    symbol: order.symbol,
    requestedAmountCents: order.amountCents,
    spentCents,
    priceCents: order.priceCents,
    unitsMicro,
  };
  const nextUnits = safeAdd(
    portfolio.holdingsMicro[order.symbol],
    unitsMicro,
    `holdingsMicro.${order.symbol}`,
  );

  return {
    portfolio: {
      cashCents: portfolio.cashCents - spentCents,
      holdingsMicro: {
        ...portfolio.holdingsMicro,
        [order.symbol]: nextUnits,
      },
      transactions: [...portfolio.transactions, transaction],
    },
    transaction,
  };
}

function allocateBasisPoints(values: readonly number[]): number[] {
  const total = values.reduce((sum, value) => safeAdd(sum, value), 0);
  if (total === 0) return values.map(() => 0);

  const rows = values.map((value, index) => {
    const numerator = BigInt(value) * BigInt(10_000);
    return {
      index,
      floor: Number(numerator / BigInt(total)),
      remainder: numerator % BigInt(total),
    };
  });
  const remaining = 10_000 - rows.reduce((sum, row) => sum + row.floor, 0);
  const byRemainder = [...rows].sort((left, right) => {
    if (left.remainder === right.remainder) return left.index - right.index;
    return left.remainder > right.remainder ? -1 : 1;
  });
  for (let index = 0; index < remaining; index += 1) {
    byRemainder[index].floor += 1;
  }
  const result = Array(values.length).fill(0) as number[];
  for (const row of rows) result[row.index] = row.floor;
  return result;
}

export function valuePracticePortfolio(
  portfolio: PracticePortfolio,
  quotes: EducationalQuoteMap,
): PortfolioValuation {
  validatePracticePortfolio(portfolio);
  const values = PRACTICE_ASSET_SYMBOLS.map((symbol) => {
    const quote = quotes[symbol];
    if (!quote) return null;
    if (quote.symbol !== symbol) {
      throw new DomainValidationError(
        `quotes.${symbol}.symbol`,
        "quote symbol does not match its map key.",
      );
    }
    assertSafeInteger(quote.priceCents, `quotes.${symbol}.priceCents`, {
      min: 1,
      max: MAX_SAFE_CENTS,
    });
    assertIsoDateTime(quote.asOf, `quotes.${symbol}.asOf`);
    if (
      (quote.status !== "fresh" && quote.status !== "delayed") ||
      typeof quote.source !== "string" ||
      quote.source.trim().length === 0 ||
      quote.source.length > 200
    ) {
      throw new DomainValidationError(
        `quotes.${symbol}`,
        "quote status or source is invalid.",
      );
    }
    return multiplyDivideFloor(
      portfolio.holdingsMicro[symbol],
      quote.priceCents,
      MICRO_UNITS_PER_ASSET,
    );
  });

  const knownValues = values.map((value) => value ?? 0);
  const investedValueCents = knownValues.reduce(
    (sum, value) => safeAdd(sum, value, "investedValueCents"),
    0,
  );
  const totalValueCents = safeAdd(
    portfolio.cashCents,
    investedValueCents,
    "totalValueCents",
  );
  const investedAllocations = allocateBasisPoints(knownValues);
  const portfolioAllocations = allocateBasisPoints([
    portfolio.cashCents,
    ...knownValues,
  ]);

  const holdings = PRACTICE_ASSET_SYMBOLS.map((symbol, index) => {
    const quote = quotes[symbol];
    return {
      symbol,
      unitsMicro: portfolio.holdingsMicro[symbol],
      priceCents: quote?.priceCents ?? null,
      valueCents: values[index],
      investedAllocationBps: investedAllocations[index],
      portfolioAllocationBps: portfolioAllocations[index + 1],
      quoteStatus: quote?.status ?? "unavailable",
    } satisfies HoldingValuation;
  });

  return {
    cashCents: portfolio.cashCents,
    investedValueCents,
    totalValueCents,
    cashAllocationBps: portfolioAllocations[0],
    hasUnavailableQuotes: holdings.some(
      (holding) => holding.unitsMicro > 0 && holding.valueCents === null,
    ),
    holdings,
  };
}
