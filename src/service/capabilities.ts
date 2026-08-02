import { invalid } from "./errors.ts";
import type { RecurrenceRule, RecurrenceUnit } from "../domain/recurrence.ts";
import type { ServiceContext } from "./context.ts";

/** A due date, a Recurrence Rule, or both. */
export type Schedule = {
  dueAt: string | null;
  rule: RecurrenceRule | null;
};

/**
 * What a caller may send for a Schedule. An adapter gives the service parsed
 * JSON, where an optional key is absent, not null. The two mean the same
 * thing, so every optional field is optional here as well (ADR 4).
 */
export type ScheduleInput = {
  dueAt?: string | null;
  rule?: RecurrenceRuleInput | null;
};

/** What a caller may send for a Recurrence Rule. See `ScheduleInput`. */
export type RecurrenceRuleInput =
  | {
      kind: "schedule";
      every: number;
      unit: RecurrenceUnit;
      weekdays?: number[] | null;
    }
  | { kind: "completion"; every: number; unit: RecurrenceUnit };

/** A quantity to reach and a deadline to reach it by. */
export type Target = {
  amount: number;
  unit: string | null;
  deadline: string | null;
};

/** What a caller may send for a Target. See `ScheduleInput`. */
export type TargetInput = {
  amount: number;
  unit?: string | null;
  deadline?: string | null;
};

/** A time the Owner should be told. Recorded only. Nothing acts on it (ADR 7). */
export type Reminder = {
  remindAt: string;
};

export type Capabilities = {
  schedule: Schedule | null;
  target: Target | null;
  reminder: Reminder | null;
};

export const NO_CAPABILITIES: Capabilities = {
  schedule: null,
  target: null,
  reminder: null,
};

export function writeSchedule(
  ctx: ServiceContext,
  itemId: string,
  schedule: ScheduleInput | null,
): void {
  ctx.db.prepare("delete from schedules where item_id = ?").run(itemId);
  if (schedule === null) return;

  const validated = validateSchedule(schedule);
  ctx.db
    .prepare("insert into schedules (item_id, due_at, rule) values (?, ?, ?)")
    .run(
      itemId,
      validated.dueAt,
      validated.rule === null ? null : JSON.stringify(validated.rule),
    );
}

export function writeTarget(
  ctx: ServiceContext,
  itemId: string,
  target: TargetInput | null,
): void {
  ctx.db.prepare("delete from targets where item_id = ?").run(itemId);
  if (target === null) return;

  const validated = validateTarget(target);
  ctx.db
    .prepare(
      "insert into targets (item_id, amount, unit, deadline) values (?, ?, ?, ?)",
    )
    .run(itemId, validated.amount, validated.unit, validated.deadline);
}

export function writeReminder(
  ctx: ServiceContext,
  itemId: string,
  reminder: Reminder | null,
): void {
  ctx.db.prepare("delete from reminders where item_id = ?").run(itemId);
  if (reminder === null) return;

  const validated = validateReminder(reminder);
  ctx.db
    .prepare("insert into reminders (item_id, remind_at) values (?, ?)")
    .run(itemId, validated.remindAt);
}

/** Loads every Capability for a batch of Items in three queries. */
export function loadCapabilities(
  ctx: ServiceContext,
  ids: readonly string[],
): Map<string, Capabilities> {
  const loaded = new Map<string, Capabilities>();
  for (const id of ids) loaded.set(id, { ...NO_CAPABILITIES });
  if (ids.length === 0) return loaded;

  const placeholders = ids.map(() => "?").join(", ");
  const at = (id: unknown): Capabilities =>
    loaded.get(id as string) as Capabilities;

  for (const row of ctx.db
    .prepare(
      `select item_id, due_at, rule from schedules where item_id in (${placeholders})`,
    )
    .all(...ids)) {
    at(row["item_id"]).schedule = {
      dueAt: (row["due_at"] as string | null) ?? null,
      rule:
        row["rule"] === null
          ? null
          : (JSON.parse(row["rule"] as string) as RecurrenceRule),
    };
  }

  for (const row of ctx.db
    .prepare(
      `select item_id, amount, unit, deadline from targets where item_id in (${placeholders})`,
    )
    .all(...ids)) {
    at(row["item_id"]).target = {
      amount: row["amount"] as number,
      unit: (row["unit"] as string | null) ?? null,
      deadline: (row["deadline"] as string | null) ?? null,
    };
  }

  for (const row of ctx.db
    .prepare(
      `select item_id, remind_at from reminders where item_id in (${placeholders})`,
    )
    .all(...ids)) {
    at(row["item_id"]).reminder = { remindAt: row["remind_at"] as string };
  }

  return loaded;
}

