import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

import { chromium } from 'playwright'
import { yoyoosunMenuConfig } from '../../config/customers/yoyoosun/menuConfig.mjs'
import { businessModuleDefinitions } from '../src/erp/config/businessModules.mjs'
import { navigationItemRegistry } from '../src/erp/config/seedData.mjs'

const webDir = path.resolve(import.meta.dirname, '..')
const repoRoot = path.resolve(webDir, '..')
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
const devServerPort = Number(process.env.TRIAL_BROWSER_SMOKE_PORT || 4194)
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

const desktopAccounts = [
  {
    username: 'demo_boss',
    expectedMenus: [
      '工作台',
      '任务看板',
      '业务看板',
      '客户档案',
      '供应商档案',
      '销售订单',
    ],
    forbiddenMenus: ['权限管理'],
  },
  {
    username: 'demo_sales',
    expectedMenus: ['工作台', '任务看板', '业务看板', '客户档案', '销售订单'],
    forbiddenMenus: ['权限管理'],
  },
  {
    username: 'demo_purchase',
    expectedMenus: [
      '工作台',
      '任务看板',
      '业务看板',
      '供应商档案',
      '模板打印中心',
    ],
    forbiddenMenus: ['权限管理'],
  },
  {
    username: 'demo_production',
    expectedMenus: ['工作台', '任务看板', '业务看板', '异常 / 阻塞闭环'],
    forbiddenMenus: ['权限管理'],
  },
  {
    username: 'demo_warehouse',
    expectedMenus: ['工作台', '任务看板', '业务看板', '异常 / 阻塞闭环'],
    forbiddenMenus: ['权限管理'],
  },
  {
    username: 'demo_quality',
    expectedMenus: ['工作台', '任务看板', '业务看板', '异常 / 阻塞闭环'],
    forbiddenMenus: ['权限管理'],
  },
  {
    username: 'demo_finance',
    expectedMenus: ['工作台', '任务看板', '业务看板', '模板打印中心'],
    forbiddenMenus: ['权限管理'],
  },
  {
    username: 'demo_pmc',
    expectedMenus: ['工作台', '任务看板', '业务看板', '异常 / 阻塞闭环'],
    forbiddenMenus: ['权限管理'],
  },
  {
    username: 'demo_engineering',
    expectedMenus: [
      '工作台',
      '任务看板',
      '业务看板',
      '产品档案',
      '材料档案',
      '加工环节',
      'BOM 管理',
    ],
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
      '异常 / 阻塞闭环',
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

const menuLabelByKey = new Map([
  ...Object.values(navigationItemRegistry).map((item) => [
    item.key,
    item.label,
  ]),
  ...businessModuleDefinitions.map((item) => [item.key, item.label]),
])
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

const usage = `用法:
  TRIAL_ACCOUNT_PASSWORD='replace-with-password' pnpm --dir web smoke:trial-demo-browser
  node web/scripts/trialDemoAccountBrowserSmoke.mjs --print-input-template
  node web/scripts/trialDemoAccountBrowserSmoke.mjs --preflight-report output/trial-demo-account-browser-smoke/preflight.json

环境变量:
  TRIAL_ACCOUNT_PASSWORD                 试用 / 演示账号密码；优先级高于 ERP_ROLE_DEMO_PASSWORD
  ERP_ROLE_DEMO_PASSWORD                 兼容 scripts/seed-role-demo-admins.sh 的密码来源
  TRIAL_BROWSER_SMOKE_BASE_URL           已启动前端地址；不设置时脚本自动启动 Vite
  TRIAL_BROWSER_SMOKE_BACKEND_HEALTH_URL 后端健康检查地址，默认 ${backendHealthURL}
  TRIAL_BROWSER_SMOKE_HEADED=1           使用 headed 浏览器
`

function buildInputTemplate() {
  const menuProjectionPlan = buildMenuProjectionPlan()
  const menuProjectionCoverage = buildMenuProjectionCoverage(menuProjectionPlan)
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
    mobileAccounts: mobileAccounts.map(([username, roleKey]) => ({
      username,
      roleKey,
    })),
    menuProjectionPlan,
    menuProjectionCoverage,
    commands: [
      'PATH=/usr/local/bin:$PATH node web/scripts/trialDemoAccountBrowserSmoke.mjs --preflight-report output/trial-demo-account-browser-smoke/preflight.json',
      "TRIAL_ACCOUNT_PASSWORD='<local-demo-password>' PATH=/usr/local/bin:$PATH pnpm --dir web smoke:trial-demo-browser",
      "TRIAL_ACCOUNT_PASSWORD='<local-demo-password>' TRIAL_BROWSER_SMOKE_BASE_URL='http://127.0.0.1:5175' PATH=/usr/local/bin:$PATH pnpm --dir web smoke:trial-demo-browser",
    ],
    boundary:
      'This template does not prove browser login, menu projection, mobile task access, backend health, or customer config active revision until a local backend, frontend runtime, and demo password are provided.',
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
    mobileAccounts: mobileAccounts.map(([username, roleKey]) => ({
      username,
      roleKey,
      path: `/m/${roleKey}/tasks`,
    })),
    mobileDeniedAccounts: [
      {
        username: 'demo_admin',
        roleKey: 'sales',
        path: '/m/sales/tasks',
        expectedMessage: '该账号暂无当前入口权限，请联系管理员。',
      },
    ],
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
        account.path === '/m/sales/tasks' &&
        account.expectedMessage === '该账号暂无当前入口权限，请联系管理员。'
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
    allMobileAccountsHavePaths: plan.mobileAccounts.every(
      (account) => account.path === `/m/${account.roleKey}/tasks`
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

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))]
}

