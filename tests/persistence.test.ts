import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  CURRENT_STATE_VERSION,
  STATE_EXPORT_FORMAT,
  StateValidationError,
  createDefaultState,
  createMorrowwardStore,
  migrateState,
  parseStateExport,
  serializeStateExport,
} from "../src/data";
import { buySimulatedAsset, createPracticePortfolio } from "../src/domain";

const NOW = "2026-07-15T12:00:00.000Z";
const LATER = "2026-07-15T13:00:00.000Z";
let databaseCounter = 0;

function databaseName(): string {
  databaseCounter += 1;
  return `morrowward-test-${databaseCounter}`;
}

describe("versioned state", () => {
  it("contains no PII fields and uses the agreed integer defaults", () => {
    const state = createDefaultState(NOW);
    expect(state.schemaVersion).toBe(CURRENT_STATE_VERSION);
    expect(state.plan.weeklyContributionCents).toBe(2_500);
    expect(state.plan.annualReturnBps).toBe(600);
    expect(state.plan.annualInflationBps).toBe(300);
    expect(state.profile).toEqual({
      experienceLevel: "new",
      theme: "horizon",
      onboardingComplete: false,
    });
    expect(JSON.stringify(state)).not.toMatch(/email|birthdate|brokerage|credential/i);
  });

  it("round-trips a validated export", () => {
    const state = createDefaultState(NOW);
    state.profile.experienceLevel = "advanced";
    state.profile.theme = "space";
    const serialized = serializeStateExport(state, LATER);
    expect(parseStateExport(serialized, LATER)).toEqual(state);
  });

  it("migrates the supported version-zero shape", () => {
    const migrated = migrateState(
      {
        schemaVersion: 0,
        plan: {
          currentAge: 40,
          targetAge: 70,
          startingBalanceCents: 12_345,
          weeklyContributionCents: 5_000,
          annualReturnBps: 700,
          inflationBps: 250,
        },
        completedWeekKeys: ["2026-W28", "2026-W29"],
      },
      NOW,
    );

    expect(migrated.schemaVersion).toBe(CURRENT_STATE_VERSION);
    expect(migrated.plan.annualInflationBps).toBe(250);
    expect(migrated.habitLog.completedWeekKeys).toEqual([
      "2026-W28",
      "2026-W29",
    ]);
    expect(migrated.profile.theme).toBe("horizon");
  });

  it("imports a version-zero export envelope through migration", () => {
    const serialized = JSON.stringify({
      format: STATE_EXPORT_FORMAT,
      schemaVersion: 0,
      exportedAt: NOW,
      data: {
        schemaVersion: 0,
        plan: {
          currentAge: 30,
          targetAge: 65,
          startingBalanceCents: 0,
          weeklyContributionCents: 1_000,
          annualReturnBps: 600,
          annualInflationBps: 300,
        },
      },
    });
    expect(parseStateExport(serialized, NOW).schemaVersion).toBe(
      CURRENT_STATE_VERSION,
    );
  });

  it("migrates version-one portfolios by adding new assets at zero", () => {
    const current = createDefaultState(NOW);
    const firstBuy = buySimulatedAsset(createPracticePortfolio(100_000), {
      symbol: "VTI",
      amountCents: 12_500,
      priceCents: 100_000,
      occurredAt: NOW,
      transactionId: "v1-vti",
    }).portfolio;
    const legacyPortfolio = buySimulatedAsset(firstBuy, {
      symbol: "BTC",
      amountCents: 12_500,
      priceCents: 500_000,
      occurredAt: LATER,
      transactionId: "v1-btc",
    }).portfolio;
    const migrated = migrateState({
      ...current,
      schemaVersion: 1,
      practicePortfolio: {
        cashCents: legacyPortfolio.cashCents,
        holdingsMicro: {
          VTI: legacyPortfolio.holdingsMicro.VTI,
          BND: 0,
          AAPL: 0,
          TSLA: 0,
          BTC: legacyPortfolio.holdingsMicro.BTC,
          ETH: 0,
        },
        transactions: legacyPortfolio.transactions,
      },
    });

    expect(migrated.schemaVersion).toBe(CURRENT_STATE_VERSION);
    expect(migrated.practicePortfolio.holdingsMicro).toMatchObject({
      VTI: 125_000,
      BTC: 25_000,
      SPCX: 0,
      NVDA: 0,
      MRVL: 0,
      MU: 0,
      AVGO: 0,
    });
  });

  it("rejects imports whose simulated holdings or buy math contradict the ledger", () => {
    const inconsistentHolding = createDefaultState(NOW);
    inconsistentHolding.practicePortfolio.holdingsMicro.VTI = 1;
    expect(() => migrateState(inconsistentHolding, NOW)).toThrow(
      /holding units must match/i,
    );

    const validBuy = buySimulatedAsset(createPracticePortfolio(100_000), {
      symbol: "VTI",
      amountCents: 10_000,
      priceCents: 20_000,
      occurredAt: NOW,
      transactionId: "tamper-check",
    }).portfolio;
    const inconsistentMath = createDefaultState(NOW);
    inconsistentMath.practicePortfolio = validBuy;
    const buy = inconsistentMath.practicePortfolio.transactions[0];
    if (buy.type !== "buy") throw new Error("Expected a buy transaction.");
    buy.unitsMicro += 1;
    inconsistentMath.practicePortfolio.holdingsMicro.VTI += 1;
    expect(() => migrateState(inconsistentMath, NOW)).toThrow(
      /buy units and spend must match/i,
    );

    const impossibleRequest = createDefaultState(NOW);
    impossibleRequest.practicePortfolio = {
      cashCents: 0,
      holdingsMicro: {
        ...impossibleRequest.practicePortfolio.holdingsMicro,
        VTI: 1,
      },
      transactions: [
        {
          id: "requested-more-than-cash",
          type: "buy",
          occurredAt: NOW,
          symbol: "VTI",
          requestedAmountCents: 3,
          spentCents: 2,
          priceCents: 2_000_000,
          unitsMicro: 1,
        },
      ],
    };
    expect(() => migrateState(impossibleRequest, NOW)).toThrow(
      /cannot request more simulated cash/i,
    );
  });

  it("rejects malformed JSON, unknown fields, mismatched versions, and huge files", () => {
    expect(() => parseStateExport("not json", NOW)).toThrow(StateValidationError);

    const stateWithPii = {
      ...createDefaultState(NOW),
      email: "not-accepted@example.test",
    };
    expect(() =>
      parseStateExport(
        JSON.stringify({
          format: STATE_EXPORT_FORMAT,
          schemaVersion: CURRENT_STATE_VERSION,
          exportedAt: NOW,
          data: stateWithPii,
        }),
        NOW,
      ),
    ).toThrow(/invalid/i);

    expect(() =>
      parseStateExport(
        JSON.stringify({
          format: STATE_EXPORT_FORMAT,
          schemaVersion: 0,
          exportedAt: NOW,
          data: createDefaultState(NOW),
        }),
        NOW,
      ),
    ).toThrow(/does not match/);
    expect(() => parseStateExport(" ".repeat(1_000_001), NOW)).toThrow(/1 MB/);
  });
});

