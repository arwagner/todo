import { createHash, randomBytes } from "node:crypto";
import { notFound } from "../service/errors.ts";
import type { Principal, ServiceContext } from "../service/context.ts";

/** Says what the credential is and where it came from, if one ever leaks. */
export const TOKEN_PREFIX = "todo_pat_";

export type TokenRecord = {
  id: string;
  principalId: string;
  name: string;
  createdAt: string;
  revokedAt: string | null;
};

export type MintedToken = {
  id: string;
  /** The only time the token is ever legible. Nothing can recover it later. */
  token: string;
};

/**
 * Mints a credential for a Principal. Called by the CLI on the box, so
 * creating one takes SSH access and there is no remote administrative
 * endpoint to secure incorrectly (ADR 6).
 */
export function mintToken(
  ctx: ServiceContext,
  principal: Principal,
  name: string,
): MintedToken {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const id = ctx.newId();

  ctx.db
    .prepare(
      `insert into tokens (id, principal_id, token_hash, name, created_at, revoked_at)
       values (?, ?, ?, ?, ?, null)`,
    )
    .run(id, principal.id, hashToken(token), name, ctx.now());

  return { id, token };
}

/** Revocation sets a timestamp. The row stays, so the history stays too. */
export function revokeToken(
  ctx: ServiceContext,
  principal: Principal,
  tokenId: string,
): void {
  const result = ctx.db
    .prepare(
      "update tokens set revoked_at = ? where id = ? and principal_id = ? and revoked_at is null",
    )
    .run(ctx.now(), tokenId, principal.id);
  if (result.changes === 0) throw notFound("token");
}

export function listTokens(
  ctx: ServiceContext,
  principal: Principal,
): TokenRecord[] {
  return ctx.db
    .prepare(
      `select id, principal_id, name, created_at, revoked_at from tokens
        where principal_id = ? order by created_at, id`,
    )
    .all(principal.id)
    .map((row) => ({
      id: row["id"] as string,
      principalId: row["principal_id"] as string,
      name: row["name"] as string,
      createdAt: row["created_at"] as string,
      revokedAt: (row["revoked_at"] as string | null) ?? null,
    }));
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