function parseCliArgs(argv) {
  const options = {
    help: false,
    printInputTemplate: false,
    preflightReport: '',
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
      options.preflightReport = resolveRepoOutputPath(value)
      continue
    }
    throw new Error(`不支持的参数: --${key}`)
  }
  return options
}

function resolveRepoOutputPath(raw) {
  const value = String(raw || '').trim()
  if (!value) {
    throw new Error('参数 --preflight-report 缺少值')
  }
  const resolved = path.resolve(repoRoot, value)
  const relative = path.relative(repoRoot, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('--preflight-report must stay inside the repository')
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

async function buildPreflightReport() {
  const menuProjectionPlan = buildMenuProjectionPlan()
  const menuProjectionCoverage = buildMenuProjectionCoverage(menuProjectionPlan)
  const passwordEnvNames = ['TRIAL_ACCOUNT_PASSWORD', 'ERP_ROLE_DEMO_PASSWORD']
  const presentPasswordEnvNames = passwordEnvNames.filter((name) =>
    Boolean(String(process.env[name] || '').trim())
  )
  const backendHealth = await probeURL(backendHealthURL)
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

  return {
    scope: 'trial-demo-account-browser-smoke-preflight-report',
    generatedAt: new Date().toISOString(),
    writesDatabase: false,
    callsJSONRPC: false,
    startsBrowser: false,
    startsDevServer: false,
    readsCustomerConfigScript: false,
    readsPasswordValue: false,
    storesPasswordValue: false,
    storesAccessToken: false,
    storesAuthorizationHeader: false,
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
    customerConfigScript,
    readyForRealSmoke: blockers.length === 0,
    blockers,
    nextCommand: blockers.length
      ? 'Resolve blockers, then rerun this preflight before real browser smoke.'
      : "TRIAL_ACCOUNT_PASSWORD='<local-demo-password>' PATH=/usr/local/bin:$PATH pnpm --dir web smoke:trial-demo-browser",
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
  try {
    for (const account of desktopAccounts) {
      await verifyDesktopAccount(browser, account)
      verifiedDesktop.push(account.username)
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
    await page.screenshot({
      path: path.resolve(outputDir, `${account.username}-desktop.png`),
      fullPage: true,
    })
    assertNoRuntimeErrors(runtimeErrors, `${account.username} desktop`)
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
    await page.getByText('该账号暂无当前入口权限，请联系管理员。').waitFor({
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
  const entryLabel = entry === 'mobile' ? '岗位任务端' : '后台管理'
  const entryButton = page
    .locator('.ant-segmented-item')
    .filter({ hasText: entryLabel })
    .first()
  if (await entryButton.isVisible().catch(() => false)) {
    await entryButton.click()
  }
  await page.getByLabel('管理员账号').fill(username)
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

await main().catch((error) => {
  process.stderr.write(
    `[trial-demo-account-browser-smoke][fatal] ${
      error?.stack || error?.message || error
    }\n`
  )
  process.exitCode = 1
})
