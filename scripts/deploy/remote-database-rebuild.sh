#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

print_help() {
  printf '%s\n' \
    'Usage:' \
    "  bash remote-database-rebuild.sh rebuild-database <demo-133|customer-test-133> \\" \
    "    <operation-id> <40-sha> <version> <release-manifest-sha256> \\" \
    '    <database-rebuild-fingerprint> <confirmation>' \
    '' \
    'This registered-target executor replaces one physical PostgreSQL data generation while retaining its logical database name.' \
    'It creates and restore-checks a fresh backup, preserves the predecessor data directory, never deletes either generation,' \
    'and never retries a terminal or unknown operation.'
}

[[ "${1:-}" == "--help" || "${1:-}" == "-h" ]] && {
  print_help
  exit 0
}

action="${1:-}"
target="${2:-}"
operation_id="${3:-}"
release_sha="${4:-}"
release_version="${5:-}"
release_manifest_sha256="${6:-}"
rebuild_fingerprint="${7:-}"
confirmation="${8:-}"

case "$target" in
demo-133)
  root=/home/simon/plush-toy-erp-demo-v1
  runtime_env=$root/runtime/.env.demo-133
  project=plush-toy-erp-demo-v1
  database=plush_erp_demo_v1
  compose_override_name=compose.demo-133.yml
  server_endpoint=http://127.0.0.1:8325
  web_endpoint=http://127.0.0.1:5195
  ;;
customer-test-133)
  root=/home/simon/plush-toy-erp-test-v1
  runtime_env=$root/runtime/.env.customer-test-133
  project=plush-toy-erp-test-v1
  database=plush_erp_customer_test_v1
  compose_override_name=compose.customer-test-133.yml
  server_endpoint=http://127.0.0.1:8335
  web_endpoint=http://127.0.0.1:5205
  ;;
*)
  printf '[remote-database-rebuild] unsupported target\n' >&2
  exit 1
  ;;
esac
incoming_root=$root/incoming
operations_root=$root/operations
backups_root=$root/backups
run_root=$root/run
current=$root/current
data_dir=$root/data/postgres
minimum_available_bytes=32212254720
operation_lock=$run_root/promotion.lock

uuid_v4_pattern='^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
sha_pattern='^[0-9a-f]{40}$'
sha256_pattern='^[0-9a-f]{64}$'
version_pattern='^[0-9A-Za-z]([0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$'

fail() {
  printf '[remote-database-rebuild] %s\n' "$1" >&2
  return 1
}

[[ "$action" == rebuild-database ]] || fail "unsupported action"
[[ "$operation_id" =~ $uuid_v4_pattern ]] || fail "invalid operation id"
[[ "$release_sha" =~ $sha_pattern ]] || fail "invalid release SHA"
[[ "$release_version" =~ $version_pattern ]] || fail "invalid release version"
[[ "$release_manifest_sha256" =~ $sha256_pattern ]] ||
  fail "invalid release manifest SHA-256"
[[ "$rebuild_fingerprint" =~ $sha256_pattern ]] ||
  fail "invalid database rebuild fingerprint"
[[ "$confirmation" == "REBUILD_DATABASE:$target:$release_sha:$operation_id" ]] ||
  fail "database rebuild confirmation does not match"
[[ "$(hostname)" == r640 && "$(id -un)" == simon ]] ||
  fail "remote host/user identity does not match"

incoming=$incoming_root/$operation_id
operation_dir=$operations_root/$operation_id
receipt=$operation_dir/database-rebuild-receipt.json
state_file=$operation_dir/database-rebuild-state.json
log_file=$operation_dir/database-rebuild.log
secret_file=$incoming/bootstrap-admin.secret
rollback_alias="rollback-${release_sha:0:12}-${operation_id:0:8}"
rollback_dir=$root/data/postgres.$rollback_alias
failed_fresh_dir=$root/data/postgres.failed-${operation_id:0:8}
restore_database="plush_rebuild_restore_${operation_id//-/}"
restore_database="${restore_database:0:50}"
backup_final=$backups_root/pre-rebuild-${release_sha:0:12}-$operation_id.dump
backup_temp=$backup_final.tmp
stage=initial
data_switch_started=0
migration_apply_started=0
bootstrap_started=0
bootstrap_completed=0
restore_database_created=0
predecessor_runtime_stopped=0
predecessor_recovered=0
backup_sha256=none
backup_size_bytes=0
migration_readback=unknown
system_identifier_before=unknown
system_identifier_after=unknown
admin_username=unknown
admin_secret=""

