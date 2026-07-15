import type { ZodType } from "zod";

export const OPENAI_MODEL = "gpt-5.6";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_RESPONSE_BYTES = 64_000;

export type OpenAIFailureReason =
  | "not_configured"
  | "timeout"
  | "network_error"
  | "api_error"
  | "invalid_response"
  | "refusal";

export type StructuredResponseResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: OpenAIFailureReason };

type ResponsesApiPayload = {
  output_text?: unknown;
  output?: unknown;
};

function extractOutputText(payload: ResponsesApiPayload): string | null {
  if (typeof payload.output_text === "string") return payload.output_text;
  if (!Array.isArray(payload.output)) return null;

  const pieces: string[] = [];
  for (const item of payload.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const typedPart = part as { type?: unknown; text?: unknown };
      if (typedPart.type === "refusal") return null;
      if (typedPart.type === "output_text" && typeof typedPart.text === "string") {
        pieces.push(typedPart.text);
      }
    }
  }
  return pieces.length ? pieces.join("") : null;
}

export async function requestStructuredResponse<T>(options: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  instructions: string;
  input: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  validator: ZodType<T>;
  timeoutMs?: number;
  maxOutputTokens?: number;
}): Promise<StructuredResponseResult<T>> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) return { ok: false, reason: "not_configured" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);

  let raw: string;
  try {
    const response = await (options.fetchImpl ?? fetch)(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        store: false,
        instructions: options.instructions,
        input: options.input,
        max_output_tokens: options.maxOutputTokens ?? 1_200,
        text: {
          format: {
            type: "json_schema",
            name: options.schemaName,
            strict: true,
            schema: options.jsonSchema,
          },
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, reason: "api_error" };
    raw = await response.text();
  } catch (error) {
    return {
      ok: false,
      reason:
        controller.signal.aborted ||
        (error instanceof Error && error.name === "AbortError")
          ? "timeout"
          : "network_error",
    };
  } finally {
    clearTimeout(timeout);
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) {
    return { ok: false, reason: "invalid_response" };
  }

  let payload: ResponsesApiPayload;
  try {
    payload = JSON.parse(raw) as ResponsesApiPayload;
  } catch {
    return { ok: false, reason: "invalid_response" };
  }

  const outputText = extractOutputText(payload);
  if (!outputText) return { ok: false, reason: "refusal" };

  let candidate: unknown;
  try {
    candidate = JSON.parse(outputText);
  } catch {
    return { ok: false, reason: "invalid_response" };
  }

  const validated = options.validator.safeParse(candidate);
  return validated.success
    ? { ok: true, value: validated.data }
    : { ok: false, reason: "invalid_response" };
}
