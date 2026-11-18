import { invalid } from "./errors.ts";

/**
 * The service does not trust its callers. An adapter that hands over text of
 * the wrong type must get a ServiceError, not a TypeError, because only the
 * first one becomes a sensible status code. Returns the text trimmed, and
 * refuses it with `message` when nothing is left.
 */
export function requiredText(value: unknown, message: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed === "") throw invalid(message);
  return trimmed;
}
