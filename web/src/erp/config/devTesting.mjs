export { DEV_TESTING_ROUTE } from './devRoutes.mjs'
export const DEV_TESTING_STRATEGY_SOURCE_PATH = 'docs/product/自动化测试策略.md'

export const DEV_TESTING_CURRENT_DOC_PATHS = Object.freeze([
  DEV_TESTING_STRATEGY_SOURCE_PATH,
  'README.md',
  'web/README.md',
  'web/scripts/README.md',
  'server/README.md',
  'scripts/README.md',
  'docs/部署约定.md',
  'server/deploy/README.md',
  'server/deploy/compose/prod/README.md',
])

export const DEV_TESTING_DOC_KEYWORDS = Object.freeze([
  '测试',
  '验收',
  '回归',
  '门禁',
  '证据',
  'QA',
  'qa',
  'test',
  'smoke',
  'style:l1',
  'Playwright',
])

export const DEV_TESTING_COPY_PRESETS = Object.freeze([
  {
    key: 'frontend',
    label: '本轮前端验证 / Frontend Check',
    description:
      '页面、路由、样式或前端 helper 改动时优先复制 / use for frontend changes.',
    commands: [
      'cd /Users/simon/projects/plush-toy-erp/web',
      'pnpm lint',
      'pnpm css',
      'pnpm test',
      'pnpm style:l1',
    ],
  },
  {
    key: 'workflow-backend-actions',
    label: 'Workflow 后端动作合同 / Backend Action Contract',
    description:
      '任务动作、reason、事件 / actor role、payload 或任务端后端读回改动时复制；只证明本地后端合同。',
    commands: [
      'cd /Users/simon/projects/plush-toy-erp/server',
      "go test ./internal/data -run 'TestWorkflowRepo_(TaskStatusReasonEventAndCompletionCleanup|CreateAndUpdateTaskStatus|UrgeWorkflowTaskWritesEventAndPayload)'",
      "go test ./internal/service -run 'TestJsonrpcDispatcher_WorkflowUrgeTask|TestJsonrpcDispatcher_Workflow(CompleteTaskAction|ControlledTaskActions)'",
    ],
  },
  {
    key: 'trial-role-entries',
    label: '试用角色入口 / Trial Role Entries',
    description:
      '试用账号、岗位任务端入口、角色菜单或 README 口径改动时复制；不登录真实后端。',
    commands: [
      'cd /Users/simon/projects/plush-toy-erp',
      'PATH=/usr/local/bin:$PATH node --test scripts/qa/trial-role-entry-docs.test.mjs',
    ],
  },
  {
    key: 'frontend-role-menu-seed-contracts',
    label: '角色菜单与入口真源 / Role Menu & Entry Contracts',
    description:
      '角色菜单、岗位任务端入口、seedData、正式菜单权限或业务状态前端真源改动时复制；只证明本地前端配置合同，不替代后端 RBAC、customer config active revision 或真实登录。',
    commands: [
      'cd /Users/simon/projects/plush-toy-erp',
      'PATH=/usr/local/bin:$PATH node --test web/src/erp/config/entryConfig.test.mjs web/src/erp/config/menuPermissions.test.mjs web/src/erp/config/seedData.test.mjs web/src/erp/config/workflowStatus.test.mjs',
    ],
  },
  {
    key: 'trial-account-rbac',
    label: '试用账号 RBAC / Trial Account RBAC',
    description:
      '生成试用账号、角色模板、岗位入口、菜单权限或 effective session 诊断后复制；先打印无写入输入模板，真实验证需要本地后端和演示账号密码，只读核对登录、角色、岗位入口权限、脱敏投影诊断和 debug 权限边界。',
    commands: [
      'cd /Users/simon/projects/plush-toy-erp',
      'PATH=/usr/local/bin:$PATH node --test scripts/qa/trial-account-rbac.test.mjs web/scripts/trialDemoAccountBrowserSmoke.test.mjs',
      'PATH=/usr/local/bin:$PATH node --check scripts/qa/trial-account-rbac.mjs',
      'PATH=/usr/local/bin:$PATH node scripts/qa/trial-account-rbac.mjs --print-input-template',
      'PATH=/usr/local/bin:$PATH node scripts/qa/trial-account-rbac.mjs --preflight-report output/trial-account-rbac/preflight.json',
      'PATH=/usr/local/bin:$PATH node web/scripts/trialDemoAccountBrowserSmoke.mjs --print-input-template',
      'PATH=/usr/local/bin:$PATH node web/scripts/trialDemoAccountBrowserSmoke.mjs --preflight-report output/trial-demo-account-browser-smoke/preflight.json',
      "TRIAL_ACCOUNT_PASSWORD='replace-with-local-demo-password' PATH=/usr/local/bin:$PATH node scripts/qa/trial-account-rbac.mjs",
      "TRIAL_ACCOUNT_PASSWORD='replace-with-local-demo-password' PATH=/usr/local/bin:$PATH node scripts/qa/trial-account-rbac.mjs --report output/trial-account-rbac/report.json",
      "TRIAL_ACCOUNT_PASSWORD='replace-with-local-demo-password' PATH=/usr/local/bin:$PATH pnpm --dir web smoke:trial-demo-browser",
      "TRIAL_ACCOUNT_PASSWORD='replace-with-local-demo-password' PATH=/usr/local/bin:$PATH node web/scripts/trialDemoAccountBrowserSmoke.mjs --report output/trial-demo-account-browser-smoke/report.json",
    ],
  },
  {
    key: 'real-login-smoke-shared',
    label: '真实登录 smoke URL 边界 / Real Login Smoke URL Guard',
    description:
      '真实登录 smoke 共享 helper、采购合同 / 加工合同 / 岗位任务端认证回跳 / 采购入库真实浏览器脚本入口改动时复制；先打印 no-write 输入模板和 shared / mobile-auth / 采购入库浏览器 preflight，单测只证明 URL 凭据边界、凭据来源前置、持久测试数据确认和前置清单，不执行真实登录、不启动浏览器；mobile-auth 回归使用 mock RPC 验证生产单端口岗位路由。',
    commands: [
      'cd /Users/simon/projects/plush-toy-erp',
      'PATH=/usr/local/bin:$PATH node --test web/scripts/realLoginSmokeShared.test.mjs web/scripts/mobileAuthLoginRouteSmoke.test.mjs web/scripts/purchaseReceiptRealWriteBrowserE2E.test.mjs',
      'PATH=/usr/local/bin:$PATH node web/scripts/realLoginSmokeShared.mjs --print-input-template',
      'PATH=/usr/local/bin:$PATH node web/scripts/realLoginSmokeShared.mjs --preflight-report output/real-login-smoke-shared/preflight.json',
      'PATH=/usr/local/bin:$PATH node web/scripts/mobileAuthLoginRouteSmoke.mjs --print-input-template',
      'PATH=/usr/local/bin:$PATH node web/scripts/mobileAuthLoginRouteSmoke.mjs --preflight-report output/mobile-auth-login-route-smoke/preflight.json',
      'PATH=/usr/local/bin:$PATH node web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs --print-input-template',
      'PATH=/usr/local/bin:$PATH node web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs --preflight-report output/purchase-receipt-real-write-browser-e2e/preflight.json',
      "REAL_LOGIN_ADMIN_USERNAME='replace-with-local-admin' REAL_LOGIN_ADMIN_PASSWORD='replace-with-local-password' PATH=/usr/local/bin:$PATH pnpm --dir web smoke:purchase-contract-real-login",
      "REAL_LOGIN_ADMIN_USERNAME='replace-with-local-admin' REAL_LOGIN_ADMIN_PASSWORD='replace-with-local-password' PATH=/usr/local/bin:$PATH pnpm --dir web smoke:processing-contract-real-login",
      'PATH=/usr/local/bin:$PATH pnpm --dir web smoke:mobile-auth-login-route',
      "REAL_LOGIN_ADMIN_USERNAME='replace-with-local-admin' REAL_LOGIN_ADMIN_PASSWORD='replace-with-local-password' PATH=/usr/local/bin:$PATH pnpm --dir web smoke:purchase-receipt-real-write",
    ],
  },
  {
    key: 'trial-simulated-data',
    label: '试用模拟数据 / Trial Simulated Data',
    description:
      '试用账号、seed / fixture、模拟主数据或本地闭环工具改动时复制；先打印 no-write 输入模板，再按需生成 report-only 证据；岗位任务模拟计划覆盖完成、阻塞、退回和催办；只证明本地 simulated-only / no real import 守卫，report-only 命令不连接后端。',
    commands: [
      'cd /Users/simon/projects/plush-toy-erp',
      'PATH=/usr/local/bin:$PATH node --test scripts/qa/trial-simulated-data.test.mjs scripts/qa/operational-fact-simulated-closure.test.mjs scripts/qa/mobile-workflow-simulated-closure.test.mjs',
      'PATH=/usr/local/bin:$PATH node scripts/qa/trial-simulated-data.mjs --print-input-template',
      'PATH=/usr/local/bin:$PATH node scripts/qa/operational-fact-simulated-closure.mjs --print-input-template',
      'PATH=/usr/local/bin:$PATH node scripts/qa/mobile-workflow-simulated-closure.mjs --print-input-template',
      'PATH=/usr/local/bin:$PATH node scripts/qa/trial-simulated-data.mjs --out output/customers/yoyoosun/trial-simulated-data-dev-testing-report',
      'PATH=/usr/local/bin:$PATH node scripts/qa/mobile-workflow-simulated-closure.mjs --run-id DEV-TESTING-REPORT --out output/customers/yoyoosun/mobile-workflow-simulated-closure-dev-testing-report',
      'PATH=/usr/local/bin:$PATH node scripts/qa/operational-fact-simulated-closure.mjs --product-id <product_id> --unit-id <unit_id> --warehouse-id <warehouse_id> --run-id DEV-TESTING-REPORT --out output/customers/yoyoosun/operational-fact-simulated-closure-dev-testing-report',
    ],
  },
  {
    key: 'mvp-local-closure',
    label: 'MVP 本地闭环计划 / MVP Local Closure',
    description:
      '试用前主链路验收口径或采购入库服务层真实写入 e2e 前置改动时复制；先打印真实写入输入模板，MVP closure 只生成本地 plan-only / no-write evidence，不替代领域测试、浏览器回归或部署 smoke。',
    commands: [
      'cd /Users/simon/projects/plush-toy-erp',
      'PATH=/usr/local/bin:$PATH node --test scripts/qa/mvp-closure.test.mjs scripts/qa/purchase-receipt-real-write-e2e.test.mjs',
      'PATH=/usr/local/bin:$PATH node scripts/qa/purchase-receipt-real-write-e2e.mjs --print-input-template',
      'PATH=/usr/local/bin:$PATH node scripts/qa/purchase-receipt-real-write-e2e.mjs --preflight-report output/qa/purchase-receipt-real-write-e2e/preflight.json',
      'PATH=/usr/local/bin:$PATH node scripts/qa/mvp-closure.mjs --out output/customers/yoyoosun/mvp-closure',
      'PATH=/usr/local/bin:$PATH node scripts/qa/mvp-closure.mjs --run-report-tools --product-id <product_id> --unit-id <unit_id> --warehouse-id <warehouse_id> --out output/customers/yoyoosun/mvp-closure',
    ],
  },
  {
    key: 'mobile-workflow-smoke',
    label: '移动端 Workflow smoke / Mobile Workflow Smoke',
    description:
      '移动端任务动作、内部提醒、完成反馈或跨角色催办改动时复制；先打印无写入输入模板并生成动作计划 preflight，真实浏览器命令需本地后端和演示账号密码。',
    commands: [
      'cd /Users/simon/projects/plush-toy-erp',
      'PATH=/usr/local/bin:$PATH node --test scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs web/src/erp/mobile/utils/mobileRoleTaskModel.test.mjs web/src/erp/utils/workflowTaskBoard.test.mjs',
      'PATH=/usr/local/bin:$PATH node web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs --print-input-template',
      'PATH=/usr/local/bin:$PATH node web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs --preflight-report output/mobile-workflow-runtime-browser-smoke/preflight.json',
      "MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD='replace-with-local-demo-password' PATH=/usr/local/bin:$PATH node web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs --report output/mobile-workflow-runtime-browser-smoke/report.json",
    ],
  },
  {
    key: 'customer-config-dev-console',
    label: '客户配置控制台 / Customer Config Console',
    description:
      '客户配置预检、moduleStates、导入 tooling 或 /__dev/customer-config 页面改动时复制；只证明 dev-only 控制台和本地证据。',
    commands: [
      'cd /Users/simon/projects/plush-toy-erp',
      'PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devCustomerConfig.test.mjs web/src/erp/config/printTemplates.test.mjs scripts/qa/dev-entry-boundary.test.mjs',
      'PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-customer-config-dark-desktop STYLE_L1_PORT=5235 pnpm --dir web style:l1',
    ],
  },
  {
    key: 'dev-prototype-registry',
    label: '原型登记与查看器 / Prototype Registry',
    description:
      'docs/product/prototypes、原型资产登记或 /__dev/prototypes 查看器改动时复制；只证明 dev-only 原型查看器和本地资产登记，不晋级 Current、不改正式菜单。',
    commands: [
      'cd /Users/simon/projects/plush-toy-erp',
      'PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devPrototypes.test.mjs web/src/erp/config/devHub.test.mjs',
      'PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-prototypes-dark-desktop STYLE_L1_PORT=5235 pnpm --dir web style:l1',
    ],
  },
  {
    key: 'dev-doc-governance-ledger',
    label: '文档治理与台账查看器 / Docs Governance & Ledger',
    description:
      '仓库 Markdown 查看器、项目治理地图或能力台账可视化改动时复制；只证明 dev-only 只读查看器，不改正式文档真源、不进入正式菜单。',
    commands: [
      'cd /Users/simon/projects/plush-toy-erp',
      'PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devDocs.test.mjs web/src/erp/config/devGovernance.test.mjs web/src/erp/config/devCapabilityLedger.test.mjs web/src/erp/config/devHub.test.mjs',
      'PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-hub-dark-desktop,dev-docs-dark-desktop,dev-governance-dark-desktop STYLE_L1_PORT=5235 pnpm --dir web style:l1',
    ],
  },
  {
    key: 'customer-config-package-runtime',
    label: '客户配置包运行时 / Customer Config Runtime',
    description:
      '客户配置包结构、moduleStates、角色池、页面 / 字段投影、runtime manifest 或 active revision 读回前置改动时复制；只做本地 validate / compile、输入模板和无后端测试，不发布、不激活、不调用后端；release readiness 必须在 /__dev/customer-config 显式选择证据批次后检查。',
    commands: [
      'cd /Users/simon/projects/plush-toy-erp',
      'PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web start:yoyoosun -- --print-plan',
      'PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web preview:yoyoosun -- --print-plan',
      'PATH=/usr/local/bin:$PATH node --test scripts/qa/customer-package-lint.test.mjs scripts/qa/customer-config-runtime-manifest.test.mjs scripts/deploy/customer-config-release-execute.test.mjs scripts/deploy/customer-config-release-readiness.test.mjs scripts/deploy/run-smoke-script.test.mjs web/scripts/yoyoosunEntryPlan.test.mjs web/devCustomerConfigPlugin.test.mjs',
      'PATH=/usr/local/bin:$PATH node scripts/qa/customer-package-lint.mjs --customer demo',
      'PATH=/usr/local/bin:$PATH node scripts/qa/customer-package-lint.mjs --customer demo --mode compile',
      'PATH=/usr/local/bin:$PATH node scripts/qa/customer-package-lint.mjs --customer yoyoosun',
      'PATH=/usr/local/bin:$PATH node scripts/qa/customer-package-lint.mjs --customer yoyoosun --mode compile',
      'PATH=/usr/local/bin:$PATH node scripts/qa/customer-config-runtime-manifest.mjs --customer demo',
      'PATH=/usr/local/bin:$PATH node scripts/qa/customer-config-runtime-manifest.mjs --customer demo --mode compile',
      'PATH=/usr/local/bin:$PATH node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun',
      'PATH=/usr/local/bin:$PATH node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode compile',
      'PATH=/usr/local/bin:$PATH node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode preview --out output/customers/yoyoosun/customer-config-runtime-manifest.json',
      'PATH=/usr/local/bin:$PATH node scripts/qa/customer-config-effective-session-probe.mjs --json --report output/customers/yoyoosun/customer-config-effective-session-probe/current.json',
      'PATH=/usr/local/bin:$PATH node scripts/deploy/customer-config-release-execute.mjs --print-input-template',
      'PATH=/usr/local/bin:$PATH node scripts/deploy/customer-config-release-readiness.mjs --print-input-template',
      'PATH=/usr/local/bin:$PATH bash deployments/yoyoosun/scripts/run-smoke.sh --print-input-template',
    ],
  },
  {
    key: 'customer-import-tooling',
    label: '客户导入 tooling / Customer Import Tooling',
    description:
      '客户 source manifest、extract、freeze 或 dry-run 门禁改动时复制；只跑无后端测试，不执行真实客户导入、不连接目标环境，仓库也不提供真实导入执行入口。',
    commands: [
      'cd /Users/simon/projects/plush-toy-erp',
      'PATH=/usr/local/bin:$PATH node --test scripts/import/customerSourceManifestCheck.test.mjs scripts/import/customerSourceExtract.test.mjs scripts/import/customerSourceSnapshotFreezeCheck.test.mjs scripts/import/customerImportDryRun.test.mjs',
    ],
  },
  {
    key: 'frontend-customer-config-projection',
    label: '客户配置前端投影 / Customer Config Projection',
    description:
      '正式前端 effective session、菜单、动作、字段投影或脱敏诊断改动时复制；只证明本地投影合同，不读取 raw customer package。',
    commands: [
      'cd /Users/simon/projects/plush-toy-erp',
      'PATH=/usr/local/bin:$PATH node --test web/src/erp/utils/adminProfileSync.test.mjs scripts/qa/formal-frontend-customer-config-boundary.test.mjs',
      'PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=erp-effective-session-super-admin-product-core,erp-effective-session-direct-url-local-dev-diagnostic,erp-effective-session-configured-customer-sync-failure-blocked,erp-effective-session-empty-pages-local-dev-diagnostic,erp-no-visible-menu-blocks-outlet,erp-effective-session-action-projection-business-pages STYLE_L1_PORT=5235 pnpm --dir web style:l1',
    ],
  },
  {
    key: 'frontend-error-messages',
    label: '前端错误提示边界 / Frontend Error Messages',
    description:
      '正式页面、组件、岗位任务端、共享 PDF 预览、用户可见错误或技术字段展示改动时复制；只证明本地用户可见错误不透传底层英文异常，且业务界面不展示 raw id / 内部字段。',
    commands: [
      'cd /Users/simon/projects/plush-toy-erp',
      'PATH=/usr/local/bin:$PATH node --test scripts/qa/frontend-error-message-boundary.test.mjs web/src/common/utils/errorMessage.test.mjs web/src/erp/utils/userVisibleTechnicalFields.test.mjs web/src/erp/utils/dashboardTaskDisplay.test.mjs',
    ],
  },
  {
    key: 'business-action-field-boundaries',
    label: '业务动作与字段链路 / Business Action & Field Boundaries',
    description:
      'Workflow 动作入口、Source Document 生命周期、销售订单字段策略、导出或打印边界改动时复制；只证明本地前端、文档和后端登记表静态边界守卫。',
    commands: [
      'cd /Users/simon/projects/plush-toy-erp',
      'PATH=/usr/local/bin:$PATH node --test web/src/erp/utils/workflowTaskActionAccess.test.mjs scripts/qa/workflow-ui-action-boundary.test.mjs scripts/qa/sales-order-field-chain-boundary.test.mjs web/src/erp/config/printTemplates.test.mjs',
    ],
  },
  {
    key: 'pre-commit',
    label: '提交前 QA / Pre-commit QA',
    description:
      '提交或推送前复制 / copy before commit or push；具体范围仍按本轮改动判断。',
    commands: [
      'cd /Users/simon/projects/plush-toy-erp',
      'bash scripts/qa/full.sh',
    ],
  },
  {
    key: 'release',
    label: '发版前严格 QA / Release QA',
    description:
      '发版前复制 / copy before release；不代表部署、备份或回滚已自动完成。',
    commands: [
      'cd /Users/simon/projects/plush-toy-erp',
      'bash scripts/qa/strict.sh',
    ],
  },
])

