import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

import { chromium } from 'playwright'

const webDir = path.resolve(import.meta.dirname, '..')
const outputDir = path.resolve(webDir, 'output', 'playwright', 'style-l1')
const devServerPort = Number(process.env.STYLE_L1_PORT || 4173)
const externalBaseURL = String(process.env.STYLE_L1_BASE_URL || '').trim()
const baseURL = externalBaseURL || `http://127.0.0.1:${devServerPort}`
const headless = process.env.HEADED !== '1'

let devServerProcess = null
let devServerLogs = ''

const scenarios = [
  {
    name: 'home-desktop',
    path: '/',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '毛绒玩具 ERP 初始化底座')
      await expectRole(page, 'link', '员工登录')
      await expectRole(page, 'link', '管理员登录')
    },
  },
  {
    name: 'home-mobile',
    path: '/',
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await expectHeading(page, '毛绒玩具 ERP 初始化底座')
      await expectRole(page, 'link', '员工登录')
      await expectRole(page, 'link', '管理员登录')
    },
  },
  {
    name: 'admin-login-mobile',
    path: '/admin-login',
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await expectText(page, '毛绒 ERP 管理台登录')
      await expectRole(page, 'button', '登录')
      await expectText(page, '用于访问 ERP 初始化看板')
    },
  },
  {
    name: 'erp-dashboard-redirect',
    path: '/erp/dashboard',
    viewport: { width: 1280, height: 800 },
    expectPath: '/admin-login',
    verify: async (page) => {
      await expectText(page, '毛绒 ERP 管理台登录')
      await expectRole(page, 'button', '登录')
    },
  },
  {
    name: 'erp-dashboard-desktop',
    path: '/erp/dashboard',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '基于真实资料的毛绒 ERP 后台')
      await expectText(page, '当前已按真源收口的模块')
      await expectText(page, '桌面后台角色工作台')
    },
  },
  {
    name: 'erp-role-merchandiser',
    path: '/erp/roles/merchandiser',
    auth: 'admin',
    desktopRole: 'merchandiser',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '业务跟单')
      await expectText(page, '桌面后台默认入口')
      await expectText(page, '字段风险提醒')
    },
  },
  {
    name: 'help-center-mobile',
    path: '/erp/help-center',
    auth: 'admin',
    desktopRole: 'finance',
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await expectHeading(page, '帮助中心与操作入口')
      await expectText(page, '先读这三个入口')
      await expectText(page, '本轮明确 deferred')
    },
  },
  {
    name: 'mobile-workbenches-mobile',
    path: '/erp/mobile-workbenches',
    auth: 'admin',
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await expectHeading(page, '六个角色移动端入口与端口')
      await expectText(page, '同一个项目里共享 common / ui / api / 文档体系')
      await expectText(page, '扫码、拍照、PDA 与离线同步统一标记 deferred')
    },
  },
  {
    name: 'source-readiness-desktop',
    path: '/erp/source-readiness',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '先把已收到与待补资料列清楚')
      await expectText(page, '9.3加工合同-子淳.pdf')
      await expectText(page, '仍在等待的资料')
    },
  },
]

async function main() {
  await fs.mkdir(outputDir, { recursive: true })

  try {
    if (!externalBaseURL) {
      devServerProcess = startDevServer()
      await waitForServer(baseURL)
    }

    const browser = await chromium.launch({ headless })
    try {
      for (const scenario of scenarios) {
        await runScenario(browser, scenario)
      }
    } finally {
      await browser.close()
    }

    console.log(`[style:l1] 通过，共验证 ${scenarios.length} 个场景`)
  } finally {
    await stopDevServer()
  }
}

function startDevServer() {
  const child = spawn(
    'pnpm',
    [
      'exec',
      'vite',
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
  if (!devServerProcess) {
    return
  }

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

async function waitForServer(url) {
  const deadline = Date.now() + 30_000
  let lastError = 'server did not become ready'

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        redirect: 'manual',
      })
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
    `[style:l1] 无法启动前端预览：${lastError}\n最近 vite 输出：\n${tailLogs(devServerLogs)}`
  )
}

async function runScenario(browser, scenario) {
  const page = await browser.newPage({ viewport: scenario.viewport })
  const errors = []

  if (scenario.auth === 'admin') {
    const token = createMockAdminToken()
    const desktopRole = scenario.desktopRole || 'boss'
    await page.addInitScript(
      (mockToken, nextDesktopRole) => {
        localStorage.setItem('admin_access_token', mockToken)
        localStorage.setItem('plush-erp.desktop-role', nextDesktopRole)
      },
      token,
      desktopRole
    )
  }

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console error: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => {
    errors.push(`page error: ${error.message}`)
  })

  try {
    await page.goto(new URL(scenario.path, `${baseURL}/`).toString(), {
      waitUntil: 'domcontentloaded',
    })
    await delay(300)

    if (scenario.expectPath) {
      await waitForPath(page, scenario.expectPath)
    }

    await scenario.verify(page)
    await assertNoHorizontalOverflow(page, scenario.name)
    assert.deepEqual(errors, [], `${scenario.name} 出现控制台或运行时错误`)

    const screenshotPath = path.resolve(outputDir, `${scenario.name}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
  } catch (error) {
    throw new Error(
      `[style:l1] 场景失败: ${scenario.name}\n${error.message}\n最近 vite 输出：\n${tailLogs(devServerLogs)}`
    )
  } finally {
    await page.close()
  }
}

async function waitForPath(page, expectedPath) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname === expectedPath) {
      return
    }
    await delay(100)
  }
  assert.equal(new URL(page.url()).pathname, expectedPath)
}

async function expectHeading(page, text) {
  const locator = page.getByRole('heading', { name: text })
  await locator.waitFor({ state: 'visible', timeout: 10_000 })
}

async function expectRole(page, role, name) {
  const locator = page.getByRole(role, { name })
  await locator.waitFor({ state: 'visible', timeout: 10_000 })
}

async function expectText(page, text) {
  const locator = page.getByText(text, { exact: false })
  await locator.first().waitFor({ state: 'visible', timeout: 10_000 })
}

function createMockAdminToken() {
  const header = encodeBase64URL({ alg: 'none', typ: 'JWT' })
  const payload = encodeBase64URL({
    uid: 1,
    uname: 'style-l1-admin',
    role: 1,
    exp: Math.floor(Date.now() / 1000) + 3600,
  })
  return `${header}.${payload}.stylel1`
}

function encodeBase64URL(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

async function assertNoHorizontalOverflow(page, scenarioName) {
  const metrics = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }))

  assert(
    metrics.bodyScrollWidth <= metrics.viewportWidth + 2,
    `${scenarioName} body 出现横向溢出: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.docScrollWidth <= metrics.viewportWidth + 2,
    `${scenarioName} document 出现横向溢出: ${JSON.stringify(metrics)}`
  )
}

function tailLogs(text) {
  return text.trim().split('\n').slice(-20).join('\n')
}

await main()
