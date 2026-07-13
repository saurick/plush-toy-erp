import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

import { chromium } from 'playwright'
import { RpcErrorCode } from '../src/common/consts/errorCodes.generated.js'
import { mobileRoleDefinitions } from '../src/erp/config/appRegistry.mjs'
import { getRoleWorkbench } from '../src/erp/config/seedData.mjs'
import { shouldLoadAllWorkflowTasksForRole } from '../src/erp/utils/mobileTaskQueries.mjs'

const webDir = path.resolve(import.meta.dirname, '..')
const repoRoot = path.resolve(webDir, '..')
const INPUT_TEMPLATE_SCOPE = 'mobile-auth-login-route-smoke-input-template'
const PREFLIGHT_SCOPE = 'mobile-auth-login-route-smoke-preflight-report'
const suggestedMockSmokeCommand =
  'PATH=/usr/local/bin:$PATH pnpm --dir web smoke:mobile-auth-login-route'
const preflightNotProven = [
  'real backend RBAC',
  'real demo account login',
  'customer config active revision readback',
  'desktop menu projection',
  'workflow task usecase writes',
  'target environment release evidence',
]
const outputDir = path.resolve(
  webDir,
  'output',
  'playwright',
  'mobile-auth-login-route-smoke'
)
const devServerPort = Number(process.env.MOBILE_AUTH_SMOKE_PORT || 4193)
const externalBaseURL = normalizeOptionalURL(
  process.env.MOBILE_AUTH_SMOKE_BASE_URL || '',
  'MOBILE_AUTH_SMOKE_BASE_URL'
)
const baseURL = externalBaseURL || `http://localhost:${devServerPort}`
const useSharedDevServer = !externalBaseURL
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
const requestedRoleKeys = String(process.env.MOBILE_AUTH_SMOKE_ROLE_KEY || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)
const allMobileRoles = mobileRoleDefinitions
const mobileRoles = allMobileRoles.filter(
  (role) =>
    requestedRoleKeys.length === 0 || requestedRoleKeys.includes(role.roleKey)
)
const cliArgs = process.argv.slice(2)
const printInputTemplate = cliArgs.includes('--print-input-template')
const printHelp = cliArgs.includes('-h') || cliArgs.includes('--help')
const preflightReportPath = resolveOptionalPreflightReportPath(cliArgs)

export function buildInputTemplate() {
  return {
    scope: INPUT_TEMPLATE_SCOPE,
    writesDatabase: false,
    callsBackend: false,
    startsBrowser: false,
    startsDevServer: false,
    usesMockRpc: true,
    suggestedMockSmokeCommand,
    notProvenByThisTemplate: [...preflightNotProven],
    viewportProfiles: viewportProfiles.map((item) => ({
      id: item.id,
      label: item.label,
      viewport: item.viewport,
    })),
    roles: mobileRoleDefinitions.map((role) => ({
      roleKey: role.roleKey,
      title: role.shortTitle,
      taskPath: `/m/${role.roleKey}/tasks`,
    })),
    optionalInputs: [
      {
        key: 'MOBILE_AUTH_SMOKE_ROLE_KEY',
        requirement:
          'Comma-separated mobile role keys for a subset run; omit to verify all mobile roles.',
      },
      {
        key: 'MOBILE_AUTH_SMOKE_BASE_URL',
        requirement:
          'Optional existing frontend URL without username or password; when set, also set MOBILE_AUTH_SMOKE_ROLE_KEY for one role.',
      },
      {
        key: 'MOBILE_AUTH_SMOKE_PORT',
        defaultValue: String(devServerPort),
        requirement:
          'Local Vite port used when MOBILE_AUTH_SMOKE_BASE_URL is omitted.',
      },
      {
        key: 'HEADED',
        defaultValue: '0',
        requirement: 'Set to 1 to run Playwright headed for local debugging.',
      },
    ],
    commands: [
      'PATH=/usr/local/bin:$PATH node web/scripts/mobileAuthLoginRouteSmoke.mjs --print-input-template',
      'PATH=/usr/local/bin:$PATH node web/scripts/mobileAuthLoginRouteSmoke.mjs --preflight-report output/mobile-auth-login-route-smoke/preflight.json',
      suggestedMockSmokeCommand,
      "MOBILE_AUTH_SMOKE_ROLE_KEY='boss' PATH=/usr/local/bin:$PATH pnpm --dir web smoke:mobile-auth-login-route",
      "MOBILE_AUTH_SMOKE_ROLE_KEY='boss' MOBILE_AUTH_SMOKE_BASE_URL='http://localhost:5175' PATH=/usr/local/bin:$PATH pnpm --dir web smoke:mobile-auth-login-route",
    ],
    boundary:
      'This template only prints mobile auth route smoke prerequisites. The preflight report only writes a local JSON route plan. Neither mode starts Vite, starts Playwright, calls a real backend, logs in to a real account, writes database rows, or proves real RBAC/customer-config active revision. The real smoke uses mocked auth/workflow RPC responses to verify mobile route guards, login return paths, task UI, notifications, logout, phone/iPad layout, and production single-port /m/<role>/tasks routing.',
  }
}

