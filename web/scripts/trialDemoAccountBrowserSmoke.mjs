import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'
import { loadDevPorts, resolveDevAuxPort } from '../../scripts/dev-ports.mjs'
import { yoyoosunMenuConfig } from '../../config/customers/yoyoosun/menuConfig.mjs'
import { yoyoosunRoleFlowMatrix } from '../../config/customers/yoyoosun/roleFlowMatrix.mjs'
import { businessModuleDefinitions } from '../src/erp/config/businessModules.mjs'
import { MAX_ROLE_PRIMARY_LIMIT } from '../src/erp/config/roleGuidedNavigation.mjs'
import { navigationItemRegistry } from '../src/erp/config/seedData.mjs'
import { getRoleDisplayName } from '../src/erp/utils/roleKeys.mjs'
import {
  buildYoyoosunLocalEntryAudit,
  defaultYoyoosunEntryAuditPorts,
} from './yoyoosunLocalEntryAudit.mjs'

const webDir = path.resolve(import.meta.dirname, '..')
const repoRoot = path.resolve(webDir, '..')
const devPorts = loadDevPorts(repoRoot)
const outputDir = path.resolve(
  webDir,
  'output',
  'playwright',
  'trial-demo-account-browser-smoke'
)
const trialCustomerConfigScriptPath = path.resolve(
  webDir,
  '..',
  'config',
  'customers',
  'yoyoosun',
  'customer-config.example.js'
)
const defaultRealSmokeReportPath =
  'output/trial-demo-account-browser-smoke/report.json'
const devServerPort = Number(
  process.env.TRIAL_BROWSER_SMOKE_PORT ||
    resolveDevAuxPort(devPorts, 30, 'trial browser smoke port')
)
const externalBaseURL = normalizeOptionalURL(
  process.env.TRIAL_BROWSER_SMOKE_BASE_URL
)
const baseURL =
  externalBaseURL || normalizeURL(`http://127.0.0.1:${devServerPort}`)
const backendHealthURL = normalizeURL(
  process.env.TRIAL_BROWSER_SMOKE_BACKEND_HEALTH_URL ||
    'http://127.0.0.1:8300/healthz'
)
const headless = process.env.TRIAL_BROWSER_SMOKE_HEADED !== '1'
const shouldCheckEffectiveSessionDiagnostic =
  process.env.TRIAL_BROWSER_SMOKE_EFFECTIVE_SESSION_DIAGNOSTIC !== 'off' &&
  (!externalBaseURL ||
    process.env.TRIAL_BROWSER_SMOKE_EXPECT_EFFECTIVE_SESSION_DIAGNOSTIC === '1')
const expectedConfigRevision = String(
  process.env.TRIAL_BROWSER_SMOKE_EXPECT_CONFIG_REVISION || ''
).trim()
const MAX_PAGE_READY_MS = 5_000

const oldEntryLabels = [
  '客户/供应商',
  '订单/款式立项',
  '产品',
  '材料 BOM',
  '辅材/包材采购',
  '加工合同/委外下单',
  '入库通知/检验/入库',
  '库存',
  '待出货/出货放行',
  '出库',
  '生产排单',
  '生产进度',
  '延期/返工/异常',
  '品质检验',
  '对账/结算',
  '待付款/应付提醒',
  '应收/开票登记',
  '异常处理',
  '开发与验收',
  '高级文档',
]

const menuLabelByKey = new Map([
  ...Object.values(navigationItemRegistry).map((item) => [
    item.key,
    item.label,
  ]),
  ...businessModuleDefinitions.map((item) => [item.key, item.label]),
])
const pageDefinitionByKey = new Map([
  ...Object.values(navigationItemRegistry).map((item) => [item.key, item]),
  ...businessModuleDefinitions.map((item) => [item.key, item]),
])
const authenticatedMenuLabels = Object.values(navigationItemRegistry)
  .filter((item) => item.access === 'authenticated')
  .map((item) => item.label)

function expectedMenusForRole(roleKey) {
  const profile = yoyoosunRoleFlowMatrix.roles.find(
    (item) => item.roleKey === roleKey
  )
  assert(profile, `missing yoyoosun role projection: ${roleKey}`)
  return profile.menuSurfaces
    .map((pageKey) => menuLabelByKey.get(pageKey))
    .filter(Boolean)
}

const desktopAccounts = [
  {
    username: 'demo_boss',
    expectedMenus: expectedMenusForRole('boss'),
    forbiddenMenus: ['权限管理'],
  },
  {
    username: 'demo_sales',
    expectedMenus: expectedMenusForRole('sales'),
    forbiddenMenus: ['权限管理'],
  },
  {
    username: 'demo_purchase',
    expectedMenus: expectedMenusForRole('purchase'),
    forbiddenMenus: ['权限管理'],
  },
  {
    username: 'demo_production',
    expectedMenus: expectedMenusForRole('production'),
    forbiddenMenus: ['权限管理'],
  },
  {
    username: 'demo_warehouse',
    expectedMenus: expectedMenusForRole('warehouse'),
    forbiddenMenus: ['权限管理'],
  },
  {
    username: 'demo_quality',
    expectedMenus: expectedMenusForRole('quality'),
    forbiddenMenus: ['权限管理'],
  },
  {
    username: 'demo_finance',
    expectedMenus: expectedMenusForRole('finance'),
    forbiddenMenus: ['权限管理'],
  },
  {
    username: 'demo_pmc',
    expectedMenus: expectedMenusForRole('pmc'),
    forbiddenMenus: ['权限管理'],
  },
  {
    username: 'demo_engineering',
    expectedMenus: expectedMenusForRole('engineering'),
    forbiddenMenus: ['权限管理'],
  },
  {
    username: 'demo_admin',
    expectedMenus: ['权限管理', '系统操作记录'],
    forbiddenMenus: [
      '工作台',
      '任务看板',
      '业务看板',
      '客户档案',
      '供应商与加工厂',
      '销售订单',
      '采购订单',
      '模板打印中心',
      '出货放行',
      '生产异常处置',
    ],
  },
]

const mobileAccounts = [
  ['demo_boss', 'boss'],
  ['demo_sales', 'sales'],
  ['demo_purchase', 'purchase'],
  ['demo_production', 'production'],
  ['demo_warehouse', 'warehouse'],
  ['demo_quality', 'quality'],
  ['demo_finance', 'finance'],
  ['demo_pmc', 'pmc'],
  ['demo_engineering', 'engineering'],
]

const hiddenCustomerMenuLabels = (
  yoyoosunMenuConfig.desktopMenu?.hiddenItemKeys || []
)
  .map((key) => menuLabelByKey.get(key))
  .filter(Boolean)
const hiddenCustomerMenuLabelSet = new Set(hiddenCustomerMenuLabels)
const visibleCustomerMenuLabelSet = new Set(
  (yoyoosunMenuConfig.desktopMenu?.sections || [])
    .flatMap((section) => section.items || [])
    .filter((key) => !hiddenCustomerMenuLabelSet.has(menuLabelByKey.get(key)))
    .map((key) => menuLabelByKey.get(key))
    .filter(Boolean)
)
const formalCustomerPageKeys = uniqueStrings(
  (yoyoosunMenuConfig.desktopMenu?.sections || []).flatMap(
    (section) => section.items || []
  )
).filter((key) => !hiddenCustomerMenuLabelSet.has(menuLabelByKey.get(key)))

function pageRouteTarget(pageKey) {
  const definition = pageDefinitionByKey.get(pageKey)
  assert(definition?.path, `missing formal page path: ${pageKey}`)
  return {
    key: pageKey,
    label: definition.label,
    title: definition.title || definition.label,
    path: definition.path,
  }
}

function buildRoleRouteAccessPlan() {
  return yoyoosunRoleFlowMatrix.roles.map((profile) => {
    const allowedKeySet = new Set(profile.menuSurfaces)
    return {
      roleKey: profile.roleKey,
      username: `demo_${profile.roleKey}`,
      allowedPages: profile.menuSurfaces.map(pageRouteTarget),
      forbiddenPages: formalCustomerPageKeys
        .filter((pageKey) => !allowedKeySet.has(pageKey))
        .map(pageRouteTarget),
    }
  })
}

const roleRouteAccessPlan = buildRoleRouteAccessPlan()
const roleRouteAccessByUsername = new Map(
  roleRouteAccessPlan.map((entry) => [entry.username, entry])
)
const forbiddenLegacyMenuLabels = oldEntryLabels.filter(
  (label) => !visibleCustomerMenuLabelSet.has(label)
)
const realSmokeRequires = Object.freeze([
  'backend health is reachable',
  'TRIAL_ACCOUNT_PASSWORD or ERP_ROLE_DEMO_PASSWORD is present',
  'audited yoyoosun frontend runtime is available',
  'customer config script exists for managed Vite smoke',
  'static menu projection plan is complete',
])
const browserSmokeNotProven = Object.freeze([
  'real browser login',
  'backend RBAC authorization',
  'ordinary account desktop menu projection',
  'mobile task entry access',
  'demo_admin mobile denial',
  'DEV-only effective session diagnostic readback',
  'customer config active revision source',
  'target environment release evidence',
])

