import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'
import {
  loadDevPorts,
  resolveDevAuxPort,
} from '../../scripts/dev-ports.mjs'
import { yoyoosunMenuConfig } from '../../config/customers/yoyoosun/menuConfig.mjs'
import { yoyoosunRoleFlowMatrix } from '../../config/customers/yoyoosun/roleFlowMatrix.mjs'
import { businessModuleDefinitions } from '../src/erp/config/businessModules.mjs'
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
  '帮助中心',
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
    expectedMenus: ['权限管理'],
    forbiddenMenus: [
      '工作台',
      '任务看板',
      '业务看板',
      '客户档案',
      '供应商档案',
      '销售订单',
      '采购订单',
      '模板打印中心',
      '异常处理',
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
    expectedMessage: '当前账号不能使用所选工作方式，请联系系统管理员。',
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

function buildMenuProjectionCoverage(plan = buildMenuProjectionPlan()) {
  const adminDesktop = plan.desktopAccounts.find(
    (account) => account.username === 'demo_admin'
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
      adminDesktop?.visibleExpectedMenus.length === 1 &&
      adminDesktop.visibleExpectedMenus.includes('权限管理'),
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
        account.expectedMessage ===
          '当前账号不能使用所选工作方式，请联系系统管理员。'
    ),
    coversCustomerHiddenMenus:
      plan.customerHiddenMenuLabels.length > 0 &&
      plan.desktopAccounts.every((account) =>
        plan.customerHiddenMenuLabels.every((label) =>
          account.forbiddenMenus.includes(label)
        )
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
}) {
  const diagnosticBlockers = desktopEffectiveSessionDiagnostics.flatMap(
    (entry) => entry.diagnostic.blockers || []
  )
  return {
    scope: 'trial-demo-account-browser-smoke-report',
    generatedAt: new Date().toISOString(),
    writesDatabase: false,
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
    })),
    mobileAccounts: mobileAccounts.map((account) =>
      buildMobileAccountSummary(account, verifiedMobile)
    ),
    mobileDeniedAccount: buildMobileDeniedAccountSummary({ verified: true }),
    desktopEffectiveSessionDiagnostics,
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
  try {
    for (const account of desktopAccounts) {
      const diagnostic = await verifyDesktopAccount(browser, account)
      verifiedDesktop.push(account.username)
      if (diagnostic) {
        desktopEffectiveSessionDiagnostics.push({
          username: account.username,
          diagnostic,
        })
      }
    }
    for (const [username, roleKey] of mobileAccounts) {
      await verifyMobileAccount(browser, { username, roleKey })
      verifiedMobile.push(`${username}:${roleKey}`)
    }
    await verifyMobileDeniedAccount(browser)
  } finally {
    await browser.close()
    await stopDevServer()
  }

  if (args.report) {
    const report = buildRealSmokeReport({
      verifiedDesktop,
      verifiedMobile,
      desktopEffectiveSessionDiagnostics,
    })
    await writeJSONReport(args.report, report)
    process.stdout.write(
      `[trial-demo-account-browser-smoke] report written: ${path.relative(
        repoRoot,
        args.report
      )}\n`
    )
  }

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
  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(`console error: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => {
    runtimeErrors.push(`page error: ${error.message}`)
  })
  page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText || ''
    if (errorText && errorText !== 'net::ERR_ABORTED') {
      runtimeErrors.push(`request failed: ${request.url()} ${errorText}`)
    }
  })
  return { context, page, runtimeErrors }
}

async function verifyDesktopAccount(browser, account) {
  const { context, page, runtimeErrors } = await newPage(browser, {
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
    for (const label of visibleCustomerMenuLabels(account.expectedMenus)) {
      await page
        .locator('.erp-admin-menu')
        .getByText(label, { exact: true })
        .waitFor({ state: 'visible', timeout: 15_000 })
    }
    for (const label of account.forbiddenMenus || []) {
      await assertNotVisibleInMenu(page, label, account.username)
    }
    for (const label of hiddenCustomerMenuLabels) {
      await assertNotVisibleInMenu(page, label, account.username)
    }
    for (const label of forbiddenLegacyMenuLabels) {
      await assertNotVisibleInMenu(page, label, account.username)
    }
    const diagnostic = await verifyEffectiveSessionDiagnostic(
      page,
      account.username
    )
    await page.screenshot({
      path: path.resolve(outputDir, `${account.username}-desktop.png`),
      fullPage: true,
    })
    assertNoRuntimeErrors(runtimeErrors, `${account.username} desktop`)
    return diagnostic
  } catch (error) {
    await screenshotOnFailure(page, `${account.username}-desktop-failed.png`)
    throw error
  } finally {
    await context.close()
  }
}

function visibleCustomerMenuLabels(labels = []) {
  return labels.filter((label) => !hiddenCustomerMenuLabelSet.has(label))
}

async function verifyEffectiveSessionDiagnostic(page, username) {
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
  assert(
    Number(diagnostic.counts.visibleMenuItems) > 0,
    `${username} effective session 诊断没有可见菜单计数`
  )
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
  const { context, page, runtimeErrors } = await newPage(browser, {
    width: 390,
    height: 844,
  })
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
    await page.screenshot({
      path: path.resolve(outputDir, `${username}-${roleKey}-mobile.png`),
      fullPage: true,
    })
    assertNoRuntimeErrors(runtimeErrors, `${username} mobile`)
  } catch (error) {
    await screenshotOnFailure(page, `${username}-${roleKey}-mobile-failed.png`)
    throw error
  } finally {
    await context.close()
  }
}

async function verifyMobileDeniedAccount(browser) {
  const { context, page, runtimeErrors } = await newPage(browser, {
    width: 390,
    height: 844,
  })
  try {
    await login(page, {
      username: 'demo_admin',
      entry: 'mobile',
      fromPath: '/m/sales/tasks',
      expectSuccess: false,
    })
    await page
      .getByText('当前账号不能使用所选工作方式，请联系系统管理员。')
      .waitFor({
        state: 'visible',
        timeout: 15_000,
      })
    assert.equal(
      new URL(page.url()).pathname,
      '/admin-login',
      '无岗位权限账号应停留在登录页'
    )
    await page.screenshot({
      path: path.resolve(outputDir, 'demo_admin-mobile-denied.png'),
      fullPage: true,
    })
    assertNoRuntimeErrors(runtimeErrors, 'demo_admin mobile denied')
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

export { buildInputTemplate, buildPreflightReport }
