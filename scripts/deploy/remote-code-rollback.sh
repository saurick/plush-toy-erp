#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

print_help() {
  cat <<'USAGE'
Usage:
  bash remote-code-rollback.sh rollback \
    <operation-id> <from-40-sha> <to-40-sha> <to-version> \
    <current-manifest-sha256> <target-manifest-sha256> \
    <rollback-fingerprint> <confirmation>

This fixed test-133 script rolls back code and images only. It never builds,
runs a database down migration, restores a database or retries an unknown
operation.
USAGE
}

[[ "${1:-}" == "--help" || "${1:-}" == "-h" ]] && {
  print_help
  exit 0
}

action="${1:-}"
operation_id="${2:-}"
from_sha="${3:-}"
to_sha="${4:-}"
to_version="${5:-}"
current_manifest_sha256="${6:-}"
target_manifest_sha256="${7:-}"
rollback_fingerprint="${8:-}"
confirmation="${9:-}"

target=test-133
root=/home/simon/plush-toy-erp-v5
incoming_root=$root/incoming
releases_root=$root/releases
runtime_env=$root/runtime/.env.customer-trial-133
operations_root=$root/operations
run_root=$root/run
current=$root/current
project=plush-toy-erp-v5
minimum_available_bytes=32212254720
promotion_lock=$run_root/promotion.lock

uuid_v4_pattern='^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
sha_pattern='^[0-9a-f]{40}$'
sha256_pattern='^[0-9a-f]{64}$'
version_pattern='^[0-9A-Za-z]([0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$'

