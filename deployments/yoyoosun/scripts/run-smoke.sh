#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash deployments/yoyoosun/scripts/run-smoke.sh --endpoint https://erp.example.invalid --report output/yoyoosun-smoke.json

说明:
  只做轻量 health / route smoke，不创建业务事实。
USAGE
}

endpoint=""
report=""

while [[ $# -gt 0 ]]; do
  case "$1" in
  --endpoint)
    endpoint="${2:-}"
    shift 2
    ;;
  --report)
    report="${2:-}"
    shift 2
    ;;
  -h | --help)
    print_help
    exit 0
    ;;
  *)
    echo "[run-smoke] 不支持的参数: $1"
    print_help
    exit 1
    ;;
  esac
done

if [[ -z "$endpoint" || -z "$report" ]]; then
  print_help
  exit 1
fi

mkdir -p "$(dirname "$report")"

checks=(
  "web-healthz:$endpoint/healthz"
  "login-page:$endpoint/admin-login"
  "mobile-warehouse-route:$endpoint/m/warehouse/tasks"
)

passed=0
failed=0
items=()

for check in "${checks[@]}"; do
  name="${check%%:*}"
  url="${check#*:}"
  status="fail"
  http_code="$(curl -k -sS -o /dev/null -w '%{http_code}' "$url" || true)"
  if [[ "$http_code" =~ ^(200|302|401|403)$ ]]; then
    status="pass"
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
  fi
  items+=("{\"name\":\"$name\",\"status\":\"$status\",\"httpCode\":\"$http_code\"}")
done

{
  printf '{\n'
  printf '  "customerCode": "yoyoosun",\n'
  printf '  "generatedAt": "%s",\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  printf '  "endpointAlias": "%s",\n' "$endpoint"
  printf '  "summary": {"total": %s, "passed": %s, "failed": %s},\n' "${#checks[@]}" "$passed" "$failed"
  printf '  "checks": [\n'
  for index in "${!items[@]}"; do
    suffix=","
    [[ "$index" == "$((${#items[@]} - 1))" ]] && suffix=""
    printf '    %s%s\n' "${items[$index]}" "$suffix"
  done
  printf '  ],\n'
  printf '  "redaction": {"containsSecrets": false, "containsRawCustomerRows": false}\n'
  printf '}\n'
} >"$report"

echo "[run-smoke] report: $report"
if [[ "$failed" -gt 0 ]]; then
  exit 1
fi
