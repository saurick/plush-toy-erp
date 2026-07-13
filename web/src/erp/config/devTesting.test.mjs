import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  DEV_TESTING_COPY_PRESETS,
  DEV_TESTING_CURRENT_DOC_PATHS,
  DEV_TESTING_ROUTE,
  DEV_TESTING_STRATEGY_SOURCE_PATH,
  buildDevTestingCopyText,
  buildDevTestingDocs,
  buildDevTestingSummary,
  extractDevTestingCommandBlocks,
  filterDevTestingDocs,
  getDevTestingCategoryOptions,
  isDevTestingEnabled,
  parseDevTestingStrategyTiers,
  resolveDevTestingSelectedDoc,
} from './devTesting.mjs'

const strategyMarkdown = `
# 自动化测试策略 / Test Strategy

## 3. 测试分层

| 层级 | 改动类型 | 必跑或优先命令 | 说明 |
| --- | --- | --- | --- |
| T0 静态检查 | 所有改动 | \`git status --short\`；\`git diff --check\` | 确认工作区和空白错误 |
| T5 Frontend UI / 样式 | 页面、路由、API client、菜单、seed、表单、样式 | \`cd web && pnpm lint\`；\`cd web && pnpm css\`；\`cd web && pnpm test\`；\`cd web && pnpm style:l1\` | 必须做浏览器级默认态、交互态、恢复态和相邻区域回归 |
| T7 业务事实 / E2E | 库存、采购、质检、未来出货、财务、生产、委外真实事实 | 当前已有事实层按 T3 + Phase PG target；完整 E2E 后续再设计 | 不存在稳定 runner 时，不得把手工点按或未来命令写成已自动化 |

## 6. 现有命令入口

\`\`\`bash
bash scripts/qa/fast.sh
\`\`\`

\`\`\`bash
cd web
pnpm lint
pnpm css
pnpm test
pnpm style:l1
\`\`\`
`

const currentStrategyMarkdown = `
# 自动化测试策略 / Test Strategy

## 验证层级 T0-T8

| 层级 | 适用改动 | 最小验证 |
| --- | --- | --- |
| T0 现场与静态 | 所有改动 | \`git status --short\`、\`git diff --check\` |
| T5 Frontend/UI | 页面、路由、样式 | \`cd web && pnpm lint\`、\`cd web && pnpm style:l1\` |
| T7 Business Integration/E2E | 库存、出货、Workflow/Fact | \`bash scripts/qa/full.sh\` |
`

const deliveryEvidenceMarkdown = `
# 岗位任务端目标环境发布证据 / Mobile Workflow Target Release Evidence

本记录包含 smoke、RBAC 和内部模拟 workflow 闭环验收。

\`\`\`bash
TRIAL_BROWSER_SMOKE_BASE_URL=http://127.0.0.1:5175 pnpm --dir web smoke:trial-demo-browser
\`\`\`
`

const scriptsReadmeMarkdown = `
# QA 脚本说明

## 推荐顺序

\`\`\`bash
node scripts/import/customerSourceExtract.mjs \\
  --manifest docs/customers/yoyoosun/source-manifest.json \\
  --out output/customers/yoyoosun/source-extract
\`\`\`

\`\`\`text
source-snapshot.extracted.json
existing-v1.empty-preview.json
\`\`\`
`

const webScriptsReadmeMarkdown = `
# web 脚本说明

## yoyoosun 本地入口

\`\`\`bash
pnpm --dir web start:yoyoosun -- --print-plan
pnpm --dir web preview:yoyoosun -- --print-plan
\`\`\`

输出会包含 verify customer config 和 verify customer asset。
`

const unrelatedMarkdown = `
# 普通说明

这里只是普通说明。
`

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const testingPageSource = readFileSync(
  join(repoRoot, 'web/src/erp/pages/DevTestingPage.jsx'),
  'utf8'
)

function extractLocalCommandFilePaths(commands = []) {
  const paths = []
  for (const command of commands) {
    const matches = String(command).matchAll(
      /(?:^|\s)(\/Users\/simon\/projects\/plush-toy-erp\/)?((?:web|scripts|server|deployments)\/[\w./-]+\.(?:mjs|js|sh))(?:\s|$)/g
    )
    for (const match of matches) {
      paths.push(match[2])
    }
  }
  return paths
}

