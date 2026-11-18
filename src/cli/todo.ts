#!/usr/bin/env node
import { backupDatabase } from "../db/backup.ts";
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

/** A command, given the words that follow its name. */
type Command = (args: readonly string[]) => void;

/**
 * Every command, by the words that name it. A group's second word is its
 * action, so a group maps to its actions rather than to a command.
 */
const COMMANDS: Readonly<
  Record<string, Command | Readonly<Record<string, Command>>>
> = {
  principals: {
    add([name]) {
      if (name === undefined) fail("usage: todo principals add <name>");
      const principal = createPrincipal(context(), name);
      process.stdout.write(`${principal.id}  ${principal.name}\n`);
    },
    list() {
      for (const principal of listPrincipals(context())) {
        process.stdout.write(`${principal.id}  ${principal.name}\n`);
      }
    },
  },

  tokens: {
    mint([reference, name]) {
      if (reference === undefined || name === undefined) {
        fail("usage: todo tokens mint <principal> <name>");
      }
      const ctx = context();
      const { token } = mintToken(ctx, resolvePrincipal(ctx, reference), name);
      process.stdout.write(`${token}\n`);
      process.stderr.write("This is the only time the token is shown.\n");
    },
    list([reference]) {
      if (reference === undefined) fail("usage: todo tokens list <principal>");
      const ctx = context();
      for (const token of listTokens(ctx, resolvePrincipal(ctx, reference))) {
        const state = token.revokedAt === null ? "active" : "revoked";
        process.stdout.write(`${token.id}  ${state}  ${token.name}\n`);
      }
    },
    revoke([reference, id]) {
      if (reference === undefined || id === undefined) {
        fail("usage: todo tokens revoke <principal> <id>");
      }
      const ctx = context();
      revokeToken(ctx, resolvePrincipal(ctx, reference), id);
      process.stdout.write(`revoked ${id}\n`);
    },
  },

  migrate() {
    // Opening is what migrates. A deploy runs this before it restarts the
    // service, so a bad migration fails here rather than in a restart loop.
    context();
    process.stdout.write(`${databasePath()} is at the current schema\n`);
  },

  backup([destination]) {
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
  },
};

/** The entry named `word`, ignoring names every object inherits. */
function lookUp<T>(
  table: Readonly<Record<string, T>>,
  word: string | undefined,
): T | undefined {
  return word !== undefined && Object.hasOwn(table, word)
    ? table[word]
    : undefined;
}

function main(argv: readonly string[]): void {
  const [group, ...afterGroup] = argv;
  if (group === undefined || group === "help" || group === "--help") {
    process.stdout.write(USAGE);
    return;
  }

  const entry = lookUp(COMMANDS, group);
  if (typeof entry === "function") return entry(afterGroup);

  // A known group with a bad or missing action is named with what followed it,
  // so `todo tokens bogus` says "tokens bogus" rather than just "tokens".
  let typed = group;
  if (entry !== undefined) {
    const [action, ...rest] = afterGroup;
    const command = lookUp(entry, action);
    if (command !== undefined) return command(rest);
    if (action !== undefined) typed = `${group} ${action}`;
  }
  fail(`unknown command "${typed}"\n\n${USAGE}`);
}

main(process.argv.slice(2));