describe("MorrowwardStore", () => {
  it("uses a safe in-memory fallback when IndexedDB is unavailable", async () => {
    const store = createMorrowwardStore({
      indexedDB: null,
      IDBKeyRange: null,
      now: () => NOW,
    });
    expect(store.diagnostics).toEqual({
      mode: "memory",
      lastStorageError: null,
    });

    const state = await store.load();
    state.plan.weeklyContributionCents = 7_500;
    await store.save(state);
    state.plan.weeklyContributionCents = 0;
    expect((await store.load()).plan.weeklyContributionCents).toBe(7_500);
  });

  it("persists across store instances like a browser refresh", async () => {
    const name = databaseName();
    const first = createMorrowwardStore({
      databaseName: name,
      indexedDB,
      IDBKeyRange,
      now: () => NOW,
    });
    const state = await first.load();
    state.profile.onboardingComplete = true;
    state.profile.theme = "alchemy";
    state.plan.startingBalanceCents = 987_654;
    await first.save(state);
    await first.dispose();

    const refreshed = createMorrowwardStore({
      databaseName: name,
      indexedDB,
      IDBKeyRange,
      now: () => LATER,
    });
    const loaded = await refreshed.load();
    expect(loaded.profile.onboardingComplete).toBe(true);
    expect(loaded.profile.theme).toBe("alchemy");
    expect(loaded.plan.startingBalanceCents).toBe(987_654);
    expect(refreshed.diagnostics.mode).toBe("indexeddb");
    await refreshed.dispose(true);
  });

  it("exports, imports, and resets through the store API", async () => {
    const store = createMorrowwardStore({
      indexedDB: null,
      IDBKeyRange: null,
      now: () => NOW,
    });
    const state = await store.load();
    state.plan.currentAge = 45;
    state.plan.targetAge = 75;
    await store.save(state);
    const exported = await store.export();

    await store.reset();
    expect((await store.load()).plan.currentAge).toBe(30);
    await store.import(exported);
    expect((await store.load()).plan.currentAge).toBe(45);
  });

  it("does not replace valid memory state when an import fails", async () => {
    const store = createMorrowwardStore({
      indexedDB: null,
      IDBKeyRange: null,
      now: () => NOW,
    });
    const before = await store.load();
    await expect(store.import("{broken")).rejects.toThrow(StateValidationError);
    expect(await store.load()).toEqual(before);
  });

  it("degrades to memory if the IndexedDB implementation throws", async () => {
    const brokenIndexedDB = {
      open() {
        throw new Error("blocked");
      },
    };
    const store = createMorrowwardStore({
      indexedDB: brokenIndexedDB,
      IDBKeyRange,
      now: () => NOW,
    });
    const loaded = await store.load();
    expect(loaded).toEqual(createDefaultState(NOW));
    expect(store.diagnostics.mode).toBe("memory");
    expect(store.diagnostics.lastStorageError).toMatch(/Error$/);
  });
});
