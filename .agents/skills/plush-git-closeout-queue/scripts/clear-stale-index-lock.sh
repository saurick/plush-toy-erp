#!/usr/bin/env bash
set -euo pipefail

export GIT_OPTIONAL_LOCKS=0

usage() {
  printf '%s\n' \
    'usage: clear-stale-index-lock.sh --repo <repository-root> --queue-confirmed-no-git-owner' >&2
  exit 64
}

refuse() {
  printf 'WAIT_INDEX_LOCK_REVIEW reason=%s\n' "$1" >&2
  exit "${2:-65}"
}

repo_argument=""
queue_confirmed="false"
while (($# > 0)); do
  case "$1" in
    --repo)
      (($# >= 2)) || usage
      repo_argument="$2"
      shift 2
      ;;
    --queue-confirmed-no-git-owner)
      queue_confirmed="true"
      shift
      ;;
    *)
      usage
      ;;
  esac
done

[[ -n "$repo_argument" && "$queue_confirmed" == "true" ]] || usage
repo_root="$(cd "$repo_argument" && pwd -P)"
cd "$repo_root"
[[ "$(git rev-parse --show-toplevel)" == "$repo_root" ]] ||
  refuse "repository_root_mismatch"

lock_path="$(git rev-parse --git-path index.lock)"
if [[ "$lock_path" != /* ]]; then
  lock_path="$repo_root/$lock_path"
fi
lock_directory="$(cd "$(dirname "$lock_path")" && pwd -P)"
lock_path="$lock_directory/$(basename "$lock_path")"

if [[ ! -e "$lock_path" ]]; then
  printf 'LOCK_CLEAR_NOTICE result=already_absent lock_path=%s\n' "$lock_path"
  exit 0
fi
[[ -f "$lock_path" && ! -L "$lock_path" ]] || refuse "lock_not_regular_file"

stat_identity() {
  if /usr/bin/stat -f '%i %z %m' "$1" >/dev/null 2>&1; then
    /usr/bin/stat -f '%i %z %m' "$1"
  elif stat -c '%i %s %Y' "$1" >/dev/null 2>&1; then
    stat -c '%i %s %Y' "$1"
  else
    refuse "stat_capability_unavailable" 69
  fi
}

if command -v shasum >/dev/null 2>&1; then
  hash_stream() {
    shasum -a 256 | awk '{print $1}'
  }
elif command -v sha256sum >/dev/null 2>&1; then
  hash_stream() {
    sha256sum | awk '{print $1}'
  }
else
  refuse "sha256_capability_unavailable" 69
fi

holder_state() {
  if command -v lsof >/dev/null 2>&1; then
    if lsof -t -- "$lock_path" >/dev/null 2>&1; then
      printf 'present\n'
    else
      printf 'none\n'
    fi
  elif command -v fuser >/dev/null 2>&1; then
    if fuser "$lock_path" >/dev/null 2>&1; then
      printf 'present\n'
    else
      printf 'none\n'
    fi
  else
    printf 'unavailable\n'
  fi
}

sample_repository() {
  sample_head="$(git rev-parse HEAD)"
  sample_index_sha256="$(git diff --cached --binary --no-ext-diff -- | hash_stream)"
  sample_status_sha256="$(git status --porcelain=v1 -z --untracked-files=all | hash_stream)"
}

read -r first_inode first_size first_mtime < <(stat_identity "$lock_path")
[[ "$first_size" == "0" ]] || refuse "lock_not_zero_bytes"
[[ "$(holder_state)" == "none" ]] || refuse "lock_holder_present_or_unavailable"
sample_repository
first_head="$sample_head"
first_index_sha256="$sample_index_sha256"
first_status_sha256="$sample_status_sha256"

sleep 1

[[ -f "$lock_path" && ! -L "$lock_path" ]] || refuse "lock_identity_changed"
read -r second_inode second_size second_mtime < <(stat_identity "$lock_path")
[[ "$second_inode $second_size $second_mtime" == "$first_inode $first_size $first_mtime" ]] ||
  refuse "lock_identity_changed"
[[ "$(holder_state)" == "none" ]] || refuse "lock_holder_present_or_unavailable"
sample_repository
[[ "$sample_head" == "$first_head" ]] || refuse "head_changed"
[[ "$sample_index_sha256" == "$first_index_sha256" ]] || refuse "index_changed"
[[ "$sample_status_sha256" == "$first_status_sha256" ]] || refuse "status_changed"

if [[ -x /bin/rm ]]; then
  /bin/rm -- "$lock_path"
else
  rm -- "$lock_path"
fi
[[ ! -e "$lock_path" ]] || refuse "lock_clear_failed" 73

sample_repository
[[ "$sample_head" == "$first_head" ]] || refuse "postclear_head_changed"
[[ "$sample_index_sha256" == "$first_index_sha256" ]] ||
  refuse "postclear_index_changed"
[[ "$sample_status_sha256" == "$first_status_sha256" ]] ||
  refuse "postclear_status_changed"

printf 'LOCK_CLEAR_NOTICE result=cleared lock_path=%s inode=%s head=%s index_sha256=%s status_sha256=%s\n' \
  "$lock_path" \
  "$first_inode" \
  "$first_head" \
  "$first_index_sha256" \
  "$first_status_sha256"
