import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import type { SpawnSyncOptions } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Seam 6: the administration CLI. Its contract is what it prints and the code
 * it exits with, so it is run as a process rather than called.
 */
const cli = fileURLToPath(new URL("../../src/cli/todo.ts", import.meta.url));
const USAGE_FIRST_LINE = /^todo - administration for the todo service\n/;

function run(args: readonly string[], options: SpawnSyncOptions = {}) {
  return spawnSync(process.execPath, [cli, ...args], { ...options, encoding: "utf8" });
}

for (const flag of ["-h", "--help", "help"]) {
  test(`todo ${flag} prints the usage and succeeds`, () => {
    const result = run([flag]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, USAGE_FIRST_LINE);
    assert.equal(result.stderr, "");
  });
}

for (const args of [
  ["tokens", "-h"],
  ["principals", "add", "-h"],
  ["backup", "--help"],
  ["migrate", "-h"],
]) {
  test(`todo ${args.join(" ")} prints the usage and touches nothing`, () => {
    const dir = mkdtempSync(join(tmpdir(), "todo-help-"));
    try {
      const result = run(args, {
        cwd: dir,
        env: { ...process.env, TODO_DB: join(dir, "todo.db") },
      });

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, USAGE_FIRST_LINE);
      assert.deepEqual(readdirSync(dir), []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test("an unknown command still prints the usage to stderr and fails", () => {
  const result = run(["frobnicate"]);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, USAGE_FIRST_LINE);
});
