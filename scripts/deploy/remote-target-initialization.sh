#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

fail() {
  printf '[remote-target-initialization] %s\n' "$1" >&2
  return 1
}

action="${1:-}"
target="${2:-}"
operation_id="${3:-}"
release_sha="${4:-}"
release_version="${5:-}"
release_manifest_sha256="${6:-}"
release_rehearsal_sha256="${7:-}"
initialization_fingerprint="${8:-}"
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
  trial_enabled=1
  trial_target=customer-trial-133
  postgres_port=55436
  app_port=8325
  web_port=5195
  jaeger_ports=(61001 61002 61003 61004 61005 61006 61007 61008 61009 61010)
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
  trial_enabled=0
  trial_target=
  postgres_port=55437
  app_port=8335
  web_port=5205
  jaeger_ports=(62001 62002 62003 62004 62005 62006 62007 62008 62009 62010)
  ;;
*) fail "unsupported target" ;;
esac

uuid_v4_pattern='^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
sha_pattern='^[0-9a-f]{40}$'
sha256_pattern='^[0-9a-f]{64}$'
version_pattern='^[0-9A-Za-z]([0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$'

[[ "$action" == initialize ]] || fail "unsupported action"
[[ "$operation_id" =~ $uuid_v4_pattern ]] || fail "invalid operation id"
[[ "$release_sha" =~ $sha_pattern ]] || fail "invalid release SHA"
[[ "$release_version" =~ $version_pattern ]] || fail "invalid release version"
[[ "$release_manifest_sha256" =~ $sha256_pattern ]] || fail "invalid release manifest checksum"
[[ "$release_rehearsal_sha256" =~ $sha256_pattern ]] || fail "invalid rehearsal checksum"
[[ "$initialization_fingerprint" =~ $sha256_pattern ]] || fail "invalid initialization fingerprint"
[[ "$confirmation" == "PROMOTE:$target:$release_sha:$operation_id" ]] || fail "confirmation does not match"
[[ "$(hostname)" == r640 && "$(id -un)" == simon ]] || fail "remote identity does not match"

incoming=$root/incoming/$operation_id
owner_marker=$root/.initialization-owner.json
target_identity=$root/.plush-target-identity.json
releases_root=$root/releases
release_dir=$releases_root/$release_sha
current=$root/current
runtime_dir=$root/runtime
data_dir=$root/data/postgres
backups_root=$root/backups
operations_root=$root/operations
operation_dir=$operations_root/$operation_id
run_root=$root/run
tools_root=$root/tools/atlas/v1.2.0
log_file=$operation_dir/operation.log
receipt=$operation_dir/receipt.json
secret_file=$incoming/target-initialization.secret
postgres_container=$project-postgres
server_container=$project-server
web_container=$project-web-desktop
jaeger_container=$project-jaeger
public_container=${public_container_prefix}${release_sha:0:8}
public_candidate=${public_container_prefix}candidate-${release_sha:0:8}
restore_database="plush_init_restore_${operation_id//-/}"
restore_database="${restore_database:0:50}"
stage=package_verification
migration_apply_started=0
bootstrap_started=0
bootstrap_completed=0
backup_sha256=none
backup_size_bytes=0
migration_version=unknown
server_content_id=unknown
web_content_id=unknown
server_ref=unknown
web_ref=unknown
failure_handled=0

plain_owned_directory() {
  [[ -d "$1" && ! -L "$1" && "$(stat -c '%u' "$1" 2>/dev/null || true)" == "$(id -u)" ]]
}

plain_owned_file() {
  [[ -f "$1" && ! -L "$1" && "$(stat -c '%u' "$1" 2>/dev/null || true)" == "$(id -u)" ]]
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
       (.[0].RepoTags | type == "array" and length == 1 and .[0] == $ref)' \
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
    jq -e --arg configDigest "$config_digest" \
      '.schemaVersion == 2 and .config.digest == $configDigest' >/dev/null
  printf '%s\n' "$manifest_digest"
}

