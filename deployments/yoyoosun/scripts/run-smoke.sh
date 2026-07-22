#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash deployments/yoyoosun/scripts/run-smoke.sh \
    --endpoint https://erp.example.invalid \
    --backend-url http://127.0.0.1:8300 \
    --release-version <40-character-lowercase-git-sha> \
    --environment customer-trial \
    --report output/yoyoosun-smoke.json \
    --admin-username admin \
    --admin-password-env MANUAL_ACCEPTANCE_ADMIN_PASSWORD \
    --demo-password-env MANUAL_ACCEPTANCE_PASSWORD \
    --sms-phone-env MANUAL_ACCEPTANCE_SMS_PHONE \
    --customer-config-revision yoyoosun-customer-package-v7.runtime-manifest-v1 \
    --admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN

Input template only:
  bash deployments/yoyoosun/scripts/run-smoke.sh --print-input-template

说明:
  做轻量 health / route / auth capabilities / credential login matrix / customer_config effective session smoke；
  带管理员 token 时还会真实生成最小 PDF，不创建业务事实。测试密码读取凭据合同；
  短信手机号只有人工录入对应环境变量时才校验。报告不保存密码、token、手机号或原始 profile。
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
    "CUSTOMER_CONFIG_ADMIN_TOKEN or the environment variable named by --admin-token-env",
    "fixed admin and demo test passwords from credential.contract.json",
    "optional SMS phone from the environment variable named by --sms-phone-env"
  ],
  "requiredInputs": [
    "public ERP endpoint without username/password",
    "release version",
    "environment",
    "smoke report path",
    "optional backend URL without username/password",
    "credential contract admin username and password environment variable names when backend URL is provided",
    "customer config revision when active revision readback is required",
    "admin token env name when customer config readback is required"
  ],
  "checks": [
    "web-healthz",
    "server-healthz when --backend-url is provided",
    "server-readyz when --backend-url is provided",
    "login-page",
    "mobile-role-route",
    "credential-login-matrix (admin + 10 demo identities and 11 unique tokens; exact admin phone binding only when configured)",
    "auth-sms-capabilities (provider/enabled/not-mock)",
    "customer-config-effective-session when --customer-config-revision is provided",
    "template-pdf-render when --customer-config-revision and an admin token are provided"
  ],
  "commands": [
    "bash deployments/yoyoosun/scripts/run-smoke.sh --endpoint https://erp.example.invalid --backend-url https://api.example.invalid --release-version <release-version> --environment customer-trial --report deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>/smoke-test-report.json --admin-username admin --admin-password-env MANUAL_ACCEPTANCE_ADMIN_PASSWORD --demo-password-env MANUAL_ACCEPTANCE_PASSWORD --sms-phone-env MANUAL_ACCEPTANCE_SMS_PHONE",
    "CUSTOMER_CONFIG_ADMIN_TOKEN='<admin-token>' bash deployments/yoyoosun/scripts/run-smoke.sh --endpoint https://erp.example.invalid --backend-url https://api.example.invalid --release-version <release-version> --environment customer-trial --report deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>/smoke-test-report.json --admin-username admin --admin-password-env MANUAL_ACCEPTANCE_ADMIN_PASSWORD --demo-password-env MANUAL_ACCEPTANCE_PASSWORD --sms-phone-env MANUAL_ACCEPTANCE_SMS_PHONE --customer-config-revision yoyoosun-customer-package-v7.runtime-manifest-v1 --admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN"
  ],
  "requiredReadbackEvidence": [
    "check name=auth-sms-capabilities, target=jsonrpc:auth.capabilities, expectedMode=provider, enabled=true, mockDelivery=false, responseBodyStored=false",
    "check name=credential-login-matrix, target=jsonrpc:auth.admin_login, totalAuthenticated=11, uniqueTokensObserved=true, phoneConfigured=false or phoneBound=true, responseBodyStored=false",
    "check name=customer-config-effective-session",
    "target=jsonrpc:customer_config.get_effective_session",
    "expectedRevision matches the activated customer config revision",
    "tokenSourceEnv is recorded",
    "responseBodyStored=false",
    "template-pdf-render returns HTTP 200 with application/pdf, starts with %PDF, and records only contentType/sha256/sizeBytes with responseBodyStored=false",
    "report backendEndpointAlias matches the release executor report backendEndpointAlias"
  ],
  "boundary": "This template does not call endpoints, read credentials, call customer_config, write smoke-test-report.json, write database rows, import business data, or prove active revision readback. Real proof requires running the smoke command against the target backend with credential env names and an admin token env; the report stores only aggregate login evidence, usernames, source env keys, and redacted customer-config evidence."
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
admin_username=""
admin_password_env=""
demo_password_env=""
sms_phone_env=""

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
  --admin-username)
    admin_username="${2:-}"
    shift 2
    ;;
  --admin-password-env)
    admin_password_env="${2:-}"
    shift 2
    ;;
  --demo-password-env)
    demo_password_env="${2:-}"
    shift 2
    ;;
  --sms-phone-env)
    sms_phone_env="${2:-}"
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

