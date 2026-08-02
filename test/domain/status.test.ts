import { test } from "node:test";
import assert from "node:assert/strict";
import { statusOf } from "../../src/domain/status.ts";
import { ev } from "../support/events.ts";

test("an Item with no Events is captured", () => {
  assert.equal(statusOf([]), "captured");
});

test("a Promotion makes the Item promoted", () => {
  assert.equal(statusOf([ev("promoted", "2026-01-01T09:00:00Z")]), "promoted");
});

test("the latest lifecycle Event determines the Status", () => {
  const promoted = ev("promoted", "2026-01-01T09:00:00Z");
  const started = ev("started", "2026-01-02T09:00:00Z");
  const completed = ev("completed", "2026-01-03T09:00:00Z");
  const dropped = ev("dropped", "2026-01-04T09:00:00Z");

  assert.equal(statusOf([promoted, started]), "started");
  assert.equal(statusOf([promoted, started, completed]), "completed");
  assert.equal(statusOf([promoted, started, completed, dropped]), "dropped");
});

test("Progress is not a Completion and does not move the Status", () => {
  const events = [
    ev("promoted", "2026-01-01T09:00:00Z"),
    ev("started", "2026-01-02T09:00:00Z"),
    ev("progress", "2026-01-03T09:00:00Z", 5),
  ];

  assert.equal(statusOf(events), "started");
});

test("re-promoting a completed Item makes it promoted again", () => {
  const events = [
    ev("promoted", "2026-01-01T09:00:00Z"),
    ev("completed", "2026-01-02T09:00:00Z"),
    ev("promoted", "2026-01-03T09:00:00Z"),
  ];

  assert.equal(statusOf(events), "promoted");
});
