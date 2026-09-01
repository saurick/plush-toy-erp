#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

print_help() {
  cat <<'USAGE'
Usage:
  bash remote-code-rollback.sh rollback <demo-133|customer-test-133> \
    <operation-id> <from-40-sha> <to-40-sha> <to-version> \
    <current-manifest-sha256> <target-manifest-sha256> \
    <rollback-fingerprint> <confirmation>

This registered-target script rolls back code and images only. It never builds,
runs a database down migration, restores a database or retries an unknown
operation.
USAGE
}

[[ "${1:-}" == "--help" || "${1:-}" == "-h" ]] && {
  print_help
  exit 0
}

action="${1:-}"
target="${2:-}"
operation_id="${3:-}"
from_sha="${4:-}"
to_sha="${5:-}"
to_version="${6:-}"
current_manifest_sha256="${7:-}"
target_manifest_sha256="${8:-}"
rollback_fingerprint="${9:-}"
confirmation="${10:-}"

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
  compose_override_name=compose.customer-test-133.yml
  server_endpoint=http://127.0.0.1:8335
  web_endpoint=http://127.0.0.1:5205
  ;;
*)
  printf '[remote-code-rollback] unsupported target\n' >&2
  exit 1
  ;;
esac
incoming_root=$root/incoming
runtime_root=$root/runtime
cache_root_v2=$root/release-cache-v2
legacy_cache_root=$root/release-cache
cache_root=$cache_root_v2
releases_root=$root/releases
operations_root=$root/operations
run_root=$root/run
current=$root/current
server_container=$project-server
web_container=$project-web-desktop
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

