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
network=""
container_prefix=""
host_port=""
candidate_port=""

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
  --container-prefix)
    container_prefix="${2:-}"
    shift 2
    ;;
  --host-port)
    host_port="${2:-}"
    shift 2
    ;;
  --candidate-port)
    candidate_port="${2:-}"
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
    echo "用法: bash deployments/yoyoosun/scripts/cutover-public-web.sh --image <immutable-web-image> --release <40sha> --current-container <name|none> --endpoint <https-url> --api-origin http://app-server:8300 [--network <compose-network>] [--container-prefix <prefix>] [--host-port <port>] [--candidate-port <port>] [--execute --confirm PUBLIC_WEB_CUTOVER:<old|none>:<40sha>]"
    exit 0
    ;;
  *) fail "不支持的参数: $1" ;;
  esac
done

[[ "$release" =~ ^[0-9a-f]{40}$ ]] || fail "--release 必须是 40 位小写 Git SHA"
[[ -n "$image" && "$image" != *:latest && "$image" != *:dev ]] || fail "--image 必须是不可变 tag"
[[ "$current_container" == none || "$current_container" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]+$ ]] || fail "--current-container 不合法"
[[ "$endpoint" =~ ^https://[^/@[:space:]]+/?$ ]] || fail "--endpoint 必须是无凭据 HTTPS 根地址"
[[ "$api_origin" == "http://app-server:8300" ]] || fail "--api-origin 必须精确指向 Compose app-server"
[[ "$container_prefix" =~ ^[a-z0-9][a-z0-9_.-]*-$ ]] || fail "--container-prefix 不合法"
[[ "$host_port" =~ ^[0-9]+$ && "$host_port" -ge 1024 && "$host_port" -le 65535 ]] || fail "--host-port 不合法"
[[ "$candidate_port" =~ ^[0-9]+$ && "$candidate_port" -ge 1024 && "$candidate_port" -le 65535 && "$candidate_port" != "$host_port" ]] || fail "--candidate-port 不合法"
case "${endpoint%/}" in
https://demo.yoyoosun.net)
  [[ "$network" == "plush-toy-erp-demo-v1_default" &&
    "$container_prefix" == "plush-toy-erp-demo-web-public-" &&
    "$host_port" == 5176 && "$candidate_port" == 15176 ]] ||
    fail "demo 公网入口参数不符合登记合同"
  ;;
https://test.yoyoosun.net)
  [[ "$network" == "plush-toy-erp-test-v1_default" &&
    "$container_prefix" == "plush-toy-erp-test-web-public-" &&
    "$host_port" == 5177 && "$candidate_port" == 15177 ]] ||
    fail "test 公网入口参数不符合登记合同"
  ;;
*) fail "公网入口只允许已登记的 demo 或 test；admin 不是部署环境" ;;
esac
command -v docker >/dev/null 2>&1 || fail "缺少 docker"
command -v curl >/dev/null 2>&1 || fail "缺少 curl"
command -v python3 >/dev/null 2>&1 || fail "缺少 python3"

docker image inspect "$image" >/dev/null 2>&1 || fail "目标镜像不存在"
image_release="$(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$image" | awk -F= '$1 == "GIT_SHA" { value=$0; sub(/^[^=]*=/, "", value); count++ } END { if (count == 1) print value }')"
[[ "$image_release" == "$release" ]] || fail "目标镜像 GIT_SHA 与 release 不一致"
if [[ "$current_container" == none ]]; then
  existing_public_count="$({ docker ps -aq --format '{{.Names}}' | grep -E "^${container_prefix}" || true; } | wc -l | tr -d ' ')"
  [[ "$existing_public_count" == 0 ]] || fail "首次公网入口要求目标前缀容器完全不存在"
else
  docker inspect "$current_container" >/dev/null 2>&1 || fail "当前公网容器不存在"
fi
docker network inspect "$network" >/dev/null 2>&1 || fail "目标 Docker network 不存在"

short_release="${release:0:8}"
candidate="${container_prefix}candidate-$short_release"
next_container="${container_prefix}$short_release"
confirm_text="PUBLIC_WEB_CUTOVER:$current_container:$release"

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

