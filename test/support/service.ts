import { openDatabase } from "../../src/db/open.ts";
import { createPrincipal } from "../../src/service/principals.ts";
import type { Principal, ServiceContext } from "../../src/service/context.ts";

export type TestHarness = {
  ctx: ServiceContext;
  principal: Principal;
  /** A second Principal, for proving one owner cannot see another's Items. */
  stranger: Principal;
  travelTo: (at: string) => void;
};

/**
 * A service context over a real in-memory database. The store is part of the
 * unit under test, not a collaborator to mock. A fake store would only prove
 * that our beliefs about SQL agree with themselves.
 */
export function testHarness(start = "2026-01-01T00:00:00Z"): TestHarness {
  const db = openDatabase(":memory:");
  let clock = start;
  let counter = 0;

  const ctx: ServiceContext = {
    db,
    now: () => clock,
    newId: () => {
      counter += 1;
      return `id-${String(counter).padStart(4, "0")}`;
    },
  };

  return {
    ctx,
    principal: createPrincipal(ctx, "Andrew"),
    stranger: createPrincipal(ctx, "Someone Else"),
    travelTo: (at: string) => {
      clock = at;
    },
  };
}
