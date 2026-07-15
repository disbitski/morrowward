import { z, type ZodError, type ZodTypeAny } from "zod";
import type { ApiError } from "../contracts";

export const MAX_JSON_BODY_BYTES = 16_384;

export type JsonReadResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

export type RequestProtectionResult =
  | { ok: true }
  | { ok: false; response: Response };

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
} as const;

export function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(JSON_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function apiError(
  status: number,
  code: ApiError["error"]["code"],
  message: string,
  options: {
    issues?: Array<{ path: string; message: string }>;
    headers?: HeadersInit;
  } = {},
): Response {
  const body: ApiError = {
    error: {
      code,
      message,
      ...(options.issues ? { issues: options.issues } : {}),
    },
  };
  return jsonResponse(body, { status, headers: options.headers });
}

function normalizeOrigin(value: string, defaultProtocol = "https:"): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "null") return null;

  const withProtocol = trimmed.includes("://")
    ? trimmed
    : `${defaultProtocol}//${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function requestAllowedOrigins(request: Request): Set<string> {
  const requestUrl = new URL(request.url);
  const origins = new Set<string>([requestUrl.origin]);
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const host = forwardedHost ?? request.headers.get("host")?.trim();
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();

  if (host) {
    const protocol = forwardedProtocol
      ? `${forwardedProtocol.replace(/:$/, "")}:`
      : requestUrl.protocol;
    const forwardedOrigin = normalizeOrigin(host, protocol);
    if (forwardedOrigin) origins.add(forwardedOrigin);
  }

  const configuredOrigins = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ];
  for (const configured of configuredOrigins) {
    if (!configured) continue;
    const origin = normalizeOrigin(configured);
    if (origin) origins.add(origin);
  }

  return origins;
}

/**
 * Protect a state-changing JSON endpoint from browser cross-site requests.
 *
 * Server-to-server callers (including a scheduler) commonly omit Origin and
 * Sec-Fetch-Site, so their absence is allowed. When browsers provide either
 * signal, however, it must describe a same-origin request. Requiring JSON also
 * forces a CORS preflight for cross-origin browser clients.
 */
export function protectJsonPost(request: Request): RequestProtectionResult {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    return {
      ok: false,
      response: apiError(
        415,
        "invalid_request",
        "Content-Type must be application/json.",
        { headers: noStoreHeaders() },
      ),
    };
  }

  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return {
      ok: false,
      response: apiError(
        403,
        "unauthorized",
        "Cross-origin browser requests are not allowed.",
        { headers: noStoreHeaders() },
      ),
    };
  }

  const suppliedOrigin = request.headers.get("origin");
  if (suppliedOrigin) {
    const normalized = normalizeOrigin(suppliedOrigin);
    if (!normalized || !requestAllowedOrigins(request).has(normalized)) {
      return {
        ok: false,
        response: apiError(
          403,
          "unauthorized",
          "Cross-origin browser requests are not allowed.",
          { headers: noStoreHeaders() },
        ),
      };
    }
  }

  return { ok: true };
}

function validationIssues(error: ZodError): Array<{
  path: string;
  message: string;
}> {
  return error.issues.slice(0, 8).map((issue) => ({
    path: issue.path.join(".") || "request",
    message: issue.message,
  }));
}

export async function readValidatedJson<TSchema extends ZodTypeAny>(
  request: Request,
  schema: TSchema,
  maxBytes = MAX_JSON_BODY_BYTES,
): Promise<JsonReadResult<z.output<TSchema>>> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return {
      ok: false,
      response: apiError(
        413,
        "payload_too_large",
        `Request body must be ${maxBytes} bytes or fewer.`,
      ),
    };
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return {
      ok: false,
      response: apiError(400, "invalid_json", "Request body must be valid JSON."),
    };
  }

  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    return {
      ok: false,
      response: apiError(
        413,
        "payload_too_large",
        `Request body must be ${maxBytes} bytes or fewer.`,
      ),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      response: apiError(400, "invalid_json", "Request body must be valid JSON."),
    };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      response: apiError(
        400,
        "invalid_request",
        "Check the request fields and try again.",
        { issues: validationIssues(result.error) },
      ),
    };
  }

  return { ok: true, data: result.data };
}

export function noStoreHeaders(headers: HeadersInit = {}): Headers {
  const result = new Headers(headers);
  result.set("cache-control", "no-store");
  result.set("pragma", "no-cache");
  return result;
}