cleanup_bootstrap_secret() {
  admin_secret=""
  unset admin_secret APP_ADMIN_PASSWORD || true
  if [[ -f "$secret_file" && ! -L "$secret_file" ]]; then
    rm -f -- "$secret_file" || true
  fi
}

trap cleanup_bootstrap_secret EXIT

mkdir -p "$operations_root" "$run_root" "$backups_root"
chmod 700 "$operations_root" "$run_root" "$backups_root"
mkdir "$operation_dir" 2>/dev/null || true
[[ -d "$operation_dir" && ! -L "$operation_dir" ]] ||
  fail "operation directory is invalid"
chmod 700 "$operation_dir"

exec 9>>"$operation_lock"
chmod 600 "$operation_lock"
if ! flock -n 9; then
  fail "another promotion, rollback or database rebuild holds the fixed target lock"
fi

if [[ -f "$receipt" && ! -L "$receipt" ]]; then
  cat "$receipt"
  exit 0
fi
if [[ -f "$state_file" && ! -L "$state_file" ]]; then
  previous_status="$(jq -r '.status // empty' "$state_file" 2>/dev/null || true)"
  [[ "$previous_status" != running ]] ||
    fail "operation has an unknown prior target outcome; read back before retry"
fi

write_state() {
  local status="$1"
  local next=$state_file.tmp
  jq -n \
    --arg schemaVersion "plush.remote-database-rebuild-state/v1" \
    --arg status "$status" \
    --arg operationId "$operation_id" \
    --arg target "$target" \
    --arg gitSha "$release_sha" \
    --arg version "$release_version" \
    --arg stage "$stage" \
    --arg updatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
      schemaVersion: $schemaVersion,
      status: $status,
      operationId: $operationId,
      target: $target,
      gitSha: $gitSha,
      version: $version,
      stage: $stage,
      updatedAt: $updatedAt
    }' >"$next"
  chmod 600 "$next"
  mv -f "$next" "$state_file"
}

write_receipt() {
  local status="$1"
  local issue_code="$2"
  local next=$receipt.tmp
  jq -n \
    --arg schemaVersion "plush.remote-database-rebuild-receipt/v1" \
    --arg status "$status" \
    --arg operationId "$operation_id" \
    --arg target "$target" \
    --arg gitSha "$release_sha" \
    --arg version "$release_version" \
    --arg releaseManifestSha256 "$release_manifest_sha256" \
    --arg databaseRebuildFingerprint "$rebuild_fingerprint" \
    --arg stage "$stage" \
    --arg issueCode "$issue_code" \
    --arg database "$database" \
    --arg previousDataAlias "$rollback_alias" \
    --arg backupAlias "pre-rebuild-${release_sha:0:12}-$operation_id" \
    --arg backupSha256 "$backup_sha256" \
    --argjson backupSizeBytes "$backup_size_bytes" \
    --argjson dataSwitchStarted "$data_switch_started" \
    --argjson predecessorRecovered "$predecessor_recovered" \
    --argjson migrationApplyStarted "$migration_apply_started" \
    --arg migrationReadback "$migration_readback" \
    --arg systemIdentifierBefore "$system_identifier_before" \
    --arg systemIdentifierAfter "$system_identifier_after" \
    --argjson bootstrapStarted "$bootstrap_started" \
    --argjson bootstrapCompleted "$bootstrap_completed" \
    --arg finishedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
      schemaVersion: $schemaVersion,
      status: $status,
      operationId: $operationId,
      target: $target,
      gitSha: $gitSha,
      version: $version,
      releaseManifestSha256: $releaseManifestSha256,
      databaseRebuildFingerprint: $databaseRebuildFingerprint,
      stage: $stage,
      issueCode: $issueCode,
      database: {
        logicalName: $database,
        previousDataAlias: $previousDataAlias,
        dataSwitchStarted: ($dataSwitchStarted == 1),
        predecessorRecovered: ($predecessorRecovered == 1),
        predecessorPreserved: ($status == "passed"),
        freshDirectoryActive: ($status == "passed"),
        automaticDeletion: false,
        systemIdentifierBefore: $systemIdentifierBefore,
        systemIdentifierAfter: $systemIdentifierAfter
      },
      rollbackPoint: {
        backupAlias: $backupAlias,
        backupSha256: $backupSha256,
        backupSizeBytes: $backupSizeBytes,
        restoreChecked: ($backupSha256 != "none")
      },
      migration: {
        automaticDownMigration: false,
        applyStarted: ($migrationApplyStarted == 1),
        readback: $migrationReadback
      },
      bootstrap: {
        started: ($bootstrapStarted == 1),
        completed: ($bootstrapCompleted == 1),
        secretPersistedOnTarget: false
      },
      checks: {
        releaseIdentity: ($status == "passed"),
        freshDatabase: ($status == "passed"),
        emptyBusinessBaseline: ($status == "passed"),
        health: ($status == "passed"),
        ready: ($status == "passed"),
        webHealth: ($status == "passed")
      },
      finishedAt: $finishedAt,
      redaction: {
        containsSecrets: false,
        containsCredentials: false,
        containsAbsolutePaths: false,
        containsRawEnvironmentValues: false,
        containsRawLogs: false
      },
      notProven: [
        "customer configuration activation and effective-session readback",
        "nine-stage acceptance dataset and 52-page browser/PDF regression",
        "credential rotation and 11-account role smoke",
        "customer UAT and sign-off"
      ]
    }' >"$next"
  chmod 600 "$next"
  mv -f "$next" "$receipt"
  write_state "$status"
}

