"use client";

import {
  Check,
  CircleAlert,
  Clock3,
  Database,
  ExternalLink,
  Info,
  LineChart,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  formatBasisPoints,
  formatCurrencyCents,
} from "../../src/domain";
import styles from "./PracticeMarketPanel.module.css";

export type PracticeQuoteFreshness =
  | "live"
  | "fresh"
  | "delayed"
  | "stale"
  | "sample"
  | "unavailable";

export type EducationalRiskLevel =
  | "lower"
  | "medium"
  | "higher"
  | "very-high";

export type PracticeRefreshStatus =
  | "idle"
  | "loading"
  | "success"
  | "error";

export interface PracticeMarketQuote {
  priceCents: number | null;
  change1dBps?: number | null;
  change1dLabel?: string;
  change1yBps?: number | null;
  change1yLabel?: string;
  asOf: string | null;
  sourceName: string;
  sourceUrl?: string;
  freshness: PracticeQuoteFreshness;
  freshnessNote?: string;
  methodology?: string;
}

export interface PracticeHistoryPoint {
  timestamp: string;
  priceCents: number;
}

export interface PracticeMarketHistory {
  periodLabel: string;
  kind?: "historical" | "synthetic";
  limited?: boolean;
  points: readonly PracticeHistoryPoint[];
  sourceName?: string;
  sourceUrl?: string;
  asOf?: string | null;
  methodology?: string;
}

export interface PracticeMarketAsset {
  symbol: string;
  name: string;
  category: string;
  shortDescription: string;
  whatItIs: string;
  educationalRisk: {
    level: EducationalRiskLevel;
    label?: string;
    summary: string;
    methodology: string;
  };
  quote: PracticeMarketQuote;
  history?: PracticeMarketHistory | null;
  selectable?: boolean;
}

export interface PracticeMarketPanelProps {
  assets: readonly PracticeMarketAsset[];
  selectedSymbol: string;
  onSelect: (symbol: string) => void;
  onRefresh: () => void | Promise<void>;
  onRequestHistory?: (symbol: string) => void | Promise<void>;
  refreshStatus: PracticeRefreshStatus;
  refreshError?: string | null;
  lastRefreshedAt?: string | null;
  title?: string;
  description?: string;
}

type FreshnessPresentation = {
  label: string;
  className: string;
};

type HistoryRequestState = {
  symbol: string;
  status: "loading" | "error";
};

const CHART = {
  width: 680,
  height: 236,
  left: 62,
  right: 18,
  top: 20,
  bottom: 35,
} as const;

const plotWidth = CHART.width - CHART.left - CHART.right;
const plotHeight = CHART.height - CHART.top - CHART.bottom;
const plotBottom = CHART.height - CHART.bottom;

function formatMoney(cents: number | null, compact = false): string {
  if (cents === null) return "Unavailable";
  return formatCurrencyCents(cents, {
    compact,
    showCents: !compact,
  });
}

function formatChange(basisPoints: number | null | undefined): string {
  if (typeof basisPoints !== "number") return "Not provided";
  return `${basisPoints > 0 ? "+" : ""}${formatBasisPoints(basisPoints, 2)}`;
}

function changeClass(basisPoints: number | null | undefined): string {
  if (typeof basisPoints !== "number" || basisPoints === 0) {
    return styles.changeNeutral;
  }
  return basisPoints > 0 ? styles.changePositive : styles.changeNegative;
}

function formatTimestamp(timestamp: string | null | undefined): string {
  if (!timestamp) return "Not provided";
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return "Not provided";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(value);
}

function formatChartDate(timestamp: string): string {
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(value);
}

function externalHttpUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function freshnessPresentation(
  freshness: PracticeQuoteFreshness,
): FreshnessPresentation {
  switch (freshness) {
    case "live":
      return {
        label: "Source reports live",
        className: styles.freshnessLive,
      };
    case "fresh":
      return { label: "Fresh", className: styles.freshnessFresh };
    case "delayed":
      return { label: "Delayed", className: styles.freshnessDelayed };
    case "stale":
      return { label: "Stale", className: styles.freshnessStale };
    case "sample":
      return { label: "Sample", className: styles.freshnessSample };
    case "unavailable":
      return {
        label: "Unavailable",
        className: styles.freshnessUnavailable,
      };
  }
}

