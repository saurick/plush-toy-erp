#!/usr/bin/env bash
set -euo pipefail

umask 077

print_help() {
  cat <<'USAGE'
用法:
  APP_ADMIN_PASSWORD='<ephemeral-secret>' \
    bash scripts/deploy/bootstrap-production-admin.sh \
      --env-file server/deploy/compose/prod/.env \
      [--compose-override server/deploy/compose/prod/compose.customer-trial-133.yml] \
      --expected-database <database> \
      --expected-migration <atlas-version> \
      --expected-release <40-lowercase-git-sha> \
      --confirm 'BOOTSTRAP_PRODUCTION_ADMIN:<project>:<database>:<username>:<migration>:<release>'

作用:
  在已经完成 migration 的 fresh production PostgreSQL 中，通过 app-server 镜像的一次性
  Compose 容器创建首个超级管理员。服务端会先初始化内置 RBAC，再以同一事务写入管理员、
  immutable runtime marker 和 completed runtime audit event。

  边界:
  - 不执行 migration，不启动常驻 app-server，不发布端口，不激活客户配置。
  - APP_ADMIN_PASSWORD 只允许通过当前进程环境传入；不得写入 .env 或命令参数。
  - 同一 Compose project / database 同时由私有原子锁和 PostgreSQL session advisory lock 串行；
    已有锁一律停止，不自动删除陈旧锁。
  - 身份可完整证明时，成功或失败都会停止并删除一次性容器，并清理 password 变量。
    容器发现、身份或清理不确定时保留 advisory/file lock 现场，禁止自动重试。
  - marker 已提交后的任何读回失败都不会自动删除或重跑 bootstrap。

参数:
  --env-file <path>              steady production env，必须 once=false 且无 password key
  --compose-dir <path>           默认 server/deploy/compose/prod
  --compose-override <path>      仅 customer-trial-133 使用的受控 Compose project override
  --expected-database <name>     本次唯一目标数据库
  --expected-migration <version> 目标 Atlas current version
  --expected-release <sha>       app-server 镜像内 GIT_SHA
  --confirm <text>               与 project/database/user/migration/release 绑定的精确确认串
  --timeout-seconds <1-300>      marker 等待上限，默认 120 秒
USAGE
}

fail() {
  if [[ "${bootstrap_committed:-0}" -eq 1 ]]; then
    echo "[bootstrap-production-admin] ERROR: bootstrap_committed_runtime_not_ready: $*" >&2
  else
    echo "[bootstrap-production-admin] ERROR: $*" >&2
  fi
  exit 1
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "$value"
}

normalize_env_file() {
  local source_path="$1"
  local target_path="$2"
  local line raw_key raw_value key value

  : >"$target_path"
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="$(trim "$line")"
    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" == *=* ]] || fail "env 文件包含无法解析的行"
    raw_key="${line%%=*}"
    raw_value="${line#*=}"
    key="$(trim "$(printf '%s' "$raw_key" | sed -E 's/^[[:space:]]*export[[:space:]]+//')")"
    value="$(trim "$raw_value")"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || fail "env 文件包含非法变量名"
    printf '%s=%s\n' "$key" "$value" >>"$target_path"
  done <"$source_path"
}

env_key_count() {
  local key="$1"
  local source_path="$2"
  awk -F= -v key="$key" '$1 == key { count++ } END { print count + 0 }' "$source_path"
}

env_value_of() {
  local key="$1"
  local source_path="$2"
  awk -F= -v key="$key" '
    $1 == key {
      sub(/^[^=]*=/, "")
      value = $0
    }
    END { print value }
  ' "$source_path"
}

require_single_env_key() {
  local key="$1"
  local source_path="$2"
  [[ "$(env_key_count "$key" "$source_path")" -eq 1 ]] || fail "env 文件必须且只能声明一次 $key"
}

utf8_codepoint_count() {
  local value="$1"
  local utf32_bytes
  command -v iconv >/dev/null 2>&1 || fail "缺少 iconv，无法按 UTF-8 字符校验管理员密码"
  if ! utf32_bytes="$(printf '%s' "$value" | iconv -f UTF-8 -t UTF-32LE 2>/dev/null | wc -c | tr -d '[:space:]')"; then
    fail "APP_ADMIN_PASSWORD 必须是有效 UTF-8"
  fi
  [[ "$utf32_bytes" =~ ^[0-9]+$ && $((utf32_bytes % 4)) -eq 0 ]] || fail "APP_ADMIN_PASSWORD UTF-8 字符计数失败"
  printf '%s' "$((utf32_bytes / 4))"
}

byte_count() {
  LC_ALL=C printf '%s' "$1" | wc -c | tr -d '[:space:]'
}

read_scalar() {
  local query="$1"
  local output
  if ! output="$(printf '%s\n' "$query" | run_psql -f - 2>/dev/null)"; then
    return 1
  fi
  output="$(printf '%s\n' "$output" | sed -e 's/\r$//' -e '/^[[:space:]]*$/d' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  [[ -n "$output" && "$output" != *$'\n'* ]] || return 1
  printf '%s' "$output"
}

generate_operation_id() {
  local value
  command -v od >/dev/null 2>&1 || fail "缺少 od，无法生成 bootstrap operation id"
  if ! value="$(LC_ALL=C od -An -N16 -tx1 /dev/urandom 2>/dev/null | tr -d '[:space:]')"; then
    fail "无法生成 bootstrap operation id"
  fi
  [[ "$value" =~ ^[0-9a-f]{32}$ ]] || fail "bootstrap operation id 格式无效"
  printf '%s' "$value"
}

path_mode() {
  local path="$1"
  local mode_value=""
  mode_value="$(stat -c '%a' "$path" 2>/dev/null || true)"
  if [[ -z "$mode_value" ]]; then
    mode_value="$(stat -f '%Lp' "$path" 2>/dev/null || true)"
  fi
  printf '%s' "$mode_value"
}

