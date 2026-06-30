import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

import { chromium } from 'playwright'

const webDir = path.resolve(import.meta.dirname, '..')
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
const externalBaseURL = String(
  process.env.TRIAL_BROWSER_SMOKE_BASE_URL || ''
).trim()
const baseURL = externalBaseURL || `http://127.0.0.1:${devServerPort}`
const backendHealthURL = String(
  process.env.TRIAL_BROWSER_SMOKE_BACKEND_HEALTH_URL ||
    'http://127.0.0.1:8300/healthz'
).trim()
const headless = process.env.TRIAL_BROWSER_SMOKE_HEADED !== '1'
const password = String(
  process.env.TRIAL_ACCOUNT_PASSWORD || process.env.ERP_ROLE_DEMO_PASSWORD || ''
).trim()

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
  },
  {
    username: 'demo_sales',
    expectedMenus: ['工作台', '任务看板', '业务看板', '客户档案', '销售订单'],
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
  },
  {
    username: 'demo_production',
    expectedMenus: ['工作台', '任务看板', '业务看板', '异常 / 阻塞闭环'],
  },
  {
    username: 'demo_warehouse',
    expectedMenus: ['工作台', '任务看板', '业务看板', '异常 / 阻塞闭环'],
  },
  {
    username: 'demo_quality',
    expectedMenus: ['工作台', '任务看板', '业务看板', '异常 / 阻塞闭环'],
  },
  {
    username: 'demo_finance',
    expectedMenus: ['工作台', '任务看板', '业务看板', '模板打印中心'],
  },
  {
    username: 'demo_pmc',
    expectedMenus: ['工作台', '任务看板', '业务看板', '异常 / 阻塞闭环'],
  },
  {
    username: 'demo_engineering',
    expectedMenus: [
      '工作台',
      '任务看板',
      '业务看板',
      '产品档案',
      '材料档案',
      '工序档案',
      'BOM 管理',
    ],
  },
  {
    username: 'demo_admin',
    expectedMenus: ['权限管理'],
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

let devServerProcess = null
let devServerLogs = ''

const usage = `用法:
  TRIAL_ACCOUNT_PASSWORD='replace-with-password' pnpm --dir web smoke:trial-demo-browser

环境变量:
  TRIAL_ACCOUNT_PASSWORD                 试用 / 演示账号密码；优先级高于 ERP_ROLE_DEMO_PASSWORD
  ERP_ROLE_DEMO_PASSWORD                 兼容 scripts/seed-role-demo-admins.sh 的密码来源
  TRIAL_BROWSER_SMOKE_BASE_URL           已启动前端地址；不设置时脚本自动启动 Vite
  TRIAL_BROWSER_SMOKE_BACKEND_HEALTH_URL 后端健康检查地址，默认 ${backendHealthURL}
  TRIAL_BROWSER_SMOKE_HEADED=1           使用 headed 浏览器
`

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === '-h' || args[0] === '--help') {
    process.stdout.write(`${usage}\n`)
    return
  }
  if (args.length > 0) {
    throw new Error(`不支持的参数: ${args.join(' ')}`)
  }
  if (!password) {
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
    for (const label of account.expectedMenus) {
      await page
        .locator('.erp-admin-menu')
        .getByText(label, { exact: true })
        .waitFor({ state: 'visible', timeout: 15_000 })
    }
    for (const label of oldEntryLabels) {
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
  await page.locator('input[type="password"]').fill(password)
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
  assert.equal(count, 0, `${username} 不应看到旧入口菜单: ${label}`)
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