restore_database_cleanup() {
  if [[ "$restore_database_created" -eq 1 ]]; then
    docker exec "$project-postgres" sh -ceu \
      'dropdb --if-exists --force -U "$POSTGRES_USER" "$1"' \
      sh "$restore_database" >/dev/null 2>&1 || true
    restore_database_created=0
  fi
}

recover_predecessor_before_migration() {
  [[ "$data_switch_started" -eq 1 && "$migration_apply_started" -eq 0 ]] ||
    return 1
  [[ -d "$rollback_dir" && ! -L "$rollback_dir" ]] || return 1
  [[ ! -e "$failed_fresh_dir" ]] || return 1
  if [[ -e "$data_dir" ]]; then
    [[ -d "$data_dir" && ! -L "$data_dir" ]] || return 1
  fi
  "${clean_env[@]}" "${compose[@]}" stop app-server web-desktop postgres \
    >>"$log_file" 2>&1 || return 1
  "${clean_env[@]}" "${compose[@]}" rm -f -s postgres \
    >>"$log_file" 2>&1 || return 1
  if [[ -e "$data_dir" ]]; then
    mv "$data_dir" "$failed_fresh_dir" || return 1
  fi
  mv "$rollback_dir" "$data_dir" || return 1
  "${clean_env[@]}" "${compose[@]}" up -d --no-build --pull never \
    postgres jaeger app-server web-desktop >>"$log_file" 2>&1 || return 1
  "${clean_env[@]}" bash "$preflight_script" \
    --deployment-target "$target" \
    --env-file "$runtime_env" \
    --compose-dir "$compose_dir" \
    --compose-override "$compose_override" \
    --runtime \
    --expected-release "$release_sha" \
    --out "$operation_dir/recovered-predecessor-preflight-report.txt" \
    >>"$log_file" 2>&1 || return 1
  predecessor_recovered=1
  return 0
}

restore_predecessor_runtime_before_switch() {
  [[ "$data_switch_started" -eq 0 && "$predecessor_runtime_stopped" -eq 1 ]] ||
    return 1
  [[ -d "$data_dir" && ! -L "$data_dir" ]] || return 1
  "${clean_env[@]}" "${compose[@]}" up -d --no-build --pull never \
    postgres jaeger app-server web-desktop >>"$log_file" 2>&1 || return 1
  "${clean_env[@]}" bash "$preflight_script" \
    --deployment-target "$target" \
    --env-file "$runtime_env" \
    --compose-dir "$compose_dir" \
    --compose-override "$compose_override" \
    --runtime \
    --expected-release "$release_sha" \
    --out "$operation_dir/restored-predecessor-runtime-preflight-report.txt" \
    >>"$log_file" 2>&1 || return 1
  return 0
}

