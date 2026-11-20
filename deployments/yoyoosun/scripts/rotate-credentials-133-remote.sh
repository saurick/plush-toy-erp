#!/usr/bin/env bash
set -euo pipefail
set +x

deployment_target="$1"
command_target="$2"
dataset_version="$3"
target_identity="$4"
database="$5"
root="$6"
current="$7"
env_file="$8"
project_name="$9"
compose_directory="${10}"
base_file="${11}"
override_file="${12}"
postgres_service="${13}"
server_service="${14}"
expected_release="${15}"
expected_migration="${16}"
operation_id="${17}"

case "$deployment_target" in
demo-133)
  [[ "$command_target" == "customer-trial-133" ]] || { echo "demo command target mismatch" >&2; exit 1; }
  ;;
customer-test-133)
  [[ "$command_target" == "customer-test-133" && "$dataset_version" == "-" ]] || { echo "customer test command target mismatch" >&2; exit 1; }
  ;;
*)
  echo "unsupported deployment target" >&2
  exit 1
  ;;
esac

[[ "$database" =~ ^[A-Za-z_][A-Za-z0-9_]{0,62}$ ]] || { echo "database identity is invalid" >&2; exit 1; }
[[ "$root" =~ ^/[A-Za-z0-9._/-]+$ && "$current" == "$root/current" && "$env_file" == "$root/runtime/"* ]] || { echo "filesystem registry projection is invalid" >&2; exit 1; }
[[ "$project_name" =~ ^[a-z0-9][a-z0-9_-]{0,62}$ && "$compose_directory" == "server/deploy/compose/prod" && "$base_file" == "compose.yml" && "$override_file" =~ ^compose\.[a-z0-9.-]+\.yml$ && "$postgres_service" == "postgres" && "$server_service" == "app-server" ]] || { echo "compose registry projection is invalid" >&2; exit 1; }
[[ "$expected_release" =~ ^[a-f0-9]{40}$ && "$expected_migration" =~ ^[0-9]{14}$ ]] || { echo "release identity is invalid" >&2; exit 1; }
[[ "$operation_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] || { echo "operation id is invalid" >&2; exit 1; }

plain_owned_directory() {
  local candidate="$1"
  [[ -d "$candidate" && ! -L "$candidate" && "$(readlink -f -- "$candidate" 2>/dev/null || true)" == "$candidate" && "$(stat -c '%u' "$candidate" 2>/dev/null || true)" == "$(id -u)" ]]
}

plain_owned_file() {
  local candidate="$1"
  [[ -f "$candidate" && ! -L "$candidate" && "$(readlink -f -- "$candidate" 2>/dev/null || true)" == "$candidate" && "$(stat -c '%u' "$candidate" 2>/dev/null || true)" == "$(id -u)" && "$(stat -c '%a' "$candidate" 2>/dev/null || true)" == 600 ]]
}

plain_owned_source_file() {
  local candidate="$1"
  local mode
  mode="$(stat -c '%a' "$candidate" 2>/dev/null || true)"
  [[ -f "$candidate" && ! -L "$candidate" && "$(readlink -f -- "$candidate" 2>/dev/null || true)" == "$candidate" && "$(stat -c '%u' "$candidate" 2>/dev/null || true)" == "$(id -u)" && "$mode" =~ ^(600|640|644)$ ]]
}

plain_owned_directory "$root" || { echo "registered target root is unsafe" >&2; exit 1; }

compose_dir="$current/$compose_directory"
base_compose="$compose_dir/$base_file"
target_compose="$compose_dir/$override_file"
backups_root="$root/backups"
run_root="$root/run"
promotion_lock="$run_root/promotion.lock"
backup_alias="pre-credential-rotation-${expected_release:0:12}-${operation_id}"
backup_final="$backups_root/$backup_alias.dump"
backup_temp="$backup_final.tmp"
rotation_marker_key="manual-acceptance-password-rotation:${operation_id}"
restore_database="plush_credential_${operation_id//-/}"
restore_database="${restore_database:0:50}"
restore_database_cleanup_required=0
backup_temp_created=0

plain_owned_directory "$current" && plain_owned_directory "$compose_dir" &&
  plain_owned_directory "$backups_root" && plain_owned_directory "$run_root" &&
  plain_owned_file "$env_file" && plain_owned_source_file "$base_compose" &&
  plain_owned_source_file "$target_compose" || {
  echo "registered release paths are incomplete or unsafe" >&2
  exit 1
}
cd "$compose_dir"

compose=(
  docker compose
  -p "$project_name"
  --env-file "$env_file"
  -f "$base_compose"
  -f "$target_compose"
)
compose_command=(
  "${compose[@]}"
  run --rm -T --no-deps --pull never
  -e MANUAL_ACCEPTANCE_ADMIN_PASSWORD
)
rotation_command=(
  "/app/rotate-manual-acceptance-passwords"
  --target "$command_target"
  --expected-migration-version "$expected_migration"
  --expected-release "$expected_release"
  --operation-id "$operation_id"
  --backup-alias "$backup_alias"
)

cleanup_restore_database() {
  [[ "$restore_database_cleanup_required" -eq 1 ]] || return 0
  [[ -n "${postgres_cid:-}" ]] || return 1
  docker exec "$postgres_cid" sh -ceu \
    'dropdb --if-exists --force -U "$POSTGRES_USER" "$1"' \
    sh "$restore_database" >/dev/null 2>&1 || return 1
  docker exec "$postgres_cid" sh -ceu \
    '[ "$(printf "%s\n" "SELECT COUNT(*) FROM pg_database WHERE datname = :'\''candidate'\'';" | psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v candidate="$1")" = 0 ]' \
    sh "$restore_database" >/dev/null 2>&1 || return 1
  restore_database_cleanup_required=0
}

cleanup_resources() {
  local exit_code=$?
  local cleanup_failed=0
  trap - EXIT
  trap '' HUP INT TERM
  cleanup_restore_database || cleanup_failed=1
  if [[ "$backup_temp_created" -eq 1 ]]; then
    if rm -f -- "$backup_temp" && [[ ! -e "$backup_temp" && ! -L "$backup_temp" ]]; then
      backup_temp_created=0
    else
      cleanup_failed=1
    fi
  fi
  if [[ "$cleanup_failed" -eq 1 ]]; then
    echo "credential rotation temporary cleanup failed" >&2
    exit 1
  fi
  exit "$exit_code"
}
trap cleanup_resources EXIT
trap 'exit 130' HUP INT TERM

if [[ -e "$promotion_lock" || -L "$promotion_lock" ]]; then
  plain_owned_file "$promotion_lock" || { echo "target mutation lock is unsafe" >&2; exit 1; }
fi
exec 9>>"$promotion_lock"
chmod 600 "$promotion_lock"
plain_owned_file "$promotion_lock" || { echo "target mutation lock creation failed" >&2; exit 1; }
flock -n 9 || { echo "target mutation lock is busy" >&2; exit 1; }

postgres_cid="$("${compose[@]}" ps -q "$postgres_service")"
[[ "$postgres_cid" =~ ^[a-f0-9]{12,64}$ ]] || { echo "postgres container identity is invalid" >&2; exit 1; }
IFS=$'\t' read -r postgres_running postgres_project postgres_service_label < <(
  docker inspect -f '{{.State.Running}}{{"\t"}}{{index .Config.Labels "com.docker.compose.project"}}{{"\t"}}{{index .Config.Labels "com.docker.compose.service"}}' "$postgres_cid"
)
[[ "$postgres_running" == true && "$postgres_project" == "$project_name" && "$postgres_service_label" == "$postgres_service" ]] || {
  echo "postgres container contract is invalid" >&2
  exit 1
}
docker exec "$postgres_cid" sh -ceu '[ "$POSTGRES_DB" = "$1" ]' sh "$database" || {
  echo "postgres database identity is invalid" >&2
  exit 1
}
if ! marker_count="$(docker exec "$postgres_cid" sh -ceu \
  'printf "%s\n" "SELECT COUNT(*) FROM runtime_markers WHERE marker_key = :'\''marker_key'\'';" | psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v marker_key="$1"' \
  sh "$rotation_marker_key" 2>/dev/null)"; then
  echo "credential rotation marker state is unreadable" >&2
  exit 1
fi
[[ "$marker_count" =~ ^[01]$ ]] || {
  echo "credential rotation marker state is ambiguous" >&2
  exit 1
}

if [[ -e "$backup_temp" || -L "$backup_temp" ]]; then
  echo "stale credential backup temporary exists" >&2
  exit 1
fi
if [[ -e "$backup_final" || -L "$backup_final" ]]; then
  plain_owned_file "$backup_final" || {
    echo "existing credential backup is unsafe" >&2
    exit 1
  }
  [[ "$marker_count" == 1 ]] || {
    echo "existing credential backup has no durable receipt; preserve it and start a newly confirmed operation with a new UUID" >&2
    exit 1
  }
  backup_candidate="$backup_final"
else
  [[ "$marker_count" == 0 ]] || {
    echo "durable rotation receipt is missing its exact backup; stop and restore the operation evidence before retry" >&2
    exit 1
  }
  backup_temp_created=1
  docker exec "$postgres_cid" sh -ceu \
    'pg_dump -Fc --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
    >"$backup_temp"
  chmod 600 "$backup_temp"
  plain_owned_file "$backup_temp" && [[ -s "$backup_temp" ]] || { echo "credential backup is empty or unsafe" >&2; exit 1; }
  backup_candidate="$backup_temp"
fi
docker exec -i "$postgres_cid" sh -ceu 'pg_restore --list >/dev/null' <"$backup_candidate"

docker exec "$postgres_cid" sh -ceu \
  '[ "$(printf "%s\n" "SELECT COUNT(*) FROM pg_database WHERE datname = :'\''candidate'\'';" | psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v candidate="$1")" = 0 ]' \
  sh "$restore_database" || {
  echo "credential restore database identity is not preabsent" >&2
  exit 1
}
restore_database_cleanup_required=1
docker exec "$postgres_cid" sh -ceu \
  'createdb -U "$POSTGRES_USER" "$1"' \
  sh "$restore_database"
