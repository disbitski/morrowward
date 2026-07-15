"use client";

import { FlaskConical, Info } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useId,
  useMemo,
  useState,
} from "react";
import {
  formatBasisPoints,
  formatCurrencyCents,
  simulateMarketJourney,
  type MarketJourneyPoint,
  type MarketRiskLevel,
  type MarketSequence,
} from "../../src/domain";
import styles from "./MarketJourney.module.css";

type ExperienceLevel = "new" | "familiar" | "advanced";
type HorizonYears = 1 | 5 | 10 | 20;
type GrowthAssumptionBps = 300 | 600 | 900;

export interface MarketJourneyProps {
  startingBalanceCents: number;
  weeklyContributionCents: number;
  initialReturnBps: number;
  experienceLevel: ExperienceLevel;
}

type RegimeSegment = {
  regime: MarketJourneyPoint["regime"];
  startWeek: number;
  endWeek: number;
};

const HORIZONS = [1, 5, 10, 20] as const;
const GROWTH_ASSUMPTIONS = [300, 600, 900] as const;
const RISK_LEVELS: ReadonlyArray<{
  value: MarketRiskLevel;
  label: string;
}> = [
  { value: "lower", label: "Lower" },
  { value: "medium", label: "Medium" },
  { value: "higher", label: "Higher" },
];
const MARKET_SEQUENCES: ReadonlyArray<{
  value: MarketSequence;
  label: string;
}> = [
  { value: "cycle", label: "Full cycle" },
  { value: "late-bear", label: "Late decline" },
  { value: "strong-recovery", label: "Strong recovery" },
];

const CHART = {
  width: 960,
  height: 350,
  left: 65,
  right: 24,
  top: 43,
  bottom: 43,
} as const;

const plotWidth = CHART.width - CHART.left - CHART.right;
const plotHeight = CHART.height - CHART.top - CHART.bottom;
const plotBottom = CHART.height - CHART.bottom;

function nearestGrowthAssumption(value: number): GrowthAssumptionBps {
  return GROWTH_ASSUMPTIONS.reduce((nearest, candidate) =>
    Math.abs(candidate - value) < Math.abs(nearest - value)
      ? candidate
      : nearest,
  );
}

function money(cents: number, compact = true): string {
  return formatCurrencyCents(cents, {
    compact,
    showCents: false,
  });
}

function signedMoney(cents: number): string {
  if (cents === 0) return "$0";
  return `${cents > 0 ? "+" : "−"}${money(Math.abs(cents))}`;
}

function drawdown(basisPoints: number): string {
  if (basisPoints === 0) return "0%";
  return `−${formatBasisPoints(Math.abs(basisPoints), 1)}`;
}

function optionalBasisPoints(
  basisPoints: number | null | undefined,
  maximumFractionDigits = 1,
): string {
  return typeof basisPoints === "number"
    ? formatBasisPoints(basisPoints, maximumFractionDigits)
    : "—";
}

function pointYear(point: MarketJourneyPoint): string {
  if (point.week === 0) return "Start";
  const years = point.week / 52;
  if (years < 1) return `Month ${Math.max(1, Math.round(years * 12))}`;
  return `Year ${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(years)}`;
}

function indexLevel(point: MarketJourneyPoint): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(point.priceCents / 100);
}

function groupRegimes(points: readonly MarketJourneyPoint[]): RegimeSegment[] {
  if (points.length === 0) return [];

  const segments: RegimeSegment[] = [];
  let current: RegimeSegment = {
    regime: points[0].regime,
    startWeek: points[0].week,
    endWeek: points[0].week,
  };

  let previousPoint = points[0];
  for (const point of points.slice(1)) {
    if (point.regime === current.regime) {
      current.endWeek = point.week;
      previousPoint = point;
      continue;
    }
    current.endWeek = previousPoint.week;
    segments.push(current);
    current = {
      regime: point.regime,
      startWeek: point.week,
      endWeek: point.week,
    };
    previousPoint = point;
  }
  segments.push(current);
  return segments;
}