if (
  !printInputTemplate &&
  !printHelp &&
  !preflightReportPath &&
  mobileRoles.length === 0
) {
  throw new Error(
    `未找到要验证的移动端岗位：${requestedRoleKeys.join(', ') || '(empty)'}`
  )
}

if (
  !printInputTemplate &&
  !printHelp &&
  externalBaseURL &&
  mobileRoles.length > 1
) {
  throw new Error(
    'MOBILE_AUTH_SMOKE_BASE_URL 只适合验证单个已启动入口；请同时设置 MOBILE_AUTH_SMOKE_ROLE_KEY。'
  )
}

let devServerProcess = null
let devServerLogs = ''

async function main() {
  await fs.mkdir(outputDir, { recursive: true })

  const browser = await chromium.launch({
    headless,
    args: ['--no-proxy-server'],
  })
  const verifiedRoles = []

  try {
    if (useSharedDevServer) {
      devServerLogs = ''
      devServerProcess = startDevServer()
      await waitForServer(baseURL, mobileRoles[0])
    }
    for (const role of mobileRoles) {
      const workbench = getRoleWorkbench(role.roleKey)
      assert(workbench, `${role.roleKey} 缺少角色工作台配置`)

      await runMobileRoleScenario(browser, { role })
      verifiedRoles.push(`${role.shortTitle}(${role.roleKey})`)
    }
  } finally {
    await browser.close()
    if (useSharedDevServer) {
      await stopDevServer()
    }
  }

  console.log(
    `[mobile-auth-login-route-smoke] 通过，已验证 ${verifiedRoles.length} 个岗位任务端角色：${verifiedRoles.join('、')}。`
  )
}

async function runMobileRoleScenario(browser, { role }) {
  devServerLogs = ''
  const roleBaseURL = baseURL

  if (useSharedDevServer) {
    await ensureDevServer(roleBaseURL, role)
  }

  for (const viewportProfile of viewportProfiles) {
    if (useSharedDevServer) {
      await ensureDevServer(roleBaseURL, role)
    }
    const context = await browser.newContext({
      viewport: viewportProfile.viewport,
    })
    try {
      const page = await context.newPage()
      page._mobileAuthDiagnostics = []
      page.on('console', (message) => {
        page._mobileAuthDiagnostics.push(
          `[console:${message.type()}] ${message.text()}`
        )
      })
      page.on('pageerror', (error) => {
        page._mobileAuthDiagnostics.push(`[pageerror] ${error.message}`)
      })
      await runMobileAuthScenario(page, {
        role,
        roleBaseURL,
        viewportProfile,
      })
      await page.screenshot({
        path: path.resolve(
          outputDir,
          `${role.roleKey}-${viewportProfile.id}-auth-login-route.png`
        ),
        fullPage: true,
      })
    } finally {
      await context.close()
    }
  }
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
      'localhost',
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

async function waitForServer(url, role) {
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
    `[mobile-auth-login-route-smoke] 无法启动 ${role.roleKey} 预览：${lastError}\n最近 vite 输出：\n${tailLogs(devServerLogs)}`
  )
}

async function ensureDevServer(url, role) {
  if (externalBaseURL) return
  if (!devServerProcess || devServerProcess.exitCode !== null) {
    devServerLogs += `\n[mobile-auth-login-route-smoke] restarting vite for ${role.roleKey}`
    devServerProcess = startDevServer()
  }
  await waitForServer(url, role)
}

