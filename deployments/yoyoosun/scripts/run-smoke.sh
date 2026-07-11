#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash deployments/yoyoosun/scripts/run-smoke.sh \
    --endpoint https://erp.example.invalid \
    --backend-url http://127.0.0.1:8300 \
    --release-version 20260629T1200 \
    --environment customer-trial \
    --report output/yoyoosun-smoke.json \
    --customer-config-revision yoyoosun-customer-package-v7.runtime-manifest-v1 \
    --admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN

Input template only:
  bash deployments/yoyoosun/scripts/run-smoke.sh --print-input-template

说明:
  做轻量 health / route / customer_config effective session smoke；带管理员 token 时还会真实生成最小 PDF，不创建业务事实。
USAGE
}

print_input_template() {
  cat <<'JSON'
{
  "scope": "yoyoosun-run-smoke-input-template",
  "customer": "yoyoosun",
  "writesReport": false,
  "writesDatabase": false,
  "callsEndpoint": false,
  "callsBackend": false,
  "callsCustomerConfig": false,
  "readsAdminToken": false,
  "secretInputs": [
    "CUSTOMER_CONFIG_ADMIN_TOKEN or the environment variable named by --admin-token-env"
  ],
  "requiredInputs": [
    "public ERP endpoint without username/password",
    "release version",
    "environment",
    "smoke report path",
    "optional backend URL without username/password",
    "customer config revision when active revision readback is required",
    "admin token env name when customer config readback is required"
  ],
  "checks": [
    "web-healthz",
    "server-healthz when --backend-url is provided",
    "server-readyz when --backend-url is provided",
    "login-page",
    "mobile-role-route",
    "customer-config-effective-session when --customer-config-revision is provided",
    "template-pdf-render when --customer-config-revision and an admin token are provided"
  ],
  "commands": [
    "bash deployments/yoyoosun/scripts/run-smoke.sh --endpoint https://erp.example.invalid --backend-url https://api.example.invalid --release-version <release-version> --environment customer-trial --report deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>/smoke-test-report.json",
    "CUSTOMER_CONFIG_ADMIN_TOKEN='<admin-token>' bash deployments/yoyoosun/scripts/run-smoke.sh --endpoint https://erp.example.invalid --backend-url https://api.example.invalid --release-version <release-version> --environment customer-trial --report deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>/smoke-test-report.json --customer-config-revision yoyoosun-customer-package-v7.runtime-manifest-v1 --admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN"
  ],
  "requiredReadbackEvidence": [
    "check name=customer-config-effective-session",
    "target=jsonrpc:customer_config.get_effective_session",
    "expectedRevision matches the activated customer config revision",
    "tokenSourceEnv is recorded",
    "responseBodyStored=false",
    "template-pdf-render returns HTTP 200 with application/pdf, starts with %PDF, and records only contentType/sha256/sizeBytes with responseBodyStored=false",
    "report backendEndpointAlias matches the release executor report backendEndpointAlias"
  ],
  "boundary": "This template does not call endpoints, read admin tokens, call customer_config, write smoke-test-report.json, write database rows, import business data, or prove active revision readback. Real proof requires running the smoke command against the target backend with an admin token env and storing only the redacted customer-config-effective-session check."
}
JSON
}

endpoint=""
backend_url=""
environment=""
release_version=""
report=""
customer_config_revision=""
admin_token_env=""

while [[ $# -gt 0 ]]; do
  case "$1" in
  --endpoint)
    endpoint="${2:-}"
    shift 2
    ;;
  --backend-url)
    backend_url="${2:-}"
    shift 2
    ;;
  --environment)
    environment="${2:-}"
    shift 2
    ;;
  --release-version)
    release_version="${2:-}"
    shift 2
    ;;
  --report)
    report="${2:-}"
    shift 2
    ;;
  --customer-config-revision)
    customer_config_revision="${2:-}"
    shift 2
    ;;
  --admin-token-env)
    admin_token_env="${2:-}"
    shift 2
    ;;
  --print-input-template)
    print_input_template
    exit 0
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

if [[ -z "$endpoint" || -z "$release_version" || -z "$environment" || -z "$report" ]]; then
  print_help
  exit 1
fi

