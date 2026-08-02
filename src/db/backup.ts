import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Db } from "./open.ts";

/**
 * Writes a consistent copy of the database to `destination`, without stopping
 * the service. SQLite's `VACUUM INTO` takes its own read transaction, so a
 * copy taken while requests are being served is a copy of one point in time,
 * which `cp` on a WAL database is not.
 *
 * ADR 5 accepts that nothing arranges backups for us. This is the thing a
 * timer on the box calls (ADR 8).
 */
export function backupDatabase(db: Db, destination: string): void {
  // SQLite refuses to overwrite too, but says only "output file already
  // exists". A timer's failure lands in a journal nobody is reading yet, so it
  // has to name the file when someone finally does read it.
  if (existsSync(destination)) {
    throw new Error(`refusing to overwrite the backup at ${destination}`);
  }

  mkdirSync(dirname(destination), { recursive: true });
  db.prepare("vacuum into ?").run(destination);
}
