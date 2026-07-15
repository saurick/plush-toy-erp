import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

import {
  loadDevPorts,
  resolveDevAuxPort,
} from '../../scripts/dev-ports.mjs'

const INPUT_TEMPLATE_SCOPE = 'real-login-smoke-shared-input-template'
const PREFLIGHT_SCOPE = 'real-login-smoke-shared-preflight-report'
const scriptDir = import.meta.dirname
const webDir = path.resolve(scriptDir, '..')
const repoDir = path.resolve(webDir, '..')
const devPorts = loadDevPorts(repoDir)
const defaultRealLoginSmokePort = resolveDevAuxPort(
  devPorts,
  10,
  'real login smoke port'
)

export function buildRealLoginSmokeInputTemplate({
  defaultPort = defaultRealLoginSmokePort,
} = {}) {
  return {
    scope: INPUT_TEMPLATE_SCOPE,
    writesDatabase: false,
    callsBackend: false,
    startsBrowser: false,
    readsLocalConfig: false,
    defaultPort,
    secretInputs: [
      'REAL_LOGIN_ADMIN_USERNAME/REAL_LOGIN_ADMIN_PASSWORD or server/configs/dev/config.local.yaml admin credentials',
    ],
    requiredInputs: [
      {
        key: 'REAL_LOGIN_SMOKE_BACKEND_HEALTH_URL',
        defaultValue: 'http://127.0.0.1:8300/healthz',
        requirement: 'Backend health URL without username or password.',
      },
      {
        key: 'REAL_LOGIN_SMOKE_BASE_URL',
        defaultValue: `http://127.0.0.1:${defaultPort}`,
        requirement:
          'Optional existing frontend URL without username or password; omit to let the smoke start a local Vite server.',
      },
      {
        key: 'REAL_LOGIN_ADMIN_USERNAME/REAL_LOGIN_ADMIN_PASSWORD',
        requirement:
          'Local development admin credentials; if omitted, real smoke may read server/configs/dev/config.local.yaml or config.yaml.',
        secret: true,
      },
    ],
    commands: [
      'PATH=/usr/local/bin:$PATH node web/scripts/realLoginSmokeShared.mjs --print-input-template',
      'PATH=/usr/local/bin:$PATH node web/scripts/realLoginSmokeShared.mjs --preflight-report output/real-login-smoke-shared/preflight.json',
      'PATH=/usr/local/bin:$PATH node web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs --print-input-template',
      "REAL_LOGIN_ADMIN_USERNAME='<local-admin>' REAL_LOGIN_ADMIN_PASSWORD='<local-password>' PATH=/usr/local/bin:$PATH pnpm --dir web smoke:purchase-contract-real-login",
      "REAL_LOGIN_ADMIN_USERNAME='<local-admin>' REAL_LOGIN_ADMIN_PASSWORD='<local-password>' PATH=/usr/local/bin:$PATH pnpm --dir web smoke:processing-contract-real-login",
      "REAL_LOGIN_ADMIN_USERNAME='<local-admin>' REAL_LOGIN_ADMIN_PASSWORD='<local-password>' PATH=/usr/local/bin:$PATH pnpm --dir web smoke:mobile-auth-login-route",
      "REAL_LOGIN_ADMIN_USERNAME='<local-admin>' REAL_LOGIN_ADMIN_PASSWORD='<local-password>' PURCHASE_RECEIPT_E2E_ACCEPT_PERSISTENT_TEST_DATA=1 PATH=/usr/local/bin:$PATH pnpm --dir web smoke:purchase-receipt-real-write",
    ],
    boundary:
      'This template only prints shared real-login smoke prerequisites. The preflight report probes backend health and credential-source presence without reading config contents or validating credentials. Neither mode calls auth endpoints, starts Vite, starts Playwright, logs in, writes database rows, or proves contract/mobile/purchase receipt browser behavior. Downstream smoke scripts define their own write boundary; purchase-receipt-real-write persists local/development test facts and requires explicit acceptance.',
  }
}