test('devTesting: 只通过开发态独立路径暴露', () => {
  assert.equal(DEV_TESTING_ROUTE, '/__dev/testing')
  assert.equal(
    DEV_TESTING_STRATEGY_SOURCE_PATH,
    'docs/product/自动化测试策略.md'
  )
  assert.deepEqual(DEV_TESTING_CURRENT_DOC_PATHS, [
    'docs/product/自动化测试策略.md',
    'README.md',
    'web/README.md',
    'web/scripts/README.md',
    'server/README.md',
    'scripts/README.md',
    'docs/部署约定.md',
    'server/deploy/README.md',
    'server/deploy/compose/prod/README.md',
  ])
  assert.equal(isDevTestingEnabled({ DEV: true }), true)
  assert.equal(isDevTestingEnabled({ DEV: false }), false)
  assert(!DEV_TESTING_ROUTE.startsWith('/erp/'))
})

test('devTesting: 解析测试策略分层表和命令', () => {
  const tiers = parseDevTestingStrategyTiers(strategyMarkdown)

  assert.equal(tiers.length, 3)
  assert.equal(tiers[0].key, 'T0')
  assert.deepEqual(tiers[0].commands, [
    'git status --short',
    'git diff --check',
  ])
  assert.equal(tiers[0].copyText, 'git status --short\ngit diff --check')
  assert.equal(tiers[1].key, 'T5')
  assert(tiers[1].commands.includes('cd web && pnpm style:l1'))
  assert.match(tiers[1].description, /浏览器级/)
  assert.equal(tiers[2].key, 'T7')
  assert.equal(tiers[2].commands.length, 0)
  assert.match(tiers[2].copyText, /当前没有完整业务 E2E runner/)
})

test('devTesting: 兼容当前自动化测试策略的验证层级标题', () => {
  const tiers = parseDevTestingStrategyTiers(currentStrategyMarkdown)

  assert.equal(tiers.length, 3)
  assert.equal(tiers[1].key, 'T5')
  assert.equal(tiers[1].level, 'T5 Frontend/UI')
  assert.equal(tiers[1].changeType, '页面、路由、样式')
  assert(tiers[1].commands.includes('cd web && pnpm style:l1'))
})