owned_private_directory() {
  local candidate="$1"
  local canonical
  local mode
  [[ -d "$candidate" && ! -L "$candidate" ]] || return 1
  canonical="$(readlink -f -- "$candidate")" || return 1
  [[ "$canonical" == "$candidate" &&
    "$(stat -c '%u' "$candidate")" == "$(id -u)" ]] || return 1
  mode="$(stat -c '%a' "$candidate")"
  [[ "$mode" =~ ^[0-7]{3,4}$ ]] || return 1
  (((8#$mode & 8#022) == 0))
}

owned_private_plain_file() {
  local candidate="$1"
  local mode
  [[ -f "$candidate" && ! -L "$candidate" &&
    "$(stat -c '%u' "$candidate")" == "$(id -u)" ]] || return 1
  mode="$(stat -c '%a' "$candidate")"
  [[ "$mode" =~ ^[0-7]{3,4}$ ]] || return 1
  (((8#$mode & 8#022) == 0))
}

ensure_owned_private_child() {
  local parent="$1"
  local candidate="$2"
  owned_private_directory "$parent" || return 1
  [[ "$candidate" == "$parent"/* &&
    "${candidate#"$parent"/}" != */* ]] || return 1
  if [[ -e "$candidate" || -L "$candidate" ]]; then
    owned_private_directory "$candidate"
    return
  fi
  mkdir -- "$candidate"
  chmod 700 "$candidate"
  owned_private_directory "$candidate"
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

validate_source_archive() {
  local archive="$1"
  if tar --list --absolute-names --file "$archive" |
    awk '
      /^\// { exit 1 }
      /(^|\/)\.\.?($|\/)/ { exit 1 }
      { next }
    '; then
    :
  else
    fail "source archive contains an unsafe path"
  fi
  if tar --list --verbose --absolute-names --file "$archive" |
    awk 'substr($0, 1, 1) != "-" && substr($0, 1, 1) != "d" { exit 1 }'; then
    :
  else
    fail "source archive contains a non-regular member"
  fi
}

materialize_release_source() {
  local archive="$1"
  local destination="$2"
  local roles_script
  local owner_uid
  tar --extract --file "$archive" \
    --directory "$destination" --no-same-owner --no-same-permissions
  roles_script=$destination/server/deploy/compose/prod/database_roles.sh
  owner_uid="$(stat -c '%u' "$roles_script" 2>/dev/null || true)"
  [[ -f "$roles_script" && ! -L "$roles_script" &&
    "$owner_uid" == "$(id -u)" ]] ||
    fail "database role initializer is invalid"
  chmod 755 "$roles_script"
}

release_tree_digest() {
  local candidate="$1"
  local owner_gid
  local owner_uid
  owner_gid="$(id -g)"
  owner_uid="$(id -u)"
  owned_private_directory "$candidate" || return 1
  if find "$candidate" -mindepth 1 \
    \( \( ! -type f ! -type d \) -o ! -uid "$owner_uid" -o ! -gid "$owner_gid" \
    -o \( -type f ! -links 1 \) -o -perm /022 \) \
    -print -quit | grep -q .; then
    return 1
  fi
  tar --create --format=gnu --sort=name --mtime=@0 \
    --owner=0 --group=0 --numeric-owner --file=- --directory="$candidate" . |
    sha256sum | awk '{print $1}'
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
[[ "$(hostname)" == r640 && "$(id -un)" == simon ]] ||
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
current_source_switch_started=0
env_backup=""
env_next=""
env_recovering=""
server_content_id=unknown
web_content_id=unknown
server_ref=unknown
web_ref=unknown
cache_package_hit=false
cache_image_hit=false
cache_source=none
cache_avoided_bytes=0
cache_basis='[]'
cache_materializing=""
cache_materializing_created=0
release_materializing=""
release_materializing_created=0
release_verifying=""
release_verifying_created=0
acquisition_mode=none
acquisition_downloaded_bytes=0
acquisition_expected_bytes=0
acquisition_verified=false
credential_cleanup_proven=false
rollback_transport_mode=""
target_manifest_schema=""
cache_contract_mode=""
fetch_materializing=""
fetch_materializing_created=0
fetch_payloads_published=0
operation_started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
operation_started_epoch_ms="$(epoch_millis)"
stage_started_epoch_ms="$operation_started_epoch_ms"
stage_finalized=0
stage_timings='[]'

owned_private_directory "$root" || fail "target root is invalid"
[[ "$runtime_env" == "$runtime_root/.env.$target" ]] ||
  fail "runtime env identity is invalid"
owned_private_directory "$incoming_root" || fail "incoming root is invalid"
owned_private_directory "$runtime_root" || fail "runtime root is invalid"
owned_private_directory "$releases_root" || fail "releases root is invalid"
owned_private_directory "$current" || fail "current release root is invalid"
ensure_owned_private_child "$root" "$operations_root" ||
  fail "operations root is invalid"
ensure_owned_private_child "$root" "$run_root" ||
  fail "run root is invalid"
if [[ -e "$operation_dir" || -L "$operation_dir" ]]; then
  owned_private_directory "$operation_dir" ||
    fail "operation directory is invalid"
else
  mkdir -- "$operation_dir"
fi
chmod 700 "$operation_dir"
owned_private_directory "$operation_dir" || fail "operation directory is invalid"
for operation_file in "$receipt" "$state_file" "$log_file"; do
  if [[ -e "$operation_file" || -L "$operation_file" ]]; then
    owned_private_plain_file "$operation_file" ||
      fail "operation evidence file is invalid"
  fi
done
for transient_file in "$receipt.tmp" "$state_file.tmp"; do
  [[ ! -e "$transient_file" && ! -L "$transient_file" ]] ||
    fail "stale operation evidence temporary exists"
done

if [[ -e "$promotion_lock" || -L "$promotion_lock" ]]; then
  owned_private_plain_file "$promotion_lock" ||
    fail "promotion lock is invalid"
fi
exec 9>>"$promotion_lock"
chmod 600 "$promotion_lock"
owned_private_plain_file "$promotion_lock" || fail "promotion lock is invalid"
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
    --arg schemaVersion "plush.remote-rollback-receipt/v5" \
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
      fromGitSha: $fromGitSha,
      toGitSha: $toGitSha,
      toVersion: $toVersion,
      currentManifestSha256: $currentManifestSha256,
      targetManifestSha256: $targetManifestSha256,
      rollbackFingerprint: $rollbackFingerprint,
      cache: {
        packageHit: $cachePackageHit,
        imageHit: $cacheImageHit,
        cacheSource: $cacheSource,
        avoidedBytes: $cacheAvoidedBytes,
        dockerLoadSkipped: $cacheImageHit,
        basis: $cacheBasis,
        stillExecuted: ["migration_status", "health", "ready", "public_entry"]
      },
      acquisition: {
        mode: $acquisitionMode,
        downloadedBytes: $acquisitionDownloadedBytes,
        expectedBytes: $acquisitionExpectedBytes,
        catalogAndChecksumsVerified: $acquisitionVerified,
        credentialCleanupProven: $credentialCleanupProven
      },
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
        basicSmoke: ($status == "passed"),
        publicEntry: ($status == "passed")
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
  local recovery_compose_base
  local recovery_compose_dir
  local recovery_compose_override
  local recovered_public_containers
  local recovered_public_count
  local recovered_public_sha
  local recovered_server_sha
  local recovered_web_image
  local recovered_web_sha
  local recovery_cutover_script
  [[ "$env_changed" -eq 1 &&
    "$env_backup" == "$runtime_env.bak-before-rollback-${from_sha:0:8}-${operation_id:0:8}" ]] ||
    return 1
  owned_private_directory "$runtime_root" || return 1
  owned_private_plain_file "$env_backup" || return 1
  [[ "$current_source_switch_started" -eq 0 ]] || return 1
  owned_private_directory "$current" || return 1
  recovery_compose_dir=$current/server/deploy/compose/prod
  recovery_compose_base=$recovery_compose_dir/compose.yml
  recovery_compose_override=$recovery_compose_dir/$compose_override_name
  owned_private_directory "$recovery_compose_dir" || return 1
  owned_private_plain_file "$recovery_compose_base" || return 1
  owned_private_plain_file "$recovery_compose_override" || return 1
  env_recovering="$runtime_env.recovering-$operation_id"
  [[ ! -e "$env_recovering" && ! -L "$env_recovering" ]] || return 1
  cp "$env_backup" "$env_recovering"
  chmod 600 "$env_recovering"
  owned_private_plain_file "$env_recovering" || return 1
  mv -f "$env_recovering" "$runtime_env"
  env_recovering=""
  env_changed=0
  "${clean_env[@]}" docker compose \
    -p "$project" \
    --env-file "$runtime_env" \
    -f "$recovery_compose_base" \
    -f "$recovery_compose_override" \
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
  recovered_web_image="$(docker inspect "$web_container" --format '{{.Config.Image}}')"
  [[ "$recovered_server_sha" == "$from_sha" &&
    "$recovered_web_sha" == "$from_sha" &&
    -n "$recovered_web_image" ]] || return 1
  recovered_public_containers="$(
    docker ps --format '{{.Names}}' |
      grep -E "^${public_container_prefix}[0-9a-f]{8}$" || true
  )"
  recovered_public_count="$(printf '%s\n' "$recovered_public_containers" | sed '/^$/d' | wc -l | tr -d ' ')"
  [[ "$recovered_public_count" == 1 ]] || return 1
  recovery_cutover_script=$current/deployments/yoyoosun/scripts/cutover-public-web.sh
  owned_private_plain_file "$recovery_cutover_script" || return 1
  [[ -x "$recovery_cutover_script" ]] || return 1
  bash "$recovery_cutover_script" \
    --image "$recovered_web_image" \
    --release "$from_sha" \
    --current-container "$recovered_public_containers" \
    --endpoint "$public_endpoint" \
    --api-origin http://app-server:8300 \
    --network "$public_network" \
    --container-prefix "$public_container_prefix" \
    --host-port "$public_host_port" \
    --candidate-port "$public_candidate_port" \
    --execute \
    --confirm "PUBLIC_WEB_CUTOVER:$recovered_public_containers:$from_sha" \
    >>"$log_file" 2>&1 || return 1
  recovered_public_sha="$(docker inspect "${public_container_prefix}${from_sha:0:8}" \
    --format '{{range .Config.Env}}{{println .}}{{end}}' |
    sed -n 's/^GIT_SHA=//p' | head -n1)"
  [[ "$recovered_public_sha" == "$from_sha" ]] || return 1
  service_switch_started=0
}

cleanup_transient_materialization() {
  local candidate
  credential_cleanup_proven=false
  unset target_fetch_token
  for candidate in "$env_next" "$env_recovering"; do
    if [[ -n "$candidate" && "$candidate" == "$runtime_root"/* &&
      "${candidate#"$runtime_root"/}" != */* &&
      (-e "$candidate" || -L "$candidate") ]]; then
      if owned_private_directory "$runtime_root" &&
        owned_private_plain_file "$candidate"; then
        rm -f -- "$candidate" ||
          printf '[remote-code-rollback] failed to clean runtime temporary\n' >&2
      fi
    fi
  done
  env_next=""
  env_recovering=""
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
    if [[ "$candidate" == "$incoming/.acquire-$operation_id" ]] &&
      owned_private_directory "$incoming" &&
      owned_private_directory "$candidate"; then
      rm -rf -- "$candidate" ||
        printf '[remote-code-rollback] failed to clean acquisition materialization\n' >&2
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
    if [[ "$candidate" == "$cache_root/.materializing-$operation_id" ]] &&
      owned_private_directory "$cache_root" &&
      owned_private_directory "$candidate"; then
      rm -rf -- "$candidate" ||
        printf '[remote-code-rollback] failed to clean cache materialization\n' >&2
    fi
    cache_materializing_created=0
  fi
  if [[ "$release_materializing_created" -eq 1 ]]; then
    candidate="$release_materializing"
    if [[ "$candidate" == "$releases_root/.materializing-rollback-$operation_id" ]] &&
      owned_private_directory "$releases_root" &&
      owned_private_directory "$candidate"; then
      rm -rf -- "$candidate" ||
        printf '[remote-code-rollback] failed to clean release materialization\n' >&2
    fi
    release_materializing_created=0
  fi
  if [[ "$release_verifying_created" -eq 1 ]]; then
    candidate="$release_verifying"
    if [[ "$candidate" == "$releases_root/.verifying-rollback-$operation_id" ]] &&
      owned_private_directory "$releases_root" &&
      owned_private_directory "$candidate"; then
      rm -rf -- "$candidate" ||
        printf '[remote-code-rollback] failed to clean release verification\n' >&2
    fi
    release_verifying_created=0
  fi
}

on_error() {
  local exit_code=$?
  local recovery_required=0
  local recovery_proven=1
  trap - ERR
  cleanup_transient_materialization
  if [[ "$env_changed" -eq 1 ]]; then
    recovery_required=1
    recover_previous || recovery_proven=0
  fi
  if [[ "$credential_cleanup_proven" != true ]]; then
    write_receipt not_proven rollback_credential_cleanup_not_proven
  elif [[ "$recovery_required" -eq 1 && "$recovery_proven" -eq 1 ]]; then
    write_receipt failed rollback_failed_previous_release_restored
  elif [[ "$recovery_required" -eq 1 ]]; then
    write_receipt not_proven rollback_previous_release_recovery_not_proven
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
on_signal() {
  trap - ERR HUP INT TERM
  cleanup_transient_materialization
  if [[ "$env_changed" -eq 1 ]]; then
    recover_previous || true
  fi
  write_receipt not_proven rollback_interrupted
  cat "$receipt"
  exit 130
}
trap on_error ERR
trap on_signal HUP INT TERM
trap cleanup_transient_materialization EXIT

validate_bound_rollback_plan() {
  local actual_rollback_fingerprint
  actual_rollback_fingerprint="$(
    jq -jSc 'del(.fingerprint)' "$incoming/rollback-manifest.json" |
      sha256sum | awk '{print $1}'
  )"
  [[ "$actual_rollback_fingerprint" == "$rollback_fingerprint" ]] ||
    fail "rollback manifest fingerprint does not match its content"
  jq -e \
    --arg operationId "$operation_id" \
    --arg target "$target" \
    --arg fromSha "$from_sha" \
    --arg toSha "$to_sha" \
    --arg fingerprint "$rollback_fingerprint" \
    --arg transportMode "$rollback_transport_mode" \
    --arg targetManifestSha256 "$target_manifest_sha256" \
    '.schemaVersion == "plush.rollback-manifest/v1" and
     .status == "eligible" and
     .operationId == $operationId and
     .target.key == $target and
     .from.gitSha == $fromSha and
     .to.gitSha == $toSha and
     .ancestry.schemaVersion == "plush.git-ancestry-relation/v1" and
     .ancestry.currentGitSha == $fromSha and
     .ancestry.candidateGitSha == $toSha and
     .ancestry.relation == "behind" and
     .ancestry.actionClass == "rollback" and
     .ancestry.actionReason == "candidate_is_ancestor_of_current" and
     .fingerprint == $fingerprint and
     .transport.mode == $transportMode and
     .transport.targetManifestSha256 == $targetManifestSha256 and
     .rollback.mode == "code_and_images_only" and
     .rollback.automaticDatabaseDownMigration == false and
     .rollback.databaseRestoreAutomatic == false' \
    "$incoming/rollback-manifest.json" >/dev/null
}

: >"$log_file"
chmod 600 "$log_file"
write_state running

enter_stage artifact_fetch
owned_private_directory "$incoming" ||
  fail "incoming rollback package is invalid"
for control_file in \
  .target-cache.json current-release-manifest.json \
  rollback-manifest.json remote-code-rollback.sh; do
  owned_private_plain_file "$incoming/$control_file" ||
    fail "incoming rollback control is invalid"
done
live_rollback_script="$(
  readlink -f -- "$current/scripts/deploy/remote-code-rollback.sh"
)" || fail "live rollback script is unavailable"
[[ "$live_rollback_script" == "$current/scripts/deploy/remote-code-rollback.sh" ]] ||
  fail "live rollback script is outside the current release root"
owned_private_plain_file "$live_rollback_script" ||
  fail "live rollback script is invalid"
cmp --silent "$incoming/remote-code-rollback.sh" "$live_rollback_script" ||
  fail "remote rollback script is not part of the live exact source"
[[ "$(sha256sum "$incoming/current-release-manifest.json" | awk '{print $1}')" == "$current_manifest_sha256" ]] ||
  fail "current release manifest checksum does not match the rollback operation"
owned_private_plain_file "$incoming/.target-cache.json" ||
  fail "target cache transport marker is invalid"
jq -e \
  --arg operationId "$operation_id" \
  --arg manifest "$target_manifest_sha256" \
  '.schemaVersion == "plush.target-release-cache/v2" and
   .operationId == $operationId and
   .releaseManifestSha256 == $manifest and
   (.cacheMode == "v2_direct" or
    .cacheMode == "legacy_v1_existing_only")' \
  "$incoming/.target-cache.json" >/dev/null
cache_contract_mode="$(jq -er '.cacheMode' "$incoming/.target-cache.json")"
case "$cache_contract_mode" in
legacy_v1_existing_only)
  rollback_transport_mode=legacy_target_cache
  cache_root=$legacy_cache_root
  ;;
v2_direct)
  rollback_transport_mode=gitlab_internal_or_target_cache
  cache_root=$cache_root_v2
  ;;
*)
  fail "target cache transport mode is unsupported"
  ;;
esac
validate_bound_rollback_plan

case "$cache_contract_mode" in
legacy_v1_existing_only)
  [[ -f "$incoming/release-manifest.json" &&
    ! -L "$incoming/release-manifest.json" ]] ||
    fail "legacy target release manifest is unavailable"
  target_manifest_schema="$(jq -er '.schemaVersion' "$incoming/release-manifest.json")"
  [[ "$target_manifest_schema" == plush.release-manifest/v1 ]] ||
    fail "legacy target release manifest version is invalid"
  acquisition_mode=target_cache
  acquisition_expected_bytes=0
  acquisition_downloaded_bytes=0
  credential_cleanup_proven=true
  ;;