function riskLabel(asset: PracticeMarketAsset): string {
  if (asset.educationalRisk.label) return asset.educationalRisk.label;
  switch (asset.educationalRisk.level) {
    case "lower":
      return "Lower variability";
    case "medium":
      return "Moderate variability";
    case "higher":
      return "Higher variability";
    case "very-high":
      return "Very high variability";
  }
}

function riskClass(level: EducationalRiskLevel): string {
  switch (level) {
    case "lower":
      return styles.riskLower;
    case "medium":
      return styles.riskModerate;
    case "higher":
      return styles.riskHigher;
    case "very-high":
      return styles.riskVeryHigh;
  }
}

function refreshSummary(
  assets: readonly PracticeMarketAsset[],
  refreshStatus: PracticeRefreshStatus,
): string {
  if (refreshStatus === "loading") return "Refreshing educational prices…";
  if (refreshStatus === "error") return "Price refresh did not complete";
  if (assets.length === 0) return "No practice assets available";

  const freshness = new Set(assets.map((asset) => asset.quote.freshness));
  if (freshness.size > 1) return "Mixed quote freshness";
  const only = assets[0]?.quote.freshness ?? "unavailable";
  switch (only) {
    case "live":
      return "Sources report live prices";
    case "fresh":
      return "Fresh educational prices";
    case "delayed":
      return "Delayed educational prices";
    case "stale":
      return "Stale educational prices";
    case "sample":
      return "Deterministic sample prices";
    case "unavailable":
      return "Prices unavailable";
  }
}