docker exec -i "$postgres_cid" sh -ceu \
  'pg_restore --exit-on-error --no-owner --no-privileges -U "$POSTGRES_USER" -d "$1"' \
  sh "$restore_database" <"$backup_candidate" >/dev/null
restored_migration="$(docker exec "$postgres_cid" sh -ceu \
  'psql -At -U "$POSTGRES_USER" -d "$1" -c "SELECT version FROM atlas_schema_revisions.atlas_schema_revisions WHERE type = 2 ORDER BY executed_at DESC LIMIT 1"' \
  sh "$restore_database")"
restored_table_count="$(docker exec "$postgres_cid" sh -ceu \
  'psql -At -U "$POSTGRES_USER" -d "$1" -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = current_schema()"' \
  sh "$restore_database")"
[[ "$restored_migration" == "$expected_migration" && "$restored_table_count" =~ ^[1-9][0-9]*$ ]] || {
  echo "credential backup restore contract is invalid" >&2
  exit 1
}
cleanup_restore_database || {
  echo "credential restore database cleanup failed" >&2
  exit 1
}

if [[ "$backup_candidate" == "$backup_temp" ]]; then
  mv "$backup_temp" "$backup_final"
  backup_temp_created=0
  plain_owned_file "$backup_final" || { echo "credential backup publish failed" >&2; exit 1; }