v2_direct)
  owned_private_plain_file "$incoming/remote-release-acquire.sh" ||
    fail "target release acquisition helper is invalid"
  live_acquire_script="$(
    readlink -f -- "$current/scripts/deploy/remote-release-acquire.sh"
  )" || fail "live release acquisition helper is unavailable"
  [[ "$live_acquire_script" == "$current/scripts/deploy/remote-release-acquire.sh" ]] ||
    fail "live release acquisition helper is outside the current release root"
  owned_private_plain_file "$live_acquire_script" ||
    fail "live release acquisition helper is invalid"
  cmp --silent \
    "$incoming/remote-release-acquire.sh" \
    "$live_acquire_script" ||
    fail "release acquisition helper is not part of the live exact source"
  # The dynamic path was resolved beneath the registered live release and
  # byte-compared with the incoming control copy immediately above.
  # shellcheck disable=SC1090
  source "$live_acquire_script"
  # These globals are consumed by acquire_target_release from the sourced file.
  # shellcheck disable=SC2034
  release_sha=$to_sha
  # shellcheck disable=SC2034
  release_version=$to_version
  target_fetch_token=""
  IFS= read -r target_fetch_token || true
  acquire_target_release
  target_manifest_schema="$(jq -er '.schemaVersion' "$incoming/release-manifest.json")"
  [[ "$target_manifest_schema" == plush.release-manifest/v2 ]] ||
    fail "target release manifest version is invalid"
  ;;
