import { test } from "node:test";
import assert from "node:assert/strict";
import { listEvents, recordEvent } from "../../src/service/events.ts";
import { createItem, listItems } from "../../src/service/items.ts";
import { addChild, listChildren } from "../../src/service/relationships.ts";
import { instantiateTemplate } from "../../src/service/templates.ts";
import { testHarness } from "../support/service.ts";

function withTemplate() {
  const harness = testHarness();
  const { ctx, principal } = harness;

  const template = createItem(ctx, principal, {
    title: "Weekly review",
    notes: "Half an hour, Friday afternoon",
    labels: ["ritual"],
    isTemplate: true,
    schedule: { dueAt: "2026-01-02T16:00:00Z", rule: null },
  });
  const child = createItem(ctx, principal, {
    title: "Empty the inbox",
    isTemplate: true,
  });
  addChild(ctx, principal, template.id, child.id);

  return { ...harness, template, child };
}

test("instantiating a Template produces a live Item and live copies of its contents", () => {
  const { ctx, principal, template, child } = withTemplate();

  const instance = instantiateTemplate(ctx, principal, template.id);

  assert.equal(instance.isTemplate, false);
  assert.equal(instance.instantiatedFrom, template.id);
  assert.equal(instance.title, "Weekly review");
  assert.equal(instance.notes, "Half an hour, Friday afternoon");
  assert.deepEqual(instance.labels, ["ritual"]);
  assert.deepEqual(instance.schedule, {
    dueAt: "2026-01-02T16:00:00Z",
    rule: null,
  });

  const contents = listChildren(ctx, principal, instance.id);
  assert.deepEqual(
    contents.map((item) => item.title),
    ["Empty the inbox"],
  );
  assert.notEqual(contents[0]?.id, child.id);
  assert.equal(contents[0]?.isTemplate, false);
});

test("the Template survives instantiation unchanged", () => {
  const { ctx, principal, template, child } = withTemplate();

  instantiateTemplate(ctx, principal, template.id);

  assert.deepEqual(
    listChildren(ctx, principal, template.id).map((item) => item.id),
    [child.id],
  );
  assert.deepEqual(
    listItems(ctx, principal, { isTemplate: true }).map((item) => item.id),
    [template.id, child.id],
  );
});

test("an Instance starts with no history of its own", () => {
  const { ctx, principal, template } = withTemplate();
  recordEvent(ctx, principal, template.id, { kind: "completed" });

  const instance = instantiateTemplate(ctx, principal, template.id);

  assert.equal(instance.status, "captured");
  assert.deepEqual(listEvents(ctx, principal, instance.id), []);
});

test("only a Template can be instantiated", () => {
  const { ctx, principal } = testHarness();
  const ordinary = createItem(ctx, principal, { title: "Renew passport" });

  assert.throws(() => instantiateTemplate(ctx, principal, ordinary.id), {
    code: "invalid",
  });
});

test("a Template belonging to someone else cannot be instantiated", () => {
  const { ctx, stranger, template } = withTemplate();

  assert.throws(() => instantiateTemplate(ctx, stranger, template.id), {
    code: "not_found",
  });
});
