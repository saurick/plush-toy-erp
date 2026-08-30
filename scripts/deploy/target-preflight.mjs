import { realpathSync } from "node:fs";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { getDeploymentTarget } from "./deployment-targets.mjs";

export const TARGET_PREFLIGHT_CONTRACT = "plush.target-preflight/v1";
export const REMOTE_TARGET_PREFLIGHT_CONTRACT =
  "plush.remote-target-preflight/v1";

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SAFE_TEXT_PATTERN = /^[A-Za-z0-9._-]+$/u;
const BLOCKER_PATTERN = /^[a-z][a-z0-9_]{2,63}$/u;
const REPORT_KEYS = Object.freeze([
  "SCHEMA_VERSION",
  "STATUS",
  "TARGET",
  "HOSTNAME",
  "USER",
  "ROOT_AVAILABLE_BYTES",
  "MINIMUM_AVAILABLE_BYTES",
  "CAPACITY_STATUS",
  "ENV_STATUS",
  "RESOURCE_IDENTITY_STATUS",
  "COMPOSE_STATUS",
  "DATABASE_STATUS",
  "DATABASE_NAME",
  "MIGRATION_VERSION",
  "ACTIVE_CONFIG_REVISION",
  "ACTIVE_CONFIG_PRODUCT_VERSION",
  "ACTIVE_DATASET_VERSION",
  "DEBUG_ENV",
  "DEBUG_SEED_ENABLED",
  "DEBUG_SEED_ALLOWED",
  "DEBUG_CLEANUP_ENABLED",
  "DEBUG_CLEANUP_ALLOWED",
  "DEBUG_BUSINESS_CLEAR_ENABLED",
  "DEBUG_BUSINESS_CLEAR_ALLOWED",
  "SERVER_SHA",
  "WEB_SHA",
  "SERVER_HEALTH",
  "SERVER_READY",
  "WEB_HEALTH",
  "PUBLIC_ENTRY_STATUS",
  "PUBLIC_CONTAINER",
  "PUBLIC_SHA",
  "PUBLIC_HEALTH",
  "PUBLIC_PROVIDER",
  "MIGRATION_LOCK_STATUS",
  "BACKUP_TOOLING_STATUS",
  "ARCHIVE_TOOLING_STATUS",
  "LATEST_BACKUP_SHA256",
  "LATEST_BACKUP_SIZE_BYTES",
  "RELEASE_DIRECTORY_COUNT",
  "IDENTIFIED_RELEASE_COUNT",
  "PROTECTED_RELEASE_COUNT",
  "RETENTION_CANDIDATE_COUNT",
  "RETENTION_CANDIDATE_BYTES",
  "RETENTION_CANDIDATE_SHAS",
  "MANUAL_REVIEW_RELEASE_COUNT",
  "FORMAL_CACHE_COUNT",
  "OPERATION_DIRECTORY_COUNT",
  "RETAINED_OPERATION_COUNT",
  "STOPPED_PUBLIC_CONTAINER_COUNT",
  "RETENTION_MODE",
  "BLOCKERS",
]);