esac

enter_stage package_verification
owned_private_directory "$incoming" ||
  fail "incoming rollback package is invalid"
if [[ "$rollback_transport_mode" == legacy_target_cache ]]; then
  required_files=(
    .target-cache.json
    checksums.sha256
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
else
  required_files=(
    .target-cache.json
    checksums.sha256
    current-release-manifest.json
    release-manifest.json
    release-artifact.json
    release-rehearsal.json
    rollback-manifest.json
    sbom.cdx.json
    source.tar
    server-image.tar
    web-image.tar
    remote-code-rollback.sh
    remote-release-acquire.sh
    target-release-fetch.json
    transfer-checksums.sha256
  )
fi
for required_file in "${required_files[@]}"; do
  owned_private_plain_file "$incoming/$required_file" ||
    fail "incoming rollback package is incomplete"
done
jq -e \
  --arg operationId "$operation_id" \
  --arg cacheMode "$cache_contract_mode" \
  --arg manifest "$target_manifest_sha256" \
  '.schemaVersion == "plush.target-release-cache/v2" and
   .operationId == $operationId and
   .cacheMode == $cacheMode and
   .releaseManifestSha256 == $manifest and
   (.packageHit | type == "boolean") and
   (.imageHit | type == "boolean") and
   (.avoidedBytes | type == "number") and .avoidedBytes >= 0 and
   (.cacheSource == "none" or .cacheSource == "formal" or .cacheSource == "retained_operation") and
   (.basis | type == "array") and
   (if $cacheMode == "legacy_v1_existing_only" then (
      .packageHit == true and .avoidedBytes > 0 and
      .cacheSource == "formal" and
      .basis == ["release_manifest_sha256","archive_sha256","registry_digest","docker_content_id","embedded_git_sha"]
    ) else (
      if .packageHit then (
        .avoidedBytes > 0 and
        (.cacheSource == "formal" or .cacheSource == "retained_operation") and
        .basis == ["release_manifest_sha256","archive_sha256","registry_digest","docker_content_id","embedded_git_sha"]
      )
      else (.imageHit == false and .avoidedBytes == 0 and .cacheSource == "none" and (.basis | length) == 0) end
    ) end)' \
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
if [[ "$rollback_transport_mode" == legacy_target_cache ]]; then
  legacy_checksum_names="$(
    awk 'NF == 2 { print $2 }' "$incoming/checksums.sha256" | LC_ALL=C sort
  )"
  expected_legacy_checksum_names="$(
    printf '%s\n' \
      release-artifact.json release-manifest.json sbom.cdx.json \
      server-image.tar web-image.tar | LC_ALL=C sort
  )"
  [[ "$legacy_checksum_names" == "$expected_legacy_checksum_names" ]] ||
    fail "legacy rollback checksum catalog is not exact"
  (
    cd "$incoming"
    sha256sum --check --strict checksums.sha256
  ) >>"$log_file" 2>&1
  acquisition_verified=true