function HistoryChart({
  asset,
  requestStatus,
  onRetry,
}: {
  asset: PracticeMarketAsset;
  requestStatus?: "loading" | "error";
  onRetry?: () => void;
}) {
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const history = asset.history;
  const isSynthetic = history?.kind === "synthetic";
  const points = useMemo(
    () =>
      [...(history?.points ?? [])]
        .filter(
          (point) =>
            Number.isSafeInteger(point.priceCents) &&
            point.priceCents >= 0 &&
            !Number.isNaN(Date.parse(point.timestamp)),
        )
        .sort(
          (first, second) =>
            Date.parse(first.timestamp) - Date.parse(second.timestamp),
        ),
    [history?.points],
  );

  if (!history || points.length < 2) {
    if (requestStatus === "loading") {
      return (
        <div className={styles.historyEmpty} role="status" aria-live="polite">
          <RefreshCw className={styles.spinning} size={22} aria-hidden="true" />
          <div>
            <strong>Loading historical context…</strong>
            <span>Requesting only this asset’s educational 1-year series.</span>
          </div>
        </div>
      );
    }

    if (requestStatus === "error") {
      return (
        <div className={styles.historyEmpty} role="alert">
          <CircleAlert size={22} aria-hidden="true" />
          <div>
            <strong>Historical context could not be loaded.</strong>
            <span>The current quote remains labeled and available.</span>
            {onRetry && (
              <button className={styles.historyRetry} type="button" onClick={onRetry}>
                Try history again
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className={styles.historyEmpty} role="status">
        <LineChart size={24} aria-hidden="true" />
        <div>
          <strong>Historical series unavailable</strong>
          <span>No chart has been invented or extrapolated for this asset.</span>
        </div>
      </div>
    );
  }

  const values = points.map((point) => point.priceCents);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rawRange = Math.max(1, rawMax - rawMin);
  const min = Math.max(0, rawMin - rawRange * .1);
  const max = rawMax + rawRange * .1;
  const range = Math.max(1, max - min);
  const firstTime = Date.parse(points[0].timestamp);
  const lastTime = Date.parse(points.at(-1)!.timestamp);
  const timeRange = Math.max(1, lastTime - firstTime);
  const coordinates = points.map((point) => ({
    x:
      CHART.left +
      ((Date.parse(point.timestamp) - firstTime) / timeRange) * plotWidth,
    y: plotBottom - ((point.priceCents - min) / range) * plotHeight,
  }));
  const linePath = coordinates
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");
  const areaPath = `${linePath} L${coordinates.at(-1)!.x.toFixed(2)} ${plotBottom} L${coordinates[0].x.toFixed(2)} ${plotBottom} Z`;
  const startValue = points[0].priceCents;
  const endValue = points.at(-1)!.priceCents;
  const direction = endValue >= startValue ? "up" : "down";
  const titleId = `${id}-history-title`;
  const descriptionId = `${id}-history-description`;
  const gradientId = `${id}-history-gradient`;
  const summary = isSynthetic
    ? `${asset.symbol} ${history.periodLabel} synthetic educational series from ${formatChartDate(points[0].timestamp)} to ${formatChartDate(points.at(-1)!.timestamp)}, starting at ${formatMoney(startValue)} and ending at ${formatMoney(endValue)}. This is not actual historical performance.`
    : `${asset.symbol} ${history.periodLabel} historical series from ${formatChartDate(points[0].timestamp)} to ${formatChartDate(points.at(-1)!.timestamp)}, starting at ${formatMoney(startValue)} and ending at ${formatMoney(endValue)}. Past performance does not predict future results.`;
  const historySourceUrl = externalHttpUrl(history.sourceUrl);
  const yTicks = [0, .5, 1];

  return (
    <figure className={styles.historyFigure}>
      <div className={styles.historyHeading}>
        <div>
          <span>
            {isSynthetic
              ? `${history.periodLabel} synthetic sample path`
              : `${history.periodLabel} historical price path`}
          </span>
          <strong>{formatMoney(endValue)}</strong>
        </div>
        <small>{formatChartDate(points[0].timestamp)} — {formatChartDate(points.at(-1)!.timestamp)}</small>
      </div>
      <svg
        className={styles.historyChart}
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title id={titleId}>
          {asset.symbol} {isSynthetic ? "synthetic sample path" : "historical price path"}
        </title>
        <desc id={descriptionId}>{summary}</desc>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--secondary)" stopOpacity=".32" />
            <stop offset="1" stopColor="var(--secondary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((tick) => {
          const y = plotBottom - tick * plotHeight;
          return (
            <g key={tick}>
              <line
                className={styles.chartGrid}
                x1={CHART.left}
                x2={CHART.left + plotWidth}
                y1={y}
                y2={y}
              />
              <text
                className={styles.chartLabel}
                x={CHART.left - 9}
                y={y + 3}
                textAnchor="end"
              >
                {formatMoney(Math.round(min + tick * range), true)}
              </text>
            </g>
          );
        })}
        <path
          className={styles.historyArea}
          d={areaPath}
          fill={`url(#${gradientId})`}
        />
        <path
          className={direction === "up" ? styles.historyLineUp : styles.historyLineDown}
          d={linePath}
        />
        <circle
          className={direction === "up" ? styles.historyEndUp : styles.historyEndDown}
          cx={coordinates.at(-1)!.x}
          cy={coordinates.at(-1)!.y}
          r="4"
        />
        <text className={styles.chartLabel} x={CHART.left} y={CHART.height - 10}>
          {formatChartDate(points[0].timestamp)}
        </text>
        <text
          className={styles.chartLabel}
          x={CHART.left + plotWidth}
          y={CHART.height - 10}
          textAnchor="end"
        >
          {formatChartDate(points.at(-1)!.timestamp)}
        </text>
      </svg>
      <figcaption>
        <span>
          Source: {historySourceUrl ? (
            <a href={historySourceUrl} target="_blank" rel="noreferrer">
              {history.sourceName ?? asset.quote.sourceName}
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          ) : (
            history.sourceName ?? asset.quote.sourceName
          )}
          {history.asOf ? ` · as of ${formatTimestamp(history.asOf)}` : ""}
        </span>
        {history.methodology && <span>{history.methodology}</span>}
        {history.limited && (
          <span>History is limited to available observations.</span>
        )}
        <strong>
          {isSynthetic
            ? "Synthetic teaching data—not actual historical performance."
            : "Past performance does not predict future results."}
        </strong>
      </figcaption>
    </figure>
  );
}

