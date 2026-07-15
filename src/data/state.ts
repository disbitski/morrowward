import { z } from "zod";
import {
  MAX_ANNUAL_INFLATION_BPS,
  MAX_ANNUAL_RATE_BPS,
  MAX_CURRENT_AGE,
  MAX_SAFE_CENTS,
  MAX_TARGET_AGE,
  MIN_ANNUAL_RATE_BPS,
  MIN_CURRENT_AGE,
  PRACTICE_ASSET_SYMBOLS,
  createHabitLog,
  createPracticePortfolio,
  normalizeHabitLog,
  validatePracticePortfolio,
  validateProjectionInput,
  type HabitLog,
  type PracticePortfolio,
  type ProjectionInput,
} from "../domain";

export const CURRENT_STATE_VERSION = 2 as const;
export const STATE_EXPORT_FORMAT = "morrowward-state" as const;
export const MAX_IMPORT_BYTES = 1_000_000;

export type ExperienceLevel = "new" | "familiar" | "advanced";
export type ThemeId = "dawn" | "horizon" | "alchemy" | "space";

export interface LocalProfile {
  experienceLevel: ExperienceLevel;
  theme: ThemeId;
  onboardingComplete: boolean;
}

/**
 * The complete persisted model. It intentionally has no name, email, account,
 * birthdate, brokerage credential, or other personally identifying field.
 */
export interface MorrowwardState {
  schemaVersion: typeof CURRENT_STATE_VERSION;
  profile: LocalProfile;
  plan: ProjectionInput;
  practicePortfolio: PracticePortfolio;
  habitLog: HabitLog;
  updatedAt: string;
}

export interface StateExportEnvelope {
  format: typeof STATE_EXPORT_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  data: unknown;
}

export class StateValidationError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = "StateValidationError";
    this.issues = issues;
  }
}

const safeInteger = z.number().int().finite().safe();
const centsSchema = safeInteger.min(0).max(MAX_SAFE_CENTS);
const isoDateTimeSchema = z.string().max(64).datetime({ offset: true });
const transactionIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/);

const planSchema = z
  .object({
    currentAge: safeInteger.min(MIN_CURRENT_AGE).max(MAX_CURRENT_AGE),
    targetAge: safeInteger.min(MIN_CURRENT_AGE + 1).max(MAX_TARGET_AGE),
    startingBalanceCents: centsSchema,
    weeklyContributionCents: centsSchema,
    annualReturnBps: safeInteger
      .min(MIN_ANNUAL_RATE_BPS)
      .max(MAX_ANNUAL_RATE_BPS),
    annualInflationBps: safeInteger
      .min(MIN_ANNUAL_RATE_BPS)
      .max(MAX_ANNUAL_INFLATION_BPS),
  })
  .strict()
  .refine((plan) => plan.targetAge > plan.currentAge, {
    path: ["targetAge"],
    message: "targetAge must be greater than currentAge",
  });

const holdingsShape = Object.fromEntries(
  PRACTICE_ASSET_SYMBOLS.map((symbol) => [symbol, centsSchema]),
) as Record<(typeof PRACTICE_ASSET_SYMBOLS)[number], typeof centsSchema>;

const VERSION_ONE_ASSET_SYMBOLS = [
  "VTI",
  "BND",
  "AAPL",
  "TSLA",
  "BTC",
  "ETH",
] as const;
const versionOneHoldingsShape = Object.fromEntries(
  VERSION_ONE_ASSET_SYMBOLS.map((symbol) => [symbol, centsSchema]),
) as Record<(typeof VERSION_ONE_ASSET_SYMBOLS)[number], typeof centsSchema>;

const depositTransactionSchema = z
  .object({
    id: transactionIdSchema,
    type: z.literal("deposit"),
    occurredAt: isoDateTimeSchema,
    amountCents: centsSchema.min(1),
  })
  .strict();

const buyTransactionSchema = z
  .object({
    id: transactionIdSchema,
    type: z.literal("buy"),
    occurredAt: isoDateTimeSchema,
    symbol: z.enum(PRACTICE_ASSET_SYMBOLS as [string, ...string[]]),
    requestedAmountCents: centsSchema.min(1),
    spentCents: centsSchema.min(1),
    priceCents: centsSchema.min(1),
    unitsMicro: centsSchema.min(1),
  })
  .strict();

const versionOneBuyTransactionSchema = z
  .object({
    id: transactionIdSchema,
    type: z.literal("buy"),
    occurredAt: isoDateTimeSchema,
    symbol: z.enum(VERSION_ONE_ASSET_SYMBOLS),
    requestedAmountCents: centsSchema.min(1),
    spentCents: centsSchema.min(1),
    priceCents: centsSchema.min(1),
    unitsMicro: centsSchema.min(1),
  })
  .strict();

