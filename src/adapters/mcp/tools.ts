import { deleteEvent, listEvents, recordEvent } from "../../service/events.ts";
import {
  createItem,
  deleteItem,
  getItem,
  listItems,
  setLabels,
  setReminder,
  setSchedule,
  setTarget,
  updateItem,
} from "../../service/items.ts";
import {
  dueItems,
  streakFor,
  targetProgressFor,
} from "../../service/queries.ts";
import {
  addChild,
  addDependency,
  listChildren,
  listDependencies,
  removeChild,
  removeDependency,
} from "../../service/relationships.ts";
import { instantiateTemplate } from "../../service/templates.ts";
import { invalid } from "../../service/errors.ts";
import type { Principal, ServiceContext } from "../../service/context.ts";

export type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handle: (
    ctx: ServiceContext,
    principal: Principal,
    args: Record<string, unknown>,
  ) => unknown;
};

const RECURRENCE_SCHEMA = {
  type: "object",
  description:
    "How the Item repeats. A schedule anchor measures the next repetition " +
    "from fixed calendar dates; a completion anchor measures it from the " +
    "last Completion.",
  properties: {
    kind: { type: "string", enum: ["schedule", "completion"] },
    every: { type: "integer", minimum: 1 },
    unit: { type: "string", enum: ["day", "week", "month", "year"] },
    weekdays: {
      type: "array",
      items: { type: "integer", minimum: 1, maximum: 7 },
      description: "Weekly schedule rules only. ISO weekdays, 1 is Monday.",
    },
  },
  required: ["kind", "every", "unit"],
} as const;

const SCHEDULE_SCHEMA = {
  type: ["object", "null"],
  description: "A due date, a Recurrence Rule, or both. Null removes it.",
  properties: {
    dueAt: { type: ["string", "null"], description: "ISO 8601 timestamp." },
    rule: RECURRENCE_SCHEMA,
  },
} as const;

const TARGET_SCHEMA = {
  type: ["object", "null"],
  description: "A quantity to reach and a deadline. Null removes it.",
  properties: {
    amount: { type: "number", exclusiveMinimum: 0 },
    unit: { type: ["string", "null"] },
    deadline: { type: ["string", "null"] },
  },
  required: ["amount"],
} as const;

const REMINDER_SCHEMA = {
  type: ["object", "null"],
  description:
    "A time the Owner should be told. Recorded only. Nothing fires it.",
  properties: { remindAt: { type: "string" } },
  required: ["remindAt"],
} as const;

const CAPABILITY_PROPERTIES = {
  labels: { type: "array", items: { type: "string" } },
  schedule: SCHEDULE_SCHEMA,
  target: TARGET_SCHEMA,
  reminder: REMINDER_SCHEMA,
} as const;

/**
 * The MCP surface. Coarse and intent-shaped rather than a mirror of the REST
 * resources, because the client is a language model and round trips are the
 * expensive thing (ADR 4).
 */
