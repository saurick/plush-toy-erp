#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
COMPOSE_FILE="$SCRIPT_DIR/compose.yml"
ENV_FILE="$SCRIPT_DIR/.env"
EXECUTE=false
CONFIRMATION=""

usage() {
  cat <<'USAGE'
用法:
  bash server/deploy/gitlab/install-r640.sh
  sudo bash server/deploy/gitlab/install-r640.sh --execute \
    --confirm INSTALL_GITLAB:R640:gitlab.saurick.me

默认只读预检。执行模式只创建 /srv/gitlab 精确目录并启动 plush-gitlab；
不会停止、删除、重建其他容器，也不会配置公网 FRP、DNS 或 GitHub 镜像。
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --execute) EXECUTE=true; shift ;;
    --confirm) CONFIRMATION="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[gitlab-install] unsupported argument: $1"; usage; exit 2 ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[gitlab-install] missing $ENV_FILE; copy .env.example and review exact paths"
  exit 2
fi
if [[ -L "$ENV_FILE" ]]; then
  echo "[gitlab-install] env file must be a regular non-symlink file"
  exit 2
fi

read_env_value() {
  local key="$1"
  local count value
  count="$(grep -Ec "^${key}=" "$ENV_FILE" || true)"
  if [[ "$count" != "1" ]]; then
    echo "[gitlab-install] env key must appear exactly once: $key" >&2
    return 2
  fi
  value="$(sed -n "s/^${key}=//p" "$ENV_FILE")"
  if [[ -z "$value" || ! "$value" =~ ^[A-Za-z0-9._:/-]+$ ]]; then
    echo "[gitlab-install] env value is invalid: $key" >&2
    return 2
  fi
  printf '%s' "$value"
}

GITLAB_HOSTNAME="$(read_env_value GITLAB_HOSTNAME)"
GITLAB_HTTP_PORT="$(read_env_value GITLAB_HTTP_PORT)"
GITLAB_SSH_BIND_ADDRESS="$(read_env_value GITLAB_SSH_BIND_ADDRESS)"
GITLAB_SSH_PUBLIC_PORT="$(read_env_value GITLAB_SSH_PUBLIC_PORT)"
GITLAB_CONFIG_DIR="$(read_env_value GITLAB_CONFIG_DIR)"
GITLAB_LOG_DIR="$(read_env_value GITLAB_LOG_DIR)"
GITLAB_DATA_DIR="$(read_env_value GITLAB_DATA_DIR)"
GITLAB_RAID_BACKUP_DIR="$(read_env_value GITLAB_RAID_BACKUP_DIR)"
GITLAB_BACKUP_KEEP_SECONDS="$(read_env_value GITLAB_BACKUP_KEEP_SECONDS)"
GITLAB_BACKUP_RETENTION_DAYS="$(read_env_value GITLAB_BACKUP_RETENTION_DAYS)"
GITLAB_MEMORY_LIMIT="$(read_env_value GITLAB_MEMORY_LIMIT)"

: "${GITLAB_HOSTNAME:?missing GITLAB_HOSTNAME}"
: "${GITLAB_HTTP_PORT:?missing GITLAB_HTTP_PORT}"
: "${GITLAB_SSH_BIND_ADDRESS:?missing GITLAB_SSH_BIND_ADDRESS}"
: "${GITLAB_SSH_PUBLIC_PORT:?missing GITLAB_SSH_PUBLIC_PORT}"
: "${GITLAB_CONFIG_DIR:?missing GITLAB_CONFIG_DIR}"
: "${GITLAB_LOG_DIR:?missing GITLAB_LOG_DIR}"
: "${GITLAB_DATA_DIR:?missing GITLAB_DATA_DIR}"
: "${GITLAB_RAID_BACKUP_DIR:?missing GITLAB_RAID_BACKUP_DIR}"

