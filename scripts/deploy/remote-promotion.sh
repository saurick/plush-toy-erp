#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

print_help() {
  cat <<'USAGE'
Usage:
  bash remote-promotion.sh promote <demo-133|customer-test-133> \
    <operation-id> <40-sha> <version> <release-manifest-sha256> \
    <release-rehearsal-sha256> <promotion-fingerprint> <confirmation>

This script is not a general remote shell. It only operates on the committed
registered target contract and an already transferred, checksum-bound package.
It never builds source or automatically retries a terminal/unknown operation.
USAGE
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
release_rehearsal_sha256="${7:-}"
promotion_fingerprint="${8:-}"
confirmation="${9:-}"

case "$target" in
demo-133)
  root=/home/simon/plush-toy-erp-demo-v1
  runtime_env=$root/runtime/.env.demo-133
  public_endpoint=https://demo.yoyoosun.net
  public_network=plush-toy-erp-demo-v1_default
  public_container_prefix=plush-toy-erp-demo-web-public-
  public_host_port=5176
  public_candidate_port=15176
  project=plush-toy-erp-demo-v1
  database=plush_erp_demo_v1
  compose_override_name=compose.demo-133.yml
  server_endpoint=http://127.0.0.1:8325
  web_endpoint=http://127.0.0.1:5195
  ;;
customer-test-133)
  root=/home/simon/plush-toy-erp-test-v1
  runtime_env=$root/runtime/.env.customer-test-133
  public_endpoint=https://test.yoyoosun.net
  public_network=plush-toy-erp-test-v1_default
  public_container_prefix=plush-toy-erp-test-web-public-
  public_host_port=5177
  public_candidate_port=15177
  project=plush-toy-erp-test-v1
  database=plush_erp_customer_test_v1
  compose_override_name=compose.customer-test-133.yml
  server_endpoint=http://127.0.0.1:8335
  web_endpoint=http://127.0.0.1:5205
  ;;
*)
  printf '[remote-promotion] unsupported target\n' >&2
  exit 1
  ;;
esac
incoming_root=$root/incoming
cache_root=$root/release-cache-v2
releases_root=$root/releases
backups_root=$root/backups
operations_root=$root/operations
run_root=$root/run
current=$root/current
postgres_container=$project-postgres
server_container=$project-server
web_container=$project-web-desktop
minimum_available_bytes=32212254720
promotion_lock=$run_root/promotion.lock

uuid_v4_pattern='^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
sha_pattern='^[0-9a-f]{40}$'
sha256_pattern='^[0-9a-f]{64}$'
version_pattern='^[0-9A-Za-z]([0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$'

fail() {
  printf '[remote-promotion] %s\n' "$1" >&2
  return 1
}

epoch_millis() {
  local seconds
  local nanoseconds
  read -r seconds nanoseconds <<<"$(date '+%s %N' 2>/dev/null || date '+%s')"
  [[ "$seconds" =~ ^[0-9]+$ ]] || fail "millisecond clock is unavailable"
  if [[ "$nanoseconds" =~ ^[0-9]{9}$ ]]; then
    printf '%s%s\n' "$seconds" "${nanoseconds:0:3}"
  else
    printf '%s000\n' "$seconds"
  fi
}

portable_archive_manifest_digest() {
  local archive="$1"
  local image_ref="$2"
  local config_digest="$3"
  local config_path
  local actual_config_sha256
  local actual_manifest_sha256
  local manifest_digest
  local manifest_member
  config_path="blobs/sha256/${config_digest#sha256:}"
  tar -xOf "$archive" manifest.json |
    jq -e \
      --arg ref "$image_ref" \
      --arg configPath "$config_path" \
      'type == "array" and length == 1 and
       .[0].Config == $configPath and
       (.[0].RepoTags | type == "array" and
        length == 1 and .[0] == $ref)' \
      >/dev/null
  actual_config_sha256="$(
    tar -xOf "$archive" "$config_path" | sha256sum | awk '{print $1}'
  )"
  [[ "$actual_config_sha256" == "${config_digest#sha256:}" ]] ||
    fail "image archive config checksum does not match"
  manifest_digest="$(
    tar -xOf "$archive" index.json |
      jq -er \
        'select(.schemaVersion == 2 and
                (.manifests | type == "array" and length == 1)) |
         .manifests[0].digest'
  )"
  [[ "$manifest_digest" =~ ^sha256:[0-9a-f]{64}$ ]] ||
    fail "image archive manifest digest is invalid"
  manifest_member="blobs/sha256/${manifest_digest#sha256:}"
  actual_manifest_sha256="$(
    tar -xOf "$archive" "$manifest_member" | sha256sum | awk '{print $1}'
  )"
  [[ "$actual_manifest_sha256" == "${manifest_digest#sha256:}" ]] ||
    fail "image archive manifest checksum does not match"
  tar -xOf "$archive" "$manifest_member" |
    jq -e \
      --arg configDigest "$config_digest" \
      '.schemaVersion == 2 and .config.digest == $configDigest' \
      >/dev/null
  printf '%s\n' "$manifest_digest"
}

[[ "$action" == promote ]] || fail "unsupported action"
[[ "$operation_id" =~ $uuid_v4_pattern ]] || fail "invalid operation id"
[[ "$release_sha" =~ $sha_pattern ]] || fail "invalid release SHA"
[[ "$release_version" =~ $version_pattern ]] || fail "invalid release version"
[[ "$release_manifest_sha256" =~ $sha256_pattern ]] ||
  fail "invalid release manifest SHA-256"
[[ "$release_rehearsal_sha256" =~ $sha256_pattern ]] ||
  fail "invalid release rehearsal SHA-256"
[[ "$promotion_fingerprint" =~ $sha256_pattern ]] ||
  fail "invalid promotion fingerprint"
[[ "$confirmation" == "PROMOTE:$target:$release_sha:$operation_id" ]] ||
  fail "promotion confirmation does not match"
[[ "$(hostname)" == r640 && "$(id -un)" == simon ]] ||
  fail "remote host/user identity does not match"

incoming=$incoming_root/$operation_id
operation_dir=$operations_root/$operation_id
receipt=$operation_dir/receipt.json
state_file=$operation_dir/state.json
log_file=$operation_dir/operation.log
release_dir=$releases_root/$release_sha
release_identity=$release_dir/.plush-release-identity.json
restore_database="plush_restore_${operation_id//-/}"
restore_database="${restore_database:0:50}"
restore_database_created=0
stage=initial
migration_apply_started=0
env_changed=0
runtime_stop_started=0
env_backup=""
current_before_sha=unknown
backup_sha256=none
backup_size_bytes=0
server_content_id=unknown
web_content_id=unknown
server_ref=unknown
web_ref=unknown
cache_package_hit=false
cache_image_hit=false
cache_source=none
cache_avoided_bytes=0
cache_basis='[]'
acquisition_mode=none
acquisition_downloaded_bytes=0
acquisition_expected_bytes=0
acquisition_verified=false
credential_cleanup_proven=false
fetch_materializing=""
fetch_materializing_created=0
fetch_payloads_published=0
cache_materializing=""
cache_materializing_created=0
release_materializing=""
release_materializing_created=0
operation_started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
operation_started_epoch_ms="$(epoch_millis)"
stage_started_epoch_ms="$operation_started_epoch_ms"
stage_finalized=0
stage_timings='[]'