const DEV_TESTING_TIER_HEADINGS = Object.freeze([
  '## 验证层级 T0-T8',
  '## 4. 验证层级 T0-T8',
  '## 3. 测试分层',
])

const DEV_TESTING_TIER_COPY_FALLBACKS = Object.freeze({
  T1: [
    'cd /Users/simon/projects/plush-toy-erp',
    'git status --short',
    'git diff --stat',
    'git diff --check',
    'grep -R "tenant_id" docs/customers docs/product docs/architecture docs/reference config deployments server web || true',
    'grep -R "ChangeUsecase\\|change_records" server web docs || true',
  ],
  T7: [
    '# T7 当前没有完整业务 E2E runner；按触达事实层选择下列当前可用检查，不要伪造全链路自动化。',
    'cd /Users/simon/projects/plush-toy-erp/server',
    'go test ./internal/biz ./internal/data',
    '# 如本轮明确触达对应库存、BOM、采购入库或采购退货 PG 防呆测试，再按领域选择 server Makefile 中的对应 target',
  ],
  T8: [
    'cd /Users/simon/projects/plush-toy-erp',
    'bash scripts/qa/full.sh',
    'bash scripts/qa/strict.sh',
    '# 部署、备份、migration、health、smoke 和回滚按 server/deploy/README.md 与目标环境执行，浏览器入口不直接运行。',
  ],
})