let devServerProcess = null
let devServerLogs = ''

function normalizeOptionalURL(raw) {
  const text = String(raw || '').trim()
  return text ? normalizeURL(text) : ''
}

function normalizeURL(raw) {
  const url = new URL(raw)
  if (url.username || url.password) {
    throw new Error('URL must not contain username or password')
  }
  return url.toString().replace(/\/+$/u, '')
}

function getTrialRoleLabel(roleKey) {
  return getRoleDisplayName(roleKey, '岗位')
}

function buildMobileTaskEntryLabel(roleKey) {
  return `${getTrialRoleLabel(roleKey)}岗位任务端`
}

function buildMobileAccountSummary([username, roleKey], verifiedMobile = []) {
  const summary = {
    username,
    role: getTrialRoleLabel(roleKey),
    mobileTaskEntry: buildMobileTaskEntryLabel(roleKey),
  }
  if (verifiedMobile) {
    summary.verified = verifiedMobile.includes(`${username}:${roleKey}`)
  }
  return summary
}

function buildMobileDeniedAccountSummary({ verified } = {}) {
  return {
    username: 'demo_admin',
    role: getTrialRoleLabel('sales'),
    mobileTaskEntry: buildMobileTaskEntryLabel('sales'),
    expectedDenied: true,
    ...(verified === undefined ? {} : { verified }),
    expectedPath: '/entry',
    expectedReason: 'mobile-role-unassigned',
    expectedMessage: '当前账号未分配业务岗位',
    expectedDescription:
      '手机待办只向明确分配的业务岗位开放。您可以进入电脑端后台，或联系管理员分配业务岗位。',
  }
}

const usage = `用法:
  TRIAL_ACCOUNT_PASSWORD='replace-with-password' pnpm --dir web smoke:trial-demo-browser
  node web/scripts/trialDemoAccountBrowserSmoke.mjs --print-input-template
  node web/scripts/trialDemoAccountBrowserSmoke.mjs --preflight-report output/trial-demo-account-browser-smoke/preflight.json
  TRIAL_ACCOUNT_PASSWORD='replace-with-password' node web/scripts/trialDemoAccountBrowserSmoke.mjs --report ${defaultRealSmokeReportPath}

环境变量:
  TRIAL_ACCOUNT_PASSWORD                 试用 / 演示账号密码；优先级高于 ERP_ROLE_DEMO_PASSWORD
  ERP_ROLE_DEMO_PASSWORD                 兼容 scripts/seed-role-demo-admins.sh 的密码来源
  TRIAL_BROWSER_SMOKE_BASE_URL           已启动前端地址；不设置时脚本自动启动 Vite
  TRIAL_BROWSER_SMOKE_BACKEND_HEALTH_URL 后端健康检查地址，默认 ${backendHealthURL}
  TRIAL_BROWSER_SMOKE_HEADED=1           使用 headed 浏览器
  TRIAL_BROWSER_SMOKE_EFFECTIVE_SESSION_DIAGNOSTIC=off
                                           跳过 DEV-only effective session 脱敏诊断读取
  TRIAL_BROWSER_SMOKE_EXPECT_EFFECTIVE_SESSION_DIAGNOSTIC=1
                                           已提供外部 Vite DEV 地址时强制读取诊断
`

function buildInputTemplate() {
  const menuProjectionPlan = buildMenuProjectionPlan()
  const menuProjectionCoverage = buildMenuProjectionCoverage(menuProjectionPlan)
  const routeAccessPlan = buildRouteAccessPlanSummary()
  const effectiveSessionDiagnosticPlan = buildEffectiveSessionDiagnosticPlan()
  const yoyoosunEntryAuditPlan = buildYoyoosunEntryAuditPlan()
  return {
    scope: 'trial-demo-account-browser-smoke-input-template',
    writesDatabase: false,
    callsBackend: false,
    startsBrowser: false,
    startsDevServer: false,
    readsCustomerConfigScript: false,
    downstreamCallsBackend: true,
    downstreamStartsBrowser: true,
    downstreamStartsDevServer: true,
    downstreamReadsCustomerConfigScript: true,
    secretInputs: ['TRIAL_ACCOUNT_PASSWORD or ERP_ROLE_DEMO_PASSWORD'],
    optionalInputs: [
      'TRIAL_BROWSER_SMOKE_BASE_URL',
      'TRIAL_BROWSER_SMOKE_BACKEND_HEALTH_URL',
      'TRIAL_BROWSER_SMOKE_HEADED',
      'TRIAL_BROWSER_SMOKE_PORT',
    ],
    defaultBaseURL: `http://127.0.0.1:${devServerPort}`,
    defaultBackendHealthURL: 'http://127.0.0.1:8300/healthz',
    desktopAccounts: desktopAccounts.map((account) => ({
      username: account.username,
      expectedMenus: account.expectedMenus,
      forbiddenMenus: account.forbiddenMenus,
    })),
    mobileAccounts: mobileAccounts.map((account) =>
      buildMobileAccountSummary(account, null)
    ),
    menuProjectionPlan,
    menuProjectionCoverage,
    routeAccessPlan,
    effectiveSessionDiagnosticPlan,
    yoyoosunEntryAuditPlan,
    realSmokeRequires: [...realSmokeRequires],
    notProvenByThisTemplate: [...browserSmokeNotProven],
    commands: [
      'PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web --silent audit:yoyoosun-entry -- --json',
      'PATH=/usr/local/bin:$PATH node web/scripts/trialDemoAccountBrowserSmoke.mjs --preflight-report output/trial-demo-account-browser-smoke/preflight.json',
      "TRIAL_ACCOUNT_PASSWORD='<local-demo-password>' PATH=/usr/local/bin:$PATH pnpm --dir web smoke:trial-demo-browser",
      `TRIAL_ACCOUNT_PASSWORD='<local-demo-password>' PATH=/usr/local/bin:$PATH node web/scripts/trialDemoAccountBrowserSmoke.mjs --report ${defaultRealSmokeReportPath}`,
      "TRIAL_ACCOUNT_PASSWORD='<local-demo-password>' TRIAL_BROWSER_SMOKE_BASE_URL='<audited-yoyoosun-url>' PATH=/usr/local/bin:$PATH pnpm --dir web smoke:trial-demo-browser",
    ],
    boundary:
      'This template does not prove browser login, menu projection, mobile task access, backend health, yoyoosun entry ownership, effective session diagnostic readback, or customer config active revision until a local backend, audited yoyoosun frontend runtime, and demo password are provided.',
  }
}

function buildMenuProjectionPlan() {
  return {
    desktopAccounts: desktopAccounts.map((account) => ({
      username: account.username,
      configuredExpectedMenus: account.expectedMenus,
      visibleExpectedMenus: visibleCustomerMenuLabels(account.expectedMenus),
      forbiddenMenus: uniqueStrings([
        ...(account.forbiddenMenus || []),
        ...hiddenCustomerMenuLabels,
        ...forbiddenLegacyMenuLabels,
      ]),
    })),
    mobileAccounts: mobileAccounts.map((account) =>
      buildMobileAccountSummary(account, null)
    ),
    mobileDeniedAccounts: [buildMobileDeniedAccountSummary()],
    customerHiddenMenuLabels: hiddenCustomerMenuLabels,
    forbiddenLegacyMenuLabels,
  }
}

function buildRouteAccessPlanSummary() {
  return {
    formalPageCount: formalCustomerPageKeys.length,
    accountCount: roleRouteAccessPlan.length,
    accounts: roleRouteAccessPlan.map((entry) => ({
      username: entry.username,
      allowedPages: entry.allowedPages.map((page) => ({ ...page })),
      forbiddenPages: entry.forbiddenPages.map((page) => ({ ...page })),
    })),
    boundary:
      'Every allowed role menu surface is opened through its visible menu item. Every other formal yoyoosun customer page is requested directly and must redirect to an allowed role page or the authenticated help page before it can be used.',
  }
}

