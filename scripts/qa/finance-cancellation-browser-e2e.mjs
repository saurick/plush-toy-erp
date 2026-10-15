import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function localURL(raw, name) {
  const url = new URL(String(raw || ''))
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error(`${name} 只允许本机隔离验收地址`)
  }
  return url
}

export async function runFinanceCancellationBrowserE2E({
  baseURL,
  backendURL,
  username,
  password,
  customerKey,
  currentFactNo,
  historicalFactNo,
  reason = '浏览器验收：客户确认本次对账作废',
}) {
  const frontend = localURL(baseURL, 'baseURL')
  const backend = localURL(backendURL, 'backendURL')
  if (
    !username ||
    !password ||
    !customerKey ||
    !currentFactNo ||
    !historicalFactNo
  ) {
    throw new Error('缺少本地验收账号、客户运行上下文或财务记录编号')
  }
  const requireFromWeb = createRequire(path.join(repoRoot, 'web/package.json'))
  const { chromium } = requireFromWeb('playwright')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(
    ({ runtimeCustomerKey }) => {
      window.__PLUSH_ERP_CUSTOMER_CONFIG__ = Object.freeze({
        customerKey: runtimeCustomerKey,
      })
    },
    { runtimeCustomerKey: customerKey }
  )
  const page = await context.newPage()
  const blocking = []
  let cancelResponse = null
  page.on('console', (message) => {
    if (message.type() === 'error') blocking.push(`console:${message.text()}`)
  })
  page.on('pageerror', (error) => blocking.push(`pageerror:${error.message}`))
  page.on('response', async (response) => {
    if (
      response.url().includes('/rpc/operational_fact') &&
      response.request().postData()?.includes('cancel_finance_fact')
    ) {
      cancelResponse = {
        status: response.status(),
        body: await response.json().catch(() => null),
      }
    }
  })
  await page.route('**/rpc/**', async (route) => {
    const url = new URL(route.request().url())
    url.protocol = backend.protocol
    url.hostname = backend.hostname
    url.port = backend.port
    await route.continue({ url: url.toString() })
  })
  try {
    await page.goto(new URL('/admin-login', frontend).toString(), { waitUntil: 'domcontentloaded' })
    await page.getByLabel('账号').fill(username)
    await page.locator('input[type=password]').fill(password)
    await Promise.all([
      page.waitForURL((url) => url.pathname !== '/admin-login', { timeout: 15_000 }),
      page.locator('button[type=submit]').click(),
    ])
    await page.goto(new URL('/erp/finance/reconciliation', frontend).toString(), { waitUntil: 'domcontentloaded' })
    let currentRow = page.locator('tr').filter({ hasText: currentFactNo }).first()
    if (!(await currentRow.isVisible().catch(() => false))) {
      await page.getByPlaceholder('搜索单号').fill(currentFactNo)
      currentRow = page.locator('tr').filter({ hasText: currentFactNo }).first()
    }
    await currentRow.waitFor({ state: 'visible', timeout: 15_000 })
    await currentRow.click()
    await page.locator('button.ant-btn-dangerous:visible').first().click()
    const modal = page.locator('.ant-modal:visible').filter({ hasText: '取消财务记录' })
    await modal.locator('button').filter({ hasText: '确认取消' }).click()
    await page.getByText('请填写取消原因', { exact: true }).waitFor({ state: 'visible' })
    await modal.getByPlaceholder('请填写客户、供应商或账款调整的业务原因').fill(reason)
    await modal.locator('button').filter({ hasText: '确认取消' }).click()
    await modal.waitFor({ state: 'hidden', timeout: 15_000 })
    await currentRow.getByText('已取消', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
    await currentRow.getByText(new RegExp(`${username}.*${reason}`)).waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByPlaceholder('搜索单号').fill(historicalFactNo)
    const historicalRow = page.locator('tr').filter({ hasText: historicalFactNo }).first()
    await historicalRow.getByText('历史记录，取消审计信息缺失', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
    if (!cancelResponse || cancelResponse.status !== 200 || cancelResponse.body?.result?.code !== 0) {
      throw new Error('取消接口未返回成功结果')
    }
    if (blocking.length > 0) throw new Error(blocking.join('\n'))
  } finally {
    await browser.close()
  }
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  runFinanceCancellationBrowserE2E({
    baseURL: process.env.FINANCE_CANCEL_E2E_BASE_URL,
    backendURL: process.env.FINANCE_CANCEL_E2E_BACKEND_URL,
    username: process.env.FINANCE_CANCEL_E2E_USERNAME,
    password: process.env.FINANCE_CANCEL_E2E_PASSWORD,
    customerKey: process.env.FINANCE_CANCEL_E2E_CUSTOMER_KEY,
    currentFactNo: process.env.FINANCE_CANCEL_E2E_CURRENT_FACT_NO,
    historicalFactNo: process.env.FINANCE_CANCEL_E2E_HISTORICAL_FACT_NO,
  })
    .then(() => console.log('finance cancellation real-backend browser e2e passed'))
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