path_owner_uid() {
  local path="$1"
  local owner_uid=""
  owner_uid="$(stat -c '%u' "$path" 2>/dev/null || true)"
  if [[ -z "$owner_uid" ]]; then
    owner_uid="$(stat -f '%u' "$path" 2>/dev/null || true)"
  fi
  printf '%s' "$owner_uid"
}

release_bootstrap_lock() {
  local actual_token owner_mode owner_uid
  [[ "${bootstrap_lock_acquired:-0}" -eq 1 ]] || return 0
  [[ -n "${bootstrap_lock_dir:-}" && -n "${bootstrap_lock_owner_file:-}" && -n "${bootstrap_lock_token:-}" ]] || return 1
  [[ -d "$bootstrap_lock_dir" && ! -L "$bootstrap_lock_dir" ]] || return 1
  [[ -f "$bootstrap_lock_owner_file" && ! -L "$bootstrap_lock_owner_file" ]] || return 1
  owner_mode="$(path_mode "$bootstrap_lock_owner_file")"
  owner_uid="$(path_owner_uid "$bootstrap_lock_owner_file")"
  [[ "$owner_mode" =~ ^0?600$ && "$owner_uid" == "$(id -u)" ]] || return 1
  actual_token="$(<"$bootstrap_lock_owner_file")"
  [[ "$actual_token" == "$bootstrap_lock_token" ]] || return 1
  rm -f "$bootstrap_lock_owner_file" || return 1
  rmdir "$bootstrap_lock_dir" || return 1
  bootstrap_lock_acquired=0
  bootstrap_lock_dir=""
  bootstrap_lock_owner_file=""
  bootstrap_lock_token=""
  return 0
}

