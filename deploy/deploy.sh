#!/usr/bin/env bash
#
# Deploys the code in this working copy to the VPS. Run it here, not there:
#
#     deploy/deploy.sh [ref] [--force]
#
# It pushes the revision to the box, then runs deploy/remote.sh over ssh to
# unpack it, back up, migrate, move the symlink, restart, and check that the
# service answers. If it does not answer, the box puts back the release that
# was running.
#
# The box used to pull from a repository of its own, which meant a deploy could
# read a revision older than the one in front of you and report success. The
# push happens here now, so the code that ships is the code you are looking at.

# -E so that the error trap below fires inside functions too.
set -Eeuo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

say() { printf '==> %s\n' "$*"; }
die() { printf 'deploy: %s\n' "$*" >&2; exit 1; }

on_error() {
  status=$?
  say "FAILED: $BASH_COMMAND (exit $status)"
  exit "$status"
}
trap on_error ERR

ref=""
force=""
for arg in "$@"; do
  case "$arg" in
    --force) force=1 ;;
    -*) die "unknown option $arg" ;;
    *)
      [ -z "$ref" ] || die "give at most one ref"
      ref=$arg
      ;;
  esac
done

# Which box, and as whom. This is a setting rather than a constant in the
# repository, for the same reason /etc/todo/todo.env is not in the repository:
# where a thing is deployed is not part of what it is.
env_file=${TODO_DEPLOY_ENV:-$script_dir/target.env}
if [ -r "$env_file" ]; then
  # shellcheck disable=SC1090
  . "$env_file"
fi
host=${TODO_DEPLOY_HOST:-}
[ -n "$host" ] || die "set TODO_DEPLOY_HOST, in the environment or in $env_file"

# The bare repository on the box. The push writes here and remote.sh unpacks
# from here, so both halves have to mean the same path.
git_dir=${TODO_GIT_DIR:-/srv/todo.git}

root=$(cd -- "$script_dir/.." && pwd)

# What ships. Naming a ref deploys that commit. Otherwise the deploy ships the
# working tree as it stands on disk, committed or not.
#
# A release is still named by a git revision, because that name is what makes
# an identical deploy reuse the release already built, and what a rollback
# points back at. So a tree that differs from HEAD is written into a commit of
# its own: the tree as it is, with HEAD as its parent. Your branch, your index,
# and your working tree do not move. That commit exists to be deployed, and to
# be read afterwards when you want to know what a box is actually running.
if [ -n "$ref" ]; then
  revision=$(git -C "$root" rev-parse --verify "$ref^{commit}") ||
    die "cannot resolve $ref to a commit"
else
  head=$(git -C "$root" rev-parse --verify HEAD)
  if [ -z "$(git -C "$root" status --porcelain)" ]; then
    revision=$head
  else
    say "the working tree differs from HEAD, and ships as it stands:"
    git -C "$root" status --short
    # An index of its own, so that staging the tree leaves yours alone.
    index=$(mktemp "${TMPDIR:-/tmp}/todo-deploy-index.XXXXXXXX")
    rm -f "$index"
    trap 'rm -f "$index"' EXIT
    # `add -A` against an empty index takes every file the working tree holds
    # and .gitignore does not exclude. That is what keeps deploy/target.env,
    # the databases, and node_modules out of the release.
    GIT_INDEX_FILE=$index git -C "$root" add -A
    tree=$(GIT_INDEX_FILE=$index git -C "$root" write-tree)
    # Dated from HEAD rather than from now, so the same tree on the same parent
    # is always the same revision. Two deploys with nothing changed in between
    # then reuse the release instead of building a second copy of it.
    stamp=$(git -C "$root" log -1 --format=%cI "$head")
    revision=$(GIT_AUTHOR_DATE=$stamp GIT_COMMITTER_DATE=$stamp \
      git -C "$root" commit-tree "$tree" -p "$head" \
        -m "working tree, deployed on top of $head")
  fi
fi

describe=$(git -C "$root" log -1 --format='%h %s' "$revision")

say "deploying $describe"
say "to $host"

# Pushing the revision itself rather than a branch name, so that the object on
# the box is the one resolved above and not whatever a branch moved to since.
# `main` on the box means the last revision deployed, and nothing reads it but
# a person looking for that.
#
# Forced, because deploys do not form a line. Two deploys from a working tree
# both sit on HEAD rather than on each other, and deploying an older ref on
# purpose is an ordinary thing to do. The release directory is named by
# revision, so what a box runs never depended on this ref.
say "pushing to $git_dir"
git push --force --quiet "$host:$git_dir" "$revision:refs/heads/main"

# remote.sh goes over the wire on every deploy, so the box cannot run a stale
# copy of it. It is written to a file rather than piped into `bash -s`, because
# a script read from standard input loses the rest of itself to the first
# command inside it that reads standard input.
say "sending remote.sh"
remote_script=$(ssh "$host" 'tmp=$(mktemp /tmp/todo-deploy.XXXXXXXX) && cat >"$tmp" && printf %s "$tmp"' \
  <"$script_dir/remote.sh")
[ -n "$remote_script" ] || die "could not put remote.sh on $host"

# Removed on the way out whether or not the deploy worked, and the deploy's own
# exit status is what this script exits with.
ssh "$host" "TODO_FORCE='${force}' bash '$remote_script' '$revision'; status=\$?; rm -f '$remote_script'; exit \$status"