export function PracticeMarketPanel({
  assets,
  selectedSymbol,
  onSelect,
  onRefresh,
  onRequestHistory,
  refreshStatus,
  refreshError,
  lastRefreshedAt,
  title = "Choose a practice asset",
  description = "Compare broad funds, individual companies, and crypto assets before making a simulated purchase. Inclusion is not endorsement.",
}: PracticeMarketPanelProps) {
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);
  const [historyRequest, setHistoryRequest] =
    useState<HistoryRequestState | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const detailAsset = assets.find((asset) => asset.symbol === detailSymbol) ?? null;
  const isRefreshing = refreshStatus === "loading";
  const marketSummary = refreshSummary(assets, refreshStatus);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!detailAsset || !dialog || dialog.open) return;
    dialog.showModal();
    closeButtonRef.current?.focus();
  }, [detailAsset]);

  const requestHistory = (asset: PracticeMarketAsset) => {
    if (
      asset.history ||
      !onRequestHistory ||
      (historyRequest?.symbol === asset.symbol &&
        historyRequest.status === "loading")
    ) {
      return;
    }
    setHistoryRequest({ symbol: asset.symbol, status: "loading" });
    try {
      void Promise.resolve(onRequestHistory(asset.symbol))
        .then(() => {
          setHistoryRequest((current) =>
            current?.symbol === asset.symbol ? null : current,
          );
        })
        .catch(() => {
          setHistoryRequest((current) =>
            current?.symbol === asset.symbol
              ? { symbol: asset.symbol, status: "error" }
              : current,
          );
        });
    } catch {
      setHistoryRequest({ symbol: asset.symbol, status: "error" });
    }
  };

  const openDetail = (
    asset: PracticeMarketAsset,
    trigger: HTMLButtonElement,
  ) => {
    detailTriggerRef.current = trigger;
    setDetailSymbol(asset.symbol);
    requestHistory(asset);
  };

  const handleDialogClosed = () => {
    setDetailSymbol(null);
    detailTriggerRef.current?.focus();
  };

  const closeDetail = () => {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.close();
      return;
    }
    handleDialogClosed();
  };

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) closeDetail();
  };

  const requestRefresh = () => {
    if (isRefreshing) return;
    try {
      void Promise.resolve(onRefresh()).catch(() => undefined);
    } catch {
      // The parent owns refresh error state; prevent a click from breaking UI.
    }
  };

  const selectFromDetail = (asset: PracticeMarketAsset) => {
    onSelect(asset.symbol);
    closeDetail();
  };

  return (
    <section
      className={styles.marketPanel}
      aria-labelledby={`${id}-practice-market-title`}
      aria-busy={isRefreshing}
      data-testid="practice-market-panel"
    >
      <header className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>Practice market</span>
          <h2 id={`${id}-practice-market-title`}>{title}</h2>
          <p>{description}</p>
        </div>
        <div className={styles.refreshBlock}>
          <span className={styles.marketFreshness}>
            <Clock3 size={14} aria-hidden="true" />
            {marketSummary}
          </span>
          <button
            className={styles.refreshButton}
            type="button"
            onClick={requestRefresh}
            disabled={isRefreshing}
            data-testid="refresh-practice-prices"
          >
            <RefreshCw
              className={isRefreshing ? styles.spinning : undefined}
              size={16}
              aria-hidden="true"
            />
            {isRefreshing ? "Refreshing…" : "Refresh prices"}
          </button>
          {lastRefreshedAt && (
            <small>Last checked {formatTimestamp(lastRefreshedAt)}</small>
          )}
        </div>
      </header>

      <div className={styles.refreshStatus} aria-live="polite" aria-atomic="true">
        {refreshStatus === "error" ? (
          <div className={styles.refreshError} role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            <span>
              <strong>Prices could not be refreshed.</strong>
              {refreshError ?? "Existing educational prices remain clearly labeled below."}
            </span>
          </div>
        ) : refreshStatus === "success" ? (
          <span className={styles.srOnly}>Educational price refresh completed.</span>
        ) : isRefreshing ? (
          <span className={styles.srOnly}>Refreshing educational prices.</span>
        ) : null}
      </div>

      {assets.length > 0 ? (
        <div className={styles.assetGrid}>
          {assets.map((asset) => {
            const selected = asset.symbol === selectedSymbol;
            const freshness = freshnessPresentation(asset.quote.freshness);
            const canSelect =
              asset.selectable !== false && asset.quote.priceCents !== null;
            return (
              <article
                className={styles.assetCard}
                data-selected={selected ? "true" : "false"}
                key={asset.symbol}
                data-testid={`practice-market-asset-${asset.symbol}`}
              >
                <div className={styles.assetCardHeader}>
                  <span className={styles.assetMark} aria-hidden="true">
                    {asset.symbol.slice(0, 4)}
                  </span>
                  <div>
                    <h3>{asset.symbol}</h3>
                    <span>{asset.name}</span>
                  </div>
                  <span className={`${styles.freshnessBadge} ${freshness.className}`}>
                    {freshness.label}
                  </span>
                </div>

                <div className={styles.assetPrice}>
                  <span>Educational quote</span>
                  <strong>{formatMoney(asset.quote.priceCents)}</strong>
                  <small>{asset.category}</small>
                </div>

                {(typeof asset.quote.change1dBps === "number" ||
                  typeof asset.quote.change1yBps === "number") && (
                  <dl className={styles.quickPerformance}>
                    {typeof asset.quote.change1dBps === "number" && (
                      <div>
                        <dt>{asset.quote.change1dLabel ?? "1D"}</dt>
                        <dd className={changeClass(asset.quote.change1dBps)}>
                          {formatChange(asset.quote.change1dBps)}
                        </dd>
                      </div>
                    )}
                    {typeof asset.quote.change1yBps === "number" && (
                      <div>
                        <dt>{asset.quote.change1yLabel ?? "1Y"}</dt>
                        <dd className={changeClass(asset.quote.change1yBps)}>
                          {formatChange(asset.quote.change1yBps)}
                        </dd>
                      </div>
                    )}
                  </dl>
                )}

                <p>{asset.shortDescription}</p>
                <span className={`${styles.riskBadge} ${riskClass(asset.educationalRisk.level)}`}>
                  <ShieldAlert size={13} aria-hidden="true" />
                  {riskLabel(asset)}
                </span>

                <div className={styles.cardActions}>
                  <button
                    className={selected ? styles.selectedButton : styles.selectButton}
                    type="button"
                    aria-pressed={selected}
                    disabled={!canSelect}
                    onClick={() => onSelect(asset.symbol)}
                    data-testid={`select-practice-asset-${asset.symbol}`}
                  >
                    {selected ? <Check size={15} aria-hidden="true" /> : null}
                    {selected
                      ? "Selected for practice"
                      : canSelect
                        ? "Use in practice"
                        : "Price unavailable"}
                  </button>
                  <button
                    className={styles.infoButton}
                    type="button"
                    aria-label={`Learn about ${asset.name} (${asset.symbol})`}
                    onClick={(event) => openDetail(asset, event.currentTarget)}
                    data-testid={`practice-asset-info-${asset.symbol}`}
                  >
                    <Info size={16} aria-hidden="true" />
                    Details
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className={styles.emptyMarket}>
          <Database size={25} aria-hidden="true" />
          <strong>No practice assets are available.</strong>
          <span>Try refreshing, or continue using the rest of Practice offline.</span>
        </div>
      )}

      <footer className={styles.panelDisclosure}>
        <Info size={14} aria-hidden="true" />
        <p>
          Prices and performance are educational inputs with source and freshness
          labels—not trading quotes. Selection is simulated and does not place an
          order. Past performance does not predict future results.
        </p>
      </footer>

      <dialog
        className={styles.detailDialog}
        ref={dialogRef}
        aria-labelledby={`${id}-asset-detail-title`}
        aria-describedby={`${id}-asset-detail-disclosure`}
        onClose={handleDialogClosed}
        onCancel={(event) => {
          event.preventDefault();
          closeDetail();
        }}
        onClick={handleBackdropClick}
        data-testid="practice-asset-detail"
      >
        {detailAsset && (
          <div className={styles.detailSheet}>
            <header className={styles.detailHeader}>
              <div className={styles.detailIdentity}>
                <span className={styles.detailMark} aria-hidden="true">
                  {detailAsset.symbol.slice(0, 4)}
                </span>
                <div>
                  <span>{detailAsset.category}</span>
                  <h2 id={`${id}-asset-detail-title`}>
                    {detailAsset.name} <small>{detailAsset.symbol}</small>
                  </h2>
                </div>
              </div>
              <button
                className={styles.closeButton}
                type="button"
                onClick={closeDetail}
                ref={closeButtonRef}
                aria-label={`Close ${detailAsset.symbol} details`}
                autoFocus
              >
                <X size={19} aria-hidden="true" />
              </button>
            </header>

            <div className={styles.detailBody}>
              <div className={styles.detailPriceRow}>
                <div>
                  <span>Educational quote</span>
                  <strong>{formatMoney(detailAsset.quote.priceCents)}</strong>
                </div>
                {typeof detailAsset.quote.change1dBps === "number" && (
                  <div>
                    <span>{detailAsset.quote.change1dLabel ?? "1 day"}</span>
                    <strong className={changeClass(detailAsset.quote.change1dBps)}>
                      {detailAsset.quote.change1dBps >= 0 ? (
                        <TrendingUp size={15} aria-hidden="true" />
                      ) : (
                        <TrendingDown size={15} aria-hidden="true" />
                      )}
                      {formatChange(detailAsset.quote.change1dBps)}
                    </strong>
                  </div>
                )}
                {typeof detailAsset.quote.change1yBps === "number" && (
                  <div>
                    <span>{detailAsset.quote.change1yLabel ?? "1 year"}</span>
                    <strong className={changeClass(detailAsset.quote.change1yBps)}>
                      {detailAsset.quote.change1yBps >= 0 ? (
                        <TrendingUp size={15} aria-hidden="true" />
                      ) : (
                        <TrendingDown size={15} aria-hidden="true" />
                      )}
                      {formatChange(detailAsset.quote.change1yBps)}
                    </strong>
                  </div>
                )}
              </div>

              <HistoryChart
                asset={detailAsset}
                requestStatus={
                  historyRequest?.symbol === detailAsset.symbol
                    ? historyRequest.status
                    : undefined
                }
                onRetry={
                  onRequestHistory
                    ? () => requestHistory(detailAsset)
                    : undefined
                }
              />

              <div className={styles.educationGrid}>
                <article>
                  <span className={styles.detailKicker}>What it is</span>
                  <h3>{detailAsset.category}</h3>
                  <p>{detailAsset.whatItIs}</p>
                </article>
                <article>
                  <span className={styles.detailKicker}>Educational risk view</span>
                  <h3>{riskLabel(detailAsset)}</h3>
                  <p>{detailAsset.educationalRisk.summary}</p>
                  <small>{detailAsset.educationalRisk.methodology}</small>
                </article>
              </div>

              <section className={styles.provenance} aria-labelledby={`${id}-provenance-title`}>
                <div>
                  <Database size={17} aria-hidden="true" />
                  <h3 id={`${id}-provenance-title`}>Quote provenance</h3>
                </div>
                <dl>
                  <div>
                    <dt>Source</dt>
                    <dd>
                      {externalHttpUrl(detailAsset.quote.sourceUrl) ? (
                        <a
                          href={externalHttpUrl(detailAsset.quote.sourceUrl)!}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {detailAsset.quote.sourceName}
                          <ExternalLink size={12} aria-hidden="true" />
                        </a>
                      ) : (
                        detailAsset.quote.sourceName
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Freshness</dt>
                    <dd>{freshnessPresentation(detailAsset.quote.freshness).label}</dd>
                  </div>
                  <div>
                    <dt>As of</dt>
                    <dd>{formatTimestamp(detailAsset.quote.asOf)}</dd>
                  </div>
                  {detailAsset.quote.freshnessNote && (
                    <div>
                      <dt>Freshness note</dt>
                      <dd>{detailAsset.quote.freshnessNote}</dd>
                    </div>
                  )}
                  {detailAsset.quote.methodology && (
                    <div>
                      <dt>Quote method</dt>
                      <dd>{detailAsset.quote.methodology}</dd>
                    </div>
                  )}
                </dl>
              </section>

              <aside
                className={styles.detailDisclosure}
                id={`${id}-asset-detail-disclosure`}
              >
                <CircleAlert size={16} aria-hidden="true" />
                <p>
                  <strong>Educational simulation—not financial advice.</strong>
                  Past price movement and short-term changes do not predict future
                  results. Prices can fall, losses can be permanent, and the
                  variability label is a teaching aid—not a suitability assessment
                  or complete measure of risk.
                </p>
              </aside>
            </div>

            <footer className={styles.detailFooter}>
              <button className={styles.secondaryButton} type="button" onClick={closeDetail}>
                Close
              </button>
              <button
                className={styles.primaryButton}
                type="button"
                disabled={
                  detailAsset.selectable === false ||
                  detailAsset.quote.priceCents === null
                }
                onClick={() => selectFromDetail(detailAsset)}
              >
                {detailAsset.symbol === selectedSymbol
                  ? "Keep selected"
                  : "Use in practice"}
              </button>
            </footer>
          </div>
        )}
      </dialog>
    </section>
  );
}

export default PracticeMarketPanel;
