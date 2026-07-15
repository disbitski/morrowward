import {
  BASIS_POINTS_PER_ONE,
  DomainValidationError,
  MICRO_UNITS_PER_ASSET,
  WEEKS_PER_YEAR,
  assertSafeInteger,
} from "./money";

export const MARKET_JOURNEY_HORIZONS = [1, 5, 10, 20] as const;
export const MARKET_RISK_LEVELS = ["lower", "medium", "higher"] as const;
export const MARKET_SEQUENCES = [
  "cycle",
  "late-bear",
  "strong-recovery",
] as const;

export type MarketJourneyYears = (typeof MARKET_JOURNEY_HORIZONS)[number];
export type MarketRiskLevel = (typeof MARKET_RISK_LEVELS)[number];
export type MarketSequence = (typeof MARKET_SEQUENCES)[number];
export type MarketRegime = "bull" | "pullback" | "bear" | "recovery";

export const DEFAULT_MARKET_JOURNEY_SEED = 42;
export const MIN_MARKET_RETURN_BPS = 0;
export const MAX_MARKET_RETURN_BPS = 5_000;
export const MAX_MARKET_STARTING_BALANCE_CENTS = 100_000_000_000;
export const MAX_MARKET_WEEKLY_CONTRIBUTION_CENTS = 1_000_000_000;

const TRADING_DAYS_PER_WEEK = 5;
const TRADING_DAYS_PER_YEAR = WEEKS_PER_YEAR * TRADING_DAYS_PER_WEEK;
const INITIAL_PRICE_CENTS = 10_000;
const INITIAL_PRICE_INDEX_MICROS = 100 * 1_000_000;
const MAX_SEED = 0xffff_ffff;

interface MarketRiskProfile {
  /** Log-price distance used to shape bull/bear regimes. */
  regimeAmplitude: number;
  /** Centered daily log-return noise. */
  dailyNoise: number;
}

const RISK_PROFILES: Record<MarketRiskLevel, MarketRiskProfile> = {
  lower: { regimeAmplitude: 0.06, dailyNoise: 0.0025 },
  medium: { regimeAmplitude: 0.12, dailyNoise: 0.0055 },
  higher: { regimeAmplitude: 0.22, dailyNoise: 0.0095 },
};

export interface MarketJourneyInput {
  years: MarketJourneyYears;
  startingBalanceCents: number;
  weeklyContributionCents: number;
  /** An illustrative long-term drift assumption, not a promised result. */
  annualReturnBps: number;
  /** Controls the width of swings independently from the drift assumption. */
  riskLevel: MarketRiskLevel;
  seed?: number;
  marketSequence?: MarketSequence;
}

export interface NormalizedMarketJourneyInput
  extends Omit<MarketJourneyInput, "seed" | "marketSequence"> {
  seed: number;
  marketSequence: MarketSequence;
}

export interface MarketJourneyPoint {
  week: number;
  year: number;
  priceCents: number;
  /** Synthetic index points stored at six decimal places; week zero is 100. */
  priceIndexMicros: number;
  contributionCents: number;
  cumulativeContributionsCents: number;
  portfolioValueCents: number;
  unitsMicro: number;
  cashCents: number;
  /** Distance below the highest prior weekly synthetic price. */
  drawdownBps: number;
  regime: MarketRegime;
}

export interface MarketRegimeSegment {
  regime: MarketRegime;
  startWeek: number;
  endWeek: number;
  startPriceCents: number;
  endPriceCents: number;
  changeBps: number;
}

export interface SimulatedStrongMarketDay {
  day: number;
  week: number;
  returnBps: number;
  regime: MarketRegime;
}

export interface MissedMarketDaysComparison {
  daysMissed: 5 | 10;
  endingValueCents: number;
  differenceCents: number;
}

export interface TimeInMarketComparison {
  stayedInvestedEndingValueCents: number;
  missedTop5Days: MissedMarketDaysComparison;
  missedTop10Days: MissedMarketDaysComparison;
  strongestSimulatedDays: SimulatedStrongMarketDay[];
}

