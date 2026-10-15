#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ENV_FILE="$SCRIPT_DIR/.env"
EXPECTED_CONTROL_HOSTNAME=r740xd
EXPECTED_GITLAB_HOSTNAME=gitlab.saurick.me
EXPECTED_CONFIRMATION="BACKUP_GITLAB:${EXPECTED_CONTROL_HOSTNAME}:${EXPECTED_GITLAB_HOSTNAME}"
OFFSITE_MARKER_VALUE=plush-gitlab-offsite-v1
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
GITLAB_OFFSITE_BACKUP_DIR="$(read_env_value GITLAB_OFFSITE_BACKUP_DIR)"
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

require_plain_directory "$GITLAB_OFFSITE_BACKUP_DIR" "offsite backup directory"
require_plain_file "$GITLAB_BACKUP_AGE_RECIPIENT_FILE" "age recipient file"
[[ ! -L /srv/raid5 && "$(findmnt -n -o TARGET --target /srv/raid5)" == "/srv/raid5" ]] || {
  echo "[gitlab-backup] RAID5 must be mounted" >&2
  exit 2
}
[[ "$(findmnt -n -o TARGET --target "$GITLAB_OFFSITE_BACKUP_DIR")" == "$GITLAB_OFFSITE_BACKUP_DIR" ]] || {
  echo "[gitlab-backup] offsite backup directory must be an exact mount point" >&2
  exit 2
}
[[ "$(stat -c '%d' /srv/raid5)" != "$(stat -c '%d' "$GITLAB_OFFSITE_BACKUP_DIR")" ]] || {
  echo "[gitlab-backup] offsite backup must use a different filesystem" >&2
  exit 2
}
offsite_marker="$GITLAB_OFFSITE_BACKUP_DIR/.plush-gitlab-offsite-target"
require_plain_file "$offsite_marker" "offsite marker"
[[ "$(<"$offsite_marker")" == "$OFFSITE_MARKER_VALUE" ]] || {
  echo "[gitlab-backup] offsite marker is invalid" >&2
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
echo "[gitlab-backup] local_target=$GITLAB_RAID_BACKUP_DIR offsite_target=$GITLAB_OFFSITE_BACKUP_DIR retention_days=$GITLAB_BACKUP_RETENTION_DAYS"

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
offsite_temp="$GITLAB_OFFSITE_BACKUP_DIR/.backup-$stamp.tmp.$$"
offsite_final="$GITLAB_OFFSITE_BACKUP_DIR/backup-$stamp"
portable_checksum="$GITLAB_RAID_BACKUP_DIR/.offsite-$stamp.sha256.tmp.$$"
portable_manifest="$GITLAB_RAID_BACKUP_DIR/.offsite-$stamp.manifest.tmp.$$"
generation_marker="$GITLAB_RAID_BACKUP_DIR/.backup-start-$stamp.tmp.$$"
repository_hash=unavailable
config_hash=unavailable
repository_size=0
config_size=0
offsite_copied=false
offsite_encrypted=false

remove_temporary_paths() {
  rm -f -- "$portable_checksum" "$portable_manifest" "$generation_marker"
  if [[ -d "$offsite_temp" && ! -L "$offsite_temp" && "$(dirname -- "$offsite_temp")" == "$GITLAB_OFFSITE_BACKUP_DIR" ]]; then
    find "$offsite_temp" -xdev -depth -delete
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
    printf 'offsiteCopied=%s\n' "$offsite_copied"
    printf 'offsiteEncrypted=%s\n' "$offsite_encrypted"
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
test ! -e "$offsite_temp"
test ! -e "$offsite_final"
chmod 0600 "$repository_copy"
tar -C "$GITLAB_CONFIG_DIR" -czf "$config_copy" .
chmod 0600 "$config_copy"
repository_hash="$(sha256sum "$repository_copy" | awk '{print $1}')"
config_hash="$(sha256sum "$config_copy" | awk '{print $1}')"
repository_size="$(stat -c '%s' "$repository_copy")"
config_size="$(stat -c '%s' "$config_copy")"
printf '%s  %s\n%s  %s\n' \
  "$repository_hash" "$repository_copy" \
  "$config_hash" "$config_copy" >"$local_checksum"
chmod 0600 "$local_checksum"

mkdir -m 0700 "$offsite_temp"
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
age --recipient "$age_recipient" --output "$offsite_temp/repository.tar.age" "$repository_copy"
age --recipient "$age_recipient" --output "$offsite_temp/config.tar.gz.age" "$config_copy"
age --recipient "$age_recipient" --output "$offsite_temp/checksums.sha256.age" "$portable_checksum"
age --recipient "$age_recipient" --output "$offsite_temp/manifest.env.age" "$portable_manifest"
chmod 0600 "$offsite_temp/repository.tar.age" "$offsite_temp/config.tar.gz.age" "$offsite_temp/checksums.sha256.age" "$offsite_temp/manifest.env.age"
(
  cd "$offsite_temp"
  sha256sum repository.tar.age config.tar.gz.age checksums.sha256.age manifest.env.age >encrypted.sha256
  chmod 0600 encrypted.sha256
)
mv -- "$offsite_temp" "$offsite_final"
offsite_copied=true
offsite_encrypted=true

find "$GITLAB_RAID_BACKUP_DIR/repository" -maxdepth 1 -type f -name '*_gitlab_backup.tar' -mtime "+$GITLAB_BACKUP_RETENTION_DAYS" -delete
find "$GITLAB_RAID_BACKUP_DIR/config" -maxdepth 1 -type f -name 'gitlab-config-*.tar.gz' -mtime "+$GITLAB_BACKUP_RETENTION_DAYS" -delete
find "$GITLAB_RAID_BACKUP_DIR" -maxdepth 1 -type f -name 'backup-*.sha256' -mtime "+$GITLAB_BACKUP_RETENTION_DAYS" -delete
while IFS= read -r -d '' expired_backup; do
  [[ "$(basename -- "$expired_backup")" =~ ^backup-[0-9]{8}T[0-9]{6}Z$ ]] || continue
  find "$expired_backup" -xdev -depth -delete
done < <(find "$GITLAB_OFFSITE_BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name 'backup-*' -mtime "+$GITLAB_BACKUP_RETENTION_DAYS" -print0)

rm -f -- "$portable_checksum" "$portable_manifest" "$generation_marker"
write_status passed 0
trap - EXIT
echo "[gitlab-backup] status=passed backupId=$backup_id repositorySizeBytes=$repository_size configSizeBytes=$config_size offsiteCopied=true offsiteEncrypted=true"
