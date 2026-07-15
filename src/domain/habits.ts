import { DomainValidationError, assertIsoDateTime } from "./money";

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1_000;

export interface HabitLog {
  /** Unique ISO week keys such as 2026-W29. */
  completedWeekKeys: string[];
}

export interface HabitMilestone {
  id: string;
  weeks: number;
  label: string;
}

export interface HabitProgress {
  totalCompletedWeeks: number;
  currentStreakWeeks: number;
  longestStreakWeeks: number;
  earnedMilestoneIds: string[];
  nextMilestone: (HabitMilestone & { remainingWeeks: number }) | null;
}

export const HABIT_MILESTONES = [
  { id: "first-step", weeks: 1, label: "First step" },
  { id: "four-weeks", weeks: 4, label: "Four weeks forward" },
  { id: "twelve-weeks", weeks: 12, label: "Quarter-year rhythm" },
  { id: "half-year", weeks: 26, label: "Half-year habit" },
  { id: "one-year", weeks: 52, label: "One year of consistency" },
] as const satisfies readonly HabitMilestone[];

export function createHabitLog(): HabitLog {
  return { completedWeekKeys: [] };
}

function mondayStartUtc(date: Date): Date {
  const result = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = result.getUTCDay() || 7;
  result.setUTCDate(result.getUTCDate() - day + 1);
  return result;
}

export function isoWeekKey(dateLike: Date | string): string {
  const date = dateLike instanceof Date ? new Date(dateLike) : new Date(dateLike);
  if (!Number.isFinite(date.getTime())) {
    throw new DomainValidationError("date", "date must be valid.");
  }

  const thursday = mondayStartUtc(date);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const weekYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(weekYear, 0, 4));
  const firstMonday = mondayStartUtc(firstThursday);
  const currentMonday = mondayStartUtc(date);
  const week = Math.round(
    (currentMonday.getTime() - firstMonday.getTime()) / WEEK_IN_MS,
  ) + 1;

  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

function weekKeyToOrdinal(key: string): number {
  const match = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!match) {
    throw new DomainValidationError(
      "completedWeekKeys",
      `Invalid ISO week key: ${key}`,
    );
  }

  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) {
    throw new DomainValidationError(
      "completedWeekKeys",
      `Invalid ISO week key: ${key}`,
    );
  }

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = mondayStartUtc(jan4);
  monday.setUTCDate(monday.getUTCDate() + (week - 1) * 7);
  if (isoWeekKey(monday) !== key) {
    throw new DomainValidationError(
      "completedWeekKeys",
      `Invalid ISO week key: ${key}`,
    );
  }
  return Math.floor(monday.getTime() / WEEK_IN_MS);
}

export function recordCompletedWeek(
  log: HabitLog,
  dateLike: Date | string = new Date(),
): HabitLog {
  if (typeof dateLike === "string") {
    assertIsoDateTime(dateLike, "date");
  }
  const key = isoWeekKey(dateLike);
  const normalized = normalizeHabitLog(log);
  if (normalized.completedWeekKeys.includes(key)) {
    return normalized;
  }

  return normalizeHabitLog({
    completedWeekKeys: [...normalized.completedWeekKeys, key],
  });
}

export function normalizeHabitLog(log: HabitLog): HabitLog {
  if (!log || !Array.isArray(log.completedWeekKeys)) {
    throw new DomainValidationError("habitLog", "habitLog is invalid.");
  }
  const keys = [...new Set(log.completedWeekKeys)];
  keys.sort((left, right) => weekKeyToOrdinal(left) - weekKeyToOrdinal(right));
  return { completedWeekKeys: keys };
}

export function calculateHabitProgress(
  log: HabitLog,
  referenceDate: Date | string = new Date(),
): HabitProgress {
  const normalized = normalizeHabitLog(log);
  const ordinals = normalized.completedWeekKeys.map(weekKeyToOrdinal);
  const completed = new Set(ordinals);
  const totalCompletedWeeks = ordinals.length;

  let longestStreakWeeks = 0;
  let run = 0;
  let prior: number | undefined;
  for (const ordinal of ordinals) {
    run = prior !== undefined && ordinal === prior + 1 ? run + 1 : 1;
    longestStreakWeeks = Math.max(longestStreakWeeks, run);
    prior = ordinal;
  }

  const currentOrdinal = weekKeyToOrdinal(isoWeekKey(referenceDate));
  // A streak remains active through the current week even before this week's
  // contribution is recorded.
  let cursor = completed.has(currentOrdinal) ? currentOrdinal : currentOrdinal - 1;
  let currentStreakWeeks = 0;
  while (completed.has(cursor)) {
    currentStreakWeeks += 1;
    cursor -= 1;
  }

  const earnedMilestoneIds = HABIT_MILESTONES.filter(
    (milestone) => totalCompletedWeeks >= milestone.weeks,
  ).map((milestone) => milestone.id);
  const next = HABIT_MILESTONES.find(
    (milestone) => totalCompletedWeeks < milestone.weeks,
  );

  return {
    totalCompletedWeeks,
    currentStreakWeeks,
    longestStreakWeeks,
    earnedMilestoneIds,
    nextMilestone: next
      ? { ...next, remainingWeeks: next.weeks - totalCompletedWeeks }
      : null,
  };
}
