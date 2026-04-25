import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

export function createRealLoginSmokeRuntime({
  scriptDir,
  outputSubdir,
  defaultPort = 4174,
} = {}) {
  const webDir = path.resolve(scriptDir, '..')
  const repoDir = path.resolve(webDir, '..')
  const serverDir = path.resolve(repoDir, 'server')
  const outputDir = path.resolve(webDir, 'output', 'playwright', outputSubdir)
  const devServerPort = Number(process.env.REAL_LOGIN_SMOKE_PORT || defaultPort)
  const externalBaseURL = String(
    process.env.REAL_LOGIN_SMOKE_BASE_URL || ''
  ).trim()
  const baseURL = externalBaseURL || `http://127.0.0.1:${devServerPort}`
  const backendHealthURL = String(
    process.env.REAL_LOGIN_SMOKE_BACKEND_HEALTH_URL ||
      'http://127.0.0.1:8200/healthz'
  ).trim()
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

export async function loginAsAdmin(page, credentials, baseURL) {
  await page.goto(new URL('/admin-login', `${baseURL}/`).toString(), {
    waitUntil: 'domcontentloaded',
  })
  await page.getByLabel('管理员账号').fill(credentials.username)
  await page.getByLabel('密码').fill(credentials.password)

  const submitButton = page.locator('button[type="submit"]').first()

  await Promise.all([
    page.waitForFunction(
      () => window.location.pathname === '/erp/dashboard',
      null,
      { timeout: 15_000 }
    ),
    submitButton.click(),
  ])

  await page.getByRole('heading', { name: '任务看板' }).waitFor({
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
  } catch (error) {
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
  } catch (error) {
    return false
  }
}

async function ensureBackendReady(backendHealthURL) {
  let response
  try {
    response = await fetch(backendHealthURL, {
      redirect: 'manual',
    })
  } catch (error) {
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
