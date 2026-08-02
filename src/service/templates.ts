import { transact } from "../db/transact.ts";
import { invalid } from "./errors.ts";
import { createItem, getItem } from "./items.ts";
import { addChild, listChildren } from "./relationships.ts";
import type { Item } from "./items.ts";
import type { Principal, ServiceContext } from "./context.ts";

/**
 * Copies a Template into a live Item, and copies everything it contains the
 * same way.
 *
 * Instantiation is always explicit. Making a read instantiate due Templates as
 * a side effect would be a workaround for the missing scheduler, and would
 * have to be unwound when the scheduler arrives (ADR 7).
 *
 * The copy takes the Template's attributes, Labels and Capabilities. It does
 * not take its Event log: an Instance is new work and starts with no history.
 */
export function instantiateTemplate(
  ctx: ServiceContext,
  principal: Principal,
  templateId: string,
): Item {
  return transact(ctx.db, () => {
    const template = getItem(ctx, principal, templateId);
    if (!template.isTemplate) {
      throw invalid("only a Template can be instantiated");
    }
    return copy(ctx, principal, template);
  });
}

function copy(
  ctx: ServiceContext,
  principal: Principal,
  template: Item,
): Item {
  const instance = createItem(ctx, principal, {
    title: template.title,
    notes: template.notes,
    labels: template.labels,
    schedule: template.schedule,
    target: template.target,
    reminder: template.reminder,
    instantiatedFrom: template.id,
  });

  for (const child of listChildren(ctx, principal, template.id)) {
    const copiedChild = copy(ctx, principal, child);
    addChild(ctx, principal, instance.id, copiedChild.id);
  }

  return getItem(ctx, principal, instance.id);
}