fi

backup_sha256="$(sha256sum "$backup_final" | awk '{print $1}')"
backup_size_bytes="$(stat -c '%s' "$backup_final")"
[[ "$backup_sha256" =~ ^[a-f0-9]{64}$ && "$backup_size_bytes" =~ ^[1-9][0-9]*$ ]] || {
  echo "credential backup identity is invalid" >&2
  exit 1
}
rotation_command+=(
  --backup-sha256 "$backup_sha256"
  --backup-size-bytes "$backup_size_bytes"
  --backup-restore-checked
)

if [[ "$deployment_target" == "demo-133" ]]; then
  [[ -n "${MANUAL_ACCEPTANCE_ADMIN_PASSWORD:-}" && -n "${MANUAL_ACCEPTANCE_UAT_PASSWORD:-}" ]] || { echo "demo credential inputs are incomplete" >&2; exit 1; }
  compose_command+=(
    -e MANUAL_ACCEPTANCE_UAT_PASSWORD
    -e MANUAL_ACCEPTANCE_SMS_PHONE
  )
  rotation_command+=(
    --dataset-version "$dataset_version"
    --confirm "ROTATE_SIMULATED_ACCEPTANCE_ACCOUNTS:${command_target}:${dataset_version}"
  )
else
  [[ -n "${MANUAL_ACCEPTANCE_ADMIN_PASSWORD:-}" ]] || { echo "customer test admin credential is missing" >&2; exit 1; }
  unset MANUAL_ACCEPTANCE_UAT_PASSWORD MANUAL_ACCEPTANCE_PASSWORD MANUAL_ACCEPTANCE_SMS_PHONE
  rotation_command+=(
    --target-identity "$target_identity"
    --confirm "ROTATE_DEPLOYMENT_ADMIN_CREDENTIAL:${command_target}:${target_identity}"
  )
fi

"${compose_command[@]}" "$server_service" "${rotation_command[@]}"
