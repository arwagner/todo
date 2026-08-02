import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deleteEvent,
  listEvents,
  recordEvent,
} from "../../src/service/events.ts";
import { createItem, getItem } from "../../src/service/items.ts";
import { testHarness } from "../support/service.ts";

test("recording a Completion moves the Status the log implies", () => {
  const { ctx, principal, travelTo } = testHarness();
  const item = createItem(ctx, principal, { title: "Renew passport" });

  travelTo("2026-01-02T09:00:00Z");
  const event = recordEvent(ctx, principal, item.id, { kind: "completed" });

  assert.equal(event.kind, "completed");
  assert.equal(event.at, "2026-01-02T09:00:00Z");
  assert.equal(getItem(ctx, principal, item.id).status, "completed");
  assert.deepEqual(
    listEvents(ctx, principal, item.id).map((each) => each.kind),
    ["completed"],
  );
});

test("deleting a mistaken Completion re-derives the Status from what is left", () => {
  const { ctx, principal } = testHarness();
  const item = createItem(ctx, principal, { title: "Renew passport" });

  recordEvent(ctx, principal, item.id, {
    kind: "promoted",
    at: "2026-01-02T09:00:00Z",
  });
  const mistake = recordEvent(ctx, principal, item.id, {
    kind: "completed",
    at: "2026-01-03T09:00:00Z",
  });
  assert.equal(getItem(ctx, principal, item.id).status, "completed");

  deleteEvent(ctx, principal, mistake.id);

  assert.equal(getItem(ctx, principal, item.id).status, "promoted");
  assert.deepEqual(
    listEvents(ctx, principal, item.id).map((each) => each.kind),
    ["promoted"],
  );
});

test("a backdated Event lands in the right place in the log", () => {
  const { ctx, principal } = testHarness();
  const item = createItem(ctx, principal, { title: "Renew passport" });

  recordEvent(ctx, principal, item.id, {
    kind: "completed",
    at: "2026-01-05T09:00:00Z",
  });
  recordEvent(ctx, principal, item.id, {
    kind: "promoted",
    at: "2026-01-01T09:00:00Z",
  });

  assert.deepEqual(
    listEvents(ctx, principal, item.id).map((each) => each.kind),
    ["promoted", "completed"],
  );
  assert.equal(getItem(ctx, principal, item.id).status, "completed");
});

test("Progress carries an amount and leaves the Status where it was", () => {
  const { ctx, principal } = testHarness();
  const item = createItem(ctx, principal, { title: "Read twelve books" });
  recordEvent(ctx, principal, item.id, { kind: "started" });

  const progress = recordEvent(ctx, principal, item.id, {
    kind: "progress",
    amount: 3,
  });

  assert.equal(progress.amount, 3);
  assert.equal(getItem(ctx, principal, item.id).status, "started");
});

test("Progress without an amount is not Progress", () => {
  const { ctx, principal } = testHarness();
  const item = createItem(ctx, principal, { title: "Read twelve books" });

  assert.throws(
    () => recordEvent(ctx, principal, item.id, { kind: "progress" }),
    { code: "invalid" },
  );
});

test("only lifecycle facts are Events", () => {
  const { ctx, principal } = testHarness();
  const item = createItem(ctx, principal, { title: "Renew passport" });

  assert.throws(
    () =>
      recordEvent(ctx, principal, item.id, {
        kind: "title_changed" as "promoted",
      }),
    { code: "invalid" },
  );
});

test("Events belong to the Item's Owner and nobody else", () => {
  const { ctx, principal, stranger } = testHarness();
  const item = createItem(ctx, principal, { title: "Renew passport" });
  const event = recordEvent(ctx, principal, item.id, { kind: "completed" });

  assert.throws(
    () => recordEvent(ctx, stranger, item.id, { kind: "dropped" }),
    { code: "not_found" },
  );
  assert.throws(() => listEvents(ctx, stranger, item.id), {
    code: "not_found",
  });
  assert.throws(() => deleteEvent(ctx, stranger, event.id), {
    code: "not_found",
  });
});
