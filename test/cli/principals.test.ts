import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scratchDirectory } from "../support/scratch.ts";

/**
 * Seam 6: the admin CLI, run as a real process against a throwaway database,
 * as an operator runs it. The rules on Principal names belong to the service
 * and are tested there. These tests prove only the wiring.
 */
const CLI = fileURLToPath(new URL("../../src/cli/todo.ts", import.meta.url));

function scratchDatabase(): string {
  return join(scratchDirectory("cli"), "todo.db");
}

function todo(database: string, ...args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, TODO_DB: database },
  });
}

function addPrincipal(database: string, name: string): string {
  const added = todo(database, "principals", "add", name);
  assert.equal(added.status, 0, added.stderr);
  return added.stdout.split("  ")[0] as string;
}

test("a Principal named by its name is renamed and printed as id and new name", () => {
  const database = scratchDatabase();
  const id = addPrincipal(database, "Ada");

  const renamed = todo(database, "principals", "rename", "Ada", "Ada Lovelace");

  assert.equal(renamed.status, 0, renamed.stderr);
  assert.equal(renamed.stdout, `${id}  Ada Lovelace\n`);
  assert.equal(
    todo(database, "principals", "list").stdout,
    `${id}  Ada Lovelace\n`,
  );
});

test("a Principal named by its id is renamed", () => {
  const database = scratchDatabase();
  const id = addPrincipal(database, "Ada");

  const renamed = todo(database, "principals", "rename", id, "Grace");

  assert.equal(renamed.status, 0, renamed.stderr);
  assert.equal(renamed.stdout, `${id}  Grace\n`);
});

test("a clash the service refuses is one line on stderr, not a stack trace", () => {
  const database = scratchDatabase();
  addPrincipal(database, "Ada");
  addPrincipal(database, "Grace");

  const renamed = todo(database, "principals", "rename", "Ada", "Grace");

  assert.equal(renamed.status, 1);
  assert.equal(renamed.stdout, "");
  assert.equal(renamed.stderr, 'another Principal is already named "Grace"\n');
});

test("an empty name the service refuses is one line on stderr", () => {
  const database = scratchDatabase();
  addPrincipal(database, "Ada");

  const renamed = todo(database, "principals", "rename", "Ada", "  ");

  assert.equal(renamed.status, 1);
  assert.equal(renamed.stdout, "");
  assert.equal(renamed.stderr, "a Principal needs a name\n");
});

test("an unknown Principal is refused", () => {
  const renamed = todo(scratchDatabase(), "principals", "rename", "Nobody", "Ada");

  assert.equal(renamed.status, 1);
  assert.equal(renamed.stderr, 'no Principal matching "Nobody"\n');
});

test("a missing argument prints the rename usage", () => {
  const database = scratchDatabase();
  for (const args of [["Ada"], []]) {
    const renamed = todo(database, "principals", "rename", ...args);

    assert.equal(renamed.status, 1);
    assert.equal(
      renamed.stderr,
      "usage: todo principals rename <principal> <new name>\n",
    );
  }
});

test("todo help lists the rename command", () => {
  const help = todo(scratchDatabase(), "help");

  assert.equal(help.status, 0);
  assert.match(help.stdout, /^ {2}todo principals rename <principal> <new name>$/m);
});
