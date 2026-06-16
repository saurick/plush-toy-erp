#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/qa/fast.sh

作用:
  执行开发期高频快速检查

检查内容:
  error-code-sync: 前端生成错误码同步检查
  error-codes: 统一错误码魔法数字检查
  phase-label-boundaries: 活跃实现路径禁止使用编号 Phase 标签
  core-boundary: server/internal/core 纯领域规则边界检查
  industry-template-boundaries: 行业模板候选边界检查
  private-deployment-boundaries: 多客户私有化复制边界检查
  deployment-package-lint: 客户私有化部署资料包结构和敏感文件检查
  release-evidence-gate: yoyoosun 发布证据门禁工具测试
  customer-config-boundaries: 客户配置草案边界检查
  customer-import-tooling: 客户导入 dry-run / freeze / execution loader 测试
  trial-simulated-data: 试用模拟数据工具测试
  operational-fact-simulated-closure: 业务事实模拟闭环工具测试
  mobile-workflow-simulated-closure: 岗位任务端模拟闭环工具测试
  mvp-closure: ERP MVP 闭环验收工具测试
  industry-template-closure: 行业模板模拟闭环工具测试
  private-deployment-package-closure: 多客户私有化复制模拟闭环工具测试
  web: pnpm lint -> pnpm css
  server: go test ./internal/... ./pkg/...（存在即测）

环境变量:
  SKIP_DB_GUARD=1  跳过 DB 迁移守卫
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  print_help
  exit 0
fi

if [[ $# -gt 0 ]]; then
  echo "[qa:fast] 不支持的参数: $*"
  print_help
  exit 1
fi

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[qa:fast] 未找到 pnpm，请先安装 pnpm"
  exit 1
fi

if ! command -v go >/dev/null 2>&1; then
  echo "[qa:fast] 未找到 go，请先安装 Go"
  exit 1
fi

if [ -x "$ROOT_DIR/scripts/qa/db-guard.sh" ]; then
  bash "$ROOT_DIR/scripts/qa/db-guard.sh"
fi

if [ -x "$ROOT_DIR/scripts/qa/error-code-sync.sh" ]; then
  bash "$ROOT_DIR/scripts/qa/error-code-sync.sh"
fi

if [ -x "$ROOT_DIR/scripts/qa/error-codes.sh" ]; then
  # 先拦截错误码魔法数字，避免在明显违规代码上继续跑后续检查。
  echo "[qa:fast] 运行错误码魔法数字检查"
  bash "$ROOT_DIR/scripts/qa/error-codes.sh"
fi

if [ -f "$ROOT_DIR/scripts/qa/core-boundary.test.mjs" ]; then
  echo "[qa:fast] 运行 core 边界测试"
  node --test "$ROOT_DIR/scripts/qa/core-boundary.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/phase-label-boundaries.mjs" ]; then
  echo "[qa:fast] 运行活跃路径 Phase 标签边界检查"
  node "$ROOT_DIR/scripts/qa/phase-label-boundaries.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/industry-template-boundaries.mjs" ]; then
  echo "[qa:fast] 运行行业模板候选边界检查"
  node "$ROOT_DIR/scripts/qa/industry-template-boundaries.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/private-deployment-boundaries.mjs" ]; then
  echo "[qa:fast] 运行多客户私有化复制边界检查"
  node "$ROOT_DIR/scripts/qa/private-deployment-boundaries.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/deployment-package-lint.mjs" ]; then
  echo "[qa:fast] 运行客户私有化部署资料包检查"
  node "$ROOT_DIR/scripts/deploy/deployment-package-lint.mjs" --customer yoyoosun
fi

if [ -f "$ROOT_DIR/scripts/deploy/deployment-package-lint.test.mjs" ]; then
  echo "[qa:fast] 运行客户私有化部署资料包检查测试"
  node --test "$ROOT_DIR/scripts/deploy/deployment-package-lint.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/release-evidence-gate.test.mjs" ]; then
  echo "[qa:fast] 运行 yoyoosun 发布证据门禁测试"
  node --test "$ROOT_DIR/scripts/deploy/release-evidence-gate.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/customer-config-boundaries.mjs" ]; then
  echo "[qa:fast] 运行客户配置草案边界检查"
  node "$ROOT_DIR/scripts/qa/customer-config-boundaries.mjs"
fi

if ls "$ROOT_DIR"/scripts/import/*.test.mjs >/dev/null 2>&1; then
  echo "[qa:fast] 运行客户导入工具测试"
  for test_file in "$ROOT_DIR"/scripts/import/*.test.mjs; do
    node --test "$test_file"
  done
fi

if [ -f "$ROOT_DIR/scripts/qa/trial-simulated-data.test.mjs" ]; then
  echo "[qa:fast] 运行试用模拟数据工具测试"
  node --test "$ROOT_DIR/scripts/qa/trial-simulated-data.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/operational-fact-simulated-closure.test.mjs" ]; then
  echo "[qa:fast] 运行 业务事实模拟闭环工具测试"
  node --test "$ROOT_DIR/scripts/qa/operational-fact-simulated-closure.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/mobile-workflow-simulated-closure.test.mjs" ]; then
  echo "[qa:fast] 运行岗位任务端模拟闭环工具测试"
  node --test "$ROOT_DIR/scripts/qa/mobile-workflow-simulated-closure.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/mvp-closure.test.mjs" ]; then
  echo "[qa:fast] 运行 ERP MVP 闭环验收工具测试"
  node --test "$ROOT_DIR/scripts/qa/mvp-closure.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/industry-template-closure.test.mjs" ]; then
  echo "[qa:fast] 运行行业模板模拟闭环工具测试"
  node --test "$ROOT_DIR/scripts/qa/industry-template-closure.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/private-deployment-package-closure.test.mjs" ]; then
  echo "[qa:fast] 运行多客户私有化复制模拟闭环工具测试"
  node --test "$ROOT_DIR/scripts/qa/private-deployment-package-closure.test.mjs"
fi

echo "[qa:fast] 运行 web 快速检查"
(
  cd "$ROOT_DIR/web"
  pnpm lint
  pnpm css
)

echo "[qa:fast] 运行 server 快速检查"
(
  cd "$ROOT_DIR/server"
  pkgs=()
  if [ -d internal ]; then
    pkgs+=("./internal/...")
  fi
  if [ -d pkg ]; then
    pkgs+=("./pkg/...")
  fi

  if [ "${#pkgs[@]}" -gt 0 ]; then
    go test "${pkgs[@]}"
  else
    echo "[qa:fast] 未发现 internal/pkg，跳过 Go 测试"
  fi
)

echo "[qa:fast] 完成"