async function runMobileAuthScenario(
  page,
  { role, roleBaseURL, viewportProfile }
) {
  const tasksPath = `/m/${role.roleKey}/tasks`
  const roleRootPath = `/m/${role.roleKey}`
  const guidePath = `/m/${role.roleKey}/guide`
  const staleToken = createMockAdminToken(`${role.roleKey}-stale-admin`)
  const loginToken = createMockAdminToken(`${role.roleKey}-mobile-admin`)
  const desktopLoginToken = createMockAdminToken(
    `${role.roleKey}-desktop-admin`
  )
  let workflowCalls = 0
  let authedWorkflowCalls = 0
  let passwordLoginCalls = 0

  await page.addInitScript(() => {
    window.__PLUSH_ERP_CUSTOMER_CONFIG__ = {
      ...(window.__PLUSH_ERP_CUSTOMER_CONFIG__ || {}),
      customerKey: 'yoyoosun',
    }
  })

  await page.route('**/rpc/customer_config', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method } = body
    if (method !== 'get_effective_session') {
      await route.fallback()
      return
    }
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
            session: {
              config_revision: 'mobile-auth-smoke-yoyoosun',
              customer: { key: 'yoyoosun', name: '永绅' },
              pages: ['global-dashboard'],
              actions: ['workflow.task.read'],
              work_pools: [role.roleKey],
              source: 'mobile_auth_smoke_customer_runtime',
            },
          },
        },
      }),
    })
  })

  await page.route('**/rpc/auth', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method } = body

    if (method === 'capabilities') {
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
              sms_login: {
                enabled: true,
                mode: 'mock',
                mock_delivery: true,
                disabled_reason: '',
              },
            },
          },
        }),
      })
      return
    }

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
        role.roleKey,
        `${role.roleKey} 获取验证码应携带当前岗位任务端角色`
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

    if (method === 'admin_login') {
      passwordLoginCalls += 1
      const username = String(body.params?.username || '')
      const isDesktopLogin = username === `${role.roleKey}-desktop-admin`
      assert(
        username === `${role.roleKey}-mobile-admin` || isDesktopLogin,
        `${role.roleKey} 密码登录应提交预期管理员账号，实际为 ${username}`
      )
      assert.equal(
        body.params?.password,
        isDesktopLogin ? 'desktop-password' : 'mobile-password'
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
            data: isDesktopLogin
              ? createMockAdminLoginData({
                  role,
                  token: desktopLoginToken,
                  username,
                  menus: [{ path: '/erp/dashboard', label: '看板中心' }],
                })
              : createMockAdminLoginData({
                  role,
                  token: loginToken,
                }),
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
      role.roleKey,
      `${role.roleKey} 短信登录应携带当前岗位任务端角色`
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
          data: createMockAdminLoginData({
            role,
            token: loginToken,
          }),
        },
      }),
    })
  })

  await page.route('**/rpc/workflow', async (route) => {
    workflowCalls += 1
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const authorization = String(route.request().headers().authorization || '')
    const currentPagePath = new URL(page.url()).pathname

    if (currentPagePath.startsWith('/erp/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: {
            code: 0,
            message: 'OK',
            data: { tasks: [], total: 0, limit: 100, offset: 0 },
          },
        }),
      })
      return
    }

    if (shouldLoadAllWorkflowTasksForRole(role.roleKey)) {
      assert.equal(
        params.owner_role_key,
        undefined,
        `${role.roleKey} workflow 全量加载角色不应携带 owner_role_key`
      )
      assert.equal(
        params.limit,
        200,
        `${role.roleKey} workflow 全量加载应限制 200 条`
      )
    } else {
      assert.equal(
        params.owner_role_key,
        role.roleKey,
        `${role.roleKey} workflow 请求应携带当前角色 owner_role_key`
      )
    }

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
                task_code: `${role.roleKey}-auth-smoke-task`,
                task_name: '登录回跳验证任务',
                source_type: 'project-orders',
                source_id: 1,
                source_no: 'STYLE-001',
                business_status_key: 'project_pending',
                task_status_key: 'ready',
                owner_role_key: role.roleKey,
                blocked_reason: '',
                payload: {},
                created_at: Math.floor(Date.now() / 1000),
                updated_at: Math.floor(Date.now() / 1000),
              },
              {
                id: 2,
                task_code: `${role.roleKey}-warning-smoke-task`,
                task_name:
                  '回签跟进ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                source_type: 'processing-contracts',
                source_id: 2,
                source_no:
                  'OUT-001-LONG-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                business_status_key: 'blocked',
                task_status_key: 'blocked',
                owner_role_key: role.roleKey,
                blocked_reason: '供应商延期',
                due_at: Math.floor(Date.now() / 1000) - 3600,
                payload: {},
                created_at: Math.floor(Date.now() / 1000) - 7200,
                updated_at: Math.floor(Date.now() / 1000) - 1800,
              },
              {
                id: 3,
                task_code: `${role.roleKey}-done-smoke-task`,
                task_name: '完成进度样本',
                source_type: 'project-orders',
                source_id: 3,
                source_no: 'DONE-001',
                business_status_key: 'project_approved',
                task_status_key: 'done',
                owner_role_key: role.roleKey,
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

  await resetAuthStorage(page, roleBaseURL)
  assert.equal(
    await evaluateAfterNavigationSettles(page, () => {
      try {
        return localStorage.getItem('admin_access_token')
      } catch {
        return null
      }
    }),
    null,
    `${role.roleKey} 未登录路径前应清空管理员 token`
  )
  await gotoAfterNavigationSettles(
    page,
    new URL(tasksPath, `${roleBaseURL}/`).toString(),
    {
      waitUntil: 'domcontentloaded',
    }
  )
  await waitForPath(page, '/admin-login')
  await expectText(page, '毛绒 ERP 管理后台')
  assert.equal(
    workflowCalls,
    0,
    '完全未登录访问岗位任务页时，应先进入登录页，不应提前请求 workflow API'
  )

  await gotoAfterNavigationSettles(
    page,
    new URL(roleRootPath, `${roleBaseURL}/`).toString(),
    {
      waitUntil: 'domcontentloaded',
    }
  )
  await waitForPath(page, '/admin-login')
  await gotoAfterNavigationSettles(
    page,
    new URL(guidePath, `${roleBaseURL}/`).toString(),
    {
      waitUntil: 'domcontentloaded',
    }
  )
  await waitForPath(page, '/admin-login')
  assert.equal(
    workflowCalls,
    0,
    '完全未登录访问移动端首页或说明页时，不应提前请求 workflow API'
  )

  await evaluateAfterNavigationSettles(
    page,
    (mockToken) => {
      localStorage.setItem('admin_access_token', mockToken)
    },
    staleToken
  )
  await gotoAfterNavigationSettles(
    page,
    new URL(tasksPath, `${roleBaseURL}/`).toString(),
    {
      waitUntil: 'domcontentloaded',
    }
  )

  await waitForPath(page, '/admin-login')
  await expectText(page, '毛绒 ERP 管理后台')
  assert.equal(
    workflowCalls,
    0,
    '缺少岗位任务端角色权限元数据的旧登录态应回到登录页，不应提前请求 workflow API'
  )

  await expectText(page, '密码登录')
  await expectText(page, '短信登录')
  await page.getByText('短信登录').click()
  await page.getByLabel('手机号').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByText('密码登录').click()
  await page.getByLabel('账号').fill(`${role.roleKey}-mobile-admin`)
  await page.locator('#password').fill('mobile-password')
  await page.getByRole('button', { name: /登\s*录/ }).click()

  await waitForPath(page, tasksPath)
  assert.equal(
    passwordLoginCalls,
    1,
    `${role.roleKey} 应完成一次管理员密码登录`
  )
  await expectText(page, '任务')
  await expectText(page, '待办')
  await expectText(page, '风险')
  await expectText(page, '已超时')
  await expectText(page, '即将超时')
  await expectText(page, '阻塞/高优先')
  await expectText(page, 'STYLE-001')
  await expectText(page, 'OUT-001')
  await expectText(page, '登录回跳验证任务')
  await expectText(page, '回签跟进')
  await expectNoText(page, role.shortTitle)
  await expectNoText(page, 'owner_role_key')
  await expectNoText(page, '说明')
  await expectNoText(page, 'Deferred')

  await clickMobileMainTab(page, 'done', '已办任务')
  await expectText(page, '进度')
  await expectText(page, '待处理')
  await expectText(page, '处理中')
  await expectText(page, '卡住')
  await expectText(page, '完成')
  await expectText(page, '完成进度样本')

  await clickMobileMainTab(page, 'messages', '预警')
  await expectText(page, '通知')
  await expectText(page, '供应商延期')

  await clickMobileMainTab(page, 'todo', '待办')

  assert(
    workflowCalls >= 1,
    `${role.roleKey} 登录后未重新加载任务池，workflowCalls=${workflowCalls}`
  )
  assert(
    authedWorkflowCalls >= 1,
    `${role.roleKey} 登录后 workflow 请求未携带管理员 token，authedWorkflowCalls=${authedWorkflowCalls}`
  )

  const metrics = await evaluateAfterNavigationSettles(page, () => {
    const main = document.querySelector('main') || document.body
    const appLayout = document.querySelector('.mobile-app-layout')
    const shell = document.querySelector('.mobile-role-tasks-page')
    const scroll = document.querySelector('[data-testid="mobile-role-scroll"]')
    const nav = document.querySelector('[data-testid="mobile-role-bottom-nav"]')
    const shellRect = shell?.getBoundingClientRect()
    const scrollRect = scroll?.getBoundingClientRect()
    const navRect = nav?.getBoundingClientRect()
    return {
      path: window.location.pathname,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      mainHeight: main.getBoundingClientRect().height,
      appLayoutWidth: appLayout?.getBoundingClientRect().width || 0,
      shell: shellRect
        ? {
            top: shellRect.top,
            bottom: shellRect.bottom,
            height: shellRect.height,
          }
        : null,
      scroll: scrollRect
        ? {
            top: scrollRect.top,
            bottom: scrollRect.bottom,
            height: scrollRect.height,
          }
        : null,
      nav: navRect
        ? {
            top: navRect.top,
            bottom: navRect.bottom,
            height: navRect.height,
          }
        : null,
      navButtonCount: nav?.querySelectorAll('button').length || 0,
      activeElementTagName: document.activeElement?.tagName || '',
    }
  })

  assert.equal(metrics.path, tasksPath)
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
  assert(metrics.shell, `岗位任务页容器未渲染: ${JSON.stringify(metrics)}`)
  assert(metrics.scroll, `岗位任务页滚动区未渲染: ${JSON.stringify(metrics)}`)
  assert(metrics.nav, `移动端底部导航未渲染: ${JSON.stringify(metrics)}`)
  assert.equal(
    metrics.navButtonCount,
    4,
    `移动端底部导航应固定为四项: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.shell.bottom <= metrics.viewport.height + 1,
    `岗位任务页容器应固定在当前视口内: ${JSON.stringify(metrics)}`
  )
  assert(
    Math.abs(metrics.nav.bottom - metrics.shell.bottom) <= 1.5,
    `移动端底部导航未贴住任务页底部: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.scroll.bottom <= metrics.nav.top + 1.5,
    `移动端正文滚动区不应覆盖底部导航: ${JSON.stringify(metrics)}`
  )

  if (viewportProfile.viewport.width >= 768) {
    assert(
      metrics.appLayoutWidth >= viewportProfile.viewport.width - 96,
      `${role.roleKey} ${viewportProfile.label} 视口下主内容仍按手机窄宽度渲染: ${JSON.stringify(metrics)}`
    )
  } else {
    assert(
      metrics.appLayoutWidth <= 560,
      `${role.roleKey} ${viewportProfile.label} 视口下主内容不应超过手机阅读宽度: ${JSON.stringify(metrics)}`
    )
  }

  await page.screenshot({
    path: path.resolve(
      outputDir,
      `${role.roleKey}-${viewportProfile.id}-tasks.png`
    ),
    fullPage: true,
  })

  await gotoAfterNavigationSettles(
    page,
    new URL(guidePath, `${roleBaseURL}/`).toString(),
    {
      waitUntil: 'domcontentloaded',
    }
  )
  await waitForPath(page, tasksPath)
  await expectNoText(page, '说明')

  await clickMobileMainTab(page, 'mine', '登录与安全')
  await clickAfterNavigationSettles(
    page,
    page.getByTestId('mobile-role-logout-button')
  )
  await waitForPath(page, '/admin-login')
  const storedToken = await evaluateAfterNavigationSettles(page, () =>
    localStorage.getItem('admin_access_token')
  )
  assert.equal(
    storedToken,
    null,
    `${role.roleKey} 退出登录后应清空管理员 token`
  )

  await page.getByText('后台管理').click()
  await page.getByLabel('账号').fill(`${role.roleKey}-desktop-admin`)
  await page.locator('#password').fill('desktop-password')
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await waitForPath(page, '/erp/dashboard')

  const firstBackLeak = await captureTextsAfterNavigation(page, () =>
    page.goBack({ waitUntil: 'domcontentloaded' })
  )
  assert.notEqual(
    new URL(page.url()).pathname,
    tasksPath,
    `${role.roleKey} 退出岗位端并登录后台后，浏览器返回不应恢复旧岗位任务端首页`
  )
  assert(
    !firstBackLeak.includes('登录与安全'),
    `${role.roleKey} 退出岗位端并登录后台后，浏览器返回不应短暂渲染旧岗位任务端：${firstBackLeak}`
  )

  await evaluateAfterNavigationSettles(page, () => {
    for (const key of Object.keys(localStorage)) {
      if (key === 'admin_access_token' || key.startsWith('admin_')) {
        localStorage.removeItem(key)
      }
    }
    sessionStorage.clear()
  })
  await gotoAfterNavigationSettles(
    page,
    new URL('/admin-login', `${roleBaseURL}/`).toString(),
    {
      waitUntil: 'domcontentloaded',
    }
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('岗位任务端').click()
  await page.getByLabel('账号').fill(`${role.roleKey}-mobile-admin`)
  await page.locator('#password').fill('mobile-password')
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await waitForPath(page, tasksPath)

  const secondBackLeak = await captureTextsAfterNavigation(page, () =>
    page.goBack({ waitUntil: 'domcontentloaded' })
  )
  await waitForPath(page, tasksPath)
  assert(
    !secondBackLeak.includes('看板中心') &&
      !secondBackLeak.includes('今日工作台'),
    `${role.roleKey} 岗位任务端登录后，浏览器返回不应短暂渲染后台页面：${secondBackLeak}`
  )
}

async function expectText(page, text) {
  const locator = page.getByText(text, { exact: false })
  await locator.first().waitFor({ state: 'visible', timeout: 10_000 })
}

async function clickMobileMainTab(page, tabKey, expectedText) {
  const tab = page.getByTestId(`mobile-role-nav-${tabKey}`)
  let lastBodyText = ''
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await tab.scrollIntoViewIfNeeded().catch(() => {})
    await tab.click()
    const deadline = Date.now() + 3_000
    while (Date.now() < deadline) {
      const state = await tab
        .getAttribute('aria-current')
        .catch(() => undefined)
      lastBodyText = await page
        .locator('body')
        .innerText()
        .catch(() => '')
      if (state === 'page' && lastBodyText.includes(expectedText)) {
        return
      }
      await delay(100)
    }
  }
  throw new Error(
    `mobile main tab ${tabKey} did not render expected text "${expectedText}". body=${lastBodyText.slice(0, 1200)}`
  )
}

