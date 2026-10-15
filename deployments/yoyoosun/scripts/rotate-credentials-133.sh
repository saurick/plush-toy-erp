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

deployment_target=""
ssh_target=""
expected_release=""
expected_migration=""
operation_id=""
report=""
confirm=""

while [[ $# -gt 0 ]]; do
  case "$1" in
  --deployment-target)
    deployment_target="${2:-}"
    shift 2
    ;;
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

[[ "$deployment_target" == "demo-133" || "$deployment_target" == "customer-test-133" ]] || {
  echo "[rotate-credentials-133] --deployment-target 必须是 demo-133 或 customer-test-133" >&2
  exit 2
}
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
[[ -n "$report" ]] || {
  echo "[rotate-credentials-133] --report 必填" >&2
  exit 2
}
expected_confirm="ROTATE_YOYOOSUN_CREDENTIALS_133:${deployment_target}:${expected_release}:${expected_migration}:${operation_id}"
[[ "$confirm" == "$expected_confirm" ]] || {
  echo "[rotate-credentials-133] --confirm 与 deployment target 不匹配" >&2
  exit 2
}

command -v node >/dev/null 2>&1 || {
  echo "[rotate-credentials-133] 缺少 node" >&2
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

IFS=$'\t' read -r registered_target command_target dataset_version target_identity database root current runtime_env project_name compose_directory base_file override_file postgres_service server_service registered_ssh_target registered_ssh_port < <(
  node "$support_script" target-config "$contract_file" "$deployment_target"
)
[[ "$registered_target" == "$deployment_target" ]] || {
  echo "[rotate-credentials-133] deployment target registry 漂移" >&2
  exit 1
}
[[ "$ssh_target" == "$registered_ssh_target" ]] || {
  echo "[rotate-credentials-133] --ssh-target 与 deployment target registry 不匹配" >&2
  exit 2
}

IFS=$'\t' read -r admin_password role_password phone_service phone_account < <(
  node "$support_script" credential-contract "$contract_file" "$deployment_target"
)
[[ "$role_password" == "-" ]] && role_password=""
[[ "$phone_service" == "-" ]] && phone_service=""
[[ "$phone_account" == "-" ]] && phone_account=""

[[ ${#admin_password} -ge 8 && ${#admin_password} -le 20 ]] || {
  echo "[rotate-credentials-133] admin 合同密码长度非法" >&2
  exit 1
}

sms_phone=""
phone_expected=false
if [[ "$deployment_target" == "demo-133" ]]; then
  command -v security >/dev/null 2>&1 || {
    echo "[rotate-credentials-133] demo-133 SMS 身份读取缺少 macOS security" >&2
    exit 1
  }
  [[ ${#role_password} -ge 8 && ${#role_password} -le 20 && "$admin_password" != "$role_password" ]] || {
    echo "[rotate-credentials-133] demo-133 非管理员凭据合同非法" >&2
    exit 1
  }
  sms_phone="$(security find-generic-password -w -s "$phone_service" -a "$phone_account" 2>/dev/null || true)"
  [[ -z "$sms_phone" || "$sms_phone" =~ ^1[3-9][0-9]{9}$ ]] || {
    echo "[rotate-credentials-133] SMS Keychain 手机号必须为空或规范化的中国大陆手机号" >&2
    exit 1
  }
  [[ -n "$sms_phone" ]] && phone_expected=true
else
  [[ -z "$role_password" && -z "$phone_service" && -z "$phone_account" ]] || {
    echo "[rotate-credentials-133] customer-test-133 不接受非管理员或 SMS 凭据" >&2
    exit 1
  }
fi

report_dir="$(dirname "$report")"
mkdir -p "$report_dir"
report_tmp="$(mktemp "$report_dir/.credential-rotation.XXXXXX")"
cleanup() {
  admin_password=""
  role_password=""
  sms_phone=""
  rm -f "$report_tmp"
}
trap cleanup EXIT HUP INT TERM

if [[ "$deployment_target" == "demo-133" ]]; then
  {
    printf 'MANUAL_ACCEPTANCE_ADMIN_PASSWORD=%q\n' "$admin_password"
    printf 'MANUAL_ACCEPTANCE_UAT_PASSWORD=%q\n' "$role_password"
    printf 'MANUAL_ACCEPTANCE_SMS_PHONE=%q\n' "$sms_phone"
    printf '%s\n' 'export MANUAL_ACCEPTANCE_ADMIN_PASSWORD MANUAL_ACCEPTANCE_UAT_PASSWORD MANUAL_ACCEPTANCE_SMS_PHONE'
    sed '1d' "$remote_script"
  } | ssh -p "$registered_ssh_port" -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 "$ssh_target" \
    bash -s -- "$deployment_target" "$command_target" "$dataset_version" "$target_identity" "$database" "$root" "$current" "$runtime_env" "$project_name" "$compose_directory" "$base_file" "$override_file" "$postgres_service" "$server_service" "$expected_release" "$expected_migration" "$operation_id" >"$report_tmp"
else
  {
    printf 'MANUAL_ACCEPTANCE_ADMIN_PASSWORD=%q\n' "$admin_password"
    printf '%s\n' 'export MANUAL_ACCEPTANCE_ADMIN_PASSWORD'
    sed '1d' "$remote_script"
  } | ssh -p "$registered_ssh_port" -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 "$ssh_target" \
    bash -s -- "$deployment_target" "$command_target" "$dataset_version" "$target_identity" "$database" "$root" "$current" "$runtime_env" "$project_name" "$compose_directory" "$base_file" "$override_file" "$postgres_service" "$server_service" "$expected_release" "$expected_migration" "$operation_id" >"$report_tmp"
fi

node "$support_script" validate-report "$report_tmp" "$contract_file" "$deployment_target" "$expected_release" "$expected_migration" "$operation_id" "$phone_expected"

mv "$report_tmp" "$report"
trap - EXIT HUP INT TERM
cleanup
echo "[rotate-credentials-133] 脱敏回执: $report"