export function isDevTestingEnabled(env = import.meta.env) {
  return env?.DEV === true
}

function normalizeText(value = '') {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripMarkdownInline(value = '') {
  return normalizeText(value)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim()
}

function stripHeadingMarkdown(rawTitle = '') {
  return stripMarkdownInline(rawTitle)
    .replace(/\s+#+\s*$/, '')
    .trim()
}

function normalizeGlobPath(modulePath = '') {
  const cleanPath = String(modulePath || '').replace(/\?.*$/, '')
  if (cleanPath.startsWith('../../../../')) {
    return cleanPath.slice('../../../../'.length)
  }
  if (cleanPath.startsWith('../../../')) {
    return `web/${cleanPath.slice('../../../'.length)}`
  }
  return cleanPath.replace(/^\.?\//, '')
}

function normalizeModuleValue(value) {
  if (typeof value === 'string') return value
  if (typeof value?.default === 'string') return value.default
  return ''
}

function titleFromMarkdown(source = '', fallbackPath = '') {
  const match = String(source || '').match(/^#\s+(.+)$/m)
  if (match) {
    return stripHeadingMarkdown(match[1])
  }
  const filename =
    String(fallbackPath || '')
      .split('/')
      .pop() || fallbackPath
  return filename.replace(/\.md$/i, '')
}

function splitMarkdownTableRow(row = '') {
  const cells = []
  let current = ''
  let inCode = false
  const source = String(row || '').trim()
  const startIndex = source.startsWith('|') ? 1 : 0
  const endIndex = source.endsWith('|') ? source.length - 1 : source.length

  for (let index = startIndex; index < endIndex; index += 1) {
    const char = source[index]
    const previous = source[index - 1]
    if (char === '`' && previous !== '\\') {
      inCode = !inCode
      current += char
      continue
    }
    if (char === '|' && !inCode && previous !== '\\') {
      cells.push(normalizeText(current))
      current = ''
      continue
    }
    current += char
  }
  cells.push(normalizeText(current))
  return cells
}

function isSeparatorRow(cells = []) {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')))
}

function extractMarkdownSection(source = '', heading = '') {
  const text = String(source || '')
  const startIndex = text.indexOf(heading)
  if (startIndex < 0) {
    return ''
  }
  const afterHeading = text.slice(startIndex + heading.length)
  const endIndex = afterHeading.search(/\n##\s+/)
  return endIndex >= 0 ? afterHeading.slice(0, endIndex) : afterHeading
}

function parseMarkdownTable(source = '', heading = '') {
  const section = extractMarkdownSection(source, heading)
  const tableRows = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && line.endsWith('|'))
    .map(splitMarkdownTableRow)

  if (tableRows.length < 3) {
    return { headers: [], rows: [] }
  }

  const headers = tableRows[0].map(stripMarkdownInline)
  const rows = tableRows.slice(2).filter((cells) => {
    return cells.length === headers.length && !isSeparatorRow(cells)
  })
  return { headers, rows }
}

function parseFirstMarkdownTable(source = '', headings = []) {
  for (const heading of headings) {
    const table = parseMarkdownTable(source, heading)
    if (table.headers.length > 0) return table
  }
  return { headers: [], rows: [] }
}

function extractInlineCommands(value = '') {
  return [...String(value || '').matchAll(/`([^`]+)`/g)]
    .map((match) => stripMarkdownInline(match[1]))
    .filter(isShellCommandLine)
}

function getMarkdownTableCell(cells = [], headerIndex = {}, headerNames = []) {
  for (const headerName of headerNames) {
    const index = headerIndex[headerName]
    if (Number.isInteger(index)) return cells[index] || ''
  }
  return ''
}

export function parseDevTestingStrategyTiers(source = '') {
  const { headers, rows } = parseFirstMarkdownTable(
    source,
    DEV_TESTING_TIER_HEADINGS
  )
  if (headers.length === 0) return []

  const headerIndex = Object.fromEntries(
    headers.map((header, index) => [header, index])
  )

  return rows.map((cells, index) => {
    const level = stripMarkdownInline(
      getMarkdownTableCell(cells, headerIndex, ['层级', '验证层级'])
    )
    const changeType = stripMarkdownInline(
      getMarkdownTableCell(cells, headerIndex, ['改动类型', '适用改动'])
    )
    const commandText = getMarkdownTableCell(cells, headerIndex, [
      '必跑或优先命令',
      '最小验证',
    ])
    const description = stripMarkdownInline(
      getMarkdownTableCell(cells, headerIndex, ['说明'])
    )
    const key = level.split(/\s+/)[0] || `T${index}`

    const commands = extractInlineCommands(commandText)
    const copyCommands =
      commands.length > 0
        ? commands
        : DEV_TESTING_TIER_COPY_FALLBACKS[key] || []

    return {
      key,
      level,
      changeType,
      commands,
      copyCommands,
      copyText: buildDevTestingCopyText(copyCommands),
      description,
      searchText: [level, changeType, commandText, description]
        .join(' ')
        .toLowerCase(),
    }
  })
}

export function buildDevTestingCopyText(commands = []) {
  return commands
    .map((command) => String(command || '').trim())
    .filter(Boolean)
    .join('\n')
}

function isShellCommandLine(line = '') {
  const command = String(line || '').trim()
  return /^(?:[A-Z_][A-Z0-9_]*=(?:'[^']*'|"[^"]*"|[^\s]+)\s+)*(?:(?:cd|pnpm|npm|node|bash|go|make|git|grep|docker|curl|ssh|scp|rsync|atlas)\b|\/usr\/local\/bin\/(?:pnpm|atlas)\b)/.test(
    command
  )
}

function hasShellLineContinuation(line = '') {
  const trailingBackslashes =
    String(line || '')
      .trimEnd()
      .match(/(\\+)$/)?.[1] || ''
  return trailingBackslashes.length % 2 === 1
}

function isShellEnvironmentContinuationLine(line = '') {
  const command = String(line || '')
    .trim()
    .replace(/\\\s*$/, '')
    .trim()
  return /^(?:[A-Z_][A-Z0-9_]*=(?:'[^']*'|"[^"]*"|[^\s]+)\s*)+$/.test(command)
}

function extractShellCommandsFromBlock(rawBlock = '') {
  const commands = []
  let continuationStartIndex = -1

  String(rawBlock || '')
    .split('\n')
    .forEach((rawLine) => {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) {
        if (continuationStartIndex >= 0) {
          commands.splice(continuationStartIndex)
          continuationStartIndex = -1
        }
        return
      }

      if (continuationStartIndex >= 0) {
        commands.push(line)
        if (!hasShellLineContinuation(line)) {
          continuationStartIndex = -1
        }
        return
      }

      const startsCommand =
        isShellCommandLine(line) ||
        (hasShellLineContinuation(line) &&
          isShellEnvironmentContinuationLine(line))
      if (!startsCommand) return

      const commandStartIndex = commands.length
      commands.push(line)
      if (hasShellLineContinuation(line)) {
        continuationStartIndex = commandStartIndex
      }
    })

  if (continuationStartIndex >= 0) {
    commands.splice(continuationStartIndex)
  }

  return commands
}

export function extractDevTestingCommandBlocks(
  source = '',
  { sourcePath = '', title = '' } = {}
) {
  const blocks = []
  const text = String(source || '')
  const pattern = /```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g
  let match
  while (true) {
    match = pattern.exec(text)
    if (match === null) break
    const before = text.slice(0, match.index)
    const headingMatch = [...before.matchAll(/^#{2,4}\s+(.+)$/gm)].pop()
    const context = headingMatch ? stripHeadingMarkdown(headingMatch[1]) : title
    const commands = extractShellCommandsFromBlock(match[1])
    const sourceLabel = devTestingSourceLabel(sourcePath, title)

    if (commands.length === 0) continue

    blocks.push({
      key: `${sourcePath || 'source'}:${blocks.length}`,
      sourcePath,
      sourceLabel,
      title,
      context,
      commands,
      commandText: commands.join('\n'),
      searchText: [sourcePath, sourceLabel, title, context, commands.join(' ')]
        .join(' ')
        .toLowerCase(),
    })
  }
  return blocks
}

function classifyTestingDoc(path = '') {
  if (path === DEV_TESTING_STRATEGY_SOURCE_PATH) return '测试策略'
  if (path === 'scripts/README.md') return 'QA 脚本'
  if (path === 'web/scripts/README.md') return '前端脚本'
  if (path === 'web/README.md') return '前端验证'
  if (path === 'server/README.md') return '后端验证'
  if (path === 'README.md') return '项目入口'
  if (path === 'docs/部署约定.md' || path.startsWith('server/deploy/')) {
    return '部署验证'
  }
  if (/release-evidence|target-release-evidence/i.test(path)) return '发布验收'
  if (path.includes('/import-') || path.includes('/source-snapshot')) {
    return '导入验收'
  }
  if (path.includes('/trial-') || path.includes('acceptance')) return '试用验收'
  return /qa|test|测试|验收|回归|smoke|style:l1/i.test(path)
    ? '测试资料'
    : '当前文档'
}

function devTestingSourceLabel(path = '', title = '') {
  const category = classifyTestingDoc(path)
  const cleanTitle = stripMarkdownInline(title)
  if (cleanTitle && cleanTitle !== path) {
    return `${category}：${cleanTitle}`
  }
  return category
}

function countKeywordHits(value = '') {
  const normalized = String(value || '').toLowerCase()
  return DEV_TESTING_DOC_KEYWORDS.reduce((total, keyword) => {
    const target = keyword.toLowerCase()
    return total + (normalized.includes(target) ? 1 : 0)
  }, 0)
}

export function buildDevTestingDocs(markdownModules = {}) {
  const byPath = new Map()
  const currentDocPaths = new Set(DEV_TESTING_CURRENT_DOC_PATHS)

  Object.entries(markdownModules).forEach(([modulePath, moduleValue]) => {
    const path = normalizeGlobPath(modulePath)
    if (
      !path.endsWith('.md') ||
      byPath.has(path) ||
      !currentDocPaths.has(path)
    ) {
      return
    }

    const source = normalizeModuleValue(moduleValue)
    const title = titleFromMarkdown(source, path)
    const haystack = [path, title, source].join('\n')
    const keywordHits = countKeywordHits(haystack)
    const commandBlocks = extractDevTestingCommandBlocks(source, {
      sourcePath: path,
      title,
    })
    const category = classifyTestingDoc(path, source)
    const sourceLabel = devTestingSourceLabel(path, title)

    byPath.set(path, {
      key: path,
      path,
      sourceLabel,
      title,
      category,
      keywordHits,
      commandCount: commandBlocks.reduce(
        (total, block) => total + block.commands.length,
        0
      ),
      commandBlocks,
      source,
      searchText: [path, sourceLabel, title, category, source]
        .join(' ')
        .toLowerCase(),
    })
  })

  const pathOrder = new Map(
    DEV_TESTING_CURRENT_DOC_PATHS.map((path, index) => [path, index])
  )

  return [...byPath.values()].sort((left, right) => {
    const leftOrder = pathOrder.get(left.path) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = pathOrder.get(right.path) ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    if (left.category !== right.category) {
      return left.category.localeCompare(right.category, 'zh-Hans-CN')
    }
    if (left.keywordHits !== right.keywordHits) {
      return right.keywordHits - left.keywordHits
    }
    return left.path.localeCompare(right.path, 'zh-Hans-CN')
  })
}

export function getDevTestingCategoryOptions(docs = []) {
  return [
    { label: '全部', value: 'all' },
    ...[...new Set(docs.map((item) => item.category).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
      .map((category) => ({ label: category, value: category })),
  ]
}

export function filterDevTestingDocs(
  docs = [],
  { keyword = '', category = 'all' } = {}
) {
  const query = String(keyword || '')
    .trim()
    .toLowerCase()
  return docs.filter((item) => {
    if (category !== 'all' && item.category !== category) return false
    if (!query) return true
    return item.searchText.includes(query)
  })
}

export function resolveDevTestingSelectedDoc(docs = [], selectedKey = '') {
  return docs.find((item) => item.key === selectedKey) || docs[0] || null
}

export function buildDevTestingSummary({ tiers = [], docs = [] } = {}) {
  const commandCount = docs.reduce(
    (total, item) => total + item.commandCount,
    0
  )
  const docsWithCommands = docs.filter((item) => item.commandCount > 0).length
  const strategyDoc = docs.find(
    (item) => item.path === DEV_TESTING_STRATEGY_SOURCE_PATH
  )
  return {
    tierCount: tiers.length,
    docCount: docs.length,
    commandCount,
    docsWithCommands,
    strategyCommandCount: strategyDoc?.commandCount || 0,
  }
}
