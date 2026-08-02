import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../../src/adapters/mcp/server.ts";
import { testHarness } from "../support/service.ts";

/**
 * Seam 4: smoke only. These tests prove that a tool call reaches the same
 * service the HTTP adapter calls, and comes back formatted (ADR 4).
 */
async function withClient() {
  const harness = testHarness();
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();

  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([
    createMcpServer(harness.ctx, harness.principal).connect(serverEnd),
    client.connect(clientEnd),
  ]);

  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    const [block] = result.content as { type: string; text: string }[];
    return {
      isError: result.isError === true,
      text: block?.text ?? "",
      json: () => JSON.parse(block?.text ?? "null") as never,
    };
  };

  return { ...harness, client, call };
}

test("the tool surface is intent-shaped rather than a mirror of the REST routes", async () => {
  const { client } = await withClient();

  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name);

  assert.ok(names.includes("capture"));
  assert.ok(names.includes("agenda"));
  assert.ok(names.includes("inspect_item"));
  for (const tool of tools) {
    assert.ok((tool.description ?? "").length > 0, `${tool.name} needs a description`);
  }
});

test("capturing and then completing an Item goes through the service", async () => {
  const { call } = await withClient();

  const captured = await call("capture", {
    title: "Renew passport",
    labels: ["admin"],
  });
  const item = captured.json() as { id: string; title: string; status: string };
  assert.equal(item.title, "Renew passport");
  assert.equal(item.status, "captured");

  await call("record", { itemId: item.id, kind: "completed" });

  const inspected = (await call("inspect_item", { itemId: item.id })).json() as {
    item: { status: string; labels: string[] };
    events: { kind: string }[];
  };
  assert.equal(inspected.item.status, "completed");
  assert.deepEqual(inspected.item.labels, ["admin"]);
  assert.deepEqual(
    inspected.events.map((event) => event.kind),
    ["completed"],
  );
});

test("the agenda evaluates Recurrence Rules at the moment it is asked", async () => {
  const { call } = await withClient();

  const bins = (
    await call("capture", {
      title: "Take the bins out",
      preset: "habit",
      schedule: {
        dueAt: "2026-01-06T08:00:00Z",
        rule: { kind: "schedule", every: 1, unit: "week" },
      },
    })
  ).json() as { id: string };

  const before = (await call("agenda", { at: "2026-01-05T09:00:00Z" })).json();
  const after = (await call("agenda", { at: "2026-01-06T09:00:00Z" })).json() as {
    id: string;
  }[];

  assert.deepEqual(before, []);
  assert.deepEqual(
    after.map((item) => item.id),
    [bins.id],
  );
});

test("a service error comes back as a tool error rather than a crash", async () => {
  const { call } = await withClient();

  const missing = await call("inspect_item", { itemId: "nonexistent" });
  assert.equal(missing.isError, true);
  assert.match(missing.text, /not_found/);

  const badPreset = await call("capture", { title: "Floss", preset: "habit" });
  assert.equal(badPreset.isError, true);
  assert.match(badPreset.text, /invalid/);
});

test("a revision that fails partway leaves the Item exactly as it was", async () => {
  const { call } = await withClient();
  const item = (
    await call("capture", { title: "Read books", labels: ["reading"] })
  ).json() as { id: string };

  const failed = await call("revise", {
    itemId: item.id,
    labels: ["changed"],
    target: { amount: 0 },
  });

  assert.equal(failed.isError, true);
  const after = (await call("inspect_item", { itemId: item.id })).json() as {
    item: { labels: string[] };
  };
  assert.deepEqual(after.item.labels, ["reading"]);
});
