import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createHttpServer } from "../../src/adapters/http/server.ts";
import { mintToken } from "../../src/auth/tokens.ts";
import { testHarness } from "../support/service.ts";
import type { AddressInfo } from "node:net";

/**
 * Seam 4: smoke only. The adapter parses a request into a Principal plus
 * arguments, then formats the result. These tests prove that a request reaches
 * the service and comes back. The behavior underneath belongs to the service
 * seam (ADR 4).
 */
async function withServer() {
  const harness = testHarness();
  const { token } = mintToken(harness.ctx, harness.principal, "test");
  const server = createHttpServer(harness.ctx);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  const call = (
    method: string,
    path: string,
    options: { body?: unknown; credential?: string | null } = {},
  ) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(options.credential === null
          ? {}
          : {
              authorization: `Bearer ${options.credential ?? token}`,
            }),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });

  after(() => server.close());
  return { ...harness, call };
}

test("an Item can be created and read back over HTTP", async () => {
  const { call } = await withServer();

  const created = await call("POST", "/items", {
    body: { title: "Renew passport", labels: ["admin"] },
  });
  assert.equal(created.status, 201);
  const item = (await created.json()) as { id: string; title: string };
  assert.equal(item.title, "Renew passport");

  const fetched = await call("GET", `/items/${item.id}`);
  assert.equal(fetched.status, 200);
  assert.deepEqual((await fetched.json()) as unknown, item);
});

test("recording a Completion over HTTP moves the Status", async () => {
  const { call } = await withServer();
  const item = (await (
    await call("POST", "/items", { body: { title: "Renew passport" } })
  ).json()) as { id: string };

  const recorded = await call("POST", `/items/${item.id}/events`, {
    body: { kind: "completed" },
  });
  assert.equal(recorded.status, 201);

  const fetched = (await (await call("GET", `/items/${item.id}`)).json()) as {
    status: string;
  };
  assert.equal(fetched.status, "completed");
});

test("health is readable without a credential, and says nothing else", async () => {
  const { call } = await withServer();

  const response = await call("GET", "/health", { credential: null });

  assert.equal(response.status, 200);
  // Not `status`: CONTEXT.md gives that word to an Item's lifecycle state, and
  // the same wire already uses it that way.
  assert.deepEqual((await response.json()) as unknown, { ok: true });
});

test("a request with no credential gets nowhere", async () => {
  const { call } = await withServer();

  const anonymous = await call("GET", "/items", { credential: null });
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get("www-authenticate"), "Bearer");

  const wrong = await call("GET", "/items", { credential: "todo_pat_nope" });
  assert.equal(wrong.status, 401);
});

test("a service error becomes the matching HTTP status", async () => {
  const { call } = await withServer();

  assert.equal((await call("GET", "/items/nonexistent")).status, 404);
  assert.equal(
    (await call("POST", "/items", { body: { title: "  " } })).status,
    400,
  );
  assert.equal((await call("GET", "/nowhere")).status, 404);
  assert.equal((await call("DELETE", "/due")).status, 405);
});

test("the next Occurrence is readable over HTTP", async () => {
  const { call } = await withServer();
  const bins = (await (
    await call("POST", "/items", {
      body: {
        title: "Take the bins out",
        schedule: {
          dueAt: "2026-01-06T08:00:00Z",
          rule: { kind: "schedule", every: 1, unit: "week" },
        },
      },
    })
  ).json()) as { id: string };

  const response = await call(
    "GET",
    `/items/${bins.id}/next-occurrence?at=2026-01-07T09:00:00Z`,
  );

  assert.deepEqual((await response.json()) as unknown, {
    nextOccurrence: "2026-01-13T08:00:00.000Z",
  });
});

test("an unrecognized status filter is refused rather than returning nothing", async () => {
  const { call } = await withServer();

  assert.equal((await call("GET", "/items?status=nonsense")).status, 400);
  assert.equal((await call("GET", "/items?status=completed")).status, 200);
});
