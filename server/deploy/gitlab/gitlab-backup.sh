#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ENV_FILE="$SCRIPT_DIR/.env"
EXECUTE=false
CONFIRMATION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --execute) EXECUTE=true; shift ;;
    --confirm) CONFIRMATION="${2:-}"; shift 2 ;;
    -h|--help)
      echo "usage: sudo bash server/deploy/gitlab/gitlab-backup.sh --execute --confirm BACKUP_GITLAB:R640"
      exit 0
      ;;
    *) echo "[gitlab-backup] unsupported argument: $1"; exit 2 ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[gitlab-backup] missing $ENV_FILE"
  exit 2
fi
if [[ -L "$ENV_FILE" ]]; then
  echo "[gitlab-backup] env file must be a regular non-symlink file"
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
GITLAB_DATA_DIR="$(read_env_value GITLAB_DATA_DIR)"
GITLAB_CONFIG_DIR="$(read_env_value GITLAB_CONFIG_DIR)"
GITLAB_RAID_BACKUP_DIR="$(read_env_value GITLAB_RAID_BACKUP_DIR)"
GITLAB_BACKUP_RETENTION_DAYS="$(read_env_value GITLAB_BACKUP_RETENTION_DAYS)"
: "${GITLAB_DATA_DIR:?missing GITLAB_DATA_DIR}"
: "${GITLAB_CONFIG_DIR:?missing GITLAB_CONFIG_DIR}"
: "${GITLAB_RAID_BACKUP_DIR:?missing GITLAB_RAID_BACKUP_DIR}"
: "${GITLAB_BACKUP_RETENTION_DAYS:?missing GITLAB_BACKUP_RETENTION_DAYS}"
[[ "$GITLAB_DATA_DIR" == "/srv/gitlab/data" ]]
[[ "$GITLAB_CONFIG_DIR" == "/srv/gitlab/config" ]]
[[ "$GITLAB_RAID_BACKUP_DIR" == "/srv/raid5/gitlab/backups" ]]
[[ "$GITLAB_BACKUP_RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]]

docker inspect plush-gitlab >/dev/null
test "$(docker inspect --format '{{.State.Health.Status}}' plush-gitlab)" = healthy
findmnt --target "$GITLAB_RAID_BACKUP_DIR" >/dev/null
echo "[gitlab-backup] target=$GITLAB_RAID_BACKUP_DIR retention_days=$GITLAB_BACKUP_RETENTION_DAYS"

if [[ "$EXECUTE" != "true" ]]; then
  echo "[gitlab-backup] preview_only=true"
  exit 0
fi
if [[ "$EUID" -ne 0 || "$CONFIRMATION" != "BACKUP_GITLAB:R640" ]]; then
  echo "[gitlab-backup] root and exact confirmation are required"
  exit 2
fi

install -d -m 0700 "$GITLAB_RAID_BACKUP_DIR/repository" "$GITLAB_RAID_BACKUP_DIR/config"
docker exec plush-gitlab gitlab-backup create STRATEGY=copy
archive="$(find "$GITLAB_DATA_DIR/backups" -maxdepth 1 -type f -name '*_gitlab_backup.tar' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
test -n "$archive"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
repository_copy="$GITLAB_RAID_BACKUP_DIR/repository/$(basename "$archive")"
config_copy="$GITLAB_RAID_BACKUP_DIR/config/gitlab-config-$stamp.tar.gz"
test ! -e "$repository_copy"
test ! -e "$config_copy"
test ! -e "$GITLAB_RAID_BACKUP_DIR/backup-$stamp.sha256"
install -m 0600 "$archive" "$repository_copy"
tar -C "$GITLAB_CONFIG_DIR" -czf "$config_copy" .
chmod 0600 "$config_copy"
sha256sum "$repository_copy" "$config_copy" > "$GITLAB_RAID_BACKUP_DIR/backup-$stamp.sha256"
chmod 0600 "$GITLAB_RAID_BACKUP_DIR/backup-$stamp.sha256"

find "$GITLAB_RAID_BACKUP_DIR/repository" -maxdepth 1 -type f -name '*_gitlab_backup.tar' -mtime "+$GITLAB_BACKUP_RETENTION_DAYS" -delete
find "$GITLAB_RAID_BACKUP_DIR/config" -maxdepth 1 -type f -name 'gitlab-config-*.tar.gz' -mtime "+$GITLAB_BACKUP_RETENTION_DAYS" -delete
find "$GITLAB_RAID_BACKUP_DIR" -maxdepth 1 -type f -name 'backup-*.sha256' -mtime "+$GITLAB_BACKUP_RETENTION_DAYS" -delete
echo "[gitlab-backup] status=complete repository=$(basename "$repository_copy") config=$(basename "$config_copy") checksum=backup-$stamp.sha256"
