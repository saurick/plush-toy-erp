#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077

print_help() {
  cat <<'USAGE'
用法:
  bash deployments/yoyoosun/scripts/rotate-credentials-133.sh \
    --ssh-target simon@192.168.0.133 \
    --expected-release <40-character-lowercase-git-sha> \
    --expected-migration <14-digit-atlas-version> \
    --operation-id <unique-operation-id> \
    --backup-file </absolute/remote/pre-rotation.dump> \
    --backup-sha256 <64-hex> \
    --report <local-redacted-receipt.json> \
    --confirm 'ROTATE_YOYOOSUN_CREDENTIALS_133:<release>:<migration>:<operation-id>'

说明:
  只在发布工作站运行。admin 与 demo 使用 credential.contract.json 明确登记的
  测试服固定简单密码；短信手机号仅在对应 Keychain alias 已人工录入时读取。
  三项值只经 SSH stdin 临时注入一次性 Compose 容器，不进入服务器 steady env
  或脱敏 receipt。执行前必须提供已存在且 hash 匹配的远端备份。
USAGE
}

ssh_target=""
expected_release=""
expected_migration=""
operation_id=""
backup_file=""
backup_sha256=""
report=""
confirm=""

while [[ $# -gt 0 ]]; do
  case "$1" in
  --ssh-target)
    ssh_target="${2:-}"
    shift 2
    ;;
  --expected-release)
    expected_release="${2:-}"
    shift 2
    ;;
  --expected-migration)
    expected_migration="${2:-}"
    shift 2
    ;;
  --operation-id)
    operation_id="${2:-}"
    shift 2
    ;;
  --backup-file)
    backup_file="${2:-}"
    shift 2
    ;;
  --backup-sha256)
    backup_sha256="${2:-}"
    shift 2
    ;;
  --report)
    report="${2:-}"
    shift 2
    ;;
  --confirm)
    confirm="${2:-}"
    shift 2
    ;;
  -h | --help)
    print_help
    exit 0
    ;;
  *)
    echo "[rotate-credentials-133] 不支持的参数: $1" >&2
    print_help >&2
    exit 2
    ;;
  esac
done