fi
[[ "$(sha256sum "$incoming/current-release-manifest.json" | awk '{print $1}')" == "$current_manifest_sha256" &&
"$(sha256sum "$incoming/release-manifest.json" | awk '{print $1}')" == "$target_manifest_sha256" ]] ||
  fail "release manifest checksums do not match the rollback operation"

validate_bound_rollback_plan
jq -e -s \
  --arg fromSha "$from_sha" \
  --arg toSha "$to_sha" \
  --arg toVersion "$to_version" \
  '((.[0].schemaVersion == "plush.release-manifest/v1") or
    (.[0].schemaVersion == "plush.release-manifest/v2")) and
   ((.[1].schemaVersion == "plush.release-manifest/v1") or
    (.[1].schemaVersion == "plush.release-manifest/v2")) and
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
  --arg version "$to_version" \
  '.schemaVersion == "plush-release-artifact/v1" and
   .passed == true and
   .git.commit == $sha and
   .git.head == $sha and
   .git.worktreeClean == true and
   .releaseVersion == $version and
   (.images | length) == 2' \
  "$incoming/release-artifact.json" >/dev/null
actual_artifact_sha256="$(sha256sum "$incoming/release-artifact.json" | awk '{print $1}')"
[[ "$actual_artifact_sha256" == "$(jq -r '.artifact.manifestSha256' "$incoming/release-manifest.json")" ]] ||
  fail "rollback artifact checksum does not match the release manifest"
