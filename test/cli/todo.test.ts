import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Seam 6: the admin CLI, run as a separate process, because what it writes to
 * stdout and stderr and how it exits are its interface.
 */
const cli = fileURLToPath(new URL("../../src/cli/todo.ts", import.meta.url));

function todo(...args: string[]) {
  const directory = mkdtempSync(join(tmpdir(), "todo-cli-"));
  try {
    return spawnSync(process.execPath, [cli, ...args], {
      encoding: "utf8",
      env: { ...process.env, TODO_DB: join(directory, "todo.db") },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

for (const flag of ["-h", "--help", "help"]) {
  test(`todo ${flag} prints the usage to stdout and succeeds`, () => {
    const result = todo(flag);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /^todo - administration for the todo service/);
    assert.equal(result.stderr, "");
  });
}

test("an unknown command prints the usage to stderr and fails", () => {
  const result = todo("frobnicate");

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^todo - administration for the todo service/);
});
