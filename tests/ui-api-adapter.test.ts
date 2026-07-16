import { describe, expect, it } from "vitest";
import {
  marketQuotesToPracticeAssets,
  parseBrief,
  parseEducatorReply,
  quotesResponseToMap,
  quotesResponseToMarketQuotes,
  shouldRecheckDailyMarketSnapshot,
} from "../app/components/MorrowwardApp";
import {
  formatSnapshotAge,
  marketSourcePresentation,
} from "../app/components/PracticeMarketPanel";
import { resolveMarketBalanceSource } from "../app/components/MarketJourney";

describe("UI API adapters", () => {
  it("rechecks only configured missing or stale daily market snapshots", () => {
    const now = Date.parse("2026-07-15T18:00:00.000Z");
    expect(shouldRecheckDailyMarketSnapshot({
      configured: false,
      lastSuccessfulUpdate: null,
    }, now)).toBe(false);
    expect(shouldRecheckDailyMarketSnapshot({
      configured: true,
      lastSuccessfulUpdate: null,
    }, now)).toBe(true);
    expect(shouldRecheckDailyMarketSnapshot({
      configured: true,
      lastSuccessfulUpdate: "2026-07-15T17:00:00.000Z",
    }, now)).toBe(false);
    expect(shouldRecheckDailyMarketSnapshot({
      configured: true,
      lastSuccessfulUpdate: "2026-07-14T17:59:59.000Z",
    }, now)).toBe(true);
  });

  it("maps a validated educational quote response into integer cents", () => {
    const payload = {
      quotes: [{
        symbol: "VTI",
        name: "Vanguard Total Stock Market ETF",
        assetType: "etf",
        currency: "USD",
        price: 287.345,
        change: 1.25,
        changePercent: 0,
        changeBasis: "previous-close",
        asOf: "2026-07-14T20:00:00.000Z",
        observedAt: "2026-07-14T20:00:00.000Z",
        observedAtKind: "sample",
        mode: "sample",
        marketStatus: "unknown",
        source: {
          name: "Morrowward synthetic educational sample",
          kind: "deterministic-educational-sample",
          url: "https://github.com/disbitski/morrowward",
        },
        freshness: {
          status: "sample",
          label: "Synthetic educational sample",
          isLive: false,
          ageSeconds: null,
        },
        profile: {
          category: "Broad U.S. equity ETF",
          educationalRisk: "medium",
          summary: "A broad educational fund example.",
          learnMoreUrl: "https://investor.vanguard.com/investment-products/etfs/profile/vti",
        },
        history: {
          range: "1y",
          interval: "1week",
          points: [
            { date: "2025-07-14", close: 250 },
            { date: "2026-07-14", close: 287.345 },
          ],
          priceChangePercent: 14.938,
          startDate: "2025-07-14",
          endDate: "2026-07-14",
          limited: false,
          mode: "sample",
          source: {
            name: "Morrowward synthetic educational sample",
            kind: "deterministic-educational-sample",
            url: "https://github.com/disbitski/morrowward",
          },
        },
      }],
      allowlist: ["VTI"],
      generatedAt: "2026-07-15T12:00:00.000Z",
      provider: {
        name: null,
        configured: false,
        status: "not-configured",
        succeededSymbols: [],
        fallbackSymbols: ["VTI"],
        lastSuccessfulUpdate: null,
      },
      disclosure: "Educational sample only.",
    };
    const mapped = quotesResponseToMap(payload);

    expect(mapped?.VTI).toEqual({
      symbol: "VTI",
      priceCents: 28735,
      asOf: "2026-07-14T20:00:00.000Z",
      source: "Morrowward synthetic educational sample",
      status: "delayed",
    });

    const market = quotesResponseToMarketQuotes(payload);
    expect(market).not.toBeNull();
    const panelAssets = marketQuotesToPracticeAssets(market ?? {});
    expect(panelAssets).toHaveLength(11);
    expect(panelAssets[0]).toMatchObject({
      symbol: "VTI",
      category: "Broad U.S. equity ETF",
      educationalRisk: { level: "medium" },
      quote: {
        priceCents: 28735,
        change1dLabel: "Sample 1D",
        change1yBps: 1494,
        change1yLabel: "Sample 1Y",
        freshness: "sample",
        sourceKind: "deterministic-educational-sample",
      },
      history: {
        kind: "synthetic",
        points: [
          { timestamp: "2025-07-14T00:00:00.000Z", priceCents: 25000 },
          { timestamp: "2026-07-14T00:00:00.000Z", priceCents: 28735 },
        ],
      },
    });
    expect(marketSourcePresentation(panelAssets, "success")).toEqual({
      label: "Daily Price Refresh",
      mode: "practice",
    });

    const webSourcedAssets = panelAssets.map((asset) => ({
      ...asset,
      quote: {
        ...asset.quote,
        sourceKind: "openai-web-search" as const,
        freshness: "fresh" as const,
      },
    }));
    expect(marketSourcePresentation(
      webSourcedAssets,
      "success",
      "2026-07-15T16:01:30.000Z",
    )).toEqual({
      label: "Real Prices Updated Every 24 Hours",
      mode: "search",
    });
    expect(marketSourcePresentation(webSourcedAssets, "error")).toEqual({
      label: "Daily Price Refresh",
      mode: "standard",
    });
    expect(marketSourcePresentation(
      [webSourcedAssets[0], ...panelAssets.slice(1)],
      "success",
      "2026-07-15T16:01:30.000Z",
    )).toEqual({
      label: "Real Prices Updated Every 24 Hours",
      mode: "mixed",
    });
  });

  it("describes daily snapshot age in completed hours without clock-skew negatives", () => {
    const updatedAt = "2026-07-15T16:00:00.000Z";
    expect(formatSnapshotAge(null, Date.parse(updatedAt))).toBeNull();
    expect(formatSnapshotAge("not-a-date", Date.parse(updatedAt))).toBeNull();
    expect(formatSnapshotAge(updatedAt, Number.NaN)).toBeNull();
    expect(formatSnapshotAge(updatedAt, Date.parse("2026-07-15T15:00:00.000Z")))
      .toBe("less than 1 hour ago");
    expect(formatSnapshotAge(updatedAt, Date.parse("2026-07-15T16:59:59.000Z")))
      .toBe("less than 1 hour ago");
    expect(formatSnapshotAge(updatedAt, Date.parse("2026-07-15T17:00:00.000Z")))
      .toBe("1 hour ago");
    expect(formatSnapshotAge(updatedAt, Date.parse("2026-07-16T15:00:00.000Z")))
      .toBe("23 hours ago");
    expect(formatSnapshotAge(updatedAt, Date.parse("2026-07-16T16:00:00.000Z")))
      .toBe("24 hours ago");
  });

  it("defaults the journey to a funded practice portfolio without overriding sample choice", () => {
    expect(resolveMarketBalanceSource(null, 0)).toBe("sample");
    expect(resolveMarketBalanceSource(null, 1)).toBe("practice");
    expect(resolveMarketBalanceSource("sample", 100_000)).toBe("sample");
    expect(resolveMarketBalanceSource("practice", 100_000)).toBe("practice");
    expect(resolveMarketBalanceSource("practice", 0)).toBe("sample");
  });

  it("rejects malformed or non-allowlisted quote payloads", () => {
    expect(quotesResponseToMap({ quotes: [{ symbol: "GME" }] })).toBeNull();
  });

  it("preserves OpenAI market provenance and clickable web citations", () => {
    const payload = {
      quotes: [{
        symbol: "VTI",
        name: "Vanguard Total Stock Market ETF",
        assetType: "etf",
        currency: "USD",
        price: 301.25,
        change: 1.25,
        changePercent: 0.42,
        changeBasis: "previous-close",
        asOf: "2026-07-15T16:00:00.000Z",
        observedAt: "2026-07-15T16:00:00.000Z",
        observedAtKind: "provider",
        mode: "delayed",
        marketStatus: "open",
        source: {
          name: "OpenAI web search",
          kind: "openai-web-search",
          citations: [{
            title: "VTI market page",
            url: "https://example.com/markets/vti",
          }],
        },
        freshness: {
          status: "fresh",
          label: "Current market observation",
          isLive: false,
          ageSeconds: 90,
        },
        profile: {
          category: "Broad U.S. equity ETF",
          educationalRisk: "medium",
          summary: "A broad educational fund example.",
          learnMoreUrl: "https://investor.vanguard.com/investment-products/etfs/profile/vti",
        },
      }],
      allowlist: ["VTI"],
      generatedAt: "2026-07-15T16:01:30.000Z",
      provider: {
        name: "OpenAI web search",
        configured: true,
        status: "ok",
        succeededSymbols: ["VTI"],
        fallbackSymbols: [],
        lastSuccessfulUpdate: "2026-07-15T16:01:30.000Z",
      },
      disclosure: "Educational market context only.",
    };

    const market = quotesResponseToMarketQuotes(payload);
    expect(market).not.toBeNull();
    const asset = marketQuotesToPracticeAssets(market ?? {})[0];
    expect(asset.quote).toMatchObject({
      sourceName: "OpenAI web search",
      sourceUrl: undefined,
      sourceKind: "openai-web-search",
      sourceCitations: [{
        title: "VTI market page",
        url: "https://example.com/markets/vti",
      }],
      freshness: "fresh",
    });
  });

  it("preserves educator top-level contract fields and GPT provenance", () => {
    const reply = parseEducatorReply(
      {
        answer: "Top-level answer from the service.",
        assumptions: ["Top-level assumption."],
        nextStep: "Top-level next step.",
        disclosure: "Top-level disclosure.",
        explanation: {
          title: "Compounding explained",
          summary: "Nested summary.",
          keyPoints: ["Time matters.", "Returns remain uncertain."],
          assumptions: ["Nested assumption."],
          tryNext: ["Nested next step."],
        },
        meta: {
          mode: "ai",
          model: "gpt-5.6",
          requestId: "request-123",
          generatedAt: "2026-07-15T12:00:00.000Z",
        },
      },
      "Explain compounding",
    );

    expect(reply).toMatchObject({
      title: "Compounding explained",
      answer: "Top-level answer from the service.",
      keyPoints: ["Time matters.", "Returns remain uncertain."],
      assumptions: ["Top-level assumption."],
      nextStep: "Top-level next step.",
      disclosure: "Top-level disclosure.",
      meta: {
        mode: "ai",
        model: "gpt-5.6",
        requestId: "request-123",
        generatedAt: "2026-07-15T12:00:00.000Z",
      },
    });
  });

  it("marks missing or explicit fallback educator metadata as deterministic", () => {
    const explicit = parseEducatorReply(
      {
        answer: "Deterministic explanation.",
        assumptions: [],
        nextStep: "Compare scenarios.",
        disclosure: "Educational only.",
        meta: { mode: "fallback", model: null },
      },
      "Explain risk",
    );
    const legacy = parseEducatorReply(
      { answer: "Legacy explanation." },
      "Explain risk",
    );
    expect(explicit.meta.mode).toBe("fallback");
    expect(legacy.meta.mode).toBe("fallback");
    expect(legacy.meta.model).toBeNull();
  });

  it("keeps uncertainty arrays and delayed fact provenance from a brief", () => {
    const brief = parseBrief({
      headline: "Read the snapshot carefully",
      facts: ["A fixed sample moved in both directions."],
      factDetails: [
        {
          fact: "A fixed sample moved in both directions.",
          source: "Morrowward delayed educational sample",
          asOf: "2026-07-14T20:00:00.000Z",
          freshness: "delayed-sample",
        },
      ],
      sentiment: "Mixed.",
      uncertainty: ["One snapshot is not a trend.", "Current news is omitted."],
      takeaway: "Separate facts from stories.",
      generatedAt: "2026-07-15T12:00:00.000Z",
      meta: {
        mode: "ai",
        model: "gpt-5.6",
        source: "Morrowward delayed educational sample",
      },
    });

    expect(brief.uncertainty).toEqual([
      "One snapshot is not a trend.",
      "Current news is omitted.",
    ]);
    expect(brief.factDetails).toHaveLength(1);
    expect(brief.provenance).toEqual({
      mode: "ai",
      model: "gpt-5.6",
      source: "Morrowward delayed educational sample",
      freshness: "delayed",
    });
  });

  it("never treats a deterministic brief as fresh", () => {
    const brief = parseBrief({
      headline: "Deterministic edition",
      facts: ["Educational fact."],
      factDetails: [
        {
          fact: "Educational fact.",
          source: "Fixture",
          asOf: "2026-07-15T12:00:00.000Z",
          freshness: "fresh",
        },
      ],
      sentiment: "Mixed.",
      uncertainty: ["Outcomes remain uncertain."],
      takeaway: "Keep learning.",
      generatedAt: "2026-07-15T12:00:00.000Z",
      meta: { mode: "fallback", model: null, source: "Fixture" },
    });

    expect(brief.provenance.mode).toBe("fallback");
    expect(brief.provenance.freshness).toBe("unknown");
  });
});
