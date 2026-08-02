import { test } from "node:test";
import assert from "node:assert/strict";
import { serverConfig } from "../../src/config.ts";

/**
 * Seam 5: the deploy surface. A process that reads its own environment is the
 * one thing a deploy can get wrong in silence, so the reading is a function
 * that can be called without starting a server.
 */

test("the server binds to loopback on 8787 when nothing is configured", () => {
  assert.deepEqual(serverConfig({}), { host: "127.0.0.1", port: 8787 });
});

test("HOST and PORT move where the server listens", () => {
  assert.deepEqual(serverConfig({ HOST: "0.0.0.0", PORT: "9000" }), {
    host: "0.0.0.0",
    port: 9000,
  });
});

test("an empty setting reads as unset, matching how $TODO_DB is read", () => {
  assert.deepEqual(serverConfig({ HOST: "", PORT: "" }), {
    host: "127.0.0.1",
    port: 8787,
  });
});

test("a PORT that is not a usable port stops the process starting", () => {
  for (const port of ["http", "0", "-1", "70000", "8787.5"]) {
    assert.throws(
      () => serverConfig({ PORT: port }),
      /PORT/,
      `expected ${JSON.stringify(port)} to be refused`,
    );
  }
});