test('devTesting: 为常用预设和分层复制生成命令文本', () => {
  assert.deepEqual(
    DEV_TESTING_COPY_PRESETS.map((preset) => preset.key),
    [
      'frontend',
      'workflow-backend-actions',
      'trial-role-entries',
      'frontend-role-menu-seed-contracts',
      'trial-account-rbac',
      'real-login-smoke-shared',
      'trial-simulated-data',
      'mvp-local-closure',
      'mobile-workflow-smoke',
      'customer-config-dev-console',
      'dev-prototype-registry',
      'dev-doc-governance-ledger',
      'customer-config-package-runtime',
      'customer-import-tooling',
      'frontend-customer-config-projection',
      'frontend-error-messages',
      'business-action-field-boundaries',
      'pre-commit',
      'release',
    ]
  )
  const presetsByKey = new Map(
    DEV_TESTING_COPY_PRESETS.map((preset) => [preset.key, preset])
  )
  const getPreset = (key) => {
    const preset = presetsByKey.get(key)
    assert(preset, `missing preset: ${key}`)
    return preset
  }
  const getPresetCopyText = (key) =>
    buildDevTestingCopyText(getPreset(key).commands)

  assert.match(getPresetCopyText('frontend'), /pnpm style:l1/)
  assert.match(
    getPresetCopyText('workflow-backend-actions'),
    /TestWorkflowRepo_/
  )
  assert.match(
    getPreset('workflow-backend-actions').description,
    /只证明本地后端合同/
  )
  assert.match(getPresetCopyText('trial-role-entries'), /trial-role-entry-docs/)
  assert.match(
    getPresetCopyText('frontend-role-menu-seed-contracts'),
    /entryConfig\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('frontend-role-menu-seed-contracts'),
    /menuPermissions\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('frontend-role-menu-seed-contracts'),
    /seedData\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('frontend-role-menu-seed-contracts'),
    /workflowStatus\.test\.mjs/
  )
  assert.match(
    getPreset('frontend-role-menu-seed-contracts').description,
    /不替代后端 RBAC/
  )
  assert.match(
    getPreset('frontend-role-menu-seed-contracts').description,
    /不替代.*真实登录/
  )
  assert.match(
    getPresetCopyText('trial-account-rbac'),
    /trial-account-rbac\.mjs/
  )
  assert.match(
    getPresetCopyText('trial-account-rbac'),
    /trial-account-rbac\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('trial-account-rbac'),
    /trialDemoAccountBrowserSmoke\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('trial-account-rbac'),
    /--print-input-template/
  )
  assert.match(
    getPresetCopyText('trial-account-rbac'),
    /trial-account-rbac\.mjs --preflight-report output\/trial-account-rbac\/preflight\.json/
  )
  assert.match(
    getPresetCopyText('trial-account-rbac'),
    /trialDemoAccountBrowserSmoke\.mjs --print-input-template/
  )
  assert.match(
    getPresetCopyText('trial-account-rbac'),
    /trialDemoAccountBrowserSmoke\.mjs --preflight-report output\/trial-demo-account-browser-smoke\/preflight\.json/
  )
  assert.match(
    getPresetCopyText('trial-account-rbac'),
    /TRIAL_ACCOUNT_PASSWORD/
  )
  assert.match(
    getPresetCopyText('trial-account-rbac'),
    /--report output\/trial-account-rbac\/report\.json/
  )
  assert.match(
    getPresetCopyText('trial-account-rbac'),
    /smoke:trial-demo-browser/
  )
  assert.match(
    getPresetCopyText('trial-account-rbac'),
    /trialDemoAccountBrowserSmoke\.mjs --report output\/trial-demo-account-browser-smoke\/report\.json/
  )
  assert.match(getPreset('trial-account-rbac').description, /无写入输入模板/)
  assert.match(getPreset('trial-account-rbac').description, /脱敏投影诊断/)
  assert.match(
    getPreset('trial-account-rbac').description,
    /本地后端和演示账号密码/
  )
  assert.match(
    getPresetCopyText('real-login-smoke-shared'),
    /realLoginSmokeShared\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('real-login-smoke-shared'),
    /mobileAuthLoginRouteSmoke\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('real-login-smoke-shared'),
    /purchaseReceiptRealWriteBrowserE2E\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('real-login-smoke-shared'),
    /realLoginSmokeShared\.mjs --print-input-template/
  )
  assert.match(
    getPresetCopyText('real-login-smoke-shared'),
    /realLoginSmokeShared\.mjs --preflight-report output\/real-login-smoke-shared\/preflight\.json/
  )
  assert.match(
    getPresetCopyText('real-login-smoke-shared'),
    /mobileAuthLoginRouteSmoke\.mjs --print-input-template/
  )
  assert.match(
    getPresetCopyText('real-login-smoke-shared'),
    /mobileAuthLoginRouteSmoke\.mjs --preflight-report output\/mobile-auth-login-route-smoke\/preflight\.json/
  )
  assert.match(
    getPresetCopyText('real-login-smoke-shared'),
    /purchaseReceiptRealWriteBrowserE2E\.mjs --print-input-template/
  )
  assert.match(
    getPresetCopyText('real-login-smoke-shared'),
    /purchaseReceiptRealWriteBrowserE2E\.mjs --preflight-report output\/purchase-receipt-real-write-browser-e2e\/preflight\.json/
  )
  assert.match(
    getPresetCopyText('real-login-smoke-shared'),
    /REAL_LOGIN_ADMIN_USERNAME/
  )
  assert.match(
    getPresetCopyText('real-login-smoke-shared'),
    /smoke:purchase-contract-real-login/
  )
  assert.match(
    getPresetCopyText('real-login-smoke-shared'),
    /smoke:processing-contract-real-login/
  )
  assert.match(
    getPresetCopyText('real-login-smoke-shared'),
    /smoke:mobile-auth-login-route/
  )
  assert.match(
    getPresetCopyText('real-login-smoke-shared'),
    /smoke:purchase-receipt-real-write/
  )
  assert.match(
    getPreset('real-login-smoke-shared').description,
    /no-write 输入模板/
  )
  assert.match(getPreset('real-login-smoke-shared').description, /preflight/)
  assert.match(getPreset('real-login-smoke-shared').description, /前置清单/)
  assert.match(
    getPreset('real-login-smoke-shared').description,
    /持久测试数据确认/
  )
  assert.match(getPreset('real-login-smoke-shared').description, /mock RPC/)
  assert.match(
    getPreset('real-login-smoke-shared').description,
    /生产单端口岗位路由/
  )
  assert.match(
    getPreset('real-login-smoke-shared').description,
    /不执行真实登录/
  )
  assert.match(getPreset('real-login-smoke-shared').description, /不启动浏览器/)
  assert.match(
    getPresetCopyText('trial-simulated-data'),
    /trial-simulated-data\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('trial-simulated-data'),
    /operational-fact-simulated-closure\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('trial-simulated-data'),
    /mobile-workflow-simulated-closure\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('trial-simulated-data'),
    /trial-simulated-data\.mjs --print-input-template/
  )
  assert.match(
    getPresetCopyText('trial-simulated-data'),
    /operational-fact-simulated-closure\.mjs --print-input-template/
  )
  assert.match(
    getPresetCopyText('trial-simulated-data'),
    /mobile-workflow-simulated-closure\.mjs --print-input-template/
  )
  assert.match(
    getPresetCopyText('trial-simulated-data'),
    /trial-simulated-data-dev-testing-report/
  )
  assert.match(
    getPresetCopyText('trial-simulated-data'),
    /mobile-workflow-simulated-closure-dev-testing-report/
  )
  assert.match(
    getPresetCopyText('trial-simulated-data'),
    /operational-fact-simulated-closure-dev-testing-report/
  )
  assert.match(
    getPresetCopyText('trial-simulated-data'),
    /--product-id <product_id>/
  )
  assert.match(
    getPreset('trial-simulated-data').description,
    /no-write 输入模板/
  )
  assert.match(
    getPreset('trial-simulated-data').description,
    /simulated-only \/ no real import/
  )
  assert.match(getPreset('trial-simulated-data').description, /退回和催办/)
  assert.match(getPreset('trial-simulated-data').description, /不连接后端/)
  assert.match(getPresetCopyText('mvp-local-closure'), /mvp-closure\.test\.mjs/)
  assert.match(
    getPresetCopyText('mvp-local-closure'),
    /purchase-receipt-real-write-e2e\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('mvp-local-closure'),
    /purchase-receipt-real-write-e2e\.mjs --print-input-template/
  )
  assert.match(
    getPresetCopyText('mvp-local-closure'),
    /purchase-receipt-real-write-e2e\.mjs --preflight-report output\/qa\/purchase-receipt-real-write-e2e\/preflight\.json/
  )
  assert.match(
    getPresetCopyText('mvp-local-closure'),
    /mvp-closure\.mjs --out output\/customers\/yoyoosun\/mvp-closure/
  )
  assert.match(
    getPresetCopyText('mvp-local-closure'),
    /--run-report-tools --product-id <product_id>/
  )
  assert.match(getPreset('mvp-local-closure').description, /真实写入输入模板/)
  assert.match(
    getPreset('mvp-local-closure').description,
    /plan-only \/ no-write evidence/
  )
  assert.match(
    getPresetCopyText('mobile-workflow-smoke'),
    /mobile-workflow-runtime-browser-smoke/
  )
  assert.match(
    getPresetCopyText('mobile-workflow-smoke'),
    /mobileRoleTaskModel\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('mobile-workflow-smoke'),
    /workflowTaskBoard\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('mobile-workflow-smoke'),
    /mobileWorkflowRuntimeBrowserSmoke\.mjs --print-input-template/
  )
  assert.match(
    getPresetCopyText('mobile-workflow-smoke'),
    /mobileWorkflowRuntimeBrowserSmoke\.mjs --preflight-report output\/mobile-workflow-runtime-browser-smoke\/preflight\.json/
  )
  assert.match(getPreset('mobile-workflow-smoke').description, /无写入输入模板/)
  assert.match(
    getPreset('mobile-workflow-smoke').description,
    /需本地后端和演示账号密码/
  )
  assert.match(
    getPresetCopyText('customer-config-dev-console'),
    /devCustomerConfig\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('customer-config-dev-console'),
    /printTemplates\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('customer-config-dev-console'),
    /dev-customer-config-dark-desktop/
  )
  assert.match(
    getPreset('customer-config-dev-console').description,
    /只证明 dev-only 控制台/
  )
  assert.match(
    getPresetCopyText('dev-prototype-registry'),
    /devPrototypes\.test\.mjs/
  )
  assert.match(getPresetCopyText('dev-prototype-registry'), /devHub\.test\.mjs/)
  assert.match(
    getPresetCopyText('dev-prototype-registry'),
    /dev-prototypes-dark-desktop/
  )
  assert.match(
    getPreset('dev-prototype-registry').description,
    /不晋级 Current/
  )
  assert.match(getPreset('dev-prototype-registry').description, /不改正式菜单/)
  assert.match(
    getPresetCopyText('dev-doc-governance-ledger'),
    /devDocs\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('dev-doc-governance-ledger'),
    /devGovernance\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('dev-doc-governance-ledger'),
    /devCapabilityLedger\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('dev-doc-governance-ledger'),
    /dev-docs-dark-desktop/
  )
  assert.match(
    getPresetCopyText('dev-doc-governance-ledger'),
    /dev-governance-dark-desktop/
  )
  assert.match(
    getPreset('dev-doc-governance-ledger').description,
    /不改正式文档真源/
  )
  assert.match(
    getPreset('dev-doc-governance-ledger').description,
    /不进入正式菜单/
  )
  assert.match(
    getPresetCopyText('customer-config-package-runtime'),
    /customer-package-lint\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('customer-config-package-runtime'),
    /customer-config-runtime-manifest\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('customer-config-package-runtime'),
    /customer-config-release-execute\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('customer-config-package-runtime'),
    /customer-config-release-readiness\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('customer-config-package-runtime'),
    /run-smoke-script\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('customer-config-package-runtime'),
    /pnpm --dir web start:yoyoosun -- --print-plan/
  )
  assert.match(
    getPresetCopyText('customer-config-package-runtime'),
    /pnpm --dir web preview:yoyoosun -- --print-plan/
  )
  assert.match(
    getPresetCopyText('customer-config-package-runtime'),
    /yoyoosunEntryPlan\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('customer-config-package-runtime'),
    /devCustomerConfigPlugin\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('customer-config-package-runtime'),
    /customer-package-lint\.mjs --customer yoyoosun --mode compile/
  )
  assert.match(
    getPresetCopyText('customer-config-package-runtime'),
    /customer-config-runtime-manifest\.mjs --customer yoyoosun --mode compile/
  )
  assert.match(
    getPresetCopyText('customer-config-package-runtime'),
    /customer-config-runtime-manifest\.mjs --customer yoyoosun --mode preview --out output\/customers\/yoyoosun\/customer-config-runtime-manifest\.json/
  )
  assert.match(
    getPresetCopyText('customer-config-package-runtime'),
    /customer-config-effective-session-probe\.mjs --json --report output\/customers\/yoyoosun\/customer-config-effective-session-probe\/current\.json/
  )
  assert.match(
    getPresetCopyText('customer-config-package-runtime'),
    /customer-config-release-execute\.mjs --print-input-template/
  )
  assert.match(
    getPresetCopyText('customer-config-package-runtime'),
    /customer-config-release-readiness\.mjs --print-input-template/
  )
  assert.doesNotMatch(
    getPresetCopyText('customer-config-package-runtime'),
    /customer-config-release-readiness\.mjs\s+--manifest/
  )
  assert.doesNotMatch(
    getPresetCopyText('customer-config-package-runtime'),
    /--evidence-dir|evidence\/releases\/\d{4}-\d{2}-\d{2}/
  )
  assert.doesNotMatch(
    getPresetCopyText('customer-config-package-runtime'),
    /<release-batch>|<YYYY-MM-DD>/
  )
  assert.match(
    getPresetCopyText('customer-config-package-runtime'),
    /run-smoke\.sh --print-input-template/
  )
  assert.match(
    getPreset('customer-config-package-runtime').description,
    /active revision 读回前置/
  )
  assert.match(
    getPreset('customer-config-package-runtime').description,
    /显式选择证据批次/
  )
  assert.match(
    getPreset('customer-config-package-runtime').description,
    /输入模板/
  )
  assert.match(
    getPreset('customer-config-package-runtime').description,
    /不发布/
  )
  assert.match(
    getPreset('customer-config-package-runtime').description,
    /不激活/
  )
  assert.match(
    getPreset('customer-config-package-runtime').description,
    /不调用后端/
  )
  assert.match(
    getPresetCopyText('customer-import-tooling'),
    /customerSourceManifestCheck\.test\.mjs/
  )
  assert.doesNotMatch(
    getPresetCopyText('customer-import-tooling'),
    /customerImportExecute|--execute/
  )
  assert.match(
    getPreset('customer-import-tooling').description,
    /不执行真实客户导入/
  )
  assert.match(
    getPreset('customer-import-tooling').description,
    /不连接目标环境/
  )
  assert.match(
    getPresetCopyText('frontend-customer-config-projection'),
    /formal-frontend-customer-config-boundary\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('frontend-customer-config-projection'),
    /erp-effective-session-action-projection-business-pages/
  )
  assert.match(
    getPreset('frontend-customer-config-projection').description,
    /不读取 raw customer package/
  )
  assert.match(
    getPreset('frontend-customer-config-projection').description,
    /脱敏诊断/
  )
  assert.match(
    getPresetCopyText('frontend-error-messages'),
    /frontend-error-message-boundary\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('frontend-error-messages'),
    /errorMessage\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('frontend-error-messages'),
    /userVisibleTechnicalFields\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('frontend-error-messages'),
    /dashboardTaskDisplay\.test\.mjs/
  )
  assert.match(
    getPreset('frontend-error-messages').description,
    /共享 PDF 预览/
  )
  assert.match(getPreset('frontend-error-messages').description, /raw id/)
  assert.match(
    getPreset('frontend-error-messages').description,
    /不透传底层英文异常/
  )
  assert.match(
    getPresetCopyText('business-action-field-boundaries'),
    /workflowTaskActionAccess\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('business-action-field-boundaries'),
    /workflow-ui-action-boundary\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('business-action-field-boundaries'),
    /sales-order-field-chain-boundary\.test\.mjs/
  )
  assert.match(
    getPresetCopyText('business-action-field-boundaries'),
    /printTemplates\.test\.mjs/
  )
  assert.match(
    getPreset('business-action-field-boundaries').description,
    /Source Document 生命周期/
  )
  assert.match(
    getPreset('business-action-field-boundaries').description,
    /后端登记表静态边界守卫/
  )
  assert.equal(
    buildDevTestingCopyText(['pnpm test', '', '  pnpm css  ']),
    'pnpm test\npnpm css'
  )
})