mkdir -p "$operations_root" "$run_root"
chmod 700 "$operations_root" "$run_root"
mkdir "$operation_dir" 2>/dev/null || true
[[ -d "$operation_dir" && ! -L "$operation_dir" ]] ||
  fail "operation directory is invalid"
chmod 700 "$operation_dir"

exec 9>>"$promotion_lock"
chmod 600 "$promotion_lock"
if ! flock -n 9; then
  fail "another promotion or rollback holds the fixed target lock"
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
  local next="$state_file.tmp"
  jq -n \
    --arg schemaVersion "plush.remote-promotion-state/v1" \
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

record_current_stage() {
  local stage_status="$1"
  local finished_epoch_ms
  local stage_duration_ms
  if [[ "$stage" == initial || "$stage" == passed || "$stage_finalized" -eq 1 ]]; then
    return 0
  fi
  finished_epoch_ms="$(epoch_millis)"
  stage_duration_ms=$((finished_epoch_ms - stage_started_epoch_ms))
  stage_timings="$(
    jq -c \
      --arg id "$stage" \
      --arg status "$stage_status" \
      --argjson durationMs "$stage_duration_ms" \
      '. + [{id: $id, status: $status, durationMs: $durationMs}]' \
      <<<"$stage_timings"
  )"
  stage_finalized=1
}

enter_stage() {
  record_current_stage passed
  stage="$1"
  stage_started_epoch_ms="$(epoch_millis)"
  stage_finalized=0
  write_state running
}

write_receipt() {
  local status="$1"
  local issue_code="$2"
  local next="$receipt.tmp"
  local finished_at
  local finished_epoch_ms
  local duration_ms
  record_current_stage failed
  finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  finished_epoch_ms="$(epoch_millis)"
  duration_ms=$((finished_epoch_ms - operation_started_epoch_ms))
  jq -n \
    --arg schemaVersion "plush.remote-promotion-receipt/v5" \
    --arg status "$status" \
    --arg operationId "$operation_id" \
    --arg target "$target" \
    --arg gitSha "$release_sha" \
    --arg version "$release_version" \
    --arg releaseManifestSha256 "$release_manifest_sha256" \
    --arg releaseRehearsalSha256 "$release_rehearsal_sha256" \
    --arg promotionFingerprint "$promotion_fingerprint" \
    --arg stage "$stage" \
    --arg issueCode "$issue_code" \
    --arg currentBeforeSha "$current_before_sha" \
    --arg serverContentId "$server_content_id" \
    --arg webContentId "$web_content_id" \
    --arg backupSha256 "$backup_sha256" \
    --argjson backupSizeBytes "$backup_size_bytes" \
    --argjson migrationApplyStarted "$migration_apply_started" \
    --arg startedAt "$operation_started_at" \
    --arg finishedAt "$finished_at" \
    --argjson durationMs "$duration_ms" \
    --argjson timings "$stage_timings" \
    --argjson cachePackageHit "$cache_package_hit" \
    --argjson cacheImageHit "$cache_image_hit" \
    --arg cacheSource "$cache_source" \
    --argjson cacheAvoidedBytes "$cache_avoided_bytes" \
    --argjson cacheBasis "$cache_basis" \
    --arg acquisitionMode "$acquisition_mode" \
    --argjson acquisitionDownloadedBytes "$acquisition_downloaded_bytes" \
    --argjson acquisitionExpectedBytes "$acquisition_expected_bytes" \
    --argjson acquisitionVerified "$acquisition_verified" \
    --argjson credentialCleanupProven "$credential_cleanup_proven" \
    '{
      schemaVersion: $schemaVersion,
      status: $status,
      operationId: $operationId,
      target: $target,
      gitSha: $gitSha,
      version: $version,
      releaseManifestSha256: $releaseManifestSha256,
      releaseRehearsalSha256: $releaseRehearsalSha256,
      promotionFingerprint: $promotionFingerprint,
      stage: $stage,
      issueCode: $issueCode,
      before: { runtimeSha: $currentBeforeSha },
      cache: {
        packageHit: $cachePackageHit,
        imageHit: $cacheImageHit,
        cacheSource: $cacheSource,
        avoidedBytes: $cacheAvoidedBytes,
        dockerLoadSkipped: $cacheImageHit,
        basis: $cacheBasis,
        stillExecuted: ["migration", "health", "ready", "public_entry"]
      },
      acquisition: {
        mode: $acquisitionMode,
        downloadedBytes: $acquisitionDownloadedBytes,
        expectedBytes: $acquisitionExpectedBytes,
        catalogAndChecksumsVerified: $acquisitionVerified,
        credentialCleanupProven: $credentialCleanupProven
      },
      images: {
        serverContentId: $serverContentId,
        webContentId: $webContentId
      },
      rollbackPoint: {
        backupAlias: ("pre-migration-" + ($gitSha[0:12]) + "-" + $operationId),
        backupSha256: $backupSha256,
        backupSizeBytes: $backupSizeBytes,
        restoreChecked: ($backupSha256 != "none")
      },
      migration: {
        automaticDownMigration: false,
        applyStarted: ($migrationApplyStarted == 1)
      },
      checks: {
        releaseIdentity: ($status == "passed"),
        health: ($status == "passed"),
        ready: ($status == "passed"),
        basicSmoke: ($status == "passed"),
        publicEntry: ($status == "passed")
      },
      startedAt: $startedAt,
      finishedAt: $finishedAt,
      durationMs: $durationMs,
      timings: $timings,
      redaction: {
        containsSecrets: false,
        containsCredentials: false,
        containsAbsolutePaths: false,
        containsRawEnvironmentValues: false,
        containsRawLogs: false
      },
      notProven: [
        "credentialed role matrix and PDF smoke",
        "customer UAT and sign-off"
      ]
    }' >"$next"
  chmod 600 "$next"
  mv -f "$next" "$receipt"
  write_state "$status"
}

restore_database_cleanup() {
  if [[ "$restore_database_created" -eq 1 ]]; then
    docker exec "$postgres_container" sh -ceu \
      'dropdb --if-exists --force -U "$POSTGRES_USER" "$1"' \
      sh "$restore_database" >/dev/null 2>&1 || true
    restore_database_created=0
  fi
}

