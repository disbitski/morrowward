import { describe, expect, it } from "vitest";
import {
  parseBrief,
  parseEducatorReply,
  quotesResponseToMap,
} from "../app/components/MorrowwardApp";

describe("UI API adapters", () => {
  it("maps a validated educational quote response into integer cents", () => {
    const mapped = quotesResponseToMap({
      quotes: [{
        symbol: "VTI",
        name: "Vanguard Total Stock Market ETF",
        assetType: "etf",
        currency: "USD",
        price: 287.345,
        changePercent: 0,
        asOf: "2026-07-14T20:00:00.000Z",
        source: { name: "Morrowward delayed educational sample", kind: "deterministic-educational-sample" },
        freshness: { status: "delayed-sample", label: "Delayed educational sample", isLive: false },
      }],
      allowlist: ["VTI"],
      generatedAt: "2026-07-15T12:00:00.000Z",
      disclosure: "Educational sample only.",
    });

    expect(mapped?.VTI).toEqual({
      symbol: "VTI",
      priceCents: 28735,
      asOf: "2026-07-14T20:00:00.000Z",
      source: "Morrowward delayed educational sample",
      status: "delayed",
    });
  });

  it("rejects malformed or non-allowlisted quote payloads", () => {
    expect(quotesResponseToMap({ quotes: [{ symbol: "GME" }] })).toBeNull();
  });

  it("preserves educator top-level contract fields and GPT provenance", () => {
    const reply = parseEducatorReply(
      {
        answer: "Top-level answer from the service.",
        assumptions: ["Top-level assumption."],
        nextStep: "Top-level next step.",
        disclosure: "Top-level disclosure.",
        explanation: {
          summary: "Nested summary.",
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
      answer: "Top-level answer from the service.",
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
