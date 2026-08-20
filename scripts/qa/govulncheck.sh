#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/qa/govulncheck.sh [包参数...]

作用:
  对 server 执行 govulncheck（默认 ./...）。

环境变量:
  SKIP_GOVULNCHECK=1              跳过检查
  GOVULNCHECK_STRICT=1            非 0 退出码时阻断（默认仅提示）
  GOVULNCHECK_TIMEOUT_SECONDS=900 单次扫描上限（1-3600 秒）
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  print_help
  exit 0
fi

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

if [[ "${SKIP_GOVULNCHECK:-0}" == "1" ]]; then
  echo "[qa:govulncheck] SKIP_GOVULNCHECK=1，跳过"
  exit 0
fi

strict="${GOVULNCHECK_STRICT:-0}"
timeout_seconds="${GOVULNCHECK_TIMEOUT_SECONDS:-900}"
if [[ ! "$timeout_seconds" =~ ^[0-9]+$ ]] ||
  ((timeout_seconds < 1 || timeout_seconds > 3600)); then
  echo "[qa:govulncheck] GOVULNCHECK_TIMEOUT_SECONDS 必须是 1-3600 的整数" >&2
  exit 2
fi

if ! command -v govulncheck >/dev/null 2>&1; then
  echo "[qa:govulncheck] 未安装 govulncheck"
  if [[ "$strict" == "1" ]]; then
    echo "[qa:govulncheck] GOVULNCHECK_STRICT=1，阻断"
    exit 1
  fi
  echo "[qa:govulncheck] 跳过"
  exit 0
fi

timeout_command=""
if command -v timeout >/dev/null 2>&1; then
  timeout_command="$(command -v timeout)"
elif command -v gtimeout >/dev/null 2>&1; then
  timeout_command="$(command -v gtimeout)"
fi
if [[ -z "$timeout_command" ]]; then
  echo "[qa:govulncheck] 未安装 GNU timeout（macOS 可安装 coreutils）"
  if [[ "$strict" == "1" ]]; then
    echo "[qa:govulncheck] GOVULNCHECK_STRICT=1，阻断"
    exit 1
  fi
  echo "[qa:govulncheck] 跳过"
  exit 0
fi

if [[ ! -d "$ROOT_DIR/server" ]]; then
  echo "[qa:govulncheck] 未找到 server 目录，跳过"
  exit 0
fi

if [[ $# -gt 0 ]]; then
  targets=("$@")
else
  targets=(./...)
fi

set +e
attempt=1
max_attempts=2
while true; do
  output="$(
    cd "$ROOT_DIR/server"
    # The pinned x/telemetry sidecar treats value 2 as an inherited child and
    # makes telemetry.Start a no-op. This avoids mutating the user's global Go
    # telemetry mode; timeout remains the fail-closed boundary if that changes.
    "$timeout_command" \
      --signal=TERM \
      --kill-after=5s \
      "${timeout_seconds}s" \
      env GO_TELEMETRY_CHILD=2 govulncheck "${targets[@]}" 2>&1
  )"
  status=$?
  set -e

  if [[ -n "$output" ]]; then
    printf "%s\n" "$output"
  fi

  if [[ "$status" -eq 0 ]]; then
    echo "[qa:govulncheck] 通过"
    exit 0
  fi

  # govulncheck reserves exit 3 for detected vulnerabilities and exit 2 for
  # invalid usage. Exit 1 is a scanner/runtime failure, which includes a
  # transient vulnerability database fetch failure. GNU timeout returns 124
  # when the scanner or its runtime does not terminate. Retry only those two
  # classes once; every other result remains fail-closed in strict.
  if [[ "$status" -eq 124 ]]; then
    retry_reason="timeout"
  elif [[ "$status" -eq 1 ]]; then
    retry_reason="scanner_or_database_failure"
  else
    retry_reason=""
  fi
  if [[ -z "$retry_reason" || "$attempt" -ge "$max_attempts" ]]; then
    break
  fi

  next_attempt=$((attempt + 1))
  echo "[qa:govulncheck] status=retry reason=$retry_reason attempt=$attempt next=$next_attempt max=$max_attempts timeout_seconds=$timeout_seconds"
  sleep 2
  attempt="$next_attempt"
  set +e
done

if [[ "$status" -eq 3 ]]; then
  echo "[qa:govulncheck] status=failed reason=vulnerabilities_found retry=forbidden"
elif [[ "$status" -eq 2 ]]; then
  echo "[qa:govulncheck] status=failed reason=invalid_usage retry=forbidden"
elif [[ "$status" -eq 1 ]]; then
  echo "[qa:govulncheck] status=failed reason=scanner_or_database_failure attempts=$attempt"
elif [[ "$status" -eq 124 ]]; then
  echo "[qa:govulncheck] status=failed reason=timeout attempts=$attempt timeout_seconds=$timeout_seconds"
else
  echo "[qa:govulncheck] status=failed reason=unexpected_exit exit_code=$status retry=forbidden"
fi

if [[ "$strict" == "1" ]]; then
  echo "[qa:govulncheck] 检测失败（GOVULNCHECK_STRICT=1，阻断）"
  exit 1
fi

echo "[qa:govulncheck] 检测到问题（默认仅提示，不阻断）"
exit 0
