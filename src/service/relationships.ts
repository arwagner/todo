import { transact } from "../db/transact.ts";
import { conflict } from "./errors.ts";
import { getItem, hydrate } from "./items.ts";
import type { Item } from "./items.ts";
import type { Principal, ServiceContext } from "./context.ts";

/** `itemId` cannot proceed until `dependsOnId` is complete. */
export function addDependency(
  ctx: ServiceContext,
  principal: Principal,
  itemId: string,
  dependsOnId: string,
): void {
  transact(ctx.db, () => {
    requireBoth(ctx, principal, itemId, dependsOnId, "depend on");
    if (reaches(ctx, "dependencies", "depends_on_id", dependsOnId, itemId)) {
      throw conflict("that Dependency would close a cycle");
    }
    ctx.db
      .prepare(
        "insert or ignore into dependencies (item_id, depends_on_id) values (?, ?)",
      )
      .run(itemId, dependsOnId);
  });
}

export function removeDependency(
  ctx: ServiceContext,
  principal: Principal,
  itemId: string,
  dependsOnId: string,
): void {
  getItem(ctx, principal, itemId);
  ctx.db
    .prepare("delete from dependencies where item_id = ? and depends_on_id = ?")
    .run(itemId, dependsOnId);
}

export function listDependencies(
  ctx: ServiceContext,
  principal: Principal,
  itemId: string,
): Item[] {
  getItem(ctx, principal, itemId);
  return hydrate(
    ctx,
    ctx.db
      .prepare(
        `select items.* from dependencies
           join items on items.id = dependencies.depends_on_id
          where dependencies.item_id = ?
          order by items.created_at, items.id`,
      )
      .all(itemId),
  );
}

/**
 * Puts `childId` inside `containerId`. A container completes as its own
 * deliberate act, so this changes nothing about either Item's lifecycle.
 */
export function addChild(
  ctx: ServiceContext,
  principal: Principal,
  containerId: string,
  childId: string,
): void {
  transact(ctx.db, () => {
    requireBoth(ctx, principal, containerId, childId, "contain");
    if (reaches(ctx, "containment", "child_id", childId, containerId)) {
      throw conflict("that Containment would close a cycle");
    }
    ctx.db
      .prepare(
        "insert or ignore into containment (container_id, child_id) values (?, ?)",
      )
      .run(containerId, childId);
  });
}

export function removeChild(
  ctx: ServiceContext,
  principal: Principal,
  containerId: string,
  childId: string,
): void {
  getItem(ctx, principal, containerId);
  ctx.db
    .prepare("delete from containment where container_id = ? and child_id = ?")
    .run(containerId, childId);
}

export function listChildren(
  ctx: ServiceContext,
  principal: Principal,
  containerId: string,
): Item[] {
  getItem(ctx, principal, containerId);
  return hydrate(
    ctx,
    ctx.db
      .prepare(
        `select items.* from containment
           join items on items.id = containment.child_id
          where containment.container_id = ?
          order by items.created_at, items.id`,
      )
      .all(containerId),
  );
}

function requireBoth(
  ctx: ServiceContext,
  principal: Principal,
  from: string,
  to: string,
  verb: string,
): void {
  getItem(ctx, principal, from);
  getItem(ctx, principal, to);
  if (from === to) throw conflict(`an Item cannot ${verb} itself`);
}

/**
 * Walks the edge table forward from `start` to find out whether `target` is
 * reachable. If it is, the reverse edge would close a cycle.
 */
function reaches(
  ctx: ServiceContext,
  table: "dependencies" | "containment",
  toColumn: "depends_on_id" | "child_id",
  start: string,
  target: string,
): boolean {
  const fromColumn = table === "dependencies" ? "item_id" : "container_id";
  const row = ctx.db
    .prepare(
      `with recursive reachable(id) as (
         select ?
         union
         select ${table}.${toColumn} from ${table}
           join reachable on reachable.id = ${table}.${fromColumn}
       )
       select 1 as found from reachable where id = ? limit 1`,
    )
    .get(start, target);
  return row !== undefined;
}
