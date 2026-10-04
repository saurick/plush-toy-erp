#!/usr/bin/env bash
set -euo pipefail

http_ready() {
  local probe_host="$1" probe_port="$2" probe_path="$3" status_line
  exec 3<>"/dev/tcp/$probe_host/$probe_port"
  printf 'GET %s HTTP/1.0\r\nHost: %s\r\nConnection: close\r\n\r\n' "$probe_path" "$probe_host" >&3
  IFS= read -r -t 2 status_line <&3
  exec 3>&-
  [[ "$status_line" == *' 200 '* ]]
}

# Component health and both downstream services are checked independently of
# log traffic. Quiet business periods must never masquerade as collector loss.
http_ready 127.0.0.1 "${ALLOY_HEALTH_PORT:-12345}" /-/ready
http_ready 127.0.0.1 "${ALLOY_HEALTH_PORT:-12345}" /-/healthy
http_ready "${LOKI_HEALTH_HOST:-loki}" "${LOKI_HEALTH_PORT:-3100}" /ready
http_ready "${DOCKER_API_HEALTH_HOST:-docker-api}" "${DOCKER_API_HEALTH_PORT:-2375}" /_ping