on_error() {
  local exit_code=$?
  trap - ERR
  set +e
  if [[ -f "$receipt" && ! -L "$receipt" ]]; then
    printf '[remote-database-rebuild] failed at stage=%s exit=%s\n' \
      "$stage" "$exit_code" >&2
    exit "$exit_code"
  fi
  restore_database_cleanup
  cleanup_bootstrap_secret
  if [[ "$data_switch_started" -eq 0 ]]; then
    if [[ "$predecessor_runtime_stopped" -eq 0 ]]; then
      write_receipt failed database_rebuild_failed_before_data_switch
    elif restore_predecessor_runtime_before_switch; then
      write_receipt failed database_rebuild_failed_and_predecessor_runtime_restored
    else
      write_receipt not_proven database_rebuild_predecessor_runtime_restore_unknown
    fi
  elif [[ "$migration_apply_started" -eq 0 ]] &&
    recover_predecessor_before_migration; then
    write_receipt failed database_rebuild_failed_and_predecessor_recovered
  else
    write_receipt not_proven database_rebuild_outcome_unknown_after_data_switch
  fi
  cat "$receipt"
  printf '[remote-database-rebuild] failed at stage=%s exit=%s\n' \
    "$stage" "$exit_code" >&2
  exit "$exit_code"
}
trap on_error ERR
trap 'restore_database_cleanup; cleanup_bootstrap_secret' EXIT

: >"$log_file"
chmod 600 "$log_file"
write_state running

stage=package_verification
write_state running
[[ -d "$incoming" && ! -L "$incoming" ]] ||
  fail "incoming package directory is invalid"
[[ "$(stat -c '%u' "$incoming")" == "$(id -u)" ]] ||
  fail "incoming package ownership is invalid"
required_files=(
  release-manifest.json
  database-rebuild-manifest.json
  remote-database-rebuild.sh
  transfer-checksums.sha256
  bootstrap-admin.secret
)
for required_file in "${required_files[@]}"; do
  [[ -f "$incoming/$required_file" && ! -L "$incoming/$required_file" ]] ||
    fail "incoming package is incomplete"
done
[[ "$(stat -c '%a' "$secret_file")" == 600 &&
"$(stat -c '%u' "$secret_file")" == "$(id -u)" ]] ||
  fail "bootstrap secret file identity is invalid"
