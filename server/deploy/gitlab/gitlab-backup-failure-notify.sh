#!/usr/bin/env bash
set -euo pipefail
umask 077

unit=""
config=""
check_only=false
while [[ $# -gt 0 ]]; do
  case "$1" in
  --unit)
    unit="${2:-}"
    shift 2
    ;;
  --config)
    config="${2:-}"
    shift 2
    ;;
  --check)
    check_only=true
    shift
    ;;
  -h | --help)
    echo "usage: bash server/deploy/gitlab/gitlab-backup-failure-notify.sh --unit <systemd-unit> --config <root-owned-curl-config> [--check]"
    exit 0
    ;;
  *)
    echo "[gitlab-backup-alert] unsupported argument: $1" >&2
    exit 2
    ;;
  esac
done

[[ "$unit" =~ ^plush-gitlab-backup[.a-zA-Z0-9@_-]*[.]service$ ]] || {
  echo "[gitlab-backup-alert] unit identity is invalid" >&2
  exit 2
}
[[ "$config" == /* && -f "$config" && ! -L "$config" ]] || {
  echo "[gitlab-backup-alert] alert receiver config is missing" >&2
  exit 2
}
config_owner="$(stat -c '%u' "$config")"
config_mode="$(stat -c '%a' "$config")"
if ! [[ "$config_owner" == "$EUID" && "$config_mode" =~ ^[0-7]{3,4}$ ]] || ! (((8#$config_mode & 8#077) == 0)); then
  echo "[gitlab-backup-alert] alert receiver config must be root-owned and owner-only" >&2
  exit 2
fi
url_count="$(grep -Ec '^[[:space:]]*url[[:space:]]*=[[:space:]]*"https://[^"[:space:]]+"[[:space:]]*$' "$config" || true)"
if [[ "$url_count" != 1 ]] || grep -Fq 'replace-with-alert-receiver.invalid' "$config"; then
  echo "[gitlab-backup-alert] alert receiver must use HTTPS" >&2
  exit 2
fi
if [[ "$check_only" == true ]]; then
  echo "[gitlab-backup-alert] status=passed mode=check unit=$unit"
  exit 0
fi

hostname_value="$(hostname -s)"
occurred_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
[[ "$hostname_value" =~ ^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$ && "$occurred_at" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || {
  echo "[gitlab-backup-alert] event identity is invalid" >&2
  exit 2
}
payload="$(printf '{"schemaVersion":"plush.gitlab-backup-alert/v1","event":"backup_failed","unit":"%s","host":"%s","occurredAt":"%s"}\n' "$unit" "$hostname_value" "$occurred_at")"
if ! printf '%s\n' "$payload" | systemd-cat --identifier=plush-gitlab-backup --priority=err; then
  echo "[gitlab-backup-alert] journald write failed; continuing with HTTPS receiver" >&2
fi
printf '%s\n' "$payload" | curl \
  --config "$config" \
  --fail-with-body \
  --silent \
  --show-error \
  --max-time 15 \
  --retry 2 \
  --retry-all-errors \
  --header 'Content-Type: application/json' \
  --data-binary @- \
  >/dev/null
echo "[gitlab-backup-alert] status=sent unit=$unit"
