import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

const MIGRATIONS_DIR = join(import.meta.dirname, "migrations");

/**
 * Applies every unapplied migration file in name order, each in its own
 * transaction. Hand-rolled rather than inherited from a migration library,
 * which is the whole of what `better-sqlite3`'s ecosystem would have bought
 * us (ADR 5).
 */
export function migrate(db: DatabaseSync): void {
  db.exec(`
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at text not null
    )
  `);

  const applied = new Set(
    db
      .prepare("select name from schema_migrations")
      .all()
      .map((row) => row["name"] as string),
  );

  const pending = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) => !applied.has(name));

  for (const name of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, name), "utf8");
    db.exec("begin");
    try {
      db.exec(sql);
      db.prepare(
        "insert into schema_migrations (name, applied_at) values (?, ?)",
      ).run(name, new Date().toISOString());
      db.exec("commit");
    } catch (cause) {
      db.exec("rollback");
      throw new Error(`migration ${name} failed`, { cause });
    }
  }
}
