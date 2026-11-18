import { conflict, invalid, notFound } from "./errors.ts";
import type { Principal, ServiceContext } from "./context.ts";

export function createPrincipal(ctx: ServiceContext, name: string): Principal {
  const principal = { id: ctx.newId(), name };
  ctx.db
    .prepare("insert into principals (id, name, created_at) values (?, ?, ?)")
    .run(principal.id, principal.name, ctx.now());
  return principal;
}

/**
 * Names stay unique because the CLI resolves Principals by exact name.
 * Renaming a Principal to the name it already has is not a clash.
 */
export function renamePrincipal(
  ctx: ServiceContext,
  id: string,
  name: string,
): Principal {
  const principal = getPrincipal(ctx, id);
  const cleaned = cleanName(name);
  const clash = ctx.db
    .prepare("select id from principals where name = ? and id <> ?")
    .get(cleaned, principal.id);
  if (clash !== undefined) {
    throw conflict(`another Principal is already named "${cleaned}"`);
  }
  ctx.db
    .prepare("update principals set name = ? where id = ?")
    .run(cleaned, principal.id);
  return { id: principal.id, name: cleaned };
}

/**
 * The service does not trust its callers. An adapter that hands over a name of
 * the wrong type must get a ServiceError, not a TypeError. Surrounding
 * whitespace is dropped, so " Andrew " cannot pass the clash check as a second
 * "Andrew" that the CLI's exact-name lookup would never find.
 */
function cleanName(name: unknown): string {
  if (typeof name !== "string" || name.trim() === "") {
    throw invalid("a Principal's name must not be empty");
  }
  return name.trim();
}

export function getPrincipal(ctx: ServiceContext, id: string): Principal {
  const row = ctx.db
    .prepare("select id, name from principals where id = ?")
    .get(id);
  if (row === undefined) throw notFound("principal");
  return { id: row["id"] as string, name: row["name"] as string };
}

export function listPrincipals(ctx: ServiceContext): Principal[] {
  return ctx.db
    .prepare("select id, name from principals order by created_at")
    .all()
    .map((row) => ({ id: row["id"] as string, name: row["name"] as string }));
}
