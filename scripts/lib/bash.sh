#!/usr/bin/env bash

project_bash_major() {
  local bash_path="$1"
  # The child Bash, not this shell, must expand BASH_VERSINFO.
  # shellcheck disable=SC2016
  "$bash_path" -c 'printf "%s" "${BASH_VERSINFO[0]:-0}"'
}

require_project_bash() {
  local label="${1:-toolchain}"
  local required_major=4
  local current_major="${BASH_VERSINFO[0]:-0}"
  local resolved_bash=""
  local resolved_major="0"

  if ! resolved_bash="$(command -v bash 2>/dev/null)" || [[ -z "$resolved_bash" ]]; then
    echo "[$label] 未找到 bash；请安装 Bash >= ${required_major} 并将其加入 PATH" >&2
    return 1
  fi
  resolved_major="$(project_bash_major "$resolved_bash" 2>/dev/null || printf '0')"

  if ((current_major < required_major || resolved_major < required_major)); then
    echo "[$label] Bash 版本不满足：当前解释器 ${BASH_VERSION:-unknown}，PATH bash=${resolved_bash} (major=${resolved_major})；请将 Bash >= ${required_major} 放在 PATH 前部后重试" >&2
    return 1
  fi

  echo "[$label] ok: Bash ${BASH_VERSION}，PATH bash=${resolved_bash} (major=${resolved_major})"
}
