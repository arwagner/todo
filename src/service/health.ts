import type { ServiceContext } from "./context.ts";

/**
 * Whether the process can still reach its database. The file is opened once at
 * boot and never reopened, so this is the only part of being up that can
 * change underneath a running process.
 *
 * It lives here rather than in the adapter because reaching for the database
 * is service work, and because both adapters can ask (ADR 4).
 */
export function databaseReachable(ctx: ServiceContext): boolean {
  try {
    ctx.db.prepare("select 1").get();
    return true;
  } catch {
    return false;
  }
}