cleanup_transient_materialization() {
  local candidate
  credential_cleanup_proven=false
  unset target_fetch_token
  if [[ "$fetch_payloads_published" -eq 1 ]]; then
    rm -f -- \
      "$incoming/checksums.sha256" "$incoming/release-artifact.json" \
      "$incoming/release-manifest.json" "$incoming/release-rehearsal.json" \
      "$incoming/sbom.cdx.json" "$incoming/server-image.tar" \
      "$incoming/source.tar" "$incoming/web-image.tar" 2>/dev/null || true
    fetch_payloads_published=0
  fi
  if [[ "$fetch_materializing_created" -eq 1 ]]; then
    candidate="$fetch_materializing"
    if [[ "$candidate" == "$incoming/.acquire-$operation_id" &&
      -d "$candidate" && ! -L "$candidate" &&
      "$(stat -c '%u' "$candidate" 2>/dev/null || true)" == "$(id -u)" ]]; then
      rm -rf -- "$candidate" ||
        printf '[remote-promotion] failed to clean acquisition materialization\n' >&2
    fi
    fetch_materializing_created=0
  fi
  if [[ -z "${target_fetch_token+x}" &&
    (-z "$fetch_materializing" ||
    (! -e "$fetch_materializing/curl.conf" && ! -L "$fetch_materializing/curl.conf")) ]]; then
    credential_cleanup_proven=true
  fi
  if [[ "$cache_materializing_created" -eq 1 ]]; then
    candidate="$cache_materializing"
    if [[ "$candidate" == "$cache_root/.materializing-$operation_id" &&
      -d "$candidate" && ! -L "$candidate" &&
      "$(stat -c '%u' "$candidate" 2>/dev/null || true)" == "$(id -u)" ]]; then
      rm -rf -- "$candidate" ||
        printf '[remote-promotion] failed to clean cache materialization\n' >&2
    fi
    cache_materializing_created=0
  fi
  if [[ "$release_materializing_created" -eq 1 ]]; then
    candidate="$release_materializing"
    if [[ "$candidate" == "$releases_root/.materializing-$operation_id" &&
      -d "$candidate" && ! -L "$candidate" &&
      "$(stat -c '%u' "$candidate" 2>/dev/null || true)" == "$(id -u)" ]]; then
      rm -rf -- "$candidate" ||
        printf '[remote-promotion] failed to clean release materialization\n' >&2
    fi
    release_materializing_created=0
  fi
}

recover_before_migration() {
  local recovered_public_containers
  local recovered_public_count
  local recovered_public_image
  local recovered_public_sha
  local recovered_server_sha
  local recovered_web_sha
  local recovery_cutover_script
  local recovery_required=0
  if [[ "$env_changed" -eq 1 || "$runtime_stop_started" -eq 1 ]]; then
    recovery_required=1
  fi
  [[ "$recovery_required" -eq 1 ]] || return 0
  [[ "$current_before_sha" =~ $sha_pattern ]] || return 1
  if [[ "$env_changed" -eq 1 && -n "$env_backup" && -f "$env_backup" ]]; then
    cp "$env_backup" "$runtime_env.recovering"
    chmod 600 "$runtime_env.recovering"
    mv -f "$runtime_env.recovering" "$runtime_env"
    env_changed=0
  elif [[ "$env_changed" -eq 1 ]]; then
    return 1
  fi
  [[ "$migration_apply_started" -eq 0 && -d "$current" && ! -L "$current" ]] ||
    return 1
  env -i \
    "HOME=$HOME" "USER=$(id -un)" "LOGNAME=$(id -un)" \
    "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    docker compose \
    -p "$project" \
    --env-file "$runtime_env" \
    -f "$current/server/deploy/compose/prod/compose.yml" \
    -f "$current/server/deploy/compose/prod/$compose_override_name" \
    up -d --no-build --pull never postgres jaeger app-server web-desktop \
    >>"$log_file" 2>&1 || return 1
  curl --fail --silent --show-error --max-time 10 \
    "$server_endpoint/healthz" >/dev/null 2>&1 || return 1
  curl --fail --silent --show-error --max-time 10 \
    "$server_endpoint/readyz" >/dev/null 2>&1 || return 1
  curl --fail --silent --show-error --max-time 10 \
    "$web_endpoint/healthz" >/dev/null 2>&1 || return 1
  recovered_server_sha="$(docker inspect "$server_container" --format '{{range .Config.Env}}{{println .}}{{end}}' |
    sed -n 's/^GIT_SHA=//p' | head -n1)"
  recovered_web_sha="$(docker inspect "$web_container" --format '{{range .Config.Env}}{{println .}}{{end}}' |
    sed -n 's/^GIT_SHA=//p' | head -n1)"
  [[ "$recovered_server_sha" == "$current_before_sha" &&
    "$recovered_web_sha" == "$current_before_sha" ]] || return 1
  recovered_public_containers="$(
    docker ps --format '{{.Names}}' |
      grep -E "^${public_container_prefix}[0-9a-f]{8}$" || true
  )"
  recovered_public_count="$(printf '%s\n' "$recovered_public_containers" | sed '/^$/d' | wc -l | tr -d ' ')"
  [[ "$recovered_public_count" == 1 ]] || return 1
  recovered_public_sha="$(docker inspect "$recovered_public_containers" \
    --format '{{range .Config.Env}}{{println .}}{{end}}' |
    sed -n 's/^GIT_SHA=//p' | head -n1)"
  recovered_public_image="$(docker inspect "$recovered_public_containers" --format '{{.Config.Image}}')"
  [[ "$recovered_public_sha" == "$current_before_sha" &&
    -n "$recovered_public_image" ]] || return 1
  recovery_cutover_script=$current/deployments/yoyoosun/scripts/cutover-public-web.sh
  [[ -f "$recovery_cutover_script" && ! -L "$recovery_cutover_script" ]] ||
    return 1
  bash "$recovery_cutover_script" \
    --image "$recovered_public_image" \
    --release "$current_before_sha" \
    --current-container "$recovered_public_containers" \
    --endpoint "$public_endpoint" \
    --api-origin http://app-server:8300 \
    --network "$public_network" \
    --container-prefix "$public_container_prefix" \
    --host-port "$public_host_port" \
    --candidate-port "$public_candidate_port" \
    --execute \
    --confirm "PUBLIC_WEB_CUTOVER:$recovered_public_containers:$current_before_sha" \
    >>"$log_file" 2>&1 || return 1
  runtime_stop_started=0
}