test('devTesting: 常用预设引用的本地脚本必须存在', () => {
  const missing = []

  for (const preset of DEV_TESTING_COPY_PRESETS) {
    for (const localPath of extractLocalCommandFilePaths(preset.commands)) {
      if (!existsSync(join(repoRoot, localPath))) {
        missing.push(`${preset.key}: ${localPath}`)
      }
    }
  }

  assert.deepEqual(missing, [])
})

test('devTesting: 提取 fenced command blocks 并保留章节上下文', () => {
  const blocks = extractDevTestingCommandBlocks(strategyMarkdown, {
    sourcePath: DEV_TESTING_STRATEGY_SOURCE_PATH,
    title: '自动化测试策略 / Test Strategy',
  })

  assert.equal(blocks.length, 2)
  assert.equal(blocks[0].context, '6. 现有命令入口')
  assert.equal(
    blocks[0].sourceLabel,
    '测试策略：自动化测试策略 / Test Strategy'
  )
  assert.deepEqual(blocks[0].commands, ['bash scripts/qa/fast.sh'])
  assert.deepEqual(blocks[1].commands.slice(-2), ['pnpm test', 'pnpm style:l1'])
})

test('devTesting: 只索引当前测试入口白名单文档', () => {
  const docs = buildDevTestingDocs({
    '../../../../docs/product/自动化测试策略.md': strategyMarkdown,
    '../../../../scripts/README.md': scriptsReadmeMarkdown,
    '../../../../web/README.md': deliveryEvidenceMarkdown,
    '../../../../web/scripts/README.md': webScriptsReadmeMarkdown,
    '../../../../docs/archive/customer-evidence/yoyoosun/mobile-workflow-target-release-evidence-2026-06-09.md':
      deliveryEvidenceMarkdown,
    '../../../../docs/reference/第一次20260519/自动化测试计划.md':
      deliveryEvidenceMarkdown,
    '../../../../docs/product/产品原则.md': unrelatedMarkdown,
    '../../../../README.md': unrelatedMarkdown,
  })

  assert.deepEqual(
    docs.map((item) => item.path),
    [
      'docs/product/自动化测试策略.md',
      'README.md',
      'web/README.md',
      'web/scripts/README.md',
      'scripts/README.md',
    ]
  )
  assert.equal(docs[0].category, '测试策略')
  assert.equal(docs[0].sourceLabel, '测试策略：自动化测试策略 / Test Strategy')
  assert.equal(docs[1].category, '项目入口')
  assert.equal(docs[2].category, '前端验证')
  assert.equal(docs[3].category, '前端脚本')
  assert.equal(docs[3].sourceLabel, '前端脚本：web 脚本说明')
  assert.equal(docs[3].commandBlocks[0].sourceLabel, '前端脚本：web 脚本说明')
  assert.equal(docs[3].commandCount, 2)
  assert.equal(docs[4].category, 'QA 脚本')
  assert.equal(docs[4].commandCount, 3)
})

