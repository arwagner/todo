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
    deploy/          systemd units, and the two halves of the deploy script
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
terminating TLS (ADR 8). The deploy itself runs here, from this working copy,
and pushes the code out to the box.

The box needs Node 24 or later, the same as anywhere else. If its system node
is older, do not replace it — anything else on the box is using it. Install 24
somewhere of its own and point `TODO_NODE_DIR` at it:

    mkdir -p /opt/node24 && curl -fsSL \
      https://nodejs.org/dist/v24.11.1/node-v24.11.1-linux-x64.tar.xz \
      | tar -xJ -C /opt/node24 --strip-components=1

Once, to set the box up. These commands run on the box, as root. The bare
repository is what a deploy pushes to, and a release is unpacked out of it:

    adduser --system --group --home /opt/todo todo
    mkdir -p /opt/todo/releases /var/lib/todo /var/backups/todo /etc/todo
    chown todo:todo /var/lib/todo /var/backups/todo
    git init --bare /srv/todo.git

Then put the systemd units on the box and enable them. These commands run here:

    scp deploy/todo.service deploy/todo-backup.service deploy/todo-backup.timer \
        root@<host>:/etc/systemd/system/
    ssh root@<host> 'systemctl daemon-reload &&
                     systemctl enable todo todo-backup.timer &&
                     systemctl start todo-backup.timer'

Settings live in `/etc/todo/todo.env`, which is not in the repository. If Node
24 is not the system node, that file is where you say so. `PATH` is what the
units resolve `node` through, and `TODO_NODE_DIR` is what the box side of the
deploy uses:

    PATH=/opt/node24/bin:/usr/local/bin:/usr/bin:/bin
    TODO_NODE_DIR=/opt/node24/bin

Say where this working copy deploys to in `deploy/target.env`, which is not in
the repository either. Where a thing is deployed is not part of what it is:

    TODO_DEPLOY_HOST=root@todo.example.com

The units default to `TODO_DB=/var/lib/todo/todo.db`, outside every directory
a deploy writes to, so no deploy can remove it (ADR 5).

`todo` is enabled but not started here: there is nothing to start until the
first deploy has put a release in place, and starting it early just spins.
The deploy starts it.

Then, for every release, from here:

    deploy/deploy.sh

That pushes the revision to `/srv/todo.git` on the box, then sends
`deploy/remote.sh` over ssh and runs it there as root. The box side unpacks the
revision to `/opt/todo/releases/<sha>`, takes a backup, migrates, points
`/opt/todo/current` at it, restarts, and waits for `GET /health` to answer. If
it never answers, the symlink goes back to the previous release and the service
is restarted on that.

`remote.sh` goes over the wire on every run, so the box never runs an older
copy of it than the one here. Nothing on the box pulls, which is what stops a
deploy from shipping a revision other than the one you are looking at.

The deploy ships the working tree as it stands, committed or not. A tree that
differs from `HEAD` is written into a commit of its own, parented on `HEAD`,
and that commit is what ships. Your branch, your index, and your working tree
do not move. `.gitignore` decides what stays behind, which is what keeps
`deploy/target.env`, the databases, and `node_modules` out of a release.

The same tree on the same parent always produces the same revision. Deploying
twice with nothing changed in between reuses the release instead of building a
second copy of it.

A revision that is already live stops the deploy, because deploying it again
would only restart the service. Pass `--force` to mean it.

To deploy a commit rather than the working tree, name it:

    deploy/deploy.sh v1.2.0

A deploy from a working tree is a real commit in `/srv/todo.git`, so `git show`
on the box says exactly what shipped and how it differed from `HEAD`. That
commit may be on no branch anywhere, which is the price of deploying work you
have not committed.

Rolling back by hand runs on the box:

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

The time you supply is a horizon, not a moment. The agenda returns everything
due at or before it, so `GET /due` and the `agenda` tool both take `through`.
Work due at 23:59 is not on the agenda you ask for at 16:40. To see the rest of
today, pass the end of your own day. Nothing here holds a timezone for you, so
where your day ends is yours to say.

## Reviews

Put the `agent:review` label on a pull request to have the aint-farm factory review it. It may push fixes to the branch, and leaves what it does not fix as comments.