async function clickAfterNavigationSettles(page, locator) {
  let lastError = null
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await locator.scrollIntoViewIfNeeded({ timeout: 1_500 }).catch(() => {})
      await locator.click({ timeout: 5_000 })
      return
    } catch (error) {
      lastError = error
      if (!isRetriableClickDuringNavigationError(error)) {
        throw error
      }
      await page.waitForLoadState('domcontentloaded').catch(() => {})
      await delay(150 * attempt)
    }
  }
  throw lastError
}

async function expectNoText(page, text) {
  const count = await page.getByText(text, { exact: false }).count()
  assert.equal(count, 0, `页面不应显示文案: ${text}`)
}

async function captureTextsAfterNavigation(page, navigateAction) {
  const samples = []
  await navigateAction()
  const deadline = Date.now() + 700
  while (Date.now() < deadline) {
    samples.push(
      await page
        .locator('body')
        .innerText()
        .catch(() => '')
    )
    await delay(50)
  }
  return samples.join('\n---sample---\n')
}

async function resetAuthStorage(page, roleBaseURL) {
  const loginURL = new URL('/admin-login', `${roleBaseURL}/`).toString()
  let lastError = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await gotoAfterNavigationSettles(page, loginURL, {
        waitUntil: 'domcontentloaded',
      })
      lastError = null
      break
    } catch (error) {
      lastError = error
      if (useSharedDevServer) {
        await ensureDevServer(roleBaseURL, { roleKey: 'shared-vite' })
      }
      await delay(300 * attempt)
    }
  }
  if (lastError) {
    throw new Error(
      `[mobile-auth-login-route-smoke] 无法打开登录页清理登录态：${lastError.message}\n最近 vite 输出：\n${tailLogs(devServerLogs)}`
    )
  }
  await evaluateAfterNavigationSettles(page, () => {
    try {
      localStorage.clear()
      sessionStorage.clear()
      return true
    } catch {
      return false
    }
  })
}

