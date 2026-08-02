import { scheduleGrid } from "./recurrence.ts";
import type { RecurrenceRule } from "./recurrence.ts";

export type StreakHistory = {
  dueAt: string | null;
  /** Completion times, ascending. */
  completions: readonly string[];
};

/**
 * The count of consecutive periods in which the Item has at least one
 * Completion.
 *
 * The Anchor decides what a period is. Under a completion Anchor there are no
 * missed periods, because the next period starts when you finish the last one.
 * Every Completion therefore extends the streak. Under a schedule Anchor the
 * periods are the gaps between fixed calendar dates. An empty period breaks
 * the streak (ADR 3).
 *
 * The period that contains `at` is still open. An empty one is not yet a miss.
 */
export function streakOf(
  rule: RecurrenceRule | null,
  history: StreakHistory,
  at: string,
): number {
  // Without a rule there are no periods to be consecutive, so there is no
  // Streak to count.
  if (rule === null) return 0;

  if (rule.kind === "completion" || history.dueAt === null) {
    return history.completions.length;
  }

  const cutoff = Date.parse(at);
  const boundaries: number[] = [];
  for (const occurrence of scheduleGrid(rule, history.dueAt)) {
    boundaries.push(Date.parse(occurrence));
    if (Date.parse(occurrence) > cutoff) break;
  }

  const current = boundaries.findLastIndex((start) => start <= cutoff);
  if (current < 0) return 0;

  const completions = history.completions
    .map((completion) => Date.parse(completion))
    .sort((a, b) => a - b);

  let streak = 0;
  for (let period = current; period >= 0; period -= 1) {
    const start = boundaries[period] as number;
    const end = boundaries[period + 1] ?? Number.POSITIVE_INFINITY;
    const completed = completions.some(
      (completion) => completion >= start && completion < end,
    );
    if (completed) streak += 1;
    else if (period !== current) break;
  }
  return streak;
}