test('devTesting: 当前维护白名单中的真实文档都能进入索引', () => {
  const markdownModules = Object.fromEntries(
    DEV_TESTING_CURRENT_DOC_PATHS.map((path) => [
      `../../../../${path}`,
      readFileSync(join(repoRoot, path), 'utf8'),
    ])
  )
  const docs = buildDevTestingDocs(markdownModules)

  assert.deepEqual(
    docs.map((item) => item.path),
    DEV_TESTING_CURRENT_DOC_PATHS
  )
  assert(docs.every((item) => item.source.trim().length > 0))
})

test('devTesting: reference 和 archive 不作为测试命令入口', () => {
  const docs = buildDevTestingDocs({
    '../../../../docs/product/自动化测试策略.md': strategyMarkdown,
    '../../../../docs/reference/第一次20260519/自动化测试计划.md':
      deliveryEvidenceMarkdown,
    '../../../../docs/reference/第一次20260519/状态分层工作流与业务事实设计总结.md':
      deliveryEvidenceMarkdown,
    '../../../../docs/archive/customer-evidence/yoyoosun/mobile-workflow-target-release-evidence-2026-06-09.md':
      deliveryEvidenceMarkdown,
  })

  assert.deepEqual(
    docs.map((item) => item.path),
    ['docs/product/自动化测试策略.md']
  )
})

