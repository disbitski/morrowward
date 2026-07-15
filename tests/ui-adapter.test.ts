import { describe, expect, it } from "vitest";
import { appDataToState, stateToAppData } from "../app/components/MorrowwardApp";
import { buySimulatedAsset, depositWeeklyContribution } from "../src/domain";
import {
  createDefaultState,
  parseStateExport,
  serializeStateExport,
} from "../src/data";

const NOW = "2026-07-15T12:00:00.000Z";

describe("Morrowward UI persistence adapter", () => {
  it("round-trips the complete canonical plan and local preferences", () => {
    const canonical = createDefaultState(NOW);
    canonical.profile.onboardingComplete = true;
    canonical.profile.experienceLevel = "advanced";
    canonical.profile.theme = "alchemy";
    canonical.plan.startingBalanceCents = 123_456;

    const roundTrip = appDataToState(stateToAppData(canonical), NOW);
    expect(roundTrip).toEqual(canonical);
  });

  it("preserves precise micro-unit holdings through UI and export adapters", () => {
    const canonical = createDefaultState(NOW);
    const funded = depositWeeklyContribution(
      canonical.practicePortfolio,
      2_500,
      { occurredAt: NOW, transactionId: "deposit-test" },
    );
    canonical.practicePortfolio = buySimulatedAsset(funded, {
      symbol: "BTC",
      amountCents: 2_500,
      priceCents: 10_842_000,
      occurredAt: NOW,
      transactionId: "buy-test",
    }).portfolio;

    const ui = stateToAppData(canonical);
    const serialized = serializeStateExport(appDataToState(ui, NOW), NOW);
    const restored = parseStateExport(serialized, NOW);
    expect(restored.practicePortfolio.holdingsMicro.BTC).toBe(
      canonical.practicePortfolio.holdingsMicro.BTC,
    );
    expect(restored.practicePortfolio.transactions).toEqual(
      canonical.practicePortfolio.transactions,
    );
  });

  it("drops unknown UI properties instead of persisting possible PII", () => {
    const ui = stateToAppData(createDefaultState(NOW)) as ReturnType<
      typeof stateToAppData
    > & { email?: string };
    ui.email = "not-persisted@example.test";
    const canonical = appDataToState(ui, NOW);
    expect(JSON.stringify(canonical)).not.toContain("not-persisted@example.test");
    expect(canonical).not.toHaveProperty("email");
  });
});
