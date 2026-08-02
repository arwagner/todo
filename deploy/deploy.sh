#!/usr/bin/env bash
#
# Deploys a revision to this box and, if it does not come up, puts back the one
# that was running. Run it as root on the VPS:
#
#     /opt/todo/repo/deploy/deploy.sh [ref]
#
# The database lives outside every directory this script writes to, so nothing
# here can remove it (ADR 5).

set -euo pipefail

ref=${1:-main}

# Read the same settings the units read, so that this script and the running
# service can never disagree about which database they mean. systemd's
# EnvironmentFile is KEY=value, which is close enough to source.
env_file=${TODO_ENV_FILE:-/etc/todo/todo.env}
if [ -r "$env_file" ]; then
  # shellcheck disable=SC1090
  . "$env_file"
fi

repo=${TODO_REPO:-/opt/todo/repo}
releases=${TODO_RELEASES:-/opt/todo/releases}
current=${TODO_CURRENT:-/opt/todo/current}
backups=${TODO_BACKUPS:-/var/backups/todo}
database=${TODO_DB:-/var/lib/todo/todo.db}
health=${TODO_HEALTH_URL:-http://127.0.0.1:${PORT:-8787}/health}
service=${TODO_SERVICE:-todo}
user=${TODO_USER:-todo}
keep=${TODO_KEEP_RELEASES:-5}

say() { printf '==> %s\n' "$*"; }

# TODO_DB is passed explicitly. Without it the CLI would fall back to the todo
# user's home directory, quietly create an empty database there, and back that
# up instead of the real one.
as_todo() { runuser -u "$user" -- env TODO_DB="$database" "$@"; }

say "fetching $ref"
git -C "$repo" fetch --quiet --prune origin
revision=$(git -C "$repo" rev-parse --verify --quiet "origin/$ref" || git -C "$repo" rev-parse --verify "$ref")
release="$releases/$revision"
say "revision $revision"

# Unpacking to a new directory and switching a symlink means the running
# release is never edited in place, and going back is a symlink away.
if [ -d "$release" ]; then
  say "release already unpacked, reusing it"
else
  mkdir -p "$release"
  git -C "$repo" archive "$revision" | tar -x -C "$release"
  chown -R "$user:$user" "$release"
  say "installing dependencies"
  as_todo npm --prefix "$release" ci --omit=dev --silent
fi

# Before the schema moves, not after. A backup taken now is the one you want.
# Named `todo-` so that the same timer that prunes the nightly backups prunes
# these too, rather than letting them pile up on the disk holding the database.
say "backing up"
as_todo /usr/bin/node "$release/src/cli/todo.ts" backup "$backups/todo-pre-deploy-$(date -u +%Y-%m-%dT%H%M%SZ)-${revision:0:12}.db"

# Migrating before the restart means a bad migration fails here, with the old
# release still serving, rather than in a restart loop.
say "migrating"
as_todo /usr/bin/node "$release/src/cli/todo.ts" migrate

previous=$(readlink -f "$current" 2>/dev/null || true)
say "pointing $current at $revision"
ln -sfn "$release" "$current.new"
mv -Tf "$current.new" "$current"

restart_and_check() {
  systemctl restart "$service"
  for _ in $(seq 30); do
    if curl --fail --silent --show-error --max-time 2 "$health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

say "restarting $service"
if ! restart_and_check; then
  if [ -n "$previous" ] && [ -d "$previous" ] && [ "$previous" != "$release" ]; then
    say "did not come up: going back to $(basename "$previous")"
    ln -sfn "$previous" "$current.new"
    mv -Tf "$current.new" "$current"
    restart_and_check || say "the previous release did not come up either"
  else
    say "did not come up, and there is nothing to go back to"
  fi
  systemctl status "$service" --no-pager --lines=20 || true
  exit 1
fi

# Keep $keep to roll back to, on top of the live one, and drop the rest.
# Matching the live release by name
# rather than by path, so that a symlink anywhere above it cannot make this
# fail to recognise it.
say "pruning old releases"
keeping=$(basename "$(readlink -f "$current")")
find "$releases" -mindepth 1 -maxdepth 1 -type d ! -name "$keeping" -printf '%T@ %p\n' |
  sort -rn | tail -n "+$((keep + 1))" | cut -d' ' -f2- |
  while read -r old; do
    say "removing $(basename "$old")"
    rm -rf "$old"
  done

say "deployed $revision"