function buildMenuProjectionCoverage(plan = buildMenuProjectionPlan()) {
  const adminDesktop = plan.desktopAccounts.find(
    (account) => account.username === 'demo_admin'
  )
  const bossDesktop = plan.desktopAccounts.find(
    (account) => account.username === 'demo_boss'
  )
  const warehouseDesktop = plan.desktopAccounts.find(
    (account) => account.username === 'demo_warehouse'
  )
  const financeDesktop = plan.desktopAccounts.find(
    (account) => account.username === 'demo_finance'
  )
  const productionDesktop = plan.desktopAccounts.find(
    (account) => account.username === 'demo_production'
  )
  const blockers = []
  const checks = {
    desktopAccountCount: plan.desktopAccounts.length,
    mobileAccountCount: plan.mobileAccounts.length,
    mobileDeniedAccountCount: plan.mobileDeniedAccounts.length,
    customerHiddenMenuCount: plan.customerHiddenMenuLabels.length,
    forbiddenLegacyMenuCount: plan.forbiddenLegacyMenuLabels.length,
    coversAllDesktopAccounts: plan.desktopAccounts.length === 10,
    coversAllMobileAccounts: plan.mobileAccounts.length === 9,
    coversAdminDesktopPermissionCenter:
      adminDesktop?.visibleExpectedMenus.length === 2 &&
      ['权限管理', '系统操作记录'].every((label) =>
        adminDesktop.visibleExpectedMenus.includes(label)
      ),
    coversAdminBusinessMenuDenial: [
      '工作台',
      '任务看板',
      '业务看板',
      '销售订单',
      '采购订单',
      '模板打印中心',
    ].every((label) => adminDesktop?.forbiddenMenus.includes(label)),
    coversMobileDeniedAdmin: plan.mobileDeniedAccounts.some(
      (account) =>
        account.username === 'demo_admin' &&
        account.role === getTrialRoleLabel('sales') &&
        account.mobileTaskEntry === buildMobileTaskEntryLabel('sales') &&
        account.expectedPath === '/entry' &&
        account.expectedReason === 'mobile-role-unassigned' &&
        account.expectedMessage === '当前账号未分配业务岗位'
    ),
    coversFormalCustomerPageProjection:
      plan.customerHiddenMenuLabels.length === 0 &&
      bossDesktop?.visibleExpectedMenus.includes('业务看板') &&
      !warehouseDesktop?.visibleExpectedMenus.includes('出货放行') &&
      financeDesktop?.visibleExpectedMenus.includes('出货放行') &&
      productionDesktop?.visibleExpectedMenus.includes('生产异常处置') &&
      ['业务看板', '出货放行', '生产异常处置', '异常处理'].every((label) =>
        adminDesktop?.forbiddenMenus.includes(label)
      ),
    coversLegacyMenuCleanup:
      plan.forbiddenLegacyMenuLabels.length > 0 &&
      plan.desktopAccounts.every((account) =>
        plan.forbiddenLegacyMenuLabels.every((label) =>
          account.forbiddenMenus.includes(label)
        )
      ),
    allDesktopAccountsHaveExpectedMenus: plan.desktopAccounts.every(
      (account) => account.visibleExpectedMenus.length > 0
    ),
    allDesktopAccountsHaveForbiddenMenus: plan.desktopAccounts.every(
      (account) => account.forbiddenMenus.length > 0
    ),
    allMobileAccountsHaveEntries: plan.mobileAccounts.every((account) =>
      Boolean(account.role && account.mobileTaskEntry)
    ),
  }
  for (const [key, passed] of Object.entries(checks)) {
    if (typeof passed === 'boolean' && !passed) {
      blockers.push(key)
    }
  }
  return {
    ok: blockers.length === 0,
    blockers,
    ...checks,
  }
}

function buildEffectiveSessionDiagnosticPlan() {
  return {
    windowKey: '__PLUSH_ERP_EFFECTIVE_SESSION_DIAGNOSTIC__',
    scope: 'local-dev-browser-runtime',
    checkedDuringRealSmoke: shouldCheckEffectiveSessionDiagnostic,
    realSmokeReportPath: defaultRealSmokeReportPath,
    desktopOnly: true,
    expectedForManagedVite: true,
    expectedForExternalBaseURL:
      process.env.TRIAL_BROWSER_SMOKE_EXPECT_EFFECTIVE_SESSION_DIAGNOSTIC ===
      '1',
    requiredFields: [
      'source',
      'projectionMode',
      'isSuperAdmin',
      'isLocalDev',
      'counts',
      'blockers',
    ],
    sanitizedOnly: true,
    forbiddenFields: [
      'accessToken',
      'authorizationHeader',
      'configHash',
      'config_hash',
      'rawId',
      'entitlement',
      'password',
      'token',
    ],
    acceptedProjectionModes: ['local_dev_customer_config_diagnostic'],
    boundary:
      'The real browser smoke reads only the DEV-only sanitized summary after login. It must not store tokens, Authorization headers, config hashes, raw IDs, action lists, or customer package payloads.',
  }
}

function buildYoyoosunEntryAuditPlan() {
  return {
    command:
      'PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web --silent audit:yoyoosun-entry -- --json',
    scope: 'local-frontend-entry-preflight',
    requiredForExternalBaseURL: true,
    defaultPorts: [...defaultYoyoosunEntryAuditPorts],
    expectedCustomerConfigStatus: 'yoyoosun_config',
    expectedCustomerAssetStatus: 'yoyoosun_asset',
    externalBaseURL,
    boundary:
      'The browser smoke preflight must not treat Product Core placeholder, HTML fallback, or another project port as a yoyoosun trial frontend.',
  }
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))]
}

function parseCliArgs(argv) {
  const options = {
    help: false,
    printInputTemplate: false,
    preflightReport: '',
    report: '',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '-h' || token === '--help') {
      options.help = true
      continue
    }
    if (token === '--print-input-template') {
      options.printInputTemplate = true
      continue
    }
    const equalIndex = token.indexOf('=')
    const key = token.slice(2, equalIndex === -1 ? undefined : equalIndex)
    const inlineValue =
      equalIndex === -1 ? undefined : token.slice(equalIndex + 1)
    const value = inlineValue ?? argv[index + 1]
    if (!token.startsWith('--')) {
      throw new Error(`不支持的参数: ${token}`)
    }
    if (inlineValue === undefined) {
      index += 1
    }
    if (value === undefined || String(value).startsWith('--')) {
      throw new Error(`参数 --${key} 缺少值`)
    }
    if (key === 'preflight-report') {
      options.preflightReport = resolveRepoOutputPath(
        value,
        '--preflight-report'
      )
      continue
    }
    if (key === 'report') {
      options.report = resolveRepoOutputPath(value, '--report')
      continue
    }
    throw new Error(`不支持的参数: --${key}`)
  }
  return options
}