fail() {
  printf '[remote-code-rollback] %s\n' "$1" >&2
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

[[ "$action" == rollback ]] || fail "unsupported action"
[[ "$operation_id" =~ $uuid_v4_pattern ]] || fail "invalid operation id"
[[ "$from_sha" =~ $sha_pattern && "$to_sha" =~ $sha_pattern ]] ||
  fail "invalid rollback SHA"
[[ "$from_sha" != "$to_sha" ]] || fail "rollback SHA is already current"
[[ "$to_version" =~ $version_pattern ]] || fail "invalid target version"
[[ "$current_manifest_sha256" =~ $sha256_pattern &&
  "$target_manifest_sha256" =~ $sha256_pattern &&
  "$rollback_fingerprint" =~ $sha256_pattern ]] ||
  fail "invalid rollback checksum"
[[ "$confirmation" == "ROLLBACK:$target:$from_sha:$to_sha:$operation_id" ]] ||
  fail "rollback confirmation does not match"
[[ "$(hostname)" == simon && "$(id -un)" == simon ]] ||
  fail "remote host/user identity does not match"

incoming=$incoming_root/$operation_id
operation_dir=$operations_root/$operation_id
receipt=$operation_dir/rollback-receipt.json
state_file=$operation_dir/rollback-state.json
log_file=$operation_dir/rollback.log
release_dir=$releases_root/$to_sha
release_identity=$release_dir/.plush-release-identity.json
stage=initial
env_changed=0
service_switch_started=0
env_backup=""
server_content_id=unknown
web_content_id=unknown
server_ref=unknown
web_ref=unknown
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
    fail "rollback has an unknown prior target outcome; read back before retry"
fi

write_state() {
  local status="$1"
  local next="$state_file.tmp"
  jq -n \
    --arg schemaVersion "plush.remote-rollback-state/v1" \
    --arg status "$status" \
    --arg operationId "$operation_id" \
    --arg target "$target" \
    --arg fromGitSha "$from_sha" \
    --arg toGitSha "$to_sha" \
    --arg stage "$stage" \
    --arg updatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
      schemaVersion: $schemaVersion,
      status: $status,
      operationId: $operationId,
      target: $target,
      fromGitSha: $fromGitSha,
      toGitSha: $toGitSha,
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
    --arg schemaVersion "plush.remote-rollback-receipt/v2" \
    --arg status "$status" \
    --arg operationId "$operation_id" \
    --arg target "$target" \
    --arg fromGitSha "$from_sha" \
    --arg toGitSha "$to_sha" \
    --arg toVersion "$to_version" \
    --arg currentManifestSha256 "$current_manifest_sha256" \
    --arg targetManifestSha256 "$target_manifest_sha256" \
    --arg rollbackFingerprint "$rollback_fingerprint" \
    --arg stage "$stage" \
    --arg issueCode "$issue_code" \
    --arg serverContentId "$server_content_id" \
    --arg webContentId "$web_content_id" \
    --argjson serviceSwitchStarted "$service_switch_started" \
    --arg startedAt "$operation_started_at" \
    --arg finishedAt "$finished_at" \
    --argjson durationMs "$duration_ms" \
    --argjson timings "$stage_timings" \
    '{
      schemaVersion: $schemaVersion,
      status: $status,
      operationId: $operationId,
      target: $target,
      fromGitSha: $fromGitSha,
      toGitSha: $toGitSha,
      toVersion: $toVersion,
      currentManifestSha256: $currentManifestSha256,
      targetManifestSha256: $targetManifestSha256,
      rollbackFingerprint: $rollbackFingerprint,
      stage: $stage,
      issueCode: $issueCode,
      images: {
        serverContentId: $serverContentId,
        webContentId: $webContentId
      },
      database: {
        downMigrationAutomatic: false,
        restoreAutomatic: false,
        changedByExecutor: false
      },
      checks: {
        releaseIdentity: ($status == "passed"),
        migrationUnchanged: ($status == "passed"),
        customerConfigUnchanged: ($status == "passed"),
        health: ($status == "passed"),
        ready: ($status == "passed"),
        basicSmoke: ($status == "passed")
      },
      serviceSwitchStarted: ($serviceSwitchStarted == 1),
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

clean_env=(
  env -i
  "HOME=$HOME"
  "USER=$(id -un)"
  "LOGNAME=$(id -un)"
  "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
)

recover_previous() {
  [[ "$env_changed" -eq 1 && -n "$env_backup" && -f "$env_backup" ]] || return 1
  cp "$env_backup" "$runtime_env.recovering"
  chmod 600 "$runtime_env.recovering"
  mv -f "$runtime_env.recovering" "$runtime_env"
  env_changed=0
  "${clean_env[@]}" docker compose \
    -p "$project" \
    --env-file "$runtime_env" \
    -f "$current/server/deploy/compose/prod/compose.yml" \
    -f "$current/server/deploy/compose/prod/compose.customer-trial-133.yml" \
    up -d --no-build --pull never app-server web-desktop \
    >>"$log_file" 2>&1 || return 1
  curl --fail --silent --show-error --max-time 10 \
    http://127.0.0.1:8315/readyz >/dev/null 2>&1 || return 1
  recovered_sha="$(docker inspect plush-toy-erp-v5-server --format '{{range .Config.Env}}{{println .}}{{end}}' |
    sed -n 's/^GIT_SHA=//p' | head -n1)"
  [[ "$recovered_sha" == "$from_sha" ]]
}

on_error() {
  local exit_code=$?
  trap - ERR
  if [[ "$env_changed" -eq 1 ]] && recover_previous; then
    write_receipt failed rollback_failed_previous_release_restored
  elif [[ "$service_switch_started" -eq 0 ]]; then
    write_receipt failed rollback_failed_before_service_switch
  else
    write_receipt not_proven rollback_outcome_unknown
  fi
  cat "$receipt"
  printf '[remote-code-rollback] failed at stage=%s exit=%s\n' \
    "$stage" "$exit_code" >&2
  exit "$exit_code"
}
trap on_error ERR

: >"$log_file"
chmod 600 "$log_file"
write_state running

enter_stage package_verification
[[ -d "$incoming" && ! -L "$incoming" &&
  "$(stat -c '%u' "$incoming")" == "$(id -u)" ]] ||
  fail "incoming rollback package is invalid"
required_files=(
  current-release-manifest.json
  release-manifest.json
  release-artifact.json
  rollback-manifest.json
  sbom.cdx.json
  source.tar
  server-image.tar
  web-image.tar
  remote-code-rollback.sh
  transfer-checksums.sha256
)
for required_file in "${required_files[@]}"; do
  [[ -f "$incoming/$required_file" && ! -L "$incoming/$required_file" ]] ||
    fail "incoming rollback package is incomplete"
done
(
  cd "$incoming"
  sha256sum --check --strict transfer-checksums.sha256
) >>"$log_file" 2>&1
[[ "$(sha256sum "$incoming/current-release-manifest.json" | awk '{print $1}')" == "$current_manifest_sha256" &&
"$(sha256sum "$incoming/release-manifest.json" | awk '{print $1}')" == "$target_manifest_sha256" ]] ||
  fail "release manifest checksums do not match the rollback operation"

jq -e \
  --arg operationId "$operation_id" \
  --arg fromSha "$from_sha" \
  --arg toSha "$to_sha" \
  --arg fingerprint "$rollback_fingerprint" \
  '.schemaVersion == "plush.rollback-manifest/v1" and
   .status == "eligible" and
   .operationId == $operationId and
   .target.key == "test-133" and
   .from.gitSha == $fromSha and
   .to.gitSha == $toSha and
   .fingerprint == $fingerprint and
   .rollback.mode == "code_and_images_only" and
   .rollback.automaticDatabaseDownMigration == false and
   .rollback.databaseRestoreAutomatic == false' \
  "$incoming/rollback-manifest.json" >/dev/null
jq -e -s \
  --arg fromSha "$from_sha" \
  --arg toSha "$to_sha" \
  --arg toVersion "$to_version" \
  '.[0].schemaVersion == "plush.release-manifest/v1" and
   .[1].schemaVersion == "plush.release-manifest/v1" and
   .[0].gitSha == $fromSha and
   .[1].gitSha == $toSha and
   .[1].version == $toVersion and
   .[0].migration.latest == .[1].migration.latest and
   .[0].migration.sequenceSha256 == .[1].migration.sequenceSha256 and
   .[0].customerConfig.sourceSha256 == .[1].customerConfig.sourceSha256 and
   .[0].rollback.databaseDownMigrationAutomatic == false and
   .[1].rollback.databaseDownMigrationAutomatic == false' \
  "$incoming/current-release-manifest.json" \
  "$incoming/release-manifest.json" >/dev/null
jq -e \
  --arg sha "$to_sha" \
  '.schemaVersion == "plush-release-artifact/v1" and
   .passed == true and
   .git.commit == $sha and
   .git.head == $sha and
   .git.worktreeClean == true and
   (.images | length) == 2' \
  "$incoming/release-artifact.json" >/dev/null

source_sha256="$(jq -r '.sourceArchive.sha256' "$incoming/release-artifact.json")"
sbom_sha256="$(jq -r '.sbom.sha256' "$incoming/release-artifact.json")"
[[ "$source_sha256" =~ $sha256_pattern && "$sbom_sha256" =~ $sha256_pattern &&
  "$(sha256sum "$incoming/source.tar" | awk '{print $1}')" == "$source_sha256" &&
  "$(sha256sum "$incoming/sbom.cdx.json" | awk '{print $1}')" == "$sbom_sha256" ]] ||
  fail "rollback source or SBOM checksum does not match"

server_ref="$(jq -r '.images[] | select(.kind == "server") | .ref' "$incoming/release-artifact.json")"
web_ref="$(jq -r '.images[] | select(.kind == "web") | .ref' "$incoming/release-artifact.json")"
server_content_id="$(jq -r '.images[] | select(.kind == "server") | .contentId' "$incoming/release-artifact.json")"
web_content_id="$(jq -r '.images[] | select(.kind == "web") | .contentId' "$incoming/release-artifact.json")"
[[ "$server_ref" =~ ^plush-toy-erp-server:yoyoosun-[0-9a-f]{40}$ &&
  "$web_ref" =~ ^plush-toy-erp-web:yoyoosun-[0-9a-f]{40}$ &&
  "$server_ref" == *"$to_sha" && "$web_ref" == *"$to_sha" &&
  "$server_content_id" =~ ^sha256:[0-9a-f]{64}$ &&
  "$web_content_id" =~ ^sha256:[0-9a-f]{64}$ ]] ||
  fail "rollback image identity is invalid"
server_archive_manifest_digest="$(
  portable_archive_manifest_digest \
    "$incoming/server-image.tar" "$server_ref" "$server_content_id"
)"
web_archive_manifest_digest="$(
  portable_archive_manifest_digest \
    "$incoming/web-image.tar" "$web_ref" "$web_content_id"
)"