export interface MarketJourneySummary {
  totalContributionsCents: number;
  endingValueCents: number;
  growthCents: number;
  assumedAnnualReturnBps: number;
  realizedMarketCagrBps: number;
  /** XIRR-style result for dated cash flows; deliberately not called CAGR. */
  moneyWeightedAnnualReturnBps: number | null;
  annualizedVolatilityBps: number;
  maxDrawdownBps: number;
  currentDrawdownBps: number;
  /** Whether the price regained its pre-maximum-drawdown peak. */
  recoveredByEnd: boolean;
  /** Weeks from the maximum-drawdown trough to recovery, when recovered. */
  recoveryWeeks: number | null;
  regimeSegments: MarketRegimeSegment[];
  timeInMarket: TimeInMarketComparison;
}

export interface MarketJourneyResult {
  input: NormalizedMarketJourneyInput;
  points: MarketJourneyPoint[];
  summary: MarketJourneySummary;
}

interface InternalRegimeSegment {
  startDay: number;
  endDay: number;
  startDeviation: number;
  endDeviation: number;
  regime: MarketRegime;
}

interface PortfolioSnapshot {
  unitsMicro: number;
  cashCents: number;
  valueCents: number;
}

function isOneOf<T extends string | number>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return allowed.includes(value as T);
}

export function validateMarketJourneyInput(input: MarketJourneyInput): void {
  if (!input || typeof input !== "object") {
    throw new DomainValidationError("input", "input is invalid.");
  }
  if (!isOneOf(input.years, MARKET_JOURNEY_HORIZONS)) {
    throw new DomainValidationError(
      "years",
      "years must be one of 1, 5, 10, or 20.",
    );
  }
  assertSafeInteger(input.startingBalanceCents, "startingBalanceCents", {
    min: 0,
    max: MAX_MARKET_STARTING_BALANCE_CENTS,
  });
  assertSafeInteger(input.weeklyContributionCents, "weeklyContributionCents", {
    min: 0,
    max: MAX_MARKET_WEEKLY_CONTRIBUTION_CENTS,
  });
  assertSafeInteger(input.annualReturnBps, "annualReturnBps", {
    min: MIN_MARKET_RETURN_BPS,
    max: MAX_MARKET_RETURN_BPS,
  });
  if (!isOneOf(input.riskLevel, MARKET_RISK_LEVELS)) {
    throw new DomainValidationError(
      "riskLevel",
      "riskLevel must be lower, medium, or higher.",
    );
  }
  if (input.seed !== undefined) {
    assertSafeInteger(input.seed, "seed", { min: 0, max: MAX_SEED });
  }
  if (
    input.marketSequence !== undefined &&
    !isOneOf(input.marketSequence, MARKET_SEQUENCES)
  ) {
    throw new DomainValidationError(
      "marketSequence",
      "marketSequence must be cycle, late-bear, or strong-recovery.",
    );
  }

  const weeks = input.years * WEEKS_PER_YEAR;
  const totalContributions =
    input.startingBalanceCents + input.weeklyContributionCents * weeks;
  if (!Number.isSafeInteger(totalContributions)) {
    throw new DomainValidationError(
      "totalContributionsCents",
      "The journey exceeds the supported safe-integer range.",
    );
  }
}

function normalizeInput(
  input: MarketJourneyInput,
): NormalizedMarketJourneyInput {
  validateMarketJourneyInput(input);
  return {
    ...input,
    seed: input.seed ?? DEFAULT_MARKET_JOURNEY_SEED,
    marketSequence: input.marketSequence ?? "cycle",
  };
}

