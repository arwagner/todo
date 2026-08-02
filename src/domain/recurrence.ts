export type RecurrenceUnit = "day" | "week" | "month" | "year";

/**
 * How often an Item repeats, and what the next repetition is measured from.
 *
 * The tag is the Anchor, because the Anchor is what changes the arithmetic: a
 * `schedule` rule walks a fixed calendar grid, a `completion` rule measures
 * from the last Completion and has no grid at all (ADR 3). Stored as a tagged
 * object so a `{ kind: "rrule" }` variant can join it later without touching
 * existing rows.
 */
export type RecurrenceRule =
  | {
      kind: "schedule";
      every: number;
      unit: RecurrenceUnit;
      /** Weekly rules only: ISO weekdays (1 = Monday) within each matching week. */
      weekdays?: number[];
    }
  | { kind: "completion"; every: number; unit: RecurrenceUnit };

/** What the rule is evaluated against: the Schedule's due date and the log. */
export type RecurrenceHistory = {
  dueAt: string | null;
  lastCompletedAt: string | null;
};

/** How far a schedule grid will be walked before we call the rule unusable. */
const MAX_GRID_STEPS = 10_000;

/**
 * The next moment the Item comes due, strictly after `at`.
 *
 * A completion Anchor has no grid: there is exactly one pending occurrence,
 * measured from the last Completion, and it stays pending however overdue it
 * gets. A schedule Anchor walks fixed calendar dates from the due date and
 * pays no attention to the Event history at all.
 */
export function nextOccurrence(
  rule: RecurrenceRule,
  history: RecurrenceHistory,
  at: string,
): string | null {
  if (rule.kind === "completion") {
    if (history.lastCompletedAt === null) return history.dueAt;
    return addUnits(history.lastCompletedAt, rule.every, rule.unit);
  }

  if (history.dueAt === null) return null;
  const cutoff = Date.parse(at);
  for (const occurrence of scheduleGrid(rule, history.dueAt)) {
    if (Date.parse(occurrence) > cutoff) return occurrence;
  }
  return null;
}

/**
 * The most recent moment at or before `at` when the Item came due, or null if
 * it has not come due yet. This is the occurrence someone would be working on
 * right now.
 */
export function currentOccurrence(
  rule: RecurrenceRule,
  history: RecurrenceHistory,
  at: string,
): string | null {
  const cutoff = Date.parse(at);

  if (rule.kind === "completion") {
    const pending =
      history.lastCompletedAt === null
        ? history.dueAt
        : addUnits(history.lastCompletedAt, rule.every, rule.unit);
    if (pending === null) return null;
    return Date.parse(pending) <= cutoff ? pending : null;
  }

  if (history.dueAt === null) return null;
  let current: string | null = null;
  for (const occurrence of scheduleGrid(rule, history.dueAt)) {
    if (Date.parse(occurrence) > cutoff) break;
    current = occurrence;
  }
  return current;
}

/** Yields a schedule rule's occurrences in order, starting at the due date. */
export function* scheduleGrid(
  rule: Extract<RecurrenceRule, { kind: "schedule" }>,
  dueAt: string,
): Generator<string> {
  const weekdays = rule.unit === "week" ? rule.weekdays : undefined;
  if (weekdays === undefined || weekdays.length === 0) {
    for (let step = 0; step < MAX_GRID_STEPS; step += 1) {
      yield addUnits(dueAt, step * rule.every, rule.unit);
    }
    return;
  }

  // "Mondays, Wednesdays and Fridays": each qualifying week contributes one
  // occurrence per listed weekday, at the due date's time of day.
  const origin = Date.parse(dueAt);
  const weekStart = startOfIsoWeek(dueAt);
  const offsets = [...new Set(weekdays)].sort((a, b) => a - b);
  for (let step = 0; step < MAX_GRID_STEPS; step += 1) {
    const base = addUnits(weekStart, step * rule.every * 7, "day");
    for (const weekday of offsets) {
      const occurrence = addUnits(base, weekday - 1, "day");
      if (Date.parse(occurrence) >= origin) yield occurrence;
    }
  }
}

/** Midnight-relative Monday of the week containing `at`, keeping time of day. */
function startOfIsoWeek(at: string): string {
  const date = new Date(at);
  const isoWeekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (isoWeekday - 1));
  return date.toISOString();
}

function addUnits(at: string, count: number, unit: RecurrenceUnit): string {
  const date = new Date(at);
  switch (unit) {
    case "day":
      date.setUTCDate(date.getUTCDate() + count);
      break;
    case "week":
      date.setUTCDate(date.getUTCDate() + count * 7);
      break;
    case "month":
      shiftMonths(date, count);
      break;
    case "year":
      shiftMonths(date, count * 12);
      break;
  }
  return date.toISOString();
}

/**
 * Adds whole months, clamping to the end of a shorter target month so that
 * 31 January plus one month is 28 February rather than spilling into March.
 */
function shiftMonths(date: Date, count: number): void {
  const dayOfMonth = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + count);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(dayOfMonth, lastDayOfTargetMonth));
}