on_error() {
  local exit_code=$?
  local recovery_required=0
  local recovery_proven=1
  trap - ERR
  cleanup_transient_materialization
  restore_database_cleanup
  if [[ "$migration_apply_started" -eq 0 &&
    ("$env_changed" -eq 1 || "$runtime_stop_started" -eq 1) ]]; then
    recovery_required=1
    recover_before_migration || recovery_proven=0
  fi
  if [[ "$credential_cleanup_proven" != true ]]; then
    write_receipt not_proven promotion_credential_cleanup_not_proven
  elif [[ "$migration_apply_started" -ne 0 ]]; then
    write_receipt not_proven promotion_outcome_unknown_after_migration_start
  elif [[ "$recovery_proven" -ne 1 ]]; then
    write_receipt not_proven promotion_previous_release_recovery_not_proven
  elif [[ "$recovery_required" -eq 1 ]]; then
    write_receipt failed promotion_failed_previous_release_restored
  else
    write_receipt failed promotion_failed_before_target_change
  fi
  cat "$receipt"
  printf '[remote-promotion] failed at stage=%s exit=%s\n' "$stage" "$exit_code" >&2
  exit "$exit_code"
}
on_signal() {
  trap - ERR HUP INT TERM
  cleanup_transient_materialization
  restore_database_cleanup
  if [[ "$migration_apply_started" -eq 0 &&
    ("$env_changed" -eq 1 || "$runtime_stop_started" -eq 1) ]]; then
    recover_before_migration || true
  fi
  write_receipt not_proven promotion_interrupted
  cat "$receipt"
  exit 130
}
on_exit() {
  cleanup_transient_materialization
  restore_database_cleanup
}
trap on_error ERR
trap on_signal HUP INT TERM
trap on_exit EXIT

: >"$log_file"
chmod 600 "$log_file"
write_state running

[[ -f "$incoming/remote-release-acquire.sh" &&
  ! -L "$incoming/remote-release-acquire.sh" ]] ||
  fail "target release acquisition helper is invalid"
# shellcheck source=scripts/deploy/remote-release-acquire.sh
source "$incoming/remote-release-acquire.sh"
target_fetch_token=""
IFS= read -r target_fetch_token || true

enter_stage artifact_fetch
acquire_target_release

enter_stage package_verification
[[ -d "$incoming" && ! -L "$incoming" ]] ||
  fail "incoming package directory is invalid"
incoming_uid="$(stat -c '%u' "$incoming")"
[[ "$incoming_uid" == "$(id -u)" ]] ||
  fail "incoming package ownership is invalid"
required_files=(
  .target-cache.json
  checksums.sha256
  release-manifest.json
  release-artifact.json
  promotion-manifest.json
  release-rehearsal.json
  sbom.cdx.json
  source.tar
  server-image.tar
  web-image.tar
  remote-promotion.sh
  remote-release-acquire.sh
  target-release-fetch.json
  transfer-checksums.sha256
)
for required_file in "${required_files[@]}"; do
  [[ -f "$incoming/$required_file" && ! -L "$incoming/$required_file" ]] ||
    fail "incoming package is incomplete"
done
jq -e \
  --arg operationId "$operation_id" \
  --arg manifest "$release_manifest_sha256" \
  '.schemaVersion == "plush.target-release-cache/v2" and
   .operationId == $operationId and
   .releaseManifestSha256 == $manifest and
   (.packageHit | type == "boolean") and
   (.imageHit | type == "boolean") and
   (.avoidedBytes | type == "number") and .avoidedBytes >= 0 and
   (.cacheSource == "none" or .cacheSource == "formal" or .cacheSource == "retained_operation") and
   (.basis | type == "array") and
   (if .packageHit then (
      .avoidedBytes > 0 and
      (.cacheSource == "formal" or .cacheSource == "retained_operation") and
      .basis == ["release_manifest_sha256","archive_sha256","registry_digest","docker_content_id","embedded_git_sha"]
    )
    else (.imageHit == false and .avoidedBytes == 0 and .cacheSource == "none" and (.basis | length) == 0) end)' \
  "$incoming/.target-cache.json" >/dev/null
cache_package_hit="$(jq -r '.packageHit' "$incoming/.target-cache.json")"
cache_image_hit="$(jq -r '.imageHit' "$incoming/.target-cache.json")"
cache_source="$(jq -r '.cacheSource' "$incoming/.target-cache.json")"
cache_avoided_bytes="$(jq -r '.avoidedBytes' "$incoming/.target-cache.json")"
cache_basis="$(jq -c '.basis' "$incoming/.target-cache.json")"
(
  cd "$incoming"
  sha256sum --check --strict transfer-checksums.sha256
) >>"$log_file" 2>&1
[[ "$(sha256sum "$incoming/release-manifest.json" | awk '{print $1}')" == "$release_manifest_sha256" ]] ||
  fail "release manifest checksum does not match the operation"

jq -e \
  --arg sha "$release_sha" \
  --arg version "$release_version" \
  --arg artifactSha "$(sha256sum "$incoming/release-artifact.json" | awk '{print $1}')" \
  '.schemaVersion == "plush.release-manifest/v2" and
   .passed == true and
   .gitSha == $sha and
   .version == $version and
   .strict.status == "passed" and
   .rehearsal.status == "passed" and
   (.rehearsal.receiptSha256 | test("^[0-9a-f]{64}$")) and
   .rehearsal.cleanup.passed == true and
   .rehearsal.cleanup.residualContainers == 0 and
   .artifact.manifestSha256 == $artifactSha and
   .rollback.databaseDownMigrationAutomatic == false' \
  "$incoming/release-manifest.json" >/dev/null
actual_release_rehearsal_sha256="$(sha256sum "$incoming/release-rehearsal.json" | awk '{print $1}')"
[[ "$actual_release_rehearsal_sha256" == "$release_rehearsal_sha256" &&
  "$actual_release_rehearsal_sha256" == "$(jq -r '.rehearsal.receiptSha256' "$incoming/release-manifest.json")" ]] ||
  fail "release rehearsal checksum does not match the release manifest"
jq -e \
  --arg operationId "$operation_id" \
  --arg target "$target" \
  --arg sha "$release_sha" \
  --arg fingerprint "$promotion_fingerprint" \
  --arg rehearsalSha256 "$release_rehearsal_sha256" \
  '.schemaVersion == "plush.promotion-manifest/v1" and
   .status == "eligible" and
   .operationId == $operationId and
   .target.key == $target and
   .release.gitSha == $sha and
   .ancestry.schemaVersion == "plush.git-ancestry-relation/v1" and
   .ancestry.currentGitSha == .before.runtimeSha and
   .ancestry.candidateGitSha == $sha and
   .ancestry.relation == "ahead" and
   .ancestry.actionClass == "promote" and
   .ancestry.actionReason == "candidate_descends_from_current" and
   .release.rehearsalReceiptFile == "release-rehearsal.json" and
   .release.rehearsalReceiptSha256 == $rehearsalSha256 and
   .fingerprint == $fingerprint and
   .rollback.automaticDatabaseDownMigration == false' \
  "$incoming/promotion-manifest.json" >/dev/null
