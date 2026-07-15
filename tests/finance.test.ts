import { describe, expect, it } from "vitest";
import {
  DomainValidationError,
  buySimulatedAsset,
  calculateHabitProgress,
  calculateProjection,
  calculateProjectionScenarios,
  createHabitLog,
  createPracticePortfolio,
  depositWeeklyContribution,
  formatAssetMicroUnits,
  formatBasisPoints,
  formatCurrencyCents,
  isoWeekKey,
  recordCompletedWeek,
  valuePracticePortfolio,
  type EducationalQuote,
  type PracticeAssetSymbol,
} from "../src/domain";

const NOW = "2026-07-15T12:00:00.000Z";

function quote(
  symbol: PracticeAssetSymbol,
  priceCents: number,
  status: EducationalQuote["status"] = "fresh",
): EducationalQuote {
  return {
    symbol,
    priceCents,
    status,
    source: "test fixture",
    asOf: NOW,
  };
}

describe("projection engine", () => {
  it("adds 52 end-of-week contributions exactly at a zero return", () => {
    const result = calculateProjection({
      currentAge: 30,
      targetAge: 31,
      startingBalanceCents: 10_000,
      weeklyContributionCents: 100,
      annualReturnBps: 0,
      annualInflationBps: 0,
    });

    expect(result.yearsRemaining).toBe(1);
    expect(result.weeksRemaining).toBe(52);
    expect(result.contributionDepositsCents).toBe(5_200);
    expect(result.totalContributionsCents).toBe(15_200);
    expect(result.nominalFutureValueCents).toBe(15_200);
    expect(result.estimatedGrowthCents).toBe(0);
    expect(result.inflationAdjustedFutureValueCents).toBe(15_200);
  });

  it("preserves effective annual compounding when converted to weeks", () => {
    const result = calculateProjection({
      currentAge: 30,
      targetAge: 31,
      startingBalanceCents: 100_000,
      weeklyContributionCents: 0,
      annualReturnBps: 1_000,
      annualInflationBps: 0,
    });

    // Cent rounding each week can differ slightly from a single annual rounding.
    expect(result.nominalFutureValueCents).toBeGreaterThanOrEqual(109_980);
    expect(result.nominalFutureValueCents).toBeLessThanOrEqual(110_020);
  });

  it("reports inflation-adjusted buying power separately", () => {
    const result = calculateProjection({
      currentAge: 30,
      targetAge: 31,
      startingBalanceCents: 103_000,
      weeklyContributionCents: 0,
      annualReturnBps: 0,
      annualInflationBps: 300,
    });

    expect(result.nominalFutureValueCents).toBe(103_000);
    expect(result.inflationAdjustedFutureValueCents).toBe(100_000);
  });

  it("builds the editable 3%, 6%, and 9% default illustrations", () => {
    const scenarios = calculateProjectionScenarios({
      currentAge: 25,
      targetAge: 65,
      startingBalanceCents: 0,
      weeklyContributionCents: 1_000,
      annualInflationBps: 300,
    });

    expect(scenarios.map((scenario) => scenario.definition.annualReturnBps)).toEqual([
      300, 600, 900,
    ]);
    expect(scenarios[0].projection.nominalFutureValueCents).toBeLessThan(
      scenarios[1].projection.nominalFutureValueCents,
    );
    expect(scenarios[1].projection.nominalFutureValueCents).toBeLessThan(
      scenarios[2].projection.nominalFutureValueCents,
    );
  });

  it("supports negative illustrations without hiding losses", () => {
    const result = calculateProjection({
      currentAge: 30,
      targetAge: 40,
      startingBalanceCents: 100_000,
      weeklyContributionCents: 0,
      annualReturnBps: -500,
      annualInflationBps: 0,
    });
    expect(result.nominalFutureValueCents).toBeLessThan(100_000);
    expect(result.estimatedGrowthCents).toBeLessThan(0);
  });

  it("rejects invalid horizons, non-integers, impossible rates, and overflow", () => {
    const valid = {
      currentAge: 30,
      targetAge: 65,
      startingBalanceCents: 0,
      weeklyContributionCents: 1_000,
      annualReturnBps: 600,
      annualInflationBps: 300,
    };

    expect(() => calculateProjection({ ...valid, targetAge: 30 })).toThrow(
      DomainValidationError,
    );
    expect(() =>
      calculateProjection({ ...valid, weeklyContributionCents: 1.25 }),
    ).toThrow(DomainValidationError);
    expect(() => calculateProjection({ ...valid, annualReturnBps: -10_000 })).toThrow(
      DomainValidationError,
    );
    expect(() =>
      calculateProjection({
        ...valid,
        currentAge: 18,
        targetAge: 120,
        startingBalanceCents: Number.MAX_SAFE_INTEGER,
        annualReturnBps: 5_000,
      }),
    ).toThrow(/safe-integer range/);
  });
});
describe("stable formatting", () => {
  it("formats integer representations without changing the domain value", () => {
    expect(formatCurrencyCents(123_456)).toBe("$1,234.56");
    expect(formatCurrencyCents(-100)).toBe("-$1.00");
    expect(formatBasisPoints(625)).toBe("6.25%");
    expect(formatBasisPoints(-50)).toBe("-0.5%");
    expect(formatAssetMicroUnits(1_234_567)).toBe("1.234567");
  });
});