write_receipt_json() {
  local status="$1"
  local issue_code="$2"
  local rollback_complete_json="$3"
  jq -cn \
    --arg schemaVersion "plush.remote-target-initialization-receipt/v1" \
    --arg status "$status" \
    --arg operationId "$operation_id" \
    --arg target "$target" \
    --arg gitSha "$release_sha" \
    --arg version "$release_version" \
    --arg releaseManifestSha256 "$release_manifest_sha256" \
    --arg releaseRehearsalSha256 "$release_rehearsal_sha256" \
    --arg initializationFingerprint "$initialization_fingerprint" \
    --arg stage "$stage" \
    --arg issueCode "$issue_code" \
    --arg serverContentId "$server_content_id" \
    --arg webContentId "$web_content_id" \
    --arg backupSha256 "$backup_sha256" \
    --argjson backupSizeBytes "$backup_size_bytes" \
    --arg migrationReadback "$migration_version" \
    --argjson migrationApplyStarted "$migration_apply_started" \
    --argjson bootstrapStarted "$bootstrap_started" \
    --argjson bootstrapCompleted "$bootstrap_completed" \
    --argjson rollbackComplete "$rollback_complete_json" \
    --arg finishedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
      schemaVersion: $schemaVersion,
      status: $status,
      operationId: $operationId,
      target: $target,
      gitSha: $gitSha,
      version: $version,
      releaseManifestSha256: $releaseManifestSha256,
      releaseRehearsalSha256: $releaseRehearsalSha256,
      initializationFingerprint: $initializationFingerprint,
      stage: $stage,
      issueCode: $issueCode,
      before: {targetState: "absent"},
      images: {serverContentId: $serverContentId, webContentId: $webContentId},
      migration: {
        applyStarted: ($migrationApplyStarted == 1),
        automaticDownMigration: false,
        readback: $migrationReadback
      },
      bootstrap: {
        started: ($bootstrapStarted == 1),
        completed: ($bootstrapCompleted == 1),
        secretPersistedOnTarget: false
      },
      rollbackPoint: {
        backupAlias: ("initial-" + ($gitSha[0:12]) + "-" + $operationId),
        backupSha256: $backupSha256,
        backupSizeBytes: $backupSizeBytes,
        restoreChecked: ($backupSha256 != "none")
      },
      checks: {
        staticConfig: ($status == "passed"),
        releaseIdentity: ($status == "passed"),
        health: ($status == "passed"),
        ready: ($status == "passed"),
        basicSmoke: ($status == "passed"),
        publicEntry: ($status == "passed"),
        backupRestore: ($status == "passed"),
        dataEnvironment: ($status == "passed")
      },
      rollback: {
        complete: $rollbackComplete,
        retainedTarget: ($status == "passed"),
        preservesOtherTargets: true
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
        "demo seed or customer-test business acceptance data",
        "customer UAT and sign-off"
      ]
    }'
}

cleanup_exact_target() {
  trap - ERR
  local cleanup_container="${project}-initialization-cleanup"
  docker rm -f "$public_candidate" "$public_container" >/dev/null 2>&1 || true
  if plain_owned_file "$runtime_env" && plain_owned_directory "$release_dir"; then
    env -i \
      "HOME=$HOME" "USER=$(id -un)" "LOGNAME=$(id -un)" \
      "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
      docker compose \
      -p "$project" \
      --env-file "$runtime_env" \
      -f "$release_dir/server/deploy/compose/prod/compose.yml" \
      -f "$release_dir/server/deploy/compose/prod/$compose_override_name" \
      down --remove-orphans --volumes >/dev/null 2>&1 || true
  fi
  docker rm -f "$postgres_container" "$jaeger_container" "$server_container" "$web_container" >/dev/null 2>&1 || true
  docker network rm "$public_network" >/dev/null 2>&1 || true
  if plain_owned_directory "$root" && plain_owned_file "$owner_marker" &&
    jq -e --arg operationId "$operation_id" --arg target "$target" \
      '.schemaVersion == "plush.target-initialization-owner/v1" and .operationId == $operationId and .target == $target' \
      "$owner_marker" >/dev/null 2>&1; then
    if [[ -d "$data_dir" && ! -L "$data_dir" ]]; then
      [[ "$(docker ps -aq --filter "name=^/${cleanup_container}$" | sed '/^$/d' | wc -l | tr -d ' ')" == 0 ]] || return 1
      docker run --rm --pull never --name "$cleanup_container" \
        --network none --read-only --pids-limit 64 --memory 64m \
        --cap-drop ALL --cap-add DAC_OVERRIDE --cap-add FOWNER \
        --security-opt no-new-privileges --user 0:0 \
        --volume "$data_dir:/target" --entrypoint sh postgres:18.1 \
        -ceu 'find /target -mindepth 1 -depth -delete' >/dev/null 2>&1 || return 1
    fi
    rm -rf -- "$root"
  fi
  if [[ ! -e "$root" && ! -L "$root" ]] &&
    [[ "$(docker ps -aq --filter "label=com.docker.compose.project=$project" | sed '/^$/d' | wc -l | tr -d ' ')" == 0 ]] &&
    [[ "$({ docker ps -aq --format '{{.Names}}' | grep -E "^${public_container_prefix}" || true; } | wc -l | tr -d ' ')" == 0 ]] &&
    [[ "$(docker network ls -q --filter "name=^${public_network}$" | sed '/^$/d' | wc -l | tr -d ' ')" == 0 ]]; then
    return 0
  fi
  return 1
}