validate_http_url() {
  local label="$1"
  local value="$2"
  node -e '
try {
  const label = process.argv[1];
  const raw = process.argv[2];
  if (!raw || /[\u0000-\u0020\u007f"\\]/u.test(raw)) throw new Error();
  const parsed = new URL(raw);
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password || parsed.hash || !parsed.hostname) throw new Error();
} catch { console.error(`[run-smoke] ${process.argv[1]} must be an absolute credential-free HTTP(S) URL`); process.exit(1); }
' -- "$label" "$value"
}

reject_url_credentials "--endpoint" "$endpoint"
validate_http_url "--endpoint" "$endpoint"
[[ "$release_version" =~ ^[a-f0-9]{40}$ ]] || {
  echo "[run-smoke] --release-version must be a 40-character lowercase git sha"
  exit 1
}
[[ "$environment" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]] || {
  echo "[run-smoke] --environment is invalid"
  exit 1
}
[[ -z "$customer_config_revision" || "$customer_config_revision" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$ ]] || {
  echo "[run-smoke] --customer-config-revision is invalid"
  exit 1
}
[[ -z "$admin_token_env" || "$admin_token_env" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
  echo "[run-smoke] --admin-token-env is invalid"
  exit 1
}
if [[ -n "$backend_url" ]]; then
  reject_url_credentials "--backend-url" "$backend_url"
  validate_http_url "--backend-url" "$backend_url"
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
  credential_contract="$script_dir/../env/credential.contract.json"
  [[ -f "$credential_contract" ]] || {
    echo "[run-smoke] credential contract is missing: $credential_contract"
    exit 1
  }
  IFS=$'\t' read -r contract_admin_username contract_admin_password contract_admin_password_env contract_demo_password contract_demo_password_env contract_demo_usernames_csv credential_contract_schema contract_sms_phone_env contract_target contract_database contract_dataset contract_sha256 < <(
    node - "$credential_contract" <<'NODE'
const fs = require("node:fs");
const file = process.argv[2];
const contract = JSON.parse(fs.readFileSync(file, "utf8"));
const admin = contract?.credentials?.admin;
const demo = contract?.credentials?.demo;
const sms = contract?.smsLoginIdentity;
const envKey = /^[A-Za-z_][A-Za-z0-9_]*$/;
const username = /^[A-Za-z0-9_]+$/;
const valid =
  contract?.schemaVersion === "yoyoosun-credential-contract/v2" &&
  contract?.customerCode === "yoyoosun" &&
  contract?.target?.key === "customer-trial-133" &&
  contract?.target?.database === "plush_erp_uat_20260716_v5" &&
  contract?.target?.datasetVersion === "2026.07.16-v5" &&
  username.test(admin?.username || "") &&
  envKey.test(admin?.environmentVariable || "") &&
  envKey.test(demo?.environmentVariable || "") &&
  Array.isArray(demo?.usernames) &&
  demo.usernames.length === 10 &&
  new Set(demo.usernames).size === 10 &&
  demo.usernames.every((value) => username.test(value)) &&
  !demo.usernames.includes(admin.username) &&
  admin?.credentialSource === "contract-fixed-test" &&
  admin?.fixedTestPassword === "adminadmin" &&
  demo?.credentialSource === "contract-fixed-test" &&
  demo?.fixedTestPassword === "12345678" &&
  sms?.username === admin.username &&
  envKey.test(sms?.environmentVariable || "") &&
  sms?.phoneRequiredWhenProviderEnabled === false &&
  sms?.verifyPhoneIdentityWhenConfigured === true &&
  sms?.keychain?.service === "plush-toy-erp-yoyoosun-sms-phone" &&
  sms?.keychain?.account === "customer-trial-133:admin" &&
  contract?.policy?.passwordsMustDiffer === true &&
  JSON.stringify(contract?.policy?.registeredSimplePasswordTargets) === JSON.stringify(["local-dev", "customer-trial-133"]) &&
  contract.policy.rotateAfterCreateRestoreOrRollback === true &&
  contract.policy.revokeExistingSessionsOnRotation === true &&
  contract.policy.requireCredentialLoginMatrixBeforeCutover === true &&
  contract?.redaction?.containsSecrets === false &&
  contract.redaction.storePasswords === false &&
  contract.redaction.storeTokens === false &&
  contract.redaction.storePhoneNumber === false &&
  contract.redaction.storeRawProfiles === false;
if (!valid) throw new Error("invalid yoyoosun credential contract");
const crypto = require("node:crypto");
process.stdout.write([
  admin.username,
  admin.fixedTestPassword,
  admin.environmentVariable,
  demo.fixedTestPassword,
  demo.environmentVariable,
  demo.usernames.join(","),
  contract.schemaVersion,
  sms.environmentVariable,
  contract.target.key,
  contract.target.database,
  contract.target.datasetVersion,
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
].join("\t") + "\n");
NODE
  )
  [[ "$admin_username" == "$contract_admin_username" ]] || {
    echo "[run-smoke] --admin-username must match credential contract"
    exit 1
  }
  [[ "$admin_password_env" == "$contract_admin_password_env" ]] || {
    echo "[run-smoke] --admin-password-env must match credential contract"
    exit 1
  }
  [[ "$demo_password_env" == "$contract_demo_password_env" ]] || {
    echo "[run-smoke] --demo-password-env must match credential contract"
    exit 1
  }
  [[ "$sms_phone_env" == "$contract_sms_phone_env" ]] || {
    echo "[run-smoke] --sms-phone-env must match credential contract"
    exit 1
  }
  IFS=',' read -r -a demo_usernames <<<"$contract_demo_usernames_csv"
  sms_phone="${!sms_phone_env:-}"
  admin_password="$contract_admin_password"
  demo_password="$contract_demo_password"
  unset "$admin_password_env" "$demo_password_env" "$sms_phone_env"
  [[ -z "$sms_phone" || "$sms_phone" =~ ^[0-9]{11}$ ]] || {
    echo "[run-smoke] SMS phone env must be empty or contain one normalized 11-digit phone"
    exit 1
  }
  [[ "$admin_password" != "$demo_password" ]] || {
    echo "[run-smoke] admin and demo passwords must differ"
    exit 1
  }
fi

token=""
if [[ -n "$customer_config_revision" ]]; then
  if [[ -z "$admin_token_env" ]]; then
    admin_token_env="CUSTOMER_CONFIG_ADMIN_TOKEN"
  fi
  token="${!admin_token_env:-}"
  unset "$admin_token_env"
  [[ -n "$token" ]] || {
    echo "[run-smoke] admin token env is empty: $admin_token_env"
    exit 1
  }
  [[ "$token" =~ ^[A-Za-z0-9._~+/=-]+$ ]] || {
    echo "[run-smoke] admin token contains unsupported characters"
    exit 1
  }
fi

[[ "$report" != *$'\n'* && "$report" != *$'\r'* ]] || {
  echo "[run-smoke] --report is invalid"
  exit 1
}
umask 077
smoke_tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/yoyoosun-smoke.XXXXXX")"
chmod 700 "$smoke_tmp_dir"
cleanup() {
  rm -rf -- "$smoke_tmp_dir"
}
trap cleanup EXIT
auth_curl_config="$smoke_tmp_dir/auth.curl.config"
sms_phone_file="$smoke_tmp_dir/sms-phone.txt"
if [[ -n "$backend_url" ]]; then
  printf '%s' "$sms_phone" >"$sms_phone_file"
  chmod 600 "$sms_phone_file"
fi
if [[ -n "$token" ]]; then
  printf 'header = "Authorization: Bearer %s"\n' "$token" >"$auth_curl_config"
  chmod 600 "$auth_curl_config"
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
pdf_body="$smoke_tmp_dir/pdf-response.bin"

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

if [[ -n "$backend_url" ]]; then
  credential_expected=$((${#demo_usernames[@]} + 1))
  credential_authenticated=0
  credential_admin_authenticated=false
  credential_admin_phone_bound=false
  credential_phone_configured=false
  [[ -n "$sms_phone" ]] && credential_phone_configured=true
  credential_demo_authenticated=0
  credential_unique_tokens=false
  declare -A credential_token_digests=()

  credential_login() {
    local username="$1"
    local password="$2"
    local require_super_admin="$3"
    local request_file response_file token_result token_digest token_phone_bound token_auth_version
    request_file="$smoke_tmp_dir/login-request.json"
    response_file="$smoke_tmp_dir/login-response.json"
    : >"$request_file"
    : >"$response_file"
    chmod 600 "$request_file" "$response_file"
    printf '%s\0%s' "$username" "$password" | node -e '
const fs = require("node:fs");
const parts = fs.readFileSync(0).toString("utf8").split("\0");
if (parts.length !== 2 || !parts[0] || !parts[1]) process.exit(1);
fs.writeFileSync(process.argv[1], JSON.stringify({
  jsonrpc: "2.0", id: "credential-login-smoke", method: "admin_login",
  params: { username: parts[0], password: parts[1] },
}));
' "$request_file"
    curl -k --connect-timeout 2 --max-time 10 --retry 1 --retry-delay 1 --retry-connrefused \
      -sS -H "Content-Type: application/json" -H "Accept: application/json" \
      --data-binary "@$request_file" -o "$response_file" "$backend_url/rpc/auth" || true
    : >"$request_file"
    token_result="$(node -e '
const crypto = require("node:crypto");
try {
  const fs = require("node:fs");
  const parsed = JSON.parse(fs.readFileSync(0, "utf8"));
  const data = parsed?.result?.data;
  const token = String(data?.access_token || "").trim();
  const expected = process.argv[1];
  const requireSuperAdmin = process.argv[2] === "true";
  const expectedPhone = fs.readFileSync(process.argv[3], "utf8");
  const valid = parsed?.jsonrpc === "2.0" &&
    parsed?.id === "credential-login-smoke" &&
    parsed?.result?.code === 0 &&
    data?.username === expected &&
    token.length > 0 &&
    (!requireSuperAdmin || (
      data?.is_super_admin === true && (expectedPhone === "" || String(data?.phone || "") === expectedPhone)
    ));
  if (!valid) process.exit(1);
  process.stdout.write([
    crypto.createHash("sha256").update(token).digest("hex"),
    requireSuperAdmin && expectedPhone !== "" && String(data?.phone || "") === expectedPhone ? "true" : "false",
    Number.isSafeInteger(data?.auth_version) && data.auth_version > 0 ? String(data.auth_version) : "",
  ].join("\t"));
} catch {
  process.exit(1);
}
' "$username" "$require_super_admin" "$sms_phone_file" <"$response_file" || true)"
    : >"$response_file"
    IFS=$'\t' read -r token_digest token_phone_bound token_auth_version <<<"$token_result"
    unset token_result
    [[ "$token_digest" =~ ^[a-f0-9]{64}$ ]] || return 1
    [[ -z "${credential_token_digests[$token_digest]+x}" ]] || return 1
    credential_token_digests["$token_digest"]=1
    credential_last_phone_bound="$token_phone_bound"
    credential_last_auth_version="$token_auth_version"
    credential_authenticated=$((credential_authenticated + 1))
    return 0
  }

  if credential_login "$admin_username" "$admin_password" true; then
    credential_admin_authenticated=true
    credential_admin_phone_bound="$credential_last_phone_bound"
    credential_admin_auth_version="$credential_last_auth_version"
  fi
  for demo_username in "${demo_usernames[@]}"; do
    if credential_login "$demo_username" "$demo_password" false; then
      credential_demo_authenticated=$((credential_demo_authenticated + 1))
    fi
  done
  unset admin_password demo_password sms_phone
  if [[ "$credential_authenticated" -eq "$credential_expected" && "${#credential_token_digests[@]}" -eq "$credential_expected" ]]; then
    credential_unique_tokens=true
  fi
  credential_status=fail
  credential_phone_requirement_satisfied=true
  if [[ "$credential_phone_configured" == true && "$credential_admin_phone_bound" != true ]]; then
    credential_phone_requirement_satisfied=false
  fi
  if [[ "$credential_admin_authenticated" == true && "$credential_phone_requirement_satisfied" == true && "$credential_demo_authenticated" -eq "${#demo_usernames[@]}" && "$credential_unique_tokens" == true ]]; then
    credential_status=pass
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
  fi
  credential_usernames_json="$(node -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' "$admin_username" "${demo_usernames[@]}")"
  checks+=("credential-login-matrix")
  admin_auth_version_json=null
  [[ "${credential_admin_auth_version:-}" =~ ^[1-9][0-9]*$ ]] && admin_auth_version_json="$credential_admin_auth_version"
  items+=("{\"name\":\"credential-login-matrix\",\"status\":\"$credential_status\",\"target\":\"jsonrpc:auth.admin_login\",\"credentialContractSchema\":\"$credential_contract_schema\",\"credentialContractSha256\":\"$contract_sha256\",\"credentialTarget\":\"$contract_target\",\"credentialDatabase\":\"$contract_database\",\"credentialDatasetVersion\":\"$contract_dataset\",\"adminUsername\":\"$admin_username\",\"adminAuthenticated\":$credential_admin_authenticated,\"adminSuperAdmin\":$credential_admin_authenticated,\"phoneConfigured\":$credential_phone_configured,\"phoneBound\":$credential_admin_phone_bound,\"adminAuthVersion\":$admin_auth_version_json,\"demoExpected\":${#demo_usernames[@]},\"demoAuthenticated\":$credential_demo_authenticated,\"totalExpected\":$credential_expected,\"totalAuthenticated\":$credential_authenticated,\"uniqueTokensObserved\":$credential_unique_tokens,\"usernames\":$credential_usernames_json,\"adminPasswordSource\":\"credential-contract\",\"demoPasswordSource\":\"credential-contract\",\"smsPhoneSourceEnv\":\"$sms_phone_env\",\"responseBodyStored\":false}")
fi

auth_rpc_base_url="$endpoint"
if [[ -n "$backend_url" ]]; then
  auth_rpc_base_url="$backend_url"
fi
auth_payload='{"jsonrpc":"2.0","id":"auth-capabilities-smoke","method":"capabilities","params":{}}'
auth_response="$(
  curl -k --connect-timeout 2 --max-time 10 --retry 3 --retry-delay 1 --retry-connrefused \
    -sS \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d "$auth_payload" \
    "$auth_rpc_base_url/rpc/auth" || true
)"
auth_status="fail"
if SMOKE_RESPONSE="$auth_response" node <<'NODE'; then
try {
  const parsed = JSON.parse(process.env.SMOKE_RESPONSE || "");
  const sms = parsed?.result?.data?.sms_login;
  const ok = parsed?.jsonrpc === "2.0" &&
    parsed?.id === "auth-capabilities-smoke" &&
    parsed?.result?.code === 0 &&
    sms?.enabled === true &&
    sms?.mode === "provider" &&
    sms?.mock_delivery === false;
  process.exit(ok ? 0 : 1);
} catch {
  process.exit(1);
}
NODE
  auth_status="pass"
fi
if [[ "$auth_status" == "pass" ]]; then
  passed=$((passed + 1))
else
  failed=$((failed + 1))
fi
checks+=("auth-sms-capabilities")
items+=("{\"name\":\"auth-sms-capabilities\",\"status\":\"$auth_status\",\"target\":\"jsonrpc:auth.capabilities\",\"expectedMode\":\"provider\",\"enabled\":$([[ \"$auth_status\" == \"pass\" ]] && printf true || printf false),\"mode\":\"$([[ \"$auth_status\" == \"pass\" ]] && printf provider || printf unknown)\",\"mockDelivery\":false,\"responseBodyStored\":false}")
unset auth_response

if [[ -n "$customer_config_revision" ]]; then
  rpc_base_url="$endpoint"
  if [[ -n "$backend_url" ]]; then
    rpc_base_url="$backend_url"
  fi
  status="fail"
  if [[ -n "$token" ]]; then
    payload='{"jsonrpc":"2.0","id":"customer-config-smoke","method":"get_effective_session","params":{"customer_key":"yoyoosun"}}'
    customer_response_file="$smoke_tmp_dir/customer-config-response.json"
    : >"$customer_response_file"
    chmod 600 "$customer_response_file"
    curl --config "$auth_curl_config" -k --connect-timeout 2 --max-time 10 --retry 3 --retry-delay 1 --retry-connrefused \
      -sS -H "Content-Type: application/json" -H "Accept: application/json" \
      -d "$payload" -o "$customer_response_file" "$rpc_base_url/rpc/customer_config" || true
    if node -e '
const fs = require("node:fs");
const expectedRevision = process.argv[1];
try {
  const parsed = JSON.parse(fs.readFileSync(0, "utf8"));
  const session = parsed?.result?.data?.session;
  const fieldPolicies = session?.fieldPolicies;
  const surfaces = fieldPolicies && typeof fieldPolicies === "object" && !Array.isArray(fieldPolicies)
    ? Object.keys(fieldPolicies)
    : [];
  const ok =
    parsed?.jsonrpc === "2.0" && parsed?.id === "customer-config-smoke" && parsed?.result?.code === 0 &&
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
' "$customer_config_revision" <"$customer_response_file"; then
      status="pass"
    fi
    : >"$customer_response_file"
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
  : >"$pdf_body"
  chmod 600 "$pdf_body"
  if [[ -n "$token" ]]; then
    pdf_payload='{"title":"Release PDF Smoke","file_name":"release-pdf-smoke.pdf","template_key":"material-purchase-contract","html":"<!doctype html><html><body><p>release-pdf-smoke</p></body></html>"}'
    pdf_curl_meta="$(
      curl --config "$auth_curl_config" -k --connect-timeout 2 --max-time 45 --retry 1 --retry-delay 1 --retry-connrefused \
        -sS \
        -o "$pdf_body" \
        -w '%{http_code}|%{content_type}' \
        -H "Content-Type: application/json" \
        -H "Accept: application/pdf" \
        -d "$pdf_payload" \
        "$rpc_base_url/templates/render-pdf" || true
    )"
    pdf_http_code="${pdf_curl_meta%%|*}"
    pdf_content_type="${pdf_curl_meta#*|}"
    pdf_content_type="$(printf '%s' "$pdf_content_type" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
    pdf_signature="$(LC_ALL=C dd if="$pdf_body" bs=4 count=1 2>/dev/null || true)"
    if [[ "$pdf_http_code" == "200" && "$pdf_content_type" == "application/pdf" && -s "$pdf_body" && "$pdf_signature" == "%PDF" ]]; then
      pdf_size_bytes="$(wc -c <"$pdf_body" | tr -d '[:space:]')"
      pdf_sha256="$(
        node - "$pdf_body" <<'NODE'
const fs = require("node:fs");
const crypto = require("node:crypto");
const file = process.argv[2];
process.stdout.write(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"));
NODE
      )"
      pdf_status="pass"
    fi
  fi
  : >"$pdf_body"
  if [[ "$pdf_status" == "pass" ]]; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
  fi
  checks+=("template-pdf-render")
  items+=("{\"name\":\"template-pdf-render\",\"status\":\"$pdf_status\",\"target\":\"/templates/render-pdf\",\"httpCode\":\"$pdf_http_code\",\"contentType\":\"$pdf_content_type\",\"sha256\":\"$pdf_sha256\",\"sizeBytes\":$pdf_size_bytes,\"tokenSourceEnv\":\"$admin_token_env\",\"responseBodyStored\":false}")
fi
unset token

items_file="$smoke_tmp_dir/checks.jsonl"
report_file="$smoke_tmp_dir/report.json"
printf '%s\n' "${items[@]}" >"$items_file"
chmod 600 "$items_file"
node -e '
const fs = require("node:fs");
const [environment, releaseVersion, generatedAt, endpointAlias, backendEndpointAlias, total, passed, failed] = process.argv.slice(1);
const checks = fs.readFileSync(0, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
const report = {
  customerCode: "yoyoosun",
  environment,
  releaseVersion,
  generatedAt,
  operatorRole: "deployment-operator",
  endpointAlias,
  ...(backendEndpointAlias ? { backendEndpointAlias } : {}),
  summary: { total: Number(total), passed: Number(passed), failed: Number(failed) },
  checks,
  redaction: { containsSecrets: false, containsRawCustomerRows: false },
};
if (checks.length !== report.summary.total || report.summary.passed + report.summary.failed !== report.summary.total) process.exit(1);
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
' "$environment" "$release_version" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$endpoint" "$backend_url" "${#checks[@]}" "$passed" "$failed" <"$items_file" >"$report_file"
chmod 600 "$report_file"
mv "$report_file" "$report"

echo "[run-smoke] report: $report"
if [[ "$failed" -gt 0 ]]; then
  exit 1
fi
