/** Integer representation constants shared by every finance calculation. */
export const BASIS_POINTS_PER_ONE = 10_000;
export const WEEKS_PER_YEAR = 52;
export const MICRO_UNITS_PER_ASSET = 1_000_000;

export const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;

export class DomainValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "DomainValidationError";
    this.field = field;
  }
}

export function assertSafeInteger(
  value: number,
  field: string,
  options: { min?: number; max?: number } = {},
): void {
  if (!Number.isSafeInteger(value)) {
    throw new DomainValidationError(field, `${field} must be a safe integer.`);
  }

  if (options.min !== undefined && value < options.min) {
    throw new DomainValidationError(
      field,
      `${field} must be at least ${options.min}.`,
    );
  }

  if (options.max !== undefined && value > options.max) {
    throw new DomainValidationError(
      field,
      `${field} must be at most ${options.max}.`,
    );
  }
}

export function assertIsoDateTime(value: string, field: string): void {
  const isoDateTime =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !isoDateTime.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new DomainValidationError(field, `${field} must be an ISO date-time.`);
  }
}

/** Multiply two safe integers and divide without an overflowing intermediate. */
export function multiplyDivideFloor(
  multiplicand: number,
  multiplier: number,
  divisor: number,
): number {
  assertSafeInteger(multiplicand, "multiplicand", { min: 0 });
  assertSafeInteger(multiplier, "multiplier", { min: 0 });
  assertSafeInteger(divisor, "divisor", { min: 1 });

  const result =
    (BigInt(multiplicand) * BigInt(multiplier)) / BigInt(divisor);
  const asNumber = Number(result);
  assertSafeInteger(asNumber, "result", { min: 0 });
  return asNumber;
}

/** Ceiling variant used when debiting cash for fractional simulated buys. */
export function multiplyDivideCeil(
  multiplicand: number,
  multiplier: number,
  divisor: number,
): number {
  assertSafeInteger(multiplicand, "multiplicand", { min: 0 });
  assertSafeInteger(multiplier, "multiplier", { min: 0 });
  assertSafeInteger(divisor, "divisor", { min: 1 });

  const numerator = BigInt(multiplicand) * BigInt(multiplier);
  const denominator = BigInt(divisor);
  const result = (numerator + denominator - BigInt(1)) / denominator;
  const asNumber = Number(result);
  assertSafeInteger(asNumber, "result", { min: 0 });
  return asNumber;
}

export function safeAdd(left: number, right: number, field = "result"): number {
  const result = left + right;
  assertSafeInteger(result, field);
  return result;
}
