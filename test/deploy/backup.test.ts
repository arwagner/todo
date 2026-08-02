import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupDatabase } from "../../src/db/backup.ts";
import { openDatabase } from "../../src/db/open.ts";
import { productionContext } from "../../src/service/context.ts";
import { createItem, listItems } from "../../src/service/items.ts";
import { testHarness } from "../support/service.ts";

/**
 * Seam 5: the deploy surface. ADR 5 accepts that backups are not inherited
 * from a database service and must be arranged deliberately. This is the
 * deliberate arrangement, so it is tested against real files.
 */
function scratch(): string {
  const directory = mkdtempSync(join(tmpdir(), "todo-backup-"));
  test.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("a database can be opened without being migrated", () => {
  const path = join(scratch(), "todo.db");

  const untouched = openDatabase(path, { migrate: false });
  const tables = untouched
    .prepare("select name from sqlite_master where type = 'table'")
    .all();

  assert.deepEqual(tables, [], "opening to copy must not move the schema");
  assert.ok(
    openDatabase(path)
      .prepare("select name from sqlite_master where type = 'table'")
      .all().length > 0,
    "opening normally still migrates",
  );
});

test("a backup makes the directory it was pointed at", () => {
  const { ctx } = testHarness();
  const destination = join(scratch(), "nightly", "2026-01-01", "todo.db");

  backupDatabase(ctx.db, destination);

  assert.ok(existsSync(destination));
});

test("a backup will not quietly replace an existing one", () => {
  const { ctx } = testHarness();
  const destination = join(scratch(), "todo.db");
  backupDatabase(ctx.db, destination);

  assert.throws(
    () => backupDatabase(ctx.db, destination),
    new RegExp(destination),
    "the message a timer writes to the journal should name the file",
  );
});

test("a backup is a working database holding the same Items", () => {
  const { ctx, principal } = testHarness();
  createItem(ctx, principal, { title: "Renew passport" });
  const destination = join(scratch(), "todo.db");

  backupDatabase(ctx.db, destination);

  const restored = productionContext(openDatabase(destination));
  const items = listItems(restored, principal, {});
  assert.deepEqual(
    items.map((item) => item.title),
    ["Renew passport"],
  );
});