/** A local PRNG keeps illustrations repeatable and never mutates global randomness. */
function createSeededRandom(seed: number): () => number {
  let state = (seed ^ 0x9e37_79b9) >>> 0;
  if (state === 0) state = 0x6d2b_79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function seededTerminalBias(seed: number): number {
  const random = createSeededRandom((seed ^ 0xa511_e9b3) >>> 0);
  // Keep the default cycle's ending offset independent from swing width so a
  // wider path does not mechanically receive a higher or lower destination.
  return (random() * 2 - 1) * 0.006;
}

function allocateSegmentLengths(totalDays: number): number[] {
  const weights = [28, 12, 15, 17, 13, 15] as const;
  const lengths = weights.map((weight) =>
    Math.max(1, Math.floor((totalDays * weight) / 100)),
  );
  let assigned = lengths.reduce((sum, length) => sum + length, 0);
  let cursor = 0;
  while (assigned < totalDays) {
    lengths[cursor % lengths.length] += 1;
    assigned += 1;
    cursor += 1;
  }
  while (assigned > totalDays) {
    const index = cursor % lengths.length;
    if (lengths[index] > 1) {
      lengths[index] -= 1;
      assigned -= 1;
    }
    cursor += 1;
  }
  return lengths;
}

function buildRegimeSegments(
  input: NormalizedMarketJourneyInput,
): InternalRegimeSegment[] {
  const totalDays = input.years * TRADING_DAYS_PER_YEAR;
  const cycleCount = input.years >= 5 ? input.years / 5 : 1;
  const cycleDays = totalDays / cycleCount;
  const amplitude = RISK_PROFILES[input.riskLevel].regimeAmplitude;
  const finalCycleBias = seededTerminalBias(input.seed);
  const result: InternalRegimeSegment[] = [];
  let day = 1;
  let currentDeviation = 0;

  for (let cycle = 0; cycle < cycleCount; cycle += 1) {
    const isFinalCycle = cycle === cycleCount - 1;
    const lengths = allocateSegmentLengths(cycleDays);
    const finalDeviation = !isFinalCycle
      ? 0
      : input.marketSequence === "late-bear"
        ? -0.95 * amplitude
        : input.marketSequence === "strong-recovery"
          ? 0.9 * amplitude
          : finalCycleBias;
    const finalRegime: MarketRegime =
      isFinalCycle && input.marketSequence === "late-bear"
        ? "bear"
        : "recovery";
    const targets = [
      0.55 * amplitude,
      0.12 * amplitude,
      0.6 * amplitude,
      0.8 * amplitude,
      -0.55 * amplitude,
      finalDeviation,
    ];
    const regimes: MarketRegime[] = [
      "bull",
      "pullback",
      "recovery",
      "bull",
      input.riskLevel === "lower" ? "pullback" : "bear",
      finalRegime,
    ];

    for (let index = 0; index < lengths.length; index += 1) {
      const length = lengths[index];
      const endDay = day + length - 1;
      result.push({
        startDay: day,
        endDay,
        startDeviation: currentDeviation,
        endDeviation: targets[index],
        regime: regimes[index],
      });
      day = endDay + 1;
      currentDeviation = targets[index];
    }
  }

  return result;
}

function checkedRoundedInteger(value: number, field: string, min = 0): number {
  const rounded = Math.round(value);
  if (!Number.isFinite(value) || !Number.isSafeInteger(rounded) || rounded < min) {
    throw new DomainValidationError(
      field,
      "The journey exceeds the supported safe-integer range.",
    );
  }
  return rounded;
}

function buildDailyMarketPath(input: NormalizedMarketJourneyInput): {
  dailyLogReturns: number[];
  dailyPriceCents: number[];
  dailyPriceIndexMicros: number[];
  dailyRegimes: MarketRegime[];
} {
  const totalDays = input.years * TRADING_DAYS_PER_YEAR;
  const segments = buildRegimeSegments(input);
  const random = createSeededRandom(input.seed);
  const annualRate = input.annualReturnBps / BASIS_POINTS_PER_ONE;
  const dailyDrift = Math.log1p(annualRate) / TRADING_DAYS_PER_YEAR;
  const noiseScale = RISK_PROFILES[input.riskLevel].dailyNoise;
  const dailyLogReturns: number[] = [];
  const dailyRegimes: MarketRegime[] = [];

  for (const segment of segments) {
    const length = segment.endDay - segment.startDay + 1;
    const rawNoise = Array.from({ length }, () =>
      random() + random() + random() - 1.5,
    );
    const meanNoise =
      rawNoise.reduce((sum, value) => sum + value, 0) / length;
    const regimeMove =
      (segment.endDeviation - segment.startDeviation) / length;
    for (const noise of rawNoise) {
      dailyLogReturns.push(
        dailyDrift + regimeMove + (noise - meanNoise) * noiseScale,
      );
      dailyRegimes.push(segment.regime);
    }
  }

  if (dailyLogReturns.length !== totalDays) {
    throw new DomainValidationError(
      "marketPath",
      "The deterministic market path has an invalid length.",
    );
  }

  const dailyPriceCents = [INITIAL_PRICE_CENTS];
  const dailyPriceIndexMicros = [INITIAL_PRICE_INDEX_MICROS];
  let cumulativeLogReturn = 0;
  for (const logReturn of dailyLogReturns) {
    cumulativeLogReturn += logReturn;
    const factor = Math.exp(cumulativeLogReturn);
    dailyPriceCents.push(
      Math.max(
        1,
        checkedRoundedInteger(
          INITIAL_PRICE_CENTS * factor,
          "priceCents",
          1,
        ),
      ),
    );
    dailyPriceIndexMicros.push(
      Math.max(
        1,
        checkedRoundedInteger(
          INITIAL_PRICE_INDEX_MICROS * factor,
          "priceIndexMicros",
          1,
        ),
      ),
    );
  }

  return {
    dailyLogReturns,
    dailyPriceCents,
    dailyPriceIndexMicros,
    dailyRegimes,
  };
}

function multiplyDivideFloorChecked(
  multiplicand: number,
  multiplier: number,
  divisor: number,
  field: string,
): number {
  const result =
    (BigInt(multiplicand) * BigInt(multiplier)) / BigInt(divisor);
  const number = Number(result);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new DomainValidationError(
      field,
      "The journey exceeds the supported safe-integer range.",
    );
  }
  return number;
}

