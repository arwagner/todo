import { transact } from "../db/transact.ts";
import { statusOf } from "../domain/status.ts";
import {
  NO_CAPABILITIES,
  loadCapabilities,
  writeReminder,
  writeSchedule,
  writeTarget,
} from "./capabilities.ts";
import { invalid, notFound } from "./errors.ts";
import { checkPreset } from "./presets.ts";
import type { Status } from "../domain/types.ts";
import type { Reminder, Schedule, Target } from "./capabilities.ts";
import type { Principal, ServiceContext } from "./context.ts";

/**
 * The single kind of thing this system tracks. Capabilities hang off it and
 * are absent by default, so every read path handles absence (ADR 1).
 */
export type Item = {
  id: string;
  ownerId: string;
  title: string;
  notes: string | null;
  isTemplate: boolean;
  instantiatedFrom: string | null;
  /**
   * Read from the Event log. For a recurring Item this describes the most
   * recent Occurrence, not whether the Item is due again. See `statusOf`.
   */
  status: Status;
  labels: string[];
  schedule: Schedule | null;
  target: Target | null;
  reminder: Reminder | null;
  /** At least one incomplete Dependency. Derived, never stored. */
  blocked: boolean;
  /** Complete contents against total, for display only. Null if it holds nothing. */
  rollup: Rollup | null;
  createdAt: string;
  updatedAt: string;
};

export type Rollup = {
  complete: number;
  total: number;
};

export type CreateItemInput = {
  title: string;
  notes?: string | null;
  labels?: readonly string[];
  /** Validated at creation and then forgotten. */
  preset?: string;
  schedule?: Schedule | null;
  target?: Target | null;
  reminder?: Reminder | null;
  isTemplate?: boolean;
  /** Set when this Item is an Instance produced from a Template. */
  instantiatedFrom?: string | null;
};

export type ListItemsFilter = {
  label?: string;
  status?: Status;
  isTemplate?: boolean;
};

