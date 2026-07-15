import { describe, expect, it } from "vitest";
import {
  DomainValidationError,
  MARKET_JOURNEY_HORIZONS,
  MARKET_RISK_LEVELS,
  MARKET_SEQUENCES,
  simulateMarketJourney,
  type MarketJourneyInput,
  type MarketJourneyPoint,
} from "../src/domain";

const BASE_INPUT = {
  years: 5,
  startingBalanceCents: 100_000,
  weeklyContributionCents: 2_500,
  annualReturnBps: 600,
  riskLevel: "medium",
  seed: 2_026,
  marketSequence: "cycle",
} as const satisfies MarketJourneyInput;

function expectedDrawdownBps(points: readonly MarketJourneyPoint[]): number {
  let peak = points[0].priceCents;
  let maximum = 0;
  for (const point of points) {
    peak = Math.max(peak, point.priceCents);
    maximum = Math.max(
      maximum,
      Math.round(((peak - point.priceCents) / peak) * 10_000),
    );
  }
  return maximum;
}

describe("deterministic educational market journey", () => {
  it("returns the exact same path and summary for the same seed", () => {
    const first = simulateMarketJourney(BASE_INPUT);
    const second = simulateMarketJourney({ ...BASE_INPUT });

    expect(second).toEqual(first);
    expect(first.input.seed).toBe(2_026);
    expect(first.input.marketSequence).toBe("cycle");
  });

  it.each(MARKET_JOURNEY_HORIZONS)(
    "supports a %s-year weekly horizon with explicit market regimes",
    (years) => {
      const result = simulateMarketJourney({ ...BASE_INPUT, years });

      expect(result.points).toHaveLength(years * 52 + 1);
      expect(result.points[0].week).toBe(0);
      expect(result.points.at(-1)?.week).toBe(years * 52);
      expect(result.points.at(-1)?.year).toBe(years);
      expect(result.points.every((point) => Number.isInteger(point.priceCents))).toBe(
        true,
      );
      expect(
        result.points.every((point) =>
          Number.isSafeInteger(point.portfolioValueCents),
        ),
      ).toBe(true);

      const regimes = new Set(
        result.summary.regimeSegments.map((segment) => segment.regime),
      );
      expect(regimes).toContain("bull");
      expect(regimes).toContain("pullback");
      expect(regimes).toContain("recovery");
      expect(result.summary.regimeSegments[0].startWeek).toBe(0);
      expect(result.summary.regimeSegments.at(-1)?.endWeek).toBe(years * 52);
    },
  );

  it("keeps every supported horizon, risk, and sequence combination finite", () => {
    for (const years of MARKET_JOURNEY_HORIZONS) {
      for (const riskLevel of MARKET_RISK_LEVELS) {
        for (const marketSequence of MARKET_SEQUENCES) {
          const result = simulateMarketJourney({
            ...BASE_INPUT,
            years,
            riskLevel,
            marketSequence,
          });
          expect(Number.isSafeInteger(result.summary.endingValueCents)).toBe(true);
          expect(Number.isSafeInteger(result.summary.realizedMarketCagrBps)).toBe(
            true,
          );
          expect(result.summary.maxDrawdownBps).toBeGreaterThanOrEqual(0);
          expect(result.summary.annualizedVolatilityBps).toBeGreaterThan(0);
        }
      }
    }
  });

  it("keeps the selected drift separate from a near-but-not-forced realized CAGR", () => {
    const result = simulateMarketJourney({ ...BASE_INPUT, years: 1 });

    expect(result.summary.assumedAnnualReturnBps).toBe(600);
    expect(Math.abs(result.summary.realizedMarketCagrBps - 600)).toBeLessThanOrEqual(
      125,
    );
    expect(result.summary.realizedMarketCagrBps).not.toBe(600);
  });

  it("widens volatility and drawdowns at higher risk without raising the drift", () => {
    const lower = simulateMarketJourney({
      ...BASE_INPUT,
      riskLevel: "lower",
      marketSequence: "late-bear",
    });
    const medium = simulateMarketJourney({
      ...BASE_INPUT,
      riskLevel: "medium",
      marketSequence: "late-bear",
    });
    const higher = simulateMarketJourney({
      ...BASE_INPUT,
      riskLevel: "higher",
      marketSequence: "late-bear",
    });

    expect(lower.summary.assumedAnnualReturnBps).toBe(600);
    expect(medium.summary.assumedAnnualReturnBps).toBe(600);
    expect(higher.summary.assumedAnnualReturnBps).toBe(600);
    expect(lower.summary.annualizedVolatilityBps).toBeLessThan(
      medium.summary.annualizedVolatilityBps,
    );
    expect(medium.summary.annualizedVolatilityBps).toBeLessThan(
      higher.summary.annualizedVolatilityBps,
    );
    expect(lower.summary.maxDrawdownBps).toBeLessThan(
      medium.summary.maxDrawdownBps,
    );
    expect(medium.summary.maxDrawdownBps).toBeLessThan(
      higher.summary.maxDrawdownBps,
    );
    // Wider swings make the late-bear result worse; risk is not a reward promise.
    expect(higher.summary.realizedMarketCagrBps).toBeLessThan(
      lower.summary.realizedMarketCagrBps,
    );
  });

  it("does not give the default cycle a better destination for wider swings", () => {
    const lower = simulateMarketJourney({
      ...BASE_INPUT,
      riskLevel: "lower",
      marketSequence: "cycle",
    });
    const medium = simulateMarketJourney({
      ...BASE_INPUT,
      riskLevel: "medium",
      marketSequence: "cycle",
    });
    const higher = simulateMarketJourney({
      ...BASE_INPUT,
      riskLevel: "higher",
      marketSequence: "cycle",
    });

    expect(lower.summary.realizedMarketCagrBps).toBe(
      medium.summary.realizedMarketCagrBps,
    );
    expect(medium.summary.realizedMarketCagrBps).toBe(
      higher.summary.realizedMarketCagrBps,
    );
    expect(lower.summary.annualizedVolatilityBps).toBeLessThan(
      medium.summary.annualizedVolatilityBps,
    );
    expect(medium.summary.annualizedVolatilityBps).toBeLessThan(
      higher.summary.annualizedVolatilityBps,
    );
  });

  it("can end in an unrecovered bear market", () => {
    const result = simulateMarketJourney({
      ...BASE_INPUT,
      years: 1,
      riskLevel: "higher",
      marketSequence: "late-bear",
    });

    expect(result.points.at(-1)?.regime).toBe("bear");
    expect(result.summary.recoveredByEnd).toBe(false);
    expect(result.summary.recoveryWeeks).toBeNull();
    expect(result.summary.currentDrawdownBps).toBeGreaterThan(0);
    expect(result.summary.realizedMarketCagrBps).toBeLessThan(
      result.summary.assumedAnnualReturnBps,
    );
  });

  it("reports recovery timing for a strong-recovery sequence", () => {
    const result = simulateMarketJourney({
      ...BASE_INPUT,
      years: 1,
      riskLevel: "higher",
      marketSequence: "strong-recovery",
    });

    expect(result.points.at(-1)?.regime).toBe("recovery");
    expect(result.summary.recoveredByEnd).toBe(true);
    expect(result.summary.recoveryWeeks).not.toBeNull();
    expect(result.summary.recoveryWeeks).toBeGreaterThan(0);
  });

  it("accounts for every end-of-week DCA contribution in integer cents", () => {
    const result = simulateMarketJourney(BASE_INPUT);
    const expectedContributions = 100_000 + 2_500 * 5 * 52;

    expect(result.summary.totalContributionsCents).toBe(expectedContributions);
    expect(result.points.at(-1)?.cumulativeContributionsCents).toBe(
      expectedContributions,
    );
    expect(result.summary.endingValueCents).toBe(
      result.points.at(-1)?.portfolioValueCents,
    );
    expect(result.summary.growthCents).toBe(
      result.summary.endingValueCents - expectedContributions,
    );
    expect(
      result.points.every(
        (point) =>
          Number.isSafeInteger(point.unitsMicro) &&
          Number.isSafeInteger(point.cashCents) &&
          point.unitsMicro >= 0 &&
          point.cashCents >= 0,
      ),
    ).toBe(true);
    expect(
      result.points.every(
        (point, index) =>
          point.cumulativeContributionsCents ===
          100_000 + 2_500 * index,
      ),
    ).toBe(true);
  });

  it("never creates fractional units without debiting low-cent cash", () => {
    const result = simulateMarketJourney({
      ...BASE_INPUT,
      years: 1,
      startingBalanceCents: 0,
      weeklyContributionCents: 1,
    });

    expect(result.summary.totalContributionsCents).toBe(52);
    expect(result.points.slice(1).every((point) => point.cashCents === 0)).toBe(
      true,
    );
    expect(result.points.at(-1)?.unitsMicro).toBeGreaterThan(0);
  });

  it("handles a lump sum with zero weekly contributions and labels MWRR separately", () => {
    const result = simulateMarketJourney({
      ...BASE_INPUT,
      startingBalanceCents: 1_000_000,
      weeklyContributionCents: 0,
    });

    expect(result.summary.totalContributionsCents).toBe(1_000_000);
    expect(result.points.every((point) => point.contributionCents === 0 || point.week === 0)).toBe(
      true,
    );
    expect(result.summary.moneyWeightedAnnualReturnBps).not.toBeNull();
    expect(
      Math.abs(
        (result.summary.moneyWeightedAnnualReturnBps ?? 0) -
          result.summary.realizedMarketCagrBps,
      ),
    ).toBeLessThanOrEqual(5);
  });

  it("returns a null money-weighted return for a journey with no cash flows", () => {
    const result = simulateMarketJourney({
      ...BASE_INPUT,
      startingBalanceCents: 0,
      weeklyContributionCents: 0,
    });

    expect(result.summary.totalContributionsCents).toBe(0);
    expect(result.summary.endingValueCents).toBe(0);
    expect(result.summary.moneyWeightedAnnualReturnBps).toBeNull();
  });

  it("calculates max drawdown from the visible weekly series", () => {
    const result = simulateMarketJourney({
      ...BASE_INPUT,
      riskLevel: "higher",
    });

    expect(result.summary.maxDrawdownBps).toBe(
      expectedDrawdownBps(result.points),
    );
    expect(result.summary.maxDrawdownBps).toBe(
      Math.max(...result.points.map((point) => point.drawdownBps)),
    );
    expect(result.points.every((point) => point.drawdownBps >= 0)).toBe(true);
  });

  it("shows the deterministic cost of missing the strongest simulated days", () => {
    const result = simulateMarketJourney(BASE_INPUT);
    const comparison = result.summary.timeInMarket;

    expect(comparison.stayedInvestedEndingValueCents).toBe(
      result.summary.endingValueCents,
    );
    expect(comparison.strongestSimulatedDays).toHaveLength(10);
    expect(comparison.strongestSimulatedDays[0].returnBps).toBeGreaterThanOrEqual(
      comparison.strongestSimulatedDays[9].returnBps,
    );
    expect(comparison.missedTop5Days.daysMissed).toBe(5);
    expect(comparison.missedTop10Days.daysMissed).toBe(10);
    expect(comparison.missedTop5Days.endingValueCents).toBeLessThan(
      comparison.stayedInvestedEndingValueCents,
    );
    expect(comparison.missedTop10Days.endingValueCents).toBeLessThan(
      comparison.missedTop5Days.endingValueCents,
    );
    expect(comparison.missedTop5Days.differenceCents).toBe(
      comparison.stayedInvestedEndingValueCents -
        comparison.missedTop5Days.endingValueCents,
    );
    expect(comparison.missedTop10Days.differenceCents).toBe(
      comparison.stayedInvestedEndingValueCents -
        comparison.missedTop10Days.endingValueCents,
    );
  });

  it("rejects unsupported, non-integer, and out-of-range inputs", () => {
    expect(() =>
      simulateMarketJourney({ ...BASE_INPUT, years: 2 as 1 }),
    ).toThrow(DomainValidationError);
    expect(() =>
      simulateMarketJourney({ ...BASE_INPUT, startingBalanceCents: 1.5 }),
    ).toThrow(DomainValidationError);
    expect(() =>
      simulateMarketJourney({ ...BASE_INPUT, weeklyContributionCents: -1 }),
    ).toThrow(DomainValidationError);
    expect(() =>
      simulateMarketJourney({ ...BASE_INPUT, annualReturnBps: -1 }),
    ).toThrow(DomainValidationError);
    expect(() =>
      simulateMarketJourney({
        ...BASE_INPUT,
        riskLevel: "extreme" as "medium",
      }),
    ).toThrow(DomainValidationError);
    expect(() =>
      simulateMarketJourney({ ...BASE_INPUT, seed: -1 }),
    ).toThrow(DomainValidationError);
    expect(() =>
      simulateMarketJourney({
        ...BASE_INPUT,
        marketSequence: "guaranteed" as "cycle",
      }),
    ).toThrow(DomainValidationError);
  });
});
