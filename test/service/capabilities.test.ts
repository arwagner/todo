import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createItem,
  setReminder,
  setSchedule,
  setTarget,
} from "../../src/service/items.ts";
import { testHarness } from "../support/service.ts";
import type { RecurrenceRule } from "../../src/domain/recurrence.ts";

const daily: RecurrenceRule = { kind: "schedule", every: 1, unit: "day" };

test("an Item with no Capabilities has none of them", () => {
  const { ctx, principal } = testHarness();

  const item = createItem(ctx, principal, { title: "Renew passport" });

  assert.equal(item.schedule, null);
  assert.equal(item.target, null);
  assert.equal(item.reminder, null);
});

test("Capabilities attach independently, and any combination is valid", () => {
  const { ctx, principal } = testHarness();

  const item = createItem(ctx, principal, {
    title: "Read twelve books",
    schedule: { dueAt: "2026-12-31T00:00:00Z", rule: null },
    target: { amount: 12, unit: "books", deadline: "2026-12-31T00:00:00Z" },
    reminder: { remindAt: "2026-01-01T09:00:00Z" },
  });

  assert.deepEqual(item.schedule, {
    dueAt: "2026-12-31T00:00:00Z",
    rule: null,
  });
  assert.deepEqual(item.target, {
    amount: 12,
    unit: "books",
    deadline: "2026-12-31T00:00:00Z",
  });
  assert.deepEqual(item.reminder, { remindAt: "2026-01-01T09:00:00Z" });
});

test("a Recurrence Rule survives the round trip to storage", () => {
  const { ctx, principal } = testHarness();

  const item = createItem(ctx, principal, {
    title: "Take the bins out",
    schedule: { dueAt: "2026-01-06T08:00:00Z", rule: daily },
  });

  assert.deepEqual(item.schedule?.rule, daily);
});

test("a Capability can be attached and removed after creation", () => {
  const { ctx, principal } = testHarness();
  const item = createItem(ctx, principal, { title: "Renew passport" });

  const scheduled = setSchedule(ctx, principal, item.id, {
    dueAt: "2026-03-01T00:00:00Z",
    rule: null,
  });
  assert.equal(scheduled.schedule?.dueAt, "2026-03-01T00:00:00Z");

  assert.equal(setSchedule(ctx, principal, item.id, null).schedule, null);
  assert.equal(setTarget(ctx, principal, item.id, null).target, null);
  assert.equal(setReminder(ctx, principal, item.id, null).reminder, null);
});

test("a Schedule that says nothing is rejected", () => {
  const { ctx, principal } = testHarness();

  assert.throws(
    () =>
      createItem(ctx, principal, {
        title: "Renew passport",
        schedule: { dueAt: null, rule: null },
      }),
    { code: "invalid" },
  );
});

test("a Target must be a quantity worth reaching", () => {
  const { ctx, principal } = testHarness();

  assert.throws(
    () =>
      createItem(ctx, principal, {
        title: "Read books",
        target: { amount: 0, unit: "books", deadline: null },
      }),
    { code: "invalid" },
  );
});

test("a Preset is checked at creation and carries no meaning afterwards", () => {
  const { ctx, principal } = testHarness();

  assert.throws(
    () => createItem(ctx, principal, { title: "Floss", preset: "habit" }),
    { code: "invalid" },
  );

  const habit = createItem(ctx, principal, {
    title: "Floss",
    preset: "habit",
    schedule: { dueAt: "2026-01-01T21:00:00Z", rule: daily },
  });

  // Nothing on the Item records which Preset built it.
  assert.equal(Object.hasOwn(habit, "preset"), false);
  assert.deepEqual(habit.schedule?.rule, daily);
});

test("an unknown Preset is rejected rather than silently ignored", () => {
  const { ctx, principal } = testHarness();

  assert.throws(
    () => createItem(ctx, principal, { title: "Floss", preset: "nonsense" }),
    { code: "invalid" },
  );
});
