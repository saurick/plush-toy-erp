#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ENV_FILE="$SCRIPT_DIR/.env"
CHECKSUM_FILE="${1:-}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[gitlab-backup-verify] missing $ENV_FILE"
  exit 2
fi
if [[ -L "$ENV_FILE" ]]; then
  echo "[gitlab-backup-verify] env file must be a regular non-symlink file"
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
GITLAB_RAID_BACKUP_DIR="$(read_env_value GITLAB_RAID_BACKUP_DIR)"
: "${GITLAB_RAID_BACKUP_DIR:?missing GITLAB_RAID_BACKUP_DIR}"
[[ "$GITLAB_RAID_BACKUP_DIR" == "/srv/raid5/gitlab/backups" ]]

if [[ -z "$CHECKSUM_FILE" ]]; then
  CHECKSUM_FILE="$(find "$GITLAB_RAID_BACKUP_DIR" -maxdepth 1 -type f -name 'backup-*.sha256' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
fi
case "$CHECKSUM_FILE" in
  "$GITLAB_RAID_BACKUP_DIR"/backup-*.sha256) ;;
  *) echo "[gitlab-backup-verify] checksum must be inside $GITLAB_RAID_BACKUP_DIR"; exit 2 ;;
esac
test -f "$CHECKSUM_FILE"
test ! -L "$CHECKSUM_FILE"
awk -v root="$GITLAB_RAID_BACKUP_DIR" '
  $1 !~ /^[0-9a-f]{64}$/ { exit 1 }
  $2 !~ ("^" root "/(repository/[0-9A-Za-z._-]+_gitlab_backup[.]tar|config/gitlab-config-[0-9]{8}T[0-9]{6}Z[.]tar[.]gz)$") { exit 1 }
  END { if (NR != 2) exit 1 }
' "$CHECKSUM_FILE"
(cd / && sha256sum --check --strict "$CHECKSUM_FILE")

repository_archive="$(awk '$2 ~ /_gitlab_backup[.]tar$/ {print $2}' "$CHECKSUM_FILE")"
config_archive="$(awk '$2 ~ /gitlab-config-.*[.]tar[.]gz$/ {print $2}' "$CHECKSUM_FILE")"
test -f "$repository_archive"
test ! -L "$repository_archive"
test -f "$config_archive"
test ! -L "$config_archive"
tar -tf "$repository_archive" >/dev/null
tar -tzf "$config_archive" >/dev/null
docker exec plush-gitlab gitlab-rake gitlab:check SANITIZE=true
echo "[gitlab-backup-verify] status=passed checksum=$(basename "$CHECKSUM_FILE") boundary=archive_integrity_and_live_check"
echo "[gitlab-backup-verify] restore drill remains required in a disposable VM; this command never restores over the live instance"
