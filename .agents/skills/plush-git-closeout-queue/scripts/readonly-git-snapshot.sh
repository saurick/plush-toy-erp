#!/usr/bin/env bash
set -euo pipefail

export GIT_OPTIONAL_LOCKS=0

repo_root="$(git rev-parse --show-toplevel)"
head_oid="$(git rev-parse HEAD)"
branch_name="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || printf 'DETACHED')"
lock_path="$(git rev-parse --git-path index.lock)"

if git diff --cached --quiet --; then
  index_state="empty"
else
  index_state="non_empty"
fi

if [[ -n "$(git status --porcelain=v1 --untracked-files=all)" ]]; then
  worktree_state="dirty"
else
  worktree_state="clean"
fi

printf 'snapshot_version=1\n'
printf 'repository_root=%s\n' "$repo_root"
printf 'head=%s\n' "$head_oid"
printf 'branch=%s\n' "$branch_name"
printf 'worktree=%s\n' "$worktree_state"
printf 'index=%s\n' "$index_state"
printf 'index_lock_path=%s\n' "$lock_path"

if [[ ! -e "$lock_path" ]]; then
  printf 'index_lock=absent\n'
  exit 0
fi

case "$(uname -s)" in
  Darwin)
    read -r lock_inode lock_size lock_mtime < <(
      /usr/bin/stat -f '%i %z %m' "$lock_path"
    )
    ;;
  FreeBSD)
    read -r lock_inode lock_size lock_mtime < <(stat -f '%i %z %m' "$lock_path")
    ;;
  *)
    read -r lock_inode lock_size lock_mtime < <(stat -c '%i %s %Y' "$lock_path")
    ;;
esac

lock_holders="unavailable"
if command -v lsof >/dev/null 2>&1; then
  lock_holders="$(lsof -t -- "$lock_path" 2>/dev/null | sort -u | paste -sd, - || true)"
  lock_holders="${lock_holders:-none}"
fi

printf 'index_lock=present\n'
printf 'index_lock_inode=%s\n' "$lock_inode"
printf 'index_lock_size=%s\n' "$lock_size"
printf 'index_lock_mtime_epoch=%s\n' "$lock_mtime"
printf 'index_lock_holders=%s\n' "$lock_holders"