assert_provider_capabilities() {
  local base_url="$1"
  curl -fsS \
    --max-time 10 \
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

container_release() {
  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$1" |
    awk -F= '$1 == "GIT_SHA" { value=$0; sub(/^[^=]*=/, "", value); count++ } END { if (count == 1) print value }'
}

echo "[cutover-public-web] plan current=$current_container next=$next_container image=$image network=$network endpoint=$endpoint api_origin=app-server:8300"
if [[ "$execute" -eq 0 ]]; then
  echo "[cutover-public-web] plan-only; execute confirmation: $confirm_text"
  exit 0
fi
[[ "$confirmation" == "$confirm_text" ]] || fail "确认词不匹配"

if [[ "$current_container" != none ]]; then
  current_release="$(container_release "$current_container")"
  [[ "$current_release" =~ ^[0-9a-f]{40}$ ]] || fail "当前公网容器没有可信 GIT_SHA"
  if [[ "$current_release" == "$release" ]]; then
    wait_http_health "http://127.0.0.1:$host_port/healthz" || fail "当前公网入口未健康"
    assert_provider_capabilities "$endpoint" || fail "当前公网入口未满足 provider 合同"
    echo "[cutover-public-web] passed current=$current_container rollback=$current_container release=$release provider=true reused=true"
    exit 0
  fi
fi

docker rm -f "$candidate" >/dev/null 2>&1 || true
if docker inspect "$next_container" >/dev/null 2>&1; then
  next_release="$(container_release "$next_container")"
  next_image="$(docker inspect --format '{{.Config.Image}}' "$next_container")"
  next_running="$(docker inspect --format '{{.State.Running}}' "$next_container")"
  [[ "$next_release" == "$release" && "$next_image" == "$image" ]] ||
    fail "既有目标公网容器身份不匹配"
  [[ "$next_running" == false ]] || fail "目标公网容器已在运行但不是当前入口"
  docker rm "$next_container" >/dev/null
fi

cleanup_candidate() {
  docker rm -f "$candidate" >/dev/null 2>&1 || true
}
trap cleanup_candidate EXIT

docker run -d \
  --name "$candidate" \
  --network "$network" \
  --memory 96m \
  --restart no \
  --label io.plush-toy-erp.public-entry=candidate \
  --label "io.plush-toy-erp.release=$release" \
  -e "API_ORIGIN=$api_origin" \
  -p "127.0.0.1:$candidate_port:5175" \
  "$image" >/dev/null

wait_http_health "http://127.0.0.1:$candidate_port/healthz" || fail "候选前端未健康"

assert_provider_capabilities "http://127.0.0.1:$candidate_port" || fail "候选前端 SMS 能力未匹配 provider 合同"
if [[ "$current_container" != none ]]; then
  docker update --restart=no "$current_container" >/dev/null
  docker stop "$current_container" >/dev/null
fi

rollback_old() {
  docker rm -f "$next_container" >/dev/null 2>&1 || true
  if [[ "$current_container" != none ]]; then
    docker update --restart=always "$current_container" >/dev/null 2>&1 || true
    docker start "$current_container" >/dev/null 2>&1 || true
  fi
}

if ! docker run -d \
  --name "$next_container" \
  --network "$network" \
  --memory 96m \
  --restart always \
  --label io.plush-toy-erp.public-entry=current \
  --label "io.plush-toy-erp.release=$release" \
  -e "API_ORIGIN=$api_origin" \
  -p "0.0.0.0:$host_port:5175" \
  "$image" >/dev/null; then
  rollback_old
  fail "新公网容器启动失败，已尝试恢复旧入口"
fi

if ! wait_http_health "http://127.0.0.1:$host_port/healthz" ||
  ! assert_provider_capabilities "$endpoint"; then
  rollback_old
  fail "公网切流后验证失败，已尝试恢复旧入口"
fi

echo "[cutover-public-web] passed current=$next_container rollback=$current_container release=$release provider=true reused=false"