/**
 * The service does not trust its callers. An adapter hands over parsed JSON,
 * which can be any shape at all, so every field below is read off `unknown`.
 * A caller that sends the wrong shape must get a ServiceError naming the field
 * it got wrong, never a TypeError, because only the first one becomes a
 * sensible status code (ADR 4).
 */
function validateSchedule(input: unknown): Schedule {
  const schedule = fieldsOf("schedule", input);
  const dueAt = timestampOrNull("schedule.dueAt", schedule["dueAt"]);
  const rule = schedule["rule"] ?? null;

  if (dueAt === null && rule === null) {
    throw invalid("a Schedule needs a due date, a Recurrence Rule, or both");
  }
  const validatedRule = rule === null ? null : validateRule(rule);
  if (
    validatedRule !== null &&
    validatedRule.kind === "schedule" &&
    dueAt === null
  ) {
    throw invalid("a schedule-anchored rule needs a due date to measure from");
  }
  return { dueAt, rule: validatedRule };
}

const UNITS: readonly RecurrenceUnit[] = ["day", "week", "month", "year"];

function validateRule(input: unknown): RecurrenceRule {
  const rule = fieldsOf("schedule.rule", input);
  const kind = rule["kind"];
  const every = rule["every"];
  const unit = rule["unit"];

  if (kind !== "schedule" && kind !== "completion") {
    throw invalid("a Recurrence Rule must be schedule- or completion-anchored");
  }
  if (typeof every !== "number" || !Number.isInteger(every) || every < 1) {
    throw invalid("rule.every must be a positive whole number");
  }
  if (!isUnit(unit)) {
    throw invalid(`rule.unit must be one of ${UNITS.join(", ")}`);
  }
  if (kind === "completion") {
    return { kind: "completion", every, unit };
  }

  const weekdays = rule["weekdays"] ?? null;
  if (weekdays === null) {
    return { kind: "schedule", every, unit };
  }
  if (unit !== "week") {
    throw invalid("rule.weekdays only applies to weekly rules");
  }
  if (
    !Array.isArray(weekdays) ||
    weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)
  ) {
    throw invalid(
      "rule.weekdays must be an array of ISO weekdays, 1 (Monday) to 7",
    );
  }
  return { kind: "schedule", every, unit, weekdays: [...weekdays] };
}

function validateTarget(input: unknown): Target {
  const target = fieldsOf("target", input);
  const amount = target["amount"];

  if (typeof amount !== "number" || !(amount > 0)) {
    throw invalid("target.amount must be a number greater than zero");
  }
  return {
    amount,
    unit: stringOrNull("target.unit", target["unit"]),
    deadline: timestampOrNull("target.deadline", target["deadline"]),
  };
}

function validateReminder(input: unknown): Reminder {
  const reminder = fieldsOf("reminder", input);

  if (!isTimestamp(reminder["remindAt"])) {
    throw invalid("reminder.remindAt must be an ISO 8601 timestamp");
  }
  return { remindAt: reminder["remindAt"] };
}

/** Reads a Capability payload, naming it if the caller sent something else. */
function fieldsOf(field: string, value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(`${field} must be an object or null`);
  }
  return value as Record<string, unknown>;
}

/** An absent key and an explicit null both mean "not set" (ADR 4). */
function stringOrNull(field: string, value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw invalid(`${field} must be a string or null`);
  }
  return value;
}

function timestampOrNull(field: string, value: unknown): string | null {
  if (value == null) return null;
  if (!isTimestamp(value)) {
    throw invalid(`${field} must be an ISO 8601 timestamp`);
  }
  return value;
}

export function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isUnit(value: unknown): value is RecurrenceUnit {
  return UNITS.some((unit) => unit === value);
}