admin_secret="$(<"$secret_file")"
[[ ${#admin_secret} -ge 12 && ${#admin_secret} -le 20 ]] ||
  fail "bootstrap secret length is invalid"
rm -f -- "$secret_file"
(
  cd "$incoming"
  sha256sum --check --strict transfer-checksums.sha256
) >>"$log_file" 2>&1
[[ "$(sha256sum "$incoming/release-manifest.json" | awk '{print $1}')" == "$release_manifest_sha256" ]] ||
  fail "release manifest checksum does not match"
jq -e \
  --arg sha "$release_sha" \
  --arg version "$release_version" \
  '((.schemaVersion == "plush.release-manifest/v1") or
    (.schemaVersion == "plush.release-manifest/v2")) and
   .passed == true and .gitSha == $sha and .version == $version and
   .strict.status == "passed" and .rollback.databaseDownMigrationAutomatic == false' \
  "$incoming/release-manifest.json" >/dev/null
jq -e \
  --arg operationId "$operation_id" \
  --arg target "$target" \
  --arg sha "$release_sha" \
  --arg fingerprint "$rebuild_fingerprint" \
  --arg database "$database" \
  '.schemaVersion == "plush.database-rebuild-manifest/v1" and
   .status == "eligible" and .operationId == $operationId and
   .target.key == $target and .target.database == $database and
   .release.gitSha == $sha and .fingerprint == $fingerprint and
   .ancestry.schemaVersion == "plush.git-ancestry-relation/v1" and
   .ancestry.currentGitSha == $sha and
   .ancestry.candidateGitSha == $sha and
   .ancestry.relation == "current" and
   .ancestry.actionClass == "current" and
   .ancestry.actionReason == "exact_sha_current" and
   .rollback.preservePreviousDataDirectory == true and
   .rollback.preserveFreshBackup == true and
   .rollback.automaticDataDeletion == false' \
  "$incoming/database-rebuild-manifest.json" >/dev/null
qualified_runtime_sha="$(docker inspect "$project-server" --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^GIT_SHA=//p' | head -n1)"
qualified_runtime_web_sha="$(docker inspect "$project-web-desktop" --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^GIT_SHA=//p' | head -n1)"
[[ "$qualified_runtime_sha" == "$release_sha" &&
  "$qualified_runtime_web_sha" == "$release_sha" ]] ||
  fail "target runtime or Git ancestry changed after database rebuild qualification"
expected_migration="$(jq -er '.migration.latest' "$incoming/release-manifest.json")"
migration_sequence_sha256="$(jq -er '.migration.sequenceSha256' "$incoming/release-manifest.json")"
[[ "$migration_sequence_sha256" =~ ^[0-9a-f]{64}$ ]] ||
  fail "release migration sequence hash is invalid"
[[ "$expected_migration" =~ ^20[0-9]{12}$ ]] ||
  fail "release migration identity is invalid"

stage=current_release_verification
write_state running
[[ -d "$current" && ! -L "$current" ]] || fail "current release directory is invalid"
cmp --silent \
  "$incoming/remote-database-rebuild.sh" \
  "$current/scripts/deploy/remote-database-rebuild.sh" ||
  fail "database rebuild script is not part of the exact current release"
[[ -f "$current/.plush-release-identity.json" &&
  ! -L "$current/.plush-release-identity.json" ]] ||
  fail "current release identity is unavailable"
jq -e \
  --arg sha "$release_sha" \
  --arg manifestSha256 "$release_manifest_sha256" \
  '.gitSha == $sha and .releaseManifestSha256 == $manifestSha256' \
  "$current/.plush-release-identity.json" >/dev/null

[[ -f "$runtime_env" && ! -L "$runtime_env" &&
  "$(stat -c '%u' "$runtime_env")" == "$(id -u)" &&
  "$(stat -c '%a' "$runtime_env")" == 600 ]] ||
  fail "target runtime env is invalid"

compose_dir=$current/server/deploy/compose/prod
compose_base=$compose_dir/compose.yml
compose_override=$compose_dir/$compose_override_name
preflight_script=$current/scripts/deploy/production-preflight.sh
migrate_script=$compose_dir/migrate_online.sh
bootstrap_script=$current/scripts/deploy/bootstrap-production-admin.sh
[[ -f "$compose_base" && -f "$compose_override" &&
  -x "$preflight_script" && -x "$migrate_script" && -x "$bootstrap_script" ]] ||
  fail "current release database lifecycle entrypoints are incomplete"

clean_env=(
  env -i
  "HOME=$HOME"
  "USER=$(id -un)"
  "LOGNAME=$(id -un)"
  "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
)
compose=(
  docker compose
  -p "$project"
  --env-file "$runtime_env"
  -f "$compose_base"
  -f "$compose_override"
)

"${clean_env[@]}" bash "$preflight_script" \
  --deployment-target "$target" \
  --env-file "$runtime_env" \
  --compose-dir "$compose_dir" \
  --compose-override "$compose_override" \
  --runtime \
  --expected-release "$release_sha" \
  --out "$operation_dir/predecessor-preflight-report.txt" \
  >>"$log_file" 2>&1

available_bytes="$(df -B1 --output=avail / | awk 'NR==2 {print $1}')"
[[ "$available_bytes" =~ ^[0-9]+$ &&
  "$available_bytes" -ge "$minimum_available_bytes" ]] ||
  fail "target disk capacity is below the fixed minimum"
[[ -d "$data_dir" && ! -L "$data_dir" ]] ||
  fail "registered PostgreSQL data directory is invalid"
[[ ! -e "$rollback_dir" && ! -e "$failed_fresh_dir" ]] ||
  fail "database generation preservation target already exists"

postgres_cid="$("${compose[@]}" ps -q postgres)"
[[ "$postgres_cid" =~ ^[0-9a-f]{64}$ ]] ||
  fail "target PostgreSQL container is not unique"
postgres_image_id="$(docker inspect --format '{{.Image}}' "$postgres_cid")"
postgres_data_uid="$(docker exec "$postgres_cid" id -u postgres)"
postgres_data_gid="$(docker exec "$postgres_cid" id -g postgres)"
[[ "$postgres_image_id" =~ ^sha256:[0-9a-f]{64}$ &&
  "$postgres_data_uid" =~ ^[1-9][0-9]*$ &&
  "$postgres_data_gid" =~ ^[1-9][0-9]*$ ]] ||
  fail "target PostgreSQL image or data-owner identity is invalid"
postgres_mount="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql"}}{{printf "%s|%s" .Type .Source}}{{end}}{{end}}' "$postgres_cid")"
[[ "$postgres_mount" == "bind|$data_dir" ]] ||
  fail "target PostgreSQL data mount does not match the fixed directory"
