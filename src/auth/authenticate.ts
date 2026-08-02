import { hashToken } from "./tokens.ts";
import type { Principal, ServiceContext } from "../service/context.ts";

/** Anything carrying request headers: a node:http request, or a stand-in. */
export type CredentialCarrier = {
  headers: Partial<Record<string, string | string[] | undefined>>;
};

/**
 * Turns a credential into the Principal it belongs to, or nobody.
 *
 * This is the whole of authentication. Nothing downstream knows that tokens
 * exist. When auth moves out to a shared service, someone rewrites this
 * function and nothing else changes. This system verifies a credential. It
 * never issues identity (ADR 6).
 */
export function authenticate(
  ctx: ServiceContext,
  request: CredentialCarrier,
): Principal | null {
  const token = bearerToken(request);
  if (token === null) return null;

  const row = ctx.db
    .prepare(
      `select principals.id, principals.name from tokens
         join principals on principals.id = tokens.principal_id
        where tokens.token_hash = ? and tokens.revoked_at is null`,
    )
    .get(hashToken(token));
  if (row === undefined) return null;

  return { id: row["id"] as string, name: row["name"] as string };
}

function bearerToken(request: CredentialCarrier): string | null {
  const header = request.headers["authorization"];
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== "string") return null;

  const match = /^Bearer (.+)$/.exec(value.trim());
  return match?.[1] ?? null;
}
