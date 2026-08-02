import type { Event, EventKind } from "../../src/domain/types.ts";

let counter = 0;

/** Builds an Event for tests that only care about kind, time and amount. */
export function ev(
  kind: EventKind,
  at: string,
  amount: number | null = null,
): Event {
  counter += 1;
  return { id: `ev-${counter}`, itemId: "item", kind, at, amount, note: null };
}