runtime_sha="$(docker inspect "$project-server" --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^GIT_SHA=//p' | head -n1)"
runtime_web_sha="$(docker inspect "$project-web-desktop" --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^GIT_SHA=//p' | head -n1)"
[[ "$runtime_sha" == "$release_sha" && "$runtime_web_sha" == "$release_sha" ]] ||
  fail "target runtime release changed after qualification"
system_identifier_before="$(docker exec "$postgres_cid" sh -ceu \
  'psql -X -A -t -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT system_identifier FROM pg_control_system()"')"
[[ "$system_identifier_before" =~ ^[0-9]+$ ]] ||
  fail "predecessor PostgreSQL system identifier is invalid"

stage=fresh_backup_and_restore_check
write_state running
[[ ! -e "$backup_final" && ! -e "$backup_temp" ]] ||
  fail "database rebuild backup already exists without a terminal receipt"
docker exec "$postgres_cid" sh -ceu \
  'pg_dump -Fc --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  >"$backup_temp"
chmod 600 "$backup_temp"
[[ -s "$backup_temp" ]] || fail "fresh database rebuild backup is empty"
docker exec -i "$postgres_cid" pg_restore --list <"$backup_temp" \
  >>"$log_file" 2>&1
docker exec "$postgres_cid" sh -ceu \
  'createdb -U "$POSTGRES_USER" "$1"' sh "$restore_database" \
  >>"$log_file" 2>&1
restore_database_created=1
docker exec -i "$postgres_cid" sh -ceu \
  'pg_restore --exit-on-error --no-owner --no-privileges -U "$POSTGRES_USER" -d "$1"' \
  sh "$restore_database" <"$backup_temp" >>"$log_file" 2>&1
restored_table_count="$(docker exec "$postgres_cid" sh -ceu \
  'psql -X -A -t -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = '\''public'\''"' \
  sh "$restore_database")"
[[ "$restored_table_count" =~ ^[1-9][0-9]*$ ]] ||
  fail "database rebuild backup restore check recovered no public tables"
restore_database_cleanup
mv "$backup_temp" "$backup_final"
backup_sha256="$(sha256sum "$backup_final" | awk '{print $1}')"
backup_size_bytes="$(stat -c '%s' "$backup_final")"
[[ "$backup_sha256" =~ $sha256_pattern && "$backup_size_bytes" -gt 0 ]] ||
  fail "database rebuild backup identity is invalid"

admin_username="$(awk -F= '$1 == "APP_ADMIN_USERNAME" { print substr($0, index($0, "=") + 1) }' "$runtime_env")"
[[ "$admin_username" =~ ^[A-Za-z0-9._-]{3,64}$ ]] ||
  fail "bootstrap administrator identity is invalid"

stage=maintenance_window
write_state running
predecessor_runtime_stopped=1
"${clean_env[@]}" "${compose[@]}" stop app-server web-desktop postgres \
  >>"$log_file" 2>&1
"${clean_env[@]}" "${compose[@]}" rm -f -s postgres \
  >>"$log_file" 2>&1

stage=physical_generation_switch
write_state running
mv "$data_dir" "$rollback_dir"
data_switch_started=1
write_state running
mkdir -m 700 "$data_dir"
docker run --rm --pull never --network none --user 0:0 \
  --volume "$data_dir:/var/lib/postgresql" \
  --entrypoint sh "$postgres_image_id" -ceu \
  'chown "$1:$2" /var/lib/postgresql && chmod 700 /var/lib/postgresql' \
  sh "$postgres_data_uid" "$postgres_data_gid" >>"$log_file" 2>&1