on_error() {
  local exit_code=$?
  [[ "$failure_handled" -eq 0 ]] || exit "$exit_code"
  failure_handled=1
  if cleanup_exact_target; then
    write_receipt_json failed initialization_rolled_back true
  else
    write_receipt_json not_proven rollback_incomplete false
  fi
  exit "$exit_code"
}
trap on_error ERR

plain_owned_directory "$root" || fail "target root is invalid"
plain_owned_file "$owner_marker" || fail "initialization owner marker is invalid"
jq -e --arg operationId "$operation_id" --arg target "$target" \
  '.schemaVersion == "plush.target-initialization-owner/v1" and .operationId == $operationId and .target == $target' \
  "$owner_marker" >/dev/null || fail "initialization owner marker does not match"
plain_owned_directory "$incoming" || fail "incoming directory is invalid"
mkdir -p "$operation_dir" "$run_root"
chmod 700 "$operations_root" "$operation_dir" "$run_root"
: >"$log_file"
chmod 600 "$log_file"

exec 9>>"$run_root/promotion.lock"
chmod 600 "$run_root/promotion.lock"
flock -n 9 || fail "target operation lock is held"

required_files=(
  promotion-manifest.json
  release-artifact.json
  release-manifest.json
  release-rehearsal.json
  remote-promotion.sh
  sbom.cdx.json
  server-image.tar
  source.tar
  target-initialization.secret
  transfer-checksums.sha256
  web-image.tar
)
for file in "${required_files[@]}"; do
  plain_owned_file "$incoming/$file" || fail "incoming package is incomplete"
  [[ "$(stat -c '%a' "$incoming/$file")" == 600 ]] || fail "incoming file mode is invalid"
done
(
  cd "$incoming"
  sha256sum --check --strict transfer-checksums.sha256
) >>"$log_file" 2>&1
[[ "$(sha256sum "$incoming/release-manifest.json" | awk '{print $1}')" == "$release_manifest_sha256" ]] || fail "release manifest checksum does not match"
[[ "$(sha256sum "$incoming/release-rehearsal.json" | awk '{print $1}')" == "$release_rehearsal_sha256" ]] || fail "release rehearsal checksum does not match"

jq -e \
  --arg operationId "$operation_id" \
  --arg target "$target" \
  --arg sha "$release_sha" \
  --arg fingerprint "$initialization_fingerprint" \
  '.schemaVersion == "plush.target-initialization-manifest/v1" and
   .mode == "initialize" and .status == "eligible" and
   .operationId == $operationId and .target.key == $target and
   .release.gitSha == $sha and .before.targetState == "absent" and
   .fingerprint == $fingerprint and
   .rollback.removeOnlyCreatedTarget == true and
   .rollback.preserveOtherTargets == true and
   .rollback.databaseDownMigrationAutomatic == false' \
  "$incoming/promotion-manifest.json" >/dev/null || fail "initialization plan is invalid"
jq -e \
  --arg sha "$release_sha" \
  --arg version "$release_version" \
  --arg artifactSha "$(sha256sum "$incoming/release-artifact.json" | awk '{print $1}')" \
  '.schemaVersion == "plush.release-manifest/v2" and .passed == true and
   .gitSha == $sha and .version == $version and
   .strict.status == "passed" and .rehearsal.status == "passed" and
   .rehearsal.cleanup.passed == true and .rehearsal.cleanup.residualContainers == 0 and
   .artifact.manifestSha256 == $artifactSha and
   .rollback.databaseDownMigrationAutomatic == false' \
  "$incoming/release-manifest.json" >/dev/null || fail "release manifest is invalid"
jq -e \
  --arg sha "$release_sha" --arg version "$release_version" \
  '.schemaVersion == "plush-release-artifact/v1" and .passed == true and
   .git.commit == $sha and .git.head == $sha and .git.worktreeClean == true and
   .releaseVersion == $version and (.images | length) == 2' \
  "$incoming/release-artifact.json" >/dev/null || fail "release artifact is invalid"
jq -e -s '
  .[0] as $release | .[1] as $artifact | .[2] as $plan |
  $release.artifact.sourceArchiveSha256 == $artifact.sourceArchive.sha256 and
  $release.migration.latest == $artifact.migration.latest and
  $release.migration.sequenceSha256 == $artifact.migration.sequenceSha256 and
  $release.customerConfig.sourceSha256 == $artifact.customerConfig.sourceSha256 and
  $release.sbom.sha256 == $artifact.sbom.sha256 and
  (($plan.release.images | map({kind, sourceContentId}) | sort_by(.kind)) ==
   ($artifact.images | map({kind, sourceContentId: .contentId}) | sort_by(.kind)))' \
  "$incoming/release-manifest.json" \
  "$incoming/release-artifact.json" \
  "$incoming/promotion-manifest.json" >/dev/null || fail "release binding is invalid"