function regimePresentation(
  regime: MarketJourneyPoint["regime"],
  experienceLevel: ExperienceLevel,
): { label: string; className: string } {
  switch (regime) {
    case "bull":
      return {
        label: experienceLevel === "new" ? "Rising" : "Bull",
        className: styles.bandBull,
      };
    case "pullback":
      return { label: "Pullback", className: styles.bandPullback };
    case "bear":
      return {
        label: experienceLevel === "new" ? "Deep decline" : "Bear",
        className: styles.bandBear,
      };
    case "recovery":
      return { label: "Recovery", className: styles.bandRecovery };
    default:
      return { label: "Market phase", className: styles.bandSteady };
  }
}

function createLinePath(
  points: readonly MarketJourneyPoint[],
  value: (point: MarketJourneyPoint) => number,
  maxWeek: number,
  maxCents: number,
): string {
  return points
    .map((point, index) => {
      const x = CHART.left + (point.week / maxWeek) * plotWidth;
      const y = plotBottom - (value(point) / maxCents) * plotHeight;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function MarketJourney({
  startingBalanceCents,
  weeklyContributionCents,
  initialReturnBps,
  experienceLevel,
}: MarketJourneyProps) {
  const [years, setYears] = useState<HorizonYears>(10);
  const [annualReturnBps, setAnnualReturnBps] =
    useState<GrowthAssumptionBps>(() =>
      nearestGrowthAssumption(initialReturnBps),
    );
  const [riskLevel, setRiskLevel] = useState<MarketRiskLevel>("medium");
  const [marketSequence, setMarketSequence] =
    useState<MarketSequence>("cycle");
  const [inspectedIndex, setInspectedIndex] = useState<number | null>(null);
  const rawId = useId();
  const componentId = rawId.replace(/[^a-zA-Z0-9_-]/g, "");

  const journey = useMemo(
    () =>
      simulateMarketJourney({
        years,
        startingBalanceCents,
        weeklyContributionCents,
        annualReturnBps,
        riskLevel,
        marketSequence,
      }),
    [
      annualReturnBps,
      marketSequence,
      riskLevel,
      startingBalanceCents,
      weeklyContributionCents,
      years,
    ],
  );

  const { points, summary } = journey;
  const hasMoneyToSimulate = summary.totalContributionsCents > 0;
  const lastPointIndex = Math.max(0, points.length - 1);
  const activeIndex = Math.min(inspectedIndex ?? lastPointIndex, lastPointIndex);
  const inspectedPoint = points[activeIndex];
  const maxWeek = Math.max(1, points.at(-1)?.week ?? years * 52);
  const maxCents = Math.max(
    100,
    ...points.map((point) =>
      Math.max(point.portfolioValueCents, point.cumulativeContributionsCents),
    ),
  ) * 1.08;

  const portfolioPath = createLinePath(
    points,
    (point) => point.portfolioValueCents,
    maxWeek,
    maxCents,
  );
  const contributionsPath = createLinePath(
    points,
    (point) => point.cumulativeContributionsCents,
    maxWeek,
    maxCents,
  );
  const areaPath = points.length > 0
    ? `${portfolioPath} L${CHART.left + plotWidth} ${plotBottom} L${CHART.left} ${plotBottom} Z`
    : "";
  const regimeSegments = groupRegimes(points);
  const gradientId = `${componentId}-market-journey-area`;
  const chartTitleId = `${componentId}-market-journey-title`;
  const chartDescriptionId = `${componentId}-market-journey-description`;
  const yTicks = [0, .25, .5, .75, 1];
  const xTicks = [0, .25, .5, .75, 1];

  const activeX = CHART.left + (inspectedPoint.week / maxWeek) * plotWidth;
  const activeY = plotBottom -
    (inspectedPoint.portfolioValueCents / maxCents) * plotHeight;
  const recurringContributions = weeklyContributionCents > 0;
  const recoveryText = summary.recoveredByEnd
    ? typeof summary.recoveryWeeks === "number" && summary.recoveryWeeks > 0
      ? `The peak before the largest decline was regained after ${summary.recoveryWeeks} weeks`
      : "This path did not need to recover from a decline"
    : "The peak before the largest decline was not regained in this horizon";
  const endingPositionText = summary.currentDrawdownBps > 0
    ? `It ends ${formatBasisPoints(summary.currentDrawdownBps, 1)} below its latest path peak`
    : "It ends at a synthetic path high";
  const screenSummary = hasMoneyToSimulate
    ? `${years}-year synthetic journey with ${money(weeklyContributionCents, false)} added at the end of each week. Ending illustration ${money(summary.endingValueCents, false)} after ${money(summary.totalContributionsCents, false)} total contributions. Biggest synthetic weekly-checkpoint drop ${drawdown(summary.maxDrawdownBps)}. ${recoveryText}. ${endingPositionText}.`
    : `${years}-year synthetic market path. Add a starting amount or weekly contribution in My Horizon to see a money-based journey.`;
  const heading = experienceLevel === "new"
    ? "See how a steady habit can travel through market ups and downs."
    : "The habit is consistent. The market is not.";
  const riskLabel = experienceLevel === "advanced"
    ? "Illustrative volatility"
    : "Market bumpiness";
  const riskExplanation = riskLevel === "lower"
    ? "Narrower synthetic price swings—not lower-risk advice."
    : riskLevel === "higher"
      ? "Wider synthetic swings can deepen losses; they do not promise reward."
      : "Middle-sized synthetic swings, including meaningful declines.";
  const marketAnnualLabel = experienceLevel === "new"
    ? "Market’s annualized path"
    : experienceLevel === "advanced"
      ? "Realized market-path CAGR"
      : "Market-path annualized result";
  const dcaAnnualLabel = experienceLevel === "new"
    ? "Your annualized result"
    : experienceLevel === "advanced"
      ? "DCA money-weighted return"
      : "DCA annualized result";
  const volatilityLabel = experienceLevel === "new"
    ? "Market bumpiness"
    : experienceLevel === "advanced"
      ? "Realized volatility"
      : "Realized market swings";

  const resetInspection = () => setInspectedIndex(null);
  const selectYears = (next: HorizonYears) => {
    setYears(next);
    resetInspection();
  };
  const selectGrowth = (next: GrowthAssumptionBps) => {
    setAnnualReturnBps(next);
    resetInspection();
  };
  const selectRisk = (next: MarketRiskLevel) => {
    setRiskLevel(next);
    resetInspection();
  };
  const selectSequence = (next: MarketSequence) => {
    setMarketSequence(next);
    resetInspection();
  };
  const inspectFromPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const viewBoxX = ((event.clientX - bounds.left) / bounds.width) * CHART.width;
    const fraction = Math.min(
      1,
      Math.max(0, (viewBoxX - CHART.left) / plotWidth),
    );
    setInspectedIndex(Math.round(fraction * lastPointIndex));
  };

  const timeInMarketRows = [
    {
      label: "All simulated days included",
      value: summary.timeInMarket.stayedInvestedEndingValueCents,
      difference: 0,
    },
    {
      label: "Missed 5 strongest days",
      value: summary.timeInMarket.missedTop5Days.endingValueCents,
      difference: summary.timeInMarket.missedTop5Days.differenceCents,
    },
    {
      label: "Missed 10 strongest days",
      value: summary.timeInMarket.missedTop10Days.endingValueCents,
      difference: summary.timeInMarket.missedTop10Days.differenceCents,
    },
  ];
  const timeInMarketMax = Math.max(
    1,
    ...timeInMarketRows.map((row) => row.value),
  );

  return (
    <section
      className={styles.lab}
      aria-labelledby={`${componentId}-lab-title`}
      data-testid="market-journey"
    >
      <header className={styles.intro}>
        <div className={styles.introCopy}>
          <span className={styles.eyebrow}>
            <span className={styles.eyebrowMark} aria-hidden="true" />
            Market journey lab
          </span>
          <h2 id={`${componentId}-lab-title`}>{heading}</h2>
          <p>
            Explore one deterministic learning path through rising markets,
            pullbacks, deep declines, and possible recovery. The synthetic
            market index starts at 100; real markets do not follow a schedule.
            The growth setting shapes the path—it is not an expected return or
            target for any asset. It uses your plan’s starting amount and
            weekly habit, not the practice asset selected above.
          </p>
        </div>
        <span className={styles.simulationBadge}>
          <FlaskConical size={15} aria-hidden="true" /> Synthetic data · no forecast
        </span>
      </header>

      <div className={styles.controls}>
        <fieldset className={styles.controlGroup}>
          <legend>Time horizon</legend>
          <div className={styles.buttonRow}>
            {HORIZONS.map((option) => (
              <button
                key={option}
                className={styles.choice}
                type="button"
                aria-pressed={years === option}
                data-testid={`market-horizon-${option}`}
                onClick={() => selectYears(option)}
              >
                {option}y
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.controlGroup}>
          <legend>Long-term growth assumption</legend>
          <div className={styles.buttonRow}>
            {GROWTH_ASSUMPTIONS.map((option) => (
              <button
                key={option}
                className={styles.choice}
                type="button"
                aria-pressed={annualReturnBps === option}
                data-testid={`market-growth-${option}`}
                title="Shapes this synthetic path; not an expected return or target for an asset."
                onClick={() => selectGrowth(option)}
              >
                {formatBasisPoints(option, 0)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.controlGroup}>
          <legend>{riskLabel}</legend>
          <div className={styles.buttonRow}>
            {RISK_LEVELS.map((option) => (
              <button
                key={option.value}
                className={styles.choice}
                type="button"
                aria-pressed={riskLevel === option.value}
                data-testid={`market-risk-${option.value}`}
                title="Changes price variability, not the growth assumption or a promised reward."
                onClick={() => selectRisk(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.controlGroup}>
          <legend>Path sequence</legend>
          <div className={styles.buttonRow}>
            {MARKET_SEQUENCES.map((option) => (
              <button
                key={option.value}
                className={styles.choice}
                type="button"
                aria-pressed={marketSequence === option.value}
                data-testid={`market-sequence-${option.value}`}
                title="Changes the order of synthetic market phases; it is not a probability."
                onClick={() => selectSequence(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <p className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {years} years, {formatBasisPoints(annualReturnBps)} long-term growth
        assumption, {riskLevel} market bumpiness, {marketSequence} sequence. {screenSummary}
      </p>

      {hasMoneyToSimulate ? (
        <div className={styles.journeyGrid}>
        <figure className={styles.chartCard} data-testid="market-journey-chart">
          <div className={styles.chartHeader}>
            <div>
              <span>Portfolio value versus money added</span>
              <h3>A steady habit through an uneven market</h3>
            </div>
            <div className={styles.inspectValue} aria-hidden="true">
              <strong>{money(inspectedPoint.portfolioValueCents)}</strong>
              <small>{pointYear(inspectedPoint)} · index {indexLevel(inspectedPoint)}</small>
            </div>
          </div>

          <div className={styles.chartFrame}>
            <svg
              className={styles.chart}
              viewBox={`0 0 ${CHART.width} ${CHART.height}`}
              preserveAspectRatio="none"
              role="img"
              aria-labelledby={`${chartTitleId} ${chartDescriptionId}`}
              onPointerMove={inspectFromPointer}
            >
              <title id={chartTitleId}>Synthetic market journey</title>
              <desc id={chartDescriptionId}>{screenSummary}</desc>
              <defs>
                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="var(--accent-on-hero)" stopOpacity=".88" />
                  <stop offset="1" stopColor="var(--accent-on-hero)" stopOpacity="0" />
                </linearGradient>
                <clipPath id={`${componentId}-plot-clip`}>
                  <rect x={CHART.left} y={CHART.top} width={plotWidth} height={plotHeight} />
                </clipPath>
              </defs>

              <g clipPath={`url(#${componentId}-plot-clip)`}>
                {regimeSegments.map((segment, index) => {
                  const x = CHART.left + (segment.startWeek / maxWeek) * plotWidth;
                  const endWeekExclusive = Math.min(maxWeek, segment.endWeek + 1);
                  const endX = CHART.left + (endWeekExclusive / maxWeek) * plotWidth;
                  const width = Math.max(1, endX - x);
                  const presentation = regimePresentation(segment.regime, experienceLevel);
                  return (
                    <g key={`${segment.regime}-${segment.startWeek}-${index}`}>
                      <rect
                        className={`${styles.regimeBand} ${presentation.className}`}
                        x={x}
                        y={CHART.top}
                        width={width}
                        height={plotHeight}
                      />
                      {width > 48 && (
                        <text
                          className={styles.regimeLabel}
                          x={x + 7}
                          y={CHART.top + 14}
                        >
                          {presentation.label}
                        </text>
                      )}
                    </g>
                  );
                })}

                {yTicks.map((tick) => {
                  const y = plotBottom - tick * plotHeight;
                  return (
                    <line
                      key={tick}
                      className={styles.gridLine}
                      x1={CHART.left}
                      x2={CHART.left + plotWidth}
                      y1={y}
                      y2={y}
                    />
                  );
                })}

                <path
                  className={styles.portfolioArea}
                  d={areaPath}
                  fill={`url(#${gradientId})`}
                />
                <path className={styles.contributionLine} d={contributionsPath} />
                <path className={styles.portfolioLine} d={portfolioPath} />
                <line
                  className={styles.guideLine}
                  x1={activeX}
                  x2={activeX}
                  y1={CHART.top}
                  y2={plotBottom}
                />
                <circle className={styles.guideDotOuter} cx={activeX} cy={activeY} r="10" />
                <circle className={styles.guideDot} cx={activeX} cy={activeY} r="4.5" />
              </g>

              {yTicks.map((tick) => {
                const y = plotBottom - tick * plotHeight;
                return (
                  <text
                    key={tick}
                    className={styles.axisLabel}
                    x={CHART.left - 9}
                    y={y + 3}
                    textAnchor="end"
                  >
                    {money(Math.round(maxCents * tick))}
                  </text>
                );
              })}
              {xTicks.map((tick) => {
                const shownYears = years * tick;
                const label = tick === 0
                  ? "Start"
                  : shownYears < 1
                    ? `${Math.round(shownYears * 12)}m`
                    : `${Number.isInteger(shownYears) ? shownYears : shownYears.toFixed(1)}y`;
                return (
                  <text
                    key={tick}
                    className={styles.axisLabel}
                    x={CHART.left + tick * plotWidth}
                    y={CHART.height - 15}
                    textAnchor={tick === 0 ? "start" : tick === 1 ? "end" : "middle"}
                  >
                    {label}
                  </text>
                );
              })}
            </svg>
          </div>

          <div className={styles.scrubberWrap}>
            <span>Start</span>
            <input
              className={styles.scrubber}
              type="range"
              min="0"
              max={lastPointIndex}
              step="1"
              value={activeIndex}
              aria-label="Inspect a week in the synthetic market journey"
              aria-valuetext={`${pointYear(inspectedPoint)}, portfolio ${money(inspectedPoint.portfolioValueCents, false)}, synthetic index ${indexLevel(inspectedPoint)}`}
              onChange={(event) => setInspectedIndex(Number(event.target.value))}
            />
            <span>{years} years</span>
          </div>

          <div className={styles.chartLegend} aria-hidden="true">
            <span className={styles.legendItem}><i className={styles.legendLine} /> Portfolio</span>
            <span className={styles.legendItem}><i className={styles.legendDash} /> Money added</span>
            <span className={styles.legendSeasons}>
              <i /><i /><i /> Shaded bands mark synthetic market phases
            </span>
          </div>
          <figcaption className={styles.srOnly}>{screenSummary}</figcaption>
        </figure>

        <div className={styles.sideMetrics} aria-label="Journey summary">
          <article className={styles.sideMetric}>
            <span>Ending illustration</span>
            <strong>{money(summary.endingValueCents)}</strong>
            <small>One synthetic path, not an estimate</small>
          </article>
          <article className={styles.sideMetric}>
            <span>You added</span>
            <strong>{money(summary.totalContributionsCents)}</strong>
            <small>Starting amount + weekly habit</small>
          </article>
          <article className={`${styles.sideMetric} ${summary.growthCents < 0 ? styles.loss : styles.growth}`}>
            <span>Simulated change</span>
            <strong>{signedMoney(summary.growthCents)}</strong>
            <small>Ending value minus money added</small>
          </article>
        </div>
        </div>
      ) : (
        <div className={styles.emptyState} data-testid="market-journey-empty" role="status">
          <span><FlaskConical size={21} aria-hidden="true" /></span>
          <div>
            <h3>Give the journey something to carry.</h3>
            <p>Set a starting amount or weekly contribution in My Horizon. The synthetic market-path lessons below still work without money.</p>
          </div>
        </div>
      )}

      <div className={styles.riskStrip}>
        <div className={styles.riskIntro}>
          <strong>Risk has more than one shape</strong>
          <span data-testid="market-recovery-status">{riskExplanation} {recoveryText}. {endingPositionText}.</span>
        </div>
        <div className={styles.riskMetric}>
          <span>{marketAnnualLabel}</span>
          <strong>{optionalBasisPoints(summary.realizedMarketCagrBps)}</strong>
          <small>Synthetic index, start to finish</small>
        </div>
        <div className={styles.riskMetric}>
          <span>{dcaAnnualLabel}</span>
          <strong>{recurringContributions ? optionalBasisPoints(summary.moneyWeightedAnnualReturnBps) : "—"}</strong>
          <small>{recurringContributions ? "Reflects when weekly money was added" : "No recurring deposits"}</small>
        </div>
        <div className={styles.riskMetric}>
          <span>Biggest simulated drop</span>
          <strong>{drawdown(summary.maxDrawdownBps)}</strong>
          <small>At weekly market checkpoints</small>
        </div>
        <div className={styles.riskMetric}>
          <span>{volatilityLabel}</span>
          <strong>{optionalBasisPoints(summary.annualizedVolatilityBps)}</strong>
          <small>{experienceLevel === "new" ? "How sharply this path moved" : "Annualized path variability"}</small>
        </div>
      </div>

      <div className={styles.lessonGrid}>
        <article className={styles.lesson}>
          <span className={styles.lessonKicker}><Info size={15} aria-hidden="true" /> Two returns, two questions</span>
          <h3>{experienceLevel === "new" ? "The market’s result is not always your result." : "Market CAGR is not your DCA return."}</h3>
          <p>
            The same market path can produce a different personal result when
            money arrives throughout the journey.
          </p>
          <dl className={styles.definitionList}>
            <div>
              <dt>{experienceLevel === "new" ? "Market’s annualized path" : "Market CAGR"}</dt>
              <dd>Annualized change in the synthetic index from 100 to its ending level. It ignores contributions.</dd>
            </div>
            <div>
              <dt>{experienceLevel === "new" ? "Your annualized result" : "DCA annualized return"}</dt>
              <dd>Money-weighted result reflecting when 52 end-of-week contributions arrive each year.</dd>
            </div>
          </dl>
        </article>

        <article className={styles.bestDays}>
          <span className={styles.lessonKicker}><FlaskConical size={15} aria-hidden="true" /> Sequence lesson</span>
          <h3>Days you can’t predict</h3>
          <p>
            Strong days can cluster near sharp declines. This deterministic
            comparison removes the strongest synthetic days after the fact;
            it is not timing advice. Including all days also means experiencing
            every simulated decline and loss.
          </p>
          {hasMoneyToSimulate ? (
            <div className={styles.bestDaysRows}>
              {timeInMarketRows.map((row) => {
                const width = Math.max(0, (row.value / timeInMarketMax) * 100);
                const differenceText = row.difference > 0
                  ? `${money(row.difference, false)} below the all-days illustration`
                  : "Full synthetic illustration";
                return (
                  <div
                    className={styles.bestDaysRow}
                    key={row.label}
                    title={differenceText}
                    aria-label={`${row.label}: ${money(row.value, false)}. ${differenceText}.`}
                  >
                    <span>{row.label}</span>
                    <span className={styles.bestDaysBar} aria-hidden="true">
                      <i style={{ width: `${width}%` }} />
                    </span>
                    <strong>{money(row.value)}</strong>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className={styles.emptyComparison}>Add a plan amount to compare money-based all-days and missed-days illustrations.</p>
          )}
        </article>
      </div>

      <aside className={styles.disclosure}>
        <Info size={15} aria-hidden="true" />
        <p>
          <strong>Synthetic learning path—not a forecast.</strong> This is one
          deterministic illustration, not historical performance, a
          probability, recommendation, or expected return. Real results may be
          substantially lower, including loss of principal, and may not recover
          during the period shown. Past performance would not predict future
          results. Taxes, fees, spreads, withdrawals, distributions, inflation,
          and asset-specific fundamentals are not modeled. Starting money and
          each end-of-week contribution are fully invested in one synthetic
          index. Regular contributions do not guarantee profit or protect
          against loss. This educational simulation is not financial advice.
        </p>
      </aside>
    </section>
  );
}

export default MarketJourney;