describe("simulated practice portfolio", () => {
  it("deposits simulated cash and buys exact fractional micro-units", () => {
    const funded = depositWeeklyContribution(createPracticePortfolio(10_000), 2_500, {
      occurredAt: NOW,
      transactionId: "weekly-1",
    });
    const result = buySimulatedAsset(funded, {
      symbol: "AAPL",
      amountCents: 10_000,
      priceCents: 20_000,
      occurredAt: NOW,
      transactionId: "buy-1",
    });

    expect(result.transaction.unitsMicro).toBe(500_000);
    expect(result.transaction.spentCents).toBe(10_000);
    expect(result.portfolio.cashCents).toBe(2_500);
    expect(result.portfolio.holdingsMicro.AAPL).toBe(500_000);
    expect(result.portfolio.transactions.map((item) => item.type)).toEqual([
      "deposit",
      "buy",
    ]);
    expect(funded.cashCents).toBe(12_500); // functions do not mutate prior state
  });

  it("values holdings, tracks quote freshness, and produces exact allocations", () => {
    let portfolio = createPracticePortfolio(30_000);
    portfolio = buySimulatedAsset(portfolio, {
      symbol: "AAPL",
      amountCents: 10_000,
      priceCents: 20_000,
      occurredAt: NOW,
      transactionId: "buy-aapl",
    }).portfolio;
    portfolio = buySimulatedAsset(portfolio, {
      symbol: "VTI",
      amountCents: 5_000,
      priceCents: 25_000,
      occurredAt: NOW,
      transactionId: "buy-vti",
    }).portfolio;

    const valuation = valuePracticePortfolio(portfolio, {
      AAPL: quote("AAPL", 24_000),
      VTI: quote("VTI", 25_000, "delayed"),
    });
    expect(valuation.cashCents).toBe(15_000);
    expect(valuation.investedValueCents).toBe(17_000);
    expect(valuation.totalValueCents).toBe(32_000);
    expect(valuation.hasUnavailableQuotes).toBe(false);
    expect(
      valuation.holdings.reduce(
        (sum, holding) => sum + holding.investedAllocationBps,
        0,
      ),
    ).toBe(10_000);
    expect(
      valuation.cashAllocationBps +
        valuation.holdings.reduce(
          (sum, holding) => sum + holding.portfolioAllocationBps,
          0,
        ),
    ).toBe(10_000);
    expect(
      valuation.holdings.find((holding) => holding.symbol === "VTI")?.quoteStatus,
    ).toBe("delayed");
  });

  it("marks owned assets with no quote as unavailable", () => {
    const portfolio = buySimulatedAsset(createPracticePortfolio(10_000), {
      symbol: "BTC",
      amountCents: 10_000,
      priceCents: 10_000_000,
      occurredAt: NOW,
      transactionId: "buy-btc",
    }).portfolio;
    const valuation = valuePracticePortfolio(portfolio, {});
    expect(valuation.hasUnavailableQuotes).toBe(true);
    expect(
      valuation.holdings.find((holding) => holding.symbol === "BTC")?.valueCents,
    ).toBeNull();
  });

  it("guards cash, allowlist, precision, and duplicate transaction IDs", () => {
    const portfolio = createPracticePortfolio(100);
    expect(() =>
      buySimulatedAsset(portfolio, {
        symbol: "AAPL",
        amountCents: 101,
        priceCents: 20_000,
      }),
    ).toThrow(/enough cash/);
    expect(() =>
      buySimulatedAsset(portfolio, {
        symbol: "DOGE" as PracticeAssetSymbol,
        amountCents: 1,
        priceCents: 1,
      }),
    ).toThrow(/practice universe/);
    expect(() =>
      buySimulatedAsset(portfolio, {
        symbol: "BTC",
        amountCents: 1,
        priceCents: Number.MAX_SAFE_INTEGER,
      }),
    ).toThrow(/one micro-unit/);

    const deposited = depositWeeklyContribution(portfolio, 1, {
      occurredAt: NOW,
      transactionId: "same-id",
    });
    expect(() =>
      depositWeeklyContribution(deposited, 1, {
        occurredAt: NOW,
        transactionId: "same-id",
      }),
    ).toThrow(/unique/);
  });
});

describe("weekly streaks and milestones", () => {
  it("uses ISO week-years correctly", () => {
    expect(isoWeekKey("2025-12-29T12:00:00.000Z")).toBe("2026-W01");
    expect(isoWeekKey("2026-01-04T12:00:00.000Z")).toBe("2026-W01");
  });

  it("deduplicates weeks and keeps an active streak through an open week", () => {
    let log = createHabitLog();
    log = recordCompletedWeek(log, "2025-12-29T12:00:00.000Z");
    log = recordCompletedWeek(log, "2026-01-05T12:00:00.000Z");
    log = recordCompletedWeek(log, "2026-01-12T12:00:00.000Z");
    log = recordCompletedWeek(log, "2026-01-12T18:00:00.000Z");

    const progress = calculateHabitProgress(
      log,
      "2026-01-21T12:00:00.000Z",
    );
    expect(progress.totalCompletedWeeks).toBe(3);
    expect(progress.currentStreakWeeks).toBe(3);
    expect(progress.longestStreakWeeks).toBe(3);
    expect(progress.earnedMilestoneIds).toEqual(["first-step"]);
    expect(progress.nextMilestone).toMatchObject({
      id: "four-weeks",
      remainingWeeks: 1,
    });
  });
});