source_sha256="$(jq -r '.sourceArchive.sha256' "$incoming/release-artifact.json")"
sbom_sha256="$(jq -r '.sbom.sha256' "$incoming/release-artifact.json")"
migration_sequence_sha256="$(jq -r '.migration.sequenceSha256' "$incoming/release-artifact.json")"
migration_version="$(jq -r '.migration.latest' "$incoming/release-artifact.json")"
[[ "$source_sha256" =~ $sha256_pattern && "$sbom_sha256" =~ $sha256_pattern && "$migration_sequence_sha256" =~ $sha256_pattern ]] || fail "artifact checksums are invalid"
[[ "$migration_version" =~ ^[0-9]{14}$ ]] || fail "migration identity is invalid"
[[ "$(sha256sum "$incoming/source.tar" | awk '{print $1}')" == "$source_sha256" ]] || fail "source archive checksum does not match"
[[ "$(sha256sum "$incoming/sbom.cdx.json" | awk '{print $1}')" == "$sbom_sha256" ]] || fail "SBOM checksum does not match"

stage=release_materialization
mkdir -p "$releases_root"
chmod 700 "$releases_root"
[[ ! -e "$release_dir" ]] || fail "release directory already exists"
mkdir "$release_dir"
chmod 700 "$release_dir"
if ! tar -tf "$incoming/source.tar" | awk '/^\// {exit 1} /(^|\/)\.\.?(\/|$)/ {exit 1}'; then
  fail "source archive contains an unsafe path"
fi
tar --extract --file "$incoming/source.tar" --directory "$release_dir" --no-same-owner --no-same-permissions
database_roles_script=$release_dir/server/deploy/compose/prod/database_roles.sh
plain_owned_file "$database_roles_script" || fail "database role initializer is invalid"
chmod 755 "$database_roles_script"
jq -n \
  --arg schemaVersion "plush.target-release-identity/v1" \
  --arg gitSha "$release_sha" \
  --arg sourceArchiveSha256 "$source_sha256" \
  --arg releaseManifestSha256 "$release_manifest_sha256" \
  '{schemaVersion:$schemaVersion,gitSha:$gitSha,sourceArchiveSha256:$sourceArchiveSha256,releaseManifestSha256:$releaseManifestSha256}' \
  >"$release_dir/.plush-release-identity.json"
chmod 600 "$release_dir/.plush-release-identity.json"
cmp --silent "$incoming/remote-promotion.sh" "$release_dir/scripts/deploy/remote-target-initialization.sh" || fail "initializer is not part of the exact release"