function multiplyDivideCeilChecked(
  multiplicand: number,
  multiplier: number,
  divisor: number,
  field: string,
): number {
  const numerator = BigInt(multiplicand) * BigInt(multiplier);
  const denominator = BigInt(divisor);
  const result = (numerator + denominator - BigInt(1)) / denominator;
  const number = Number(result);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new DomainValidationError(
      field,
      "The journey exceeds the supported safe-integer range.",
    );
  }
  return number;
}

function investAvailableCash(
  unitsMicro: number,
  cashCents: number,
  priceCents: number,
): { unitsMicro: number; cashCents: number } {
  if (cashCents === 0) return { unitsMicro, cashCents };
  const purchasedMicro = multiplyDivideFloorChecked(
    cashCents,
    MICRO_UNITS_PER_ASSET,
    priceCents,
    "unitsMicro",
  );
  if (purchasedMicro === 0) return { unitsMicro, cashCents };
  // Debit the rounded-up cent cost so fractional precision can never create
  // free simulated units. Valuations remain conservatively rounded down.
  const spentCents = multiplyDivideCeilChecked(
    purchasedMicro,
    priceCents,
    MICRO_UNITS_PER_ASSET,
    "spentCents",
  );
  const nextUnits = unitsMicro + purchasedMicro;
  if (!Number.isSafeInteger(nextUnits)) {
    throw new DomainValidationError(
      "unitsMicro",
      "The journey exceeds the supported safe-integer range.",
    );
  }
  return {
    unitsMicro: nextUnits,
    cashCents: cashCents - spentCents,
  };
}

function valuePortfolio(
  unitsMicro: number,
  cashCents: number,
  priceCents: number,
): number {
  const holdingsValue = multiplyDivideFloorChecked(
    unitsMicro,
    priceCents,
    MICRO_UNITS_PER_ASSET,
    "portfolioValueCents",
  );
  const total = holdingsValue + cashCents;
  if (!Number.isSafeInteger(total)) {
    throw new DomainValidationError(
      "portfolioValueCents",
      "The journey exceeds the supported safe-integer range.",
    );
  }
  return total;
}

