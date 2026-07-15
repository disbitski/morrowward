import { z } from "zod";

export const FINANCIAL_EDUCATION_DISCLOSURE =
  "Morrowward is an educational simulation, not financial, investment, tax, or legal advice. Illustrations are not forecasts or guarantees. You are responsible for your decisions; consider a qualified professional for guidance about your circumstances.";

export const API_ERROR_CODES = [
  "invalid_json",
  "invalid_request",
  "payload_too_large",
  "unsafe_input",
  "rate_limited",
  "unauthorized",
  "method_not_allowed",
  "service_unavailable",
] as const;

export const ApiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.enum(API_ERROR_CODES),
        message: z.string(),
        issues: z
          .array(
            z
              .object({
                path: z.string(),
                message: z.string(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict(),
  })
  .strict();

export type ApiError = z.infer<typeof ApiErrorSchema>;
