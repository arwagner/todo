import { test } from "node:test";
import assert from "node:assert/strict";
import { authenticate } from "../../src/auth/authenticate.ts";
import { listTokens, mintToken, revokeToken } from "../../src/auth/tokens.ts";
import { testHarness } from "../support/service.ts";

function bearing(credential: string) {
  return { headers: { authorization: `Bearer ${credential}` } };
}

test("a minted token authenticates as the Principal it was minted for", () => {
  const { ctx, principal } = testHarness();

  const { token } = mintToken(ctx, principal, "laptop");

  assert.deepEqual(authenticate(ctx, bearing(token)), principal);
});

test("a token announces what it is", () => {
  const { ctx, principal } = testHarness();

  const { token } = mintToken(ctx, principal, "laptop");

  assert.ok(token.startsWith("todo_pat_"));
});

test("the token itself is never stored, only a hash of it", () => {
  const { ctx, principal } = testHarness();
  const { token } = mintToken(ctx, principal, "laptop");

  const stored = ctx.db
    .prepare("select token_hash from tokens")
    .all()
    .map((row) => row["token_hash"] as string);

  assert.equal(stored.length, 1);
  assert.ok(!stored.includes(token));
  assert.match(stored[0] as string, /^[0-9a-f]{64}$/);
});

test("a revoked token authenticates as nobody, and is kept rather than deleted", () => {
  const { ctx, principal } = testHarness();
  const { token, id } = mintToken(ctx, principal, "laptop");

  revokeToken(ctx, principal, id);

  assert.equal(authenticate(ctx, bearing(token)), null);
  const [record] = listTokens(ctx, principal);
  assert.equal(record?.id, id);
  assert.notEqual(record?.revokedAt, null);
});

test("an unknown or malformed credential authenticates as nobody", () => {
  const { ctx, principal } = testHarness();
  const { token } = mintToken(ctx, principal, "laptop");

  assert.equal(authenticate(ctx, bearing("todo_pat_wrong")), null);
  assert.equal(authenticate(ctx, bearing("")), null);
  assert.equal(authenticate(ctx, { headers: {} }), null);
  assert.equal(authenticate(ctx, { headers: { authorization: token } }), null);
  assert.equal(
    authenticate(ctx, { headers: { authorization: `Basic ${token}` } }),
    null,
  );
});

test("one Principal's token never resolves to another", () => {
  const { ctx, principal, stranger } = testHarness();

  const mine = mintToken(ctx, principal, "laptop");
  mintToken(ctx, stranger, "their laptop");

  assert.deepEqual(authenticate(ctx, bearing(mine.token)), principal);
  assert.deepEqual(listTokens(ctx, stranger).length, 1);
});