acquire_bootstrap_lock() {
  local lock_root="$1"
  local compose_project="$2"
  local database="$3"
  local lock_root_mode lock_root_uid

  case "$lock_root" in
  /tmp/* | /var/tmp/* | /dev/shm/*)
    fail "admin bootstrap lock 不得位于共享临时目录"
    ;;
  esac
  [[ "$lock_root" == /* && "$lock_root" != "/" && "$lock_root" != "/run/lock" ]] || fail "admin bootstrap lock 必须位于专用绝对目录"
  [[ -d "$lock_root" && ! -L "$lock_root" ]] || fail "admin bootstrap lock 目录不存在、不是目录或是符号链接"
  lock_root_mode="$(path_mode "$lock_root")"
  lock_root_uid="$(path_owner_uid "$lock_root")"
  [[ "$lock_root_mode" =~ ^0?700$ ]] || fail "admin bootstrap lock 目录权限必须为 0700"
  [[ "$lock_root_uid" == "$(id -u)" ]] || fail "admin bootstrap lock 目录必须归当前执行用户所有"

  bootstrap_lock_dir="$lock_root/admin-bootstrap-${compose_project}-${database}.lock"
  bootstrap_lock_owner_file="$bootstrap_lock_dir/owner"
  bootstrap_lock_token="${compose_project}:${database}:$$:$(date -u +%s):${RANDOM}"
  if ! mkdir -m 700 "$bootstrap_lock_dir" 2>/dev/null; then
    fail "admin bootstrap lock 已存在，拒绝并发且不自动删除陈旧锁；确认原进程已退出后保留并人工重命名该锁目录再重试"
  fi
  bootstrap_lock_acquired=1
  if ! printf '%s' "$bootstrap_lock_token" >"$bootstrap_lock_owner_file"; then
    bootstrap_lock_acquired=0
    rm -f "$bootstrap_lock_owner_file" 2>/dev/null || true
    rmdir "$bootstrap_lock_dir" 2>/dev/null || true
    bootstrap_lock_dir=""
    bootstrap_lock_owner_file=""
    bootstrap_lock_token=""
    fail "无法写入 admin bootstrap lock owner"
  fi
  chmod 600 "$bootstrap_lock_owner_file" || fail "无法收紧 admin bootstrap lock owner 权限"
}

release_database_advisory_lock() {
  local pid="${advisory_lock_pid:-}"
  local termination_status="" attempt

  if [[ "${advisory_lock_acquired:-0}" -eq 1 ]]; then
    [[ "${advisory_backend_pid:-}" =~ ^[0-9]+$ ]] || return 1
    [[ "${advisory_application_name:-}" =~ ^erp-admin-bootstrap-lock-[0-9a-f]{32}$ ]] || return 1
    termination_status="$(read_scalar "SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid = $advisory_backend_pid AND application_name = '$advisory_application_name' AND datname = current_database()) THEN CASE WHEN pg_terminate_backend($advisory_backend_pid) THEN 'terminated' ELSE 'failed' END ELSE 'absent' END;" || true)"
    [[ "$termination_status" == "terminated" || "$termination_status" == "absent" ]] || return 1
  fi

  if [[ "${advisory_lock_input_open:-0}" -eq 1 ]]; then
    { exec 9>&-; } 2>/dev/null || true
    { exec 9<&-; } 2>/dev/null || true
    advisory_lock_input_open=0
  fi
  if [[ -n "$pid" ]]; then
    attempt=0
    while ((attempt < 40)); do
      kill -0 "$pid" >/dev/null 2>&1 || break
      sleep 0.05
      attempt=$((attempt + 1))
    done
    kill "$pid" >/dev/null 2>&1 || true
    wait "$pid" >/dev/null 2>&1 || true
    advisory_lock_pid=""
  fi
  if [[ -n "${advisory_lock_runtime_dir:-}" ]]; then
    rm -f "$advisory_lock_input" "$advisory_lock_output" "$advisory_lock_error" >/dev/null 2>&1 || true
    rmdir "$advisory_lock_runtime_dir" >/dev/null 2>&1 || true
    advisory_lock_runtime_dir=""
  fi
  advisory_lock_acquired=0
  advisory_backend_pid=""
  advisory_application_name=""
  return 0
}

ensure_database_advisory_lock_held() {
  [[ "${advisory_lock_acquired:-0}" -eq 1 && -n "${advisory_lock_pid:-}" ]] || fail "PostgreSQL admin bootstrap advisory lock 未持有"
  kill -0 "$advisory_lock_pid" >/dev/null 2>&1 || fail "PostgreSQL admin bootstrap advisory lock session 已退出"
}

acquire_database_advisory_lock() {
  local compose_project="$1"
  local database="$2"
  local lock_identity status deadline nonce

  lock_identity="${compose_project}:${database}"
  nonce="$(generate_operation_id)"
  advisory_application_name="erp-admin-bootstrap-lock-${nonce}"
  advisory_lock_runtime_dir="$(mktemp -d)"
  chmod 700 "$advisory_lock_runtime_dir"
  advisory_lock_input="$advisory_lock_runtime_dir/input"
  advisory_lock_output="$advisory_lock_runtime_dir/output"
  advisory_lock_error="$advisory_lock_runtime_dir/error"
  mkfifo -m 600 "$advisory_lock_input"
  : >"$advisory_lock_output"
  : >"$advisory_lock_error"
  chmod 600 "$advisory_lock_output" "$advisory_lock_error"

  # 固定 fd 9 兼容 macOS 系统 Bash；psql 报告 ready 后以 pg_sleep 保持 session/lock。
  exec 9<>"$advisory_lock_input"
  advisory_lock_input_open=1
  (
    exec 9>&-
    exec "${compose_cmd[@]}" exec -T postgres \
      env "PGAPPNAME=$advisory_application_name" \
      psql -X -A -t -q -v ON_ERROR_STOP=1 \
      -U "$postgres_user" -d "$postgres_db" \
      -v "lock_identity=$lock_identity" -f -
  ) <"$advisory_lock_input" >"$advisory_lock_output" 2>"$advisory_lock_error" &
  advisory_lock_pid=$!
  printf '%s\n' \
    '\set ON_ERROR_STOP on' \
    "SELECT pg_backend_pid() AS backend_pid, pg_try_advisory_lock(hashtextextended(:'lock_identity', 0)) AS acquired \\gset" \
    '\if :acquired' \
    '\echo :backend_pid:ready' \
    'SELECT pg_sleep(2147483647);' \
    '\else' \
    '\echo :backend_pid:busy' \
    '\quit' \
    '\endif' >&9

  deadline=$((SECONDS + 10))
  status=""
  while [[ -z "$status" ]]; do
    if [[ -s "$advisory_lock_output" ]]; then
      status="$(sed -e 's/\r$//' -e '/^[[:space:]]*$/d' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' "$advisory_lock_output" | head -n1)"
      break
    fi
    if ! kill -0 "$advisory_lock_pid" >/dev/null 2>&1; then
      release_database_advisory_lock
      fail "PostgreSQL admin bootstrap advisory lock session 异常退出"
    fi
    if ((SECONDS >= deadline)); then
      release_database_advisory_lock
      fail "等待 PostgreSQL admin bootstrap advisory lock 超时"
    fi
    sleep 0.05
  done

  if [[ ! "$status" =~ ^([0-9]+):(ready|busy)$ ]]; then
    release_database_advisory_lock
    fail "PostgreSQL admin bootstrap advisory lock 返回异常状态"
  fi
  advisory_backend_pid="${BASH_REMATCH[1]}"
  status="${BASH_REMATCH[2]}"
  if [[ "$status" == "busy" ]]; then
    release_database_advisory_lock
    fail "PostgreSQL admin bootstrap advisory lock 已被占用，拒绝跨文件锁目录并发"
  fi
  advisory_lock_acquired=1
  ensure_database_advisory_lock_held
}

read_container_field() {
  local format="$1"
  local cid="$2"
  docker inspect --format "$format" "$cid" 2>/dev/null || true
}

verify_one_shot_identity() {
  local cid="$1"
  local actual_id actual_name actual_project actual_service actual_image_ref actual_image_id actual_operation

  [[ "$cid" =~ ^[0-9a-f]{64}$ ]] || return 1
  actual_id="$(trim "$(read_container_field '{{.Id}}' "$cid")")"
  actual_name="$(trim "$(read_container_field '{{.Name}}' "$cid")")"
  actual_name="${actual_name#/}"
  actual_project="$(trim "$(read_container_field '{{index .Config.Labels "com.docker.compose.project"}}' "$cid")")"
  actual_service="$(trim "$(read_container_field '{{index .Config.Labels "com.docker.compose.service"}}' "$cid")")"
  actual_image_ref="$(trim "$(read_container_field '{{.Config.Image}}' "$cid")")"
  actual_image_id="$(trim "$(read_container_field '{{.Image}}' "$cid")")"
  actual_operation="$(trim "$(read_container_field "{{index .Config.Labels \"$one_shot_operation_label\"}}" "$cid")")"

  [[ "$actual_id" == "$cid" ]] || return 1
  [[ "$actual_name" == "$one_shot_name" ]] || return 1
  [[ "$actual_project" == "$compose_project" ]] || return 1
  [[ "$actual_service" == "app-server" ]] || return 1
  [[ "$actual_image_ref" == "$app_image" ]] || return 1
  [[ "$actual_image_id" == "$app_image_id" ]] || return 1
  [[ "$actual_operation" == "$operation_id" ]] || return 1
}

discover_one_shot_by_operation() {
  local output line candidate="" count=0

  [[ "$operation_id" =~ ^[0-9a-f]{32}$ ]] || return 1
  if ! output="$(docker ps -aq --no-trunc --filter "label=$one_shot_operation_label=$operation_id" 2>/dev/null)"; then
    return 1
  fi
  while IFS= read -r line; do
    line="$(trim "$line")"
    [[ -z "$line" ]] && continue
    [[ "$line" =~ ^[0-9a-f]{64}$ ]] || return 1
    candidate="$line"
    count=$((count + 1))
  done <<<"$output"
  [[ "$count" -le 1 ]] || return 1
  [[ "$count" -eq 1 ]] || return 1
  one_shot_cid="$candidate"
  verify_one_shot_identity "$one_shot_cid" || return 1
  one_shot_identity_verified=1
}

clear_one_shot_tracking() {
  one_shot_cid=""
  one_shot_name=""
  one_shot_identity_verified=0
  operation_id=""
}

confirm_verified_one_shot_absent() {
  local output line count=0

  [[ "${one_shot_identity_verified:-0}" -eq 1 ]] || return 1
  [[ "$operation_id" =~ ^[0-9a-f]{32}$ ]] || return 1
  if ! output="$(docker ps -aq --no-trunc --filter "label=$one_shot_operation_label=$operation_id" 2>/dev/null)"; then
    return 1
  fi
  while IFS= read -r line; do
    line="$(trim "$line")"
    [[ -z "$line" ]] && continue
    [[ "$line" =~ ^[0-9a-f]{64}$ ]] || return 1
    count=$((count + 1))
  done <<<"$output"
  [[ "$count" -eq 0 ]] || return 1
  clear_one_shot_tracking
}

ensure_one_shot_cleanup_identity() {
  if [[ "${one_shot_identity_verified:-0}" -eq 1 ]]; then
    if ! docker inspect "$one_shot_cid" >/dev/null 2>&1; then
      confirm_verified_one_shot_absent
      return
    fi
    if verify_one_shot_identity "$one_shot_cid"; then
      return 0
    fi
    # --rm may delete the already verified one-shot between Docker inspect calls.
    # An existing identity mismatch remains fail-closed; only proven absence is clean.
    confirm_verified_one_shot_absent
    return
  fi
  if [[ -n "${one_shot_cid:-}" ]] && docker inspect "$one_shot_cid" >/dev/null 2>&1; then
    verify_one_shot_identity "$one_shot_cid" || return 1
    one_shot_identity_verified=1
    return 0
  fi
  discover_one_shot_by_operation
}

best_effort_remove_one_shot() {
  local container_ref
  [[ -n "${operation_id:-}" || -n "${one_shot_cid:-}" ]] || return 0
  ensure_one_shot_cleanup_identity || return 1
  container_ref="${one_shot_cid:-}"
  [[ -n "$container_ref" ]] || return 0
  if ! docker inspect "$container_ref" >/dev/null 2>&1; then
    confirm_verified_one_shot_absent
    return
  fi
  if ! verify_one_shot_identity "$container_ref"; then
    confirm_verified_one_shot_absent
    return
  fi
  docker stop --time 10 "$container_ref" >/dev/null 2>&1 || true
  if docker inspect "$container_ref" >/dev/null 2>&1; then
    if ! verify_one_shot_identity "$container_ref"; then
      confirm_verified_one_shot_absent
      return
    fi
    docker rm --force "$container_ref" >/dev/null 2>&1 || true
  fi
  confirm_verified_one_shot_absent
}

cleanup() {
  local status=$?
  local container_cleanup_failed=0
  local advisory_release_failed=0
  local lock_release_failed=0
  trap - EXIT INT TERM HUP
  if ! best_effort_remove_one_shot >/dev/null 2>&1; then
    container_cleanup_failed=1
  fi
  APP_ADMIN_PASSWORD=""
  admin_password=""
  unset APP_ADMIN_PASSWORD || true
  if [[ "$container_cleanup_failed" -eq 1 ]]; then
    [[ -z "${env_snapshot:-}" ]] || rm -f "$env_snapshot"
    [[ -z "${normalized_env:-}" ]] || rm -f "$normalized_env"
    [[ -z "${normalized_env_after:-}" ]] || rm -f "$normalized_env_after"
    echo "[bootstrap-production-admin] ERROR: 一次性 bootstrap 容器发现、身份复核或清理不确定；保留 PostgreSQL advisory/file lock 现场，禁止重试；operation_id=${operation_id:-unknown} expected_name=${one_shot_name:-unknown} candidate_cid=${one_shot_cid:-unknown} application_name=${advisory_application_name:-unknown} backend_pid=${advisory_backend_pid:-unknown}" >&2
    exit 1
  fi
  if ! release_database_advisory_lock; then
    advisory_release_failed=1
  fi
  [[ -z "${env_snapshot:-}" ]] || rm -f "$env_snapshot"
  [[ -z "${normalized_env:-}" ]] || rm -f "$normalized_env"
  [[ -z "${normalized_env_after:-}" ]] || rm -f "$normalized_env_after"
  if [[ "$advisory_release_failed" -eq 1 ]]; then
    echo "[bootstrap-production-admin] ERROR: PostgreSQL admin bootstrap advisory lock 无法证明已释放；保留 file lock 现场，禁止重试；application_name=${advisory_application_name:-unknown} backend_pid=${advisory_backend_pid:-unknown}" >&2
    exit 1
  fi
  if ! release_bootstrap_lock; then
    lock_release_failed=1
  fi
  if [[ "$status" -eq 0 && "$lock_release_failed" -eq 1 ]]; then
    echo "[bootstrap-production-admin] ERROR: admin bootstrap lock owner 已变化或无法安全释放；保留锁现场" >&2
    status=1
  fi
  exit "$status"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

# 先捕获到未导出的 shell 变量并立即清除宿主环境；任何后续子进程都不继承 secret。
admin_password="${APP_ADMIN_PASSWORD:-}"
export -n admin_password 2>/dev/null || true
unset APP_ADMIN_PASSWORD

root_dir="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
compose_dir="server/deploy/compose/prod"
compose_override=""
env_file=""
expected_database=""
expected_migration=""
expected_release=""
confirmation=""
timeout_seconds=120
env_snapshot=""
normalized_env=""
normalized_env_after=""
one_shot_cid=""
one_shot_name=""
one_shot_identity_verified=0
one_shot_operation_label="erp.plush.admin-bootstrap.operation"
operation_id=""
app_image_id=""
bootstrap_committed=0
bootstrap_lock_acquired=0
bootstrap_lock_dir=""
bootstrap_lock_owner_file=""
bootstrap_lock_token=""
advisory_lock_acquired=0
advisory_lock_input_open=0
advisory_lock_pid=""
advisory_backend_pid=""
advisory_application_name=""
advisory_lock_runtime_dir=""
advisory_lock_input=""
advisory_lock_output=""
advisory_lock_error=""

while [[ $# -gt 0 ]]; do
  case "$1" in
  --env-file)
    env_file="${2:-}"
    shift 2
    ;;
  --compose-dir)
    compose_dir="${2:-}"
    shift 2
    ;;
  --compose-override)
    compose_override="${2:-}"
    shift 2
    ;;
  --expected-database)
    expected_database="${2:-}"
    shift 2
    ;;
  --expected-migration)
    expected_migration="${2:-}"
    shift 2
    ;;
  --expected-release)
    expected_release="${2:-}"
    shift 2
    ;;
  --confirm)
    confirmation="${2:-}"
    shift 2
    ;;
  --timeout-seconds)
    timeout_seconds="${2:-}"
    shift 2
    ;;
  -h | --help)
    print_help
    exit 0
    ;;
  *)
    fail "不支持的参数: $1"
    ;;
  esac
done

cd "$root_dir"

[[ -n "$env_file" ]] || fail "必须传入 --env-file"
[[ -f "$env_file" ]] || fail "env 文件不存在或不是普通文件"
[[ ! -L "$env_file" ]] || fail "env 文件不得是符号链接"
[[ -r "$env_file" ]] || fail "env 文件不可读"
[[ -d "$compose_dir" ]] || fail "Compose 目录不存在"

env_mode="$(path_mode "$env_file")"
[[ "$env_mode" =~ ^[0-7]{3,4}$ ]] || fail "无法读取 env 文件权限"
env_permissions=$((8#$env_mode))
(((env_permissions & 077) == 0)) || fail "env 文件不得向 group/other 开放权限"

[[ "$expected_database" =~ ^[A-Za-z0-9_]+$ ]] || fail "--expected-database 必须是稳定数据库名"
[[ "$expected_migration" =~ ^[0-9]{14}$ ]] || fail "--expected-migration 必须是 14 位 Atlas version"
[[ "$expected_release" =~ ^[0-9a-f]{40}$ ]] || fail "--expected-release 必须是 40 位小写 Git SHA"
[[ "$timeout_seconds" =~ ^[0-9]+$ && "$timeout_seconds" -ge 1 && "$timeout_seconds" -le 300 ]] || fail "--timeout-seconds 必须在 1 到 300 之间"

[[ -n "$admin_password" ]] || fail "必须通过环境变量 APP_ADMIN_PASSWORD 临时注入密码"
[[ "$admin_password" != "adminadmin" ]] || fail "APP_ADMIN_PASSWORD 不得使用本地开发默认密码"
if grep -Eiq '(change-this|placeholder|replace-with|<release-tag>)' <<<"$admin_password"; then
  fail "APP_ADMIN_PASSWORD 仍包含 placeholder"
fi
admin_password_chars="$(utf8_codepoint_count "$admin_password")"
admin_password_bytes="$(byte_count "$admin_password")"
[[ "$admin_password_chars" -ge 8 && "$admin_password_chars" -le 20 ]] || fail "APP_ADMIN_PASSWORD 必须为 8 到 20 字符"
[[ "$admin_password_bytes" -le 72 ]] || fail "APP_ADMIN_PASSWORD UTF-8 编码后不得超过 72 字节"

env_fingerprint_before="$(cksum <"$env_file")"
env_snapshot="$(mktemp)"
cp "$env_file" "$env_snapshot"
[[ "$(cksum <"$env_snapshot")" == "$env_fingerprint_before" ]] || fail "env 文件在创建受控快照时发生变化"
[[ "$(cksum <"$env_file")" == "$env_fingerprint_before" ]] || fail "env 文件在创建受控快照时发生变化"
normalized_env="$(mktemp)"
normalize_env_file "$env_snapshot" "$normalized_env"

for key in PROJECT_SLUG APP_IMAGE POSTGRES_DSN POSTGRES_DB POSTGRES_USER MIGRATION_LOCK_FILE APP_ADMIN_USERNAME BOOTSTRAP_ADMIN_ONCE ERP_ALLOW_CUSTOMER_TRIAL_CONFIG ERP_CUSTOMER_TRIAL_TARGET; do
  require_single_env_key "$key" "$normalized_env"
done
[[ "$(env_key_count APP_ADMIN_PASSWORD "$normalized_env")" -eq 0 ]] || fail "steady env 文件不得声明 APP_ADMIN_PASSWORD，包括空值"

project_slug="$(env_value_of PROJECT_SLUG "$normalized_env")"
app_image="$(env_value_of APP_IMAGE "$normalized_env")"
postgres_dsn="$(env_value_of POSTGRES_DSN "$normalized_env")"
postgres_db="$(env_value_of POSTGRES_DB "$normalized_env")"
postgres_user="$(env_value_of POSTGRES_USER "$normalized_env")"
migration_lock_file="$(env_value_of MIGRATION_LOCK_FILE "$normalized_env")"
admin_username="$(env_value_of APP_ADMIN_USERNAME "$normalized_env")"
bootstrap_once="$(env_value_of BOOTSTRAP_ADMIN_ONCE "$normalized_env" | tr '[:upper:]' '[:lower:]')"
erp_allow_customer_trial_config="$(env_value_of ERP_ALLOW_CUSTOMER_TRIAL_CONFIG "$normalized_env")"
erp_customer_trial_target="$(env_value_of ERP_CUSTOMER_TRIAL_TARGET "$normalized_env")"

[[ "$project_slug" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail "PROJECT_SLUG 必须是稳定小写 key"
[[ "$admin_username" =~ ^[A-Za-z0-9._-]+$ ]] || fail "APP_ADMIN_USERNAME 必须是稳定无空白 key"
[[ "$bootstrap_once" == "false" ]] || fail "steady env 的 BOOTSTRAP_ADMIN_ONCE 必须为 false"
[[ "$erp_allow_customer_trial_config" == "0" || "$erp_allow_customer_trial_config" == "1" ]] || fail "ERP_ALLOW_CUSTOMER_TRIAL_CONFIG 必须显式为 0 或 1"
[[ "$postgres_db" == "$expected_database" ]] || fail "POSTGRES_DB 与 --expected-database 不一致"
postgres_dsn_pattern="^postgres(ql)?://([^:/?#@]+):([^/?#@]+)@postgres:5432/${expected_database}\\?sslmode=disable$"
[[ "$postgres_dsn" =~ $postgres_dsn_pattern ]] || fail "POSTGRES_DSN 必须精确为单一 postgres[ql]://user:pass@postgres:5432/$expected_database?sslmode=disable，禁止额外 query、multi-host 或 fallback"
dsn_user="${BASH_REMATCH[2]}"
[[ "$dsn_user" == "$postgres_user" ]] || fail "POSTGRES_DSN user 与 POSTGRES_USER 不一致"

expected_confirmation="BOOTSTRAP_PRODUCTION_ADMIN:${project_slug}:${expected_database}:${admin_username}:${expected_migration}:${expected_release}"
[[ "$confirmation" == "$expected_confirmation" ]] || fail "确认串不匹配；必须传入 --confirm $expected_confirmation"

while IFS='=' read -r key _value; do
  if printenv "$key" >/dev/null 2>&1; then
    fail "宿主环境不得覆盖 steady env 变量: $key"
  fi
done <"$normalized_env"

for key in COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_PROFILES COMPOSE_ENV_FILES COMPOSE_PATH_SEPARATOR DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH ERP_ALLOW_LOCAL_TEST_CUSTOMER_CONFIG ERP_ALLOW_TEST_DB_AS_DEV ERP_ROLE_DEMO_PASSWORD; do
  if printenv "$key" >/dev/null 2>&1; then
    fail "bootstrap 环境不得设置目标覆盖变量: $key"
  fi
done

compose_file="$compose_dir/compose.yml"
trial_compose_override="$compose_dir/compose.customer-trial-133.yml"
preflight_script="$root_dir/scripts/deploy/production-preflight.sh"
[[ -f "$compose_file" ]] || fail "Compose 文件不存在"
compose_project_source="$compose_file"
if [[ "$erp_allow_customer_trial_config" == "1" ]]; then
  [[ "$erp_customer_trial_target" == "customer-trial-133" ]] || fail "远端验收客户配置只允许 target=customer-trial-133"
  [[ -n "$compose_override" ]] || fail "customer-trial-133 必须显式传入 --compose-override $trial_compose_override"
  [[ -f "$compose_override" && ! -L "$compose_override" ]] || fail "customer-trial-133 Compose override 不存在、不是普通文件或是符号链接"
  compose_override_real="$(cd "$(dirname "$compose_override")" && printf '%s/%s' "$(pwd -P)" "$(basename "$compose_override")")"
  trial_compose_override_real="$(cd "$(dirname "$trial_compose_override")" && printf '%s/%s' "$(pwd -P)" "$(basename "$trial_compose_override")")"
  [[ "$compose_override_real" == "$trial_compose_override_real" ]] || fail "customer-trial-133 只能使用受控 Compose override: $trial_compose_override"
  compose_override_contract="$(awk '
    {
      line = $0
      sub(/^[[:space:]]+/, "", line)
      sub(/[[:space:]]+$/, "", line)
      if (line != "" && line !~ /^#/) print line
    }
  ' "$compose_override")"
  [[ "$compose_override_contract" == "name: plush-toy-erp-v5" ]] || fail "customer-trial-133 Compose override 只能声明 name: plush-toy-erp-v5"
  compose_project_source="$compose_override"
else
  [[ -z "$erp_customer_trial_target" ]] || fail "ERP_ALLOW_CUSTOMER_TRIAL_CONFIG=0 时 ERP_CUSTOMER_TRIAL_TARGET 必须为空"
  [[ -z "$compose_override" ]] || fail "非 customer-trial-133 运行禁止传入 Compose override"
fi
compose_project_count="$(awk '/^name:[[:space:]]*/ { count++ } END { print count + 0 }' "$compose_project_source")"
[[ "$compose_project_count" -eq 1 ]] || fail "Compose 必须且只能声明一个顶层 name"
compose_project="$(awk '/^name:[[:space:]]*/ { sub(/^name:[[:space:]]*/, ""); print; exit }' "$compose_project_source")"
compose_project="$(trim "$compose_project")"
[[ "$compose_project" =~ ^[a-z0-9][a-z0-9_-]{0,63}$ ]] || fail "Compose 顶层 name 必须是稳定的小写 project key"
if [[ "$erp_allow_customer_trial_config" == "1" ]]; then
  [[ "$compose_project" == "plush-toy-erp-v5" && "$project_slug" == "$compose_project" ]] || fail "customer-trial-133 的 PROJECT_SLUG 与 Compose project 必须同为 plush-toy-erp-v5"
fi
migration_lock_dir="$(dirname "$migration_lock_file")"
acquire_bootstrap_lock "$migration_lock_dir" "$compose_project" "$expected_database"
compose_files=("$compose_file")
[[ -z "$compose_override" ]] || compose_files+=("$compose_override")
for current_compose_file in "${compose_files[@]}"; do
  if grep -Eq '^[[:space:]]+APP_ADMIN_PASSWORD[[:space:]]*:' "$current_compose_file"; then
    fail "Compose steady app-server 不得映射 APP_ADMIN_PASSWORD"
  fi
done
[[ -x "$preflight_script" ]] || fail "production preflight 不存在或不可执行"
command -v docker >/dev/null 2>&1 || fail "缺少 docker"
docker compose -p "$compose_project" version >/dev/null 2>&1 || fail "需要 Docker Compose v2"

preflight_args=(--env-file "$env_snapshot" --compose-dir "$compose_dir")
[[ -z "$compose_override" ]] || preflight_args+=(--compose-override "$compose_override")
bash "$preflight_script" "${preflight_args[@]}"

compose_cmd=(docker compose -p "$compose_project" --env-file "$env_snapshot" -f "$compose_file")
[[ -z "$compose_override" ]] || compose_cmd+=(-f "$compose_override")

image_env="$(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$app_image" 2>/dev/null || true)"
image_release="$(printf '%s\n' "$image_env" | awk -F= '$1 == "GIT_SHA" { value = $0; sub(/^[^=]*=/, "", value) } END { print value }')"
[[ "$image_release" == "$expected_release" ]] || fail "APP_IMAGE 的 GIT_SHA 与 --expected-release 不一致"
app_image_id="$(docker image inspect --format '{{.Id}}' "$app_image" 2>/dev/null || true)"
app_image_id="$(trim "$app_image_id")"
[[ "$app_image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "APP_IMAGE content id 无效"

postgres_cid="$("${compose_cmd[@]}" ps -q postgres 2>/dev/null | head -n1 || true)"
[[ -n "$postgres_cid" ]] || fail "PostgreSQL Compose 服务未运行"
postgres_compose_project="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$postgres_cid" 2>/dev/null || true)"
postgres_compose_project="$(trim "$postgres_compose_project")"
[[ "$postgres_compose_project" == "$compose_project" ]] || fail "PostgreSQL 容器的 Compose project label 与目标不一致"
postgres_container_name="$(docker inspect --format '{{.Name}}' "$postgres_cid" 2>/dev/null || true)"
postgres_container_name="$(trim "$postgres_container_name")"
postgres_container_name="${postgres_container_name#/}"
[[ "$postgres_container_name" == "${project_slug}-postgres" ]] || fail "PostgreSQL 容器名必须精确为 ${project_slug}-postgres"
postgres_state="$(docker inspect --format '{{.State.Status}}' "$postgres_cid" 2>/dev/null || true)"
postgres_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$postgres_cid" 2>/dev/null || true)"
[[ "$postgres_state" == "running" && "$postgres_health" == "healthy" ]] || fail "PostgreSQL Compose 服务必须 running/healthy"

running_app_cid="$("${compose_cmd[@]}" ps -q app-server 2>/dev/null | head -n1 || true)"
[[ -z "$running_app_cid" ]] || fail "正式 bootstrap 前必须停止常驻 app-server"

# shellcheck disable=SC2016 # POSTGRES_DB 必须在 postgres 容器内展开。
runtime_postgres_db="$("${compose_cmd[@]}" exec -T postgres sh -ceu 'printf "%s" "$POSTGRES_DB"' 2>/dev/null || true)"
[[ "$runtime_postgres_db" == "$expected_database" ]] || fail "PostgreSQL 容器运行态 POSTGRES_DB 与目标不一致"

run_psql() {
  "${compose_cmd[@]}" exec -T postgres \
    psql -X -A -t -v ON_ERROR_STOP=1 \
    -U "$postgres_user" -d "$postgres_db" \
    -v "admin_username=$admin_username" "$@"
}

acquire_database_advisory_lock "$compose_project" "$expected_database"

current_database="$(read_scalar 'SELECT current_database();' || true)"
[[ "$current_database" == "$expected_database" ]] || fail "数据库连接读回的 current_database 与目标不一致"

schema_status="$(read_scalar "SELECT CASE WHEN to_regclass('public.admin_users') IS NOT NULL AND to_regclass('public.roles') IS NOT NULL AND to_regclass('public.permissions') IS NOT NULL AND to_regclass('public.role_permissions') IS NOT NULL AND to_regclass('public.runtime_markers') IS NOT NULL AND to_regclass('public.runtime_audit_events') IS NOT NULL AND to_regclass('atlas_schema_revisions.atlas_schema_revisions') IS NOT NULL THEN 'ready' ELSE 'missing' END;" || true)"
[[ "$schema_status" == "ready" ]] || fail "目标数据库缺少已迁移的 bootstrap/RBAC/Atlas 表"

current_migration="$(read_scalar 'SELECT version FROM atlas_schema_revisions.atlas_schema_revisions WHERE type = 2 ORDER BY executed_at DESC LIMIT 1;' || true)"
[[ "$current_migration" == "$expected_migration" ]] || fail "数据库 Atlas current version 与 --expected-migration 不一致"

marker_count="$(read_scalar "SELECT count(*) FROM runtime_markers WHERE marker_key = 'admin_bootstrap.completed';" || true)"
[[ "$marker_count" == "0" ]] || fail "admin bootstrap marker 已存在，禁止重复执行"
admin_count="$(read_scalar "SELECT count(*) FROM admin_users WHERE username = :'admin_username';" || true)"
[[ "$admin_count" == "0" ]] || fail "目标管理员用户名已存在，禁止自动提权或覆盖"
audit_before="$(read_scalar 'SELECT COALESCE(max(id), 0) FROM runtime_audit_events;' || true)"
[[ "$audit_before" =~ ^[0-9]+$ ]] || fail "无法读取 bootstrap 前 audit 边界"

ensure_database_advisory_lock_held
operation_id="$(generate_operation_id)"
one_shot_name="${project_slug}-admin-bootstrap-${operation_id}"
one_shot_status=0
one_shot_cid="$(APP_ADMIN_PASSWORD="$admin_password" "${compose_cmd[@]}" run -d -T --no-deps --rm --pull never \
  --name "$one_shot_name" \
  --label "$one_shot_operation_label=$operation_id" \
  -e APP_ADMIN_PASSWORD \
  -e BOOTSTRAP_ADMIN_ONCE=true \
  app-server 2>/dev/null)" || one_shot_status=$?
admin_password=""
if [[ "$one_shot_status" -ne 0 ]]; then
  fail "一次性 app-server bootstrap 容器启动失败"
fi
one_shot_cid="$(trim "$one_shot_cid")"
if [[ ! "$one_shot_cid" =~ ^[0-9a-f]{64}$ ]]; then
  one_shot_cid=""
  fail "一次性 bootstrap 容器未返回有效 container id"
fi
if ! verify_one_shot_identity "$one_shot_cid"; then
  fail "一次性 bootstrap 容器身份与 CID/name/project/service/image/operation 合同不一致，拒绝接管或清理"
fi
one_shot_identity_verified=1

# Secret 已只进入受控 one-shot 单进程，宿主变量已清空。

deadline=$((SECONDS + timeout_seconds))
while true; do
  ensure_database_advisory_lock_held
  marker_count="$(read_scalar "SELECT count(*) FROM runtime_markers WHERE marker_key = 'admin_bootstrap.completed';" || true)"
  if [[ "$marker_count" == "1" ]]; then
    bootstrap_committed=1
    break
  fi
  [[ "$marker_count" == "0" ]] || fail "admin bootstrap marker 数量异常"
  container_running="$(docker inspect --format '{{.State.Running}}' "$one_shot_cid" 2>/dev/null || true)"
  [[ "$container_running" == "true" ]] || fail "一次性 app-server 在 marker 提交前退出"
  ((SECONDS < deadline)) || fail "等待 admin bootstrap marker 超时"
  sleep 1
done

ensure_database_advisory_lock_held

exact_marker_count="$(read_scalar "SELECT count(*) FROM runtime_markers WHERE marker_key = 'admin_bootstrap.completed' AND marker_value::jsonb->>'username' = :'admin_username' AND COALESCE(marker_value::jsonb->>'completed_at', '') <> '';" || true)"
[[ "$exact_marker_count" == "1" ]] || fail "admin bootstrap marker payload 读回失败"

admin_count="$(read_scalar "SELECT count(*) FROM admin_users WHERE username = :'admin_username';" || true)"
eligible_admin_count="$(read_scalar "SELECT count(*) FROM admin_users WHERE username = :'admin_username' AND is_super_admin IS TRUE AND disabled IS FALSE AND password_hash <> '';" || true)"
[[ "$admin_count" == "1" && "$eligible_admin_count" == "1" ]] || fail "bootstrap 管理员状态读回失败"

completed_audit_count="$(read_scalar "SELECT count(*) FROM runtime_audit_events WHERE id > $audit_before AND event_type = 'admin_bootstrap.completed' AND event_key = 'admin_bootstrap.completed' AND source = 'server_bootstrap' AND payload::jsonb->>'username' = :'admin_username' AND payload::jsonb->>'marker_key' = 'admin_bootstrap.completed';" || true)"
[[ "$completed_audit_count" == "1" ]] || fail "admin bootstrap completed audit 读回失败"
blocked_audit_count="$(read_scalar "SELECT count(*) FROM runtime_audit_events WHERE id > $audit_before AND event_type = 'admin_bootstrap.blocked';" || true)"
[[ "$blocked_audit_count" == "0" ]] || fail "本次 bootstrap 产生 blocked audit"
completed_audit_id="$(read_scalar "SELECT id FROM runtime_audit_events WHERE id > $audit_before AND event_type = 'admin_bootstrap.completed' AND event_key = 'admin_bootstrap.completed' ORDER BY id DESC LIMIT 1;" || true)"
[[ "$completed_audit_id" =~ ^[0-9]+$ && "$completed_audit_id" -gt "$audit_before" ]] || fail "admin bootstrap completed audit id 无效"

builtin_permission_count="$(read_scalar 'SELECT count(*) FROM permissions WHERE builtin IS TRUE;' || true)"
builtin_role_count="$(read_scalar 'SELECT count(*) FROM roles WHERE builtin IS TRUE;' || true)"
role_permission_count="$(read_scalar 'SELECT count(*) FROM role_permissions;' || true)"
[[ "$builtin_permission_count" =~ ^[0-9]+$ && "$builtin_permission_count" -gt 0 ]] || fail "内置 permission 未完成初始化"
[[ "$builtin_role_count" =~ ^[0-9]+$ && "$builtin_role_count" -gt 0 ]] || fail "内置 role 未完成初始化"
[[ "$role_permission_count" =~ ^[0-9]+$ && "$role_permission_count" -gt 0 ]] || fail "内置 role permission 未完成初始化"

if ! best_effort_remove_one_shot; then
  fail "一次性 bootstrap 容器无法清理"
fi

if ! release_database_advisory_lock; then
  fail "PostgreSQL admin bootstrap advisory lock 无法证明已释放；保留 file lock 现场，禁止重试"
fi

env_fingerprint_after="$(cksum <"$env_file")"
[[ "$env_fingerprint_after" == "$env_fingerprint_before" ]] || fail "steady env 文件在 bootstrap 窗口发生变化"
normalized_env_after="$(mktemp)"
normalize_env_file "$env_file" "$normalized_env_after"
[[ "$(env_key_count APP_ADMIN_PASSWORD "$normalized_env_after")" -eq 0 ]] || fail "bootstrap 后 steady env 仍声明 APP_ADMIN_PASSWORD"
require_single_env_key BOOTSTRAP_ADMIN_ONCE "$normalized_env_after"
[[ "$(env_value_of BOOTSTRAP_ADMIN_ONCE "$normalized_env_after" | tr '[:upper:]' '[:lower:]')" == "false" ]] || fail "bootstrap 后 steady env 的 BOOTSTRAP_ADMIN_ONCE 不是 false"

if ! release_bootstrap_lock; then
  fail "admin bootstrap lock owner 已变化或无法安全释放；保留锁现场"
fi

echo "[bootstrap-production-admin] status=complete database=$expected_database username=$admin_username migration=$expected_migration release=$expected_release marker=admin_bootstrap.completed audit_id=$completed_audit_id builtin_permissions=$builtin_permission_count builtin_roles=$builtin_role_count role_permissions=$role_permission_count"
