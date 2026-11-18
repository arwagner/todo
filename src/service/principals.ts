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
  if (name.trim() === "") throw invalid("a Principal's name must not be empty");
  const clash = ctx.db
    .prepare("select id from principals where name = ? and id <> ?")
    .get(name, principal.id);
  if (clash !== undefined) {
    throw conflict(`another Principal is already named "${name}"`);
  }
  ctx.db.prepare("update principals set name = ? where id = ?").run(name, id);
  return { id: principal.id, name };
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
