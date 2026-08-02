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

  if (!isTimestamp(reminder.remindAt)) {
    throw invalid("reminder.remindAt must be an ISO 8601 timestamp");
  }
  ctx.db
    .prepare("insert into reminders (item_id, remind_at) values (?, ?)")
    .run(itemId, reminder.remindAt);
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

function validateSchedule(schedule: ScheduleInput): Schedule {
  const dueAt = schedule.dueAt ?? null;
  const rule = schedule.rule ?? null;

  if (dueAt === null && rule === null) {
    throw invalid("a Schedule needs a due date, a Recurrence Rule, or both");
  }
  if (dueAt !== null && !isTimestamp(dueAt)) {
    throw invalid("schedule.dueAt must be an ISO 8601 timestamp");
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

export function validateRule(rule: RecurrenceRuleInput): RecurrenceRule {
  if (rule.kind !== "schedule" && rule.kind !== "completion") {
    throw invalid("a Recurrence Rule must be schedule- or completion-anchored");
  }
  if (!Number.isInteger(rule.every) || rule.every < 1) {
    throw invalid("rule.every must be a positive whole number");
  }
  if (!UNITS.includes(rule.unit)) {
    throw invalid(`rule.unit must be one of ${UNITS.join(", ")}`);
  }
  if (rule.kind === "completion") {
    return { kind: "completion", every: rule.every, unit: rule.unit };
  }

  const weekdays = rule.weekdays ?? null;
  if (weekdays === null) {
    return { kind: "schedule", every: rule.every, unit: rule.unit };
  }
  if (rule.unit !== "week") {
    throw invalid("rule.weekdays only applies to weekly rules");
  }
  if (weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
    throw invalid("rule.weekdays must be ISO weekdays, 1 (Monday) to 7");
  }
  return {
    kind: "schedule",
    every: rule.every,
    unit: rule.unit,
    weekdays: [...weekdays],
  };
}

function validateTarget(target: TargetInput): Target {
  const deadline = target.deadline ?? null;

  if (typeof target.amount !== "number" || !(target.amount > 0)) {
    throw invalid("target.amount must be greater than zero");
  }
  if (deadline !== null && !isTimestamp(deadline)) {
    throw invalid("target.deadline must be an ISO 8601 timestamp");
  }
  return {
    amount: target.amount,
    unit: target.unit ?? null,
    deadline,
  };
}

export function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
