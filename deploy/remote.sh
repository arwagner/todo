#!/usr/bin/env bash
#
# The half of a deploy that happens on the VPS. `deploy/deploy.sh` sends this
# file over ssh and runs it as root, so the box always runs the version in the
# repository rather than a copy that was left there by an earlier deploy:
#
#     bash remote.sh <revision>
#
# The revision is a full SHA that `deploy.sh` has already pushed to the bare
# repository this reads from. Resolving names is the local half's job, so that
# the revision deployed is the revision you were shown.
#
# The database lives outside every directory this script writes to, so nothing
# here can remove it (ADR 5).

# -E so that the error trap below fires inside functions too.
set -Eeuo pipefail

revision=${1:?remote.sh needs a revision}

# Read the same settings the units read, so that this script and the running
# service can never disagree about which database they mean. systemd's
# EnvironmentFile is KEY=value, which is close enough to source.
#
# That file sets the PATH the *units* run with, which is not the PATH this
# script needs: it runs as root and wants runuser and systemctl from /usr/sbin.
# So the script's own PATH is put back afterwards, and the file's PATH reaches
# the service the only way it should, through systemd.
env_file=${TODO_ENV_FILE:-/etc/todo/todo.env}
script_path="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
if [ -r "$env_file" ]; then
  # shellcheck disable=SC1090
  . "$env_file"
fi
PATH="$script_path"

# The bare repository the local half pushes to. A release is unpacked straight
# out of it, because a second clone on the box would be one more copy of the
# code that can sit at an older revision than the one you asked for.
git_dir=${TODO_GIT_DIR:-/srv/todo.git}
releases=${TODO_RELEASES:-/opt/todo/releases}
current=${TODO_CURRENT:-/opt/todo/current}
backups=${TODO_BACKUPS:-/var/backups/todo}
database=${TODO_DB:-/var/lib/todo/todo.db}
health=${TODO_HEALTH_URL:-http://127.0.0.1:${PORT:-8787}/health}
service=${TODO_SERVICE:-todo}
user=${TODO_USER:-todo}
keep=${TODO_KEEP_RELEASES:-5}
force=${TODO_FORCE:-}

# Where Node 24 lives. Not every box has it as the system node, and on a box
# running other Node services replacing the system one is not on. Set
# TODO_NODE_DIR in the env file and the units follow through PATH.
node_dir=${TODO_NODE_DIR:-/usr/bin}

say() { printf '==> %s\n' "$*"; }

# Report which step died rather than exiting mute, because half of these
# commands are quiet when they succeed and quiet when they fail.
on_error() {
  status=$?
  say "FAILED: $BASH_COMMAND (exit $status)"
  exit "$status"
}
trap on_error ERR

# TODO_DB is passed explicitly. Without it the CLI would fall back to the todo
# user's home directory, quietly create an empty database there, and back that
# up instead of the real one. PATH carries the Node that npm's shebang finds.
as_todo() {
  runuser -u "$user" -- env \
    PATH="$node_dir:/usr/local/bin:/usr/bin:/bin" \
    TODO_DB="$database" "$@"
}

release="$releases/$revision"
say "revision $revision"

# Redeploying the revision that is already serving restarts the service and
# changes nothing else. Every message such a run prints is true, which is what
# makes it easy to read a deploy that did nothing as a deploy that worked. Say
# so instead, and leave the service alone.
if [ -L "$current" ] && [ "$(readlink -f "$current")" = "$release" ] && [ -z "$force" ]; then
  say "$revision is already the live release, so there is nothing to do"
  say "pass --force to deploy it again"
  exit 0
fi

# Unpacking to a new directory and switching a symlink means the running
# release is never edited in place, and going back is a symlink away.
#
# Built under another name and moved into place only once the dependencies are
# in. A directory at $release therefore means a release that finished, and an
# interrupted deploy cannot leave one behind for the next run to reuse.
if [ -d "$release" ]; then
  say "release already built, reusing it"
else
  staging="$release.incomplete"
  rm -rf "$staging"
  mkdir -p "$staging"
  git --git-dir="$git_dir" archive "$revision" | tar -x -C "$staging"
  chown -R "$user:$user" "$staging"
  say "installing dependencies"
  # The cache goes inside the staging directory so that this does not depend
  # on the todo user's home being writable, then leaves with it.
  as_todo env npm_config_cache="$staging/.npm" \
    "$node_dir/npm" --prefix "$staging" ci --omit=dev
  rm -rf "$staging/.npm"
  mv "$staging" "$release"
fi

# Before the schema moves, not after. A backup taken now is the one you want.
# Named `todo-` so that the same timer that prunes the nightly backups prunes
# these too, rather than letting them pile up on the disk holding the database.
say "backing up"
as_todo "$node_dir/node" "$release/src/cli/todo.ts" backup "$backups/todo-pre-deploy-$(date -u +%Y-%m-%dT%H%M%SZ)-${revision:0:12}.db"

# Migrating before the restart means a bad migration fails here, with the old
# release still serving, rather than in a restart loop.
say "migrating"
as_todo "$node_dir/node" "$release/src/cli/todo.ts" migrate

# Only a symlink that resolves to a real directory is something to go back to.
# `readlink -f` succeeds on a path that does not exist and echoes it back, so
# taking it at its word on a first deploy points the symlink at itself and
# leaves nothing that can ever start.
previous=""
if [ -L "$current" ]; then
  candidate=$(readlink -f "$current" || true)
  if [ -n "$candidate" ] && [ -d "$candidate" ] && [ "$candidate" != "$release" ]; then
    previous="$candidate"
  fi
fi

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
  if [ -n "$previous" ]; then
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
# Matching the live release by name rather than by path, so that a symlink
# anywhere above it cannot make this fail to recognise it.
say "pruning old releases"
keeping=$(basename "$(readlink -f "$current")")
find "$releases" -mindepth 1 -maxdepth 1 -type d ! -name "$keeping" -printf '%T@ %p\n' |
  sort -rn | tail -n "+$((keep + 1))" | cut -d' ' -f2- |
  while read -r old; do
    say "removing $(basename "$old")"
    rm -rf "$old"
  done

say "deployed $revision"
