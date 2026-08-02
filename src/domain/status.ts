import type { Event, Status } from "./types.ts";

/**
 * Folds an Item's Events into its current Status. Events must arrive in log
 * order, which is `at` and then insertion order. The last lifecycle fact wins.
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
