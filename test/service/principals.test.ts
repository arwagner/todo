import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getPrincipal,
  renamePrincipal,
} from "../../src/service/principals.ts";
import { testHarness } from "../support/service.ts";

test("renaming a Principal returns it with its new name and stores the name", () => {
  const { ctx, principal } = testHarness();

  const renamed = renamePrincipal(ctx, principal.id, "Drew");

  assert.deepEqual(renamed, { id: principal.id, name: "Drew" });
  assert.equal(getPrincipal(ctx, principal.id).name, "Drew");
});

test("renaming a Principal to the name it already has is not a clash", () => {
  const { ctx, principal } = testHarness();

  const renamed = renamePrincipal(ctx, principal.id, principal.name);

  assert.deepEqual(renamed, principal);
});

test("renaming a Principal to another Principal's name is a conflict", () => {
  const { ctx, principal, stranger } = testHarness();

  assert.throws(() => renamePrincipal(ctx, principal.id, stranger.name), {
    code: "conflict",
    message: new RegExp(stranger.name),
  });
  assert.equal(getPrincipal(ctx, principal.id).name, principal.name);
});

test("padding a taken name with whitespace is still a conflict", () => {
  const { ctx, principal, stranger } = testHarness();

  assert.throws(
    () => renamePrincipal(ctx, principal.id, ` ${stranger.name} `),
    { code: "conflict" },
  );
});

test("a name is stored without surrounding whitespace", () => {
  const { ctx, principal } = testHarness();

  const renamed = renamePrincipal(ctx, principal.id, "  Drew ");

  assert.equal(renamed.name, "Drew");
  assert.equal(getPrincipal(ctx, principal.id).name, "Drew");
});

test("an empty name is invalid", () => {
  const { ctx, principal } = testHarness();

  assert.throws(() => renamePrincipal(ctx, principal.id, ""), {
    code: "invalid",
  });
  assert.equal(getPrincipal(ctx, principal.id).name, principal.name);
});

test("a whitespace-only name is invalid", () => {
  const { ctx, principal } = testHarness();

  assert.throws(() => renamePrincipal(ctx, principal.id, "  \t "), {
    code: "invalid",
  });
  assert.equal(getPrincipal(ctx, principal.id).name, principal.name);
});

test("a name that is not a string is invalid, not a crash", () => {
  const { ctx, principal } = testHarness();

  assert.throws(
    () => renamePrincipal(ctx, principal.id, undefined as unknown as string),
    { code: "invalid" },
  );
});

test("renaming an unknown Principal is not found", () => {
  const { ctx } = testHarness();

  assert.throws(() => renamePrincipal(ctx, "no-such-id", "Drew"), {
    code: "not_found",
  });
});
