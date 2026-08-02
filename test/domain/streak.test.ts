import { test } from "node:test";
import assert from "node:assert/strict";
import { streakOf } from "../../src/domain/streak.ts";
import type { RecurrenceRule } from "../../src/domain/recurrence.ts";

const everyThreeMonths: RecurrenceRule = {
  kind: "completion",
  every: 3,
  unit: "month",
};

test("under a completion Anchor there are no missed periods, so every Completion counts", () => {
  const completions = [
    "2025-06-01T00:00:00Z",
    "2025-11-20T00:00:00Z",
    "2026-04-02T00:00:00Z",
  ];

  assert.equal(
    streakOf(everyThreeMonths, { dueAt: null, completions }, "2026-05-01T00:00:00Z"),
    3,
  );
});

// Mondays from 5 January 2026, so the weekly periods run Mon-to-Mon.
const everyMonday: RecurrenceRule = { kind: "schedule", every: 1, unit: "week" };
const fromFifthOfJanuary = "2026-01-05T09:00:00Z";

test("under a schedule Anchor a missed period breaks the Streak", () => {
  const completions = [
    "2026-01-06T18:00:00Z", // week one
    "2026-01-13T18:00:00Z", // week two
    // week three missed
    "2026-01-27T18:00:00Z", // week four
  ];

  assert.equal(
    streakOf(
      everyMonday,
      { dueAt: fromFifthOfJanuary, completions },
      "2026-01-30T12:00:00Z",
    ),
    1,
  );
});

test("a current period not yet completed does not break the Streak", () => {
  const completions = [
    "2026-01-06T18:00:00Z",
    "2026-01-13T18:00:00Z",
    "2026-01-20T18:00:00Z",
    // the period containing 30 January is still open
  ];

  assert.equal(
    streakOf(
      everyMonday,
      { dueAt: fromFifthOfJanuary, completions },
      "2026-01-30T12:00:00Z",
    ),
    3,
  );
});

test("an Item never completed has no Streak", () => {
  assert.equal(
    streakOf(
      everyMonday,
      { dueAt: fromFifthOfJanuary, completions: [] },
      "2026-01-30T12:00:00Z",
    ),
    0,
  );
});