export function createRealLoginSmokeRuntime({
  scriptDir,
  outputSubdir,
  defaultPort = defaultRealLoginSmokePort,
} = {}) {
  const webDir = path.resolve(scriptDir, '..')
  const repoDir = path.resolve(webDir, '..')
  const serverDir = path.resolve(repoDir, 'server')
  const outputDir = path.resolve(webDir, 'output', 'playwright', outputSubdir)
  const devServerPort = Number(process.env.REAL_LOGIN_SMOKE_PORT || defaultPort)
  const externalBaseURL = normalizeSmokeURL({
    raw: process.env.REAL_LOGIN_SMOKE_BASE_URL,
    label: 'REAL_LOGIN_SMOKE_BASE_URL',
    fallback: '',
  })
  const baseURL = externalBaseURL || `http://127.0.0.1:${devServerPort}`
  const backendHealthURL = normalizeSmokeURL({
    raw: process.env.REAL_LOGIN_SMOKE_BACKEND_HEALTH_URL,
    label: 'REAL_LOGIN_SMOKE_BACKEND_HEALTH_URL',
    fallback: 'http://127.0.0.1:8300/healthz',
  })
  const backendAuthURL = new URL('/rpc/auth', backendHealthURL).toString()
  const headless = process.env.REAL_LOGIN_SMOKE_HEADED !== '1'

  let devServerProcess = null
  let devServerLogs = ''

  async function prepare() {
    await fs.mkdir(outputDir, { recursive: true })
    await ensureBackendReady(backendHealthURL)
    const credentials = await resolveAdminCredentials({
      serverDir,
      backendAuthURL,
    })

    if (!externalBaseURL) {
      devServerProcess = startDevServer({
        webDir,
        devServerPort,
        onLog: (chunk) => {
          devServerLogs += chunk
        },
      })
      await waitForServer(baseURL, () => devServerLogs, outputSubdir)
    }

    return credentials
  }

  async function cleanup() {
    if (!devServerProcess) {
      return
    }

    devServerProcess.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => {
        devServerProcess.once('exit', resolve)
      }),
      delay(5_000),
    ])
    devServerProcess = null
  }

  return {
    baseURL,
    headless,
    outputDir,
    prepare,
    cleanup,
  }
}

