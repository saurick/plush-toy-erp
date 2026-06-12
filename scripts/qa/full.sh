#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/qa/full.sh

作用:
  执行推送前全量质量检查（pre-push 默认调用）

检查内容:
  error-code-sync: 前端生成错误码同步检查
  error-codes: 统一错误码魔法数字检查
  core-boundary: server/internal/core 纯领域规则边界检查
  industry-template-boundaries: Phase 10 行业模板候选边界检查
  private-deployment-boundaries: Phase 11 多客户私有化复制边界检查
  deployment-package-lint: 客户私有化部署资料包结构和敏感文件检查
  customer-config-boundaries: 客户配置草案边界检查
  customer-import-tooling: 客户导入 dry-run / freeze / execution loader 测试
  phase7-simulated-trial-data: Phase 7 模拟数据工具测试
  phase8-simulated-fact-closure: Phase 8 模拟事实闭环工具测试
  phase9-simulated-mobile-closure: Phase 9 模拟岗位任务闭环工具测试
  phase10-industry-template-closure: Phase 10 行业模板模拟闭环工具测试
  phase11-private-deployment-closure: Phase 11 多客户私有化复制模拟闭环工具测试
  web: pnpm lint -> pnpm css -> (若存在 test 脚本则 pnpm test) -> pnpm build
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

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[qa:full] 未找到 pnpm，请先安装 pnpm"
  exit 1
fi

if ! command -v go >/dev/null 2>&1; then
  echo "[qa:full] 未找到 go，请先安装 Go"
  exit 1
fi

if [ -x "$ROOT_DIR/scripts/qa/db-guard.sh" ]; then
  bash "$ROOT_DIR/scripts/qa/db-guard.sh"
fi

if [ -x "$ROOT_DIR/scripts/qa/error-code-sync.sh" ]; then
  bash "$ROOT_DIR/scripts/qa/error-code-sync.sh"
fi

if [ -x "$ROOT_DIR/scripts/qa/error-codes.sh" ]; then
  # 全量检查阶段先执行错误码守卫，避免问题扩散到发布前才暴露。
  echo "[qa:full] 运行错误码魔法数字检查"
  bash "$ROOT_DIR/scripts/qa/error-codes.sh"
fi

if [ -f "$ROOT_DIR/scripts/qa/core-boundary.test.mjs" ]; then
  echo "[qa:full] 运行 core 边界测试"
  node --test "$ROOT_DIR/scripts/qa/core-boundary.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/industry-template-boundaries.mjs" ]; then
  echo "[qa:full] 运行 Phase 10 行业模板候选边界检查"
  node "$ROOT_DIR/scripts/qa/industry-template-boundaries.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/private-deployment-boundaries.mjs" ]; then
  echo "[qa:full] 运行 Phase 11 多客户私有化复制边界检查"
  node "$ROOT_DIR/scripts/qa/private-deployment-boundaries.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/deployment-package-lint.mjs" ]; then
  echo "[qa:full] 运行客户私有化部署资料包检查"
  node "$ROOT_DIR/scripts/deploy/deployment-package-lint.mjs" --customer yoyoosun
fi

if [ -f "$ROOT_DIR/scripts/deploy/deployment-package-lint.test.mjs" ]; then
  echo "[qa:full] 运行客户私有化部署资料包检查测试"
  node --test "$ROOT_DIR/scripts/deploy/deployment-package-lint.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/customer-config-boundaries.mjs" ]; then
  echo "[qa:full] 运行客户配置草案边界检查"
  node "$ROOT_DIR/scripts/qa/customer-config-boundaries.mjs"
fi

if ls "$ROOT_DIR"/scripts/import/*.test.mjs >/dev/null 2>&1; then
  echo "[qa:full] 运行客户导入工具测试"
  for test_file in "$ROOT_DIR"/scripts/import/*.test.mjs; do
    node --test "$test_file"
  done
fi

if [ -f "$ROOT_DIR/scripts/qa/phase7-simulated-trial-data.test.mjs" ]; then
  echo "[qa:full] 运行 Phase 7 模拟数据工具测试"
  node --test "$ROOT_DIR/scripts/qa/phase7-simulated-trial-data.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/phase8-simulated-fact-closure.test.mjs" ]; then
  echo "[qa:full] 运行 Phase 8 模拟事实闭环工具测试"
  node --test "$ROOT_DIR/scripts/qa/phase8-simulated-fact-closure.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/phase9-simulated-mobile-closure.test.mjs" ]; then
  echo "[qa:full] 运行 Phase 9 模拟岗位任务闭环工具测试"
  node --test "$ROOT_DIR/scripts/qa/phase9-simulated-mobile-closure.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/phase10-industry-template-closure.test.mjs" ]; then
  echo "[qa:full] 运行 Phase 10 行业模板模拟闭环工具测试"
  node --test "$ROOT_DIR/scripts/qa/phase10-industry-template-closure.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/phase11-private-deployment-closure.test.mjs" ]; then
  echo "[qa:full] 运行 Phase 11 多客户私有化复制模拟闭环工具测试"
  node --test "$ROOT_DIR/scripts/qa/phase11-private-deployment-closure.test.mjs"
fi

if [ -x "$ROOT_DIR/scripts/qa/secrets.sh" ]; then
  bash "$ROOT_DIR/scripts/qa/secrets.sh"
fi

if [ -x "$ROOT_DIR/scripts/qa/govulncheck.sh" ]; then
  bash "$ROOT_DIR/scripts/qa/govulncheck.sh"
fi

echo "[qa:full] 运行 web 全量检查"
(
  cd "$ROOT_DIR/web"
  pnpm lint
  pnpm css

  # 兼容仓库差异：只有定义了 test 脚本才执行前端测试。
  if node -e "const fs=require('fs');const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));process.exit(pkg.scripts&&pkg.scripts.test?0:1)"; then
    pnpm test
  else
    echo "[qa:full] web/package.json 未定义 test，跳过前端测试"
  fi

  pnpm build
)

echo "[qa:full] 运行 server 全量检查"
(
  cd "$ROOT_DIR/server"
  go test ./...
  make build
)

echo "[qa:full] 全部通过"
