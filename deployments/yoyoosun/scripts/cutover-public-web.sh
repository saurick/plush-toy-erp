#!/usr/bin/env bash
set -euo pipefail
umask 077

image=""
release=""
current_container=""
endpoint=""
api_origin=""
execute=0
confirmation=""
network="plush-toy-erp-v5_default"

fail() {
  echo "[cutover-public-web] ERROR: $*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
  --image)
    image="${2:-}"
    shift 2
    ;;
  --release)
    release="${2:-}"
    shift 2
    ;;
  --current-container)
    current_container="${2:-}"
    shift 2
    ;;
  --endpoint)
    endpoint="${2:-}"
    shift 2
    ;;
  --api-origin)
    api_origin="${2:-}"
    shift 2
    ;;
  --network)
    network="${2:-}"
    shift 2
    ;;
  --execute)
    execute=1
    shift
    ;;
  --confirm)
    confirmation="${2:-}"
    shift 2
    ;;
  -h | --help)
    echo "用法: bash deployments/yoyoosun/scripts/cutover-public-web.sh --image <immutable-web-image> --release <40sha> --current-container <name> --endpoint <https-url> --api-origin http://app-server:8300 [--execute --confirm PUBLIC_WEB_CUTOVER:<old>:<40sha>]"
    exit 0
    ;;
  *) fail "不支持的参数: $1" ;;
  esac
done

[[ "$release" =~ ^[0-9a-f]{40}$ ]] || fail "--release 必须是 40 位小写 Git SHA"
[[ -n "$image" && "$image" != *:latest && "$image" != *:dev ]] || fail "--image 必须是不可变 tag"
[[ "$current_container" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]+$ ]] || fail "--current-container 不合法"
[[ "$endpoint" =~ ^https://[^/@[:space:]]+/?$ ]] || fail "--endpoint 必须是无凭据 HTTPS 根地址"
[[ "$api_origin" == "http://app-server:8300" ]] || fail "--api-origin 必须精确指向 V5 Compose app-server"
command -v docker >/dev/null 2>&1 || fail "缺少 docker"
command -v curl >/dev/null 2>&1 || fail "缺少 curl"
command -v python3 >/dev/null 2>&1 || fail "缺少 python3"

docker image inspect "$image" >/dev/null 2>&1 || fail "目标镜像不存在"
image_release="$(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$image" | awk -F= '$1 == "GIT_SHA" { value=$0; sub(/^[^=]*=/, "", value); count++ } END { if (count == 1) print value }')"
[[ "$image_release" == "$release" ]] || fail "目标镜像 GIT_SHA 与 release 不一致"
docker inspect "$current_container" >/dev/null 2>&1 || fail "当前公网容器不存在"
docker network inspect "$network" >/dev/null 2>&1 || fail "目标 Docker network 不存在"

short_release="${release:0:8}"
candidate="plush-toy-erp-web-public-candidate-$short_release"
next_container="plush-toy-erp-web-public-$short_release"
confirm_text="PUBLIC_WEB_CUTOVER:$current_container:$release"

echo "[cutover-public-web] plan current=$current_container next=$next_container image=$image network=$network endpoint=$endpoint api_origin=app-server:8300"
if [[ "$execute" -eq 0 ]]; then
  echo "[cutover-public-web] plan-only; execute confirmation: $confirm_text"
  exit 0
fi
[[ "$confirmation" == "$confirm_text" ]] || fail "确认词不匹配"
[[ -z "$(docker ps -aq --filter "name=^/${candidate}$")" ]] || fail "候选容器名已被占用: $candidate"
[[ -z "$(docker ps -aq --filter "name=^/${next_container}$")" ]] || fail "目标容器名已被占用: $next_container"

cleanup_candidate() {
  docker rm -f "$candidate" >/dev/null 2>&1 || true
}
trap cleanup_candidate EXIT

wait_http_health() {
  local url="$1"
  local http_code=""
  for _ in $(seq 1 30); do
    http_code="$(curl -fsS -o /dev/null -w '%{http_code}' "$url" || true)"
    [[ "$http_code" == "200" ]] && return 0
    sleep 1
  done
  return 1
}

docker run -d \
  --name "$candidate" \
  --network "$network" \
  --memory 96m \
  --restart no \
  -e "API_ORIGIN=$api_origin" \
  -p 127.0.0.1:15175:5175 \
  "$image" >/dev/null

wait_http_health "http://127.0.0.1:15175/healthz" || fail "候选前端未健康"

assert_provider_capabilities() {
  local base_url="$1"
  curl -kfsS \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":"public-cutover","method":"capabilities","params":{}}' \
    "${base_url%/}/rpc/auth" | python3 -c '
import json
import sys
payload = json.load(sys.stdin)
sms = payload.get("result", {}).get("data", {}).get("sms_login", {})
ok = payload.get("result", {}).get("code") == 0 and sms.get("enabled") is True and sms.get("mode") == "provider" and sms.get("mock_delivery") is False
raise SystemExit(0 if ok else 1)
'
}

assert_provider_capabilities "http://127.0.0.1:15175" || fail "候选前端 SMS 能力未匹配 provider 合同"
docker stop "$current_container" >/dev/null

rollback_old() {
  docker rm -f "$next_container" >/dev/null 2>&1 || true
  docker start "$current_container" >/dev/null 2>&1 || true
}

if ! docker run -d \
  --name "$next_container" \
  --network "$network" \
  --memory 96m \
  --restart always \
  -e "API_ORIGIN=$api_origin" \
  -p 0.0.0.0:5175:5175 \
  "$image" >/dev/null; then
  rollback_old
  fail "新公网容器启动失败，已尝试恢复旧入口"
fi

if ! wait_http_health "http://127.0.0.1:5175/healthz" ||
  ! assert_provider_capabilities "$endpoint"; then
  rollback_old
  fail "公网切流后验证失败，已尝试恢复旧入口"
fi

echo "[cutover-public-web] passed current=$next_container rollback=$current_container release=$release provider=true"