export async function buildRealLoginSmokePreflightReport({
  defaultPort = defaultRealLoginSmokePort,
} = {}) {
  const serverDir = path.resolve(repoDir, 'server')
  const backendHealthURL = normalizeSmokeURL({
    raw: process.env.REAL_LOGIN_SMOKE_BACKEND_HEALTH_URL,
    label: 'REAL_LOGIN_SMOKE_BACKEND_HEALTH_URL',
    fallback: 'http://127.0.0.1:8300/healthz',
  })
  const externalBaseURL = normalizeSmokeURL({
    raw: process.env.REAL_LOGIN_SMOKE_BASE_URL,
    label: 'REAL_LOGIN_SMOKE_BASE_URL',
    fallback: '',
  })
  const devServerPort = Number(process.env.REAL_LOGIN_SMOKE_PORT || defaultPort)
  const baseURL = externalBaseURL || `http://127.0.0.1:${devServerPort}`
  const credentialEnvPresent = Boolean(
    String(process.env.REAL_LOGIN_ADMIN_USERNAME || '').trim() &&
      String(process.env.REAL_LOGIN_ADMIN_PASSWORD || '').trim()
  )
  const configCandidates = await Promise.all(
    [
      path.resolve(serverDir, 'configs', 'dev', 'config.local.yaml'),
      path.resolve(serverDir, 'configs', 'dev', 'config.yaml'),
    ].map(async (configPath) =>
      fs
        .stat(configPath)
        .then((stats) => ({
          path: path.relative(repoDir, configPath),
          exists: true,
          size: stats.size,
        }))
        .catch((error) => ({
          path: path.relative(repoDir, configPath),
          exists: false,
          size: 0,
          error:
            error?.code === 'ENOENT' ? '' : String(error?.message || error),
        }))
    )
  )
  const backendHealth = await probeBackendHealth(backendHealthURL)
  const blockers = []

  if (!backendHealth.ok) {
    blockers.push('backend-health-unreachable')
  }
  if (!credentialEnvPresent && !configCandidates.some((item) => item.exists)) {
    blockers.push('missing-admin-credential-source')
  }

  return {
    scope: PREFLIGHT_SCOPE,
    generatedAt: new Date().toISOString(),
    writesDatabase: false,
    startsBrowser: false,
    startsDevServer: false,
    callsBackendHealth: true,
    callsAuthEndpoint: false,
    callsJSONRPCAuth: false,
    validatesCredentials: false,
    readsLocalConfig: false,
    readsPasswordValue: false,
    storesPasswordValue: false,
    storesAccessToken: false,
    storesAuthorizationHeader: false,
    backendHealthURL,
    backendHealth,
    baseURL,
    externalBaseURLConfigured: Boolean(externalBaseURL),
    credentialEnvPresent,
    presentCredentialEnvNames: credentialEnvPresent
      ? ['REAL_LOGIN_ADMIN_USERNAME', 'REAL_LOGIN_ADMIN_PASSWORD']
      : [],
    configCredentialCandidates: configCandidates,
    readyForCredentialedSmokeCandidate: blockers.length === 0,
    blockers,
    nextCommand: blockers.length
      ? 'Resolve blockers, then rerun this preflight before real login smoke.'
      : 'PATH=/usr/local/bin:$PATH pnpm --dir web smoke:purchase-contract-real-login',
    boundary:
      'This preflight only probes backend health and credential-source presence. It does not read config contents, read password values, validate credentials, call auth JSON-RPC, start Vite, start Playwright, log in, write database rows, or prove downstream browser smoke behavior.',
  }
}

async function probeBackendHealth(backendHealthURL) {
  try {
    const response = await fetch(backendHealthURL, { redirect: 'manual' })
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      statusText: '',
      error: String(error?.message || error),
    }
  }
}

function normalizeSmokeURL({ raw, label, fallback }) {
  const value = String(raw || fallback || '').trim()
  if (!value) {
    return ''
  }
  const url = new URL(value)
  if (url.username || url.password) {
    throw new Error(`${label} must not contain username or password`)
  }
  return value
}

export function attachErrorCollectors(page) {
  const errors = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console error: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => {
    errors.push(`page error: ${error.message}`)
  })

  return errors
}

export async function verifyPdfDownloadButton(page, { timeout = 15_000 } = {}) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout }),
    page.getByRole('button', { name: '下载 PDF' }).click(),
  ])
  const suggestedFilename = download.suggestedFilename()
  const failure = await download.failure().catch((error) => {
    return String(error?.message || error)
  })

  assert.equal(failure, null, `PDF 下载失败: ${failure}`)
  assert.match(
    suggestedFilename,
    /\.pdf$/i,
    `PDF 下载文件名应以 .pdf 结尾: ${suggestedFilename}`
  )

  return {
    suggestedFilename,
  }
}

export async function verifyPrintButtonInvokesWindowPrint(
  page,
  { timeout = 15_000 } = {}
) {
  await page.evaluate(() => {
    window.__PLUSH_PRINT_SMOKE_PRINT_CALLS__ = 0
    window.__PLUSH_PRINT_SMOKE_ORIGINAL_PRINT__ = window.print
    window.print = () => {
      window.__PLUSH_PRINT_SMOKE_PRINT_CALLS__ += 1
    }
  })

  try {
    await page.getByRole('button', { name: '打印', exact: true }).click({
      timeout,
    })
    const printCalls = await page.evaluate(() => {
      return Number(window.__PLUSH_PRINT_SMOKE_PRINT_CALLS__ || 0)
    })
    assert.equal(printCalls, 1, '打印按钮必须调用当前窗口的 window.print()')
    return { printCalls }
  } finally {
    await page.evaluate(() => {
      if (window.__PLUSH_PRINT_SMOKE_ORIGINAL_PRINT__) {
        window.print = window.__PLUSH_PRINT_SMOKE_ORIGINAL_PRINT__
      }
      delete window.__PLUSH_PRINT_SMOKE_PRINT_CALLS__
      delete window.__PLUSH_PRINT_SMOKE_ORIGINAL_PRINT__
    })
  }
}

