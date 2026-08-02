import { DatabaseSync } from "node:sqlite";
import { migrate } from "./migrate.ts";

export type Db = DatabaseSync;

/**
 * Opens the database and brings it up to the current schema. One process, one
 * file, no separate service to operate (ADR 5).
 *
 * `migrate: false` opens it as it stands. Backing up is the reason this
 * exists: a copy taken on a timer must record what is there, and must not be
 * the thing that moves the schema (ADR 8).
 */
export function openDatabase(
  path: string,
  options: { migrate?: boolean } = {},
): Db {
  const db = new DatabaseSync(path);
  if (path !== ":memory:") db.exec("pragma journal_mode = wal");
  db.exec("pragma foreign_keys = on");
  db.exec("pragma busy_timeout = 5000");
  if (options.migrate !== false) migrate(db);
  return db;
}
