import { currentOccurrence } from "../domain/recurrence.ts";
import { streakOf } from "../domain/streak.ts";
import { readLog } from "./events.ts";
import { getItem, hydrate } from "./items.ts";
import type { Item } from "./items.ts";
import type { Event } from "../domain/types.ts";
import type { Principal, ServiceContext } from "./context.ts";

/**
 * The Items waiting on their Owner at time `at`.
 *
 * Nothing computes this in the background. This function evaluates the
 * Recurrence Rules at query time, against a time the caller supplies. The
 * system has no clock of its own (ADR 7).
 */
export function dueItems(
  ctx: ServiceContext,
  principal: Principal,
  at: string,
): Item[] {
  const rows = ctx.db
    .prepare(
      `select items.* from items
         join schedules on schedules.item_id = items.id
        where items.owner_id = ?
          and items.is_template = 0
          and items.current_status <> 'dropped'
        order by items.created_at, items.id`,
    )
    .all(principal.id);

  return hydrate(ctx, rows).filter((item) => isDue(ctx, item, at));
}

function isDue(ctx: ServiceContext, item: Item, at: string): boolean {
  const schedule = item.schedule;
  if (schedule === null) return false;

  const completions = completionsOf(readLog(ctx, item.id));
  const lastCompletedAt = completions.at(-1) ?? null;

  // No Recurrence Rule: one due date, and finishing it is the end of it.
  if (schedule.rule === null) {
    if (schedule.dueAt === null || item.status === "completed") return false;
    return Date.parse(schedule.dueAt) <= Date.parse(at);
  }

  const occurrence = currentOccurrence(
    schedule.rule,
    { dueAt: schedule.dueAt, lastCompletedAt },
    at,
  );
  if (occurrence === null) return false;

  // Still due unless this Occurrence has already been completed. Under a
  // completion Anchor the Occurrence is derived from the last Completion, so
  // this comparison can only be satisfied by a later one.
  return !completions.some(
    (completion) => Date.parse(completion) >= Date.parse(occurrence),
  );
}

/** The count of consecutive periods with at least one Completion. */
export function streakFor(
  ctx: ServiceContext,
  principal: Principal,
  itemId: string,
  at: string,
): number {
  const item = getItem(ctx, principal, itemId);
  return streakOf(
    item.schedule?.rule ?? null,
    {
      dueAt: item.schedule?.dueAt ?? null,
      completions: completionsOf(readLog(ctx, itemId)),
    },
    at,
  );
}

export type TargetProgress = {
  amount: number;
  unit: string | null;
  deadline: string | null;
  recorded: number;
  remaining: number;
  reached: boolean;
};

/**
 * A Target is a sum of Progress amounts in a window: from when the Item was
 * created until its deadline (ADR 2).
 */
export function targetProgressFor(
  ctx: ServiceContext,
  principal: Principal,
  itemId: string,
): TargetProgress | null {
  const item = getItem(ctx, principal, itemId);
  const target = item.target;
  if (target === null) return null;

  const deadline =
    target.deadline === null
      ? Number.POSITIVE_INFINITY
      : Date.parse(target.deadline);

  const recorded = readLog(ctx, itemId)
    .filter(
      (event) => event.kind === "progress" && Date.parse(event.at) <= deadline,
    )
    .reduce((total, event) => total + (event.amount ?? 0), 0);

  return {
    amount: target.amount,
    unit: target.unit,
    deadline: target.deadline,
    recorded,
    remaining: Math.max(0, target.amount - recorded),
    reached: recorded >= target.amount,
  };
}

/** Completion times from a log, ascending. */
function completionsOf(log: readonly Event[]): string[] {
  return log
    .filter((event) => event.kind === "completed")
    .map((event) => event.at);
}