export async function loginAsAdmin(page, credentials, baseURL) {
  await page.goto(new URL('/admin-login', `${baseURL}/`).toString(), {
    waitUntil: 'domcontentloaded',
  })
  await page.getByLabel('账号').fill(credentials.username)
  await page.locator('input[type="password"]').fill(credentials.password)

  const submitButton = page.locator('button[type="submit"]').first()

  await Promise.all([
    page.waitForFunction(
      () => window.location.pathname === '/erp/dashboard',
      null,
      { timeout: 15_000 }
    ),
    submitButton.click(),
  ])

  await waitForAdminDashboardReady(page)
}

export async function waitForAdminDashboardReady(page) {
  await page.getByRole('heading', { name: '工作台', exact: true }).waitFor({
    state: 'visible',
    timeout: 15_000,
  })
}

export async function safeScreenshot(page, outputDir, fileName) {
  try {
    await page.screenshot({
      path: path.resolve(outputDir, fileName),
      fullPage: true,
    })
  } catch {
    // 截图失败时不覆盖主错误。
  }
}

export function resolvePositiveInteger(raw, fallback) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return Math.round(parsed)
}

async function resolveAdminCredentials({ serverDir, backendAuthURL }) {
  const envUsername = String(process.env.REAL_LOGIN_ADMIN_USERNAME || '').trim()
  const envPassword = String(process.env.REAL_LOGIN_ADMIN_PASSWORD || '').trim()

  if (envUsername && envPassword) {
    await assertAdminCredentialsUsable({
      credentials: {
        username: envUsername,
        password: envPassword,
      },
      backendAuthURL,
    })
    return {
      username: envUsername,
      password: envPassword,
    }
  }

  const configCandidates = [
    path.resolve(serverDir, 'configs', 'dev', 'config.local.yaml'),
    path.resolve(serverDir, 'configs', 'dev', 'config.yaml'),
  ]

  for (const configPath of configCandidates) {
    try {
      const raw = await fs.readFile(configPath, 'utf8')
      const credentials = parseAdminCredentialsFromYaml(raw)
      if (credentials.username && credentials.password) {
        const usable = await isAdminCredentialsUsable({
          credentials,
          backendAuthURL,
        })
        if (usable) {
          return credentials
        }
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error
      }
    }
  }

  throw new Error(
    '未找到真实管理员账号。请设置 REAL_LOGIN_ADMIN_USERNAME / REAL_LOGIN_ADMIN_PASSWORD，或补齐 server/configs/dev/config.local.yaml。'
  )
}

async function assertAdminCredentialsUsable({ credentials, backendAuthURL }) {
  const usable = await isAdminCredentialsUsable({ credentials, backendAuthURL })
  if (!usable) {
    throw new Error(
      `真实登录烟测前置检查失败：管理员账号 ${credentials.username} 无法通过 /rpc/auth.admin_login 校验，请确认用户名和密码。`
    )
  }
}

