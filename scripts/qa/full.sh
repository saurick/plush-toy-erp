#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/qa/full.sh

作用:
  执行推送前全量质量检查（pre-push 默认调用）

检查内容:
  fast: 先执行 scripts/qa/fast.sh，包含高频边界、客户配置、导入、发布证据和 web/server 快速检查
  secrets / govulncheck: 推送前补充安全扫描（存在即跑）
  web: fast 已跑 lint/css，这里补充 (若存在 test 脚本则 pnpm test) -> pnpm build
  server: go test ./... -> make build

环境变量:
  SKIP_DB_GUARD=1      跳过 DB 迁移守卫
  SKIP_SECRETS_SCAN=1  跳过密钥扫描
  SKIP_GOVULNCHECK=1   跳过 Go 漏洞扫描
  SECRETS_STRICT=1     secrets 命中时阻断
  QA_BASE_RANGE=...    指定 diff 范围供 db-guard/secrets 使用
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  print_help
  exit 0
fi

if [[ $# -gt 0 ]]; then
  echo "[qa:full] 不支持的参数: $*"
  print_help
  exit 1
fi

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "[qa:full] 未找到 node，请先安装 Node.js"
  exit 1
fi

source "$ROOT_DIR/scripts/lib/pnpm.sh"
PNPM_BIN="$(resolve_project_pnpm "$ROOT_DIR")"

if ! command -v go >/dev/null 2>&1; then
  echo "[qa:full] 未找到 go，请先安装 Go"
  exit 1
fi

if [ -x "$ROOT_DIR/scripts/qa/fast.sh" ]; then
  echo "[qa:full] 先运行 fast 检查"
  bash "$ROOT_DIR/scripts/qa/fast.sh"
else
  echo "[qa:full] 缺少 scripts/qa/fast.sh，无法执行全量检查"
  exit 1
fi

if [ -x "$ROOT_DIR/scripts/qa/secrets.sh" ]; then
  bash "$ROOT_DIR/scripts/qa/secrets.sh"
fi

if [ -x "$ROOT_DIR/scripts/qa/govulncheck.sh" ]; then
  bash "$ROOT_DIR/scripts/qa/govulncheck.sh"
fi

echo "[qa:full] 运行 web 测试与构建"
(
  cd "$ROOT_DIR/web"
  # fast.sh 已执行 lint/css；full 在此补充前端测试和构建。
  if node -e "const fs=require('fs');const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));process.exit(pkg.scripts&&pkg.scripts.test?0:1)"; then
    "$PNPM_BIN" test
  else
    echo "[qa:full] web/package.json 未定义 test，跳过前端测试"
  fi

  "$PNPM_BIN" build
)

echo "[qa:full] 运行 server 全量检查"
(
  cd "$ROOT_DIR/server"
  go test ./...
  make build
)

echo "[qa:full] 全部通过"
