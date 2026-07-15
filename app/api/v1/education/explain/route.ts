import { EducationExplainRequestSchema } from "../../../../../src/contracts";
import { answerEducationQuestion } from "../../../../../src/server/education";
import {
  apiError,
  jsonResponse,
  noStoreHeaders,
  protectJsonPost,
  readValidatedJson,
} from "../../../../../src/server/http";
import { enforceRateLimit } from "../../../../../src/server/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const protection = protectJsonPost(request);
  if (!protection.ok) return protection.response;

  const rateLimit = await enforceRateLimit(request, "education-explain", {
    limit: 12,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) return rateLimit.response;

  const body = await readValidatedJson(request, EducationExplainRequestSchema);
  if (!body.ok) return body.response;

  const result = await answerEducationQuestion(body.data);
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
