import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

import { chromium } from 'playwright'
import { RpcErrorCode } from '../src/common/consts/errorCodes.generated.js'
import { appDefinitions } from '../src/erp/config/appRegistry.mjs'
import { getRoleWorkbench } from '../src/erp/config/seedData.mjs'

const webDir = path.resolve(import.meta.dirname, '..')
const outputDir = path.resolve(
  webDir,
  'output',
  'playwright',
  'mobile-auth-login-route-smoke'
)
const devServerPort = Number(process.env.MOBILE_AUTH_SMOKE_PORT || 4193)
const externalBaseURL = String(
  process.env.MOBILE_AUTH_SMOKE_BASE_URL || ''
).trim()
const baseURL = externalBaseURL || `http://127.0.0.1:${devServerPort}`
const headless = process.env.HEADED !== '1'
const viewportProfiles = [
  {
    id: 'phone',
    label: '手机',
    viewport: { width: 390, height: 844 },
  },
  {
    id: 'ipad',
    label: 'iPad',
    viewport: { width: 820, height: 1180 },
  },
]
const requestedAppIDs = String(process.env.MOBILE_AUTH_SMOKE_APP_ID || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)
const mobileApps = appDefinitions
  .filter((app) => app.kind === 'mobile')
  .filter(
    (app) => requestedAppIDs.length === 0 || requestedAppIDs.includes(app.id)
  )

if (mobileApps.length === 0) {
  throw new Error(
    `未找到要验证的移动端应用：${requestedAppIDs.join(', ') || '(empty)'}`
  )
}

if (externalBaseURL && mobileApps.length > 1) {
  throw new Error(
    'MOBILE_AUTH_SMOKE_BASE_URL 只适合验证单个已启动入口；请同时设置 MOBILE_AUTH_SMOKE_APP_ID。'
  )
}

let devServerProcess = null
let devServerLogs = ''

async function main() {
  await fs.mkdir(outputDir, { recursive: true })

  const browser = await chromium.launch({ headless })
  const verifiedApps = []

  try {
    for (const app of mobileApps) {
      const role = getRoleWorkbench(app.roleKey)
      assert(role, `${app.id} 缺少角色工作台配置：${app.roleKey}`)

      await runMobileAppScenario(browser, { app })
      verifiedApps.push(`${app.shortTitle}(${app.roleKey})`)
    }
  } finally {
    await browser.close()
  }

  console.log(
    `[mobile-auth-login-route-smoke] 通过，已验证 ${verifiedApps.length} 个移动端角色：${verifiedApps.join('、')}。`
  )
}

async function runMobileAppScenario(browser, { app }) {
  devServerLogs = ''
  const appBaseURL = baseURL

  try {
    if (!externalBaseURL) {
      devServerProcess = startDevServer(app)
      await waitForServer(appBaseURL, app)
    }

    for (const viewportProfile of viewportProfiles) {
      const context = await browser.newContext({
        viewport: viewportProfile.viewport,
      })
      try {
        const page = await context.newPage()
        await runMobileAuthScenario(page, {
          app,
          appBaseURL,
          viewportProfile,
        })
        await page.screenshot({
          path: path.resolve(
            outputDir,
            `${app.id}-${viewportProfile.id}-auth-login-route.png`
          ),
          fullPage: true,
        })
      } finally {
        await context.close()
      }
    }
  } finally {
    await stopDevServer()
  }
}

