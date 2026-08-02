import { DatabaseSync } from "node:sqlite";
import { migrate } from "./migrate.ts";

export type Db = DatabaseSync;

/**
 * Opens the database and brings it up to the current schema. One process, one
 * file, no separate service to operate (ADR 5).
 */
export function openDatabase(path: string): Db {
  const db = new DatabaseSync(path);
  if (path !== ":memory:") db.exec("pragma journal_mode = wal");
  db.exec("pragma foreign_keys = on");
  db.exec("pragma busy_timeout = 5000");
  migrate(db);
  return db;
}