jq -e -s '
  .[0] as $release |
  .[1] as $artifact |
  ($artifact.releaseVersion == $release.version) and
  ($release.artifact.sourceArchiveSha256 == $artifact.sourceArchive.sha256) and
  ($release.migration.latest == $artifact.migration.latest) and
  ($release.migration.sequenceSha256 == $artifact.migration.sequenceSha256) and
  ($release.customerConfig.sourceSha256 == $artifact.customerConfig.sourceSha256) and
  ($release.sbom.sha256 == $artifact.sbom.sha256) and
  (($release.images | map({kind, sourceContentId, platform}) | sort_by(.kind)) ==
   ($artifact.images | map({kind, sourceContentId: .contentId, platform}) | sort_by(.kind)))
' \
  "$incoming/release-manifest.json" \
  "$incoming/release-artifact.json" >/dev/null ||
  fail "rollback artifact fields do not match the release manifest"

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
runtime_server_sha="$(docker inspect "$server_container" --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^GIT_SHA=//p' | head -n1)"
runtime_web_sha="$(docker inspect "$web_container" --format '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^GIT_SHA=//p' | head -n1)"
[[ "$runtime_server_sha" == "$from_sha" && "$runtime_web_sha" == "$from_sha" ]] ||
  fail "current runtime SHA or Git ancestry changed after rollback qualification"
curl --fail --silent --show-error --max-time 10 \
  "$server_endpoint/readyz" >/dev/null
curl --fail --silent --show-error --max-time 10 \
  "$web_endpoint/healthz" >/dev/null

formal_cache=$cache_root/$target_manifest_sha256
if [[ "$rollback_transport_mode" == legacy_target_cache ]]; then
  owned_private_directory "$cache_root" ||
    fail "legacy rollback cache root is unavailable"
  immutable_cache_files=(
    release-manifest.json
    release-artifact.json
    sbom.cdx.json
    source.tar
    server-image.tar
    web-image.tar
  )
else
  ensure_owned_private_child "$root" "$cache_root" ||
    fail "rollback cache root is invalid"
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
fi
if [[ -e "$formal_cache" ]]; then
  owned_private_directory "$formal_cache" ||
    fail "formal rollback cache is invalid"
  [[ "$(find "$formal_cache" -mindepth 1 -maxdepth 1 -printf '.' | wc -c | tr -d ' ')" == "${#immutable_cache_files[@]}" ]] ||
    fail "formal rollback cache inventory is invalid"
  for cache_file in "${immutable_cache_files[@]}"; do
    owned_private_plain_file "$formal_cache/$cache_file" ||
      fail "formal rollback cache is incomplete"
    cmp --silent "$incoming/$cache_file" "$formal_cache/$cache_file" ||
      fail "formal rollback cache conflicts with verified package"
  done
