import { test } from "node:test";
import assert from "node:assert/strict";
import { recordEvent } from "../../src/service/events.ts";
import { createItem, getItem } from "../../src/service/items.ts";
import {
  addChild,
  addDependency,
  listChildren,
  listDependencies,
  relate,
  removeChild,
  removeDependency,
  unrelate,
} from "../../src/service/relationships.ts";
import { testHarness } from "../support/service.ts";

test("an Item with an incomplete Dependency is Blocked", () => {
  const { ctx, principal } = testHarness();
  const passport = createItem(ctx, principal, { title: "Renew passport" });
  const visa = createItem(ctx, principal, { title: "Apply for visa" });

  addDependency(ctx, principal, visa.id, passport.id);

  assert.equal(getItem(ctx, principal, visa.id).blocked, true);
  assert.deepEqual(
    listDependencies(ctx, principal, visa.id).map((item) => item.id),
    [passport.id],
  );

  recordEvent(ctx, principal, passport.id, { kind: "completed" });

  assert.equal(getItem(ctx, principal, visa.id).blocked, false);
});

test("removing the last Dependency unblocks an Item", () => {
  const { ctx, principal } = testHarness();
  const passport = createItem(ctx, principal, { title: "Renew passport" });
  const visa = createItem(ctx, principal, { title: "Apply for visa" });
  addDependency(ctx, principal, visa.id, passport.id);

  removeDependency(ctx, principal, visa.id, passport.id);

  assert.equal(getItem(ctx, principal, visa.id).blocked, false);
});

test("a container reports a Rollup but completes as its own deliberate act", () => {
  const { ctx, principal } = testHarness();
  const trip = createItem(ctx, principal, { title: "Trip to Lisbon" });
  const flights = createItem(ctx, principal, { title: "Book flights" });
  const hotel = createItem(ctx, principal, { title: "Book hotel" });

  addChild(ctx, principal, trip.id, flights.id);
  addChild(ctx, principal, trip.id, hotel.id);
  recordEvent(ctx, principal, flights.id, { kind: "completed" });
  recordEvent(ctx, principal, hotel.id, { kind: "completed" });

  const container = getItem(ctx, principal, trip.id);
  assert.deepEqual(container.rollup, { complete: 2, total: 2 });
  assert.equal(container.status, "captured");
  assert.deepEqual(
    listChildren(ctx, principal, trip.id).map((item) => item.title),
    ["Book flights", "Book hotel"],
  );
});

test("an Item holding nothing has no Rollup to report", () => {
  const { ctx, principal } = testHarness();

  const item = createItem(ctx, principal, { title: "Renew passport" });

  assert.equal(item.rollup, null);
});

test("removing a child takes it out of the Rollup but leaves it alive", () => {
  const { ctx, principal } = testHarness();
  const trip = createItem(ctx, principal, { title: "Trip to Lisbon" });
  const flights = createItem(ctx, principal, { title: "Book flights" });
  addChild(ctx, principal, trip.id, flights.id);

  removeChild(ctx, principal, trip.id, flights.id);

  assert.equal(getItem(ctx, principal, trip.id).rollup, null);
  assert.equal(getItem(ctx, principal, flights.id).title, "Book flights");
});

test("a Dependency cycle would make Blocked meaningless, so it is refused", () => {
  const { ctx, principal } = testHarness();
  const first = createItem(ctx, principal, { title: "First" });
  const second = createItem(ctx, principal, { title: "Second" });
  addDependency(ctx, principal, second.id, first.id);

  assert.throws(() => addDependency(ctx, principal, first.id, second.id), {
    code: "conflict",
  });
});

test("Containment cycles are refused too", () => {
  const { ctx, principal } = testHarness();
  const outer = createItem(ctx, principal, { title: "Outer" });
  const inner = createItem(ctx, principal, { title: "Inner" });
  addChild(ctx, principal, outer.id, inner.id);

  assert.throws(() => addChild(ctx, principal, inner.id, outer.id), {
    code: "conflict",
  });
  assert.throws(() => addChild(ctx, principal, outer.id, outer.id), {
    code: "conflict",
  });
});

test("relationships cannot reach across Owners", () => {
  const { ctx, principal, stranger } = testHarness();
  const mine = createItem(ctx, principal, { title: "Mine" });
  const theirs = createItem(ctx, stranger, { title: "Theirs" });

  assert.throws(() => addDependency(ctx, principal, mine.id, theirs.id), {
    code: "not_found",
  });
  assert.throws(() => addChild(ctx, principal, mine.id, theirs.id), {
    code: "not_found",
  });
});

test("an unrecognized kind of relationship is refused by the service", () => {
  const { ctx, principal } = testHarness();
  const first = createItem(ctx, principal, { title: "First" });
  const second = createItem(ctx, principal, { title: "Second" });

  assert.throws(
    () =>
      relate(ctx, principal, "nonsense" as "dependency", first.id, second.id),
    { code: "invalid" },
  );
});

test("relate and unrelate reach both kinds of relationship", () => {
  const { ctx, principal } = testHarness();
  const trip = createItem(ctx, principal, { title: "Trip to Lisbon" });
  const flights = createItem(ctx, principal, { title: "Book flights" });

  relate(ctx, principal, "containment", trip.id, flights.id);
  assert.deepEqual(getItem(ctx, principal, trip.id).rollup, {
    complete: 0,
    total: 1,
  });

  unrelate(ctx, principal, "containment", trip.id, flights.id);
  assert.equal(getItem(ctx, principal, trip.id).rollup, null);
});
