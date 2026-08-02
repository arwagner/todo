import { test } from "node:test";
import assert from "node:assert/strict";
import { recordEvent } from "../../src/service/events.ts";
import { createItem } from "../../src/service/items.ts";
import {
  dueItems,
  streakFor,
  targetProgressFor,
} from "../../src/service/queries.ts";
import { testHarness } from "../support/service.ts";
import type { RecurrenceRule } from "../../src/domain/recurrence.ts";

const weekly: RecurrenceRule = { kind: "schedule", every: 1, unit: "week" };

/** Bins go out every Tuesday, starting Tuesday 6 January 2026. */
function withBins() {
  const harness = testHarness();
  const bins = createItem(harness.ctx, harness.principal, {
    title: "Take the bins out",
    preset: "habit",
    schedule: { dueAt: "2026-01-06T08:00:00Z", rule: weekly },
  });
  return { ...harness, bins };
}

test("what is due is evaluated at query time against a time the caller supplies", () => {
  const { ctx, principal, bins } = withBins();
  createItem(ctx, principal, { title: "Someday, maybe" });

  assert.deepEqual(
    dueItems(ctx, principal, "2026-01-06T09:00:00Z").map((item) => item.id),
    [bins.id],
  );
  assert.deepEqual(dueItems(ctx, principal, "2026-01-05T09:00:00Z"), []);
});

test("completing a recurring Item clears it until the next Occurrence", () => {
  const { ctx, principal, bins } = withBins();

  recordEvent(ctx, principal, bins.id, {
    kind: "completed",
    at: "2026-01-06T19:00:00Z",
  });

  assert.deepEqual(dueItems(ctx, principal, "2026-01-07T09:00:00Z"), []);
  assert.deepEqual(
    dueItems(ctx, principal, "2026-01-13T09:00:00Z").map((item) => item.id),
    [bins.id],
  );
});

test("a one-off Item is due until it is finished, then never again", () => {
  const { ctx, principal } = testHarness();
  const passport = createItem(ctx, principal, {
    title: "Renew passport",
    schedule: { dueAt: "2026-03-01T00:00:00Z", rule: null },
  });

  assert.deepEqual(
    dueItems(ctx, principal, "2026-03-02T00:00:00Z").map((item) => item.id),
    [passport.id],
  );

  recordEvent(ctx, principal, passport.id, { kind: "completed" });

  assert.deepEqual(dueItems(ctx, principal, "2026-03-02T00:00:00Z"), []);
});

test("an abandoned Item is not waiting for anyone", () => {
  const { ctx, principal, bins } = withBins();

  recordEvent(ctx, principal, bins.id, {
    kind: "dropped",
    at: "2026-01-06T19:00:00Z",
  });

  assert.deepEqual(dueItems(ctx, principal, "2026-01-20T09:00:00Z"), []);
});

test("a Template is a pattern to copy, not work, so it is never due", () => {
  const { ctx, principal } = testHarness();
  createItem(ctx, principal, {
    title: "Weekly review",
    isTemplate: true,
    schedule: { dueAt: "2026-01-05T09:00:00Z", rule: weekly },
  });

  assert.deepEqual(dueItems(ctx, principal, "2026-02-01T09:00:00Z"), []);
});

test("what is due for one Owner is invisible to another", () => {
  const { ctx, stranger } = withBins();

  assert.deepEqual(dueItems(ctx, stranger, "2026-01-06T09:00:00Z"), []);
});

test("a Streak counts the periods the Completion history covers", () => {
  const { ctx, principal, bins } = withBins();

  for (const at of ["2026-01-06T19:00:00Z", "2026-01-13T19:00:00Z"]) {
    recordEvent(ctx, principal, bins.id, { kind: "completed", at });
  }

  assert.equal(streakFor(ctx, principal, bins.id, "2026-01-15T09:00:00Z"), 2);
  // Missing the week of the 20th ends it, once that week is behind us.
  assert.equal(streakFor(ctx, principal, bins.id, "2026-01-28T09:00:00Z"), 0);
});

test("a Target sums the Progress recorded inside its window", () => {
  const { ctx, principal } = testHarness();
  const reading = createItem(ctx, principal, {
    title: "Read twelve books",
    preset: "goal",
    target: { amount: 12, unit: "books", deadline: "2026-12-31T00:00:00Z" },
  });

  recordEvent(ctx, principal, reading.id, {
    kind: "progress",
    amount: 3,
    at: "2026-03-01T00:00:00Z",
  });
  recordEvent(ctx, principal, reading.id, {
    kind: "progress",
    amount: 4,
    at: "2026-06-01T00:00:00Z",
  });
  // After the deadline, so outside the window.
  recordEvent(ctx, principal, reading.id, {
    kind: "progress",
    amount: 5,
    at: "2027-01-05T00:00:00Z",
  });

  assert.deepEqual(targetProgressFor(ctx, principal, reading.id), {
    amount: 12,
    unit: "books",
    deadline: "2026-12-31T00:00:00Z",
    recorded: 7,
    remaining: 5,
    reached: false,
  });
});

test("a Target that has been reached says so", () => {
  const { ctx, principal } = testHarness();
  const reading = createItem(ctx, principal, {
    title: "Read two books",
    target: { amount: 2, unit: "books", deadline: null },
  });

  recordEvent(ctx, principal, reading.id, { kind: "progress", amount: 2 });

  const progress = targetProgressFor(ctx, principal, reading.id);
  assert.equal(progress?.reached, true);
  assert.equal(progress?.remaining, 0);
});

test("an Item with no Target has no progress to report", () => {
  const { ctx, principal } = testHarness();
  const item = createItem(ctx, principal, { title: "Renew passport" });

  assert.equal(targetProgressFor(ctx, principal, item.id), null);
});
