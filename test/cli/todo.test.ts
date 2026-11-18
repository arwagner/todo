import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../../src/cli/todo.ts", import.meta.url));

/**
 * Seam 6: the `todo` administration command. It is the only way to create a
 * Principal or mint a token (ADR 6), so it is run as a real process against a
 * throwaway database, exactly as an operator would run it.
 */
function scratchDatabase(): string {
  const directory = mkdtempSync(join(tmpdir(), "todo-cli-"));
  test.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, "todo.db");
}

function todoAgainst(database: string, ...args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, TODO_DB: database },
  });
}

/** Runs the CLI against its own throwaway database. */
function todo(...args: string[]) {
  return todoAgainst(scratchDatabase(), ...args);
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

test("a name an object inherits is not a command", () => {
  const result = todo("constructor");

  assert.equal(result.status, 1);
  assert.match(result.stderr, /^unknown command "constructor"\n/);
});

test("help still prints the usage to stdout and succeeds", () => {
  const result = todo("help");

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /^todo - administration for the todo service/);
});

test("a Principal is added, listed, and given a token to list and revoke", () => {
  const database = scratchDatabase();

  const added = todoAgainst(database, "principals", "add", "Ada");
  assert.equal(added.status, 0);
  const [principalId] = added.stdout.trim().split("  ");
  assert.equal(added.stdout, `${principalId}  Ada\n`);

  const principals = todoAgainst(database, "principals", "list");
  assert.equal(principals.stdout, `${principalId}  Ada\n`);

  const minted = todoAgainst(database, "tokens", "mint", "Ada", "laptop");
  assert.equal(minted.status, 0);
  assert.match(minted.stderr, /only time the token is shown/);

  const listed = todoAgainst(database, "tokens", "list", "Ada");
  const [tokenId] = listed.stdout.trim().split("  ");
  assert.equal(listed.stdout, `${tokenId}  active  laptop\n`);

  const revoked = todoAgainst(database, "tokens", "revoke", "Ada", tokenId!);
  assert.equal(revoked.stdout, `revoked ${tokenId}\n`);
  assert.equal(
    todoAgainst(database, "tokens", "list", "Ada").stdout,
    `${tokenId}  revoked  laptop\n`,
  );
});

test("migrate reports the database it brought up to date", () => {
  const database = scratchDatabase();
  const result = todoAgainst(database, "migrate");

  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${database} is at the current schema\n`);
});

test("a command missing its arguments prints its own usage line", () => {
  for (const [args, usage] of [
    [["principals", "add"], "usage: todo principals add <name>"],
    [["tokens", "mint", "Ada"], "usage: todo tokens mint <principal> <name>"],
    [["tokens", "list"], "usage: todo tokens list <principal>"],
    [["tokens", "revoke", "Ada"], "usage: todo tokens revoke <principal> <id>"],
    [["backup"], "usage: todo backup <path>"],
  ] as const) {
    const result = todo(...args);
    assert.equal(result.status, 1, args.join(" "));
    assert.equal(result.stderr, `${usage}\n`);
  }
});