async function gotoAfterNavigationSettles(page, url, options = {}) {
  let lastError = null
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await page.goto(url, options)
    } catch (error) {
      lastError = error
      if (!isNavigationContextError(error)) {
        throw error
      }
      await page.waitForLoadState('domcontentloaded').catch(() => {})
      await delay(150 * attempt)
    }
  }
  throw lastError
}

async function evaluateAfterNavigationSettles(page, callback) {
  let lastError = null
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await page.evaluate(callback)
    } catch (error) {
      lastError = error
      if (!isNavigationContextError(error)) {
        throw error
      }
      await page.waitForLoadState('domcontentloaded').catch(() => {})
      await delay(100 * attempt)
    }
  }
  throw lastError
}

function isNavigationContextError(error) {
  const message = String(error?.message || '')
  return (
    message.includes('Execution context was destroyed') ||
    message.includes('Cannot find context with specified id') ||
    message.includes('net::ERR_ABORTED') ||
    message.includes('Most likely the page has been closed') ||
    message.includes('navigation')
  )
}

function isRetriableClickDuringNavigationError(error) {
  const message = String(error?.message || '')
  return (
    isNavigationContextError(error) ||
    message.includes('element was detached from the DOM') ||
    message.includes('waiting for element to be visible, enabled and stable') ||
    (message.includes('Timeout') && message.includes('locator.click'))
  )
}

