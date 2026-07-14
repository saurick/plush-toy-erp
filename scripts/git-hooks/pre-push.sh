#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

if [[ "${SKIP_PRE_PUSH:-0}" == "1" ]]; then
  echo "[pre-push] SKIP_PRE_PUSH=1，跳过本地辅助检查"
  exit 0
fi

if [[ -n "${QA_BASE_RANGE+x}" ]]; then
  echo "[pre-push] status=incomplete reason=inherited_range_forbidden variable=QA_BASE_RANGE"
  exit 2
fi

for required in scripts/qa/secrets.sh scripts/qa/full.sh; do
  if [[ ! -x "$ROOT_DIR/$required" ]]; then
    echo "[pre-push] 缺少可执行文件 $required"
    exit 1
  fi
done
if [[ ! -f "$ROOT_DIR/scripts/qa/gate-profiles.mjs" ]]; then
  echo "[pre-push] 缺少 scripts/qa/gate-profiles.mjs"
  exit 1
fi

remote_name="${1:-origin}"
zero_sha="0000000000000000000000000000000000000000"
head_sha="$(git rev-parse --verify 'HEAD^{commit}')"
empty_tree="$(git hash-object -t tree /dev/null)"
scanned_ranges=()
full_bases=()
full_requires_full_tree=0
validated_current_tree=0

while read -r local_ref local_sha remote_ref remote_sha; do
  [[ -n "${local_sha:-}" ]] || continue
  if [[ "$local_sha" == "$zero_sha" ]]; then
    continue
  fi

  if [[ "$local_sha" != "$head_sha" ]]; then
    echo "[pre-push] status=incomplete reason=non_head_ref local_ref=$local_ref local_sha=$local_sha head_sha=$head_sha"
    exit 2
  fi

  if [[ "$validated_current_tree" == "0" ]]; then
    worktree_status="$(git status --porcelain --untracked-files=all)"
    if [[ -n "$worktree_status" ]]; then
      echo "[pre-push] status=incomplete reason=dirty_worktree"
      printf '%s\n' "$worktree_status"
      exit 2
    fi
    echo "[pre-push] 校验当前 HEAD 的 full required 合同"
    node "$ROOT_DIR/scripts/qa/gate-profiles.mjs" \
      --profile full --source tree --ref "$head_sha"
    validated_current_tree=1
  fi

  if [[ "$remote_sha" != "$zero_sha" ]]; then
    range="${remote_sha}..${local_sha}"
    full_bases+=("$remote_sha")
  else
    # The destination reports no prior object boundary for this ref. A local
    # remote-tracking main may be stale or unrelated to what the server owns,
    # so scan every commit reachable from the new ref.
    range="$local_sha"
    full_requires_full_tree=1
  fi

  echo "[pre-push] 扫描将推送的 ref: ${local_ref} -> ${remote_ref}"
  git log --check --format= "$range"
  QA_BASE_RANGE="$range" SECRETS_STRICT=1 \
    bash "$ROOT_DIR/scripts/qa/secrets.sh"
  scanned_ranges+=("$range")
done

if [[ "${#scanned_ranges[@]}" -eq 0 ]]; then
  echo "[pre-push] 未从 $remote_name 的 stdin 取得 push range；full 将按默认 range 严格扫描 secrets"
  worktree_status="$(git status --porcelain --untracked-files=all)"
  if [[ -n "$worktree_status" ]]; then
    echo "[pre-push] status=incomplete reason=dirty_worktree"
    printf '%s\n' "$worktree_status"
    exit 2
  fi
  node "$ROOT_DIR/scripts/qa/gate-profiles.mjs" \
    --profile full --source tree --ref "$head_sha"
  bash "$ROOT_DIR/scripts/qa/full.sh"
  echo "[pre-push] status=complete coverage=full-default-range"
  exit 0
fi

if [[ "$full_requires_full_tree" == "1" ]]; then
  full_range="${empty_tree}..${head_sha}"
else
  full_base="$(git merge-base --octopus "${full_bases[@]}" "$head_sha")"
  if [[ -z "$full_base" ]]; then
    echo "[pre-push] status=incomplete reason=no_aggregate_merge_base"
    exit 2
  fi
  full_range="${full_base}..${head_sha}"
fi

# 每个实际 push ref 已先完成完整历史 secrets 扫描。普通 full 再按聚合 diff
# 真实执行 secrets、DB guard 和其余固定门禁；不存在可自签的跳过凭证。
QA_BASE_RANGE="$full_range" bash "$ROOT_DIR/scripts/qa/full.sh"
echo "[pre-push] status=complete coverage=prior-ref-secrets+full ranges=${#scanned_ranges[@]} aggregate_range=$full_range"