function simulatePortfolio(
  input: NormalizedMarketJourneyInput,
  dailyPriceCents: readonly number[],
  skippedDays: ReadonlySet<number> = new Set<number>(),
  captureWeekly = false,
): { endingValueCents: number; weeklySnapshots: PortfolioSnapshot[] } {
  let unitsMicro = 0;
  let cashCents = input.startingBalanceCents;
  ({ unitsMicro, cashCents } = investAvailableCash(
    unitsMicro,
    cashCents,
    dailyPriceCents[0],
  ));
  const weeklySnapshots: PortfolioSnapshot[] = [];
  if (captureWeekly) {
    weeklySnapshots.push({
      unitsMicro,
      cashCents,
      valueCents: valuePortfolio(unitsMicro, cashCents, dailyPriceCents[0]),
    });
  }

  for (let day = 1; day < dailyPriceCents.length; day += 1) {
    if (skippedDays.has(day) && unitsMicro > 0) {
      cashCents += valuePortfolio(
        unitsMicro,
        0,
        dailyPriceCents[day - 1],
      );
      unitsMicro = 0;
      ({ unitsMicro, cashCents } = investAvailableCash(
        unitsMicro,
        cashCents,
        dailyPriceCents[day],
      ));
    }

    if (day % TRADING_DAYS_PER_WEEK === 0) {
      cashCents += input.weeklyContributionCents;
      if (!Number.isSafeInteger(cashCents)) {
        throw new DomainValidationError(
          "cashCents",
          "The journey exceeds the supported safe-integer range.",
        );
      }
      ({ unitsMicro, cashCents } = investAvailableCash(
        unitsMicro,
        cashCents,
        dailyPriceCents[day],
      ));
      if (captureWeekly) {
        weeklySnapshots.push({
          unitsMicro,
          cashCents,
          valueCents: valuePortfolio(
            unitsMicro,
            cashCents,
            dailyPriceCents[day],
          ),
        });
      }
    }
  }

  return {
    endingValueCents: valuePortfolio(
      unitsMicro,
      cashCents,
      dailyPriceCents[dailyPriceCents.length - 1],
    ),
    weeklySnapshots,
  };
}

function roundBasisPoints(rate: number, field: string): number {
  return checkedRoundedInteger(rate * BASIS_POINTS_PER_ONE, field, -Infinity);
}

function calculateAnnualizedVolatilityBps(
  dailyLogReturns: readonly number[],
): number {
  const mean =
    dailyLogReturns.reduce((sum, value) => sum + value, 0) /
    dailyLogReturns.length;
  const variance =
    dailyLogReturns.reduce((sum, value) => {
      const delta = value - mean;
      return sum + delta * delta;
    }, 0) /
    Math.max(1, dailyLogReturns.length - 1);
  return roundBasisPoints(
    Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR),
    "annualizedVolatilityBps",
  );
}

function calculateMoneyWeightedAnnualReturnBps(
  input: NormalizedMarketJourneyInput,
  endingValueCents: number,
): number | null {
  if (
    input.startingBalanceCents === 0 &&
    input.weeklyContributionCents === 0
  ) {
    return null;
  }

  const totalWeeks = input.years * WEEKS_PER_YEAR;
  const npv = (annualRate: number): number => {
    let value = -input.startingBalanceCents;
    for (let week = 1; week <= totalWeeks; week += 1) {
      value -=
        input.weeklyContributionCents /
        Math.pow(1 + annualRate, week / WEEKS_PER_YEAR);
    }
    value += endingValueCents / Math.pow(1 + annualRate, input.years);
    return value;
  };

  let lower = -0.9999;
  let upper = 1;
  let lowerValue = npv(lower);
  let upperValue = npv(upper);
  while (lowerValue * upperValue > 0 && upper < 1_000) {
    upper *= 2;
    upperValue = npv(upper);
  }
  if (!Number.isFinite(lowerValue) || !Number.isFinite(upperValue)) return null;
  if (lowerValue * upperValue > 0) return null;

  for (let iteration = 0; iteration < 120; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    const midpointValue = npv(midpoint);
    if (Math.abs(midpointValue) < 0.005) {
      return roundBasisPoints(midpoint, "moneyWeightedAnnualReturnBps");
    }
    if (lowerValue * midpointValue <= 0) {
      upper = midpoint;
      upperValue = midpointValue;
    } else {
      lower = midpoint;
      lowerValue = midpointValue;
    }
  }
  return roundBasisPoints(
    (lower + upper) / 2,
    "moneyWeightedAnnualReturnBps",
  );
}