test('devTesting: fenced block 只提取 shell 命令和续行', () => {
  const blocks = extractDevTestingCommandBlocks(scriptsReadmeMarkdown, {
    sourcePath: 'scripts/README.md',
    title: 'QA 脚本说明',
  })

  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].sourceLabel, 'QA 脚本：QA 脚本说明')
  assert.deepEqual(blocks[0].commands, [
    'node scripts/import/customerSourceExtract.mjs \\',
    '--manifest docs/customers/yoyoosun/source-manifest.json \\',
    '--out output/customers/yoyoosun/source-extract',
  ])
})

test('devTesting: fenced command 保留裸续行参数并丢弃不完整命令', () => {
  const markdown = [
    '# 续行命令',
    '```bash',
    'node --test \\',
    '  /workspace/first.test.mjs \\',
    '  /workspace/second.test.mjs',
    'docker run --rm \\',
    '  plush-toy-erp-web:dev',
    "MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD='local-only' \\",
    '  node web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs \\',
    '  --report output/mobile-workflow/report.json',
    'node --test \\',
    '```',
  ].join('\n')
  const blocks = extractDevTestingCommandBlocks(markdown, {
    sourcePath: 'scripts/README.md',
    title: '续行命令',
  })

  assert.equal(blocks.length, 1)
  assert.deepEqual(blocks[0].commands, [
    'node --test \\',
    '/workspace/first.test.mjs \\',
    '/workspace/second.test.mjs',
    'docker run --rm \\',
    'plush-toy-erp-web:dev',
    "MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD='local-only' \\",
    'node web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs \\',
    '--report output/mobile-workflow/report.json',
  ])
  assert.equal(blocks[0].commandText.trimEnd().endsWith('\\'), false)
})

