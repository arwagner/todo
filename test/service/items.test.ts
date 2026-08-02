import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createItem,
  deleteItem,
  getItem,
  listItems,
  reviseItem,
  setLabels,
  updateItem,
} from "../../src/service/items.ts";
import { testHarness } from "../support/service.ts";

test("a new Item has its title and is captured until someone promotes it", () => {
  const { ctx, principal } = testHarness();

  const created = createItem(ctx, principal, { title: "Renew passport" });

  assert.equal(created.title, "Renew passport");
  assert.equal(created.status, "captured");
  assert.equal(created.ownerId, principal.id);
  assert.deepEqual(getItem(ctx, principal, created.id), created);
});

test("an Item belongs to one Owner and no other Principal can reach it", () => {
  const { ctx, principal, stranger } = testHarness();

  const mine = createItem(ctx, principal, { title: "Renew passport" });
  createItem(ctx, stranger, { title: "Not mine" });

  assert.deepEqual(
    listItems(ctx, principal).map((item) => item.title),
    ["Renew passport"],
  );
  assert.throws(() => getItem(ctx, stranger, mine.id), { code: "not_found" });
});

test("editing a title is an ordinary update, not an Event", () => {
  const { ctx, principal, travelTo } = testHarness();
  const created = createItem(ctx, principal, { title: "Rnew passport" });

  travelTo("2026-01-02T00:00:00Z");
  const updated = updateItem(ctx, principal, created.id, {
    title: "Renew passport",
    notes: "Photos first",
  });

  assert.equal(updated.title, "Renew passport");
  assert.equal(updated.notes, "Photos first");
  assert.equal(updated.status, "captured");
  assert.equal(updated.createdAt, created.createdAt);
  assert.equal(updated.updatedAt, "2026-01-02T00:00:00Z");
});

test("an Item carries free-form Labels and can be filtered by them", () => {
  const { ctx, principal } = testHarness();

  const passport = createItem(ctx, principal, {
    title: "Renew passport",
    labels: ["admin", "urgent"],
  });
  createItem(ctx, principal, { title: "Buy milk", labels: ["errand"] });

  assert.deepEqual(passport.labels, ["admin", "urgent"]);

  const relabelled = setLabels(ctx, principal, passport.id, ["admin"]);
  assert.deepEqual(relabelled.labels, ["admin"]);

  assert.deepEqual(
    listItems(ctx, principal, { label: "admin" }).map((item) => item.id),
    [passport.id],
  );
});

test("deleting an Item takes it out of reach", () => {
  const { ctx, principal } = testHarness();
  const created = createItem(ctx, principal, { title: "Renew passport" });

  deleteItem(ctx, principal, created.id);

  assert.throws(() => getItem(ctx, principal, created.id), {
    code: "not_found",
  });
  assert.deepEqual(listItems(ctx, principal), []);
});

test("a title that is not text is refused rather than crashing", () => {
  const { ctx, principal } = testHarness();

  assert.throws(
    () => createItem(ctx, principal, { title: 42 as unknown as string }),
    { code: "invalid" },
  );
});

test("an unrecognized Status filter is refused, whichever adapter asks", () => {
  const { ctx, principal } = testHarness();

  assert.throws(
    () => listItems(ctx, principal, { status: "nonsense" as "captured" }),
    { code: "invalid" },
  );
});

test("an Item can be marked as a Template after the fact, and unmarked", () => {
  const { ctx, principal } = testHarness();
  const item = createItem(ctx, principal, { title: "Weekly review" });

  assert.equal(reviseItem(ctx, principal, item.id, { isTemplate: true }).isTemplate, true);
  assert.equal(reviseItem(ctx, principal, item.id, { isTemplate: false }).isTemplate, false);
});