[[ "$GITLAB_HOSTNAME" == "gitlab.saurick.me" ]]
[[ "$GITLAB_CONFIG_DIR" == "/srv/gitlab/config" ]]
[[ "$GITLAB_LOG_DIR" == "/srv/gitlab/logs" ]]
[[ "$GITLAB_DATA_DIR" == "/srv/gitlab/data" ]]
[[ "$GITLAB_RAID_BACKUP_DIR" == "/srv/raid5/gitlab/backups" ]]
[[ "$GITLAB_HTTP_PORT" == "8929" ]]
[[ "$GITLAB_SSH_BIND_ADDRESS" == "192.168.0.133" ]]
[[ "$GITLAB_SSH_PUBLIC_PORT" == "2224" ]]
[[ "$GITLAB_BACKUP_KEEP_SECONDS" =~ ^[1-9][0-9]*$ ]]
[[ "$GITLAB_BACKUP_RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]]
[[ "$GITLAB_MEMORY_LIMIT" =~ ^[1-9][0-9]*G$ ]]

RUNTIME_ENV="$(mktemp)"
chmod 0600 "$RUNTIME_ENV"
trap 'rm -f "$RUNTIME_ENV"' EXIT
printf '%s\n' \
  "GITLAB_HOSTNAME=$GITLAB_HOSTNAME" \
  "GITLAB_HTTP_PORT=$GITLAB_HTTP_PORT" \
  "GITLAB_SSH_BIND_ADDRESS=$GITLAB_SSH_BIND_ADDRESS" \
  "GITLAB_SSH_PUBLIC_PORT=$GITLAB_SSH_PUBLIC_PORT" \
  "GITLAB_CONFIG_DIR=$GITLAB_CONFIG_DIR" \
  "GITLAB_LOG_DIR=$GITLAB_LOG_DIR" \
  "GITLAB_DATA_DIR=$GITLAB_DATA_DIR" \
  "GITLAB_RAID_BACKUP_DIR=$GITLAB_RAID_BACKUP_DIR" \
  "GITLAB_BACKUP_KEEP_SECONDS=$GITLAB_BACKUP_KEEP_SECONDS" \
  "GITLAB_BACKUP_RETENTION_DAYS=$GITLAB_BACKUP_RETENTION_DAYS" \
  "GITLAB_MEMORY_LIMIT=$GITLAB_MEMORY_LIMIT" \
  > "$RUNTIME_ENV"

command -v docker >/dev/null
docker compose version >/dev/null
docker info >/dev/null
findmnt --target /srv >/dev/null
findmnt --target /srv/raid5 >/dev/null

if docker inspect plush-gitlab >/dev/null 2>&1; then
  echo "[gitlab-install] existing plush-gitlab container detected; use the documented upgrade flow"
  exit 2
fi

for port in "$GITLAB_HTTP_PORT" "$GITLAB_SSH_PUBLIC_PORT"; do
  if ss -H -ltn "sport = :$port" | grep -q .; then
    echo "[gitlab-install] port already occupied: $port"
    exit 2
  fi
done

docker compose --env-file "$RUNTIME_ENV" --file "$COMPOSE_FILE" config --quiet
echo "[gitlab-install] preflight=passed host=$GITLAB_HOSTNAME http=127.0.0.1:$GITLAB_HTTP_PORT ssh=$GITLAB_SSH_BIND_ADDRESS:$GITLAB_SSH_PUBLIC_PORT"
echo "[gitlab-install] data=$GITLAB_DATA_DIR config=$GITLAB_CONFIG_DIR logs=$GITLAB_LOG_DIR raid_backup=$GITLAB_RAID_BACKUP_DIR"

if [[ "$EXECUTE" != "true" ]]; then
  echo "[gitlab-install] preview_only=true"
  exit 0
fi
if [[ "$EUID" -ne 0 ]]; then
  echo "[gitlab-install] --execute requires root"
  exit 2
fi
if [[ "$CONFIRMATION" != "INSTALL_GITLAB:R640:gitlab.saurick.me" ]]; then
  echo "[gitlab-install] exact confirmation mismatch"
  exit 2
fi

install -d -m 0700 "$GITLAB_CONFIG_DIR" "$GITLAB_DATA_DIR" "$GITLAB_RAID_BACKUP_DIR"
install -d -m 0750 "$GITLAB_LOG_DIR"
docker compose --env-file "$RUNTIME_ENV" --file "$COMPOSE_FILE" pull gitlab
docker compose --env-file "$RUNTIME_ENV" --file "$COMPOSE_FILE" up --detach --no-deps gitlab

for attempt in {1..60}; do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' plush-gitlab)"
  if [[ "$health" == "healthy" ]]; then
    echo "[gitlab-install] status=healthy attempt=$attempt"
    docker exec plush-gitlab gitlab-rake gitlab:check SANITIZE=true
    echo "[gitlab-install] initial password remains inside /etc/gitlab/initial_root_password; rotate it immediately without printing it to logs"
    exit 0
  fi
  if [[ "$health" == "unhealthy" ]]; then
    docker logs --tail 100 plush-gitlab >&2
    exit 1
  fi
  sleep 10
done

echo "[gitlab-install] health timeout"
docker logs --tail 100 plush-gitlab >&2
exit 1