stage=image_load_and_readback
server_ref="$(jq -r '.images[] | select(.kind == "server") | .ref' "$incoming/release-artifact.json")"
web_ref="$(jq -r '.images[] | select(.kind == "web") | .ref' "$incoming/release-artifact.json")"
server_content_id="$(jq -r '.images[] | select(.kind == "server") | .contentId' "$incoming/release-artifact.json")"
web_content_id="$(jq -r '.images[] | select(.kind == "web") | .contentId' "$incoming/release-artifact.json")"
[[ "$server_ref" == "plush-toy-erp-server:yoyoosun-$release_sha" && "$web_ref" == "plush-toy-erp-web:yoyoosun-$release_sha" ]] || fail "image refs do not match"
[[ "$server_content_id" =~ ^sha256:[0-9a-f]{64}$ && "$web_content_id" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "image content IDs are invalid"
server_archive_manifest_digest="$(portable_archive_manifest_digest "$incoming/server-image.tar" "$server_ref" "$server_content_id")"
web_archive_manifest_digest="$(portable_archive_manifest_digest "$incoming/web-image.tar" "$web_ref" "$web_content_id")"
docker load --input "$incoming/server-image.tar" >>"$log_file" 2>&1
docker load --input "$incoming/web-image.tar" >>"$log_file" 2>&1
actual_server_content_id="$(docker image inspect --format '{{.Id}}' "$server_ref")"
actual_web_content_id="$(docker image inspect --format '{{.Id}}' "$web_ref")"
[[ ("$actual_server_content_id" == "$server_content_id" ||
  "$actual_server_content_id" == "$server_archive_manifest_digest") &&
  ("$actual_web_content_id" == "$web_content_id" ||
  "$actual_web_content_id" == "$web_archive_manifest_digest") ]] || fail "loaded image content IDs do not match"
for image_ref in "$server_ref" "$web_ref"; do
  [[ "$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image_ref")" == linux/amd64 ]] || fail "image platform does not match"
  [[ "$(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$image_ref" | sed -n 's/^GIT_SHA=//p' | head -n1)" == "$release_sha" ]] || fail "image release identity does not match"
done

stage=runtime_secret_materialization
declare -A secret_values=()
while IFS='=' read -r key value; do
  [[ "$key" =~ ^(POSTGRES_PASSWORD|POSTGRES_APP_PASSWORD|POSTGRES_MIGRATOR_PASSWORD|POSTGRES_BACKUP_PASSWORD|APP_JWT_SECRET|APP_ADMIN_PASSWORD)$ ]] || fail "secret bundle key is invalid"
  [[ -z "${secret_values[$key]+x}" ]] || fail "secret bundle key is duplicated"
  secret_values[$key]="$value"
done <"$secret_file"
for key in POSTGRES_PASSWORD POSTGRES_APP_PASSWORD POSTGRES_MIGRATOR_PASSWORD POSTGRES_BACKUP_PASSWORD APP_JWT_SECRET APP_ADMIN_PASSWORD; do
  [[ -n "${secret_values[$key]:-}" ]] || fail "secret bundle is incomplete"
done
for key in POSTGRES_PASSWORD POSTGRES_APP_PASSWORD POSTGRES_MIGRATOR_PASSWORD POSTGRES_BACKUP_PASSWORD APP_JWT_SECRET; do
  [[ "${secret_values[$key]}" =~ ^[A-Za-z0-9._~-]{20,128}$ ]] || fail "generated runtime secret shape is invalid"
done
[[ "${secret_values[APP_ADMIN_PASSWORD]}" =~ ^[A-Za-z0-9!._~-]{8,20}$ ]] || fail "generated administrator secret shape is invalid"

provider_container=plush-toy-erp-server
[[ "$(docker inspect --format '{{.State.Running}}' "$provider_container" 2>/dev/null || true)" == true ]] || fail "existing yoyoosun provider runtime is unavailable"
provider_env="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$provider_container")"
provider_value() {
  local key="$1"
  printf '%s\n' "$provider_env" | awk -F= -v key="$key" '$1 == key {sub(/^[^=]*=/, ""); print; count++} END {if (count != 1) exit 1}'
}
sms_access_key_id="$(provider_value APP_AUTH_SMS_ALIYUN_ACCESS_KEY_ID)"
sms_access_key_secret="$(provider_value APP_AUTH_SMS_ALIYUN_ACCESS_KEY_SECRET)"
sms_sign_name="$(provider_value APP_AUTH_SMS_ALIYUN_SIGN_NAME)"
sms_template_code="$(provider_value APP_AUTH_SMS_ALIYUN_TEMPLATE_CODE)"
for value in "$sms_access_key_id" "$sms_access_key_secret" "$sms_sign_name" "$sms_template_code"; do
  [[ -n "$value" && "$value" != *$'\n'* ]] || fail "provider credential contract is unavailable"
done
unset provider_env

[[ ! -e "$data_dir" && ! -L "$data_dir" ]] || fail "database data directory must be absent before initialization"
# Keep the same ownership contract as the green release rehearsal: Docker creates
# the bind source, then the PostgreSQL 18 entrypoint establishes its runtime owner.
mkdir -p "$runtime_dir" "$root/data" "$backups_root" "$run_root" "$tools_root"
chmod 700 "$runtime_dir" "$root/data" "$backups_root" "$run_root" "$root/tools" "$root/tools/atlas" "$tools_root"
cp /usr/local/bin/atlas "$tools_root/atlas"
chmod 700 "$tools_root/atlas"

postgres_dsn="postgres://erp_app:${secret_values[POSTGRES_APP_PASSWORD]}@postgres:5432/${database}?sslmode=disable"
{
  printf 'PROJECT_SLUG=%s\n' "$project"
  printf 'ERP_CUSTOMER_KEY=yoyoosun\n'
  printf 'APP_IMAGE=%s\n' "$server_ref"
  printf 'WEB_IMAGE=%s\n' "$web_ref"
  printf 'POSTGRES_IMAGE=postgres:18.1\n'
  printf 'JAEGER_IMAGE=jaegertracing/all-in-one:1.76.0\n'
  printf 'TZ=Asia/Shanghai\n'
  printf 'POSTGRES_MEM_LIMIT=512m\nPOSTGRES_MEM_RESERVATION=256m\n'
  printf 'JAEGER_MEM_LIMIT=96m\nJAEGER_MEM_RESERVATION=48m\n'
  printf 'APP_MEM_LIMIT=2g\nAPP_MEM_RESERVATION=768m\nAPP_SHM_SIZE=256m\nAPP_TMPFS_SIZE=256m\n'
  printf 'WEB_MEM_LIMIT=96m\nWEB_MEM_RESERVATION=48m\n'
  printf 'POSTGRES_PASSWORD=%s\n' "${secret_values[POSTGRES_PASSWORD]}"
  printf 'POSTGRES_APP_PASSWORD=%s\n' "${secret_values[POSTGRES_APP_PASSWORD]}"
  printf 'POSTGRES_MIGRATOR_PASSWORD=%s\n' "${secret_values[POSTGRES_MIGRATOR_PASSWORD]}"
  printf 'POSTGRES_BACKUP_PASSWORD=%s\n' "${secret_values[POSTGRES_BACKUP_PASSWORD]}"
  printf 'POSTGRES_DSN=%s\n' "$postgres_dsn"
  printf 'POSTGRES_MAX_OPEN_CONNS=20\nPOSTGRES_MAX_IDLE_CONNS=5\n'
  printf 'POSTGRES_CONN_MAX_LIFETIME=30m\nPOSTGRES_CONN_MAX_IDLE_TIME=5m\nPOSTGRES_STARTUP_TIMEOUT=60s\n'
  printf 'POSTGRES_DB=%s\nPOSTGRES_USER=postgres\n' "$database"
  printf 'POSTGRES_DATA_DIR=%s\nMIGRATION_LOCK_FILE=%s\n' "$data_dir" "$root/run/atlas-migrate.lock"
  printf 'TRACE_ENDPOINT=jaeger:4318\nTRACE_RATIO=0.1\n'
  printf 'WEB_API_ORIGIN=http://app-server:8300\nWEB_PROXY_PREFIXES=/rpc,/templates\n'
  printf 'WEB_PROXY_TIMEOUT_MS=30000\nWEB_READINESS_TIMEOUT_MS=2000\nWEB_SHUTDOWN_TIMEOUT_MS=10000\n'
  printf 'ERP_PDF_CHROME_PATH=/usr/bin/chromium\nERP_PDF_RENDER_CONCURRENCY=4\nERP_PDF_QUEUE_CAPACITY=2\nERP_PDF_WARMUP=async\n'
  printf 'APP_JWT_SECRET=%s\n' "${secret_values[APP_JWT_SECRET]}"
  printf 'APP_AUTH_SMS_MODE=provider\n'
  printf 'APP_AUTH_SMS_ALIYUN_ACCESS_KEY_ID=%s\n' "$sms_access_key_id"
  printf 'APP_AUTH_SMS_ALIYUN_ACCESS_KEY_SECRET=%s\n' "$sms_access_key_secret"
  printf 'APP_AUTH_SMS_ALIYUN_SIGN_NAME=%s\n' "$sms_sign_name"
  printf 'APP_AUTH_SMS_ALIYUN_TEMPLATE_CODE=%s\n' "$sms_template_code"
  printf 'APP_ADMIN_USERNAME=admin\nBOOTSTRAP_ADMIN_ONCE=false\n'
  printf 'ERP_DEBUG_ENV=prod\nERP_DEBUG_SEED_ENABLED=false\nERP_DEBUG_CLEANUP_ENABLED=false\n'
  printf 'ERP_DEBUG_BUSINESS_CLEAR_ENABLED=false\nERP_DEBUG_CLEANUP_SCOPE=debug_run\n'
  printf 'ERP_ALLOW_CUSTOMER_TRIAL_CONFIG=%s\nERP_CUSTOMER_TRIAL_TARGET=%s\n' "$trial_enabled" "$trial_target"
  printf 'POSTGRES_BIND_ADDR=127.0.0.1\nPOSTGRES_PORT=%s\n' "$postgres_port"
  printf 'APP_HTTP_BIND_ADDR=127.0.0.1\nAPP_HTTP_PORT=%s\n' "$app_port"
  printf 'WEB_DESKTOP_BIND_ADDR=127.0.0.1\nWEB_DESKTOP_PORT=%s\n' "$web_port"
  printf 'JAEGER_BIND_ADDR=127.0.0.1\n'
  printf 'JAEGER_5775_PORT=%s\nJAEGER_6831_PORT=%s\nJAEGER_6832_PORT=%s\nJAEGER_5778_PORT=%s\n' "${jaeger_ports[0]}" "${jaeger_ports[1]}" "${jaeger_ports[2]}" "${jaeger_ports[3]}"
  printf 'JAEGER_UI_PORT=%s\nJAEGER_14268_PORT=%s\nJAEGER_14250_PORT=%s\nJAEGER_9411_PORT=%s\n' "${jaeger_ports[4]}" "${jaeger_ports[5]}" "${jaeger_ports[6]}" "${jaeger_ports[7]}"
  printf 'JAEGER_OTLP_GRPC_PORT=%s\nJAEGER_OTLP_HTTP_PORT=%s\n' "${jaeger_ports[8]}" "${jaeger_ports[9]}"
  printf 'PROMETHEUS_SERVER_URL=http://host.docker.internal:3004\n'
} >"$runtime_env.next"
chmod 600 "$runtime_env.next"
mv "$runtime_env.next" "$runtime_env"
unset postgres_dsn sms_access_key_id sms_access_key_secret sms_sign_name sms_template_code

compose_dir=$release_dir/server/deploy/compose/prod
compose_base=$compose_dir/compose.yml
compose_override=$compose_dir/$compose_override_name
preflight_script=$release_dir/scripts/deploy/production-preflight.sh
migrate_script=$compose_dir/migrate_online.sh
bootstrap_script=$release_dir/scripts/deploy/bootstrap-production-admin.sh
[[ -f "$compose_base" && -f "$compose_override" && -x "$preflight_script" && -x "$migrate_script" && -x "$bootstrap_script" ]] || fail "release deployment entrypoints are incomplete"
clean_env=(env -i "HOME=$HOME" "USER=$(id -un)" "LOGNAME=$(id -un)" "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin")
compose=(docker compose -p "$project" --env-file "$runtime_env" -f "$compose_base" -f "$compose_override")

stage=static_preflight
"${clean_env[@]}" bash "$preflight_script" \
  --deployment-target "$target" --env-file "$runtime_env" \
  --compose-dir "$compose_dir" --compose-override "$compose_override" \
  >>"$log_file" 2>&1

stage=database_start
"${clean_env[@]}" "${compose[@]}" up -d --no-build --pull never postgres jaeger >>"$log_file" 2>&1
deadline=$((SECONDS + 120))
while true; do
  postgres_cid="$("${clean_env[@]}" "${compose[@]}" ps -q postgres 2>/dev/null || true)"
  postgres_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$postgres_cid" 2>/dev/null || true)"
  [[ "$postgres_health" == healthy ]] && break
  ((SECONDS < deadline)) || fail "PostgreSQL did not become healthy"
  sleep 2
done

stage=migration_apply_started
migration_apply_started=1
{
  "${clean_env[@]}" \
    "COMPOSE_OVERRIDE_FILE=$compose_override" "COMPOSE_ENV_FILE=$runtime_env" \
    "DEPLOYMENT_TARGET_KEY=$target" "MIGRATION_MAINTENANCE_CONFIRMED=1" \
    "EXPECTED_MIGRATION_SEQUENCE_SHA256=$migration_sequence_sha256" \
    "RELEASE_SHA=$release_sha" "APPLICATION_IMAGE_DIGEST=$server_content_id" \
    sh "$migrate_script" --reconcile-permissions
  "${clean_env[@]}" \
    "COMPOSE_OVERRIDE_FILE=$compose_override" "COMPOSE_ENV_FILE=$runtime_env" \
    "DEPLOYMENT_TARGET_KEY=$target" "MIGRATION_MAINTENANCE_CONFIRMED=1" \
    "EXPECTED_MIGRATION_SEQUENCE_SHA256=$migration_sequence_sha256" \
    "RELEASE_SHA=$release_sha" "APPLICATION_IMAGE_DIGEST=$server_content_id" \
    sh "$migrate_script" --apply
  "${clean_env[@]}" \
    "COMPOSE_OVERRIDE_FILE=$compose_override" "COMPOSE_ENV_FILE=$runtime_env" \
    "DEPLOYMENT_TARGET_KEY=$target" "EXPECTED_MIGRATION_SEQUENCE_SHA256=$migration_sequence_sha256" \
    "RELEASE_SHA=$release_sha" "APPLICATION_IMAGE_DIGEST=$server_content_id" \
    sh "$migrate_script" --status-only
} >>"$log_file" 2>&1

stage=administrator_bootstrap
bootstrap_started=1
APP_ADMIN_PASSWORD="${secret_values[APP_ADMIN_PASSWORD]}" bash "$bootstrap_script" \
  --deployment-target "$target" --env-file "$runtime_env" \
  --compose-dir "$compose_dir" --compose-override "$compose_override" \
  --expected-database "$database" --expected-migration "$migration_version" \
  --expected-release "$release_sha" \
  --confirm "BOOTSTRAP_PRODUCTION_ADMIN:$project:$database:admin:$migration_version:$release_sha" \
  >>"$log_file" 2>&1
bootstrap_completed=1
unset secret_values APP_ADMIN_PASSWORD
rm -f -- "$secret_file"

stage=compose_start
"${clean_env[@]}" "${compose[@]}" up -d --no-build --pull never postgres jaeger app-server web-desktop >>"$log_file" 2>&1

stage=runtime_verified
"${clean_env[@]}" bash "$preflight_script" \
  --deployment-target "$target" --env-file "$runtime_env" \
  --compose-dir "$compose_dir" --compose-override "$compose_override" \
  --runtime --expected-release "$release_sha" \
  --out "$operation_dir/production-preflight-report.txt" >>"$log_file" 2>&1
curl -fsS --max-time 10 "$server_endpoint/healthz" >/dev/null
curl -fsS --max-time 10 "$server_endpoint/readyz" >/dev/null
curl -fsS --max-time 10 "$web_endpoint/healthz" >/dev/null
[[ "$(docker inspect "$server_container" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^GIT_SHA=//p' | head -n1)" == "$release_sha" ]] || fail "server runtime release identity does not match"
[[ "$(docker inspect "$web_container" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^GIT_SHA=//p' | head -n1)" == "$release_sha" ]] || fail "web runtime release identity does not match"

stage=basic_smoke
curl -fsS --max-time 10 -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":"target-init","method":"version","params":{}}' \
  "$web_endpoint/rpc/system" | jq -e --arg sha "$release_sha" --arg version "$release_version" \
  '.result.code == 0 and .result.data.git_sha == $sha and .result.data.release_version == $version and .result.data.formal == true' \
  >/dev/null

stage=public_entry_switch
public_cutover_script=$release_dir/deployments/yoyoosun/scripts/cutover-public-web.sh
bash "$public_cutover_script" \
  --image "$web_ref" --release "$release_sha" --current-container none \
  --endpoint "$public_endpoint" --api-origin http://app-server:8300 \
  --network "$public_network" --container-prefix "$public_container_prefix" \
  --host-port "$public_host_port" --candidate-port "$public_candidate_port" \
  --execute --confirm "PUBLIC_WEB_CUTOVER:none:$release_sha" >>"$log_file" 2>&1
[[ "$(docker inspect "$public_container" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^GIT_SHA=//p' | head -n1)" == "$release_sha" ]] || fail "public entry release identity does not match"

stage=backup_restore_check
postgres_cid="$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter 'label=com.docker.compose.service=postgres')"
[[ "$(printf '%s\n' "$postgres_cid" | sed '/^$/d' | wc -l | tr -d ' ')" == 1 ]] || fail "target PostgreSQL is not unique"
backup_final="$backups_root/initial-${release_sha:0:12}-$operation_id.dump"
docker exec "$postgres_cid" sh -ceu 'pg_dump -Fc --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >"$backup_final.tmp"
chmod 600 "$backup_final.tmp"
[[ -s "$backup_final.tmp" ]] || fail "initial backup is empty"
{
  docker exec -i "$postgres_cid" pg_restore --list <"$backup_final.tmp"
  docker exec "$postgres_cid" sh -ceu 'createdb -U "$POSTGRES_USER" "$1"' sh "$restore_database"
  docker exec -i "$postgres_cid" sh -ceu 'pg_restore --exit-on-error --no-owner --no-privileges -U "$POSTGRES_USER" -d "$1"' sh "$restore_database" <"$backup_final.tmp"
} >>"$log_file" 2>&1
restored_table_count="$(docker exec "$postgres_cid" sh -ceu 'psql -U "$POSTGRES_USER" -d "$1" -Atqc "SELECT count(*) FROM information_schema.tables WHERE table_schema = '\''public'\''"' sh "$restore_database")"
[[ "$restored_table_count" =~ ^[1-9][0-9]*$ ]] || fail "initial backup restore check failed"
docker exec "$postgres_cid" sh -ceu 'dropdb --if-exists --force -U "$POSTGRES_USER" "$1"' sh "$restore_database" >>"$log_file" 2>&1
mv "$backup_final.tmp" "$backup_final"
backup_sha256="$(sha256sum "$backup_final" | awk '{print $1}')"
backup_size_bytes="$(stat -c '%s' "$backup_final")"
[[ "$backup_sha256" =~ $sha256_pattern && "$backup_size_bytes" -gt 0 ]] || fail "initial backup identity is invalid"

stage=current_source_switch
cp -a --reflink=auto "$release_dir" "$root/.current-next-$operation_id"
chmod 700 "$root/.current-next-$operation_id"
mv "$root/.current-next-$operation_id" "$current"
jq -n --arg schemaVersion "plush.target-identity/v1" --arg target "$target" --arg operationId "$operation_id" --arg gitSha "$release_sha" \
  '{schemaVersion:$schemaVersion,target:$target,operationId:$operationId,gitSha:$gitSha}' >"$target_identity.next"
chmod 600 "$target_identity.next"
mv "$target_identity.next" "$target_identity"

stage=passed
write_receipt_json passed none true >"$receipt.next"
chmod 600 "$receipt.next"
mv "$receipt.next" "$receipt"
rm -f -- \
  "$incoming/promotion-manifest.json" "$incoming/release-artifact.json" \
  "$incoming/release-manifest.json" "$incoming/release-rehearsal.json" \
  "$incoming/remote-promotion.sh" "$incoming/sbom.cdx.json" \
  "$incoming/server-image.tar" "$incoming/source.tar" \
  "$incoming/transfer-checksums.sha256" "$incoming/web-image.tar"
rmdir "$incoming"
rm -f -- "$owner_marker"
cat "$receipt"
