import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

import { chromium } from 'playwright'

const webDir = path.resolve(import.meta.dirname, '..')
const repoDir = path.resolve(webDir, '..')
const serverDir = path.resolve(repoDir, 'server')
const outputDir = path.resolve(
  webDir,
  'output',
  'playwright',
  'purchase-contract-real-login-smoke'
)
const devServerPort = Number(process.env.REAL_LOGIN_SMOKE_PORT || 4174)
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

async function main() {
  await fs.mkdir(outputDir, { recursive: true })

  await ensureBackendReady()
  const credentials = await resolveAdminCredentials()

  try {
    if (!externalBaseURL) {
      devServerProcess = startDevServer()
      await waitForServer(baseURL)
    }

    const browser = await chromium.launch({ headless })
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
      })
      const errors = attachErrorCollectors(page)

      try {
        await loginAsAdmin(page, credentials)
        await verifyPurchaseContractAmountEditing(page)
        await verifyPurchaseContractPreviewPopup(page)
        assert.deepEqual(errors, [], '页面出现控制台或运行时错误')
        await page.screenshot({
          path: path.resolve(outputDir, 'purchase-contract-real-login.png'),
          fullPage: true,
        })
      } catch (error) {
        await safeScreenshot(page, 'purchase-contract-real-login-failed.png')
        throw error
      } finally {
        await page.close()
      }
    } finally {
      await browser.close()
    }

    console.log(
      `[purchase-contract-real-login-smoke] 通过，已使用真实管理员登录验证采购合同金额编辑链路（账号：${credentials.username}）。`
    )
  } finally {
    await stopDevServer()
  }
}

function attachErrorCollectors(page) {
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

async function loginAsAdmin(page, credentials) {
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

  await page.getByRole('heading', { name: '毛绒 ERP 任务看板' }).waitFor({
    state: 'visible',
    timeout: 15_000,
  })
}

async function verifyPurchaseContractAmountEditing(page) {
  await page.goto(
    new URL(
      '/erp/print-workspace/material-purchase-contract?draft=fresh',
      `${baseURL}/`
    ).toString(),
    {
      waitUntil: 'domcontentloaded',
    }
  )

  await page.getByText('当前记录字段（可编辑）').waitFor({
    state: 'visible',
    timeout: 15_000,
  })
  await page.getByText('采购合同').first().waitFor({
    state: 'visible',
    timeout: 15_000,
  })

  const firstDetailRow = page
    .locator('.erp-print-shell__detail-table--purchase tbody tr')
    .first()
  await firstDetailRow
    .locator('.erp-print-shell__currency-prefix')
    .waitFor({ state: 'visible', timeout: 15_000 })
  const quantityInput = firstDetailRow.locator('input').nth(0)
  const unitPriceInput = firstDetailRow.locator('input').nth(1)
  const amountInput = firstDetailRow.locator('input').nth(2)

  await amountInput.fill('123.45')
  await expectMaterialContractAmounts(page, {
    rowAmount: '123.45',
    totalAmount: '123.45',
  })

  await quantityInput.fill('4000')
  await unitPriceInput.fill('0.5')
  await expectMaterialContractAmounts(page, {
    rowAmount: '2000.00',
    totalAmount: '2000.00',
  })
}

async function verifyPurchaseContractPreviewPopup(page) {
  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 15_000 }),
    page.getByRole('button', { name: '在线预览 PDF' }).click(),
  ])

  await popup.waitForLoadState('domcontentloaded')
  await popup.waitForURL('**/pdf-preview-shell.html**', { timeout: 15_000 })
  await popup
    .locator('iframe.pdf-preview-frame')
    .waitFor({ state: 'visible', timeout: 15_000 })
  await popup.close()
}

async function expectMaterialContractAmounts(page, expected) {
  await page.waitForFunction(
    ({ rowAmount, totalAmount }) => {
      const rowAmountText = document
        .querySelector('.erp-material-contract-table tbody tr td:nth-child(11)')
        ?.textContent?.trim()
      const totalAmountText = document
        .querySelector('.erp-material-contract-table__total td:nth-child(4)')
        ?.textContent?.trim()
      return rowAmountText === rowAmount && totalAmountText === totalAmount
    },
    expected,
    { timeout: 15_000 }
  )

  const actual = await page.evaluate(() => ({
    rowAmount:
      document
        .querySelector('.erp-material-contract-table tbody tr td:nth-child(11)')
        ?.textContent?.trim() || '',
    totalAmount:
      document
        .querySelector('.erp-material-contract-table__total td:nth-child(4)')
        ?.textContent?.trim() || '',
  }))

  assert.equal(actual.rowAmount, expected.rowAmount)
  assert.equal(actual.totalAmount, expected.totalAmount)
}

async function resolveAdminCredentials() {
  const envUsername = String(process.env.REAL_LOGIN_ADMIN_USERNAME || '').trim()
  const envPassword = String(process.env.REAL_LOGIN_ADMIN_PASSWORD || '').trim()

  if (envUsername && envPassword) {
    await assertAdminCredentialsUsable({
      username: envUsername,
      password: envPassword,
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
        const usable = await isAdminCredentialsUsable(credentials)
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

async function assertAdminCredentialsUsable(credentials) {
  const usable = await isAdminCredentialsUsable(credentials)
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

async function isAdminCredentialsUsable(credentials) {
  const payload = {
    jsonrpc: '2.0',
    id: 'purchase-contract-real-login-smoke',
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

async function ensureBackendReady() {
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

  return child
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
    `[purchase-contract-real-login-smoke] 无法启动前端预览：${lastError}\n最近 vite 输出：\n${tailLogs(devServerLogs)}`
  )
}

async function stopDevServer() {
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

async function safeScreenshot(page, fileName) {
  try {
    await page.screenshot({
      path: path.resolve(outputDir, fileName),
      fullPage: true,
    })
  } catch (error) {
    // 截图失败时不覆盖主错误。
  }
}

function tailLogs(logs, maxLines = 40) {
  return String(logs || '')
    .trim()
    .split('\n')
    .slice(-maxLines)
    .join('\n')
}

await main()
