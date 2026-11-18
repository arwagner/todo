#!/usr/bin/env node
import { backupDatabase } from "../db/backup.ts";
import { databasePath } from "../db/location.ts";
import { openDatabase } from "../db/open.ts";
import { listTokens, mintToken, revokeToken } from "../auth/tokens.ts";
import { productionContext } from "../service/context.ts";
import { ServiceError } from "../service/errors.ts";
import {
  createPrincipal,
  listPrincipals,
  renamePrincipal,
} from "../service/principals.ts";
import type { Principal, ServiceContext } from "../service/context.ts";

const USAGE = `todo - administration for the todo service

  todo principals add <name>          create a Principal
  todo principals list                list Principals
  todo principals rename <principal> <new name>
                                      rename a Principal
  todo tokens mint <principal> <name> mint a token, printed once
  todo tokens list <principal>        list a Principal's tokens
  todo tokens revoke <principal> <id> revoke a token
  todo backup <path>                  copy the database to <path>
  todo migrate                        apply any unapplied migrations

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

/**
 * Opened per command rather than once up front, because opening migrates and
 * not every command should. Backing up must copy the schema it finds (ADR 8).
 */
function context(options: { migrate?: boolean } = {}): ServiceContext {
  return productionContext(openDatabase(databasePath(), options));
}

function main(argv: readonly string[]): void {
  const [group, action, ...rest] = argv;
  if (group === undefined || group === "help" || group === "--help") {
    process.stdout.write(USAGE);
    return;
  }

  if (group === "principals" && action === "add") {
    const name = rest[0];
    if (name === undefined) fail("usage: todo principals add <name>");
    const principal = createPrincipal(context(), name);
    process.stdout.write(`${principal.id}  ${principal.name}\n`);
    return;
  }

  if (group === "principals" && action === "list") {
    for (const principal of listPrincipals(context())) {
      process.stdout.write(`${principal.id}  ${principal.name}\n`);
    }
    return;
  }

  if (group === "principals" && action === "rename") {
    const [reference, name] = rest;
    if (reference === undefined || name === undefined) {
      fail("usage: todo principals rename <principal> <new name>");
    }
    const ctx = context();
    const { id } = resolvePrincipal(ctx, reference);
    // The rules on names live in the service. A clash or an empty name is the
    // operator's mistake, so it is one line on stderr, not a stack trace.
    try {
      const principal = renamePrincipal(ctx, id, name);
      process.stdout.write(`${principal.id}  ${principal.name}\n`);
    } catch (error) {
      if (error instanceof ServiceError) fail(error.message);
      throw error;
    }
    return;
  }

  if (group === "tokens" && action === "mint") {
    const [reference, name] = rest;
    if (reference === undefined || name === undefined) {
      fail("usage: todo tokens mint <principal> <name>");
    }
    const ctx = context();
    const { token } = mintToken(ctx, resolvePrincipal(ctx, reference), name);
    process.stdout.write(`${token}\n`);
    process.stderr.write("This is the only time the token is shown.\n");
    return;
  }

  if (group === "tokens" && action === "list") {
    const reference = rest[0];
    if (reference === undefined) fail("usage: todo tokens list <principal>");
    const ctx = context();
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
    const ctx = context();
    revokeToken(ctx, resolvePrincipal(ctx, reference), id);
    process.stdout.write(`revoked ${id}\n`);
    return;
  }

  if (group === "migrate") {
    // Opening is what migrates. A deploy runs this before it restarts the
    // service, so a bad migration fails here rather than in a restart loop.
    context();
    process.stdout.write(`${databasePath()} is at the current schema\n`);
    return;
  }

  if (group === "backup") {
    const destination = action;
    if (destination === undefined) fail("usage: todo backup <path>");
    // Copies the schema it finds rather than moving it, so that the timer this
    // runs on can never migrate the database (ADR 7, ADR 8). The same timer
    // reads only stderr, so a failure has to be one readable line.
    try {
      backupDatabase(context({ migrate: false }).db, destination);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
    process.stdout.write(`${destination}\n`);
    return;
  }

  fail(USAGE);
}

main(process.argv.slice(2));