jq -e \
  --arg sha "$release_sha" \
  --arg version "$release_version" \
  '.schemaVersion == "plush-release-artifact/v1" and
   .passed == true and
   .git.commit == $sha and
   .git.head == $sha and
   .git.worktreeClean == true and
   .releaseVersion == $version and
   (.images | length) == 2' \
  "$incoming/release-artifact.json" >/dev/null
jq -e -s '
  .[0] as $release |
  .[1] as $artifact |
  .[2] as $promotion |
  ($artifact.releaseVersion == $release.version) and
  ($release.artifact.sourceArchiveSha256 == $artifact.sourceArchive.sha256) and
  ($release.migration.latest == $artifact.migration.latest) and
  ($release.migration.sequenceSha256 == $artifact.migration.sequenceSha256) and
  ($release.customerConfig.sourceSha256 == $artifact.customerConfig.sourceSha256) and
  ($release.sbom.sha256 == $artifact.sbom.sha256) and
  (($release.images | map({kind, sourceContentId, platform}) | sort_by(.kind)) ==
   ($artifact.images | map({kind, sourceContentId: .contentId, platform}) | sort_by(.kind))) and
  (($promotion.release.images | map({kind, sourceContentId}) | sort_by(.kind)) ==
   ($artifact.images | map({kind, sourceContentId: .contentId}) | sort_by(.kind))) and
  ($promotion.release.artifactManifestSha256 == $release.artifact.manifestSha256) and
  ($promotion.release.sourceArchiveSha256 == $release.artifact.sourceArchiveSha256)
' \
  "$incoming/release-manifest.json" \
  "$incoming/release-artifact.json" \
  "$incoming/promotion-manifest.json" >/dev/null
jq -e -s \
  --arg sha "$release_sha" \
  'def runtime_ok($value; $gitSha):
     $value.serverHealth == "passed" and
     $value.serverReady == "passed" and
     $value.webHealth == "passed" and
     $value.webRoot == "passed" and
     $value.runtimeIdentity == "passed" and
     $value.authenticatedAdmin == "passed" and
     $value.embeddedGitSha == $gitSha;
   .[0] as $receipt |
   .[1] as $artifact |
   .[2] as $release |
   ($artifact.images | map({key: .kind, value: .contentId}) | from_entries) as $content |
   $receipt.schemaVersion == "plush-local-release-rehearsal/v1" and
   $receipt.passed == true and
   $receipt.customer == "yoyoosun" and
   $receipt.git.commit == $sha and
   $receipt.git.head == $sha and
   $receipt.git.worktreeClean == true and
   $receipt.artifact.manifestSchema == $artifact.schemaVersion and
   $receipt.artifact.server == $content.server and
   $receipt.artifact.web == $content.web and
   $receipt.artifact.migrationSequenceSha256 == $artifact.migration.sequenceSha256 and
   $receipt.artifact.sbomSha256 == $artifact.sbom.sha256 and
   $receipt.environment.kind == "local-isolated-release-compose" and
   $receipt.environment.databaseIdentityBound == true and
   $receipt.environment.composeSource == "server/deploy/compose/prod/compose.yml" and
   $receipt.migration.latest == $artifact.migration.latest and
   $receipt.migration.sequenceSha256 == $artifact.migration.sequenceSha256 and
   $receipt.migration.directoryValidation == "passed" and
   $receipt.migration.dryRun == "passed" and
   $receipt.migration.apply == "passed" and
   $receipt.migration.readback == "passed" and
   runtime_ok($receipt.runtime.initial; $sha) and
   runtime_ok($receipt.runtime.steadyStateRestart; $sha) and
   $receipt.backupRestore.status == "passed" and
   ($receipt.backupRestore.backupSha256 | test("^[0-9a-f]{64}$")) and
   ($receipt.backupRestore.backupSizeBytes | type) == "number" and
   $receipt.backupRestore.backupSizeBytes >= 1 and
   $receipt.backupRestore.dumpRetained == false and
   $receipt.recoveryRestart.status == "passed" and
   $receipt.recoveryRestart.bootstrapSecretRemoved == true and
   $receipt.recoveryRestart.sameServerContentId == true and
   $receipt.recoveryRestart.sameWebContentId == true and
   $receipt.recoveryRestart.healthReadyAndLoginRecovered == true and
   $receipt.recoveryRestart.customerConfigRecovered == true and
   $receipt.cleanup.attempted == true and
   $receipt.cleanup.passed == true and
   $receipt.cleanup.residualContainers == 0 and
   $receipt.cleanup.temporaryDatabaseRetained == false and
   $receipt.failure == null and
   $receipt.redaction.containsSecrets == false and
   $receipt.redaction.containsCredentials == false and
   $receipt.redaction.containsFullDsn == false and
   $receipt.redaction.containsAbsoluteWorkspacePaths == false and
   $receipt.redaction.containsRawCustomerRows == false and
   $receipt.schemaVersion == $release.rehearsal.contract and
   $receipt.generatedAt == $release.rehearsal.generatedAt and
   $receipt.finishedAt == $release.rehearsal.finishedAt and
   $receipt.git.commit == $release.rehearsal.gitSha and
   $receipt.artifact.manifestSchema == $release.rehearsal.artifact.manifestSchema and
   $receipt.artifact.server == $release.rehearsal.artifact.serverContentId and
   $receipt.artifact.web == $release.rehearsal.artifact.webContentId and
   $receipt.artifact.migrationSequenceSha256 == $release.rehearsal.artifact.migrationSequenceSha256 and
   $receipt.artifact.sbomSha256 == $release.rehearsal.artifact.sbomSha256' \
  "$incoming/release-rehearsal.json" \
  "$incoming/release-artifact.json" \
  "$incoming/release-manifest.json" >/dev/null
rehearsal_archive=$operation_dir/release-rehearsal.json
if [[ -e "$rehearsal_archive" ]]; then
  [[ -f "$rehearsal_archive" && ! -L "$rehearsal_archive" ]] ||
    fail "archived release rehearsal receipt is invalid"
  cmp --silent "$incoming/release-rehearsal.json" "$rehearsal_archive" ||
    fail "archived release rehearsal receipt conflicts with this operation"
else
  cp "$incoming/release-rehearsal.json" "$rehearsal_archive.tmp"
  chmod 600 "$rehearsal_archive.tmp"
  mv "$rehearsal_archive.tmp" "$rehearsal_archive"
