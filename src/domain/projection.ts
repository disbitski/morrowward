import {
  BASIS_POINTS_PER_ONE,
  DomainValidationError,
  MAX_SAFE_CENTS,
  WEEKS_PER_YEAR,
  assertSafeInteger,
} from "./money";

export const MIN_CURRENT_AGE = 18;
export const MAX_CURRENT_AGE = 100;
export const MAX_TARGET_AGE = 120;
export const MIN_ANNUAL_RATE_BPS = -9_900;
export const MAX_ANNUAL_RATE_BPS = 5_000;
export const MAX_ANNUAL_INFLATION_BPS = 5_000;

/** All monetary inputs use cents and all rates use basis points. */
export interface ProjectionInput {
  currentAge: number;
  targetAge: number;
  startingBalanceCents: number;
  weeklyContributionCents: number;
  annualReturnBps: number;
  annualInflationBps: number;
}

export interface ProjectionResult {
  yearsRemaining: number;
  weeksRemaining: number;
  startingBalanceCents: number;
  contributionDepositsCents: number;
  totalContributionsCents: number;
  nominalFutureValueCents: number;
  inflationAdjustedFutureValueCents: number;
  estimatedGrowthCents: number;
  annualReturnBps: number;
  annualInflationBps: number;
  weeklyGrowthRate: number;
}

export interface ProjectionScenarioDefinition {
  id: string;
  label: string;
  annualReturnBps: number;
}

export interface ProjectionScenario {
  definition: ProjectionScenarioDefinition;
  projection: ProjectionResult;
}

export const DEFAULT_PROJECTION_SCENARIOS = [
  { id: "steady", label: "3% illustration", annualReturnBps: 300 },
  { id: "middle", label: "6% illustration", annualReturnBps: 600 },
  { id: "stretch", label: "9% illustration", annualReturnBps: 900 },
] as const satisfies readonly ProjectionScenarioDefinition[];

export function validateProjectionInput(input: ProjectionInput): void {
  assertSafeInteger(input.currentAge, "currentAge", {
    min: MIN_CURRENT_AGE,
    max: MAX_CURRENT_AGE,
  });
  assertSafeInteger(input.targetAge, "targetAge", {
    min: MIN_CURRENT_AGE + 1,
    max: MAX_TARGET_AGE,
  });

  if (input.targetAge <= input.currentAge) {
    throw new DomainValidationError(
      "targetAge",
      "targetAge must be greater than currentAge.",
    );
  }

  assertSafeInteger(input.startingBalanceCents, "startingBalanceCents", {
    min: 0,
    max: MAX_SAFE_CENTS,
  });
  assertSafeInteger(
    input.weeklyContributionCents,
    "weeklyContributionCents",
    { min: 0, max: MAX_SAFE_CENTS },
  );
  assertSafeInteger(input.annualReturnBps, "annualReturnBps", {
    min: MIN_ANNUAL_RATE_BPS,
    max: MAX_ANNUAL_RATE_BPS,
  });
  assertSafeInteger(input.annualInflationBps, "annualInflationBps", {
    min: MIN_ANNUAL_RATE_BPS,
    max: MAX_ANNUAL_INFLATION_BPS,
  });
}

/** Converts an effective annual rate into its equivalent effective weekly rate. */
export function annualBasisPointsToWeeklyRate(annualRateBps: number): number {
  assertSafeInteger(annualRateBps, "annualRateBps", {
    min: MIN_ANNUAL_RATE_BPS,
    max: MAX_ANNUAL_RATE_BPS,
  });
  const annualRate = annualRateBps / BASIS_POINTS_PER_ONE;
  return Math.expm1(Math.log1p(annualRate) / WEEKS_PER_YEAR);
}

function checkedRoundedCents(value: number, field: string): number {
  const rounded = Math.round(value);
  if (!Number.isFinite(value) || !Number.isSafeInteger(rounded)) {
    throw new DomainValidationError(
      field,
      "The illustration exceeds the supported safe-integer range. Reduce the balance, contribution, rate, or horizon.",
    );
  }
  return rounded;
}

/**
 * Projects end-of-week contributions. Weekly rounding keeps every stored and
 * displayed monetary value in integer cents while preserving annual compounding.
 */
export function calculateProjection(input: ProjectionInput): ProjectionResult {
  validateProjectionInput(input);

  const yearsRemaining = input.targetAge - input.currentAge;
  const weeksRemaining = yearsRemaining * WEEKS_PER_YEAR;
  const weeklyGrowthRate = annualBasisPointsToWeeklyRate(input.annualReturnBps);

  let balanceCents = input.startingBalanceCents;
  for (let week = 0; week < weeksRemaining; week += 1) {
    balanceCents = checkedRoundedCents(
      balanceCents * (1 + weeklyGrowthRate) +
        input.weeklyContributionCents,
      "nominalFutureValueCents",
    );
  }

  const contributionDepositsCents = checkedRoundedCents(
    input.weeklyContributionCents * weeksRemaining,
    "contributionDepositsCents",
  );
  const totalContributionsCents = checkedRoundedCents(
    input.startingBalanceCents + contributionDepositsCents,
    "totalContributionsCents",
  );
  const estimatedGrowthCents = balanceCents - totalContributionsCents;

  const annualInflation =
    input.annualInflationBps / BASIS_POINTS_PER_ONE;
  const inflationFactor = Math.pow(1 + annualInflation, yearsRemaining);
  const inflationAdjustedFutureValueCents = checkedRoundedCents(
    balanceCents / inflationFactor,
    "inflationAdjustedFutureValueCents",
  );

  return {
    yearsRemaining,
    weeksRemaining,
    startingBalanceCents: input.startingBalanceCents,
    contributionDepositsCents,
    totalContributionsCents,
    nominalFutureValueCents: balanceCents,
    inflationAdjustedFutureValueCents,
    estimatedGrowthCents,
    annualReturnBps: input.annualReturnBps,
    annualInflationBps: input.annualInflationBps,
    weeklyGrowthRate,
  };
}

export function calculateProjectionScenarios(
  input: Omit<ProjectionInput, "annualReturnBps">,
  definitions: readonly ProjectionScenarioDefinition[] =
    DEFAULT_PROJECTION_SCENARIOS,
): ProjectionScenario[] {
  if (definitions.length === 0) {
    throw new DomainValidationError(
      "definitions",
      "At least one projection scenario is required.",
    );
  }

  return definitions.map((definition) => ({
    definition: { ...definition },
    projection: calculateProjection({
      ...input,
      annualReturnBps: definition.annualReturnBps,
    }),
  }));
}