function buildWeeklyPoints(
  input: NormalizedMarketJourneyInput,
  dailyPriceCents: readonly number[],
  dailyPriceIndexMicros: readonly number[],
  dailyRegimes: readonly MarketRegime[],
  snapshots: readonly PortfolioSnapshot[],
): MarketJourneyPoint[] {
  const points: MarketJourneyPoint[] = [];
  let peakPrice = dailyPriceCents[0];
  for (let week = 0; week < snapshots.length; week += 1) {
    const day = week * TRADING_DAYS_PER_WEEK;
    const priceCents = dailyPriceCents[day];
    peakPrice = Math.max(peakPrice, priceCents);
    const drawdownBps = Math.max(
      0,
      Math.round(((peakPrice - priceCents) / peakPrice) * BASIS_POINTS_PER_ONE),
    );
    const snapshot = snapshots[week];
    points.push({
      week,
      year: week / WEEKS_PER_YEAR,
      priceCents,
      priceIndexMicros: dailyPriceIndexMicros[day],
      contributionCents:
        week === 0
          ? input.startingBalanceCents
          : input.weeklyContributionCents,
      cumulativeContributionsCents:
        input.startingBalanceCents + input.weeklyContributionCents * week,
      portfolioValueCents: snapshot.valueCents,
      unitsMicro: snapshot.unitsMicro,
      cashCents: snapshot.cashCents,
      drawdownBps,
      regime: dailyRegimes[Math.min(Math.max(0, day - 1), dailyRegimes.length - 1)],
    });
  }
  return points;
}

function buildPublicRegimeSegments(
  points: readonly MarketJourneyPoint[],
): MarketRegimeSegment[] {
  const result: MarketRegimeSegment[] = [];
  let startIndex = 0;
  for (let index = 1; index <= points.length; index += 1) {
    if (
      index < points.length &&
      points[index].regime === points[startIndex].regime
    ) {
      continue;
    }
    const start = points[startIndex];
    const end = points[index - 1];
    result.push({
      regime: start.regime,
      startWeek: start.week,
      endWeek: end.week,
      startPriceCents: start.priceCents,
      endPriceCents: end.priceCents,
      changeBps: Math.round(
        ((end.priceCents - start.priceCents) / start.priceCents) *
          BASIS_POINTS_PER_ONE,
      ),
    });
    startIndex = index;
  }
  return result;
}

function calculateRecovery(points: readonly MarketJourneyPoint[]): {
  recoveredByEnd: boolean;
  recoveryWeeks: number | null;
} {
  let troughIndex = 0;
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].drawdownBps > points[troughIndex].drawdownBps) {
      troughIndex = index;
    }
  }
  if (points[troughIndex].drawdownBps === 0) {
    return { recoveredByEnd: true, recoveryWeeks: 0 };
  }
  const priorPeak = Math.max(
    ...points.slice(0, troughIndex + 1).map((point) => point.priceCents),
  );
  for (let index = troughIndex + 1; index < points.length; index += 1) {
    if (points[index].priceCents >= priorPeak) {
      return {
        recoveredByEnd: true,
        recoveryWeeks: points[index].week - points[troughIndex].week,
      };
    }
  }
  return { recoveredByEnd: false, recoveryWeeks: null };
}