fi

source_sha256="$(jq -r '.sourceArchive.sha256' "$incoming/release-artifact.json")"
sbom_sha256="$(jq -r '.sbom.sha256' "$incoming/release-artifact.json")"
migration_sequence_sha256="$(jq -r '.migration.sequenceSha256' "$incoming/release-artifact.json")"
[[ "$source_sha256" =~ $sha256_pattern && "$sbom_sha256" =~ $sha256_pattern &&
  "$migration_sequence_sha256" =~ $sha256_pattern ]] ||
  fail "release artifact checksums are invalid"
[[ "$(sha256sum "$incoming/source.tar" | awk '{print $1}')" == "$source_sha256" ]] ||
  fail "source archive checksum does not match"
[[ "$(sha256sum "$incoming/sbom.cdx.json" | awk '{print $1}')" == "$sbom_sha256" ]] ||
  fail "SBOM checksum does not match"

server_ref="$(jq -r '.images[] | select(.kind == "server") | .ref' "$incoming/release-artifact.json")"
web_ref="$(jq -r '.images[] | select(.kind == "web") | .ref' "$incoming/release-artifact.json")"
server_content_id="$(jq -r '.images[] | select(.kind == "server") | .contentId' "$incoming/release-artifact.json")"
web_content_id="$(jq -r '.images[] | select(.kind == "web") | .contentId' "$incoming/release-artifact.json")"
[[ "$server_ref" =~ ^plush-toy-erp-server:yoyoosun-[0-9a-f]{40}$ ]] ||
  fail "server image reference is invalid"
[[ "$web_ref" =~ ^plush-toy-erp-web:yoyoosun-[0-9a-f]{40}$ ]] ||
  fail "web image reference is invalid"
[[ "$server_ref" == *"$release_sha" && "$web_ref" == *"$release_sha" ]] ||
  fail "image references do not match the release SHA"
[[ "$server_content_id" =~ ^sha256:[0-9a-f]{64}$ &&
  "$web_content_id" =~ ^sha256:[0-9a-f]{64}$ ]] ||
  fail "image content IDs are invalid"
server_archive_manifest_digest="$(
  portable_archive_manifest_digest \
    "$incoming/server-image.tar" "$server_ref" "$server_content_id"
)"
web_archive_manifest_digest="$(
  portable_archive_manifest_digest \
    "$incoming/web-image.tar" "$web_ref" "$web_content_id"
)"

enter_stage capacity_recheck
available_bytes="$(df -B1 --output=avail / | awk 'NR==2 {print $1}')"
[[ "$available_bytes" =~ ^[0-9]+$ &&
  "$available_bytes" -ge "$minimum_available_bytes" ]] ||
  fail "target disk capacity is below the fixed minimum"
frozen_current_sha="$(jq -er '.ancestry.currentGitSha' "$incoming/promotion-manifest.json")"
runtime_server_sha="$(docker inspect "$server_container" --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^GIT_SHA=//p' | head -n1)"
runtime_web_sha="$(docker inspect "$web_container" --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^GIT_SHA=//p' | head -n1)"
[[ "$frozen_current_sha" =~ $sha_pattern &&
  "$runtime_server_sha" == "$frozen_current_sha" &&
  "$runtime_web_sha" == "$frozen_current_sha" ]] ||
  fail "target runtime or Git ancestry changed after promotion qualification"
current_before_sha="$runtime_server_sha"

mkdir -p "$cache_root"
chmod 700 "$cache_root"
formal_cache=$cache_root/$release_manifest_sha256
immutable_cache_files=(
  checksums.sha256
  release-manifest.json
  release-artifact.json
  release-rehearsal.json
  sbom.cdx.json
  source.tar
  server-image.tar
  web-image.tar
)
if [[ -e "$formal_cache" ]]; then
  [[ -d "$formal_cache" && ! -L "$formal_cache" &&
    "$(stat -c '%u' "$formal_cache")" == "$(id -u)" ]] ||
    fail "formal release cache is invalid"
  [[ "$(find "$formal_cache" -mindepth 1 -maxdepth 1 -printf '.' | wc -c | tr -d ' ')" == "${#immutable_cache_files[@]}" ]] ||
    fail "formal release cache inventory is invalid"
  for cache_file in "${immutable_cache_files[@]}"; do
    [[ -f "$formal_cache/$cache_file" && ! -L "$formal_cache/$cache_file" &&
      "$(stat -c '%u' "$formal_cache/$cache_file")" == "$(id -u)" ]] ||
      fail "formal release cache is incomplete"
    cmp --silent "$incoming/$cache_file" "$formal_cache/$cache_file" ||
      fail "formal release cache identity conflicts with verified package"
  done
else
  cache_materializing=$cache_root/.materializing-$operation_id
  [[ ! -e "$cache_materializing" ]] || fail "stale release cache materialization exists"
  mkdir "$cache_materializing"
  cache_materializing_created=1
  chmod 700 "$cache_materializing"
  for cache_file in "${immutable_cache_files[@]}"; do
    ln "$incoming/$cache_file" "$cache_materializing/$cache_file"
  done
  mv "$cache_materializing" "$formal_cache"
  cache_materializing_created=0
fi

enter_stage release_materialization
if [[ -e "$release_dir" ]]; then
  [[ -d "$release_dir" && ! -L "$release_dir" &&
    -f "$release_identity" && ! -L "$release_identity" ]] ||
    fail "existing release directory has no trusted identity"
  jq -e \
    --arg sha "$release_sha" \
    --arg sourceSha256 "$source_sha256" \
    '.schemaVersion == "plush.target-release-identity/v1" and
     .gitSha == $sha and .sourceArchiveSha256 == $sourceSha256' \
    "$release_identity" >/dev/null
else
  release_materializing="$releases_root/.materializing-$operation_id"
  [[ ! -e "$release_materializing" ]] || fail "stale materialization directory exists"
  mkdir "$release_materializing"
  release_materializing_created=1
  chmod 700 "$release_materializing"
  if tar -tf "$incoming/source.tar" |
    awk '
      /^\// { exit 1 }
      /(^|\/)\.\.?($|\/)/ { exit 1 }
      { next }
    '; then
    :
  else
    fail "source archive contains an unsafe path"
  fi
  tar --extract --file "$incoming/source.tar" \
    --directory "$release_materializing" --no-same-owner --no-same-permissions
  database_roles_script=$release_materializing/server/deploy/compose/prod/database_roles.sh
  owner_uid="$(stat -c '%u' "$database_roles_script" 2>/dev/null || true)"
  [[ -f "$database_roles_script" && ! -L "$database_roles_script" &&
    "$owner_uid" == "$(id -u)" ]] ||
    fail "database role initializer is invalid"
  chmod 755 "$database_roles_script"
  jq -n \
    --arg schemaVersion "plush.target-release-identity/v1" \
    --arg gitSha "$release_sha" \
    --arg sourceArchiveSha256 "$source_sha256" \
    --arg releaseManifestSha256 "$release_manifest_sha256" \
    '{
      schemaVersion: $schemaVersion,
      gitSha: $gitSha,
      sourceArchiveSha256: $sourceArchiveSha256,
      releaseManifestSha256: $releaseManifestSha256
    }' >"$release_materializing/.plush-release-identity.json"
  chmod 600 "$release_materializing/.plush-release-identity.json"
  mv "$release_materializing" "$release_dir"
  release_materializing_created=0
