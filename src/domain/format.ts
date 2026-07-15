import {
  BASIS_POINTS_PER_ONE,
  MICRO_UNITS_PER_ASSET,
  assertSafeInteger,
} from "./money";

const DEFAULT_CURRENCY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const COMPACT_CURRENCY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/** Stable en-US display helper. Domain values remain integer cents. */
export function formatCurrencyCents(
  cents: number,
  options: { compact?: boolean; showCents?: boolean } = {},
): string {
  assertSafeInteger(cents, "cents");
  const dollars = cents / 100;

  if (options.compact) {
    return COMPACT_CURRENCY.format(dollars);
  }

  if (options.showCents === false) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(dollars);
  }

  return DEFAULT_CURRENCY.format(dollars);
}

export function formatBasisPoints(
  basisPoints: number,
  maximumFractionDigits = 2,
): string {
  assertSafeInteger(basisPoints, "basisPoints");
  if (
    !Number.isSafeInteger(maximumFractionDigits) ||
    maximumFractionDigits < 0 ||
    maximumFractionDigits > 4
  ) {
    throw new RangeError("maximumFractionDigits must be between 0 and 4.");
  }

  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format((basisPoints / BASIS_POINTS_PER_ONE) * 100)}%`;
}

export function formatAssetMicroUnits(
  microUnits: number,
  maximumFractionDigits = 6,
): string {
  assertSafeInteger(microUnits, "microUnits", { min: 0 });
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
    useGrouping: true,
  }).format(microUnits / MICRO_UNITS_PER_ASSET);
}
