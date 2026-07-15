import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buySimulatedAsset,
  calculateProjection,
  createPracticePortfolio,
  valuePracticePortfolio,
  type EducationalQuoteMap,
} from "../src/domain";

const NOW = "2026-07-15T12:00:00.000Z";

describe("finance properties", () => {
  it("zero-return projections equal the start plus every contribution", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 18, max: 80 }),
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (currentAge, years, startingBalanceCents, weeklyContributionCents) => {
          const result = calculateProjection({
            currentAge,
            targetAge: currentAge + years,
            startingBalanceCents,
            weeklyContributionCents,
            annualReturnBps: 0,
            annualInflationBps: 0,
          });
          expect(result.nominalFutureValueCents).toBe(
            startingBalanceCents + weeklyContributionCents * years * 52,
          );
          expect(result.estimatedGrowthCents).toBe(0);
        },
      ),
      { numRuns: 250 },
    );
  });

  it("more contribution or a higher nonnegative illustration never lowers value", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 18, max: 70 }),
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 2_000 }),
        fc.integer({ min: 0, max: 2_000 }),
        (
          currentAge,
          years,
          start,
          contributionA,
          contributionDelta,
          rateA,
          rateDelta,
        ) => {
          const base = {
            currentAge,
            targetAge: currentAge + years,
            startingBalanceCents: start,
            annualInflationBps: 300,
          };
          const lower = calculateProjection({
            ...base,
            weeklyContributionCents: contributionA,
            annualReturnBps: rateA,
          });
          const moreContribution = calculateProjection({
            ...base,
            weeklyContributionCents: contributionA + contributionDelta,
            annualReturnBps: rateA,
          });
          const higherRate = calculateProjection({
            ...base,
            weeklyContributionCents: contributionA,
            annualReturnBps: Math.min(5_000, rateA + rateDelta),
          });

          expect(moreContribution.nominalFutureValueCents).toBeGreaterThanOrEqual(
            lower.nominalFutureValueCents,
          );
          expect(higherRate.nominalFutureValueCents).toBeGreaterThanOrEqual(
            lower.nominalFutureValueCents,
          );
        },
      ),
      { numRuns: 250 },
    );
  });

  it("nonnegative inflation never increases displayed buying power", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 18, max: 70 }),
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: -2_000, max: 2_000 }),
        fc.integer({ min: 0, max: 2_000 }),
        (currentAge, years, start, weekly, annualReturnBps, inflation) => {
          const result = calculateProjection({
            currentAge,
            targetAge: currentAge + years,
            startingBalanceCents: start,
            weeklyContributionCents: weekly,
            annualReturnBps,
            annualInflationBps: inflation,
          });
          expect(result.inflationAdjustedFutureValueCents).toBeLessThanOrEqual(
            result.nominalFutureValueCents,
          );
        },
      ),
      { numRuns: 250 },
    );
  });

  it("simulated buys never overdraw cash and valuations reconcile", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),
        fc.integer({ min: 1, max: 10_000_000 }),
        (cashCents, rawPriceCents) => {
          // Ensure a one-micro-unit order is representable for every generated case.
          const priceCents = Math.min(rawPriceCents, cashCents * 1_000_000);
          const result = buySimulatedAsset(createPracticePortfolio(cashCents), {
            symbol: "VTI",
            amountCents: cashCents,
            priceCents,
            occurredAt: NOW,
            transactionId: "property-buy",
          });
          expect(result.transaction.spentCents).toBeLessThanOrEqual(cashCents);
          expect(result.portfolio.cashCents).toBeGreaterThanOrEqual(0);
          expect(result.portfolio.holdingsMicro.VTI).toBeGreaterThan(0);

          const quotes: EducationalQuoteMap = {
            VTI: {
              symbol: "VTI",
              priceCents,
              asOf: NOW,
              source: "fixture",
              status: "fresh",
            },
          };
          const valuation = valuePracticePortfolio(result.portfolio, quotes);
          expect(valuation.totalValueCents).toBe(
            valuation.cashCents + valuation.investedValueCents,
          );
          const allocationTotal =
            valuation.cashAllocationBps +
              valuation.holdings.reduce(
                (sum, holding) => sum + holding.portfolioAllocationBps,
                0,
              );
          expect(allocationTotal).toBe(
            valuation.totalValueCents === 0 ? 0 : 10_000,
          );
        },
      ),
      { numRuns: 250 },
    );
  });
});