const portfolioSchema = z
  .object({
    cashCents: centsSchema,
    holdingsMicro: z.object(holdingsShape).strict(),
    transactions: z
      .array(z.discriminatedUnion("type", [depositTransactionSchema, buyTransactionSchema]))
      .max(20_000),
  })
  .strict()
  .superRefine((portfolio, context) => {
    const ids = new Set<string>();
    portfolio.transactions.forEach((transaction, index) => {
      if (ids.has(transaction.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transactions", index, "id"],
          message: "transaction IDs must be unique",
        });
      }
      ids.add(transaction.id);
    });
  });

const versionOnePortfolioSchema = z
  .object({
    cashCents: centsSchema,
    holdingsMicro: z.object(versionOneHoldingsShape).strict(),
    transactions: z
      .array(
        z.discriminatedUnion("type", [
          depositTransactionSchema,
          versionOneBuyTransactionSchema,
        ]),
      )
      .max(20_000),
  })
  .strict()
  .superRefine((portfolio, context) => {
    const ids = new Set<string>();
    portfolio.transactions.forEach((transaction, index) => {
      if (ids.has(transaction.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transactions", index, "id"],
          message: "transaction IDs must be unique",
        });
      }
      ids.add(transaction.id);
    });
  });

const habitLogSchema = z
  .object({
    completedWeekKeys: z.array(z.string().regex(/^\d{4}-W\d{2}$/)).max(6_000),
  })
  .strict();

const profileSchema = z
  .object({
    experienceLevel: z.enum(["new", "familiar", "advanced"]),
    theme: z.enum(["dawn", "horizon", "alchemy", "space"]),
    onboardingComplete: z.boolean(),
  })
  .strict();

export const morrowwardStateSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_STATE_VERSION),
    profile: profileSchema,
    plan: planSchema,
    practicePortfolio: portfolioSchema,
    habitLog: habitLogSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const versionOneStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    profile: profileSchema,
    plan: planSchema,
    practicePortfolio: versionOnePortfolioSchema,
    habitLog: habitLogSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const legacyPlanSchema = z
  .object({
    currentAge: safeInteger,
    targetAge: safeInteger,
    startingBalanceCents: centsSchema,
    weeklyContributionCents: centsSchema,
    annualReturnBps: safeInteger,
    annualInflationBps: safeInteger.optional(),
    inflationBps: safeInteger.optional(),
  })
  .strict()
  .refine(
    (plan) =>
      plan.annualInflationBps !== undefined || plan.inflationBps !== undefined,
    { message: "A legacy inflation rate is required." },
  );

const legacyStateSchema = z
  .object({
    schemaVersion: z.literal(0),
    profile: profileSchema.optional(),
    plan: legacyPlanSchema,
    practicePortfolio: versionOnePortfolioSchema.optional(),
    habitLog: habitLogSchema.optional(),
    completedWeekKeys: z.array(z.string()).optional(),
    updatedAt: isoDateTimeSchema.optional(),
  })
  .strict();

const exportEnvelopeSchema = z
  .object({
    format: z.literal(STATE_EXPORT_FORMAT),
    schemaVersion: safeInteger.min(0),
    exportedAt: isoDateTimeSchema,
    data: z.unknown(),
  })
  .strict();

function zodError(error: z.ZodError, message: string): StateValidationError {
  return new StateValidationError(
    message,
    error.issues.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    }),
  );
}

function cloneState(state: MorrowwardState): MorrowwardState {
  return JSON.parse(JSON.stringify(state)) as MorrowwardState;
}

function expandVersionOnePortfolio(
  portfolio: z.infer<typeof versionOnePortfolioSchema> | undefined,
  defaults: PracticePortfolio,
): PracticePortfolio {
  if (!portfolio) return defaults;
  return {
    cashCents: portfolio.cashCents,
    holdingsMicro: {
      ...defaults.holdingsMicro,
      ...portfolio.holdingsMicro,
    },
    transactions: portfolio.transactions as PracticePortfolio["transactions"],
  };
}

export function createDefaultState(
  now: string = new Date().toISOString(),
): MorrowwardState {
  if (!isoDateTimeSchema.safeParse(now).success) {
    throw new StateValidationError("now must be an ISO date-time.");
  }
  return {
    schemaVersion: CURRENT_STATE_VERSION,
    profile: {
      experienceLevel: "new",
      theme: "horizon",
      onboardingComplete: false,
    },
    plan: {
      currentAge: 30,
      targetAge: 65,
      startingBalanceCents: 0,
      weeklyContributionCents: 2_500,
      annualReturnBps: 600,
      annualInflationBps: 300,
    },
    practicePortfolio: createPracticePortfolio(100_000),
    habitLog: createHabitLog(),
    updatedAt: now,
  };
}