// This script is streamed over an already-pinned SSH connection. It contains
// the complete target contract and accepts no remote path, project, database,
// endpoint or command input.
const REMOTE_TARGET_PREFLIGHT_SCRIPT_TEMPLATE = String.raw`#!/usr/bin/env bash
set -euo pipefail
umask 077

target_key=__TARGET_KEY__
expected_hostname=__EXPECTED_HOSTNAME__
expected_user=__EXPECTED_USER__
root=__ROOT__
current=__CURRENT__
releases=__RELEASES__
cache_root=__ROOT__/release-cache
operations_root=__OPERATION_ROOT__
incoming_root=__ROOT__/incoming
runtime_env=__RUNTIME_ENV__
compose_dir=__CURRENT__/server/deploy/compose/prod
compose_base="$compose_dir/compose.yml"
compose_override="$compose_dir/__COMPOSE_OVERRIDE__"
project=__PROJECT__
database=__DATABASE__
trial_target=__TRIAL_TARGET__
migration_lock=__MIGRATION_LOCK__
postgres_bind=__POSTGRES_BIND__
postgres_port=__POSTGRES_PORT__
postgres_data_directory=__POSTGRES_DATA_DIRECTORY__
app_bind=__APP_BIND__
app_port=__APP_PORT__
web_bind=__WEB_BIND__
web_port=__WEB_PORT__
jaeger_bind=__JAEGER_BIND__
jaeger_5775_port=__JAEGER_5775_PORT__
jaeger_6831_port=__JAEGER_6831_PORT__
jaeger_6832_port=__JAEGER_6832_PORT__
jaeger_5778_port=__JAEGER_5778_PORT__
jaeger_ui_port=__JAEGER_UI_PORT__
jaeger_14268_port=__JAEGER_14268_PORT__
jaeger_14250_port=__JAEGER_14250_PORT__
jaeger_9411_port=__JAEGER_9411_PORT__
jaeger_otlp_grpc_port=__JAEGER_OTLP_GRPC_PORT__
jaeger_otlp_http_port=__JAEGER_OTLP_HTTP_PORT__
minimum_available_bytes=__MINIMUM_AVAILABLE_BYTES__
public_endpoint=__PUBLIC_ENDPOINT__
public_network=__PUBLIC_NETWORK__
public_container_prefix=__PUBLIC_CONTAINER_PREFIX__
public_host_port=__PUBLIC_HOST_PORT__
server_endpoint=__SERVER_ENDPOINT__
web_endpoint=__WEB_ENDPOINT__
server_container="\${project}-server"
web_container="\${project}-web-desktop"
trial_atlas_bin=__ROOT__/tools/atlas/v1.2.0/atlas
trial_atlas_required_version=v1.2.0

status=passed
blockers=()
capacity_status=passed
env_status=passed
resource_identity_status=passed
compose_status=passed
database_status=passed
migration_version=unknown
active_config_revision=unknown
active_config_product_version=unknown
active_dataset_version=unknown
debug_env=unknown
debug_seed_enabled=unknown
debug_seed_allowed=unknown
debug_cleanup_enabled=unknown
debug_cleanup_allowed=unknown
debug_business_clear_enabled=unknown
debug_business_clear_allowed=unknown
server_sha=unknown
web_sha=unknown
server_health=failed
server_ready=failed
web_health=failed
public_entry_status=blocked
public_container=unknown
public_sha=unknown
public_health=failed
public_provider=failed
migration_lock_status=free
backup_tooling_status=passed
archive_tooling_status=passed
latest_backup_sha256=none
latest_backup_size_bytes=0
release_directory_count=0
identified_release_count=0
protected_release_count=0
retention_candidate_count=0
retention_candidate_bytes=0
retention_candidate_shas=none
manual_review_release_count=0
formal_cache_count=0
operation_directory_count=0
retained_operation_count=0
stopped_public_container_count=0
retention_mode=preview_only
# Read-only preflight never creates or reuses a rollback point. Every promotion
# still requires a fresh pre-migration backup bound to that operation.

block() {
  status=blocked
  blockers+=("$1")
}

plain_directory() {
  [[ -d "$1" && ! -L "$1" ]]
}

plain_file() {
  [[ -f "$1" && ! -L "$1" ]]
}

env_value() {
  local wanted="$1"
  awk -v wanted="$wanted" '
    {
      line=$0
      sub(/\r$/, "", line)
      sub(/^[[:space:]]+/, "", line)
      sub(/[[:space:]]+$/, "", line)
      if (line == "" || line ~ /^#/) next
      sub(/^export[[:space:]]+/, "", line)
      separator=index(line, "=")
      if (separator <= 1) next
      key=substr(line, 1, separator - 1)
      sub(/^[[:space:]]+/, "", key)
      sub(/[[:space:]]+$/, "", key)
      if (key != wanted) next
      value=substr(line, separator + 1)
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      print value
    }
  ' "$runtime_env"
}

actual_hostname="$(hostname)"
actual_user="$(id -un)"
[[ "$actual_hostname" == "$expected_hostname" ]] || block target_hostname_mismatch
[[ "$actual_user" == "$expected_user" ]] || block target_user_mismatch
if [[ ! -x /usr/bin/rsync ]] ||
  ! LC_ALL=C /usr/bin/rsync --version 2>/dev/null |
    sed -n '1p' | grep -Eq '^rsync[[:space:]]+version[[:space:]]+3\.'; then
  block target_rsync_unavailable
fi
if ! command -v zstd >/dev/null 2>&1 ||
  ! tar --help 2>/dev/null | grep -F -- '--zstd' >/dev/null; then
  archive_tooling_status=blocked
  block target_archive_tooling_unavailable
fi

for required_dir in "$root" "$current" "$releases" "$root/runtime" "$root/backups" "$root/run"; do
  plain_directory "$required_dir" || block target_directory_invalid
done
for required_file in "$runtime_env" "$compose_base" "$compose_override"; do
  plain_file "$required_file" || block target_file_invalid
done
if ! plain_file "$trial_atlas_bin" ||
  [[ ! -x "$trial_atlas_bin" ]] ||
  [[ "$(stat -c '%u' "$trial_atlas_bin" 2>/dev/null || true)" != "$(id -u)" ]]; then
  block target_atlas_tooling_invalid
elif ! "$trial_atlas_bin" version 2>&1 |
  grep -Eq "(^|[[:space:]])$trial_atlas_required_version([[:space:]]|$)"; then
  block target_atlas_tooling_invalid
fi

root_available_bytes="$(df -B1 --output=avail / | awk 'NR==2 {print $1}')"
[[ "$root_available_bytes" =~ ^[0-9]+$ ]] || {
  root_available_bytes=0
  block target_capacity_unknown
}
if (( root_available_bytes < minimum_available_bytes )); then
  capacity_status=blocked
  block target_disk_capacity_low
fi

if plain_file "$runtime_env"; then
  env_uid="$(stat -c '%u' "$runtime_env")"
  env_mode="$(stat -c '%a' "$runtime_env")"
  if [[ "$env_uid" != "$(id -u)" || "$env_mode" != 600 ]]; then
    env_status=blocked
    block target_runtime_env_invalid
  fi
  [[ "$(env_value PROJECT_SLUG)" == "$project" ]] || {
    env_status=blocked
    block target_project_mismatch
  }
  [[ "$(env_value ERP_CUSTOMER_KEY)" == yoyoosun ]] || {
    env_status=blocked
    block target_customer_mismatch
  }
  runtime_trial_target="$(env_value ERP_CUSTOMER_TRIAL_TARGET)"
  runtime_trial_enabled="$(env_value ERP_ALLOW_CUSTOMER_TRIAL_CONFIG)"
  if [[ "$trial_target" == none ]]; then
    [[ -z "$runtime_trial_target" && "$runtime_trial_enabled" == 0 ]] || {
      env_status=blocked
      block target_trial_identity_mismatch
    }
  elif [[ "$runtime_trial_target" != "$trial_target" || "$runtime_trial_enabled" != 1 ]]; then
    env_status=blocked
    block target_trial_identity_mismatch
  fi
  [[ "$(env_value POSTGRES_DB)" == "$database" ]] || {
    env_status=blocked
    database_status=blocked
    block target_database_mismatch
  }
  resource_identity_mismatch=0
  [[ "$(env_value POSTGRES_BIND_ADDR)" == "$postgres_bind" ]] || resource_identity_mismatch=1
  [[ "$(env_value POSTGRES_PORT)" == "$postgres_port" ]] || resource_identity_mismatch=1
  [[ "$(env_value POSTGRES_DATA_DIR)" == "$postgres_data_directory" ]] || resource_identity_mismatch=1
  [[ "$(env_value APP_HTTP_BIND_ADDR)" == "$app_bind" ]] || resource_identity_mismatch=1
  [[ "$(env_value APP_HTTP_PORT)" == "$app_port" ]] || resource_identity_mismatch=1
  [[ "$(env_value WEB_DESKTOP_BIND_ADDR)" == "$web_bind" ]] || resource_identity_mismatch=1
  [[ "$(env_value WEB_DESKTOP_PORT)" == "$web_port" ]] || resource_identity_mismatch=1
  [[ "$(env_value JAEGER_BIND_ADDR)" == "$jaeger_bind" ]] || resource_identity_mismatch=1
  [[ "$(env_value JAEGER_5775_PORT)" == "$jaeger_5775_port" ]] || resource_identity_mismatch=1
  [[ "$(env_value JAEGER_6831_PORT)" == "$jaeger_6831_port" ]] || resource_identity_mismatch=1
  [[ "$(env_value JAEGER_6832_PORT)" == "$jaeger_6832_port" ]] || resource_identity_mismatch=1
  [[ "$(env_value JAEGER_5778_PORT)" == "$jaeger_5778_port" ]] || resource_identity_mismatch=1
  [[ "$(env_value JAEGER_UI_PORT)" == "$jaeger_ui_port" ]] || resource_identity_mismatch=1
  [[ "$(env_value JAEGER_14268_PORT)" == "$jaeger_14268_port" ]] || resource_identity_mismatch=1
  [[ "$(env_value JAEGER_14250_PORT)" == "$jaeger_14250_port" ]] || resource_identity_mismatch=1
  [[ "$(env_value JAEGER_9411_PORT)" == "$jaeger_9411_port" ]] || resource_identity_mismatch=1
  [[ "$(env_value JAEGER_OTLP_GRPC_PORT)" == "$jaeger_otlp_grpc_port" ]] || resource_identity_mismatch=1
  [[ "$(env_value JAEGER_OTLP_HTTP_PORT)" == "$jaeger_otlp_http_port" ]] || resource_identity_mismatch=1
  if (( resource_identity_mismatch != 0 )); then
    env_status=blocked
    resource_identity_status=blocked
    block target_runtime_resource_mismatch
  fi
  if ! plain_directory "$postgres_data_directory"; then
    resource_identity_status=blocked
    block target_postgres_data_directory_invalid
  fi
  debug_env="$(env_value ERP_DEBUG_ENV)"
  debug_seed_enabled="$(env_value ERP_DEBUG_SEED_ENABLED)"
  debug_cleanup_enabled="$(env_value ERP_DEBUG_CLEANUP_ENABLED)"
  debug_business_clear_enabled="$(env_value ERP_DEBUG_BUSINESS_CLEAR_ENABLED)"
  if [[ "$debug_env" == prod &&
    "$debug_seed_enabled" == false &&
    "$debug_cleanup_enabled" == false &&
    "$debug_business_clear_enabled" == false ]]; then
    debug_seed_allowed=false
    debug_cleanup_allowed=false
    debug_business_clear_allowed=false
  else
    env_status=blocked
    block target_debug_capabilities_unsafe
  fi
else
  env_status=blocked
  resource_identity_status=blocked
fi

clean_env=(
  env -i
  "HOME=$HOME"
  "USER=$actual_user"
  "LOGNAME=$actual_user"
  "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
)
compose=(
  docker compose
  -p "$project"
  --env-file "$runtime_env"
  -f "$compose_base"
  -f "$compose_override"
)

if [[ "$env_status" == passed ]] &&
  "\${clean_env[@]}" "\${compose[@]}" config --quiet >/dev/null 2>&1; then
  :
else
  compose_status=blocked
  block target_compose_config_invalid
fi

inspect_container() {
  local name="$1"
  local expected_service="$2"
  local identity
  identity="$(docker inspect "$name" --format '{{.State.Running}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}' 2>/dev/null || true)"
  [[ "$identity" == "true|$project|$expected_service" ]]
}

read_git_sha() {
  local name="$1"
  docker inspect "$name" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null |
    sed -n 's/^GIT_SHA=//p' |
    head -n1
}

if inspect_container "$server_container" app-server; then
  server_sha="$(read_git_sha "$server_container")"
else
  compose_status=blocked
  block target_server_container_invalid
fi
if inspect_container "$web_container" web-desktop; then
  web_sha="$(read_git_sha "$web_container")"
else
  compose_status=blocked
  block target_web_container_invalid
fi
if [[ ! "$server_sha" =~ ^[0-9a-f]{40}$ || ! "$web_sha" =~ ^[0-9a-f]{40}$ || "$server_sha" != "$web_sha" ]]; then
  compose_status=blocked
  block target_runtime_sha_mismatch
fi

curl --fail --silent --show-error --max-time 5 "$server_endpoint/healthz" >/dev/null 2>&1 &&
  server_health=passed ||
  block target_server_health_failed
curl --fail --silent --show-error --max-time 5 "$server_endpoint/readyz" >/dev/null 2>&1 &&
  server_ready=passed ||
  block target_server_ready_failed
curl --fail --silent --show-error --max-time 5 "$web_endpoint/healthz" >/dev/null 2>&1 &&
  web_health=passed ||
  block target_web_health_failed

public_containers="$(
  docker ps --format '{{.Names}}' 2>/dev/null |
    grep -E "^\${public_container_prefix}[0-9a-f]{8}$" || true
)"
public_container_count="$(printf '%s\n' "$public_containers" | sed '/^$/d' | wc -l | tr -d ' ')"
if [[ "$public_container_count" == 1 ]]; then
  public_container="$public_containers"
  public_sha="$(read_git_sha "$public_container")"
  if ! docker inspect "$public_container" \
    --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' 2>/dev/null |
    grep -Fxq "$public_network"; then
    block target_public_entry_network_mismatch
  fi
  if ! docker port "$public_container" 5175/tcp 2>/dev/null |
    grep -Fxq "0.0.0.0:$public_host_port"; then
    block target_public_entry_port_mismatch
  fi
  curl --fail --silent --show-error --max-time 5 \
    "http://127.0.0.1:$public_host_port/healthz" >/dev/null 2>&1 &&
    public_health=passed ||
    block target_public_entry_health_failed
  if curl -fsS --max-time 8 \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":"public-preflight","method":"capabilities","params":{}}' \
    "$public_endpoint/rpc/auth" | python3 -c '
import json
import sys
payload = json.load(sys.stdin)
sms = payload.get("result", {}).get("data", {}).get("sms_login", {})
ok = payload.get("result", {}).get("code") == 0 and sms.get("enabled") is True and sms.get("mode") == "provider" and sms.get("mock_delivery") is False
raise SystemExit(0 if ok else 1)
'; then
    public_provider=passed
  else
    block target_public_entry_provider_failed
  fi
  if [[ ! "$public_sha" =~ ^[0-9a-f]{40}$ ]]; then
    block target_public_entry_sha_invalid
  elif [[ "$public_sha" != "$server_sha" || "$public_sha" != "$web_sha" ]]; then
    block target_public_entry_sha_mismatch
  elif [[ "$public_health" == passed && "$public_provider" == passed ]]; then
    public_entry_status=passed
  fi
else
  block target_public_entry_container_invalid
fi

# Retention is deliberately preview-only. A candidate is merely absent from
# current runtime, retained cache, container and operation JSON references; it
# is never deleted by preflight and still requires a fresh manual readback.
protected_release_shas="$(printf '%s\n' "$server_sha" "$web_sha" "$public_sha")"
all_public_containers="$({
  docker ps -a --format '{{.Names}}' 2>/dev/null || true
} | grep -E "^\${public_container_prefix}[0-9a-f]{8}$" || true)"
while IFS= read -r container_name; do
  [[ -n "$container_name" ]] || continue
  container_sha="$(read_git_sha "$container_name")"
  if [[ "$container_sha" =~ ^[0-9a-f]{40}$ ]]; then
    protected_release_shas="$protected_release_shas
$container_sha"
  fi
  if [[ "$(docker inspect "$container_name" --format '{{.State.Running}}' 2>/dev/null || true)" == false ]]; then
    stopped_public_container_count=$((stopped_public_container_count + 1))
  fi
done <<<"$all_public_containers"

if plain_directory "$cache_root"; then
  shopt -s nullglob
  for cache_dir in "$cache_root"/*; do
    [[ -d "$cache_dir" && ! -L "$cache_dir" ]] || continue
    cache_name="$(basename "$cache_dir")"
    cache_artifact="$cache_dir/release-artifact.json"
    if [[ "$cache_name" =~ ^[0-9a-f]{64}$ ]] && plain_file "$cache_artifact"; then
      cache_sha="$(jq -er '
        select(.schemaVersion == "plush-release-artifact/v1") |
        .git.commit |
        select(type == "string" and test("^[0-9a-f]{40}$"))
      ' "$cache_artifact" 2>/dev/null || true)"
      if [[ "$cache_sha" =~ ^[0-9a-f]{40}$ ]]; then
        formal_cache_count=$((formal_cache_count + 1))
        protected_release_shas="$protected_release_shas
$cache_sha"
      fi
    fi
  done
fi

if plain_directory "$operations_root"; then
  operation_directory_count="$(find "$operations_root" -mindepth 1 -maxdepth 1 -type d ! -lname '*' -printf '.' 2>/dev/null | wc -c | tr -d ' ')"
  operation_shas="$({
    find "$operations_root" -mindepth 2 -maxdepth 2 -type f -name '*.json' -print0 2>/dev/null |
      xargs -0r jq -r '.. | strings | select(test("^[0-9a-f]{40}$"))' 2>/dev/null || true
  } | sort -u)"
  protected_release_shas="$protected_release_shas
$operation_shas"
fi
if plain_directory "$incoming_root"; then
  retained_operation_count="$(find "$incoming_root" -mindepth 1 -maxdepth 1 -type d ! -lname '*' -printf '.' 2>/dev/null | wc -c | tr -d ' ')"
fi

candidate_shas=""
if plain_directory "$releases"; then
  shopt -s nullglob
  for release_dir in "$releases"/*; do
    [[ -d "$release_dir" && ! -L "$release_dir" ]] || continue
    release_directory_count=$((release_directory_count + 1))
    release_sha="$(basename "$release_dir")"
    release_identity="$release_dir/.plush-release-identity.json"
    if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]] ||
      ! plain_file "$release_identity" ||
      ! jq -e --arg sha "$release_sha" '
        .schemaVersion == "plush.target-release-identity/v1" and
        .gitSha == $sha and
        (.sourceArchiveSha256 | type == "string" and test("^[0-9a-f]{64}$")) and
        (.releaseManifestSha256 | type == "string" and test("^[0-9a-f]{64}$"))
      ' "$release_identity" >/dev/null 2>&1; then
      manual_review_release_count=$((manual_review_release_count + 1))
      continue
    fi
    identified_release_count=$((identified_release_count + 1))
    if printf '%s\n' "$protected_release_shas" | grep -Fxq "$release_sha"; then
      protected_release_count=$((protected_release_count + 1))
      continue
    fi
    retention_candidate_count=$((retention_candidate_count + 1))
    release_bytes="$(du -sb "$release_dir" 2>/dev/null | awk '{print $1}' || true)"
    [[ "$release_bytes" =~ ^[0-9]+$ ]] || release_bytes=0
    retention_candidate_bytes=$((retention_candidate_bytes + release_bytes))
    candidate_shas="$candidate_shas
$release_sha"
  done
fi
if [[ -n "$(printf '%s\n' "$candidate_shas" | sed '/^$/d')" ]]; then
  retention_candidate_shas="$(printf '%s\n' "$candidate_shas" | sed '/^$/d' | sort -u | paste -sd, -)"
fi

if [[ -e "$migration_lock" ]]; then
  if command -v lslocks >/dev/null 2>&1 &&
    lslocks --noheadings --output PATH 2>/dev/null | grep -Fxq "$migration_lock"; then
    migration_lock_status=held
    block target_migration_lock_held
  fi
fi

postgres_cid="$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=postgres")"
if [[ -z "$postgres_cid" || "$(printf '%s\n' "$postgres_cid" | sed '/^$/d' | wc -l | tr -d ' ')" != 1 ]]; then
  database_status=blocked
  backup_tooling_status=blocked
  block target_postgres_container_invalid
elif ! docker exec "$postgres_cid" sh -c 'command -v pg_dump >/dev/null 2>&1'; then
  backup_tooling_status=blocked
  block target_backup_tooling_missing
else
  read_database_scalar() {
    local query="$1"
    docker exec "$postgres_cid" sh -c '
      psql -X --no-psqlrc -A -t -q -v ON_ERROR_STOP=1 \
        -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"
    ' sh "$query" 2>/dev/null | tr -d '\r' | sed -n '1p'
  }
  if migration_version="$(read_database_scalar "SELECT version FROM atlas_schema_revisions.atlas_schema_revisions WHERE type = 2 ORDER BY executed_at DESC LIMIT 1")" &&
    [[ "$migration_version" =~ ^20[0-9]{12}$ ]]; then
    :
  else
    migration_version=unknown
    database_status=blocked
    block target_migration_readback_failed
  fi
  if active_config_revision="$(read_database_scalar "SELECT revision FROM customer_config_revisions WHERE customer_key = 'yoyoosun' AND status = 'active' ORDER BY id DESC LIMIT 1")" &&
    active_config_product_version="$(read_database_scalar "SELECT product_version FROM customer_config_revisions WHERE customer_key = 'yoyoosun' AND status = 'active' ORDER BY id DESC LIMIT 1")" &&
    active_dataset_version="$(read_database_scalar "SELECT COALESCE(jsonb_extract_path_text(compiled_snapshot, 'datasetVersion'), '') FROM customer_config_revisions WHERE customer_key = 'yoyoosun' AND status = 'active' ORDER BY id DESC LIMIT 1")" &&
    [[ "$active_config_revision" =~ ^[A-Za-z0-9._-]+$ ]] &&
    [[ "$active_config_product_version" =~ ^[A-Za-z0-9._-]+$ ]] &&
    [[ "$active_dataset_version" =~ ^[A-Za-z0-9._-]+$ ]]; then
    :
  else
    active_config_revision=unknown
    active_config_product_version=unknown
    active_dataset_version=unknown
    database_status=blocked
    block target_customer_config_readback_failed
  fi
fi

if plain_directory "$root/backups"; then
  latest_backup="$(find "$root/backups" -maxdepth 1 -type f -name '*.dump' -size +0c -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2-)"
  if [[ -n "$latest_backup" && -f "$latest_backup" && ! -L "$latest_backup" ]]; then
    latest_backup_sha256="$(sha256sum "$latest_backup" | awk '{print $1}')"
    latest_backup_size_bytes="$(stat -c '%s' "$latest_backup")"
  fi
fi

blockers_csv=none
if (( \${#blockers[@]} > 0 )); then
  blockers_csv="$(printf '%s\n' "\${blockers[@]}" | sort -u | paste -sd, -)"
fi

printf '%s\n' \
  "SCHEMA_VERSION=plush.remote-target-preflight/v1" \
  "STATUS=$status" \
  "TARGET=$target_key" \
  "HOSTNAME=$actual_hostname" \
  "USER=$actual_user" \
  "ROOT_AVAILABLE_BYTES=$root_available_bytes" \
  "MINIMUM_AVAILABLE_BYTES=$minimum_available_bytes" \
  "CAPACITY_STATUS=$capacity_status" \
  "ENV_STATUS=$env_status" \
  "RESOURCE_IDENTITY_STATUS=$resource_identity_status" \
  "COMPOSE_STATUS=$compose_status" \
  "DATABASE_STATUS=$database_status" \
  "DATABASE_NAME=$database" \
  "MIGRATION_VERSION=$migration_version" \
  "ACTIVE_CONFIG_REVISION=$active_config_revision" \
  "ACTIVE_CONFIG_PRODUCT_VERSION=$active_config_product_version" \
  "ACTIVE_DATASET_VERSION=$active_dataset_version" \
  "DEBUG_ENV=$debug_env" \
  "DEBUG_SEED_ENABLED=$debug_seed_enabled" \
  "DEBUG_SEED_ALLOWED=$debug_seed_allowed" \
  "DEBUG_CLEANUP_ENABLED=$debug_cleanup_enabled" \
  "DEBUG_CLEANUP_ALLOWED=$debug_cleanup_allowed" \
  "DEBUG_BUSINESS_CLEAR_ENABLED=$debug_business_clear_enabled" \
  "DEBUG_BUSINESS_CLEAR_ALLOWED=$debug_business_clear_allowed" \
  "SERVER_SHA=$server_sha" \
  "WEB_SHA=$web_sha" \
  "SERVER_HEALTH=$server_health" \
  "SERVER_READY=$server_ready" \
  "WEB_HEALTH=$web_health" \
  "PUBLIC_ENTRY_STATUS=$public_entry_status" \
  "PUBLIC_CONTAINER=$public_container" \
  "PUBLIC_SHA=$public_sha" \
  "PUBLIC_HEALTH=$public_health" \
  "PUBLIC_PROVIDER=$public_provider" \
  "MIGRATION_LOCK_STATUS=$migration_lock_status" \
  "BACKUP_TOOLING_STATUS=$backup_tooling_status" \
  "ARCHIVE_TOOLING_STATUS=$archive_tooling_status" \
  "LATEST_BACKUP_SHA256=$latest_backup_sha256" \
  "LATEST_BACKUP_SIZE_BYTES=$latest_backup_size_bytes" \
  "RELEASE_DIRECTORY_COUNT=$release_directory_count" \
  "IDENTIFIED_RELEASE_COUNT=$identified_release_count" \
  "PROTECTED_RELEASE_COUNT=$protected_release_count" \
  "RETENTION_CANDIDATE_COUNT=$retention_candidate_count" \
  "RETENTION_CANDIDATE_BYTES=$retention_candidate_bytes" \
  "RETENTION_CANDIDATE_SHAS=$retention_candidate_shas" \
  "MANUAL_REVIEW_RELEASE_COUNT=$manual_review_release_count" \
  "FORMAL_CACHE_COUNT=$formal_cache_count" \
  "OPERATION_DIRECTORY_COUNT=$operation_directory_count" \
  "RETAINED_OPERATION_COUNT=$retained_operation_count" \
  "STOPPED_PUBLIC_CONTAINER_COUNT=$stopped_public_container_count" \
  "RETENTION_MODE=$retention_mode" \
  "BLOCKERS=$blockers_csv"
`.replaceAll("\\${", "${");

