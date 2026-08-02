#!/usr/bin/env node
import { databasePath } from "../db/location.ts";
import { openDatabase } from "../db/open.ts";
import { listTokens, mintToken, revokeToken } from "../auth/tokens.ts";
import { productionContext } from "../service/context.ts";
import { createPrincipal, listPrincipals } from "../service/principals.ts";
import type { Principal, ServiceContext } from "../service/context.ts";

const USAGE = `todo - administration for the todo service

  todo principals add <name>          create a Principal
  todo principals list                list Principals
  todo tokens mint <principal> <name> mint a token, printed once
  todo tokens list <principal>        list a Principal's tokens
  todo tokens revoke <principal> <id> revoke a token

<principal> is an id or an exact name.
The database is $TODO_DB, or ~/.local/share/todo/todo.db.
`;

function resolvePrincipal(ctx: ServiceContext, reference: string): Principal {
  const candidates = listPrincipals(ctx).filter(
    (principal) => principal.id === reference || principal.name === reference,
  );
  if (candidates.length === 0) fail(`no Principal matching "${reference}"`);
  if (candidates.length > 1) fail(`"${reference}" matches several Principals`);
  return candidates[0] as Principal;
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function main(argv: readonly string[]): void {
  const [group, action, ...rest] = argv;
  if (group === undefined || group === "help" || group === "--help") {
    process.stdout.write(USAGE);
    return;
  }

  const ctx = productionContext(openDatabase(databasePath()));

  if (group === "principals" && action === "add") {
    const name = rest[0];
    if (name === undefined) fail("usage: todo principals add <name>");
    const principal = createPrincipal(ctx, name);
    process.stdout.write(`${principal.id}  ${principal.name}\n`);
    return;
  }

  if (group === "principals" && action === "list") {
    for (const principal of listPrincipals(ctx)) {
      process.stdout.write(`${principal.id}  ${principal.name}\n`);
    }
    return;
  }

  if (group === "tokens" && action === "mint") {
    const [reference, name] = rest;
    if (reference === undefined || name === undefined) {
      fail("usage: todo tokens mint <principal> <name>");
    }
    const { token } = mintToken(ctx, resolvePrincipal(ctx, reference), name);
    process.stdout.write(`${token}\n`);
    process.stderr.write("This is the only time the token is shown.\n");
    return;
  }

  if (group === "tokens" && action === "list") {
    const reference = rest[0];
    if (reference === undefined) fail("usage: todo tokens list <principal>");
    for (const token of listTokens(ctx, resolvePrincipal(ctx, reference))) {
      const state = token.revokedAt === null ? "active" : "revoked";
      process.stdout.write(`${token.id}  ${state}  ${token.name}\n`);
    }
    return;
  }

  if (group === "tokens" && action === "revoke") {
    const [reference, id] = rest;
    if (reference === undefined || id === undefined) {
      fail("usage: todo tokens revoke <principal> <id>");
    }
    revokeToken(ctx, resolvePrincipal(ctx, reference), id);
    process.stdout.write(`revoked ${id}\n`);
    return;
  }

  fail(USAGE);
}

main(process.argv.slice(2));
