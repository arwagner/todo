/** The lifecycle facts worth keeping. Only these become Events (ADR 2). */
export type EventKind =
  | "promoted"
  | "started"
  | "completed"
  | "dropped"
  | "progress";

/** A recorded fact about something that happened to an Item, at a point in time. */
export type Event = {
  id: string;
  itemId: string;
  kind: EventKind;
  at: string;
  amount: number | null;
  note: string | null;
};

/**
 * The current lifecycle state of an Item, read from its Events. A reading of
 * the history, not a value someone sets.
 */
export type Status =
  | "captured"
  | "promoted"
  | "started"
  | "completed"
  | "dropped";
