import { deleteEvent, listEvents, recordEvent } from "../../service/events.ts";
import {
  createItem,
  deleteItem,
  getItem,
  listItems,
  reviseItem,
  setLabels,
  setReminder,
  setSchedule,
  setTarget,
} from "../../service/items.ts";
import {
  dueItems,
  nextOccurrenceFor,
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
import { route } from "./router.ts";
import type { Route, RouteInput } from "./router.ts";
import type {
  CreateItemInput,
  ReviseItemInput,
} from "../../service/items.ts";
import type { RecordEventInput } from "../../service/events.ts";
import type { ServiceContext } from "../../service/context.ts";
import type { Status } from "../../domain/types.ts";

/**
 * The HTTP surface. Every handler parses a request into a Principal plus
 * arguments, then formats the result. Any logic that appears here is a bug
 * (ADR 4).
 */
export function routes(ctx: ServiceContext): Route[] {
  return [
    route("POST", "/items", ({ principal, body }) => ({
      status: 201,
      body: createItem(ctx, principal, fields<CreateItemInput>(body)),
    })),

    route("GET", "/items", ({ principal, query }) => ({
      status: 200,
      body: listItems(ctx, principal, {
        ...optional("label", query.get("label")),
        ...optional("status", status(query.get("status"))),
        ...optional("isTemplate", flag(query.get("isTemplate"))),
      }),
    })),

    route("GET", "/items/:id", ({ principal, params }) => ({
      status: 200,
      body: getItem(ctx, principal, id(params)),
    })),

    route("PATCH", "/items/:id", ({ principal, params, body }) => ({
      status: 200,
      body: reviseItem(ctx, principal, id(params), fields<ReviseItemInput>(body)),
    })),

    route("DELETE", "/items/:id", ({ principal, params }) => {
      deleteItem(ctx, principal, id(params));
      return { status: 204 };
    }),

    route("PUT", "/items/:id/labels", ({ principal, params, body }) => ({
      status: 200,
      body: setLabels(ctx, principal, id(params), array(fields(body)["labels"])),
    })),

    route("PUT", "/items/:id/schedule", ({ principal, params, body }) => ({
      status: 200,
      body: setSchedule(ctx, principal, id(params), nullableObject(body)),
    })),

    route("PUT", "/items/:id/target", ({ principal, params, body }) => ({
      status: 200,
      body: setTarget(ctx, principal, id(params), nullableObject(body)),
    })),

    route("PUT", "/items/:id/reminder", ({ principal, params, body }) => ({
      status: 200,
      body: setReminder(ctx, principal, id(params), nullableObject(body)),
    })),

    route("GET", "/items/:id/events", ({ principal, params }) => ({
      status: 200,
      body: listEvents(ctx, principal, id(params)),
    })),

    route("POST", "/items/:id/events", ({ principal, params, body }) => ({
      status: 201,
      body: recordEvent(
        ctx,
        principal,
        id(params),
        fields<RecordEventInput>(body),
      ),
    })),

    route("DELETE", "/events/:id", ({ principal, params }) => {
      deleteEvent(ctx, principal, id(params));
      return { status: 204 };
    }),

    route("GET", "/items/:id/streak", ({ principal, params, query }) => ({
      status: 200,
      body: { streak: streakFor(ctx, principal, id(params), at(query)) },
    })),

    route("GET", "/items/:id/next-occurrence", ({ principal, params, query }) => ({
      status: 200,
      body: {
        nextOccurrence: nextOccurrenceFor(
          ctx,
          principal,
          id(params),
          at(query),
        ),
      },
    })),

    route("GET", "/items/:id/target", ({ principal, params }) => ({
      status: 200,
      body: targetProgressFor(ctx, principal, id(params)),
    })),

    route("GET", "/items/:id/dependencies", ({ principal, params }) => ({
      status: 200,
      body: listDependencies(ctx, principal, id(params)),
    })),

    route("POST", "/items/:id/dependencies", ({ principal, params, body }) => {
      addDependency(ctx, principal, id(params), text(fields(body)["dependsOn"]));
      return { status: 204 };
    }),

    route("DELETE", "/items/:id/dependencies/:other", ({ principal, params }) => {
      removeDependency(ctx, principal, id(params), params["other"] as string);
      return { status: 204 };
    }),

    route("GET", "/items/:id/children", ({ principal, params }) => ({
      status: 200,
      body: listChildren(ctx, principal, id(params)),
    })),

    route("POST", "/items/:id/children", ({ principal, params, body }) => {
      addChild(ctx, principal, id(params), text(fields(body)["childId"]));
      return { status: 204 };
    }),

    route("DELETE", "/items/:id/children/:childId", ({ principal, params }) => {
      removeChild(ctx, principal, id(params), params["childId"] as string);
      return { status: 204 };
    }),

    route("POST", "/items/:id/instantiate", ({ principal, params }) => ({
      status: 201,
      body: instantiateTemplate(ctx, principal, id(params)),
    })),

    route("GET", "/due", ({ principal, query }) => ({
      status: 200,
      body: dueItems(ctx, principal, at(query)),
    })),
  ];
}

function id(params: RouteInput["params"]): string {
  return params["id"] as string;
}

/** The service defaults `at` to its own clock when the caller omits it. */
function at(query: URLSearchParams): string | undefined {
  return query.get("at") ?? undefined;
}

const STATUSES: readonly Status[] = [
  "captured",
  "promoted",
  "started",
  "completed",
  "dropped",
];

function status(value: string | null): Status | null {
  if (value === null) return null;
  if (!STATUSES.includes(value as Status)) {
    throw invalid(`status must be one of ${STATUSES.join(", ")}`);
  }
  return value as Status;
}

// The service does the validation. These helpers only check that the JSON has
// the shape the service signature expects. A bad request fails here, before it
// becomes a bad call.

function fields<T = Record<string, unknown>>(body: unknown): T {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw invalid("expected a JSON object");
  }
  return body as T;
}

function nullableObject<T>(body: unknown): T | null {
  if (body === null) return null;
  return fields(body) as T;
}

function array(value: unknown): string[] {
  if (!Array.isArray(value)) throw invalid("expected an array");
  return value as string[];
}

function text(value: unknown): string {
  if (typeof value !== "string") throw invalid("expected a string");
  return value;
}

function flag(value: string | null): boolean | null {
  if (value === null) return null;
  return value === "true";
}

function optional<K extends string, V>(
  key: K,
  value: V | null,
): Record<K, V> | Record<string, never> {
  return value === null ? {} : ({ [key]: value } as Record<K, V>);
}