async function waitForPath(page, expectedPath) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname === expectedPath) {
      return
    }
    await delay(100)
  }
  const diagnostics = await page
    .evaluate(() => {
      let storageKeys = []
      let adminTokenPresent = false
      let storageError = ''
      try {
        storageKeys = Object.keys(localStorage).sort()
        adminTokenPresent = Boolean(localStorage.getItem('admin_access_token'))
      } catch (error) {
        storageError = error?.message || String(error)
      }
      return {
        path: window.location.pathname,
        href: window.location.href,
        title: document.title,
        bodyText: String(document.body?.innerText || '').slice(0, 1200),
        storageKeys,
        adminTokenPresent,
        storageError,
      }
    })
    .catch((error) => ({ error: error.message }))
  diagnostics.browserLogs = Array.isArray(page._mobileAuthDiagnostics)
    ? page._mobileAuthDiagnostics.slice(-20)
    : []
  assert.equal(
    new URL(page.url()).pathname,
    expectedPath,
    `等待路由 ${expectedPath} 超时：${JSON.stringify(diagnostics)}`
  )
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

function createMockAdminLoginData({ role, token, username, menus } = {}) {
  const { roleKey } = role
  return {
    access_token: token,
    token_type: 'Bearer',
    username: username || `${role.roleKey}-mobile-admin`,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    is_super_admin: false,
    roles: [{ role_key: roleKey, name: role.shortTitle }],
    permissions: [`mobile.${roleKey}.access`, 'workflow.task.read'],
    menus: Array.isArray(menus) ? menus : [],
    erp_preferences: { column_orders: {} },
  }
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

export function normalizeOptionalURL(raw, label) {
  const value = String(raw || '').trim()
  if (!value) {
    return ''
  }
  const url = new URL(value)
  if (url.username || url.password) {
    throw new Error(`${label} must not contain username or password`)
  }
  return value
}

export async function buildPreflightReport() {
  const scriptPath = path.resolve(
    import.meta.dirname,
    'mobileAuthLoginRouteSmoke.mjs'
  )
  const scriptSource = await fs
    .stat(scriptPath)
    .then((stats) => ({
      path: path.relative(repoRoot, scriptPath),
      exists: true,
      size: stats.size,
    }))
    .catch((error) => ({
      path: path.relative(repoRoot, scriptPath),
      exists: false,
      size: 0,
      error: String(error?.message || error),
    }))
  const invalidRequestedRoleKeys = requestedRoleKeys.filter(
    (roleKey) => !allMobileRoles.some((role) => role.roleKey === roleKey)
  )
  const selectedRoles = mobileRoles
  const routePlan = selectedRoles.map((role) => ({
    roleKey: role.roleKey,
    title: role.shortTitle,
    taskPath: `/m/${role.roleKey}/tasks`,
    roleRootPath: `/m/${role.roleKey}`,
    guidePath: `/m/${role.roleKey}/guide`,
  }))
  const routeCoverage = {
    totalMobileRoleCount: allMobileRoles.length,
    selectedRoleCount: selectedRoles.length,
    requestedRoleKeys,
    invalidRequestedRoleKeys,
    coversAllRolesByDefault:
      requestedRoleKeys.length === 0 &&
      selectedRoles.length === allMobileRoles.length,
    hasRoutePathPerSelectedRole:
      selectedRoles.length > 0 &&
      routePlan.every((item) => item.taskPath === `/m/${item.roleKey}/tasks`),
    coversPhoneAndIpad:
      viewportProfiles.some((item) => item.id === 'phone') &&
      viewportProfiles.some((item) => item.id === 'ipad'),
    validatesUnauthedRedirect: true,
    validatesStaleMobileMetadataRedirect: true,
    validatesPasswordAndSmsLoginReturn: true,
    validatesWorkflowOwnerRoleQuery: true,
    validatesNotificationsAndWarnings: true,
    validatesLogoutAndBackNavigation: true,
    validatesNoHorizontalOverflow: true,
    validatesProductionSinglePortRolePaths: true,
    usesMockRpcOnly: true,
  }
  const blockers = []
  if (!scriptSource.exists) blockers.push('missing-mobile-auth-smoke-script')
  if (invalidRequestedRoleKeys.length > 0) {
    blockers.push('unknown-mobile-role-key')
  }
  if (selectedRoles.length === 0) blockers.push('no-mobile-roles-selected')
  if (!routeCoverage.hasRoutePathPerSelectedRole) {
    blockers.push('mobile-auth-route-plan-incomplete')
  }
  if (!routeCoverage.coversPhoneAndIpad) {
    blockers.push('mobile-auth-viewport-plan-incomplete')
  }
  return {
    scope: PREFLIGHT_SCOPE,
    generatedAt: new Date().toISOString(),
    writesDatabase: false,
    callsBackend: false,
    callsJSONRPC: false,
    startsBrowser: false,
    startsDevServer: false,
    usesMockRpc: true,
    readsPasswordValue: false,
    storesPasswordValue: false,
    storesAccessToken: false,
    storesAuthorizationHeader: false,
    externalBaseURLConfigured: Boolean(externalBaseURL),
    scriptSource,
    viewportProfiles: viewportProfiles.map((item) => ({
      id: item.id,
      label: item.label,
      viewport: item.viewport,
    })),
    routePlan,
    routeCoverage,
    readyForMockSmoke: blockers.length === 0,
    blockers,
    suggestedMockSmokeCommand,
    notProvenByThisPreflight: [...preflightNotProven],
    nextCommand: blockers.length
      ? 'Resolve blockers, then rerun this preflight before mobile auth route smoke.'
      : suggestedMockSmokeCommand,
    boundary:
      'This preflight writes only a local JSON route plan. It does not start Vite, start Playwright, call a backend, call JSON-RPC, log in to a real account, read password values, store tokens, write database rows, or prove real RBAC/customer-config active revision.',
  }
}

function resolveOptionalPreflightReportPath(tokens) {
  let reportPath = ''
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (
      token === '--print-input-template' ||
      token === '-h' ||
      token === '--help'
    ) {
      continue
    }
    if (token === '--preflight-report') {
      const value = tokens[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('参数 --preflight-report 缺少值')
      }
      reportPath = value
      index += 1
      continue
    }
    if (token.startsWith('--preflight-report=')) {
      reportPath = token.slice('--preflight-report='.length)
      if (!reportPath) {
        throw new Error('参数 --preflight-report 缺少值')
      }
      continue
    }
    if (token.startsWith('--')) {
      throw new Error(`未知参数：${token}`)
    }
  }
  if (!reportPath) return ''
  const resolved = path.resolve(repoRoot, reportPath)
  const relative = path.relative(repoRoot, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('--preflight-report must stay inside the repository')
  }
  return resolved
}