fi
cmp --silent \
  "$incoming/remote-promotion.sh" \
  "$release_dir/scripts/deploy/remote-promotion.sh" ||
  fail "remote promotion script is not part of the exact source archive"
cmp --silent \
  "$incoming/remote-release-acquire.sh" \
  "$release_dir/scripts/deploy/remote-release-acquire.sh" ||
  fail "release acquisition helper is not part of the exact source archive"

enter_stage image_load_and_readback
if [[ "$cache_image_hit" != true ]]; then
  docker load --input "$incoming/server-image.tar" >>"$log_file" 2>&1
  docker load --input "$incoming/web-image.tar" >>"$log_file" 2>&1
fi
actual_server_content_id="$(docker image inspect --format '{{.Id}}' "$server_ref")"
actual_web_content_id="$(docker image inspect --format '{{.Id}}' "$web_ref")"
[[ ("$actual_server_content_id" == "$server_content_id" ||
  "$actual_server_content_id" == "$server_archive_manifest_digest") &&
  ("$actual_web_content_id" == "$web_content_id" ||
  "$actual_web_content_id" == "$web_archive_manifest_digest") ]] ||
  fail "loaded image content IDs do not match"
for image_ref in "$server_ref" "$web_ref"; do
  image_platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image_ref")"
  image_sha="$(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$image_ref" |
    sed -n 's/^GIT_SHA=//p' | head -n1)"
  [[ "$image_platform" == linux/amd64 && "$image_sha" == "$release_sha" ]] ||
    fail "loaded image platform or embedded release identity does not match"
done

enter_stage fresh_backup_and_restore_check
postgres_cid="$(docker ps -q \
  --filter "label=com.docker.compose.project=$project" \
  --filter "label=com.docker.compose.service=postgres")"
[[ "$(printf '%s\n' "$postgres_cid" | sed '/^$/d' | wc -l | tr -d ' ')" == 1 ]] ||
  fail "target PostgreSQL container is not unique"
runtime_database="$(docker inspect "$postgres_cid" --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^POSTGRES_DB=//p' | head -n1)"
[[ "$runtime_database" == "$database" ]] ||
  fail "target PostgreSQL database identity does not match"
backup_final="$backups_root/pre-migration-${release_sha:0:12}-$operation_id.dump"
backup_temp="$backup_final.tmp"
[[ ! -e "$backup_final" && ! -e "$backup_temp" ]] ||
  fail "operation backup already exists without a terminal receipt"
docker exec "$postgres_cid" sh -ceu \
  'pg_dump -Fc --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  >"$backup_temp"
chmod 600 "$backup_temp"
[[ -s "$backup_temp" ]] || fail "fresh pre-migration backup is empty"
docker exec -i "$postgres_cid" pg_restore --list <"$backup_temp" \
  >>"$log_file" 2>&1
docker exec "$postgres_cid" sh -ceu \
  'createdb -U "$POSTGRES_USER" "$1"' \
  sh "$restore_database" >>"$log_file" 2>&1
restore_database_created=1
docker exec -i "$postgres_cid" sh -ceu \
  'pg_restore --exit-on-error --no-owner --no-privileges -U "$POSTGRES_USER" -d "$1"' \
  sh "$restore_database" <"$backup_temp" >>"$log_file" 2>&1
restored_table_count="$(docker exec "$postgres_cid" sh -ceu \
  'psql -U "$POSTGRES_USER" -d "$1" -Atqc "SELECT count(*) FROM information_schema.tables WHERE table_schema = '\''public'\''"' \
  sh "$restore_database")"
[[ "$restored_table_count" =~ ^[1-9][0-9]*$ ]] ||
  fail "fresh backup restore check did not recover public tables"
restore_database_cleanup
mv "$backup_temp" "$backup_final"
backup_sha256="$(sha256sum "$backup_final" | awk '{print $1}')"
backup_size_bytes="$(stat -c '%s' "$backup_final")"
[[ "$backup_sha256" =~ $sha256_pattern && "$backup_size_bytes" -gt 0 ]] ||
  fail "fresh backup identity is invalid"

update_env_image_refs() {
  local source="$1"
  local destination="$2"
  awk -v app_ref="$server_ref" -v web_ref="$web_ref" '
    BEGIN { app_count=0; web_count=0; proxy_count=0 }
    /^APP_IMAGE=/ { print "APP_IMAGE=" app_ref; app_count++; next }
    /^WEB_IMAGE=/ { print "WEB_IMAGE=" web_ref; web_count++; next }
    /^WEB_PROXY_PREFIXES=/ {
      print "WEB_PROXY_PREFIXES=/rpc,/templates,/readyz/runtime-identity"
      proxy_count++
      next
    }
    { print }
    END {
      if (app_count != 1 || web_count != 1 || proxy_count != 1) exit 42
    }
  ' "$source" >"$destination"
}

enter_stage env_and_static_preflight
[[ -f "$runtime_env" && ! -L "$runtime_env" &&
  "$(stat -c '%u' "$runtime_env")" == "$(id -u)" &&
  "$(stat -c '%a' "$runtime_env")" == 600 ]] ||
  fail "target runtime env is invalid"
env_backup="$runtime_env.bak-before-${release_sha:0:12}-${operation_id:0:8}"
[[ ! -e "$env_backup" ]] || fail "operation env backup already exists"
cp "$runtime_env" "$env_backup"
chmod 600 "$env_backup"
update_env_image_refs "$runtime_env" "$runtime_env.next"
chmod 600 "$runtime_env.next"
mv -f "$runtime_env.next" "$runtime_env"
env_changed=1

compose_dir=$release_dir/server/deploy/compose/prod
compose_base=$compose_dir/compose.yml
compose_override=$compose_dir/$compose_override_name
preflight_script=$release_dir/scripts/deploy/production-preflight.sh
migrate_script=$compose_dir/migrate_online.sh
[[ -f "$compose_base" && -f "$compose_override" &&
  -x "$preflight_script" && -x "$migrate_script" ]] ||
  fail "release deployment entrypoints are incomplete"

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
  >>"$log_file" 2>&1