enter_stage target_identity_recheck
available_bytes="$(df -B1 --output=avail / | awk 'NR==2 {print $1}')"
[[ "$available_bytes" =~ ^[0-9]+$ &&
  "$available_bytes" -ge "$minimum_available_bytes" ]] ||
  fail "target disk capacity is below the fixed minimum"
runtime_server_sha="$(docker inspect plush-toy-erp-v5-server --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^GIT_SHA=//p' | head -n1)"
runtime_web_sha="$(docker inspect plush-toy-erp-v5-web-desktop --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^GIT_SHA=//p' | head -n1)"
[[ "$runtime_server_sha" == "$from_sha" && "$runtime_web_sha" == "$from_sha" ]] ||
  fail "current runtime SHA changed after rollback qualification"
curl --fail --silent --show-error --max-time 10 \
  http://127.0.0.1:8315/readyz >/dev/null
curl --fail --silent --show-error --max-time 10 \
  http://127.0.0.1:5185/healthz >/dev/null

enter_stage release_materialization
if [[ -e "$release_dir" ]]; then
  [[ -d "$release_dir" && ! -L "$release_dir" &&
    -f "$release_identity" && ! -L "$release_identity" ]] ||
    fail "existing target release directory has no trusted identity"
  jq -e \
    --arg sha "$to_sha" \
    --arg sourceSha256 "$source_sha256" \
    '.schemaVersion == "plush.target-release-identity/v1" and
     .gitSha == $sha and .sourceArchiveSha256 == $sourceSha256' \
    "$release_identity" >/dev/null