function strongestSimulatedDays(
  dailyLogReturns: readonly number[],
  dailyRegimes: readonly MarketRegime[],
): SimulatedStrongMarketDay[] {
  return dailyLogReturns
    .map((logReturn, index) => ({
      day: index + 1,
      week: Math.ceil((index + 1) / TRADING_DAYS_PER_WEEK),
      returnBps: Math.round(Math.expm1(logReturn) * BASIS_POINTS_PER_ONE),
      regime: dailyRegimes[index],
    }))
    .sort((left, right) => right.returnBps - left.returnBps || left.day - right.day)
    .slice(0, 10);
}

/**
 * Builds a deterministic educational journey. Regime shapes are illustrative,
 * not historical data or forecasts. The selected return is drift; the realized
 * path, DCA money-weighted return, volatility, and drawdowns remain distinct.
 */
export function simulateMarketJourney(
  rawInput: MarketJourneyInput,
): MarketJourneyResult {
  const input = normalizeInput(rawInput);
  const {
    dailyLogReturns,
    dailyPriceCents,
    dailyPriceIndexMicros,
    dailyRegimes,
  } = buildDailyMarketPath(input);
  const portfolio = simulatePortfolio(
    input,
    dailyPriceCents,
    new Set<number>(),
    true,
  );
  const points = buildWeeklyPoints(
    input,
    dailyPriceCents,
    dailyPriceIndexMicros,
    dailyRegimes,
    portfolio.weeklySnapshots,
  );
  const finalPoint = points[points.length - 1];
  const totalContributionsCents =
    input.startingBalanceCents +
    input.weeklyContributionCents * input.years * WEEKS_PER_YEAR;
  const finalPriceFactor =
    dailyPriceIndexMicros[dailyPriceIndexMicros.length - 1] /
    dailyPriceIndexMicros[0];
  const realizedMarketCagrBps = roundBasisPoints(
    Math.pow(finalPriceFactor, 1 / input.years) - 1,
    "realizedMarketCagrBps",
  );
  const strongestDays = strongestSimulatedDays(
    dailyLogReturns,
    dailyRegimes,
  );
  const top5 = new Set(strongestDays.slice(0, 5).map((day) => day.day));
  const top10 = new Set(strongestDays.map((day) => day.day));
  const missedTop5EndingValue = simulatePortfolio(
    input,
    dailyPriceCents,
    top5,
  ).endingValueCents;
  const missedTop10EndingValue = simulatePortfolio(
    input,
    dailyPriceCents,
    top10,
  ).endingValueCents;
  const recovery = calculateRecovery(points);

  return {
    input,
    points,
    summary: {
      totalContributionsCents,
      endingValueCents: finalPoint.portfolioValueCents,
      growthCents: finalPoint.portfolioValueCents - totalContributionsCents,
      assumedAnnualReturnBps: input.annualReturnBps,
      realizedMarketCagrBps,
      moneyWeightedAnnualReturnBps: calculateMoneyWeightedAnnualReturnBps(
        input,
        finalPoint.portfolioValueCents,
      ),
      annualizedVolatilityBps:
        calculateAnnualizedVolatilityBps(dailyLogReturns),
      maxDrawdownBps: Math.max(...points.map((point) => point.drawdownBps)),
      currentDrawdownBps: finalPoint.drawdownBps,
      ...recovery,
      regimeSegments: buildPublicRegimeSegments(points),
      timeInMarket: {
        stayedInvestedEndingValueCents: finalPoint.portfolioValueCents,
        missedTop5Days: {
          daysMissed: 5,
          endingValueCents: missedTop5EndingValue,
          differenceCents:
            finalPoint.portfolioValueCents - missedTop5EndingValue,
        },
        missedTop10Days: {
          daysMissed: 10,
          endingValueCents: missedTop10EndingValue,
          differenceCents:
            finalPoint.portfolioValueCents - missedTop10EndingValue,
        },
        strongestSimulatedDays: strongestDays,
      },
    },
  };
}