else
  [[ "$rollback_transport_mode" != legacy_target_cache ]] ||
    fail "legacy rollback cache is unavailable"
  cache_materializing=$cache_root/.materializing-$operation_id
  [[ ! -e "$cache_materializing" ]] || fail "stale rollback cache materialization exists"
  mkdir "$cache_materializing"
  cache_materializing_created=1
  chmod 700 "$cache_materializing"
  owned_private_directory "$cache_materializing" ||
    fail "rollback cache materialization is invalid"
  for cache_file in "${immutable_cache_files[@]}"; do
    ln "$incoming/$cache_file" "$cache_materializing/$cache_file"
  done
  mv "$cache_materializing" "$formal_cache"
  cache_materializing_created=0
fi

enter_stage release_materialization
validate_source_archive "$incoming/source.tar"
if [[ -e "$release_dir" ]]; then
  if ! owned_private_directory "$release_dir" ||
    ! owned_private_plain_file "$release_identity"; then
    fail "existing target release directory has no trusted identity"
  fi
  jq -e \
    --arg sha "$to_sha" \
    --arg sourceSha256 "$source_sha256" \
    --arg releaseManifestSha256 "$target_manifest_sha256" \
    '.schemaVersion == "plush.target-release-identity/v1" and
     .gitSha == $sha and
     .sourceArchiveSha256 == $sourceSha256 and
     .releaseManifestSha256 == $releaseManifestSha256' \
    "$release_identity" >/dev/null
  release_verifying=$releases_root/.verifying-rollback-$operation_id
  [[ ! -e "$release_verifying" && ! -L "$release_verifying" ]] ||
    fail "stale release verification directory exists"
  mkdir "$release_verifying"
  release_verifying_created=1
  chmod 700 "$release_verifying"
  owned_private_directory "$release_verifying" ||
    fail "release verification directory is invalid"
  materialize_release_source "$incoming/source.tar" "$release_verifying"
  [[ ! -e "$release_verifying/.plush-release-identity.json" &&
    ! -L "$release_verifying/.plush-release-identity.json" ]] ||
    fail "source archive contains a reserved release identity"
  cp "$release_identity" "$release_verifying/.plush-release-identity.json"
  chmod 600 "$release_verifying/.plush-release-identity.json"
  existing_tree_digest="$(release_tree_digest "$release_dir")" ||
    fail "existing target release tree is invalid"
  verified_tree_digest="$(release_tree_digest "$release_verifying")" ||
    fail "verified target release tree is invalid"
  [[ "$existing_tree_digest" == "$verified_tree_digest" ]] ||
    fail "existing target release tree differs from the verified source archive"
  rm -rf -- "$release_verifying"
  release_verifying_created=0
else
  release_materializing="$releases_root/.materializing-rollback-$operation_id"
  [[ ! -e "$release_materializing" ]] || fail "stale materialization directory exists"
  mkdir "$release_materializing"
  release_materializing_created=1
  chmod 700 "$release_materializing"
  owned_private_directory "$release_materializing" ||
    fail "rollback release materialization is invalid"
  materialize_release_source "$incoming/source.tar" "$release_materializing"
  [[ ! -e "$release_materializing/.plush-release-identity.json" &&
    ! -L "$release_materializing/.plush-release-identity.json" ]] ||
    fail "source archive contains a reserved release identity"
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
    }' >"$release_materializing/.plush-release-identity.json"
  chmod 600 "$release_materializing/.plush-release-identity.json"
  mv "$release_materializing" "$release_dir"
  release_materializing_created=0
fi
cmp --silent \
  "$incoming/remote-code-rollback.sh" \
  "$live_rollback_script" ||
  fail "remote rollback script is not part of the live exact source"
if [[ "$rollback_transport_mode" != legacy_target_cache ]]; then
  cmp --silent \
    "$incoming/remote-release-acquire.sh" \
    "$live_acquire_script" ||
    fail "release acquisition helper is not part of the live exact source"
fi

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

enter_stage static_preflight
owned_private_directory "$runtime_root" || fail "runtime root is invalid"
[[ -f "$runtime_env" && ! -L "$runtime_env" &&
  "$(stat -c '%u' "$runtime_env")" == "$(id -u)" &&
  "$(stat -c '%a' "$runtime_env")" == 600 ]] ||
  fail "target runtime env is invalid"
env_backup="$runtime_env.bak-before-rollback-${from_sha:0:8}-${operation_id:0:8}"
[[ ! -e "$env_backup" && ! -L "$env_backup" ]] ||
  fail "rollback env backup already exists"
cp "$runtime_env" "$env_backup"
chmod 600 "$env_backup"
owned_private_plain_file "$env_backup" || fail "rollback env backup is invalid"
env_next="$runtime_env.next-$operation_id"
[[ ! -e "$env_next" && ! -L "$env_next" ]] ||
  fail "rollback env temporary already exists"
update_env_image_refs "$runtime_env" "$env_next"
chmod 600 "$env_next"
owned_private_plain_file "$env_next" ||
  fail "rollback env temporary is invalid"
