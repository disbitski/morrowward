import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BRIEF_ASSET_IDS,
  type BriefGeneration,
} from "../src/contracts";
import {
  BRIEF_REQUEST_TIMEOUT_MS,
  refreshDailyBrief,
  resetBriefCacheForTests,
} from "../src/server/briefs";

const NOW = new Date("2026-07-16T17:00:00.000Z");
const MARKET_SOURCE = "https://example.com/markets";
const ASSET_SOURCE = "https://example.com/frontier-assets";
const SPCX_SOURCE = "https://www.nasdaq.com/market-activity/stocks/spcx";
const FED_SOURCE =
  "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";
const SEARCH_SOURCES = [MARKET_SOURCE, ASSET_SOURCE, SPCX_SOURCE, FED_SOURCE];

function candidate(): BriefGeneration {
  return {
    headline: "Verified signals for a long-horizon learning scenario",
    asOf: "2026-07-16T13:00:00-04:00",
    marketSession: "open",
    sentimentLabel: "neutral",
    sections: {
      marketAndSentiment: {
        sentences: [{
          text: "At the supplied time, verified market data placed the U.S. session in its open phase.",
          classification: "verified-fact",
          citations: [{ title: "Market observations", url: MARKET_SOURCE }],
        }],
      },
      frontierAssets: {
        sentences: [{
          text: "Semiconductor and digital-asset observations varied across the cited sources.",
          classification: "interpretation",
          citations: [{ title: "Frontier observations", url: ASSET_SOURCE }],
        }],
      },
      learningLensAndFedWatch: {
        sentences: [
          {
            text: "The fixed $100,000 learning scenario illustrates how concentration and volatility can interact over a long horizon.",
            classification: "interpretation",
            citations: [{ title: "Frontier observations", url: ASSET_SOURCE }],
          },
          {
            text: "The next cited FOMC decision date is July 29, 2026.",
            classification: "verified-fact",
            citations: [{ title: "Federal Reserve calendar", url: FED_SOURCE }],
          },
        ],
      },
    },
    assetChecks: BRIEF_ASSET_IDS.map((assetId) => ({
      assetId,
      status: "verified" as const,
      identity:
        assetId === "SPCX"
          ? "Space Exploration Technologies Corp. Class A"
          : `${assetId} verified identity`,
      sourceUrl: assetId === "SPCX" ? SPCX_SOURCE : ASSET_SOURCE,
    })),
    fedEvents: [{
      kind: "fomc-decision",
      date: "2026-07-29",
      timeEt: "2:00 p.m. ET",
      title: "FOMC decision",
      sourceUrl: FED_SOURCE,
    }],
    uncertainty: ["Intraday conditions can change after publication."],
  };
}

function responsesPayload(
  generation: BriefGeneration,
  sourceUrls = SEARCH_SOURCES,
  providerCitationUrls: string[] = [],
  annotationIndexDelta = 0,
): unknown {
  const outputText = JSON.stringify(generation);
  return {
    status: "completed",
    output: [
      {
        type: "web_search_call",
        status: "completed",
        action: {
          sources: sourceUrls.map((url) => ({ url })),
        },
      },
      {
        type: "message",
        status: "completed",
        content: [{
          type: "output_text",
          text: outputText,
          annotations: providerCitationUrls.map((url) => {
            const start = outputText.indexOf(url) + annotationIndexDelta;
            return {
              type: "url_citation",
              url,
              title: "Provider citation",
              start_index: start,
              end_index: start + url.length,
            };
          }),
        }],
      },
    ],
  };
}