else
  materializing="$releases_root/.materializing-rollback-$operation_id"
  [[ ! -e "$materializing" ]] || fail "stale materialization directory exists"
  mkdir "$materializing"
  chmod 700 "$materializing"
  tar -tf "$incoming/source.tar" |
    awk '/^\\// { exit 1 } /(^|\\/)\\.\\.?($|\\/)/ { exit 1 } { next }' ||
    fail "source archive contains an unsafe path"
  tar --extract --file "$incoming/source.tar" \
    --directory "$materializing" --no-same-owner --no-same-permissions
  jq -n \
    --arg schemaVersion "plush.target-release-identity/v1" \
    --arg gitSha "$to_sha" \
    --arg sourceArchiveSha256 "$source_sha256" \
    --arg releaseManifestSha256 "$target_manifest_sha256" \
    '{
      schemaVersion: $schemaVersion,
      gitSha: $gitSha,
      sourceArchiveSha256: $sourceArchiveSha256,
      releaseManifestSha256: $releaseManifestSha256
    }' >"$materializing/.plush-release-identity.json"
  chmod 600 "$materializing/.plush-release-identity.json"
  mv "$materializing" "$release_dir"
fi
cmp --silent \
  "$incoming/remote-code-rollback.sh" \
  "$release_dir/scripts/deploy/remote-code-rollback.sh" ||
  fail "remote rollback script is not part of the target exact source"

enter_stage image_load_and_readback
docker load --input "$incoming/server-image.tar" >>"$log_file" 2>&1
docker load --input "$incoming/web-image.tar" >>"$log_file" 2>&1
actual_server_content_id="$(docker image inspect --format '{{.Id}}' "$server_ref")"
actual_web_content_id="$(docker image inspect --format '{{.Id}}' "$web_ref")"
[[ ("$actual_server_content_id" == "$server_content_id" ||
  "$actual_server_content_id" == "$server_archive_manifest_digest") &&
  ("$actual_web_content_id" == "$web_content_id" ||
  "$actual_web_content_id" == "$web_archive_manifest_digest") ]] ||
  fail "loaded rollback image content IDs do not match"
for image_ref in "$server_ref" "$web_ref"; do
  image_platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image_ref")"
  image_sha="$(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$image_ref" |
    sed -n 's/^GIT_SHA=//p' | head -n1)"
  [[ "$image_platform" == linux/amd64 && "$image_sha" == "$to_sha" ]] ||
    fail "loaded rollback image platform or SHA does not match"
