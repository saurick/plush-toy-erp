#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/qa/govulncheck.sh [包参数...]

作用:
  对 server 执行 govulncheck（默认 ./...）。

环境变量:
  SKIP_GOVULNCHECK=1   跳过检查
  GOVULNCHECK_STRICT=1 非 0 退出码时阻断（默认仅提示）
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
if ! command -v govulncheck >/dev/null 2>&1; then
  echo "[qa:govulncheck] 未安装 govulncheck"
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
    govulncheck "${targets[@]}" 2>&1
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
  # transient vulnerability database fetch failure. Retry that class once;
  # every other result and an exhausted retry remain fail-closed in strict.
  if [[ "$status" -ne 1 || "$attempt" -ge "$max_attempts" ]]; then
    break
  fi

  next_attempt=$((attempt + 1))
  echo "[qa:govulncheck] status=retry reason=scanner_or_database_failure attempt=$attempt next=$next_attempt max=$max_attempts"
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
else
  echo "[qa:govulncheck] status=failed reason=unexpected_exit exit_code=$status retry=forbidden"
fi

if [[ "$strict" == "1" ]]; then
  echo "[qa:govulncheck] 检测失败（GOVULNCHECK_STRICT=1，阻断）"
  exit 1
fi

echo "[qa:govulncheck] 检测到问题（默认仅提示，不阻断）"
exit 0