function startDevServer(app) {
  const viteConfig = `vite.${app.id}.config.mjs`
  const child = spawn(
    'pnpm',
    [
      'exec',
      'vite',
      '--config',
      viteConfig,
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

async function waitForServer(url, app) {
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
    `[mobile-auth-login-route-smoke] 无法启动 ${app.id} 预览：${lastError}\n最近 vite 输出：\n${tailLogs(devServerLogs)}`
  )
}

async function runMobileAuthScenario(
  page,
  { app, appBaseURL, viewportProfile }
) {
  const staleToken = createMockAdminToken(`${app.roleKey}-stale-admin`)
  const loginToken = createMockAdminToken(`${app.roleKey}-mobile-admin`)
  let workflowCalls = 0
  let authedWorkflowCalls = 0

  await page.route('**/rpc/auth', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method } = body

    if (method === 'logout') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: {
            code: 0,
            message: 'OK',
            data: {},
          },
        }),
      })
      return
    }

    if (method === 'send_sms_code') {
      assert.equal(
        body.params?.mobile_role_key,
        app.roleKey,
        `${app.id} 获取验证码应携带当前移动端角色`
      )
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: {
            code: 0,
            message: 'OK',
            data: {
              phone: body.params?.phone || '13800138000',
              expires_at: Math.floor(Date.now() / 1000) + 300,
              resend_after: Math.floor(Date.now() / 1000) + 60,
              mock_delivery: true,
              mock_code: '123456',
            },
          },
        }),
      })
      return
    }

    if (method !== 'sms_login') {
      await route.fallback()
      return
    }

    assert.equal(
      body.params?.mobile_role_key,
      app.roleKey,
      `${app.id} 短信登录应携带当前移动端角色`
    )
    assert.equal(body.params?.scope, 'admin')
    assert.equal(body.params?.code, '123456')

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          code: 0,
          message: 'OK',
          data: {
            access_token: loginToken,
            token_type: 'Bearer',
            username: `${app.roleKey}-mobile-admin`,
            admin_level: 0,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            menu_permissions: ['/erp/dashboard'],
            mobile_role_permissions: [app.roleKey],
          },
        },
      }),
    })
  })

  await page.route('**/rpc/workflow', async (route) => {
    workflowCalls += 1
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const authorization = String(route.request().headers().authorization || '')

    assert.equal(
      params.owner_role_key,
      app.roleKey,
      `${app.id} workflow 请求应携带当前角色 owner_role_key`
    )

    if (authorization === `Bearer ${staleToken}`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: {
            code: RpcErrorCode.AUTH_REQUIRED,
            message: '未登录',
            data: {},
          },
        }),
      })
      return
    }

    if (authorization.startsWith('Bearer ')) {
      authedWorkflowCalls += 1
    }

    assert.equal(method, 'list_tasks')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          code: 0,
          message: 'OK',
          data: {
            tasks: [
              {
                id: 1,
                task_code: `${app.id}-auth-smoke-task`,
                task_name: '登录回跳验证任务',
                source_type: 'project-orders',
                source_id: 1,
                source_no: 'STYLE-001',
                business_status_key: 'project_pending',
                task_status_key: 'ready',
                owner_role_key: app.roleKey,
                blocked_reason: '',
                payload: {},
                created_at: Math.floor(Date.now() / 1000),
                updated_at: Math.floor(Date.now() / 1000),
              },
              {
                id: 2,
                task_code: `${app.id}-warning-smoke-task`,
                task_name:
                  '回签跟进ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                source_type: 'processing-contracts',
                source_id: 2,
                source_no:
                  'OUT-001-LONG-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                business_status_key: 'blocked',
                task_status_key: 'blocked',
                owner_role_key: app.roleKey,
                blocked_reason: '供应商延期',
                due_at: Math.floor(Date.now() / 1000) - 3600,
                payload: {},
                created_at: Math.floor(Date.now() / 1000) - 7200,
                updated_at: Math.floor(Date.now() / 1000) - 1800,
              },
              {
                id: 3,
                task_code: `${app.id}-done-smoke-task`,
                task_name: '完成进度样本',
                source_type: 'project-orders',
                source_id: 3,
                source_no: 'DONE-001',
                business_status_key: 'project_approved',
                task_status_key: 'done',
                owner_role_key: app.roleKey,
                blocked_reason: '',
                payload: {},
                created_at: Math.floor(Date.now() / 1000) - 10_800,
                updated_at: Math.floor(Date.now() / 1000) - 900,
              },
            ],
            total: 3,
            limit: 100,
            offset: 0,
          },
        },
      }),
    })
  })

  await page.goto(new URL('/tasks', `${appBaseURL}/`).toString(), {
    waitUntil: 'domcontentloaded',
  })
  await waitForPath(page, '/admin-login')
  await expectText(page, '毛绒 ERP 管理后台')
  assert.equal(
    workflowCalls,
    0,
    '完全未登录访问移动端任务页时，应先进入登录页，不应提前请求 workflow API'
  )

  await page.goto(new URL('/', `${appBaseURL}/`).toString(), {
    waitUntil: 'domcontentloaded',
  })
  await waitForPath(page, '/admin-login')
  await page.goto(new URL('/guide', `${appBaseURL}/`).toString(), {
    waitUntil: 'domcontentloaded',
  })
  await waitForPath(page, '/admin-login')
  assert.equal(
    workflowCalls,
    0,
    '完全未登录访问移动端首页或说明页时，不应提前请求 workflow API'
  )

  await page.evaluate((mockToken) => {
    localStorage.setItem('admin_access_token', mockToken)
  }, staleToken)
  await page.goto(new URL('/tasks', `${appBaseURL}/`).toString(), {
    waitUntil: 'domcontentloaded',
  })

  await waitForPath(page, '/admin-login')
  await expectText(page, '毛绒 ERP 管理后台')
  assert.equal(
    workflowCalls,
    0,
    '缺少移动端角色权限元数据的旧登录态应回到登录页，不应提前请求 workflow API'
  )

  await page.getByLabel('手机号').fill('13800138000')
  await page.getByRole('button', { name: '获取验证码' }).click()
  await expectText(page, '临时验证码：123456')
  await page.getByPlaceholder('请输入验证码').fill('123456')
  await page.getByRole('button', { name: /登\s*录/ }).click()

  await waitForPath(page, '/tasks')
  await expectText(page, '待办')
  await expectText(page, '退出登录')
  await expectText(page, '我的预警')
  await expectText(page, '已超时')
  await expectText(page, '即将超时')
  await expectText(page, '阻塞/高优先')
  await expectText(page, '预警')
  await expectText(page, '通知')
  await expectText(page, '任务')
  await expectText(page, '进度')
  await expectText(page, '待处理')
  await expectText(page, '处理中')
  await expectText(page, '卡住')
  await expectText(page, '完成')
  await expectText(page, 'STYLE-001')
  await expectText(page, 'OUT-001')
  await expectText(page, '登录回跳验证任务')
  await expectText(page, '回签跟进')
  await expectText(page, '供应商延期')
  await expectNoText(page, app.shortTitle)
  await expectNoText(page, 'owner_role_key')
  await expectNoText(page, '说明')
  await expectNoText(page, 'Deferred')

  assert(
    workflowCalls >= 1,
    `${app.id} 登录后未重新加载任务池，workflowCalls=${workflowCalls}`
  )
  assert(
    authedWorkflowCalls >= 1,
    `${app.id} 登录后 workflow 请求未携带管理员 token，authedWorkflowCalls=${authedWorkflowCalls}`
  )

  const metrics = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body
    const appLayout = document.querySelector('.mobile-app-layout')
    const taskSections = document.querySelector(
      '.mobile-role-tasks-page__sections'
    )
    const taskSectionStyle = taskSections
      ? window.getComputedStyle(taskSections)
      : null
    const taskSectionColumns = String(
      taskSectionStyle?.gridTemplateColumns || ''
    )
      .split(/\s+/)
      .filter(Boolean)
    return {
      path: window.location.pathname,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      mainHeight: main.getBoundingClientRect().height,
      appLayoutWidth: appLayout?.getBoundingClientRect().width || 0,
      taskSectionDisplay: taskSectionStyle?.display || '',
      taskSectionColumnCount: taskSectionColumns.length,
      activeElementTagName: document.activeElement?.tagName || '',
    }
  })

  assert.equal(metrics.path, '/tasks')
  assert(
    metrics.scrollWidth <= metrics.clientWidth + 1,
    `移动端登录回跳后出现横向溢出: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.mainHeight > 0,
    `移动端登录回跳后主内容未渲染: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.appLayoutWidth > 0,
    `移动端登录回跳后主布局容器未渲染: ${JSON.stringify(metrics)}`
  )

  if (viewportProfile.viewport.width >= 768) {
    assert(
      metrics.appLayoutWidth >= viewportProfile.viewport.width - 96,
      `${app.id} ${viewportProfile.label} 视口下主内容仍按手机窄宽度渲染: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.taskSectionColumnCount,
      2,
      `${app.id} ${viewportProfile.label} 视口下任务区应切换为双栏: ${JSON.stringify(metrics)}`
    )
  } else {
    assert(
      metrics.appLayoutWidth <= 560,
      `${app.id} ${viewportProfile.label} 视口下主内容不应超过手机阅读宽度: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.taskSectionColumnCount,
      1,
      `${app.id} ${viewportProfile.label} 视口下任务区应保持单栏: ${JSON.stringify(metrics)}`
    )
  }

  await page.screenshot({
    path: path.resolve(outputDir, `${app.id}-${viewportProfile.id}-tasks.png`),
    fullPage: true,
  })

  await page.goto(new URL('/guide', `${appBaseURL}/`).toString(), {
    waitUntil: 'domcontentloaded',
  })
  await waitForPath(page, '/tasks')
  await expectNoText(page, '说明')

  await page.getByRole('button', { name: '退出登录' }).click()
  await waitForPath(page, '/admin-login')
  const storedToken = await page.evaluate(() =>
    localStorage.getItem('admin_access_token')
  )
  assert.equal(storedToken, null, `${app.id} 退出登录后应清空管理员 token`)
}

async function expectText(page, text) {
  const locator = page.getByText(text, { exact: false })
  await locator.first().waitFor({ state: 'visible', timeout: 10_000 })
}

async function expectNoText(page, text) {
  const count = await page.getByText(text, { exact: false }).count()
  assert.equal(count, 0, `页面不应显示文案: ${text}`)
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

function createMockAdminToken(username) {
  const header = { alg: 'none', typ: 'JWT' }
  const payload = {
    uid: 1,
    uname: username,
    role: 1,
    exp: Math.floor(Date.now() / 1000) + 3600,
  }
  return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.signature`
}

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function tailLogs(logs, maxLength = 4000) {
  const normalized = String(logs || '').trim()
  if (normalized.length <= maxLength) return normalized
  return normalized.slice(-maxLength)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