function resolveRepoOutputPath(raw, optionName) {
  const value = String(raw || '').trim()
  if (!value) {
    throw new Error(`参数 ${optionName} 缺少值`)
  }
  const resolved = path.resolve(repoRoot, value)
  const relative = path.relative(repoRoot, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${optionName} must stay inside the repository`)
  }
  return resolved
}

async function probeURL(url, { timeoutMs = 3000 } = {}) {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
    })
    return {
      ok: response.ok || response.status === 302 || response.status === 304,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      error: '',
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      elapsedMs: Date.now() - startedAt,
      error:
        error?.name === 'AbortError'
          ? 'timeout'
          : String(error?.message || error),
    }
  } finally {
    clearTimeout(timer)
  }
}

async function buildPreflightReport(runtime = {}) {
  const menuProjectionPlan = buildMenuProjectionPlan()
  const menuProjectionCoverage = buildMenuProjectionCoverage(menuProjectionPlan)
  const effectiveSessionDiagnosticPlan = buildEffectiveSessionDiagnosticPlan()
  const yoyoosunEntryAuditPlan = buildYoyoosunEntryAuditPlan()
  const passwordEnvNames = ['TRIAL_ACCOUNT_PASSWORD', 'ERP_ROLE_DEMO_PASSWORD']
  const presentPasswordEnvNames = passwordEnvNames.filter((name) =>
    Boolean(String(process.env[name] || '').trim())
  )
  const backendHealth = await probeURL(backendHealthURL)
  const yoyoosunEntryAudit = await buildTrialYoyoosunEntryAudit(runtime)
  const suggestedRealSmokeCommand = [
    "TRIAL_ACCOUNT_PASSWORD='<local-demo-password>'",
    yoyoosunEntryAudit.suggestedExternalBaseURL
      ? `TRIAL_BROWSER_SMOKE_BASE_URL='${yoyoosunEntryAudit.suggestedExternalBaseURL}'`
      : '',
    'PATH=/usr/local/bin:$PATH',
    'node web/scripts/trialDemoAccountBrowserSmoke.mjs',
    `--report ${defaultRealSmokeReportPath}`,
  ]
    .filter(Boolean)
    .join(' ')
  const customerConfigScript = await fs
    .stat(trialCustomerConfigScriptPath)
    .then((stat) => ({
      path: path.relative(repoRoot, trialCustomerConfigScriptPath),
      exists: stat.isFile(),
      size: stat.size,
    }))
    .catch((error) => ({
      path: path.relative(repoRoot, trialCustomerConfigScriptPath),
      exists: false,
      size: 0,
      error: String(error?.message || error),
    }))
  const blockers = []
  if (presentPasswordEnvNames.length === 0) {
    blockers.push('missing-demo-password-env')
  }
  if (!backendHealth.ok) {
    blockers.push('backend-health-unreachable')
  }
  if (!customerConfigScript.exists) {
    blockers.push('missing-trial-customer-config-script')
  }
  if (!menuProjectionCoverage.ok) {
    blockers.push('menu-projection-plan-incomplete')
  }
  if (!yoyoosunEntryAudit.externalBaseURLMatchesYoyoosun) {
    blockers.push('external-base-url-not-yoyoosun-entry')
  }

  return {
    scope: 'trial-demo-account-browser-smoke-preflight-report',
    generatedAt: new Date().toISOString(),
    preflightOnly: true,
    writesDatabase: false,
    callsJSONRPC: false,
    startsBrowser: false,
    startsDevServer: false,
    readsCustomerConfigScript: false,
    readsPasswordValue: false,
    storesPasswordValue: false,
    storesAccessToken: false,
    storesAuthorizationHeader: false,
    storesRawCustomerPackage: false,
    storesActionList: false,
    backendHealthURL,
    backendHealth,
    baseURL,
    needsManagedDevServer: !externalBaseURL,
    passwordEnvPresent: presentPasswordEnvNames.length > 0,
    presentPasswordEnvNames,
    desktopAccountCount: desktopAccounts.length,
    mobileAccountCount: mobileAccounts.length,
    menuProjectionPlan,
    menuProjectionCoverage,
    effectiveSessionDiagnosticPlan,
    yoyoosunEntryAuditPlan,
    yoyoosunEntryAudit,
    customerConfigScript,
    realSmokeRequires: [...realSmokeRequires],
    notProvenByThisPreflight: [...browserSmokeNotProven],
    suggestedRealSmokeCommand,
    readyForRealSmoke: blockers.length === 0,
    blockers,
    nextCommand: blockers.length
      ? 'Resolve blockers, then rerun this preflight before real browser smoke.'
      : suggestedRealSmokeCommand,
  }
}

async function buildTrialYoyoosunEntryAudit(runtime = {}) {
  const auditedPorts = externalBaseURL
    ? [getPortFromURL(externalBaseURL)]
    : buildYoyoosunEntryAuditPlan().defaultPorts
  const report = await buildYoyoosunLocalEntryAudit(
    {
      customer: 'yoyoosun',
      ports: auditedPorts,
      backendHealthURL,
    },
    runtime
  )
  const externalPort = externalBaseURL ? getPortFromURL(externalBaseURL) : ''
  const externalPortReport = externalPort
    ? report.ports.find((item) => item.port === externalPort) || null
    : null
  const auditedYoyoosunURLs = report.summary.yoyoosunPorts.map(
    (port) => `http://localhost:${port}/erp`
  )

  return {
    scope: 'trial-demo-account-yoyoosun-entry-preflight',
    readOnly: true,
    callsJSONRPC: false,
    writesDatabase: false,
    startsBrowser: false,
    startsDevServer: false,
    readsSecrets: false,
    externalBaseURL: externalBaseURL || '',
    externalPort,
    checkedPorts: report.summary.checkedPorts,
    yoyoosunPorts: report.summary.yoyoosunPorts,
    auditedYoyoosunURLs,
    suggestedExternalBaseURL: externalBaseURL || auditedYoyoosunURLs[0] || '',
    productCorePlaceholderPorts: report.summary.productCorePlaceholderPorts,
    htmlFallbackPorts: report.summary.htmlFallbackPorts,
    readyForStaticYoyoosunPreview: report.summary.readyForStaticYoyoosunPreview,
    externalBaseURLMatchesYoyoosun:
      !externalBaseURL ||
      Boolean(
        externalPortReport?.customerConfig?.matchedCustomer &&
          externalPortReport?.customerAsset?.matchedCustomerAsset
      ),
    externalPortStatus: externalPortReport
      ? {
          config: externalPortReport.customerConfig.status,
          asset: externalPortReport.customerAsset.status,
          cwd: externalPortReport.process.cwd || '',
          command: externalPortReport.process.command || '',
        }
      : null,
    notProvenByThisAudit: report.notProvenByThisAudit,
  }
}

function getPortFromURL(rawURL) {
  const url = new URL(rawURL)
  if (url.port) return url.port
  return url.protocol === 'https:' ? '443' : '80'
}

function buildRealSmokeReport({
  verifiedDesktop,
  verifiedMobile,
  desktopEffectiveSessionDiagnostics,
  legalNoticeChecks,
  pagePerformance = [],
}) {
  const diagnosticBlockers = desktopEffectiveSessionDiagnostics.flatMap(
    (entry) => entry.diagnostic.blockers || []
  )
  const pagePerformanceSummary = summarizePagePerformance(pagePerformance)
  const pagePerformanceAcceptance = evaluatePagePerformanceAcceptance(
    pagePerformanceSummary
  )
  return {
    scope: 'trial-demo-account-browser-smoke-report',
    generatedAt: new Date().toISOString(),
    writesDatabase: true,
    writesBusinessData: false,
    authenticationSessionWritesExpected: true,
    legalNoticeAcknowledgementWritesPossible: true,
    callsJSONRPC: true,
    startsBrowser: true,
    startsDevServer: !externalBaseURL,
    managedDevServer: !externalBaseURL,
    readsCustomerConfigScript: true,
    readsEffectiveSessionDiagnostic: shouldCheckEffectiveSessionDiagnostic,
    storesPasswordValue: false,
    storesAccessToken: false,
    storesAuthorizationHeader: false,
    storesRawCustomerPackage: false,
    storesActionList: false,
    baseURL,
    backendHealthURL,
    desktopAccounts: desktopAccounts.map((account) => ({
      username: account.username,
      expectedMenuCount: visibleCustomerMenuLabels(account.expectedMenus)
        .length,
      forbiddenMenuCount:
        (account.forbiddenMenus || []).length +
        hiddenCustomerMenuLabels.length +
        forbiddenLegacyMenuLabels.length,
      verified: verifiedDesktop.includes(account.username),
      ...(roleRouteAccessByUsername.has(account.username)
        ? {
            allowedPageCount: roleRouteAccessByUsername.get(account.username)
              .allowedPages.length,
            forbiddenDirectRouteCount: roleRouteAccessByUsername.get(
              account.username
            ).forbiddenPages.length,
          }
        : {}),
    })),
    mobileAccounts: mobileAccounts.map((account) =>
      buildMobileAccountSummary(account, verifiedMobile)
    ),
    mobileDeniedAccount: buildMobileDeniedAccountSummary({ verified: true }),
    desktopEffectiveSessionDiagnostics,
    legalNoticeChecks,
    pagePerformance,
    pagePerformanceSummary,
    pagePerformanceAcceptance,
    summary: {
      desktopPassedCount: verifiedDesktop.length,
      mobilePassedCount: verifiedMobile.length,
      mobileDeniedPassed: true,
      diagnosticAccountCount: desktopEffectiveSessionDiagnostics.length,
      diagnosticBlockerCount: diagnosticBlockers.length,
      diagnosticSources: uniqueStrings(
        desktopEffectiveSessionDiagnostics.map(
          (entry) => entry.diagnostic.source
        )
      ),
      projectionModes: uniqueStrings(
        desktopEffectiveSessionDiagnostics.map(
          (entry) => entry.diagnostic.projectionMode
        )
      ),
      legalNoticeCheckCount: legalNoticeChecks.length,
      legalNoticeAcknowledgedDuringSmokeCount: legalNoticeChecks.filter(
        (entry) => entry.status === 'acknowledged_during_smoke'
      ).length,
    },
    boundaries: {
      realCustomerImport: false,
      customerConfigPublish: false,
      customerConfigActivate: false,
      releaseEvidence: false,
      productionDeploy: false,
      provesTargetEnvironment: false,
    },
  }
}

export function evaluatePagePerformanceAcceptance(summary = {}) {
  const failures = []
  if (!Number.isSafeInteger(summary.sampleCount) || summary.sampleCount <= 0) {
    failures.push('missing-page-performance-samples')
  }
  if (Number(summary.totalSemanticDuplicateRequestCount) !== 0) {
    failures.push('semantic-duplicate-rpc-requests')
  }
  if (Number(summary.totalFailedRpcRequestCount) !== 0) {
    failures.push('failed-rpc-requests')
  }
  if (Number(summary.totalUnsettledRpcRequestCount) !== 0) {
    failures.push('unsettled-rpc-requests')
  }
  if (Number(summary.maxElapsedMs) > MAX_PAGE_READY_MS) {
    failures.push('page-ready-time-exceeded')
  }
  return {
    passed: failures.length === 0,
    maxPageReadyMs: MAX_PAGE_READY_MS,
    requiresZeroSemanticDuplicateRequests: true,
    requiresZeroFailedRequests: true,
    requiresZeroUnsettledRequests: true,
    failures,
  }
}

