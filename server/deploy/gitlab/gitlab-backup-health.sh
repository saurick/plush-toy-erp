#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ENV_FILE="$SCRIPT_DIR/.env"

if [[ "${1:-}" == "--env-file" ]]; then
  ENV_FILE="${2:-}"
  shift 2
fi
[[ $# == 0 ]] || {
  echo "usage: bash server/deploy/gitlab/gitlab-backup-health.sh [--env-file <file>]" >&2
  exit 2
}
[[ "$ENV_FILE" == /* && -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || {
  echo "[gitlab-backup-health] env file is invalid" >&2
  exit 2
}

env_value() {
  local key="$1"
  local count value
  count="$(grep -Ec "^${key}=" "$ENV_FILE" || true)"
  [[ "$count" == 1 ]] || return 2
  value="$(sed -n "s/^${key}=//p" "$ENV_FILE")"
  [[ "$value" =~ ^[A-Za-z0-9._:/-]+$ ]] || return 2
  printf '%s' "$value"
}

backup_dir="$(env_value GITLAB_RAID_BACKUP_DIR)"
offsite_dir="$(env_value GITLAB_OFFSITE_BACKUP_DIR)"
max_age_hours="$(env_value GITLAB_BACKUP_MAX_AGE_HOURS)"
[[ "$backup_dir" == /* && "$backup_dir" != "/" && -d "$backup_dir" && ! -L "$backup_dir" && "$(realpath -e -- "$backup_dir")" == "$backup_dir" ]]
[[ "$offsite_dir" == /* && "$offsite_dir" != "/" && -d "$offsite_dir" && ! -L "$offsite_dir" && "$(realpath -e -- "$offsite_dir")" == "$offsite_dir" ]]
[[ "$max_age_hours" =~ ^[1-9][0-9]{0,3}$ ]]
status_file="$backup_dir/latest-status.env"
[[ -f "$status_file" && ! -L "$status_file" ]] || {
  echo "[gitlab-backup-health] latest status is missing" >&2
  exit 2
}

status_value() {
  local key="$1"
  local count value
  count="$(grep -Ec "^${key}=" "$status_file" || true)"
  [[ "$count" == 1 ]] || return 2
  value="$(sed -n "s/^${key}=//p" "$status_file")"
  [[ "$value" =~ ^[A-Za-z0-9._:/+-]+$ ]] || return 2
  printf '%s' "$value"
}

[[ "$(status_value schemaVersion)" == "plush.gitlab-backup-status/v1" ]]
[[ "$(status_value status)" == "passed" ]]
[[ "$(status_value offsiteCopied)" == "true" ]]
[[ "$(status_value offsiteEncrypted)" == "true" ]]
backup_id="$(status_value backupId)"
completed_at="$(status_value completedAt)"
[[ "$backup_id" =~ ^gitlab-([0-9]{8}T[0-9]{6}Z)$ ]]
stamp="${BASH_REMATCH[1]}"
completed_epoch="$(date -u -d "$completed_at" +%s)"
now_epoch="$(date -u +%s)"
age_seconds=$((now_epoch - completed_epoch))
((age_seconds >= 0 && age_seconds <= max_age_hours * 3600)) || {
  echo "[gitlab-backup-health] latest backup is stale" >&2
  exit 2
}
offsite_backup="$offsite_dir/backup-$stamp"
[[ -d "$offsite_backup" && ! -L "$offsite_backup" && -f "$offsite_backup/encrypted.sha256" && ! -L "$offsite_backup/encrypted.sha256" && -f "$offsite_backup/manifest.env.age" && ! -L "$offsite_backup/manifest.env.age" ]] || {
  echo "[gitlab-backup-health] matching offsite backup is missing" >&2
  exit 2
}
echo "[gitlab-backup-health] status=passed backupId=$backup_id backupAgeSeconds=$age_seconds offsiteCopied=true offsiteEncrypted=true"