export const TOOLS: readonly Tool[] = [
  {
    name: "capture",
    description:
      "Write down a piece of work. Everything beyond the title is optional; " +
      "a Preset ('task', 'habit', 'project', 'goal') checks that the " +
      "Capabilities it needs are present.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        notes: { type: ["string", "null"] },
        preset: { type: "string", enum: ["task", "habit", "project", "goal"] },
        isTemplate: {
          type: "boolean",
          description: "Mark this as a pattern to copy rather than work to do.",
        },
        ...CAPABILITY_PROPERTIES,
      },
      required: ["title"],
    },
    handle: (ctx, principal, args) =>
      createItem(ctx, principal, args as { title: string }),
  },

  {
    name: "agenda",
    description:
      "What is waiting on the Owner at a given moment. Recurrence Rules are " +
      "evaluated now, at query time; nothing runs in the background.",
    inputSchema: {
      type: "object",
      properties: {
        at: {
          type: "string",
          description: "ISO 8601 timestamp. Defaults to now.",
        },
      },
    },
    handle: (ctx, principal, args) =>
      dueItems(ctx, principal, string(args["at"]) ?? ctx.now()),
  },

  {
    name: "find_items",
    description: "List Items, optionally narrowed by Label, Status or Template.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string" },
        status: {
          type: "string",
          enum: ["captured", "promoted", "started", "completed", "dropped"],
        },
        isTemplate: { type: "boolean" },
      },
    },
    handle: (ctx, principal, args) => listItems(ctx, principal, args),
  },

  {
    name: "inspect_item",
    description:
      "Everything known about one Item in a single call: its Capabilities, " +
      "its Event history, its Streak, its Target progress, what it contains " +
      "and what it waits on.",
    inputSchema: {
      type: "object",
      properties: {
        itemId: { type: "string" },
        at: { type: "string", description: "When to evaluate the Streak." },
      },
      required: ["itemId"],
    },
    handle: (ctx, principal, args) => {
      const itemId = required(args, "itemId");
      const at = string(args["at"]) ?? ctx.now();
      return {
        item: getItem(ctx, principal, itemId),
        events: listEvents(ctx, principal, itemId),
        streak: streakFor(ctx, principal, itemId, at),
        target: targetProgressFor(ctx, principal, itemId),
        contains: listChildren(ctx, principal, itemId),
        dependsOn: listDependencies(ctx, principal, itemId),
      };
    },
  },

  {
    name: "record",
    description:
      "Record a lifecycle fact about an Item: that it was promoted, started, " +
      "completed, dropped, or advanced by some amount. These are the only " +
      "things that become Events.",
    inputSchema: {
      type: "object",
      properties: {
        itemId: { type: "string" },
        kind: {
          type: "string",
          enum: ["promoted", "started", "completed", "dropped", "progress"],
        },
        at: {
          type: "string",
          description: "ISO 8601. Defaults to now; backdating is allowed.",
        },
        amount: {
          type: "number",
          description: "Required for progress, meaningless otherwise.",
        },
        note: { type: ["string", "null"] },
      },
      required: ["itemId", "kind"],
    },
    handle: (ctx, principal, args) =>
      recordEvent(ctx, principal, required(args, "itemId"), args as never),
  },

  {
    name: "undo_event",
    description:
      "Delete a mistakenly recorded Event. The Status is re-derived from " +
      "what is left.",
    inputSchema: {
      type: "object",
      properties: { eventId: { type: "string" } },
      required: ["eventId"],
    },
    handle: (ctx, principal, args) => {
      deleteEvent(ctx, principal, required(args, "eventId"));
      return { deleted: true };
    },
  },

  {
    name: "revise",
    description:
      "Change an Item's attributes or Capabilities. Editing these is not an " +
      "Event and leaves no history. Pass null to remove a Capability.",
    inputSchema: {
      type: "object",
      properties: {
        itemId: { type: "string" },
        title: { type: "string" },
        notes: { type: ["string", "null"] },
        ...CAPABILITY_PROPERTIES,
      },
      required: ["itemId"],
    },
    handle: (ctx, principal, args) => {
      const itemId = required(args, "itemId");
      if (has(args, "title") || has(args, "notes")) {
        updateItem(ctx, principal, itemId, args as never);
      }
      if (has(args, "labels")) {
        setLabels(ctx, principal, itemId, args["labels"] as string[]);
      }
      if (has(args, "schedule")) {
        setSchedule(ctx, principal, itemId, args["schedule"] as never);
      }
      if (has(args, "target")) {
        setTarget(ctx, principal, itemId, args["target"] as never);
      }
      if (has(args, "reminder")) {
        setReminder(ctx, principal, itemId, args["reminder"] as never);
      }
      return getItem(ctx, principal, itemId);
    },
  },

  {
    name: "link",
    description:
      "Relate two Items. A dependency says the first cannot proceed until " +
      "the second is complete. Containment says the first holds the second. " +
      "A container still completes as its own deliberate act.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["dependency", "containment"] },
        itemId: { type: "string" },
        otherId: { type: "string" },
        remove: { type: "boolean", description: "Remove the link instead." },
      },
      required: ["kind", "itemId", "otherId"],
    },
    handle: (ctx, principal, args) => {
      const itemId = required(args, "itemId");
      const otherId = required(args, "otherId");
      const remove = args["remove"] === true;
      const kind = required(args, "kind");

      if (kind === "dependency") {
        if (remove) removeDependency(ctx, principal, itemId, otherId);
        else addDependency(ctx, principal, itemId, otherId);
      } else if (kind === "containment") {
        if (remove) removeChild(ctx, principal, itemId, otherId);
        else addChild(ctx, principal, itemId, otherId);
      } else {
        throw invalid("kind must be 'dependency' or 'containment'");
      }
      return getItem(ctx, principal, itemId);
    },
  },

  {
    name: "instantiate_template",
    description:
      "Copy a Template into live work, along with everything it contains. " +
      "Always explicit: nothing instantiates Templates on its own.",
    inputSchema: {
      type: "object",
      properties: { templateId: { type: "string" } },
      required: ["templateId"],
    },
    handle: (ctx, principal, args) =>
      instantiateTemplate(ctx, principal, required(args, "templateId")),
  },

  {
    name: "forget_item",
    description: "Delete an Item outright, with its history and its links.",
    inputSchema: {
      type: "object",
      properties: { itemId: { type: "string" } },
      required: ["itemId"],
    },
    handle: (ctx, principal, args) => {
      deleteItem(ctx, principal, required(args, "itemId"));
      return { deleted: true };
    },
  },
];

export function callTool(
  ctx: ServiceContext,
  principal: Principal,
  name: string,
  args: Record<string, unknown>,
): unknown {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  if (tool === undefined) throw invalid(`no such tool "${name}"`);
  return tool.handle(ctx, principal, args);
}

function required(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value === "") {
    throw invalid(`${key} is required`);
  }
  return value;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function has(args: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(args, key) && args[key] !== undefined;
}
