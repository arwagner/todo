import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentOccurrence,
  nextOccurrence,
} from "../../src/domain/recurrence.ts";
import type { RecurrenceRule } from "../../src/domain/recurrence.ts";

const everyThreeMonths: RecurrenceRule = {
  kind: "completion",
  every: 3,
  unit: "month",
};

test("a completion Anchor measures from the last Completion", () => {
  const next = nextOccurrence(
    everyThreeMonths,
    { dueAt: "2026-01-01T00:00:00Z", lastCompletedAt: "2026-02-10T00:00:00Z" },
    "2026-02-10T00:00:00Z",
  );

  assert.equal(next, "2026-05-10T00:00:00.000Z");
});

test("a completion Anchor with no Completion yet falls back to the due date", () => {
  const next = nextOccurrence(
    everyThreeMonths,
    { dueAt: "2026-01-01T00:00:00Z", lastCompletedAt: null },
    "2026-01-01T00:00:00Z",
  );

  assert.equal(next, "2026-01-01T00:00:00Z");
});

test("adding months clamps to the end of a shorter month", () => {
  const monthly: RecurrenceRule = {
    kind: "completion",
    every: 1,
    unit: "month",
  };

  const next = nextOccurrence(
    monthly,
    { dueAt: null, lastCompletedAt: "2026-01-31T00:00:00Z" },
    "2026-01-31T00:00:00Z",
  );

  assert.equal(next, "2026-02-28T00:00:00.000Z");
});

test("a schedule Anchor walks a fixed grid and ignores Completions", () => {
  // Bins go out every Tuesday. Taking them out late on the Friday does not
  // move next Tuesday.
  const everyTuesday: RecurrenceRule = {
    kind: "schedule",
    every: 1,
    unit: "week",
  };

  const next = nextOccurrence(
    everyTuesday,
    {
      dueAt: "2026-01-06T08:00:00Z",
      lastCompletedAt: "2026-01-09T19:00:00Z",
    },
    "2026-01-10T00:00:00Z",
  );

  assert.equal(next, "2026-01-13T08:00:00.000Z");
});

test("a schedule Anchor skips grid points already behind us", () => {
  const everyOtherDay: RecurrenceRule = {
    kind: "schedule",
    every: 2,
    unit: "day",
  };

  const next = nextOccurrence(
    everyOtherDay,
    { dueAt: "2026-01-01T00:00:00Z", lastCompletedAt: null },
    "2026-01-10T12:00:00Z",
  );

  assert.equal(next, "2026-01-11T00:00:00.000Z");
});

test("a weekly schedule Anchor can name several weekdays", () => {
  const monWedFri: RecurrenceRule = {
    kind: "schedule",
    every: 1,
    unit: "week",
    weekdays: [1, 3, 5],
  };

  // Monday 5 January 2026, evaluated mid-morning on the Wednesday.
  const next = nextOccurrence(
    monWedFri,
    { dueAt: "2026-01-05T07:00:00Z", lastCompletedAt: null },
    "2026-01-07T08:00:00Z",
  );

  assert.equal(next, "2026-01-09T07:00:00.000Z");
});

test("a schedule Anchor with no due date has no grid to walk", () => {
  const weekly: RecurrenceRule = { kind: "schedule", every: 1, unit: "week" };

  const next = nextOccurrence(
    weekly,
    { dueAt: null, lastCompletedAt: "2026-01-09T19:00:00Z" },
    "2026-01-10T00:00:00Z",
  );

  assert.equal(next, null);
});

test("the current Occurrence is the most recent grid point behind us", () => {
  const everyMonday: RecurrenceRule = {
    kind: "schedule",
    every: 1,
    unit: "week",
  };

  const current = currentOccurrence(
    everyMonday,
    { dueAt: "2026-01-05T09:00:00Z", lastCompletedAt: null },
    "2026-01-21T12:00:00Z",
  );

  assert.equal(current, "2026-01-19T09:00:00.000Z");
});

test("an Item whose first Occurrence is still ahead has no current one", () => {
  const everyMonday: RecurrenceRule = {
    kind: "schedule",
    every: 1,
    unit: "week",
  };

  const current = currentOccurrence(
    everyMonday,
    { dueAt: "2026-01-05T09:00:00Z", lastCompletedAt: null },
    "2026-01-01T12:00:00Z",
  );

  assert.equal(current, null);
});

test("a completion Anchor's pending Occurrence becomes current once it passes", () => {
  const rule: RecurrenceRule = { kind: "completion", every: 3, unit: "month" };
  const history = {
    dueAt: null,
    lastCompletedAt: "2026-02-10T00:00:00Z",
  };

  assert.equal(currentOccurrence(rule, history, "2026-04-01T00:00:00Z"), null);
  assert.equal(
    currentOccurrence(rule, history, "2026-06-01T00:00:00Z"),
    "2026-05-10T00:00:00.000Z",
  );
});