env_changed=1
mv -f "$env_next" "$runtime_env"
env_next=""

compose_dir=$release_dir/server/deploy/compose/prod
compose_base=$compose_dir/compose.yml
compose_override=$compose_dir/$compose_override_name
preflight_script=$release_dir/scripts/deploy/production-preflight.sh
owned_private_directory "$compose_dir" ||
  fail "target rollback compose directory is invalid"
owned_private_plain_file "$compose_base" ||
  fail "target rollback compose base is invalid"
owned_private_plain_file "$compose_override" ||
  fail "target rollback compose override is invalid"
owned_private_plain_file "$preflight_script" ||
  fail "target rollback preflight is invalid"
[[ -x "$preflight_script" ]] ||
  fail "target rollback release entrypoints are incomplete"
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

enter_stage service_switch
service_switch_started=1
"${clean_env[@]}" "${compose[@]}" stop app-server web-desktop \
  >>"$log_file" 2>&1
"${clean_env[@]}" "${compose[@]}" up -d --no-build --pull never \
  postgres jaeger app-server web-desktop >>"$log_file" 2>&1

enter_stage runtime_verified
"${clean_env[@]}" bash "$preflight_script" \
  --deployment-target "$target" \
  --env-file "$runtime_env" \
  --compose-dir "$compose_dir" \
  --compose-override "$compose_override" \
  --runtime \
  --expected-release "$to_sha" \
  --out "$operation_dir/rollback-preflight-report.txt" \
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
[[ "$runtime_server_sha" == "$to_sha" && "$runtime_web_sha" == "$to_sha" ]] ||
  fail "rollback runtime release identity does not match"

enter_stage public_entry_switch
public_cutover_script=$current/deployments/yoyoosun/scripts/cutover-public-web.sh
owned_private_plain_file "$public_cutover_script" ||
  fail "public entry cutover script is unavailable"
[[ -x "$public_cutover_script" ]] ||
  fail "public entry cutover script is unavailable"
public_containers="$(
  docker ps --format '{{.Names}}' |
    grep -E "^${public_container_prefix}[0-9a-f]{8}$" || true
)"
public_container_count="$(printf '%s\n' "$public_containers" | sed '/^$/d' | wc -l | tr -d ' ')"
[[ "$public_container_count" == 1 ]] || fail "public entry container is not unique"
bash "$public_cutover_script" \
  --image "$web_ref" \
  --release "$to_sha" \
  --current-container "$public_containers" \
  --endpoint "$public_endpoint" \
  --api-origin http://app-server:8300 \
  --network "$public_network" \
  --container-prefix "$public_container_prefix" \
  --host-port "$public_host_port" \
  --candidate-port "$public_candidate_port" \
  --execute \
  --confirm "PUBLIC_WEB_CUTOVER:$public_containers:$to_sha" \
  >>"$log_file" 2>&1
public_runtime_sha="$(
  docker inspect "${public_container_prefix}${to_sha:0:8}" \
    --format '{{range .Config.Env}}{{println .}}{{end}}' |
    sed -n 's/^GIT_SHA=//p' | head -n1
)"
[[ "$public_runtime_sha" == "$to_sha" ]] ||
  fail "public entry rollback identity does not match"

enter_stage current_source_switch
current_source_switch_started=1
next_current=$root/.current-next-rollback-$operation_id
[[ ! -e "$next_current" && ! -L "$next_current" ]] ||
  fail "next current directory already exists"
cp -a --reflink=auto "$release_dir" "$next_current"
chmod 700 "$next_current"
owned_private_directory "$next_current" || fail "next current directory is invalid"
old_current=$root/current.before-rollback-${from_sha:0:8}-to-${to_sha:0:8}-${operation_id:0:8}
[[ ! -e "$old_current" && ! -L "$old_current" ]] ||
  fail "rollback source preservation path exists"
owned_private_directory "$current" || fail "current release root is invalid"
mv "$current" "$old_current"
mv "$next_current" "$current"

enter_stage passed
env_changed=0
write_receipt passed none
rm -f \
  "$incoming/.target-cache.json" \
  "$incoming/checksums.sha256" \
  "$incoming/current-release-manifest.json" \
  "$incoming/release-artifact.json" \
  "$incoming/release-manifest.json" \
  "$incoming/release-rehearsal.json" \
  "$incoming/remote-code-rollback.sh" \
  "$incoming/remote-release-acquire.sh" \
  "$incoming/rollback-manifest.json" \
  "$incoming/sbom.cdx.json" \
  "$incoming/server-image.tar" \
  "$incoming/source.tar" \
  "$incoming/transfer-checksums.sha256" \
  "$incoming/target-release-fetch.json" \
  "$incoming/web-image.tar"
rmdir "$incoming"
cat "$receipt"