function assertTemplateValue(value, field) {
  const text = String(value || "");
  if (!text || /[\s'"`$\\]/u.test(text)) {
    throw new Error(`${field} is unsafe for the fixed remote template`);
  }
  return text;
}

export function buildRemoteTargetPreflightScript(target) {
  const replacements = {
    __TARGET_KEY__: target.key,
    __EXPECTED_HOSTNAME__: target.ssh.expectedHostname,
    __EXPECTED_USER__: target.ssh.user,
    __ROOT__: target.filesystem.root,
    __CURRENT__: target.filesystem.current,
    __RELEASES__: target.filesystem.releases,
    __OPERATION_ROOT__: target.filesystem.operationRoot,
    __RUNTIME_ENV__: target.filesystem.runtimeEnv,
    __COMPOSE_OVERRIDE__: target.compose.overrideFile,
    __PROJECT__: target.compose.projectName,
    __DATABASE__: target.database.name,
    __TRIAL_TARGET__: target.trialTarget,
    __MIGRATION_LOCK__: target.database.migrationLock,
    __POSTGRES_BIND__: target.runtime.postgres.bindAddress,
    __POSTGRES_PORT__: target.runtime.postgres.hostPort,
    __POSTGRES_DATA_DIRECTORY__: target.runtime.postgres.dataDirectory,
    __APP_BIND__: target.runtime.app.bindAddress,
    __APP_PORT__: target.runtime.app.hostPort,
    __WEB_BIND__: target.runtime.web.bindAddress,
    __WEB_PORT__: target.runtime.web.hostPort,
    __JAEGER_BIND__: target.runtime.jaeger.bindAddress,
    __JAEGER_5775_PORT__: target.runtime.jaeger.ports.agentCompact,
    __JAEGER_6831_PORT__: target.runtime.jaeger.ports.agentThriftCompact,
    __JAEGER_6832_PORT__: target.runtime.jaeger.ports.agentThriftBinary,
    __JAEGER_5778_PORT__: target.runtime.jaeger.ports.config,
    __JAEGER_UI_PORT__: target.runtime.jaeger.ports.ui,
    __JAEGER_14268_PORT__: target.runtime.jaeger.ports.collectorHttp,
    __JAEGER_14250_PORT__: target.runtime.jaeger.ports.collectorGrpc,
    __JAEGER_9411_PORT__: target.runtime.jaeger.ports.zipkin,
    __JAEGER_OTLP_GRPC_PORT__: target.runtime.jaeger.ports.otlpGrpc,
    __JAEGER_OTLP_HTTP_PORT__: target.runtime.jaeger.ports.otlpHttp,
    __MINIMUM_AVAILABLE_BYTES__: target.capacity.minimumAvailableBytes,
    __PUBLIC_ENDPOINT__: target.publicEntry.endpoint,
    __PUBLIC_NETWORK__: target.publicEntry.network,
    __PUBLIC_CONTAINER_PREFIX__: target.publicEntry.containerPrefix,
    __PUBLIC_HOST_PORT__: target.publicEntry.hostPort,
    __SERVER_ENDPOINT__: target.endpoints.server,
    __WEB_ENDPOINT__: target.endpoints.web,
  };
  let script = REMOTE_TARGET_PREFLIGHT_SCRIPT_TEMPLATE;
  for (const [placeholder, value] of Object.entries(replacements)) {
    script = script.replaceAll(
      placeholder,
      assertTemplateValue(value, placeholder),
    );
  }
  if (/__[A-Z0-9_]+__/u.test(script)) {
    throw new Error("remote target preflight template is incomplete");
  }
  return script;
}

export const REMOTE_TARGET_PREFLIGHT_SCRIPT = buildRemoteTargetPreflightScript(
  getDeploymentTarget("demo-133"),
);

function assertEnum(value, values, field) {
  if (!values.includes(value)) throw new Error(`${field} is invalid`);
  return value;
}

function parseSafeInteger(value, field) {
  if (!/^[0-9]+$/u.test(String(value || ""))) {
    throw new Error(`${field} is invalid`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${field} is invalid`);
  }
  return parsed;
}

export function parseRemoteTargetPreflight(
  raw,
  target = getDeploymentTarget("demo-133"),
) {
  if (
    typeof raw !== "string" ||
    raw.length === 0 ||
    raw.length > 64 * 1024 ||
    raw.includes("\0")
  ) {
    throw new Error("remote target preflight output is invalid");
  }
  const values = {};
  for (const line of raw.trim().split(/\r?\n/u)) {
    const separator = line.indexOf("=");
    if (separator <= 0) {
      throw new Error("remote target preflight line is invalid");
    }
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (!REPORT_KEYS.includes(key) || Object.hasOwn(values, key)) {
      throw new Error("remote target preflight key is invalid or duplicated");
    }
    values[key] = value;
  }
  if (Object.keys(values).length !== REPORT_KEYS.length) {
    throw new Error("remote target preflight output is incomplete");
  }
  if (
    values.SCHEMA_VERSION !== REMOTE_TARGET_PREFLIGHT_CONTRACT ||
    values.TARGET !== target.key ||
    values.HOSTNAME !== target.ssh.expectedHostname ||
    values.USER !== target.ssh.user ||
    values.DATABASE_NAME !== target.database.name
  ) {
    throw new Error("remote target identity does not match the fixed contract");
  }
  const status = assertEnum(values.STATUS, ["passed", "blocked"], "status");
  const checkStatus = (field) =>
    assertEnum(values[field], ["passed", "blocked"], field);
  const healthStatus = (field) =>
    assertEnum(values[field], ["passed", "failed"], field);
  const sha = (value, field) => {
    if (value !== "unknown" && !SHA_PATTERN.test(value)) {
      throw new Error(`${field} is invalid`);
    }
    return value;
  };
  const safeIdentity = (value, field) => {
    if (value !== "unknown" && !SAFE_TEXT_PATTERN.test(value)) {
      throw new Error(`${field} is invalid`);
    }
    return value;
  };
  const strictFalse = (value, field) => {
    if (value !== "false") throw new Error(`${field} must be false`);
    return false;
  };
  const envStatus = checkStatus("ENV_STATUS");
  const debugValues = [
    values.DEBUG_ENV,
    values.DEBUG_SEED_ENABLED,
    values.DEBUG_SEED_ALLOWED,
    values.DEBUG_CLEANUP_ENABLED,
    values.DEBUG_CLEANUP_ALLOWED,
    values.DEBUG_BUSINESS_CLEAR_ENABLED,
    values.DEBUG_BUSINESS_CLEAR_ALLOWED,
  ];
  const debugUnobserved = debugValues.every((value) => value === "unknown");
  if (debugUnobserved && envStatus !== "blocked") {
    throw new Error("unobserved debug capabilities require blocked env");
  }
  const debug = debugUnobserved
    ? {
        environment: "unknown",
        seedEnabled: "unknown",
        seedAllowed: "unknown",
        cleanupEnabled: "unknown",
        cleanupAllowed: "unknown",
        businessDataClearEnabled: "unknown",
        businessDataClearAllowed: "unknown",
      }
    : {
        environment: assertEnum(values.DEBUG_ENV, ["prod"], "debug env"),
        seedEnabled: strictFalse(
          values.DEBUG_SEED_ENABLED,
          "debug seed enabled",
        ),
        seedAllowed: strictFalse(
          values.DEBUG_SEED_ALLOWED,
          "debug seed allowed",
        ),
        cleanupEnabled: strictFalse(
          values.DEBUG_CLEANUP_ENABLED,
          "debug cleanup enabled",
        ),
        cleanupAllowed: strictFalse(
          values.DEBUG_CLEANUP_ALLOWED,
          "debug cleanup allowed",
        ),
        businessDataClearEnabled: strictFalse(
          values.DEBUG_BUSINESS_CLEAR_ENABLED,
          "debug business clear enabled",
        ),
        businessDataClearAllowed: strictFalse(
          values.DEBUG_BUSINESS_CLEAR_ALLOWED,
          "debug business clear allowed",
        ),
      };
  const migrationVersion = values.MIGRATION_VERSION;
  if (
    migrationVersion !== "unknown" &&
    !/^20[0-9]{12}$/u.test(migrationVersion)
  ) {
    throw new Error("migration version is invalid");
  }
  const blockers =
    values.BLOCKERS === "none"
      ? []
      : values.BLOCKERS.split(",").map((value) => {
          if (!BLOCKER_PATTERN.test(value)) {
            throw new Error("remote target blocker code is invalid");
          }
          return value;
        });
  if (
    (status === "passed" && blockers.length !== 0) ||
    (status === "blocked" && blockers.length === 0) ||
    new Set(blockers).size !== blockers.length
  ) {
    throw new Error("remote target blocker/status contract is inconsistent");
  }
  const latestBackupSha256 = values.LATEST_BACKUP_SHA256;
  if (
    latestBackupSha256 !== "none" &&
    !SHA256_PATTERN.test(latestBackupSha256)
  ) {
    throw new Error("latest backup SHA-256 is invalid");
  }
  const retentionCandidateCount = parseSafeInteger(
    values.RETENTION_CANDIDATE_COUNT,
    "retention candidate count",
  );
  const retentionCandidateShas =
    values.RETENTION_CANDIDATE_SHAS === "none"
      ? []
      : values.RETENTION_CANDIDATE_SHAS.split(",");
  if (
    retentionCandidateShas.some((value) => !SHA_PATTERN.test(value)) ||
    new Set(retentionCandidateShas).size !== retentionCandidateShas.length ||
    retentionCandidateShas.length !== retentionCandidateCount
  ) {
    throw new Error("retention candidate identity is invalid");
  }
  const report = {
    schemaVersion: REMOTE_TARGET_PREFLIGHT_CONTRACT,
    status,
    target: values.TARGET,
    host: {
      hostname: values.HOSTNAME,
      user: values.USER,
    },
    capacity: {
      status: checkStatus("CAPACITY_STATUS"),
      availableBytes: parseSafeInteger(
        values.ROOT_AVAILABLE_BYTES,
        "root available bytes",
      ),
      minimumAvailableBytes: parseSafeInteger(
        values.MINIMUM_AVAILABLE_BYTES,
        "minimum available bytes",
      ),
    },
    runtime: {
      env: envStatus,
      resourceIdentity: checkStatus("RESOURCE_IDENTITY_STATUS"),
      compose: checkStatus("COMPOSE_STATUS"),
      database: checkStatus("DATABASE_STATUS"),
      databaseName: values.DATABASE_NAME,
      migrationVersion,
      activeCustomerConfig: {
        revision: safeIdentity(
          values.ACTIVE_CONFIG_REVISION,
          "active customer config revision",
        ),
        productVersion: safeIdentity(
          values.ACTIVE_CONFIG_PRODUCT_VERSION,
          "active customer config product version",
        ),
        datasetVersion: safeIdentity(
          values.ACTIVE_DATASET_VERSION,
          "active dataset version",
        ),
      },
      debug,
      serverSha: sha(values.SERVER_SHA, "server SHA"),
      webSha: sha(values.WEB_SHA, "web SHA"),
      serverHealth: healthStatus("SERVER_HEALTH"),
      serverReady: healthStatus("SERVER_READY"),
      webHealth: healthStatus("WEB_HEALTH"),
    },
    publicEntry: {
      status: checkStatus("PUBLIC_ENTRY_STATUS"),
      container:
        values.PUBLIC_CONTAINER === "unknown"
          ? "unknown"
          : values.PUBLIC_CONTAINER,
      gitSha: sha(values.PUBLIC_SHA, "public entry SHA"),
      health: healthStatus("PUBLIC_HEALTH"),
      provider: healthStatus("PUBLIC_PROVIDER"),
      endpoint: target.publicEntry.endpoint,
    },
    locks: {
      migration: assertEnum(
        values.MIGRATION_LOCK_STATUS,
        ["free", "held"],
        "migration lock",
      ),
    },
    backup: {
      tooling: checkStatus("BACKUP_TOOLING_STATUS"),
      latestSha256: latestBackupSha256,
      latestSizeBytes: parseSafeInteger(
        values.LATEST_BACKUP_SIZE_BYTES,
        "latest backup size",
      ),
      freshBackupRequiredForPromotion: true,
    },
    archiveTooling: {
      status: checkStatus("ARCHIVE_TOOLING_STATUS"),
      zstdRequired: true,
    },
    retention: {
      mode: assertEnum(
        values.RETENTION_MODE,
        ["preview_only"],
        "retention mode",
      ),
      releaseDirectoryCount: parseSafeInteger(
        values.RELEASE_DIRECTORY_COUNT,
        "release directory count",
      ),
      identifiedReleaseCount: parseSafeInteger(
        values.IDENTIFIED_RELEASE_COUNT,
        "identified release count",
      ),
      protectedReleaseCount: parseSafeInteger(
        values.PROTECTED_RELEASE_COUNT,
        "protected release count",
      ),
      candidateCount: retentionCandidateCount,
      candidateBytes: parseSafeInteger(
        values.RETENTION_CANDIDATE_BYTES,
        "retention candidate bytes",
      ),
      candidateShas: retentionCandidateShas,
      manualReviewReleaseCount: parseSafeInteger(
        values.MANUAL_REVIEW_RELEASE_COUNT,
        "manual review release count",
      ),
      formalCacheCount: parseSafeInteger(
        values.FORMAL_CACHE_COUNT,
        "formal cache count",
      ),
      operationDirectoryCount: parseSafeInteger(
        values.OPERATION_DIRECTORY_COUNT,
        "operation directory count",
      ),
      retainedOperationCount: parseSafeInteger(
        values.RETAINED_OPERATION_COUNT,
        "retained operation count",
      ),
      stoppedPublicContainerCount: parseSafeInteger(
        values.STOPPED_PUBLIC_CONTAINER_COUNT,
        "stopped public container count",
      ),
      deletionPerformed: false,
      candidateStillRequiresManualReadback: true,
    },
    blockers,
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsAbsolutePaths: false,
      containsRawEnvironmentValues: false,
    },
  };
  if (
    report.capacity.minimumAvailableBytes !== 30 * 1024 ** 3 ||
    report.retention.identifiedReleaseCount >
      report.retention.releaseDirectoryCount ||
    report.retention.protectedReleaseCount >
      report.retention.identifiedReleaseCount ||
    report.retention.candidateCount + report.retention.protectedReleaseCount !==
      report.retention.identifiedReleaseCount ||
    report.retention.identifiedReleaseCount +
      report.retention.manualReviewReleaseCount !==
      report.retention.releaseDirectoryCount ||
    (report.publicEntry.container !== "unknown" &&
      !new RegExp(
        `^${target.publicEntry.containerPrefix.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}[0-9a-f]{8}$`,
        "u",
      ).test(report.publicEntry.container)) ||
    (report.status === "passed" &&
      (!SHA_PATTERN.test(report.runtime.serverSha) ||
        report.runtime.serverSha !== report.runtime.webSha ||
        report.runtime.migrationVersion === "unknown" ||
        Object.values(report.runtime.activeCustomerConfig).includes(
          "unknown",
        ) ||
        report.publicEntry.status !== "passed" ||
        report.publicEntry.gitSha !== report.runtime.serverSha))
  ) {
    throw new Error("remote target report contradicts the fixed contract");
  }
  return report;
}

function targetSshArgs(target) {
  const sshDestination = `${target.ssh.user}@${target.ssh.host}`;
  return [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=8",
    "-o",
    "StrictHostKeyChecking=yes",
    "-p",
    String(target.ssh.port),
    sshDestination,
    "bash",
    "-s",
  ];
}

function publicTargetPreflight(target, remote, now) {
  return {
    schemaVersion: TARGET_PREFLIGHT_CONTRACT,
    generatedAt: now,
    status: remote.status,
    target: target.key,
    purpose: target.purpose,
    customer: target.customer,
    trialTarget: target.trialTarget,
    remote,
    blockers: remote.blockers,
    nextAction:
      remote.status === "passed"
        ? "prepare a fresh backup, immutable promotion and public entry cutover"
        : "resolve blockers and rerun this read-only preflight",
    notProven: [
      "fresh pre-migration backup for a new release",
      "new release migration plan/apply/readback",
      "new release promotion and smoke",
      "new release public entry cutover and asset readback",
      "rollback rehearsal",
      "customer UAT and sign-off",
    ],
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsSshTarget: false,
      containsAbsolutePaths: false,
    },
  };
}

export function runTargetPreflight(
  targetKey,
  {
    runCommand = spawnSync,
    timeoutMs = 30_000,
    now = new Date().toISOString(),
  } = {},
) {
  const target = getDeploymentTarget(targetKey);
  const args = targetSshArgs(target);
  const result = runCommand("ssh", args, {
    input: buildRemoteTargetPreflightScript(target),
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
    env: process.env,
  });
  if (result.error) {
    throw new Error(
      `target preflight SSH could not start: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `target preflight SSH failed with exit ${String(result.status)}`,
    );
  }
  const remote = parseRemoteTargetPreflight(
    String(result.stdout || ""),
    target,
  );
  return publicTargetPreflight(target, remote, now);
}

export async function runTargetPreflightAsync(
  targetKey,
  {
    spawnCommand = spawn,
    timeoutMs = 30_000,
    now = new Date().toISOString(),
  } = {},
) {
  const target = getDeploymentTarget(targetKey);
  const child = spawnCommand("ssh", targetSshArgs(target), {
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    let stdout = "";
    let outputBytes = 0;
    let settled = false;
    let timer;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      callback();
    };
    const collect = (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > 1024 * 1024) {
        child.kill("SIGTERM");
        finish(() => reject(new Error("target preflight output is too large")));
        return;
      }
      stdout += chunk.toString("utf8");
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > 1024 * 1024) child.kill("SIGTERM");
    });
    child.on("error", (error) => {
      finish(() =>
        reject(
          new Error(`target preflight SSH could not start: ${error.message}`),
        ),
      );
    });
    child.on("close", (code) => {
      finish(() => {
        if (code !== 0) {
          reject(
            new Error(`target preflight SSH failed with exit ${String(code)}`),
          );
          return;
        }
        try {
          resolve(
            publicTargetPreflight(
              target,
              parseRemoteTargetPreflight(stdout, target),
              now,
            ),
          );
        } catch (error) {
          reject(error);
        }
      });
    });
    child.stdin.on("error", (error) => {
      finish(() =>
        reject(
          new Error(`target preflight SSH input failed: ${error.message}`),
        ),
      );
    });
    timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => reject(new Error("target preflight SSH timed out")));
    }, timeoutMs);
    child.stdin.end(buildRemoteTargetPreflightScript(target));
  });
}

function parseArgs(argv) {
  const options = { target: "", json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--target") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--target requires a value");
      }
      options.target = value;
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${token}`);
  }
  if (!options.help && !options.target) throw new Error("--target is required");
  return options;
}

function isMainModule() {
  try {
    return (
      realpathSync(fileURLToPath(import.meta.url)) ===
      realpathSync(process.argv[1])
    );
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(`Usage:
  node scripts/deploy/target-preflight.mjs --target <demo-133|customer-test-133> [--json]

Runs read-only checks through the fixed target registry. The CLI accepts no SSH
host, path, project, database, endpoint or command parameter.`);
      process.exit(0);
    }
    const report = runTargetPreflight(options.target);
    console.log(
      options.json
        ? JSON.stringify(report, null, 2)
        : `target preflight ${report.status}: ${report.target} blockers=${report.blockers.join(",") || "none"}`,
    );
    process.exit(report.status === "passed" ? 0 : 2);
  } catch (error) {
    console.error(`[target-preflight] ${error.message}`);
    process.exit(1);
  }
}