export function summarizePagePerformance(rows = []) {
  const normalized = rows
    .map((row) => ({
      ...row,
      elapsedMs: Number(row.elapsedMs) || 0,
      rpcRequestCount: Number(row.rpcRequestCount) || 0,
      semanticDuplicateRequestCount:
        Number(row.semanticDuplicateRequestCount) || 0,
      abortedRpcRequestCount: Number(row.abortedRpcRequestCount) || 0,
      failedRpcRequestCount: Number(row.failedRpcRequestCount) || 0,
      unsettledRpcRequestCount: Number(row.unsettledRpcRequestCount) || 0,
    }))
    .sort((left, right) => left.elapsedMs - right.elapsedMs)
  const percentile = (ratio) => {
    if (normalized.length === 0) return 0
    const index = Math.max(0, Math.ceil(normalized.length * ratio) - 1)
    return normalized[index].elapsedMs
  }
  const slowest = [...normalized]
    .sort((left, right) => right.elapsedMs - left.elapsedMs)
    .slice(0, 10)
    .map(({ username, label, path, elapsedMs, rpcRequestCount }) => ({
      username,
      label,
      path,
      elapsedMs,
      rpcRequestCount,
    }))
  return {
    sampleCount: normalized.length,
    p50ElapsedMs: percentile(0.5),
    p95ElapsedMs: percentile(0.95),
    maxElapsedMs: normalized.at(-1)?.elapsedMs || 0,
    totalRpcRequestCount: normalized.reduce(
      (total, row) => total + row.rpcRequestCount,
      0
    ),
    maxRpcRequestCount: normalized.reduce(
      (maximum, row) => Math.max(maximum, row.rpcRequestCount),
      0
    ),
    totalSemanticDuplicateRequestCount: normalized.reduce(
      (total, row) => total + row.semanticDuplicateRequestCount,
      0
    ),
    totalAbortedRpcRequestCount: normalized.reduce(
      (total, row) => total + row.abortedRpcRequestCount,
      0
    ),
    totalFailedRpcRequestCount: normalized.reduce(
      (total, row) => total + row.failedRpcRequestCount,
      0
    ),
    totalUnsettledRpcRequestCount: normalized.reduce(
      (total, row) => total + row.unsettledRpcRequestCount,
      0
    ),
    slowest,
  }
}

function createPageRequestTracker() {
  let active = null
  const isRPCRequest = (request) => {
    try {
      return (
        request.method() === 'POST' &&
        new URL(request.url()).pathname.startsWith('/rpc/')
      )
    } catch {
      return false
    }
  }
  const requestMethod = (request) => {
    try {
      const domain = new URL(request.url()).pathname
        .replace(/^\/rpc\//u, '')
        .split('/')[0]
      const method = String(request.postDataJSON()?.method || '').trim()
      return domain && method ? `${domain}.${method}` : domain || 'unknown'
    } catch {
      return 'unknown'
    }
  }
  const requestFingerprint = (request) => {
    let normalizedBody = request.postData() || ''
    try {
      const payload = request.postDataJSON()
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        const normalizedPayload = { ...payload }
        delete normalizedPayload.id
        normalizedBody = JSON.stringify(normalizedPayload)
      }
    } catch {
      // Keep the raw body only for the in-memory digest when JSON parsing fails.
    }
    return createHash('sha256')
      .update(`${requestMethod(request)}\n${normalizedBody}`)
      .digest('hex')
  }
  return {
    begin(meta) {
      assert.equal(active, null, '页面性能采样不能重叠')
      active = {
        ...meta,
        startedAt: Date.now(),
        rpcMethods: [],
        requestFingerprints: [],
        requests: new Set(),
        pendingRequests: new Set(),
        lastRequestAt: Date.now(),
        completedRpcRequestCount: 0,
        abortedRpcRequestCount: 0,
        failedRpcRequestCount: 0,
      }
    },
    record(request) {
      if (!active || !isRPCRequest(request)) return
      active.rpcMethods.push(requestMethod(request))
      active.requestFingerprints.push(requestFingerprint(request))
      active.requests.add(request)
      active.pendingRequests.add(request)
      active.lastRequestAt = Date.now()
    },
    recordFailure(request) {
      if (!active || !active.requests.has(request)) return
      active.pendingRequests.delete(request)
      if (request.failure()?.errorText === 'net::ERR_ABORTED') {
        active.abortedRpcRequestCount += 1
        return
      }
      active.failedRpcRequestCount += 1
    },
    recordResponse(response) {
      if (!active || !active.requests.has(response.request())) return
      active.pendingRequests.delete(response.request())
      active.completedRpcRequestCount += 1
      if (response.status() >= 400) {
        active.failedRpcRequestCount += 1
      }
    },
    async finish() {
      assert(active, '页面性能采样尚未开始')
      const deadline = Date.now() + 5_000
      while (
        Date.now() < deadline &&
        (active.pendingRequests.size > 0 ||
          Date.now() - active.lastRequestAt < 100)
      ) {
        await delay(20)
      }
      const fingerprints = active.requestFingerprints
      const rpcMethodCounts = Object.fromEntries(
        uniqueStrings(active.rpcMethods)
          .sort()
          .map((method) => [
            method,
            active.rpcMethods.filter((candidate) => candidate === method)
              .length,
          ])
      )
      const result = {
        username: active.username,
        label: active.label,
        path: active.path,
        elapsedMs: Date.now() - active.startedAt,
        rpcRequestCount: fingerprints.length,
        completedRpcRequestCount: active.completedRpcRequestCount,
        semanticDuplicateRequestCount:
          fingerprints.length - new Set(fingerprints).size,
        abortedRpcRequestCount: active.abortedRpcRequestCount,
        failedRpcRequestCount: active.failedRpcRequestCount,
        unsettledRpcRequestCount: active.pendingRequests.size,
        rpcMethods: Object.keys(rpcMethodCounts),
        rpcMethodCounts,
      }
      active = null
      return result
    },
  }
}

async function writeJSONReport(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`)
}

function readDemoPassword() {
  return String(
    process.env.TRIAL_ACCOUNT_PASSWORD ||
      process.env.ERP_ROLE_DEMO_PASSWORD ||
      ''
  ).trim()
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(`${usage}\n`)
    return
  }
  if (args.printInputTemplate) {
    process.stdout.write(`${JSON.stringify(buildInputTemplate(), null, 2)}\n`)
    return
  }
  if (args.preflightReport) {
    const report = await buildPreflightReport()
    await writeJSONReport(args.preflightReport, report)
    process.stdout.write(
      `[trial-demo-account-browser-smoke] preflight report written: ${path.relative(
        repoRoot,
        args.preflightReport
      )} ready=${report.readyForRealSmoke}\n`
    )
    return
  }
  if (!readDemoPassword()) {
    throw new Error(
      '缺少账号密码：请设置 TRIAL_ACCOUNT_PASSWORD 或 ERP_ROLE_DEMO_PASSWORD'
    )
  }

  await fs.mkdir(outputDir, { recursive: true })
  await ensureBackendReady()
  if (!externalBaseURL) {
    devServerProcess = startDevServer()
    await waitForServer(baseURL)
  }

  const browser = await chromium.launch({ headless })
  const verifiedDesktop = []
  const verifiedMobile = []
  const desktopEffectiveSessionDiagnostics = []
  const legalNoticeChecks = []
  const pagePerformance = []
  try {
    for (const account of desktopAccounts) {
      const {
        diagnostic,
        legalNotice,
        pagePerformance: accountPerformance,
      } = await verifyDesktopAccount(browser, account)
      pagePerformance.push(...accountPerformance)
      verifiedDesktop.push(account.username)
      legalNoticeChecks.push({
        username: account.username,
        surface: 'desktop',
        status: legalNotice,
      })
      if (diagnostic) {
        desktopEffectiveSessionDiagnostics.push({
          username: account.username,
          diagnostic,
        })
      }
    }
    for (const [username, roleKey] of mobileAccounts) {
      const legalNotice = await verifyMobileAccount(browser, {
        username,
        roleKey,
      })
      verifiedMobile.push(`${username}:${roleKey}`)
      legalNoticeChecks.push({
        username,
        surface: 'mobile',
        status: legalNotice,
      })
    }
    legalNoticeChecks.push({
      username: 'demo_admin',
      surface: 'mobile-denied',
      status: await verifyMobileDeniedAccount(browser),
    })
  } finally {
    await browser.close()
    await stopDevServer()
  }

  const report = buildRealSmokeReport({
    verifiedDesktop,
    verifiedMobile,
    desktopEffectiveSessionDiagnostics,
    legalNoticeChecks,
    pagePerformance,
  })
  if (args.report) {
    await writeJSONReport(args.report, report)
    process.stdout.write(
      `[trial-demo-account-browser-smoke] report written: ${path.relative(
        repoRoot,
        args.report
      )}\n`
    )
  }
  assert.equal(
    report.pagePerformanceAcceptance.passed,
    true,
    `页面性能与请求收敛未通过: ${report.pagePerformanceAcceptance.failures.join(', ')}`
  )

  process.stdout.write(
    `[trial-demo-account-browser-smoke] 通过，桌面账号 ${verifiedDesktop.length} 个，岗位任务端 ${verifiedMobile.length} 个，拒绝态 1 个。base=${baseURL}\n`
  )
}

function startDevServer() {
  const child = spawn(
    'pnpm',
    [
      'exec',
      'vite',
      '--config',
      'vite.config.mjs',
      '--host',
      '127.0.0.1',
      '--port',
      String(devServerPort),
      '--strictPort',
    ],
    {
      cwd: webDir,
      env: {
        ...process.env,
        BROWSER: 'none',
        ERP_VITE_PORT: String(devServerPort),
        ERP_VITE_HMR_CLIENT_PORT: String(devServerPort),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )
  child.stdout.on('data', (chunk) => {
    devServerLogs += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    devServerLogs += chunk.toString()
  })
  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      devServerLogs += `\n[vite exited with code ${code}]`
    }
  })
  return child
}

async function stopDevServer() {
  if (!devServerProcess) return
  if (devServerProcess.exitCode === null) {
    devServerProcess.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => devServerProcess.once('exit', resolve)),
      delay(3000),
    ])
  }
  if (devServerProcess.exitCode === null) {
    devServerProcess.kill('SIGKILL')
  }
  devServerProcess = null
}

async function ensureBackendReady() {
  let response
  try {
    response = await fetch(backendHealthURL, { redirect: 'manual' })
  } catch (_error) {
    throw new Error(
      `无法访问后端健康检查 ${backendHealthURL}，请先启动 server。`
    )
  }
  if (!response.ok) {
    throw new Error(
      `后端健康检查失败 ${backendHealthURL}: HTTP ${response.status}`
    )
  }
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000
  let lastError = 'server did not become ready'
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' })
      if (response.ok || response.status === 302 || response.status === 304) {
        return
      }
      lastError = `unexpected status ${response.status}`
    } catch (error) {
      lastError = error.message
    }
    await delay(300)
  }
  throw new Error(
    `无法启动前端预览 ${url}: ${lastError}\n最近 Vite 输出:\n${tailLogs(devServerLogs)}`
  )
}

async function newPage(browser, viewport) {
  const context = await browser.newContext({ viewport })
  const trialCustomerConfigScript = await fs.readFile(
    trialCustomerConfigScriptPath,
    'utf8'
  )
  await context.route('**/customer-config.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript; charset=utf-8',
      body: trialCustomerConfigScript,
    })
  )
  const page = await context.newPage()
  const runtimeErrors = []
  const legalNoticeState = {
    responseCount: 0,
    lastAcknowledged: null,
    lastError: '',
  }
  const requestTracker = createPageRequestTracker()
  page.on('request', (request) => requestTracker.record(request))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(`console error: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => {
    runtimeErrors.push(`page error: ${error.message}`)
  })
  page.on('requestfailed', (request) => {
    requestTracker.recordFailure(request)
    const errorText = request.failure()?.errorText || ''
    if (errorText && errorText !== 'net::ERR_ABORTED') {
      runtimeErrors.push(`request failed: ${request.url()} ${errorText}`)
    }
  })
  page.on('response', async (response) => {
    requestTracker.recordResponse(response)
    if (!isAdminJSONRPCResponse(response, 'legal_notice_status')) return
    try {
      const payload = await response.json()
      if (Number(payload?.result?.code) !== 0) {
        legalNoticeState.lastError = 'legal_notice_status 未成功'
        return
      }
      const acknowledged = payload?.result?.data?.acknowledged
      if (typeof acknowledged !== 'boolean') {
        legalNoticeState.lastError = 'legal_notice_status 缺少明确状态'
        return
      }
      legalNoticeState.responseCount += 1
      legalNoticeState.lastAcknowledged = acknowledged
      legalNoticeState.lastError = ''
    } catch {
      legalNoticeState.lastError = 'legal_notice_status 返回无法解析'
    }
  })
  return { context, page, runtimeErrors, legalNoticeState, requestTracker }
}