stage=fresh_postgres_start
write_state running
"${clean_env[@]}" "${compose[@]}" up -d --no-build --pull never postgres \
  >>"$log_file" 2>&1
deadline=$((SECONDS + 180))
while true; do
  postgres_cid="$("${compose[@]}" ps -q postgres 2>/dev/null || true)"
  postgres_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$postgres_cid" 2>/dev/null || true)"
  [[ "$postgres_health" == healthy ]] && break
  ((SECONDS < deadline)) || fail "fresh PostgreSQL did not become healthy"
  sleep 2
done
postgres_mount="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql"}}{{printf "%s|%s" .Type .Source}}{{end}}{{end}}' "$postgres_cid")"
[[ "$postgres_mount" == "bind|$data_dir" ]] ||
  fail "fresh PostgreSQL data mount does not match the fixed directory"
system_identifier_after="$(docker exec "$postgres_cid" sh -ceu \
  'psql -X -A -t -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT system_identifier FROM pg_control_system()"')"
[[ "$system_identifier_after" =~ ^[0-9]+$ &&
  "$system_identifier_after" != "$system_identifier_before" ]] ||
  fail "fresh PostgreSQL physical identity was not established"

stage=database_role_reconciliation
write_state running
"${clean_env[@]}" "${compose[@]}" exec -T postgres \
  /usr/local/bin/plush-database-roles reconcile >>"$log_file" 2>&1
"${clean_env[@]}" "${compose[@]}" exec -T postgres \
  /usr/local/bin/plush-database-roles verify >>"$log_file" 2>&1

stage=migration_plan
write_state running
"${clean_env[@]}" \
  "COMPOSE_OVERRIDE_FILE=$compose_override" \
  "COMPOSE_ENV_FILE=$runtime_env" \
  "DEPLOYMENT_TARGET_KEY=$target" \
  "EXPECTED_MIGRATION_SEQUENCE_SHA256=$migration_sequence_sha256" \
  "RELEASE_SHA=$release_sha" \
  sh "$migrate_script" --status-only >>"$log_file" 2>&1
"${clean_env[@]}" \
  "COMPOSE_OVERRIDE_FILE=$compose_override" \
  "COMPOSE_ENV_FILE=$runtime_env" \
  "DEPLOYMENT_TARGET_KEY=$target" \
  "EXPECTED_MIGRATION_SEQUENCE_SHA256=$migration_sequence_sha256" \
  "RELEASE_SHA=$release_sha" \
  sh "$migrate_script" >>"$log_file" 2>&1

stage=migration_apply_started
migration_apply_started=1
write_state running
"${clean_env[@]}" \
  "COMPOSE_OVERRIDE_FILE=$compose_override" \
  "COMPOSE_ENV_FILE=$runtime_env" \
  "DEPLOYMENT_TARGET_KEY=$target" \
  "MIGRATION_MAINTENANCE_CONFIRMED=1" \
  "EXPECTED_MIGRATION_SEQUENCE_SHA256=$migration_sequence_sha256" \
  "RELEASE_SHA=$release_sha" \
  sh "$migrate_script" --apply >>"$log_file" 2>&1

stage=migration_readback
write_state running
"${clean_env[@]}" \
  "COMPOSE_OVERRIDE_FILE=$compose_override" \
  "COMPOSE_ENV_FILE=$runtime_env" \
  "DEPLOYMENT_TARGET_KEY=$target" \
  "EXPECTED_MIGRATION_SEQUENCE_SHA256=$migration_sequence_sha256" \
  "RELEASE_SHA=$release_sha" \
  sh "$migrate_script" --status-only >>"$log_file" 2>&1
migration_readback="$(docker exec "$postgres_cid" sh -ceu \
  'psql -X -A -t -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT version FROM atlas_schema_revisions.atlas_schema_revisions WHERE type = 2 ORDER BY executed_at DESC LIMIT 1"')"
[[ "$migration_readback" == "$expected_migration" ]] ||
  fail "fresh database migration readback does not match the release"