export function validateState(input: unknown): MorrowwardState {
  const parsed = morrowwardStateSchema.safeParse(input);
  if (!parsed.success) {
    throw zodError(parsed.error, "The Morrowward state is invalid.");
  }

  try {
    validateProjectionInput(parsed.data.plan);
    validatePracticePortfolio(parsed.data.practicePortfolio as PracticePortfolio);
    const habitLog = normalizeHabitLog(parsed.data.habitLog);
    return cloneState({
      ...(parsed.data as MorrowwardState),
      habitLog,
    });
  } catch (error) {
    throw new StateValidationError(
      error instanceof Error ? error.message : "The Morrowward state is invalid.",
    );
  }
}

/** Migrates known older state versions, then applies the strict current schema. */
export function migrateState(
  input: unknown,
  now: string = new Date().toISOString(),
): MorrowwardState {
  if (!input || typeof input !== "object") {
    throw new StateValidationError("State must be an object.");
  }

  const version = (input as { schemaVersion?: unknown }).schemaVersion;
  if (version === CURRENT_STATE_VERSION) return validateState(input);

  if (version === 1) {
    const parsed = versionOneStateSchema.safeParse(input);
    if (!parsed.success) {
      throw zodError(parsed.error, "The version-one Morrowward state is invalid.");
    }
    const defaults = createDefaultState(now);
    const previous = parsed.data;
    return validateState({
      schemaVersion: CURRENT_STATE_VERSION,
      profile: previous.profile,
      plan: previous.plan,
      practicePortfolio: expandVersionOnePortfolio(
        previous.practicePortfolio,
        defaults.practicePortfolio,
      ),
      habitLog: previous.habitLog,
      updatedAt: previous.updatedAt,
    });
  }

  if (version === 0) {
    const parsed = legacyStateSchema.safeParse(input);
    if (!parsed.success) {
      throw zodError(parsed.error, "The legacy Morrowward state is invalid.");
    }
    const defaults = createDefaultState(now);
    const legacy = parsed.data;
    const migrated: MorrowwardState = {
      schemaVersion: CURRENT_STATE_VERSION,
      profile: legacy.profile ?? defaults.profile,
      plan: {
        currentAge: legacy.plan.currentAge,
        targetAge: legacy.plan.targetAge,
        startingBalanceCents: legacy.plan.startingBalanceCents,
        weeklyContributionCents: legacy.plan.weeklyContributionCents,
        annualReturnBps: legacy.plan.annualReturnBps,
        annualInflationBps:
          legacy.plan.annualInflationBps ?? legacy.plan.inflationBps ?? 300,
      },
      practicePortfolio: expandVersionOnePortfolio(
        legacy.practicePortfolio,
        defaults.practicePortfolio,
      ),
      habitLog:
        legacy.habitLog ?? {
          completedWeekKeys: legacy.completedWeekKeys ?? [],
        },
      updatedAt: legacy.updatedAt ?? now,
    };
    return validateState(migrated);
  }

  throw new StateValidationError(
    `Unsupported state version: ${String(version)}.`,
  );
}

export function serializeStateExport(
  state: MorrowwardState,
  exportedAt: string = new Date().toISOString(),
): string {
  const valid = validateState(state);
  if (!isoDateTimeSchema.safeParse(exportedAt).success) {
    throw new StateValidationError("exportedAt must be an ISO date-time.");
  }
  const envelope: StateExportEnvelope = {
    format: STATE_EXPORT_FORMAT,
    schemaVersion: valid.schemaVersion,
    exportedAt,
    data: valid,
  };
  return JSON.stringify(envelope, null, 2);
}

export function parseStateExport(
  serialized: string,
  now: string = new Date().toISOString(),
): MorrowwardState {
  if (typeof serialized !== "string" || serialized.length === 0) {
    throw new StateValidationError("The import must be non-empty JSON text.");
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_IMPORT_BYTES) {
    throw new StateValidationError("The import exceeds the 1 MB limit.");
  }

  let json: unknown;
  try {
    json = JSON.parse(serialized);
  } catch {
    throw new StateValidationError("The import is not valid JSON.");
  }
  const envelope = exportEnvelopeSchema.safeParse(json);
  if (!envelope.success) {
    throw zodError(envelope.error, "The export envelope is invalid.");
  }

  const dataVersion =
    envelope.data.data &&
    typeof envelope.data.data === "object" &&
    "schemaVersion" in envelope.data.data
      ? (envelope.data.data as { schemaVersion: unknown }).schemaVersion
      : undefined;
  if (dataVersion !== envelope.data.schemaVersion) {
    throw new StateValidationError(
      "The export version does not match the contained state.",
    );
  }
  return migrateState(envelope.data.data, now);
}