function parseAdminCredentialsFromYaml(raw) {
  const stack = []
  let username = ''
  let password = ''

  for (const line of String(raw || '').split('\n')) {
    const trimmedLine = line.trim()
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue
    }

    const match = line.match(/^(\s*)([A-Za-z0-9_]+):\s*(.*)$/)
    if (!match) {
      continue
    }

    const indent = match[1].length
    const key = match[2]
    const value = match[3].trim()

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop()
    }

    const pathParts = [...stack.map((item) => item.key), key]
    const currentPath = pathParts.join('.')

    if (!value) {
      stack.push({ key, indent })
      continue
    }

    const normalizedValue = value
      .replace(/\s+#.*$/, '')
      .replace(/^['"]/, '')
      .replace(/['"]$/, '')

    if (currentPath === 'data.auth.admin.username') {
      username = normalizedValue
    }
    if (currentPath === 'data.auth.admin.password') {
      password = normalizedValue
    }
  }

  return { username, password }
}

async function isAdminCredentialsUsable({ credentials, backendAuthURL }) {
  const payload = {
    jsonrpc: '2.0',
    id: 'real-login-smoke',
    method: 'admin_login',
    params: {
      username: credentials.username,
      password: credentials.password,
    },
  }

  try {
    const response = await fetch(backendAuthURL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      return false
    }
    const json = await response.json()
    return json?.result?.code === 0
  } catch {
    return false
  }
}

async function ensureBackendReady(backendHealthURL) {
  let response
  try {
    response = await fetch(backendHealthURL, {
      redirect: 'manual',
    })
  } catch {
    throw new Error(
      `真实登录烟测前置检查失败：无法访问后端健康检查 ${backendHealthURL}。请先启动 server（make run）。`
    )
  }

  if (!response.ok) {
    throw new Error(
      `真实登录烟测前置检查失败：后端健康检查返回 ${response.status}，不是可用状态。`
    )
  }
}

function startDevServer({ webDir, devServerPort, onLog }) {
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
    onLog(chunk.toString())
  })
  child.stderr.on('data', (chunk) => {
    onLog(chunk.toString())
  })

  return child
}

async function runCli() {
  const args = process.argv.slice(2)
  if (args.includes('--print-input-template')) {
    console.log(JSON.stringify(buildRealLoginSmokeInputTemplate(), null, 2))
    return
  }
  const preflightReportPath = resolveOptionalReportPath(args)
  if (preflightReportPath) {
    const report = await buildRealLoginSmokePreflightReport()
    await writeJSONReport(preflightReportPath, report)
    console.log(
      `[real-login-smoke-shared] preflight written: ${path.relative(repoDir, preflightReportPath)}`
    )
    if (report.blockers.length > 0) {
      console.log(
        `[real-login-smoke-shared] blockers: ${report.blockers.join(', ')}`
      )
    }
    return
  }
  if (args.includes('-h') || args.includes('--help')) {
    console.log(
      [
        'Usage:',
        '  node web/scripts/realLoginSmokeShared.mjs --print-input-template',
        '  node web/scripts/realLoginSmokeShared.mjs --preflight-report output/real-login-smoke-shared/preflight.json',
        '',
        'This shared helper is normally imported by real login smoke scripts. The preflight report probes only backend health and credential-source presence.',
      ].join('\n')
    )
    return
  }
  throw new Error(
    'realLoginSmokeShared.mjs is a shared helper. Use --print-input-template or run a concrete pnpm smoke:* script.'
  )
}

function resolveOptionalReportPath(args) {
  let reportPath = ''
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (
      token === '--print-input-template' ||
      token === '-h' ||
      token === '--help'
    ) {
      continue
    }
    if (token === '--preflight-report') {
      const value = args[index + 1]
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
  const resolved = path.resolve(repoDir, reportPath)
  const relative = path.relative(repoDir, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('--preflight-report must stay inside the repository')
  }
  return resolved
}

async function writeJSONReport(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(`${filePath}.tmp`, `${JSON.stringify(data, null, 2)}\n`)
  await fs.rename(`${filePath}.tmp`, filePath)
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli().catch((error) => {
    console.error(error?.message || error)
    process.exit(1)
  })
}

async function waitForServer(url, readLogs, smokeName) {
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
    `[${smokeName}] 无法启动前端预览：${lastError}\n最近 vite 输出：\n${tailLogs(readLogs())}`
  )
}

function tailLogs(logs, maxLines = 40) {
  return String(logs || '')
    .trim()
    .split('\n')
    .slice(-maxLines)
    .join('\n')
}
