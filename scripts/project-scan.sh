#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/project-scan.sh [--strict]

作用:
  扫描当前仓库里仍需收口的占位值、默认配置、文案残留与非当前部署路径。

参数:
  --strict           命中“必须处理项”时返回非 0
  -h, --help         显示帮助

建议流程:
  1) 完成项目名 / 配置 / 部署方式 / 文档收口
  2) 执行: bash scripts/project-scan.sh
  3) 再执行: bash scripts/project-scan.sh --strict
USAGE
}

STRICT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
  --strict)
    STRICT=1
    ;;
  -h | --help)
    print_help
    exit 0
    ;;
  *)
    echo "[project-scan] 不支持的参数: $1" >&2
    print_help
    exit 1
    ;;
  esac
  shift
done

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

if command -v rg >/dev/null 2>&1; then
  SEARCH_CMD="rg"
else
  SEARCH_CMD="grep"
fi

REQUIRED_COUNT=0
ADVISORY_COUNT=0

scan_pattern() {
  local pattern="$1"
  shift

  if [[ $# -eq 0 ]]; then
    return 0
  fi

  if [[ "$SEARCH_CMD" == "rg" ]]; then
    rg -n --color never --hidden \
      --glob '!**/.git/**' \
      --glob '!**/node_modules/**' \
      --glob '!**/build/**' \
      --glob '!**/dist/**' \
      --glob '!**/coverage/**' \
      --glob '!**/bin/**' \
      -e "$pattern" "$@" 2>/dev/null || true
    return
  fi

  grep -R -n -E "$pattern" "$@" 2>/dev/null || true
}

print_hits() {
  local hits="$1"
  if [[ -z "$hits" ]]; then
    return
  fi

  local total
  total="$(printf '%s\n' "$hits" | awk 'NF{n++} END{print n+0}')"
  printf '%s\n' "$hits" | sed -n '1,12p' | sed 's/^/    - /'
  if [[ "$total" -gt 12 ]]; then
    echo "    ...（其余 $((total - 12)) 条省略）"
  fi
}

report_required() {
  local title="$1"
  local action="$2"
  local hits="$3"
  if [[ -z "$hits" ]]; then
    return
  fi

  REQUIRED_COUNT=$((REQUIRED_COUNT + 1))
  echo "[必须处理] $title"
  echo "  处理建议: $action"
  print_hits "$hits"
  echo
}

report_advisory() {
  local title="$1"
  local action="$2"
  local hits="$3"
  if [[ -z "$hits" ]]; then
    return
  fi

  ADVISORY_COUNT=$((ADVISORY_COUNT + 1))
  echo "[建议确认] $title"
  echo "  处理建议: $action"
  print_hits "$hits"
  echo
}

report_existing_paths() {
  local title="$1"
  local action="$2"
  shift 2
  local found=()
  local path
  for path in "$@"; do
    if [[ -e "$path" ]]; then
      found+=("$path")
    fi
  done

  if [[ "${#found[@]}" -eq 0 ]]; then
    return
  fi

  ADVISORY_COUNT=$((ADVISORY_COUNT + 1))
  echo "[建议确认] $title"
  echo "  处理建议: $action"
  for path in "${found[@]}"; do
    echo "    - $path"
  done
  echo
}

echo "[project-scan] 仓库根目录: $ROOT_DIR"
echo

IDENTITY_HITS="$(
  scan_pattern 'webapp-template|react-webapp-template|template-server|compose\.webapp-template|deploy_webapp_template|Project Workspace|Starter Workspace|new-task|your-project' \
    README.md \
    AGENTS.md \
    docs/README.md \
    docs/project-status.md \
    server/README.md \
    server/docs/k8s.md \
    web/package.json \
    web/index.html \
    web/public/index.html \
    web/.env.development \
    web/.env.production \
    web/src/App.jsx \
    web/src/pages/Home/index.jsx \
    server/cmd/server/main.go \
    server/Makefile \
    server/configs/dev/config.yaml \
    server/configs/prod/config.yaml \
    server/deploy
)"
report_required \
  "项目标识 / 服务名 / 页面标题仍保留占位值" \
  "统一替换项目名、服务名、镜像名、页面标题，以及 Compose 等配置里的占位符，避免默认值继续进入当前仓库。" \
  "$IDENTITY_HITS"

SECRET_HITS="$(
  scan_pattern 'adminadmin|YP\*H%k%a7xK1\*q|2@&0kq%qFafA4d|eB6Cc5Mz/OB/WrHyKJMQLnmj160ropjq3j167pkIGUI=|replace-me' \
    server/configs/dev/config.yaml \
    server/configs/prod/config.yaml \
    server/deploy \
    server/cmd/dbcheck/main.go \
    server/cmd/gen-password/main.go
)"
report_required \
  "默认密钥 / 管理员密码仍是示例值" \
  "替换 JWT 密钥、数据库密码、默认管理员密码、镜像仓库凭据与任何示例凭据；这些值不应直接进入交付项目。" \
  "$SECRET_HITS"

