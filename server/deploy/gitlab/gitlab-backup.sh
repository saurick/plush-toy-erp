#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ENV_FILE="$SCRIPT_DIR/.env"
EXPECTED_CONTROL_HOSTNAME=r740xd
EXPECTED_GITLAB_HOSTNAME=gitlab.saurick.me
EXPECTED_CONFIRMATION="BACKUP_GITLAB:${EXPECTED_CONTROL_HOSTNAME}:${EXPECTED_GITLAB_HOSTNAME}"
EXPORT_MARKER_VALUE=plush.backup-source/v1:gitlab-r740xd
EXECUTE=false
CONFIRMATION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
  --env-file)
    ENV_FILE="${2:-}"
    shift 2
    ;;
  --execute)
    EXECUTE=true
    shift
    ;;
  --confirm)
    CONFIRMATION="${2:-}"
    shift 2
    ;;
  -h | --help)
    echo "usage: sudo bash server/deploy/gitlab/gitlab-backup.sh [--env-file <file>] --execute --confirm $EXPECTED_CONFIRMATION"
    exit 0
    ;;
  *)
    echo "[gitlab-backup] unsupported argument: $1"
    exit 2
    ;;
  esac
done

if [[ "$ENV_FILE" != /* || ! -f "$ENV_FILE" || -L "$ENV_FILE" ]]; then
  echo "[gitlab-backup] env file must be a regular non-symlink file: $ENV_FILE" >&2
  exit 2
fi

read_env_value() {
  local key="$1"
  local count value
  count="$(grep -Ec "^${key}=" "$ENV_FILE" || true)"
  [[ "$count" == "1" ]] || return 2
  value="$(sed -n "s/^${key}=//p" "$ENV_FILE")"
  [[ -n "$value" && "$value" =~ ^[A-Za-z0-9._:/-]+$ ]] || return 2
  printf '%s' "$value"
}

require_plain_directory() {
  local directory="$1"
  local label="$2"
  [[ "$directory" == /* && "$directory" != "/" && -d "$directory" && ! -L "$directory" ]] || {
    echo "[gitlab-backup] $label must be an existing absolute non-symlink directory" >&2
    exit 2
  }
  [[ "$(realpath -e -- "$directory")" == "$directory" ]] || {
    echo "[gitlab-backup] $label must not contain aliases or symbolic links" >&2
    exit 2
  }
}

require_plain_file() {
  local file="$1"
  local label="$2"
  [[ "$file" == /* && -f "$file" && ! -L "$file" ]] || {
    echo "[gitlab-backup] $label must be an existing absolute non-symlink file" >&2
    exit 2
  }
  [[ "$(realpath -e -- "$file")" == "$file" ]] || {
    echo "[gitlab-backup] $label must not contain aliases or symbolic links" >&2
    exit 2
  }
}

GITLAB_DATA_DIR="$(read_env_value GITLAB_DATA_DIR)"
GITLAB_CONFIG_DIR="$(read_env_value GITLAB_CONFIG_DIR)"
GITLAB_RAID_BACKUP_DIR="$(read_env_value GITLAB_RAID_BACKUP_DIR)"
GITLAB_BACKUP_EXPORT_DIR="$(read_env_value GITLAB_BACKUP_EXPORT_DIR)"
GITLAB_BACKUP_AGE_RECIPIENT_FILE="$(read_env_value GITLAB_BACKUP_AGE_RECIPIENT_FILE)"
GITLAB_BACKUP_RETENTION_DAYS="$(read_env_value GITLAB_BACKUP_RETENTION_DAYS)"

[[ "$GITLAB_DATA_DIR" == "/srv/gitlab/data" ]]
[[ "$GITLAB_CONFIG_DIR" == "/srv/gitlab/config" ]]
[[ "$GITLAB_RAID_BACKUP_DIR" == "/srv/raid5/gitlab/backups" ]]
[[ "$GITLAB_BACKUP_RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]]
((GITLAB_BACKUP_RETENTION_DAYS >= 7 && GITLAB_BACKUP_RETENTION_DAYS <= 366)) || {
  echo "[gitlab-backup] retention days must be between 7 and 366" >&2
  exit 2
}
if [[ "$(hostname -s)" != "$EXPECTED_CONTROL_HOSTNAME" ]]; then
  echo "[gitlab-backup] control host identity mismatch" >&2
  exit 2
fi

for command_name in age docker findmnt flock realpath sha256sum stat tar; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "[gitlab-backup] missing command: $command_name" >&2
    exit 2
  }
done

require_plain_directory "$GITLAB_BACKUP_EXPORT_DIR" "encrypted export directory"
require_plain_file "$GITLAB_BACKUP_AGE_RECIPIENT_FILE" "age recipient file"
[[ ! -L /srv/raid5 && "$(findmnt -n -o TARGET --target /srv/raid5)" == "/srv/raid5" ]] || {
  echo "[gitlab-backup] RAID5 must be mounted" >&2
  exit 2
}
[[ "$GITLAB_BACKUP_EXPORT_DIR" == "$GITLAB_RAID_BACKUP_DIR/export" ]] || {
  echo "[gitlab-backup] encrypted export must use the registered local spool" >&2
  exit 2
}
export_marker="$GITLAB_BACKUP_EXPORT_DIR/.plush-backup-source"
require_plain_file "$export_marker" "export marker"
[[ "$(<"$export_marker")" == "$EXPORT_MARKER_VALUE" ]] || {
  echo "[gitlab-backup] export marker is invalid" >&2
  exit 2
}
recipient_mode="$(stat -c '%a' "$GITLAB_BACKUP_AGE_RECIPIENT_FILE")"
recipient_owner="$(stat -c '%u' "$GITLAB_BACKUP_AGE_RECIPIENT_FILE")"
[[ "$recipient_mode" =~ ^[0-7]{3,4}$ && "$recipient_owner" == "$EUID" ]] || {
  echo "[gitlab-backup] age recipient file identity is invalid" >&2
  exit 2
}
(((8#$recipient_mode & 8#022) == 0)) || {
  echo "[gitlab-backup] age recipient file must not be group/world writable" >&2
  exit 2
}
age_recipient_count="$(grep -Ec '^age1[0-9a-z]{20,}$' "$GITLAB_BACKUP_AGE_RECIPIENT_FILE" || true)"
[[ "$age_recipient_count" == 1 ]] || {
  echo "[gitlab-backup] age recipient file must contain exactly one recipient" >&2
  exit 2
}
age_recipient="$(grep -E '^age1[0-9a-z]{20,}$' "$GITLAB_BACKUP_AGE_RECIPIENT_FILE")"

docker inspect plush-gitlab >/dev/null
test "$(docker inspect --format '{{.State.Health.Status}}' plush-gitlab)" = healthy
backup_source="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/opt/gitlab/backups"}}{{.Source}}{{end}}{{end}}' plush-gitlab)"
[[ "$backup_source" == "$GITLAB_RAID_BACKUP_DIR/repository" ]] || {
  echo "[gitlab-backup] backup mount mismatch; refusing a fallback location" >&2
  exit 2
}
echo "[gitlab-backup] local_target=$GITLAB_RAID_BACKUP_DIR export_target=$GITLAB_BACKUP_EXPORT_DIR retention_days=$GITLAB_BACKUP_RETENTION_DAYS"

if [[ "$EXECUTE" != "true" ]]; then
  echo "[gitlab-backup] preview_only=true"
  exit 0
fi
if [[ "$EUID" -ne 0 || "$CONFIRMATION" != "$EXPECTED_CONFIRMATION" ]]; then
  echo "[gitlab-backup] root and exact confirmation are required" >&2
  exit 2
fi

install -d -m 0700 "$GITLAB_RAID_BACKUP_DIR/repository" "$GITLAB_RAID_BACKUP_DIR/config"
exec 9>"$GITLAB_RAID_BACKUP_DIR/.backup.lock"
flock -n 9 || {
  echo "[gitlab-backup] another backup is active" >&2
  exit 2
}

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_id="gitlab-$stamp"
status_file="$GITLAB_RAID_BACKUP_DIR/latest-status.env"
export_temp="$GITLAB_BACKUP_EXPORT_DIR/.backup-$stamp.tmp.$$"
export_final="$GITLAB_BACKUP_EXPORT_DIR/backup-$stamp"
portable_checksum="$GITLAB_RAID_BACKUP_DIR/.offsite-$stamp.sha256.tmp.$$"
portable_manifest="$GITLAB_RAID_BACKUP_DIR/.offsite-$stamp.manifest.tmp.$$"
generation_marker="$GITLAB_RAID_BACKUP_DIR/.backup-start-$stamp.tmp.$$"
config_temp="$GITLAB_RAID_BACKUP_DIR/.config-$stamp.tmp.$$"
repository_hash=unavailable
config_hash=unavailable
repository_size=0
config_size=0
export_prepared=false
export_encrypted=false

remove_temporary_paths() {
  rm -f -- "$portable_checksum" "$portable_manifest" "$generation_marker"
  if [[ -d "$config_temp" && ! -L "$config_temp" && "$(dirname -- "$config_temp")" == "$GITLAB_RAID_BACKUP_DIR" ]]; then
    find "$config_temp" -xdev -depth -delete
  fi
  if [[ -d "$export_temp" && ! -L "$export_temp" && "$(dirname -- "$export_temp")" == "$GITLAB_BACKUP_EXPORT_DIR" ]]; then
    find "$export_temp" -xdev -depth -delete
  fi
}

write_status() {
  local result="$1"
  local exit_code="$2"
  local completed_at temporary
  completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  temporary="$status_file.tmp.$$"
  {
    printf 'schemaVersion=plush.gitlab-backup-status/v1\n'
    printf 'status=%s\n' "$result"
    printf 'backupId=%s\n' "$backup_id"
    printf 'startedAt=%s\n' "$started_at"
    printf 'completedAt=%s\n' "$completed_at"
    printf 'exitCode=%s\n' "$exit_code"
    printf 'repositorySha256=%s\n' "$repository_hash"
    printf 'repositorySizeBytes=%s\n' "$repository_size"
    printf 'configSha256=%s\n' "$config_hash"
    printf 'configSizeBytes=%s\n' "$config_size"
    printf 'exportPrepared=%s\n' "$export_prepared"
    printf 'offsiteCopied=false\n'
    printf 'exportEncrypted=%s\n' "$export_encrypted"
  } >"$temporary"
  chmod 0600 "$temporary"
  mv -f -- "$temporary" "$status_file"
}

on_exit() {
  local exit_code=$?
  trap - EXIT
  set +e
  remove_temporary_paths
  if ((exit_code != 0)); then
    write_status failed "$exit_code"
  fi
  exit "$exit_code"
}
trap on_exit EXIT

latest_size="$(find "$GITLAB_RAID_BACKUP_DIR/repository" -maxdepth 1 -type f -name '*_gitlab_backup.tar' -printf '%s\n' | sort -nr | head -n 1)"
latest_size="${latest_size:-10737418240}"
free_bytes="$(df -B1 --output=avail "$GITLAB_RAID_BACKUP_DIR" | tail -n 1 | tr -d ' ')"
((free_bytes >= latest_size * 4 + 21474836480)) || {
  echo "[gitlab-backup] local backup space insufficient" >&2
  exit 2
}
: >"$generation_marker"
chmod 0600 "$generation_marker"
docker exec plush-gitlab gitlab-backup create STRATEGY=copy
repository_copy="$(find "$GITLAB_RAID_BACKUP_DIR/repository" -maxdepth 1 -type f -name '*_gitlab_backup.tar' -newer "$generation_marker" -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
[[ -n "$repository_copy" && -f "$repository_copy" && ! -L "$repository_copy" ]] || {
  echo "[gitlab-backup] backup command did not create a new repository archive" >&2
  exit 2
}
config_copy="$GITLAB_RAID_BACKUP_DIR/config/gitlab-config-$stamp.tar.gz"
local_checksum="$GITLAB_RAID_BACKUP_DIR/backup-$stamp.sha256"
test ! -e "$config_copy"
test ! -e "$local_checksum"
test ! -e "$export_temp"
test ! -e "$export_final"
chmod 0600 "$repository_copy"
mkdir -m 0700 "$config_temp"
cp -a "$GITLAB_CONFIG_DIR/." "$config_temp/"
control_compose="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' plush-gitlab)"
[[ "$control_compose" =~ ^/opt/plush-gitlab-control/[A-Za-z0-9._-]+/compose.yml$ ]]
control_env="$(dirname -- "$control_compose")/.env"
require_plain_file "$control_compose" "runtime compose"
require_plain_file "$control_env" "runtime environment"
mkdir -m 0700 "$config_temp/plush-control"
cp -- "$control_compose" "$config_temp/plush-control/compose.yml"
cp -- "$control_env" "$config_temp/plush-control/control.env"
runtime_image="$(docker inspect --format '{{.Config.Image}}' plush-gitlab)"
runtime_version="$(docker exec plush-gitlab cat /opt/gitlab/embedded/service/gitlab-rails/VERSION)"
[[ "$runtime_image" =~ ^gitlab/gitlab-ce@sha256:[0-9a-f]{64}$ && "$runtime_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
printf '{"schemaVersion":"plush.gitlab-backup-runtime/v1","image":"%s","version":"%s","hostname":"%s"}\n' \
  "$runtime_image" "$runtime_version" "$EXPECTED_GITLAB_HOSTNAME" >"$config_temp/plush-backup-runtime.json"
tar -C "$config_temp" -czf "$config_copy" .
find "$config_temp" -xdev -depth -delete
chmod 0600 "$config_copy"
repository_hash="$(sha256sum "$repository_copy" | awk '{print $1}')"
config_hash="$(sha256sum "$config_copy" | awk '{print $1}')"
repository_size="$(stat -c '%s' "$repository_copy")"
config_size="$(stat -c '%s' "$config_copy")"
printf '%s  %s\n%s  %s\n' \
  "$repository_hash" "$repository_copy" \
  "$config_hash" "$config_copy" >"$local_checksum"
chmod 0600 "$local_checksum"

mkdir -m 0700 "$export_temp"
printf '%s  repository.tar\n%s  config.tar.gz\n' \
  "$repository_hash" "$config_hash" >"$portable_checksum"
{
  printf 'schemaVersion=plush.gitlab-offsite-backup/v1\n'
  printf 'status=passed\n'
  printf 'backupId=%s\n' "$backup_id"
  printf 'completedAt=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'repositorySha256=%s\n' "$repository_hash"
  printf 'repositorySizeBytes=%s\n' "$repository_size"
  printf 'configSha256=%s\n' "$config_hash"
  printf 'configSizeBytes=%s\n' "$config_size"
} >"$portable_manifest"
age --recipient "$age_recipient" --output "$export_temp/repository.tar.age" "$repository_copy"
age --recipient "$age_recipient" --output "$export_temp/config.tar.gz.age" "$config_copy"
age --recipient "$age_recipient" --output "$export_temp/checksums.sha256.age" "$portable_checksum"
age --recipient "$age_recipient" --output "$export_temp/manifest.env.age" "$portable_manifest"
chmod 0600 "$export_temp/repository.tar.age" "$export_temp/config.tar.gz.age" "$export_temp/checksums.sha256.age" "$export_temp/manifest.env.age"
(
  cd "$export_temp"
  sha256sum repository.tar.age config.tar.gz.age checksums.sha256.age manifest.env.age >encrypted.sha256
  chmod 0600 encrypted.sha256
)
mv -- "$export_temp" "$export_final"
export_prepared=true
export_encrypted=true

find "$GITLAB_RAID_BACKUP_DIR/repository" -maxdepth 1 -type f -name '*_gitlab_backup.tar' -mtime "+$GITLAB_BACKUP_RETENTION_DAYS" -delete
find "$GITLAB_RAID_BACKUP_DIR/config" -maxdepth 1 -type f -name 'gitlab-config-*.tar.gz' -mtime "+$GITLAB_BACKUP_RETENTION_DAYS" -delete
find "$GITLAB_RAID_BACKUP_DIR" -maxdepth 1 -type f -name 'backup-*.sha256' -mtime "+$GITLAB_BACKUP_RETENTION_DAYS" -delete
while IFS= read -r -d '' expired_backup; do
  [[ "$(basename -- "$expired_backup")" =~ ^backup-[0-9]{8}T[0-9]{6}Z$ ]] || continue
  find "$expired_backup" -xdev -depth -delete
done < <(find "$GITLAB_BACKUP_EXPORT_DIR" -mindepth 1 -maxdepth 1 -type d -name 'backup-*' -mtime "+$GITLAB_BACKUP_RETENTION_DAYS" -print0)

rm -f -- "$portable_checksum" "$portable_manifest" "$generation_marker"
write_status passed 0
trap - EXIT
echo "[gitlab-backup] status=passed backupId=$backup_id repositorySizeBytes=$repository_size configSizeBytes=$config_size exportPrepared=true exportEncrypted=true offsiteCopied=false"
