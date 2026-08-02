import type { Db } from "./open.ts";

const depth = new WeakMap<Db, number>();

/**
 * Runs `work` inside a savepoint, so that a service function which calls
 * another service function still ends up with one all-or-nothing write.
 */
export function transact<T>(db: Db, work: () => T): T {
  const level = depth.get(db) ?? 0;
  const name = `todo_sp_${level}`;
  depth.set(db, level + 1);
  db.exec(`savepoint ${name}`);
  try {
    const result = work();
    db.exec(`release ${name}`);
    return result;
  } catch (error) {
    db.exec(`rollback to ${name}`);
    db.exec(`release ${name}`);
    throw error;
  } finally {
    depth.set(db, level);
  }
}
