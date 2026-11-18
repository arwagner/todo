import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../../src/cli/todo.ts", import.meta.url));

/** Runs the CLI against a throwaway database, so no test touches a real one. */
function todo(...args: string[]) {
  const directory = mkdtempSync(join(tmpdir(), "todo-cli-"));
  test.after(() => rmSync(directory, { recursive: true, force: true }));
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, TODO_DB: join(directory, "todo.db") },
  });
}

test("an unknown command is named before the usage", () => {
  const result = todo("frobnicate");

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^unknown command "frobnicate"\n/);
  assert.match(result.stderr, /todo - administration for the todo service/);
});

test("a known group with a bad action names both words", () => {
  const result = todo("tokens", "bogus");

  assert.equal(result.status, 1);
  assert.match(result.stderr, /^unknown command "tokens bogus"\n/);
});

test("a known group with no action names the group", () => {
  const result = todo("principals");

  assert.equal(result.status, 1);
  assert.match(result.stderr, /^unknown command "principals"\n/);
});

test("help still prints the usage to stdout and succeeds", () => {
  const result = todo("help");

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /^todo - administration for the todo service/);
});
