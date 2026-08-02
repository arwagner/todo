import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createItem,
  listItems,
  setReminder,
  setSchedule,
  setTarget,
} from "../../src/service/items.ts";
import { testHarness } from "../support/service.ts";
import type { RecurrenceRule } from "../../src/domain/recurrence.ts";
import type { CreateItemInput } from "../../src/service/items.ts";
import type { Principal, ServiceContext } from "../../src/service/context.ts";

const monday = "2026-01-05T08:00:00Z";
const daily: RecurrenceRule = { kind: "schedule", every: 1, unit: "day" };
const weekly: RecurrenceRule = { kind: "schedule", every: 1, unit: "week" };
const dailyAfterCompletion: RecurrenceRule = {
  kind: "completion",
  every: 1,
  unit: "day",
};

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

test("a Schedule can carry a due date and no Recurrence Rule", () => {
  const { ctx, principal } = testHarness();

  const item = createItem(ctx, principal, {
    title: "Do the laundry",
    schedule: { dueAt: "2026-08-02T23:59:00-04:00" },
  });

  assert.deepEqual(item.schedule, {
    dueAt: "2026-08-02T23:59:00-04:00",
    rule: null,
  });
});

test("a completion-anchored Recurrence Rule needs no due date", () => {
  const { ctx, principal } = testHarness();

  const item = createItem(ctx, principal, {
    title: "Walk on the treadmill",
    schedule: { rule: dailyAfterCompletion },
  });

  assert.deepEqual(item.schedule, {
    dueAt: null,
    rule: dailyAfterCompletion,
  });
});

test("a Target can carry an amount and nothing else", () => {
  const { ctx, principal } = testHarness();

  const item = createItem(ctx, principal, {
    title: "Walk on the treadmill",
    target: { amount: 5 },
  });

  assert.deepEqual(item.target, { amount: 5, unit: null, deadline: null });
});

test("an absent optional field and an explicit null store the same thing", () => {
  const { ctx, principal } = testHarness();

  /** The Capabilities an Item gets from one capture, without its identity. */
  const captured = (input: Omit<CreateItemInput, "title">) => {
    const item = createItem(ctx, principal, { title: "Anything", ...input });
    return { schedule: item.schedule, target: item.target };
  };

  // schedule.dueAt, target.unit and target.deadline.
  assert.deepEqual(
    captured({ schedule: { rule: dailyAfterCompletion }, target: { amount: 5 } }),
    captured({
      schedule: { dueAt: null, rule: dailyAfterCompletion },
      target: { amount: 5, unit: null, deadline: null },
    }),
  );

  // schedule.rule.
  assert.deepEqual(
    captured({ schedule: { dueAt: monday } }),
    captured({ schedule: { dueAt: monday, rule: null } }),
  );

  // rule.weekdays, the one optional field inside a Recurrence Rule.
  assert.deepEqual(
    captured({ schedule: { dueAt: monday, rule: weekly } }),
    captured({ schedule: { dueAt: monday, rule: { ...weekly, weekdays: null } } }),
  );
});

test("a Schedule that says nothing is rejected", () => {
  const { ctx, principal } = testHarness();

  // An empty Schedule says nothing, whether the caller sends null or omits it.
  for (const schedule of [{ dueAt: null, rule: null }, {}]) {
    assert.throws(
      () => createItem(ctx, principal, { title: "Renew passport", schedule }),
      {
        code: "invalid",
        message: "a Schedule needs a due date, a Recurrence Rule, or both",
      },
    );
  }
});

test("a schedule-anchored Recurrence Rule with no due date is still rejected", () => {
  const { ctx, principal } = testHarness();

  assert.throws(
    () =>
      createItem(ctx, principal, {
        title: "Take the bins out",
        schedule: { rule: daily },
      }),
    {
      code: "invalid",
      message: "a schedule-anchored rule needs a due date to measure from",
    },
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

/**
 * Captures an Item from what an adapter can actually hand over: parsed JSON,
 * of any shape at all. The service owes such a caller a ServiceError naming
 * the field it got wrong, never a TypeError.
 */
function rejecting(ctx: ServiceContext, principal: Principal) {
  return (input: Record<string, unknown>, message: string) =>
    assert.throws(
      () =>
        createItem(ctx, principal, {
          title: "Anything",
          ...input,
        } as unknown as CreateItemInput),
      { code: "invalid", message },
    );
}

/** A weekly rule carrying whatever the caller sent for its weekdays. */
const weekdaysOf = (weekdays: unknown) => ({
  schedule: { dueAt: monday, rule: { ...weekly, weekdays } },
});

test("a Capability that is not an object is rejected, and the message names it", () => {
  const { ctx, principal } = testHarness();
  const rejects = rejecting(ctx, principal);

  rejects({ schedule: 5 }, "schedule must be an object or null");
  rejects({ schedule: [] }, "schedule must be an object or null");
  rejects({ schedule: "tomorrow" }, "schedule must be an object or null");
  rejects({ target: 5 }, "target must be an object or null");
  rejects({ target: [12] }, "target must be an object or null");
  rejects({ reminder: "09:00" }, "reminder must be an object or null");
  rejects(
    { schedule: { dueAt: monday, rule: "daily" } },
    "schedule.rule must be an object or null",
  );
});

test("a Recurrence Rule whose weekdays are not an array is rejected, not crashed", () => {
  const { ctx, principal } = testHarness();
  const rejects = rejecting(ctx, principal);
  const message =
    "rule.weekdays must be an array of ISO weekdays, 1 (Monday) to 7";

  rejects(weekdaysOf("monday"), message);
  rejects(weekdaysOf(1), message);
  rejects(weekdaysOf(["monday"]), message);
});

test("a Target unit that is not a string never reaches storage", () => {
  const { ctx, principal } = testHarness();

  rejecting(ctx, principal)(
    { target: { amount: 5, unit: 5 } },
    "target.unit must be a string or null",
  );

  assert.deepEqual(listItems(ctx, principal), []);
});

test("a time of the wrong type is rejected, and the message names the field", () => {
  const { ctx, principal } = testHarness();
  const rejects = rejecting(ctx, principal);

  rejects(
    { schedule: { dueAt: 5 } },
    "schedule.dueAt must be an ISO 8601 timestamp",
  );
  rejects(
    { target: { amount: 5, deadline: [monday] } },
    "target.deadline must be an ISO 8601 timestamp",
  );
  rejects(
    { reminder: { remindAt: 5 } },
    "reminder.remindAt must be an ISO 8601 timestamp",
  );
});

test("a Target amount of the wrong type reports the amount, not something else", () => {
  const { ctx, principal } = testHarness();

  rejecting(ctx, principal)(
    { target: { amount: "five" } },
    "target.amount must be a number greater than zero",
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