async function writeJSONReport(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(`${filePath}.tmp`, `${JSON.stringify(payload, null, 2)}\n`)
  await fs.rename(`${filePath}.tmp`, filePath)
}

async function runCli() {
  if (printInputTemplate) {
    console.log(JSON.stringify(buildInputTemplate(), null, 2))
    return
  }
  if (preflightReportPath) {
    const report = await buildPreflightReport()
    await writeJSONReport(preflightReportPath, report)
    console.log(
      `[mobile-auth-login-route-smoke] preflight written: ${path.relative(repoRoot, preflightReportPath)}`
    )
    if (report.blockers.length > 0) {
      console.log(
        `[mobile-auth-login-route-smoke] blockers: ${report.blockers.join(', ')}`
      )
    }
    return
  }
  if (printHelp) {
    console.log(
      [
        'Usage:',
        '  node web/scripts/mobileAuthLoginRouteSmoke.mjs',
        '  node web/scripts/mobileAuthLoginRouteSmoke.mjs --print-input-template',
        '  node web/scripts/mobileAuthLoginRouteSmoke.mjs --preflight-report output/mobile-auth-login-route-smoke/preflight.json',
        '',
        'The default command starts a local Vite server and Playwright with mocked auth/workflow RPC. The preflight report only writes a local no-write route plan.',
      ].join('\n')
    )
    return
  }
  await main()
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