done

update_env_image_refs() {
  local source="$1"
  local destination="$2"
  awk -v app_ref="$server_ref" -v web_ref="$web_ref" '
    BEGIN { app_count=0; web_count=0 }
    /^APP_IMAGE=/ { print "APP_IMAGE=" app_ref; app_count++; next }
    /^WEB_IMAGE=/ { print "WEB_IMAGE=" web_ref; web_count++; next }
    { print }
    END { if (app_count != 1 || web_count != 1) exit 42 }
  ' "$source" >"$destination"
}

enter_stage static_preflight
[[ -f "$runtime_env" && ! -L "$runtime_env" &&
  "$(stat -c '%u' "$runtime_env")" == "$(id -u)" &&
  "$(stat -c '%a' "$runtime_env")" == 600 ]] ||
  fail "target runtime env is invalid"
env_backup="$root/runtime/.env.customer-trial-133.bak-before-rollback-${from_sha:0:8}-${operation_id:0:8}"
[[ ! -e "$env_backup" ]] || fail "rollback env backup already exists"
cp "$runtime_env" "$env_backup"
chmod 600 "$env_backup"
update_env_image_refs "$runtime_env" "$runtime_env.next"
chmod 600 "$runtime_env.next"
mv -f "$runtime_env.next" "$runtime_env"
env_changed=1

compose_dir=$release_dir/server/deploy/compose/prod
compose_base=$compose_dir/compose.yml
compose_override=$compose_dir/compose.customer-trial-133.yml
preflight_script=$release_dir/scripts/deploy/production-preflight.sh
[[ -f "$compose_base" && -f "$compose_override" && -x "$preflight_script" ]] ||
  fail "target rollback release entrypoints are incomplete"
compose=(
  docker compose
  -p "$project"
  --env-file "$runtime_env"
  -f "$compose_base"
  -f "$compose_override"
)
"${clean_env[@]}" bash "$preflight_script" \
  --env-file "$runtime_env" \
  --compose-dir "$compose_dir" \
  --compose-override "$compose_override" \
  >>"$log_file" 2>&1

enter_stage service_switch
service_switch_started=1
"${clean_env[@]}" "${compose[@]}" stop app-server web-desktop \
  >>"$log_file" 2>&1
"${clean_env[@]}" "${compose[@]}" up -d --no-build --pull never \
  postgres jaeger app-server web-desktop >>"$log_file" 2>&1

enter_stage runtime_verified
"${clean_env[@]}" bash "$preflight_script" \
  --env-file "$runtime_env" \
  --compose-dir "$compose_dir" \
  --compose-override "$compose_override" \
  --runtime \
  --expected-release "$to_sha" \
  --out "$operation_dir/rollback-preflight-report.txt" \
  >>"$log_file" 2>&1
curl --fail --silent --show-error --max-time 10 \
  http://127.0.0.1:8315/healthz >/dev/null
curl --fail --silent --show-error --max-time 10 \
  http://127.0.0.1:8315/readyz >/dev/null
curl --fail --silent --show-error --max-time 10 \
  http://127.0.0.1:5185/healthz >/dev/null
runtime_server_sha="$(docker inspect plush-toy-erp-v5-server --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^GIT_SHA=//p' | head -n1)"
runtime_web_sha="$(docker inspect plush-toy-erp-v5-web-desktop --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^GIT_SHA=//p' | head -n1)"
[[ "$runtime_server_sha" == "$to_sha" && "$runtime_web_sha" == "$to_sha" ]] ||
  fail "rollback runtime release identity does not match"

enter_stage current_source_switch
next_current=$root/.current-next-rollback-$operation_id
[[ ! -e "$next_current" ]] || fail "next current directory already exists"
cp -a --reflink=auto "$release_dir" "$next_current"
chmod 700 "$next_current"
old_current=$root/current.before-rollback-${from_sha:0:8}-to-${to_sha:0:8}-${operation_id:0:8}
[[ ! -e "$old_current" ]] || fail "rollback source preservation path exists"
mv "$current" "$old_current"
mv "$next_current" "$current"

enter_stage passed
env_changed=0
write_receipt passed none
cat "$receipt"