[[ "$ssh_target" =~ ^[A-Za-z0-9._-]+@[A-Za-z0-9._:-]+$ ]] || {
  echo "[rotate-credentials-133] --ssh-target 格式非法" >&2
  exit 2
}
[[ "$expected_release" =~ ^[a-f0-9]{40}$ ]] || {
  echo "[rotate-credentials-133] --expected-release 必须是 40 位小写 SHA" >&2
  exit 2
}
[[ "$expected_migration" =~ ^[0-9]{14}$ ]] || {
  echo "[rotate-credentials-133] --expected-migration 必须是 14 位 Atlas version" >&2
  exit 2
}
[[ "$operation_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] || {
  echo "[rotate-credentials-133] --operation-id 必须是小写 UUID v4" >&2
  exit 2
}
[[ "$backup_file" =~ ^/[A-Za-z0-9._/-]+$ && "$backup_file" != *"/../"* && "$backup_file" != *"/./"* ]] || {
  echo "[rotate-credentials-133] --backup-file 必须是无 dot segment 的绝对路径" >&2
  exit 2
}
[[ "$backup_sha256" =~ ^[a-f0-9]{64}$ ]] || {
  echo "[rotate-credentials-133] --backup-sha256 必须是 64 位小写 hex" >&2
  exit 2
}
[[ -n "$report" ]] || {
  echo "[rotate-credentials-133] --report 必填" >&2
  exit 2
}
expected_confirm="ROTATE_YOYOOSUN_CREDENTIALS_133:${expected_release}:${expected_migration}:${operation_id}"
[[ "$confirm" == "$expected_confirm" ]] || {
  echo "[rotate-credentials-133] --confirm 与目标不匹配" >&2
  exit 2
}

command -v node >/dev/null 2>&1 || {
  echo "[rotate-credentials-133] 缺少 node" >&2
  exit 1
}
command -v security >/dev/null 2>&1 || {
  echo "[rotate-credentials-133] 缺少 macOS security" >&2
  exit 1
}
command -v ssh >/dev/null 2>&1 || {
  echo "[rotate-credentials-133] 缺少 ssh" >&2
  exit 1
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
contract_file="$script_dir/../env/credential.contract.json"
[[ -f "$contract_file" ]] || {
  echo "[rotate-credentials-133] credential contract 不存在" >&2
  exit 1
}

IFS=$'\t' read -r admin_password demo_password phone_service phone_account < <(
  node - "$contract_file" <<'NODE'
const fs = require("node:fs");
const contract = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const admin = contract?.credentials?.admin;
const demo = contract?.credentials?.demo;
const phone = contract?.smsLoginIdentity?.keychain;
const text = (value) => typeof value === "string" && value.length > 0 && !/[\t\r\n]/u.test(value);
if (
  contract?.schemaVersion !== "yoyoosun-credential-contract/v2" ||
  contract?.target?.key !== "customer-trial-133" ||
  contract?.target?.database !== "plush_erp_uat_20260716_v5" ||
  contract?.target?.datasetVersion !== "2026.07.16-v5" ||
  admin?.username !== "admin" || admin?.credentialSource !== "contract-fixed-test" || admin?.fixedTestPassword !== "adminadmin" ||
  demo?.credentialSource !== "contract-fixed-test" || demo?.fixedTestPassword !== "12345678" ||
  !text(phone?.service) || !text(phone?.account) ||
  JSON.stringify(contract?.policy?.registeredSimplePasswordTargets) !== JSON.stringify(["local-dev", "customer-trial-133"]) ||
  contract?.policy?.passwordsMustDiffer !== true ||
  contract.policy.rotateAfterCreateRestoreOrRollback !== true ||
  contract.policy.revokeExistingSessionsOnRotation !== true ||
  contract.policy.requireCredentialLoginMatrixBeforeCutover !== true ||
  contract?.smsLoginIdentity?.phoneRequiredWhenProviderEnabled !== false ||
  contract.smsLoginIdentity.verifyPhoneIdentityWhenConfigured !== true ||
  contract?.redaction?.containsSecrets !== false ||
  contract.redaction.storePasswords !== false ||
  contract.redaction.storeTokens !== false ||
  contract.redaction.storePhoneNumber !== false ||
  contract.redaction.storeRawProfiles !== false
) throw new Error("invalid yoyoosun credential contract");
process.stdout.write([
  admin.fixedTestPassword,
  demo.fixedTestPassword,
  phone.service,
  phone.account,
].join("\t") + "\n");
NODE
)

sms_phone="$(security find-generic-password -w -s "$phone_service" -a "$phone_account" 2>/dev/null || true)"

[[ ${#admin_password} -ge 8 && ${#admin_password} -le 20 ]] || {
  echo "[rotate-credentials-133] admin 合同密码长度非法" >&2
  exit 1
}
[[ ${#demo_password} -ge 8 && ${#demo_password} -le 20 ]] || {
  echo "[rotate-credentials-133] demo 合同密码长度非法" >&2
  exit 1
}
[[ "$admin_password" != "$demo_password" ]] || {
  echo "[rotate-credentials-133] admin 与 demo 密码必须不同" >&2
  exit 1
}
[[ "$admin_password" == "adminadmin" && "$demo_password" == "12345678" ]] || {
  echo "[rotate-credentials-133] 测试凭据合同漂移" >&2
  exit 1
}
[[ -z "$sms_phone" || "$sms_phone" =~ ^1[3-9][0-9]{9}$ ]] || {
  echo "[rotate-credentials-133] SMS Keychain 手机号必须为空或规范化的中国大陆手机号" >&2
  exit 1
}
phone_expected=false
[[ -n "$sms_phone" ]] && phone_expected=true

report_dir="$(dirname "$report")"
mkdir -p "$report_dir"
report_tmp="$(mktemp "$report_dir/.credential-rotation.XXXXXX")"
cleanup() {
  admin_password=""
  demo_password=""
  sms_phone=""
  rm -f "$report_tmp"
}
trap cleanup EXIT HUP INT TERM

{
  printf '%s\n%s\n%s\n' "$admin_password" "$demo_password" "$sms_phone"
  cat <<'REMOTE_SCRIPT'
set -euo pipefail
expected_release="$1"
expected_migration="$2"
operation_id="$3"
backup_file="$4"
backup_sha256="$5"

[[ -f "$backup_file" && ! -L "$backup_file" && -s "$backup_file" ]] || { echo "pre-rotation backup is missing or unsafe" >&2; exit 1; }
actual_backup_sha256="$(sha256sum "$backup_file" | awk '{print $1}')"
[[ "$actual_backup_sha256" == "$backup_sha256" ]] || { echo "pre-rotation backup sha256 mismatch" >&2; exit 1; }

release_root="/home/simon/plush-toy-erp-v5/current"
env_file="/home/simon/plush-toy-erp-v5/runtime/.env.customer-trial-133"
compose_dir="$release_root/server/deploy/compose/prod"
base_compose="$compose_dir/compose.yml"
trial_compose="$compose_dir/compose.customer-trial-133.yml"
[[ -d "$compose_dir" && -f "$env_file" && -f "$base_compose" && -f "$trial_compose" ]] || { echo "registered 133 release paths are incomplete" >&2; exit 1; }
cd "$compose_dir"
docker compose \
  -p plush-toy-erp-v5 \
  --env-file "$env_file" \
  -f "$base_compose" \
  -f "$trial_compose" \
  run --rm -T --no-deps --pull never \
  -e MANUAL_ACCEPTANCE_ADMIN_PASSWORD \
  -e MANUAL_ACCEPTANCE_PASSWORD \
  -e MANUAL_ACCEPTANCE_SMS_PHONE \
  app-server /app/rotate-manual-acceptance-passwords \
    --target customer-trial-133 \
    --dataset-version 2026.07.16-v5 \
    --expected-migration-version "$expected_migration" \
    --expected-release "$expected_release" \
    --operation-id "$operation_id" \
    --confirm ROTATE_SIMULATED_ACCEPTANCE_ACCOUNTS:customer-trial-133:2026.07.16-v5
REMOTE_SCRIPT
} | ssh -o BatchMode=yes -o ConnectTimeout=10 "$ssh_target" \
  bash -c 'set -euo pipefail; IFS= read -r MANUAL_ACCEPTANCE_ADMIN_PASSWORD; IFS= read -r MANUAL_ACCEPTANCE_PASSWORD; IFS= read -r MANUAL_ACCEPTANCE_SMS_PHONE; export MANUAL_ACCEPTANCE_ADMIN_PASSWORD MANUAL_ACCEPTANCE_PASSWORD MANUAL_ACCEPTANCE_SMS_PHONE; exec bash -s -- "$@"' \
  _ "$expected_release" "$expected_migration" "$operation_id" "$backup_file" "$backup_sha256" >"$report_tmp"

node - "$report_tmp" "$expected_release" "$expected_migration" "$operation_id" "$phone_expected" <<'NODE'
const fs = require("node:fs");
const [file, release, migration, operationId, phoneExpectedRaw] = process.argv.slice(2);
const phoneExpected = phoneExpectedRaw === "true";
const report = JSON.parse(fs.readFileSync(file, "utf8"));
const accounts = Array.isArray(report.accounts) ? report.accounts : [];
const valid =
  report.target === "customer-trial-133" &&
  report.datasetVersion === "2026.07.16-v5" &&
  report.release === release &&
  report.migrationVersion === migration &&
  report.operationId === operationId &&
  report.adminAccounts === 1 &&
  report.demoAccounts === 10 &&
  report.authVersionIncremented === true &&
  report.phoneBound === phoneExpected &&
  report.auditSource === "manual_acceptance_password_rotation" &&
  accounts.length === 11 &&
  new Set(accounts.map((item) => item?.username)).size === 11 &&
  accounts.every((item) => Number.isSafeInteger(item?.authVersion) && item.authVersion > 1) &&
  accounts.every((item) => item?.phoneBound === (phoneExpected && item?.username === "admin"));
if (!valid) throw new Error("credential rotation receipt is incomplete");
const visit = (value) => {
  if (Array.isArray(value)) return value.forEach(visit);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/(?:password|access[_-]?token|phone)$/iu.test(key) && key !== "phoneBound") {
      throw new Error("credential rotation receipt contains forbidden sensitive fields");
    }
    visit(child);
  }
};
visit(report);
if (/\b1[3-9][0-9]{9}\b/u.test(JSON.stringify(report))) {
  throw new Error("credential rotation receipt contains a phone number");
}
NODE

mv "$report_tmp" "$report"
trap - EXIT HUP INT TERM
cleanup
echo "[rotate-credentials-133] 脱敏回执: $report"
