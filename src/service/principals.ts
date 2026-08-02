import { notFound } from "./errors.ts";
import type { Principal, ServiceContext } from "./context.ts";

export function createPrincipal(ctx: ServiceContext, name: string): Principal {
  const principal = { id: ctx.newId(), name };
  ctx.db
    .prepare("insert into principals (id, name, created_at) values (?, ?, ?)")
    .run(principal.id, principal.name, ctx.now());
  return principal;
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
