import { transact } from "../db/transact.ts";
import { statusOf } from "../domain/status.ts";
import { isTimestamp } from "./capabilities.ts";
import { invalid, notFound } from "./errors.ts";
import { getItem, touch } from "./items.ts";
import type { Event, EventKind } from "../domain/types.ts";
import type { Principal, ServiceContext } from "./context.ts";

const KINDS: readonly EventKind[] = [
  "promoted",
  "started",
  "completed",
  "dropped",
  "progress",
];

export type RecordEventInput = {
  kind: EventKind;
  /** Defaults to now. Backdating is allowed. The log stays sorted by time. */
  at?: string;
  amount?: number | null;
  note?: string | null;
};

export function recordEvent(
  ctx: ServiceContext,
  principal: Principal,
  itemId: string,
  input: RecordEventInput,
): Event {
  if (!KINDS.includes(input.kind)) {
    throw invalid(
      `only lifecycle facts are Events. Expected one of ${KINDS.join(", ")}`,
    );
  }

  const at = input.at ?? ctx.now();
  if (!isTimestamp(at)) throw invalid("event.at must be an ISO 8601 timestamp");

  const amount = amountFor(input);

  return transact(ctx.db, () => {
    getItem(ctx, principal, itemId);

    const event: Event = {
      id: ctx.newId(),
      itemId,
      kind: input.kind,
      at,
      amount,
      note: input.note ?? null,
    };

    ctx.db
      .prepare(
        "insert into events (id, item_id, kind, at, amount, note) values (?, ?, ?, ?, ?, ?)",
      )
      .run(event.id, event.itemId, event.kind, event.at, event.amount, event.note);

    refreshStatus(ctx, itemId);
    touch(ctx, itemId);
    return event;
  });
}

export function listEvents(
  ctx: ServiceContext,
  principal: Principal,
  itemId: string,
): Event[] {
  getItem(ctx, principal, itemId);
  return readLog(ctx, itemId);
}

/**
 * Correcting a mistaken Completion means deleting the Event row, so this has
 * to be reachable from every adapter (ADR 2).
 */
export function deleteEvent(
  ctx: ServiceContext,
  principal: Principal,
  eventId: string,
): void {
  transact(ctx.db, () => {
    const row = ctx.db
      .prepare(
        `select events.item_id from events
           join items on items.id = events.item_id
          where events.id = ? and items.owner_id = ?`,
      )
      .get(eventId, principal.id);
    if (row === undefined) throw notFound("event");

    const itemId = row["item_id"] as string;
    ctx.db.prepare("delete from events where id = ?").run(eventId);
    refreshStatus(ctx, itemId);
    touch(ctx, itemId);
  });
}

/** The Event log for an Item, oldest first. Insertion order breaks ties. */
export function readLog(ctx: ServiceContext, itemId: string): Event[] {
  return ctx.db
    .prepare(
      "select * from events where item_id = ? order by at, rowid",
    )
    .all(itemId)
    .map((row) => ({
      id: row["id"] as string,
      itemId: row["item_id"] as string,
      kind: row["kind"] as EventKind,
      at: row["at"] as string,
      amount: (row["amount"] as number | null) ?? null,
      note: (row["note"] as string | null) ?? null,
    }));
}

/**
 * Rewrites the cached `current_status` column. The log stays authoritative.
 * The column is a derived index, written at the same time as the Event (ADR 2).
 */
export function refreshStatus(ctx: ServiceContext, itemId: string): void {
  ctx.db
    .prepare("update items set current_status = ? where id = ?")
    .run(statusOf(readLog(ctx, itemId)), itemId);
}

function amountFor(input: RecordEventInput): number | null {
  if (input.kind !== "progress") return null;
  if (typeof input.amount !== "number" || !Number.isFinite(input.amount)) {
    throw invalid("Progress needs an amount");
  }
  return input.amount;
}
