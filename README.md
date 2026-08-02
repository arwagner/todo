# Todo

A personal work-tracking system. It records things you intend to do, the shape
of how they repeat, and the history of what you actually did.

`CONTEXT.md` defines the language. `docs/adr/` records the decisions and why
they were made. Read those first. This file only says how to run the code.

## Requirements

Node 24 or later. The code uses the built-in `node:sqlite` module and runs
TypeScript directly, so there is no build step.

    npm install

## Layout

    src/domain/      pure logic: Status, Recurrence Rules, Streaks
    src/db/          schema, migrations, connection
    src/service/     the one implementation of every operation
    src/auth/        tokens and the single authenticate() function
    src/adapters/    HTTP and MCP, both thin, both over the service
    src/cli/         administration on the box
    test/            tests, grouped by seam

Both adapters call the same service functions. Neither one calls the other
(ADR 4).

## Run it

Create a Principal and mint a token. Both commands need shell access to the
machine, because there is no remote administrative endpoint (ADR 6).

    node src/cli/todo.ts principals add "Andrew"
    node src/cli/todo.ts tokens mint "Andrew" laptop

The token is printed once and never again. Storage keeps only a SHA-256 hash.

Start the HTTP API:

    npm run serve

    curl -H "Authorization: Bearer $TODO_TOKEN" \
         -H "Content-Type: application/json" \
         -d '{"title": "Renew passport"}' \
         http://localhost:8787/items

Run the MCP server over stdio. Set `TODO_TOKEN` to a minted token:

    TODO_TOKEN=todo_pat_... npm run mcp

The database file is `$TODO_DB`, or `~/.local/share/todo/todo.db`. Keep it
outside any deploy directory (ADR 5). Nothing backs it up for you.

## Develop

    npm test          run every test
    npm run typecheck run tsc

Tests live at four seams:

1. The service layer, against a real in-memory database. Most tests are here.
2. The pure domain functions, with no database.
3. `authenticate()`, the one place a credential becomes a Principal.
4. The two adapters, smoke only.

## What this does not do

Nothing runs on a timer. Reminder times are stored and Recurrence Rules are
stored, but nothing fires them. Asking what is due evaluates the rules at query
time, against a time you supply. Templates are instantiated by an explicit
call. This is a decision, not an unfinished feature. ADR 7 explains it.
