import type { Event, Status } from "./types.ts";

/**
 * Folds an Item's Events into its current Status. Events must arrive in log
 * order, which is `at` and then insertion order. The last lifecycle fact wins.
 *
 * Status does not take the current time. It cannot: ADR 2 caches it in a
 * column written at the same time as the Event, and a time-dependent value
 * would go stale between writes.
 *
 * For a recurring Item, Status therefore describes the most recent Occurrence.
 * A habit completed this morning reads `completed` until something else
 * happens to it, even though it comes due again tomorrow. To ask what a
 * recurring Item owes you now, use `dueItems` or `nextOccurrenceFor`, which
 * evaluate the Recurrence Rule against a time you supply.
 */
export function statusOf(events: readonly Event[]): Status {
  let status: Status = "captured";
  for (const event of events) {
    switch (event.kind) {
      case "promoted":
        status = "promoted";
        break;
      case "started":
        status = "started";
        break;
      case "completed":
        status = "completed";
        break;
      case "dropped":
        status = "dropped";
        break;
      case "progress":
        break;
    }
  }
  return status;
}
