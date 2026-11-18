import { test } from "node:test";
import assert from "node:assert/strict";
import { ServiceError } from "../../src/service/errors.ts";
import {
  getPrincipal,
  renamePrincipal,
} from "../../src/service/principals.ts";
import { testHarness } from "../support/service.ts";

function rejectsWith(code: string, fn: () => unknown) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ServiceError);
    assert.equal(error.code, code);
    return true;
  });
}

test("renaming a Principal returns it with its new name and stores the name", () => {
  const { ctx, principal } = testHarness();

  const renamed = renamePrincipal(ctx, principal.id, "Drew");

  assert.deepEqual(renamed, { id: principal.id, name: "Drew" });
  assert.equal(getPrincipal(ctx, principal.id).name, "Drew");
});

test("renaming a Principal to the name it already has is not a clash", () => {
  const { ctx, principal } = testHarness();

  const renamed = renamePrincipal(ctx, principal.id, "Andrew");

  assert.deepEqual(renamed, { id: principal.id, name: "Andrew" });
});

test("renaming a Principal to another Principal's name is a conflict", () => {
  const { ctx, principal } = testHarness();

  assert.throws(
    () => renamePrincipal(ctx, principal.id, "Someone Else"),
    (error) => {
      assert.ok(error instanceof ServiceError);
      assert.equal(error.code, "conflict");
      assert.match(error.message, /Someone Else/);
      return true;
    },
  );
  assert.equal(getPrincipal(ctx, principal.id).name, "Andrew");
});

test("an empty name is invalid", () => {
  const { ctx, principal } = testHarness();

  rejectsWith("invalid", () => renamePrincipal(ctx, principal.id, ""));
  assert.equal(getPrincipal(ctx, principal.id).name, "Andrew");
});

test("a whitespace-only name is invalid", () => {
  const { ctx, principal } = testHarness();

  rejectsWith("invalid", () => renamePrincipal(ctx, principal.id, "  \t "));
  assert.equal(getPrincipal(ctx, principal.id).name, "Andrew");
});

test("a name is stored without surrounding whitespace", () => {
  const { ctx, principal } = testHarness();

  const renamed = renamePrincipal(ctx, principal.id, "  Drew ");

  assert.equal(renamed.name, "Drew");
  assert.equal(getPrincipal(ctx, principal.id).name, "Drew");
});

test("padding a taken name with whitespace is still a conflict", () => {
  const { ctx, principal } = testHarness();

  assert.throws(() => renamePrincipal(ctx, principal.id, " Someone Else "), {
    code: "conflict",
  });
});

test("a name that is not a string is invalid, not a crash", () => {
  const { ctx, principal } = testHarness();

  rejectsWith("invalid", () =>
    renamePrincipal(ctx, principal.id, undefined as unknown as string),
  );
});

test("renaming an unknown Principal is not found", () => {
  const { ctx } = testHarness();

  rejectsWith("not_found", () => renamePrincipal(ctx, "no-such-id", "Drew"));
});
