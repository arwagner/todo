import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Where the database lives. Deliberately outside the deploy directory so that
 * no deploy script can remove it (ADR 5).
 */
export function databasePath(): string {
  const configured = process.env["TODO_DB"];
  const path =
    configured !== undefined && configured !== ""
      ? configured
      : join(homedir(), ".local", "share", "todo", "todo.db");

  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  return path;
}