DEPLOY_HITS="$(
  scan_pattern '47\.84\.12\.211|registry\.xxxx|test_database_atlas|webapp-template-pro|registry\.example\.com|deploy\.example\.com|dashboard\.example\.local|otel-collector\.observability\.svc\.cluster\.local|prometheus:9090' \
    README.md \
    web/index.html \
    web/public/index.html \
    web/.env.production \
    server/configs/dev/config.yaml \
    server/configs/prod/config.yaml \
    server/deploy \
    server/docs/k8s.md
)"
report_required \
  "部署主机 / 网络地址 / 数据库名等仍是默认占位" \
  "按当前环境改掉远端主机、镜像仓库、观测地址、数据库名与 base path；不要把示例网络参数带到真实项目。" \
  "$DEPLOY_HITS"

DOC_HITS="$(
  scan_pattern '本模板|派生项目|模板默认|初始化后建议替换' \
    AGENTS.md \
    README.md \
    docs/README.md \
    docs/project-status.md \
    scripts/README.md \
    server/README.md \
    server/deploy/README.md \
    server/deploy/compose/prod/README.md \
    server/deploy/dashboard/README.md \
    server/docs/k8s.md \
    web/src/pages/Home/index.jsx
)"
report_required \
  "文档与首页仍保留旧占位措辞" \
  "把 README / AGENTS / 部署文档 / 首页占位文案改成当前项目事实，不要继续保留初始化阶段的旧措辞。" \
  "$DOC_HITS"

report_existing_paths \
  "仓库仍包含 K8s 相关部署物" \
  "若当前项目明确只走 docker compose，请按需移除 K8s 清单、dashboard 与相关文档；删除时默认移动到系统回收站。" \
  server/deploy/dev \
  server/deploy/prod \
  server/deploy/dashboard \
  server/docs/k8s.md

report_existing_paths \
  "仓库仍包含远端发布脚本" \
  "若当前项目只走 docker compose，请移除 deploy/publish 这类 SSH 发布脚本，避免第二套部署主路径残留。" \
  server/deploy/compose/prod/deploy_server.sh \
  server/deploy/compose/prod/publish_server.sh

ADMIN_MODULE_HITS="$(
  scan_pattern 'subscription|points\.|invite_code|AdminLevel|transfer_to_admin_id|UserPoints|Subscription|user_expiry_warning_days' \
    server/internal/biz/user_admin.go \
    server/internal/data/jsonrpc.go \
    server/internal/data/model/schema/invitecode.go \
    server/internal/data/model/schema/user.go \
    server/internal/data/model/schema/admin_user.go \
    server/internal/errcode/catalog.go
)"
report_advisory \
  "仓库重新引入了当前基线未保留的业务模块" \
  "积分 / 订阅 / 管理员层级 / 邀请码等能力目前不在当前项目主路径；若扫描再次命中，请确认这是本项目真实需求，而不是历史残留回流。" \
  "$ADMIN_MODULE_HITS"

echo "[project-scan] 建议执行顺序:"
echo "  1) 完成项目名 / 配置 / 部署方式 / 页面文案收口"
echo "  2) bash scripts/project-scan.sh"
echo "  3) bash scripts/bootstrap.sh"
echo "  4) bash scripts/doctor.sh"
echo "  5) bash scripts/project-scan.sh --strict"
echo "  6) bash scripts/qa/fast.sh"
echo "  7) bash scripts/qa/full.sh"
echo

if [[ "$STRICT" -eq 1 && "$REQUIRED_COUNT" -gt 0 ]]; then
  echo "[project-scan] 结果: 发现 $REQUIRED_COUNT 组必须处理项，strict 模式失败。" >&2
  exit 1
fi

if [[ "$REQUIRED_COUNT" -eq 0 && "$ADVISORY_COUNT" -eq 0 ]]; then
  echo "[project-scan] 结果: 未发现需要处理的占位残留。"
  exit 0
fi

echo "[project-scan] 结果: 必须处理项 $REQUIRED_COUNT 组，建议确认项 $ADVISORY_COUNT 组。"
