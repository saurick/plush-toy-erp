#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WARN_BYTES=$((24 * 1024))
BLOCK_BYTES=$((32 * 1024))

GIT_OPTIONAL_LOCKS=0 git -C "$ROOT_DIR" ls-files \
  --cached --others --exclude-standard -z -- ':(glob)**/AGENTS.md' |
  (
    failed=0
    while IFS= read -r -d '' relative; do
      file="$ROOT_DIR/$relative"
      [[ -f "$file" ]] || continue
      bytes="$(wc -c <"$file" | tr -d ' ')"
      if ((bytes >= BLOCK_BYTES)); then
        echo "[qa:agents-size] 阻断: $relative 为 ${bytes} bytes，已达到 32 KiB；请按 AGENTS 治理优先级精简后再继续"
        failed=1
      elif ((bytes >= WARN_BYTES)); then
        echo "[qa:agents-size] 预警: $relative 为 ${bytes} bytes，已达到 24 KiB；请按 AGENTS 治理优先级审查重复规则和专项细节"
      else
        echo "[qa:agents-size] 通过: $relative 为 ${bytes} bytes"
      fi
    done
    exit "$failed"
  )