test('devTesting: 空筛选结果不回退到未匹配文档', () => {
  const docs = [
    { key: 'one', title: '文档一' },
    { key: 'two', title: '文档二' },
  ]

  assert.equal(resolveDevTestingSelectedDoc([], 'one'), null)
  assert.equal(resolveDevTestingSelectedDoc(docs, 'two'), docs[1])
  assert.equal(resolveDevTestingSelectedDoc(docs, 'missing'), docs[0])
})

test('devTesting: view 和 doc 由 canonical query 驱动并支持历史恢复', () => {
  assert.match(testingPageSource, /useSearchParams\(\)/)
  assert.match(testingPageSource, /const VIEW_QUERY_KEY = 'view'/)
  assert.match(testingPageSource, /const DOC_QUERY_KEY = 'doc'/)
  assert.match(
    testingPageSource,
    /requestedView = searchParams\.get\(VIEW_QUERY_KEY\)/
  )
  assert.match(
    testingPageSource,
    /requestedDocKey = searchParams\.get\(DOC_QUERY_KEY\)/
  )
  assert.match(
    testingPageSource,
    /setSearchParams\(nextParams, \{ replace: true \}\)/
  )
  assert.doesNotMatch(testingPageSource, /\[\s*view\s*,\s*setView\s*\]/)
  assert.doesNotMatch(
    testingPageSource,
    /\[\s*selectedKey\s*,\s*setSelectedKey\s*\]/
  )
  assert.doesNotMatch(testingPageSource, /<Input\.Search/u)
  assert.match(
    testingPageSource,
    /<Input[\s\S]*prefix=\{<SearchOutlined aria-hidden="true" \/>\}/u
  )
  assert.match(
    testingPageSource,
    /aria-current=\{active \? 'true' : undefined\}/u
  )
  assert.match(
    testingPageSource,
    /aria-pressed=\{option\.value === category\}/u
  )
})

test('devTesting: 支持分类和关键词筛选并汇总', () => {
  const docs = buildDevTestingDocs({
    '../../../../docs/product/自动化测试策略.md': strategyMarkdown,
    '../../../../scripts/README.md': scriptsReadmeMarkdown,
    '../../../../web/README.md': deliveryEvidenceMarkdown,
  })
  const tiers = parseDevTestingStrategyTiers(strategyMarkdown)
  const summary = buildDevTestingSummary({ tiers, docs })

  assert.equal(summary.tierCount, 3)
  assert.equal(summary.docCount, 3)
  assert.equal(summary.docsWithCommands, 3)
  assert.equal(summary.commandCount, 10)
  assert.deepEqual(
    getDevTestingCategoryOptions(docs).map((item) => item.value),
    ['all', '测试策略', '前端验证', 'QA 脚本']
  )
  assert.deepEqual(
    filterDevTestingDocs(docs, { keyword: 'trial' }).map((item) => item.path),
    ['web/README.md']
  )
  assert.deepEqual(
    filterDevTestingDocs(docs, { category: '测试策略' }).map(
      (item) => item.path
    ),
    ['docs/product/自动化测试策略.md']
  )
})
