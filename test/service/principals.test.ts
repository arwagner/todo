import { test } from "node:test";
import assert from "node:assert/strict";
import { ServiceError } from "../../src/service/errors.ts";
import {
  getPrincipal,
  listPrincipals,
  renamePrincipal,
} from "../../src/service/principals.ts";
import { testHarness } from "../support/service.ts";

function hasCode(code: string) {
  return (error: unknown) =>
    error instanceof ServiceError && error.code === code;
}

test("renaming a Principal keeps its id and reads back the new name", () => {
  const { ctx, principal } = testHarness();

  const renamed = renamePrincipal(ctx, principal.id, "Andy");

  assert.deepEqual(renamed, { id: principal.id, name: "Andy" });
  assert.deepEqual(getPrincipal(ctx, principal.id), renamed);
  assert.deepEqual(
    listPrincipals(ctx).find((p) => p.id === principal.id),
    renamed,
  );
});

test("a renamed Principal's name is trimmed", () => {
  const { ctx, principal } = testHarness();

  renamePrincipal(ctx, principal.id, "  Andy  ");

  assert.equal(getPrincipal(ctx, principal.id).name, "Andy");
});

test("renaming a Principal to another Principal's name is a conflict", () => {
  const { ctx, principal, stranger } = testHarness();

  assert.throws(
    () => renamePrincipal(ctx, principal.id, stranger.name),
    (error: unknown) =>
      hasCode("conflict")(error) &&
      (error as Error).message.includes(stranger.name),
  );
  assert.equal(getPrincipal(ctx, principal.id).name, principal.name);
  assert.equal(getPrincipal(ctx, stranger.id).name, stranger.name);
});

test("a name that clashes only after trimming is still a conflict", () => {
  const { ctx, principal, stranger } = testHarness();

  assert.throws(
    () => renamePrincipal(ctx, principal.id, ` ${stranger.name} `),
    hasCode("conflict"),
  );
});

test("renaming a Principal to its own name is not a clash", () => {
  const { ctx, principal } = testHarness();

  const renamed = renamePrincipal(ctx, principal.id, principal.name);

  assert.deepEqual(renamed, principal);
});

test("an empty or whitespace-only name is invalid", () => {
  const { ctx, principal } = testHarness();

  for (const name of ["", "   \t "]) {
    assert.throws(
      () => renamePrincipal(ctx, principal.id, name),
      hasCode("invalid"),
    );
  }
  assert.equal(getPrincipal(ctx, principal.id).name, principal.name);
});

test("a name that is not text is refused rather than crashing", () => {
  const { ctx, principal } = testHarness();

  assert.throws(
    () => renamePrincipal(ctx, principal.id, 42 as unknown as string),
    hasCode("invalid"),
  );
  assert.equal(getPrincipal(ctx, principal.id).name, principal.name);
});

test("renaming an unknown Principal is not found", () => {
  const { ctx } = testHarness();

  assert.throws(
    () => renamePrincipal(ctx, "no-such-principal", "Anyone"),
    hasCode("not_found"),
  );
});
