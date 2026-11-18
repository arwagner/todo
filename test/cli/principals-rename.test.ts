import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../../src/cli/todo.ts", import.meta.url));

/**
 * `todo principals rename`, run as a real process against a throwaway
 * database, exactly as an operator would run it. The rules on names are the
 * service's and are tested there. These tests only prove the wiring.
 */
function scratchDatabase(): string {
  const directory = mkdtempSync(join(tmpdir(), "todo-cli-"));
  test.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, "todo.db");
}

function todo(database: string, ...args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, TODO_DB: database },
  });
}

function addPrincipal(database: string, name: string): string {
  const added = todo(database, "principals", "add", name);
  assert.equal(added.status, 0);
  return added.stdout.trim().split("  ")[0] as string;
}

test("a Principal found by name is renamed and printed as id and new name", () => {
  const database = scratchDatabase();
  const id = addPrincipal(database, "Ada");

  const renamed = todo(database, "principals", "rename", "Ada", "Ada Lovelace");

  assert.equal(renamed.status, 0);
  assert.equal(renamed.stderr, "");
  assert.equal(renamed.stdout, `${id}  Ada Lovelace\n`);
  assert.equal(todo(database, "principals", "list").stdout, `${id}  Ada Lovelace\n`);
});

test("a Principal is found by id as well as by name", () => {
  const database = scratchDatabase();
  const id = addPrincipal(database, "Ada");

  const renamed = todo(database, "principals", "rename", id, "Grace");

  assert.equal(renamed.status, 0);
  assert.equal(renamed.stdout, `${id}  Grace\n`);
});

test("a name another Principal has is refused in one line, not a stack trace", () => {
  const database = scratchDatabase();
  addPrincipal(database, "Ada");
  addPrincipal(database, "Grace");

  const renamed = todo(database, "principals", "rename", "Ada", "Grace");

  assert.equal(renamed.status, 1);
  assert.equal(renamed.stdout, "");
  assert.equal(renamed.stderr, 'another Principal is already named "Grace"\n');
});

test("an empty name is refused in one line, not a stack trace", () => {
  const database = scratchDatabase();
  addPrincipal(database, "Ada");

  const renamed = todo(database, "principals", "rename", "Ada", "   ");

  assert.equal(renamed.status, 1);
  assert.equal(renamed.stdout, "");
  assert.equal(renamed.stderr, "a Principal needs a name\n");
});

test("an unknown Principal is refused before anything is renamed", () => {
  const renamed = todo(scratchDatabase(), "principals", "rename", "Nobody", "Ada");

  assert.equal(renamed.status, 1);
  assert.equal(renamed.stderr, 'no Principal matching "Nobody"\n');
});

test("a missing new name prints the usage", () => {
  const renamed = todo(scratchDatabase(), "principals", "rename", "Ada");

  assert.equal(renamed.status, 1);
  assert.equal(
    renamed.stderr,
    "usage: todo principals rename <principal> <new name>\n",
  );
});

test("todo help lists the rename command", () => {
  const help = todo(scratchDatabase(), "help");

  assert.equal(help.status, 0);
  assert.match(help.stdout, /todo principals rename <principal> <new name>/);
});