stage=first_admin_bootstrap
bootstrap_started=1
write_state running
(
  while IFS= read -r variable; do
    case "$variable" in
    HOME | USER | LOGNAME | PATH) ;;
    *)
      unset "$variable" 2>/dev/null || true
      ;;
    esac
  done < <(compgen -e)
  PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
  export HOME USER LOGNAME PATH
  export APP_ADMIN_PASSWORD="$admin_secret"
  bash "$bootstrap_script" \
    --deployment-target "$target" \
    --env-file "$runtime_env" \
    --compose-dir "$compose_dir" \
    --compose-override "$compose_override" \
    --expected-database "$database" \
    --expected-migration "$expected_migration" \
    --expected-release "$release_sha" \
    --confirm "BOOTSTRAP_PRODUCTION_ADMIN:$project:$database:$admin_username:$expected_migration:$release_sha" \
    >>"$log_file" 2>&1
)
bootstrap_completed=1
admin_secret=""
unset admin_secret APP_ADMIN_PASSWORD

stage=empty_business_baseline
write_state running
business_row_count="$(docker exec "$postgres_cid" sh -ceu \
  'psql -X -A -t -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'\''SQL'\''
SELECT
  (SELECT count(*) FROM customers) +
  (SELECT count(*) FROM suppliers) +
  (SELECT count(*) FROM contacts) +
  (SELECT count(*) FROM units) +
  (SELECT count(*) FROM warehouses) +
  (SELECT count(*) FROM materials) +
  (SELECT count(*) FROM products) +
  (SELECT count(*) FROM product_skus) +
  (SELECT count(*) FROM processes) +
  (SELECT count(*) FROM bom_headers) +
  (SELECT count(*) FROM bom_items) +
  (SELECT count(*) FROM sales_orders) +
  (SELECT count(*) FROM purchase_orders) +
  (SELECT count(*) FROM outsourcing_orders) +
  (SELECT count(*) FROM production_orders) +
  (SELECT count(*) FROM purchase_receipts) +
  (SELECT count(*) FROM purchase_returns) +
  (SELECT count(*) FROM quality_inspections) +
  (SELECT count(*) FROM inventory_txns) +
  (SELECT count(*) FROM shipments) +
  (SELECT count(*) FROM finance_facts) +
  (SELECT count(*) FROM workflow_tasks) +
  (SELECT count(*) FROM process_instances) +
  (SELECT count(*) FROM business_attachments);
SQL')"
[[ "$business_row_count" == 0 ]] ||
  fail "fresh database already contains business rows"
admin_count="$(docker exec "$postgres_cid" sh -ceu \
  'psql -X -A -t -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*) FROM admin_users WHERE is_super_admin AND NOT disabled"')"
[[ "$admin_count" == 1 ]] || fail "fresh database administrator readback failed"

stage=runtime_start_and_verify
write_state running
"${clean_env[@]}" "${compose[@]}" up -d --no-build --pull never \
  postgres jaeger app-server web-desktop >>"$log_file" 2>&1
"${clean_env[@]}" bash "$preflight_script" \
  --deployment-target "$target" \
  --env-file "$runtime_env" \
  --compose-dir "$compose_dir" \
  --compose-override "$compose_override" \
  --runtime \
  --expected-release "$release_sha" \
  --out "$operation_dir/fresh-runtime-preflight-report.txt" \
  >>"$log_file" 2>&1
curl --fail --silent --show-error --max-time 10 \
  "$server_endpoint/healthz" >/dev/null
curl --fail --silent --show-error --max-time 10 \
  "$server_endpoint/readyz" >/dev/null
curl --fail --silent --show-error --max-time 10 \
  "$web_endpoint/healthz" >/dev/null
runtime_sha="$(docker inspect "$project-server" --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^GIT_SHA=//p' | head -n1)"
runtime_web_sha="$(docker inspect "$project-web-desktop" --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^GIT_SHA=//p' | head -n1)"
[[ "$runtime_sha" == "$release_sha" && "$runtime_web_sha" == "$release_sha" ]] ||
  fail "fresh runtime release identity does not match"
[[ -d "$rollback_dir" && ! -L "$rollback_dir" &&
  -d "$data_dir" && ! -L "$data_dir" ]] ||
  fail "database generations were not both preserved"

stage=passed
write_receipt passed none
cat "$receipt"