async function verifyDesktopAccount(browser, account) {
  const { context, page, runtimeErrors, legalNoticeState, requestTracker } =
    await newPage(browser, {
      width: 1440,
      height: 900,
    })
  try {
    await login(page, {
      username: account.username,
      entry: 'desktop',
      fromPath: '/admin-login',
    })
    await page.locator('.erp-admin-menu').waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByText(account.username, { exact: true }).waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    const legalNotice = await handleLegalNoticeGate(page, {
      username: account.username,
      legalNoticeState,
    })
    const expectedVisibleMenus = visibleCustomerMenuLabels(
      account.expectedMenus
    ).sort((left, right) => left.localeCompare(right, 'zh-CN'))
    const expectedVisibleLeafMenus = uniqueStrings([
      ...expectedVisibleMenus,
      ...authenticatedMenuLabels,
    ]).sort((left, right) => left.localeCompare(right, 'zh-CN'))
    await verifyRoleGuidedMenuStructure(page, account.username)
    for (const label of expectedVisibleLeafMenus) {
      await findVisibleMenuItem(page, label)
    }
    const actualVisibleMenus = (
      await page.locator('.erp-admin-menu .ant-menu-item').allTextContents()
    )
      .map((label) => label.trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, 'zh-CN'))
    assert.deepEqual(
      actualVisibleMenus,
      expectedVisibleLeafMenus,
      `${account.username} 左侧叶子菜单必须与角色投影精确一致`
    )
    for (const label of account.forbiddenMenus || []) {
      await assertNotVisibleInMenu(page, label, account.username)
    }
    for (const label of hiddenCustomerMenuLabels) {
      await assertNotVisibleInMenu(page, label, account.username)
    }
    for (const label of forbiddenLegacyMenuLabels) {
      await assertNotVisibleInMenu(page, label, account.username)
    }
    const routeAccess = roleRouteAccessByUsername.get(account.username)
    let pagePerformance = []
    if (routeAccess) {
      pagePerformance = await verifyAllowedRolePages(
        page,
        routeAccess,
        requestTracker
      )
      await verifyForbiddenRolePages(page, routeAccess)
    }
    const diagnostic = await verifyEffectiveSessionDiagnostic(page, {
      username: account.username,
      expectedMenuCount: expectedVisibleMenus.length,
      assertExactCounts: account.username !== 'demo_admin',
    })
    await page.screenshot({
      path: path.resolve(outputDir, `${account.username}-desktop.png`),
      fullPage: true,
    })
    assertNoRuntimeErrors(runtimeErrors, `${account.username} desktop`)
    return { diagnostic, legalNotice, pagePerformance }
  } catch (error) {
    await screenshotOnFailure(page, `${account.username}-desktop-failed.png`)
    throw error
  } finally {
    await context.close()
  }
}

async function findVisibleMenuItem(page, label) {
  const menu = page.locator('.erp-admin-menu')
  const moreFunctions = menu
    .locator('.ant-menu-submenu-title')
    .filter({ hasText: '更多功能' })
    .first()
  const openMoreFunctions = async () => {
    assert.equal(
      await moreFunctions.count(),
      1,
      `${label} 不在首层菜单时必须存在唯一的“更多功能”入口`
    )
    const submenu = moreFunctions.locator('..')
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const submenuClass = String((await submenu.getAttribute('class')) || '')
      if (submenuClass.includes('ant-menu-submenu-open')) {
        return submenu
      }
      await moreFunctions.waitFor({ state: 'visible', timeout: 15_000 })
      await moreFunctions.click()
      await page.waitForTimeout(150)
    }
    assert.match(
      String((await submenu.getAttribute('class')) || ''),
      /ant-menu-submenu-open/u,
      `${label} 的“更多功能”菜单重试后仍未展开`
    )
    return submenu
  }
  const item = menu
    .getByText(label, { exact: true })
    .locator(
      'xpath=ancestor::li[contains(concat(" ", normalize-space(@class), " "), " ant-menu-item ")][1]'
    )
  if (
    (await item.count()) === 0 &&
    (await menu.getAttribute('data-navigation-presentation')) === 'role_guided'
  ) {
    await openMoreFunctions()
  }
  assert.equal(await item.count(), 1, `左侧菜单必须且只能有一个“${label}”入口`)
  const parentSubmenu = item.locator(
    'xpath=ancestor::li[contains(concat(" ", normalize-space(@class), " "), " ant-menu-submenu ")][1]'
  )
  if ((await parentSubmenu.count()) === 0) {
    await item.waitFor({ state: 'visible', timeout: 15_000 })
    return item
  }

  const submenuClass = String((await parentSubmenu.getAttribute('class')) || '')
  assert.match(
    String((await moreFunctions.innerText()) || '').trim(),
    /^更多功能（\d+）$/u,
    `${label} 的父菜单必须是正式“更多功能”分组`
  )
  if (!submenuClass.includes('ant-menu-submenu-open')) {
    await openMoreFunctions()
  }
  await item.waitFor({ state: 'visible', timeout: 15_000 })
  return item
}