export function createItem(
  ctx: ServiceContext,
  principal: Principal,
  input: CreateItemInput,
): Item {
  const title = cleanTitle(input.title);

  return transact(ctx.db, () => {
    const at = ctx.now();
    const id = ctx.newId();

    ctx.db
      .prepare(
        `insert into items
           (id, owner_id, title, notes, is_template, instantiated_from,
            current_status, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        principal.id,
        title,
        input.notes ?? null,
        input.isTemplate === true ? 1 : 0,
        input.instantiatedFrom ?? null,
        statusOf([]),
        at,
        at,
      );

    writeLabels(ctx, id, input.labels ?? []);
    writeSchedule(ctx, id, input.schedule ?? null);
    writeTarget(ctx, id, input.target ?? null);
    writeReminder(ctx, id, input.reminder ?? null);

    const item = getItem(ctx, principal, id);
    if (input.preset !== undefined) checkPreset(input.preset, item);
    return item;
  });
}

export function setSchedule(
  ctx: ServiceContext,
  principal: Principal,
  id: string,
  schedule: Schedule | null,
): Item {
  return withCapability(ctx, principal, id, () =>
    writeSchedule(ctx, id, schedule),
  );
}

export function setTarget(
  ctx: ServiceContext,
  principal: Principal,
  id: string,
  target: Target | null,
): Item {
  return withCapability(ctx, principal, id, () => writeTarget(ctx, id, target));
}

export function setReminder(
  ctx: ServiceContext,
  principal: Principal,
  id: string,
  reminder: Reminder | null,
): Item {
  return withCapability(ctx, principal, id, () =>
    writeReminder(ctx, id, reminder),
  );
}

function withCapability(
  ctx: ServiceContext,
  principal: Principal,
  id: string,
  write: () => void,
): Item {
  return transact(ctx.db, () => {
    getItem(ctx, principal, id);
    write();
    touch(ctx, id);
    return getItem(ctx, principal, id);
  });
}

export function getItem(
  ctx: ServiceContext,
  principal: Principal,
  id: string,
): Item {
  const row = ctx.db
    .prepare("select * from items where id = ? and owner_id = ?")
    .get(id, principal.id);
  if (row === undefined) throw notFound("item");
  return hydrate(ctx, [row])[0] as Item;
}

export function listItems(
  ctx: ServiceContext,
  principal: Principal,
  filter: ListItemsFilter = {},
): Item[] {
  const conditions = ["items.owner_id = ?"];
  const bindings: (string | number)[] = [principal.id];

  if (filter.label !== undefined) {
    conditions.push(
      "exists (select 1 from item_labels where item_id = items.id and label = ?)",
    );
    bindings.push(filter.label);
  }

  if (filter.status !== undefined) {
    conditions.push("items.current_status = ?");
    bindings.push(filter.status);
  }

  if (filter.isTemplate !== undefined) {
    conditions.push("items.is_template = ?");
    bindings.push(filter.isTemplate ? 1 : 0);
  }

  const rows = ctx.db
    .prepare(
      `select * from items
       where ${conditions.join(" and ")}
       order by created_at, id`,
    )
    .all(...bindings);

  return hydrate(ctx, rows);
}

export type UpdateItemInput = {
  title?: string;
  notes?: string | null;
};

/**
 * Attribute edits are ordinary mutable updates. There is no `title_changed`
 * Event and there should never be one (ADR 2).
 */
export function updateItem(
  ctx: ServiceContext,
  principal: Principal,
  id: string,
  input: UpdateItemInput,
): Item {
  const existing = getItem(ctx, principal, id);

  ctx.db
    .prepare(
      "update items set title = ?, notes = ?, updated_at = ? where id = ? and owner_id = ?",
    )
    .run(
      input.title === undefined ? existing.title : cleanTitle(input.title),
      input.notes === undefined ? existing.notes : input.notes,
      ctx.now(),
      id,
      principal.id,
    );

  return getItem(ctx, principal, id);
}

export type ReviseItemInput = UpdateItemInput & {
  labels?: readonly string[];
  schedule?: Schedule | null;
  target?: Target | null;
  reminder?: Reminder | null;
};

/**
 * Changes attributes and Capabilities together, in one transaction. A caller
 * that revises four things and fails on the fourth must find the Item exactly
 * as it was.
 *
 * Only the keys present in `input` are touched. Passing null removes a
 * Capability.
 */
export function reviseItem(
  ctx: ServiceContext,
  principal: Principal,
  id: string,
  input: ReviseItemInput,
): Item {
  return transact(ctx.db, () => {
    getItem(ctx, principal, id);

    if (given(input, "title") || given(input, "notes")) {
      updateItem(ctx, principal, id, input);
    }
    if (given(input, "labels")) {
      setLabels(ctx, principal, id, input.labels as readonly string[]);
    }
    if (given(input, "schedule")) {
      setSchedule(ctx, principal, id, input.schedule ?? null);
    }
    if (given(input, "target")) {
      setTarget(ctx, principal, id, input.target ?? null);
    }
    if (given(input, "reminder")) {
      setReminder(ctx, principal, id, input.reminder ?? null);
    }

    return getItem(ctx, principal, id);
  });
}

function given(input: ReviseItemInput, key: keyof ReviseItemInput): boolean {
  return Object.hasOwn(input, key) && input[key] !== undefined;
}

export function deleteItem(
  ctx: ServiceContext,
  principal: Principal,
  id: string,
): void {
  const result = ctx.db
    .prepare("delete from items where id = ? and owner_id = ?")
    .run(id, principal.id);
  if (result.changes === 0) throw notFound("item");
}

export function setLabels(
  ctx: ServiceContext,
  principal: Principal,
  id: string,
  labels: readonly string[],
): Item {
  return transact(ctx.db, () => {
    getItem(ctx, principal, id);
    ctx.db.prepare("delete from item_labels where item_id = ?").run(id);
    writeLabels(ctx, id, labels);
    touch(ctx, id);
    return getItem(ctx, principal, id);
  });
}

function writeLabels(
  ctx: ServiceContext,
  itemId: string,
  labels: readonly string[],
): void {
  const insert = ctx.db.prepare(
    "insert or ignore into item_labels (item_id, label) values (?, ?)",
  );
  for (const label of labels) {
    const trimmed = label.trim();
    if (trimmed !== "") insert.run(itemId, trimmed);
  }
}

/**
 * The service does not trust its callers. An adapter that hands over a title
 * of the wrong type must get a ServiceError, not a TypeError, because only the
 * first one becomes a sensible status code.
 */
function cleanTitle(title: unknown): string {
  if (typeof title !== "string" || title.trim() === "") {
    throw invalid("an Item needs a title");
  }
  return title.trim();
}

export function touch(ctx: ServiceContext, id: string): void {
  ctx.db
    .prepare("update items set updated_at = ? where id = ?")
    .run(ctx.now(), id);
}

/** Turns item rows into Items, loading each attached Capability in one query. */
export function hydrate(
  ctx: ServiceContext,
  rows: readonly Record<string, unknown>[],
): Item[] {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row["id"] as string);
  const placeholders = ids.map(() => "?").join(", ");
  const capabilities = loadCapabilities(ctx, ids);

  const blocked = new Set(
    ctx.db
      .prepare(
        `select distinct dependencies.item_id from dependencies
           join items on items.id = dependencies.depends_on_id
          where dependencies.item_id in (${placeholders})
            and items.current_status <> 'completed'`,
      )
      .all(...ids)
      .map((row) => row["item_id"] as string),
  );

  const rollups = new Map<string, Rollup>();
  for (const row of ctx.db
    .prepare(
      `select containment.container_id,
              count(*) as total,
              sum(case when items.current_status = 'completed' then 1 else 0 end) as complete
         from containment
         join items on items.id = containment.child_id
        where containment.container_id in (${placeholders})
        group by containment.container_id`,
    )
    .all(...ids)) {
    rollups.set(row["container_id"] as string, {
      complete: Number(row["complete"]),
      total: Number(row["total"]),
    });
  }

  const labels = new Map<string, string[]>();
  for (const row of ctx.db
    .prepare(
      `select item_id, label from item_labels
       where item_id in (${placeholders}) order by label`,
    )
    .all(...ids)) {
    const itemId = row["item_id"] as string;
    const existing = labels.get(itemId);
    if (existing === undefined) labels.set(itemId, [row["label"] as string]);
    else existing.push(row["label"] as string);
  }

  return rows.map((row) => {
    const id = row["id"] as string;
    const attached = capabilities.get(id) ?? NO_CAPABILITIES;
    return {
      id,
      ownerId: row["owner_id"] as string,
      title: row["title"] as string,
      notes: (row["notes"] as string | null) ?? null,
      isTemplate: row["is_template"] === 1,
      instantiatedFrom: (row["instantiated_from"] as string | null) ?? null,
      status: row["current_status"] as Status,
      labels: labels.get(id) ?? [],
      schedule: attached.schedule,
      target: attached.target,
      reminder: attached.reminder,
      blocked: blocked.has(id),
      rollup: rollups.get(id) ?? null,
      createdAt: row["created_at"] as string,
      updatedAt: row["updated_at"] as string,
    };
  });
}
