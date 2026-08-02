import { invalid } from "./errors.ts";
import type { Capabilities } from "./capabilities.ts";

type Requirement = "schedule" | "recurrence" | "target" | "reminder";

/**
 * A Preset is a shortcut for the person creating an Item: a named bundle of
 * Capabilities that must be present. Nothing branches on it afterwards, and
 * the Item does not record which one built it.
 *
 * This is the runtime check that stands in for the type the compiler cannot
 * express: "a habit always has a Recurrence Rule" (ADR 1).
 */
const PRESETS: Record<string, readonly Requirement[]> = {
  task: [],
  project: [],
  habit: ["recurrence"],
  goal: ["target"],
};

const DESCRIPTIONS: Record<Requirement, string> = {
  schedule: "a Schedule",
  recurrence: "a Schedule carrying a Recurrence Rule",
  target: "a Target",
  reminder: "a Reminder",
};

export function checkPreset(name: string, capabilities: Capabilities): void {
  const requirements = PRESETS[name];
  if (requirements === undefined) {
    throw invalid(
      `unknown preset "${name}". Expected one of ${Object.keys(PRESETS).join(", ")}`,
    );
  }

  for (const requirement of requirements) {
    if (!satisfies(requirement, capabilities)) {
      throw invalid(
        `the "${name}" preset needs ${DESCRIPTIONS[requirement]}`,
      );
    }
  }
}

function satisfies(
  requirement: Requirement,
  capabilities: Capabilities,
): boolean {
  switch (requirement) {
    case "schedule":
      return capabilities.schedule !== null;
    case "recurrence":
      return capabilities.schedule?.rule != null;
    case "target":
      return capabilities.target !== null;
    case "reminder":
      return capabilities.reminder !== null;
  }
}