describe.sequential("sourced daily briefing generation", () => {
  beforeEach(() => {
    resetBriefCacheForTests();
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("uses GPT-5.6 web search and emits the fixed three-section $100K edition", async () => {
    const fetchImpl = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => {
      void _input;
      void _init;
      return new Response(JSON.stringify(responsesPayload(candidate())), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const brief = await refreshDailyBrief({
      apiKey: "test-api-key",
      fetchImpl,
      now: NOW,
    });

    expect(brief.sections.map((section) => section.id)).toEqual([
      "market-and-sentiment",
      "frontier-assets",
      "learning-lens-and-fed-watch",
    ]);
    expect(brief.sections.every((section) => section.sources.length > 0)).toBe(true);
    expect(brief.generatedAt).toBe(NOW.toISOString());
    expect(brief.scenarioBalanceUsd).toBe(100_000);
    expect(brief.meta).toEqual({
      mode: "ai",
      model: "gpt-5.6",
      source: "OpenAI web search",
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const request = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(request).toMatchObject({
      model: "gpt-5.6",
      store: false,
      tool_choice: "required",
      max_tool_calls: 4,
      max_output_tokens: 6_000,
      tools: [{
        type: "web_search",
        search_context_size: "medium",
        external_web_access: true,
      }],
      text: {
        format: {
          type: "json_schema",
          name: "morrowward_web_daily_brief",
          strict: true,
        },
      },
    });
    expect(JSON.parse(String(request.input))).toMatchObject({
      hypotheticalScenarioBalanceUsd: 100_000,
      timeZone: "America/New_York",
    });
    expect(String(request.input)).not.toMatch(/holdings|account|birthdate/iu);
    expect(BRIEF_REQUEST_TIMEOUT_MS).toBe(150_000);
  });

  it("rejects a displayed claim whose citation was not returned by web search", async () => {
    const unsupported = candidate();
    unsupported.sections.marketAndSentiment.sentences[0].citations[0].url =
      "https://unsupported.example/claim";
    const fetchImpl = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => {
      void _input;
      void _init;
      return new Response(JSON.stringify(responsesPayload(unsupported)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await expect(
      refreshDailyBrief({
        apiKey: "test-api-key",
        fetchImpl,
        now: NOW,
      }),
    ).rejects.toMatchObject({
      reason: "invalid_response",
      diagnostic: "section_citation_unsupported",
      diagnosticDetails: expect.arrayContaining([
        "citation:unsupported.example/claim",
        "search_sources:4",
        "provider_citations:0",
        "same_origin_sources:0",
      ]),
    });
  });

  it("accepts the same searched page after removing only tracking parameters", async () => {
    const fetchImpl = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => {
      void _input;
      void _init;
      return new Response(JSON.stringify(responsesPayload(candidate(), [
        `${MARKET_SOURCE}/?utm_source=chatgpt.com&utm_medium=referral`,
        ASSET_SOURCE,
        SPCX_SOURCE,
        FED_SOURCE,
      ])), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await expect(
      refreshDailyBrief({
        apiKey: "test-api-key",
        fetchImpl,
        now: NOW,
      }),
    ).resolves.toMatchObject({
      generatedAt: NOW.toISOString(),
      meta: { mode: "ai" },
    });
  });

  it("accepts a provider URL citation attached to the structured output", async () => {
    const annotated = candidate();
    const providerUrl = "https://example.com/provider-cited-market";
    annotated.sections.marketAndSentiment.sentences[0].citations[0].url =
      providerUrl;
    const fetchImpl = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => {
      void _input;
      void _init;
      return new Response(JSON.stringify(responsesPayload(
        annotated,
        SEARCH_SOURCES,
        [providerUrl],
      )), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await expect(
      refreshDailyBrief({
        apiKey: "test-api-key",
        fetchImpl,
        now: NOW,
      }),
    ).resolves.toMatchObject({
      generatedAt: NOW.toISOString(),
      meta: { mode: "ai" },
    });
  });

  it("rejects an out-of-bounds provider citation annotation", async () => {
    const annotated = candidate();
    const providerUrl = "https://example.com/malformed-provider-citation";
    annotated.sections.marketAndSentiment.sentences[0].citations[0].url =
      providerUrl;
    const fetchImpl = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => {
      void _input;
      void _init;
      return new Response(JSON.stringify(responsesPayload(
        annotated,
        SEARCH_SOURCES,
        [providerUrl],
        1_000_000,
      )), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await expect(
      refreshDailyBrief({
        apiKey: "test-api-key",
        fetchImpl,
        now: NOW,
      }),
    ).rejects.toMatchObject({ reason: "invalid_response" });
  });

  it("rejects a citation when a meaningful query selects different evidence", async () => {
    const differentQuery = candidate();
    differentQuery.sections.marketAndSentiment.sentences[0].citations[0].url =
      `${MARKET_SOURCE}?period=1d`;
    const fetchImpl = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => {
      void _input;
      void _init;
      return new Response(JSON.stringify(responsesPayload(differentQuery, [
        `${MARKET_SOURCE}?period=5d&utm_source=chatgpt.com`,
        ASSET_SOURCE,
        SPCX_SOURCE,
        FED_SOURCE,
      ])), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await expect(
      refreshDailyBrief({
        apiKey: "test-api-key",
        fetchImpl,
        now: NOW,
      }),
    ).rejects.toMatchObject({ reason: "invalid_response" });
  });
});
