import { OPENAI_MODEL } from "../../../../src/server/openai";
import { hasDurableBriefStore } from "../../../../src/server/brief-store";
import { jsonResponse, noStoreHeaders } from "../../../../src/server/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return jsonResponse(
    {
      status: "ok",
      service: "morrowward-api",
      version: "v1",
      ai: {
        configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
        model: OPENAI_MODEL,
      },
      quotes: {
        mode: "deterministic-delayed-sample",
        live: false,
      },
      briefs: {
        durableStoreConfigured: hasDurableBriefStore(),
        fallbackAvailable: true,
      },
      privacy: "local-first; no personal plan or holdings data is persisted by this API",
      timestamp: new Date().toISOString(),
    },
    { headers: noStoreHeaders() },
  );
}