async function verifyRoleGuidedMenuStructure(page, username) {
  const menu = page.locator('.erp-admin-menu')
  if (
    (await menu.getAttribute('data-navigation-presentation')) !== 'role_guided'
  ) {
    return
  }
  await menu.getByText('常用工作', { exact: true }).waitFor({
    state: 'visible',
    timeout: 15_000,
  })
  const metrics = await menu.evaluate((node) => {
    const commonGroups = Array.from(
      node.querySelectorAll('.ant-menu-item-group')
    ).filter(
      (group) =>
        String(
          group.querySelector(':scope > .ant-menu-item-group-title')
            ?.textContent || ''
        ).trim() === '常用工作'
    )
    const commonItems =
      commonGroups.length === 1
        ? Array.from(
            commonGroups[0].querySelectorAll(
              ':scope > .ant-menu-item-group-list > .ant-menu-item'
            )
          ).filter((item) => item.getClientRects().length > 0)
        : []
    const commonLabels = commonItems.map((item) =>
      String(item.textContent || '').trim()
    )
    return {
      commonGroupCount: commonGroups.length,
      commonItemCount: commonItems.length,
      commonLabels,
      uniqueCommonItemCount: new Set(commonLabels).size,
    }
  })
  assert.equal(
    metrics.commonGroupCount,
    1,
    `${username} 电脑端必须且只能有一个常用工作分组: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.commonItemCount > 0 &&
      metrics.commonItemCount <= MAX_ROLE_PRIMARY_LIMIT,
    `${username} 电脑端常用工作应有 1 至 ${MAX_ROLE_PRIMARY_LIMIT} 个业务入口: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.uniqueCommonItemCount,
    metrics.commonItemCount,
    `${username} 电脑端常用工作不能出现重复入口: ${JSON.stringify(metrics)}`
  )
}

async function verifyAllowedRolePages(page, routeAccess, requestTracker) {
  const measurements = []
  for (const target of routeAccess.allowedPages) {
    const menuItem = await findVisibleMenuItem(page, target.label)
    requestTracker.begin({
      username: routeAccess.username,
      label: target.label,
      path: target.path,
    })
    await menuItem.click()
    await page.waitForURL((url) => url.pathname === target.path, {
      timeout: 15_000,
    })
    await page.getByRole('main').waitFor({ state: 'visible', timeout: 15_000 })
    await page
      .locator('.loading-page--erp')
      .waitFor({ state: 'hidden', timeout: 15_000 })
      .catch(() => {})
    await page.waitForFunction(
      (label) =>
        [...document.querySelectorAll('.erp-admin-menu .ant-menu-item')].some(
          (node) =>
            node.classList.contains('ant-menu-item-selected') &&
            (node.textContent || '').trim().includes(label)
        ),
      target.label,
      { timeout: 15_000 }
    )
    const selectedLabels = (
      await page
        .locator('.erp-admin-menu .ant-menu-item-selected')
        .allTextContents()
    ).map((label) => label.trim())
    assert(
      selectedLabels.includes(target.label),
      `${routeAccess.username} 打开 ${target.label} 后菜单未保持选中`
    )
    const mainText = await page.getByRole('main').innerText()
    assert.doesNotMatch(
      mainText,
      /页面加载失败|页面暂时无法显示|当前页面不可访问/u,
      `${routeAccess.username} 打开 ${target.label} 后页面未正常加载`
    )
    measurements.push(await requestTracker.finish())
  }
  return measurements
}