enter_stage maintenance_window
runtime_stop_started=1
"${clean_env[@]}" "${compose[@]}" stop app-server web-desktop \
  >>"$log_file" 2>&1
"${clean_env[@]}" "${compose[@]}" up -d --no-build --pull never postgres \
  >>"$log_file" 2>&1
postgres_deadline=$((SECONDS + 120))
while true; do
  postgres_cid="$("${clean_env[@]}" "${compose[@]}" ps -q postgres 2>/dev/null || true)"
  postgres_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$postgres_cid" 2>/dev/null || true)"
  [[ "$postgres_health" == "healthy" ]] && break
  ((SECONDS < postgres_deadline)) || fail "PostgreSQL 配置重建后未恢复 healthy"
  sleep 2
done

enter_stage migration_plan
"${clean_env[@]}" \
  "COMPOSE_OVERRIDE_FILE=$compose_override" \
  "COMPOSE_ENV_FILE=$runtime_env" \
  "DEPLOYMENT_TARGET_KEY=$target" \
  "MIGRATION_MAINTENANCE_CONFIRMED=1" \
  "EXPECTED_MIGRATION_SEQUENCE_SHA256=$migration_sequence_sha256" \
  "RELEASE_SHA=$release_sha" \
  "APPLICATION_IMAGE_DIGEST=$server_content_id" \
  sh "$migrate_script" --reconcile-permissions >>"$log_file" 2>&1

enter_stage migration_apply_started
migration_apply_started=1
"${clean_env[@]}" \
  "COMPOSE_OVERRIDE_FILE=$compose_override" \
  "COMPOSE_ENV_FILE=$runtime_env" \
  "DEPLOYMENT_TARGET_KEY=$target" \
  "MIGRATION_MAINTENANCE_CONFIRMED=1" \
  "EXPECTED_MIGRATION_SEQUENCE_SHA256=$migration_sequence_sha256" \
  "RELEASE_SHA=$release_sha" \
  "APPLICATION_IMAGE_DIGEST=$server_content_id" \
  sh "$migrate_script" --apply >>"$log_file" 2>&1

enter_stage migration_applied
"${clean_env[@]}" \
  "COMPOSE_OVERRIDE_FILE=$compose_override" \
  "COMPOSE_ENV_FILE=$runtime_env" \
  "DEPLOYMENT_TARGET_KEY=$target" \
  "EXPECTED_MIGRATION_SEQUENCE_SHA256=$migration_sequence_sha256" \
  "RELEASE_SHA=$release_sha" \
  "APPLICATION_IMAGE_DIGEST=$server_content_id" \
  sh "$migrate_script" --status-only >>"$log_file" 2>&1

enter_stage compose_start
"${clean_env[@]}" "${compose[@]}" up -d --no-build --pull never \
  postgres jaeger app-server web-desktop >>"$log_file" 2>&1

enter_stage runtime_verified
"${clean_env[@]}" bash "$preflight_script" \
  --deployment-target "$target" \
  --env-file "$runtime_env" \
  --compose-dir "$compose_dir" \
  --compose-override "$compose_override" \
  --runtime \
  --expected-release "$release_sha" \
  --out "$operation_dir/production-preflight-report.txt" \
  >>"$log_file" 2>&1
curl --fail --silent --show-error --max-time 10 \
  "$server_endpoint/healthz" >/dev/null
curl --fail --silent --show-error --max-time 10 \
  "$server_endpoint/readyz" >/dev/null
curl --fail --silent --show-error --max-time 10 \
  "$web_endpoint/healthz" >/dev/null
runtime_server_sha="$(docker inspect "$server_container" --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^GIT_SHA=//p' | head -n1)"
runtime_web_sha="$(docker inspect "$web_container" --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^GIT_SHA=//p' | head -n1)"
[[ "$runtime_server_sha" == "$release_sha" && "$runtime_web_sha" == "$release_sha" ]] ||
  fail "runtime release identity does not match"

enter_stage public_entry_switch
public_cutover_script=$release_dir/deployments/yoyoosun/scripts/cutover-public-web.sh
[[ -f "$public_cutover_script" && ! -L "$public_cutover_script" ]] ||
  fail "public entry cutover script is unavailable"
public_containers="$(
  docker ps --format '{{.Names}}' |
    grep -E "^${public_container_prefix}[0-9a-f]{8}$" || true
)"
public_container_count="$(printf '%s\n' "$public_containers" | sed '/^$/d' | wc -l | tr -d ' ')"
[[ "$public_container_count" == 1 ]] || fail "public entry container is not unique"
bash "$public_cutover_script" \
  --image "$web_ref" \
  --release "$release_sha" \
  --current-container "$public_containers" \
  --endpoint "$public_endpoint" \
  --api-origin http://app-server:8300 \
  --network "$public_network" \
  --container-prefix "$public_container_prefix" \
  --host-port "$public_host_port" \
  --candidate-port "$public_candidate_port" \
  --execute \
  --confirm "PUBLIC_WEB_CUTOVER:$public_containers:$release_sha" \
  >>"$log_file" 2>&1
public_runtime_sha="$(
  docker inspect "${public_container_prefix}${release_sha:0:8}" \
    --format '{{range .Config.Env}}{{println .}}{{end}}' |
    sed -n 's/^GIT_SHA=//p' | head -n1
)"
[[ "$public_runtime_sha" == "$release_sha" ]] ||
  fail "public entry release identity does not match"

enter_stage current_source_switch
next_current=$root/.current-next-$operation_id
[[ ! -e "$next_current" ]] || fail "next current directory already exists"
cp -a --reflink=auto "$release_dir" "$next_current"
chmod 700 "$next_current"
old_current=$root/current.rollback-${current_before_sha:0:8}-before-${release_sha:0:8}-${operation_id:0:8}
[[ ! -e "$old_current" ]] || fail "rollback source directory already exists"
mv "$current" "$old_current"
mv "$next_current" "$current"

enter_stage passed
env_changed=0
write_receipt passed none
rm -f \
  "$incoming/.target-cache.json" \
  "$incoming/checksums.sha256" \
  "$incoming/promotion-manifest.json" \
  "$incoming/release-artifact.json" \
  "$incoming/release-manifest.json" \
  "$incoming/release-rehearsal.json" \
  "$incoming/remote-promotion.sh" \
  "$incoming/remote-release-acquire.sh" \
  "$incoming/sbom.cdx.json" \
  "$incoming/server-image.tar" \
  "$incoming/source.tar" \
  "$incoming/transfer-checksums.sha256" \
  "$incoming/target-release-fetch.json" \
  "$incoming/web-image.tar"
rmdir "$incoming"
cat "$receipt"
