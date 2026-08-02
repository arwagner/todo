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
    deploy/          systemd units and the deploy script
    test/            tests, grouped by seam

Both adapters call the same service functions. Neither one calls the other
(ADR 4).

## Run it

Create a Principal and mint a token. Both commands need shell access to the
machine, because there is no remote administrative endpoint (ADR 6).

    node src/cli/todo.ts principals add "Andrew"
    node src/cli/todo.ts tokens mint "Andrew" laptop

The token is printed once and never again. Storage keeps only a SHA-256 hash.

Start the HTTP API. It listens on `127.0.0.1:8787`; set `HOST` and `PORT` to
move it. Binding a public interface is something you ask for (ADR 8).

    npm run serve

    curl -H "Authorization: Bearer $TODO_TOKEN" \
         -H "Content-Type: application/json" \
         -d '{"title": "Renew passport"}' \
         http://localhost:8787/items

Run the MCP server over stdio. Set `TODO_TOKEN` to a minted token:

    TODO_TOKEN=todo_pat_... npm run mcp

The database file is `$TODO_DB`, or `~/.local/share/todo/todo.db`. Keep it
outside any deploy directory (ADR 5). Nothing backs it up for you.

## Deploy

One process on one VPS, run by systemd, with a reverse proxy in front of it
terminating TLS (ADR 8). Everything below runs on the box, as root.

The box needs Node 24 or later, the same as anywhere else. If its system node
is older, do not replace it — anything else on the box is using it. Install 24
somewhere of its own and point `TODO_NODE_DIR` at it:

    mkdir -p /opt/node24 && curl -fsSL \
      https://nodejs.org/dist/v24.11.1/node-v24.11.1-linux-x64.tar.xz \
      | tar -xJ -C /opt/node24 --strip-components=1

Once, to set the box up:

    adduser --system --group --home /opt/todo todo
    mkdir -p /opt/todo/releases /var/lib/todo /var/backups/todo /etc/todo
    chown todo:todo /var/lib/todo /var/backups/todo
    git clone <url> /opt/todo/repo

    install -m644 /opt/todo/repo/deploy/todo.service \
                  /opt/todo/repo/deploy/todo-backup.service \
                  /opt/todo/repo/deploy/todo-backup.timer /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable todo todo-backup.timer
    systemctl start todo-backup.timer

Settings live in `/etc/todo/todo.env`, which is not in the repository. If Node
24 is not the system node, that file is where you say so — `PATH` is what the
units resolve `node` through, and `TODO_NODE_DIR` is what the deploy script
uses:

    PATH=/opt/node24/bin:/usr/local/bin:/usr/bin:/bin
    TODO_NODE_DIR=/opt/node24/bin

The units default to `TODO_DB=/var/lib/todo/todo.db`, outside every directory
a deploy writes to, so no deploy can remove it (ADR 5).

`todo` is enabled but not started here: there is nothing to start until the
first deploy has put a release in place, and starting it early just spins.
The deploy starts it.

Then, for every release:

    /opt/todo/repo/deploy/deploy.sh main

That unpacks the revision to `/opt/todo/releases/<sha>`, takes a backup,
migrates, points `/opt/todo/current` at it, restarts, and waits for
`GET /health` to answer. If it never answers, the symlink goes back to the
previous release and the service is restarted on that. Rolling back by hand is
the same move:

    ln -sfn /opt/todo/releases/<sha> /opt/todo/current.new
    mv -Tf /opt/todo/current.new /opt/todo/current
    systemctl restart todo

Nothing here terminates TLS. Put a proxy in front of it — with Caddy that is
the whole configuration:

    todo.example.com {
        reverse_proxy 127.0.0.1:8787
    }

`GET /health` is the only route that does not need a token. It answers for the
process, not the data. Backups are a daily timer running `todo backup`, which
is `VACUUM INTO` and does not stop the service; a deploy takes one first. Both
are kept for 30 days, and nothing copies them off the box — that is still
yours to arrange.

Rolling back restores the code, not the schema (ADR 8). A release that
migrated and then failed leaves the migration applied, so either migrations
stay readable by the release before them, or you restore the backup the deploy
took on its way past.

## Develop

    npm test          run every test
    npm run typecheck run tsc

Tests live at five seams:

1. The service layer, against a real in-memory database. Most tests are here.
2. The pure domain functions, with no database.
3. `authenticate()`, the one place a credential becomes a Principal.
4. The two adapters, smoke only.
5. The deploy surface: how the process reads its configuration, and how the
   database is copied off it.

## What this does not do

Nothing runs on a timer. Reminder times are stored and Recurrence Rules are
stored, but nothing fires them. Asking what is due evaluates the rules at query
time, against a time you supply. Templates are instantiated by an explicit
call. This is a decision, not an unfinished feature. ADR 7 explains it.