async function verifyForbiddenRolePages(page, routeAccess) {
  const allowedPaths = new Set(
    routeAccess.allowedPages.map((target) => target.path)
  )
  const safeRedirectPaths = new Set([...allowedPaths, '/erp/help-center'])
  for (const target of routeAccess.forbiddenPages) {
    await page.goto(new URL(target.path, `${baseURL}/`).toString(), {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForURL(
      (url) =>
        url.pathname !== target.path && safeRedirectPaths.has(url.pathname),
      { timeout: 15_000 }
    )
    assert(
      safeRedirectPaths.has(new URL(page.url()).pathname),
      `${routeAccess.username} 直达禁止页面 ${target.label} 后未回到安全页面`
    )
  }
}

function visibleCustomerMenuLabels(labels = []) {
  return labels.filter((label) => !hiddenCustomerMenuLabelSet.has(label))
}

async function verifyEffectiveSessionDiagnostic(
  page,
  { username, expectedMenuCount, assertExactCounts }
) {
  if (!shouldCheckEffectiveSessionDiagnostic) {
    return null
  }
  await page.waitForFunction(
    () => {
      const diagnostic = window.__PLUSH_ERP_EFFECTIVE_SESSION_DIAGNOSTIC__
      return (
        diagnostic &&
        typeof diagnostic === 'object' &&
        diagnostic.source &&
        diagnostic.source !== 'missing'
      )
    },
    null,
    { timeout: 15_000 }
  )
  const diagnostic = await page.evaluate(
    () => window.__PLUSH_ERP_EFFECTIVE_SESSION_DIAGNOSTIC__ || null
  )
  assert(
    diagnostic && typeof diagnostic === 'object',
    `${username} 缺少本地 DEV effective session 脱敏诊断`
  )
  assert.equal(
    diagnostic.isLocalDev,
    true,
    `${username} effective session 诊断应来自本地 DEV runtime`
  )
  assert.equal(
    diagnostic.isSuperAdmin,
    false,
    `${username} 试用账号不应走 super_admin 产品核心看全模式`
  )
  assert.equal(
    diagnostic.projectionMode,
    'local_dev_customer_config_diagnostic',
    `${username} 应读取客户配置本地诊断投影`
  )
  assert.equal(
    typeof diagnostic.source,
    'string',
    `${username} effective session 诊断缺少 source`
  )
  assert.notEqual(
    diagnostic.source,
    'missing',
    `${username} effective session 诊断不应缺失`
  )
  assert.deepEqual(
    diagnostic.blockers,
    [],
    `${username} effective session 诊断存在阻塞项`
  )
  assert(
    diagnostic.counts && typeof diagnostic.counts === 'object',
    `${username} effective session 诊断缺少 counts`
  )
  if (assertExactCounts) {
    assert.equal(
      Number(diagnostic.counts.visibleMenuItems),
      expectedMenuCount,
      `${username} effective session 可见菜单计数必须与角色投影一致`
    )
    assert.equal(
      Number(diagnostic.counts.pages),
      expectedMenuCount,
      `${username} effective session 页面计数必须与角色投影一致`
    )
  } else {
    assert(
      Number(diagnostic.counts.visibleMenuItems) > 0,
      `${username} effective session 诊断没有可见菜单计数`
    )
  }
  if (expectedConfigRevision) {
    assert.equal(
      diagnostic.configRevision,
      expectedConfigRevision,
      `${username} effective session revision 必须等于本轮已激活 revision`
    )
  }
  const serialized = JSON.stringify(diagnostic)
  assert.doesNotMatch(
    serialized,
    /Bearer|access_token|Authorization|authorizationHeader|config_hash|configHash|password|rawId|entitlement/u,
    `${username} effective session 诊断包含敏感或底层字段`
  )
  assert.equal(
    Object.prototype.hasOwnProperty.call(diagnostic, 'actions'),
    false,
    `${username} effective session 诊断不能输出 action 列表`
  )
  return sanitizeEffectiveSessionDiagnostic(diagnostic)
}

function sanitizeEffectiveSessionDiagnostic(diagnostic) {
  const sanitized = {
    source: String(diagnostic.source || ''),
    customerKey: String(diagnostic.customerKey || ''),
    configRevision: String(diagnostic.configRevision || ''),
    projectionMode: String(diagnostic.projectionMode || ''),
    isSuperAdmin: Boolean(diagnostic.isSuperAdmin),
    isLocalDev: Boolean(diagnostic.isLocalDev),
    counts: {
      rbacMenuPaths: Number(diagnostic.counts?.rbacMenuPaths || 0),
      visibleMenuItems: Number(diagnostic.counts?.visibleMenuItems || 0),
      pageCount: Number(diagnostic.counts?.pages || 0),
      actionCount: Number(diagnostic.counts?.actions || 0),
      roleCount: Number(diagnostic.counts?.roles || 0),
      workPoolCount: Number(diagnostic.counts?.workPools || 0),
      moduleCount: Number(diagnostic.counts?.modules || 0),
      fieldPolicySurfaces: Number(diagnostic.counts?.fieldPolicySurfaces || 0),
      fieldPolicyFields: Number(diagnostic.counts?.fieldPolicyFields || 0),
      hiddenFieldPolicies: Number(diagnostic.counts?.hiddenFieldPolicies || 0),
    },
    blockers: Array.isArray(diagnostic.blockers)
      ? diagnostic.blockers.map((item) => String(item))
      : [],
  }
  const serialized = JSON.stringify(sanitized)
  assert.doesNotMatch(
    serialized,
    /Bearer|access_token|Authorization|authorizationHeader|config_hash|configHash|password|rawId|entitlement|actions/u,
    'effective session 诊断报告包含敏感字段或 action 列表'
  )
  return sanitized
}

async function verifyMobileAccount(browser, { username, roleKey }) {
  const { context, page, runtimeErrors, legalNoticeState } = await newPage(
    browser,
    {
      width: 390,
      height: 844,
    }
  )
  try {
    await login(page, {
      username,
      entry: 'mobile',
      fromPath: `/m/${roleKey}/tasks`,
    })
    await page.waitForURL(`**/m/${roleKey}/tasks`, { timeout: 15_000 })
    await page.getByTestId('mobile-role-bottom-nav').waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByRole('heading', { name: '待办' }).waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    const legalNotice = await handleLegalNoticeGate(page, {
      username,
      legalNoticeState,
    })
    await page.screenshot({
      path: path.resolve(outputDir, `${username}-${roleKey}-mobile.png`),
      fullPage: true,
    })
    assertNoRuntimeErrors(runtimeErrors, `${username} mobile`)
    return legalNotice
  } catch (error) {
    await screenshotOnFailure(page, `${username}-${roleKey}-mobile-failed.png`)
    throw error
  } finally {
    await context.close()
  }
}

async function verifyMobileDeniedAccount(browser) {
  const { context, page, runtimeErrors, legalNoticeState } = await newPage(
    browser,
    {
      width: 390,
      height: 844,
    }
  )
  try {
    await login(page, {
      username: 'demo_admin',
      entry: 'mobile',
      fromPath: '/m/sales/tasks',
    })
    await page.waitForURL(
      (url) =>
        url.pathname === '/entry' &&
        url.searchParams.get('reason') === 'mobile-role-unassigned',
      { timeout: 15_000 }
    )
    await page.getByText('当前账号未分配业务岗位', { exact: true }).waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page
      .getByText(
        '手机待办只向明确分配的业务岗位开放。您可以进入电脑端后台，或联系管理员分配业务岗位。',
        { exact: true }
      )
      .waitFor({ state: 'visible', timeout: 15_000 })
    const legalNotice = await handleLegalNoticeGate(page, {
      username: 'demo_admin',
      legalNoticeState,
    })
    const desktopEntryButton = page
      .getByText('电脑端', { exact: true })
      .locator('xpath=ancestor::button[1]')
    assert.equal(
      await desktopEntryButton.count(),
      1,
      '无业务岗位账号必须且只能有一个电脑端入口'
    )
    await desktopEntryButton.waitFor({ state: 'visible', timeout: 15_000 })
    const mobileEntryButton = page
      .getByText('手机待办', { exact: true })
      .locator('xpath=ancestor::button[1]')
    assert.equal(
      await mobileEntryButton.count(),
      0,
      '无业务岗位账号不应获得手机待办入口'
    )
    assert.equal(
      new URL(page.url()).pathname,
      '/entry',
      '无业务岗位账号应进入保留登录态的入口提示页'
    )
    assert.equal(
      new URL(page.url()).searchParams.get('reason'),
      'mobile-role-unassigned',
      '入口提示页必须保留未分配业务岗位的精确原因'
    )
    await page.screenshot({
      path: path.resolve(outputDir, 'demo_admin-mobile-denied.png'),
      fullPage: true,
    })
    assertNoRuntimeErrors(runtimeErrors, 'demo_admin mobile denied')
    return legalNotice
  } catch (error) {
    await screenshotOnFailure(page, 'demo_admin-mobile-denied-failed.png')
    throw error
  } finally {
    await context.close()
  }
}

async function login(
  page,
  { username, entry, fromPath, expectSuccess = true }
) {
  await page.goto(new URL(fromPath, `${baseURL}/`).toString(), {
    waitUntil: 'domcontentloaded',
  })
  if (fromPath !== '/admin-login') {
    await page.waitForURL('**/admin-login', { timeout: 15_000 })
  } else if (new URL(page.url()).pathname !== '/admin-login') {
    await page.goto(new URL('/admin-login', `${baseURL}/`).toString(), {
      waitUntil: 'domcontentloaded',
    })
  }
  await ensureLoginFormReady(page, { username, fromPath })
  const entryLabel = entry === 'mobile' ? '手机端待办' : '电脑端业务管理'
  const entryButton = page
    .locator('.ant-segmented-item')
    .filter({ hasText: entryLabel })
    .first()
  if (await entryButton.isVisible().catch(() => false)) {
    await entryButton.click()
  }
  await page.getByLabel('账号').fill(username)
  await page.locator('input[type="password"]').fill(readDemoPassword())
  const submit = page.locator('button[type="submit"]').first()
  if (expectSuccess) {
    await Promise.all([
      page.waitForURL((url) => url.pathname !== '/admin-login', {
        timeout: 15_000,
      }),
      submit.click(),
    ])
  } else {
    await submit.click()
  }
}

function isAdminJSONRPCResponse(response, method) {
  if (!response.url().includes('/rpc/admin')) return false
  try {
    return response.request().postDataJSON()?.method === method
  } catch {
    return false
  }
}

async function readLegalNoticeResult(response, method, username) {
  assert.equal(response.ok(), true, `${username} ${method} HTTP 请求失败`)
  const payload = await response.json()
  assert.equal(Number(payload?.result?.code), 0, `${username} ${method} 未成功`)
  return payload?.result?.data || {}
}

async function handleLegalNoticeGate(page, { username, legalNoticeState }) {
  const gate = page.locator(
    '[data-testid="legal-notice-gate"] .ant-modal:visible'
  )
  const unavailable = page.locator('.legal-notice-status-banner:visible')
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    assert.equal(
      await unavailable.count(),
      0,
      `${username} 无法核对规则知悉状态`
    )
    assert.equal(
      legalNoticeState.lastError,
      '',
      `${username} ${legalNoticeState.lastError}`
    )
    if ((await gate.count()) > 0) break
    if (legalNoticeState.lastAcknowledged === true) {
      return 'not_required'
    }
    await page.waitForTimeout(100)
  }
  assert.equal(
    await gate.count(),
    1,
    `${username} 规则知悉状态在最终页面未收敛`
  )
  await gate
    .getByText('请先了解个人信息处理与系统使用规则', { exact: true })
    .waitFor({ state: 'visible', timeout: 15_000 })
  await gate
    .getByRole('link', { name: '打开《个人信息处理规则》' })
    .waitFor({ state: 'visible', timeout: 15_000 })
  await gate
    .getByRole('link', { name: '打开《系统使用规则》' })
    .waitFor({ state: 'visible', timeout: 15_000 })

  const acknowledgeResponse = page.waitForResponse(
    (response) => isAdminJSONRPCResponse(response, 'acknowledge_legal_notice'),
    { timeout: 15_000 }
  )
  await gate.getByTestId('legal-notice-acknowledge').click()
  const acknowledged = await readLegalNoticeResult(
    await acknowledgeResponse,
    'acknowledge_legal_notice',
    username
  )
  assert.equal(
    acknowledged.acknowledged,
    true,
    `${username} 规则知悉写入后未得到确认`
  )
  await gate.waitFor({ state: 'hidden', timeout: 15_000 })
  return 'acknowledged_during_smoke'
}

async function ensureLoginFormReady(
  page,
  { username = '', fromPath = '' } = {}
) {
  const attempts = 3
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await page.waitForLoadState('domcontentloaded').catch(() => {})
    await page
      .waitForLoadState('networkidle', { timeout: 5_000 })
      .catch(() => {})
    const accountInput = page.getByLabel('账号')
    if (
      await accountInput
        .waitFor({ state: 'visible', timeout: 8_000 })
        .then(() => true)
        .catch(() => false)
    ) {
      return
    }
    if (attempt < attempts) {
      await page.goto(new URL('/admin-login', `${baseURL}/`).toString(), {
        waitUntil: 'domcontentloaded',
      })
    }
  }
  throw new Error(
    [
      'login-form-unavailable',
      `username=${username || 'unknown'}`,
      `fromPath=${fromPath || 'unknown'}`,
      await describeLoginPageState(page),
    ].join(' ')
  )
}

async function describeLoginPageState(page) {
  return page
    .evaluate(() => {
      const root = document.querySelector('#root')
      const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ')
      return {
        url: window.location.href,
        title: document.title,
        readyState: document.readyState,
        rootChildCount: root?.childElementCount || 0,
        bodyText: bodyText.slice(0, 160),
      }
    })
    .then((state) => `state=${JSON.stringify(state)}`)
    .catch((error) => `state_error=${String(error?.message || error)}`)
}

async function assertNotVisibleInMenu(page, label, username) {
  const count = await page
    .locator('.erp-admin-menu')
    .getByText(label, { exact: true })
    .count()
  assert.equal(count, 0, `${username} 不应看到菜单: ${label}`)
}

function assertNoRuntimeErrors(runtimeErrors, scope) {
  assert.deepEqual(
    runtimeErrors,
    [],
    `${scope} 出现浏览器运行时错误:\n${runtimeErrors.join('\n')}`
  )
}

async function screenshotOnFailure(page, fileName) {
  try {
    await page.screenshot({
      path: path.resolve(outputDir, fileName),
      fullPage: true,
    })
  } catch {
    // 截图失败不覆盖主错误。
  }
}

function tailLogs(logs) {
  return String(logs || '')
    .split('\n')
    .slice(-30)
    .join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `[trial-demo-account-browser-smoke][fatal] ${
        error?.stack || error?.message || error
      }\n`
    )
    process.exitCode = 1
  })
}

export { buildInputTemplate, buildPreflightReport, buildRealSmokeReport }
