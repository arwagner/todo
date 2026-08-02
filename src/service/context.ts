import type { Db } from "../db/open.ts";

/**
 * The identity a request acts as. The service takes it as an explicit argument
 * rather than reading ambient context, so a query that forgets to filter by
 * owner fails to compile (ADR 6).
 */
export type Principal = {
  id: string;
  name: string;
};

/**
 * Everything the service needs from the outside world. The caller supplies the
 * clock, because the system has no clock of its own. Nothing happens without a
 * request. Every time-dependent read runs against a time the caller gives it
 * (ADR 7).
 */
export type ServiceContext = {
  db: Db;
  now: () => string;
  newId: () => string;
};

export function productionContext(db: Db): ServiceContext {
  return {
    db,
    now: () => new Date().toISOString(),
    newId: () => crypto.randomUUID(),
  };
}