reject_url_credentials() {
  local label="$1"
  local value="$2"
  if [[ "$value" =~ ^[a-zA-Z][a-zA-Z0-9+.-]*://[^/?#[:space:]]+@ ]]; then
    echo "[run-smoke] $label must not contain username or password"
    exit 1
  fi
}

reject_url_credentials "--endpoint" "$endpoint"
if [[ -n "$backend_url" ]]; then
  reject_url_credentials "--backend-url" "$backend_url"
fi

mkdir -p "$(dirname "$report")"

checks=(
  "web-healthz:$endpoint/healthz"
)

if [[ -n "$backend_url" ]]; then
  checks+=(
    "server-healthz:$backend_url/healthz"
    "server-readyz:$backend_url/readyz"
  )
fi

checks+=(
  "login-page:$endpoint/admin-login"
  "mobile-role-route:$endpoint/m/warehouse/tasks"
)

passed=0
failed=0
items=()
pdf_body=""
trap 'if [[ -n "${pdf_body:-}" ]]; then rm -f "$pdf_body"; fi' EXIT

for check in "${checks[@]}"; do
  name="${check%%:*}"
  url="${check#*:}"
  status="fail"
  http_code="$(curl -k --connect-timeout 2 --max-time 10 --retry 3 --retry-delay 1 --retry-connrefused -sS -o /dev/null -w '%{http_code}' "$url" || true)"
  if [[ "$http_code" =~ ^(200|302|401|403)$ ]]; then
    status="pass"
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
  fi
  items+=("{\"name\":\"$name\",\"status\":\"$status\",\"target\":\"$url\",\"httpCode\":\"$http_code\"}")
done

if [[ -n "$customer_config_revision" ]]; then
  rpc_base_url="$endpoint"
  if [[ -n "$backend_url" ]]; then
    rpc_base_url="$backend_url"
  fi
  token=""
  if [[ -n "$admin_token_env" ]]; then
    token="${!admin_token_env:-}"
  else
    token="${CUSTOMER_CONFIG_ADMIN_TOKEN:-}"
    admin_token_env="CUSTOMER_CONFIG_ADMIN_TOKEN"
  fi

  status="fail"
  if [[ -n "$token" ]]; then
    payload='{"jsonrpc":"2.0","id":"customer-config-smoke","method":"get_effective_session","params":{"customer_key":"yoyoosun"}}'
    response="$(
      curl -k --connect-timeout 2 --max-time 10 --retry 3 --retry-delay 1 --retry-connrefused \
        -sS \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        -H "Authorization: Bearer $token" \
        -d "$payload" \
        "$rpc_base_url/rpc/customer_config" || true
    )"
    if SMOKE_RESPONSE="$response" node - "$customer_config_revision" <<'NODE'; then
const expectedRevision = process.argv[2];
try {
  const parsed = JSON.parse(process.env.SMOKE_RESPONSE || "");
  const session = parsed?.result?.data?.session;
  const fieldPolicies = session?.fieldPolicies;
  const surfaces = fieldPolicies && typeof fieldPolicies === "object" && !Array.isArray(fieldPolicies)
    ? Object.keys(fieldPolicies)
    : [];
  const ok =
    parsed?.result?.code === 0 &&
    session?.configRevision === expectedRevision &&
    session?.source === "active_customer_config_revision" &&
    Array.isArray(session?.pages) &&
    session.pages.length > 0 &&
    surfaces.includes("customers.default") &&
    surfaces.includes("suppliers.default") &&
    surfaces.includes("sales_orders.default");
  process.exit(ok ? 0 : 1);
} catch {
  process.exit(1);
}
NODE
      status="pass"
    fi
  fi
  if [[ "$status" == "pass" ]]; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
  fi
  checks+=("customer-config-effective-session")
  items+=("{\"name\":\"customer-config-effective-session\",\"status\":\"$status\",\"target\":\"jsonrpc:customer_config.get_effective_session\",\"expectedRevision\":\"$customer_config_revision\",\"tokenSourceEnv\":\"$admin_token_env\",\"responseBodyStored\":false}")

  pdf_status="fail"
  pdf_http_code=""
  pdf_content_type=""
  pdf_size_bytes=0
  pdf_sha256=""
  pdf_body="$(mktemp "${TMPDIR:-/tmp}/yoyoosun-pdf-smoke.XXXXXX")"
  if [[ -n "$token" ]]; then
    pdf_payload='{"title":"Release PDF Smoke","file_name":"release-pdf-smoke.pdf","template_key":"material-purchase-contract","customer_key":"yoyoosun","html":"<!doctype html><html><body><p>release-pdf-smoke</p></body></html>"}'
    pdf_curl_meta="$(
      curl -k --connect-timeout 2 --max-time 45 --retry 1 --retry-delay 1 --retry-connrefused \
        -sS \
        -o "$pdf_body" \
        -w '%{http_code}|%{content_type}' \
        -H "Content-Type: application/json" \
        -H "Accept: application/pdf" \
        -H "Authorization: Bearer $token" \
        -d "$pdf_payload" \
        "$rpc_base_url/templates/render-pdf" || true
    )"
    pdf_http_code="${pdf_curl_meta%%|*}"
    pdf_content_type="${pdf_curl_meta#*|}"
    pdf_content_type="$(printf '%s' "$pdf_content_type" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
    pdf_signature="$(LC_ALL=C dd if="$pdf_body" bs=4 count=1 2>/dev/null || true)"
    if [[ "$pdf_http_code" == "200" && "$pdf_content_type" == "application/pdf" && -s "$pdf_body" && "$pdf_signature" == "%PDF" ]]; then
      pdf_size_bytes="$(wc -c <"$pdf_body" | tr -d '[:space:]')"
      pdf_sha256="$(node - "$pdf_body" <<'NODE'
const fs = require("node:fs");
const crypto = require("node:crypto");
const file = process.argv[2];
process.stdout.write(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"));
NODE
)"
      pdf_status="pass"
    fi
  fi
  rm -f "$pdf_body"
  pdf_body=""
  if [[ "$pdf_status" == "pass" ]]; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
  fi
  checks+=("template-pdf-render")
  items+=("{\"name\":\"template-pdf-render\",\"status\":\"$pdf_status\",\"target\":\"/templates/render-pdf\",\"httpCode\":\"$pdf_http_code\",\"contentType\":\"$pdf_content_type\",\"sha256\":\"$pdf_sha256\",\"sizeBytes\":$pdf_size_bytes,\"tokenSourceEnv\":\"$admin_token_env\",\"responseBodyStored\":false}")
fi

{
  printf '{\n'
  printf '  "customerCode": "yoyoosun",\n'
  printf '  "environment": "%s",\n' "$environment"
  printf '  "releaseVersion": "%s",\n' "$release_version"
  printf '  "generatedAt": "%s",\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  printf '  "operatorRole": "deployment-operator",\n'
  printf '  "endpointAlias": "%s",\n' "$endpoint"
  if [[ -n "$backend_url" ]]; then
    printf '  "backendEndpointAlias": "%s",\n' "$backend_url"
  fi
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
