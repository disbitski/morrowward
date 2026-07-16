import { EducationExplainRequestSchema } from "../../../../../src/contracts";
import {
  answerPreparedEducationQuestion,
  preflightEducationQuestion,
} from "../../../../../src/server/education";
import {
  apiError,
  jsonResponse,
  noStoreHeaders,
  protectJsonPost,
  readValidatedJson,
} from "../../../../../src/server/http";
import {
  enforceGlobalRateLimit,
  enforceRateLimit,
} from "../../../../../src/server/rate-limit";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60_000;
const DEFAULT_DAILY_EDUCATOR_AI_LIMIT = 100;

function configuredDailyEducatorLimit(): number {
  const raw = process.env.EDUCATOR_DAILY_AI_REQUEST_LIMIT?.trim();
  if (!raw || !/^[1-9][0-9]*$/u.test(raw)) {
    return DEFAULT_DAILY_EDUCATOR_AI_LIMIT;
  }
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed <= 10_000
    ? parsed
    : DEFAULT_DAILY_EDUCATOR_AI_LIMIT;
}

export async function POST(request: Request): Promise<Response> {
  const protection = protectJsonPost(request);
  if (!protection.ok) return protection.response;

  const aiConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());
  const rateLimit = await enforceRateLimit(request, "education-explain", {
    limit: 12,
    windowMs: 60_000,
    failClosed: false,
  });
  if (!rateLimit.ok) return rateLimit.response;

  const body = await readValidatedJson(request, EducationExplainRequestSchema);
  if (!body.ok) return body.response;

  const preflight = preflightEducationQuestion(body.data);
  if (aiConfigured && preflight.kind === "model-eligible") {
    const dailyLimit = await enforceGlobalRateLimit(
      "education-explain-daily",
      {
        limit: configuredDailyEducatorLimit(),
        windowMs: DAY_MS,
        failClosed: true,
      },
    );
    if (!dailyLimit.ok) return dailyLimit.response;
    for (const [name, value] of dailyLimit.headers) {
      rateLimit.headers.set(name, value);
    }
  }

  const result = await answerPreparedEducationQuestion(preflight);
  if (!result.ok) {
    return apiError(
      422,
      "unsafe_input",
      "That request cannot be passed to the educator. Ask a financial-literacy question without instructions to bypass or reveal safeguards.",
      { headers: noStoreHeaders(rateLimit.headers) },
    );
  }

  return jsonResponse(result.response, {
    headers: noStoreHeaders(rateLimit.headers),
  });
}
