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
 * Commands resolve a Principal by id or exact name, so a rename refuses a name
 * another Principal already has. The name is trimmed, as Item titles are.
 */
export function renamePrincipal(
  ctx: ServiceContext,
  id: string,
  name: string,
): Principal {
  const principal = getPrincipal(ctx, id);
  const trimmed = name.trim();
  if (trimmed === "") throw invalid("a Principal needs a name");
  const clash = ctx.db
    .prepare("select 1 from principals where name = ? and id <> ?")
    .get(trimmed, principal.id);
  if (clash !== undefined) {
    throw conflict(`another Principal is already named "${trimmed}"`);
  }
  ctx.db
    .prepare("update principals set name = ? where id = ?")
    .run(trimmed, principal.id);
  return { id: principal.id, name: trimmed };
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
