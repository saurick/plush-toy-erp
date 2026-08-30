#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
support_script="$script_dir/rotate-credentials-133-support.mjs"
remote_script="$script_dir/rotate-credentials-133-remote.sh"

print_help() {
  node "$support_script" help
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

contract_file="$script_dir/../env/credential.contract.json"
[[ -f "$contract_file" ]] || {
  echo "[rotate-credentials-133] credential contract 不存在" >&2
  exit 1
}
[[ -f "$support_script" && -f "$remote_script" ]] || {
  echo "[rotate-credentials-133] support scripts 不完整" >&2
  exit 1
}

IFS=$'\t' read -r admin_password uat_password phone_service phone_account < <(
  node "$support_script" credential-contract "$contract_file"
)

sms_phone="$(security find-generic-password -w -s "$phone_service" -a "$phone_account" 2>/dev/null || true)"

[[ ${#admin_password} -ge 8 && ${#admin_password} -le 20 ]] || {
  echo "[rotate-credentials-133] admin 合同密码长度非法" >&2
  exit 1
}
[[ ${#uat_password} -ge 8 && ${#uat_password} -le 20 ]] || {
  echo "[rotate-credentials-133] UAT 岗位合同密码长度非法" >&2
  exit 1
}
[[ "$admin_password" != "$uat_password" ]] || {
  echo "[rotate-credentials-133] admin 与 UAT 岗位密码必须不同" >&2
  exit 1
}
[[ "$admin_password" == "adminadmin" && "$uat_password" == "12345678" ]] || {
  echo "[rotate-credentials-133] 133 固定测试凭据合同漂移" >&2
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
  uat_password=""
  sms_phone=""
  rm -f "$report_tmp"
}
trap cleanup EXIT HUP INT TERM

{
  printf 'MANUAL_ACCEPTANCE_ADMIN_PASSWORD=%q\n' "$admin_password"
  printf 'MANUAL_ACCEPTANCE_UAT_PASSWORD=%q\n' "$uat_password"
  printf 'MANUAL_ACCEPTANCE_SMS_PHONE=%q\n' "$sms_phone"
  printf '%s\n' 'export MANUAL_ACCEPTANCE_ADMIN_PASSWORD MANUAL_ACCEPTANCE_UAT_PASSWORD MANUAL_ACCEPTANCE_SMS_PHONE'
  sed '1d' "$remote_script"
} | ssh -o BatchMode=yes -o ConnectTimeout=10 "$ssh_target" \
  bash -s -- "$expected_release" "$expected_migration" "$operation_id" "$backup_file" "$backup_sha256" >"$report_tmp"

node "$support_script" validate-report "$report_tmp" "$expected_release" "$expected_migration" "$operation_id" "$phone_expected"

mv "$report_tmp" "$report"
trap - EXIT HUP INT TERM
cleanup
echo "[rotate-credentials-133] 脱敏回执: $report"
