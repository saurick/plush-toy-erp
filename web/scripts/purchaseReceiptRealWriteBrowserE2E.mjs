import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

import { chromium } from 'playwright'
import {
  attachErrorCollectors,
  createRealLoginSmokeRuntime,
  safeScreenshot,
} from './realLoginSmokeShared.mjs'

const DEFAULT_PORT = 4196
const INPUT_TEMPLATE_SCOPE =
  'purchase-receipt-real-write-browser-e2e-input-template'
const PREFLIGHT_SCOPE =
  'purchase-receipt-real-write-browser-e2e-preflight-report'
const webDir = path.resolve(import.meta.dirname, '..')
const repoRoot = path.resolve(webDir, '..')

const runID = `PR-BROWSER-${Date.now()}`
const receiptNo = runID
const lotNo = `${runID}-LOT`
const quantity = '2'
const argv = process.argv.slice(2)
const args = new Set(argv)
const printInputTemplate = args.has('--print-input-template')
const printHelp = args.has('-h') || args.has('--help')
const preflightReportPath = resolveOptionalReportPath(argv)
const seedCoreDemo = args.has('--seed-core-demo')
const persistentTestDataAccepted =
  args.has('--accept-persistent-test-data') ||
  process.env.PURCHASE_RECEIPT_E2E_ACCEPT_PERSISTENT_TEST_DATA === '1'
const externalTargetAllowed =
  args.has('--allow-external-base-url') ||
  process.env.PURCHASE_RECEIPT_E2E_ALLOW_EXTERNAL_BASE_URL === '1'
const cleanupPolicy =
  '采购入库是不可物理删除的事实源单据；本脚本过账后只做取消冲正，保留带 PR-BROWSER-* 前缀的可追踪模拟单据。'

export function buildInputTemplate() {
  return {
    scope: INPUT_TEMPLATE_SCOPE,
    writesDatabase: false,
    callsBackend: false,
    startsBrowser: false,
    startsDevServer: false,
    readsLocalConfig: false,
    downstreamWritesDatabase: true,
    downstreamStartsBrowser: true,
    downstreamCallsBackend: true,
    requiresPersistentTestDataAcceptance: true,
    defaultPort: DEFAULT_PORT,
    generatedRecordPrefix: 'PR-BROWSER-*',
    cleanupPolicy,
    safeTargetPolicy:
      'Real smoke defaults to localhost / 127.0.0.1 / ::1 only. Prepared development or test targets require --allow-external-base-url together with persistent test data acceptance. Never run this against production or a formal customer target.',
    secretInputs: [
      'REAL_LOGIN_ADMIN_USERNAME/REAL_LOGIN_ADMIN_PASSWORD or server/configs/dev/config.local.yaml admin credentials',
    ],
    optionalInputs: [
      'REAL_LOGIN_SMOKE_BASE_URL',
      'REAL_LOGIN_SMOKE_BACKEND_HEALTH_URL',
      'REAL_LOGIN_SMOKE_PORT',
      'REAL_LOGIN_SMOKE_HEADED',
      'PURCHASE_RECEIPT_E2E_ACCEPT_PERSISTENT_TEST_DATA',
      'PURCHASE_RECEIPT_E2E_ALLOW_EXTERNAL_BASE_URL',
      '--preflight-report',
      '--seed-core-demo',
    ],
    commands: [
      'PATH=/usr/local/bin:$PATH node web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs --print-input-template',
      'PATH=/usr/local/bin:$PATH node web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs --preflight-report output/purchase-receipt-real-write-browser-e2e/preflight.json',
      "REAL_LOGIN_ADMIN_USERNAME='<local-admin>' REAL_LOGIN_ADMIN_PASSWORD='<local-password>' PATH=/usr/local/bin:$PATH pnpm --dir web smoke:purchase-receipt-real-write",
      "REAL_LOGIN_ADMIN_USERNAME='<local-admin>' REAL_LOGIN_ADMIN_PASSWORD='<local-password>' PATH=/usr/local/bin:$PATH pnpm --dir web smoke:purchase-receipt-real-write -- --seed-core-demo",
      "REAL_LOGIN_ADMIN_USERNAME='<local-admin>' REAL_LOGIN_ADMIN_PASSWORD='<local-password>' PATH=/usr/local/bin:$PATH node web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs --accept-persistent-test-data",
      "REAL_LOGIN_ADMIN_USERNAME='<local-admin>' REAL_LOGIN_ADMIN_PASSWORD='<local-password>' REAL_LOGIN_SMOKE_BASE_URL='http://127.0.0.1:4196' PATH=/usr/local/bin:$PATH node web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs --accept-persistent-test-data",
    ],
    boundary:
      'This template only prints purchase receipt browser E2E prerequisites. It does not read local config, validate credentials, call backend health/auth endpoints, start Vite, start Playwright, log in, create purchase receipts, post inventory facts, cancel/reverse receipts, write reports, or write database rows. The real smoke writes local/development simulated purchase receipt facts and requires explicit persistent test data acceptance.',
  }
}

export async function buildPreflightReport() {
  const baseURL = resolveSmokeBaseURL()
  const backendHealthURL = resolveBackendHealthURL()
  const backendHealth = await probeURL(backendHealthURL)
  const credentialEnvNames = [
    'REAL_LOGIN_ADMIN_USERNAME',
    'REAL_LOGIN_ADMIN_PASSWORD',
  ]
  const presentCredentialEnvNames = credentialEnvNames.filter((name) =>
    Boolean(String(process.env[name] || '').trim())
  )
  const credentialEnvComplete =
    presentCredentialEnvNames.length === credentialEnvNames.length
  const safeTarget = analyzeSafeWriteTarget(baseURL)
  const blockers = []
  if (!persistentTestDataAccepted) {
    blockers.push('missing-persistent-test-data-acceptance')
  }
  if (!credentialEnvComplete) {
    blockers.push('missing-admin-credential-env')
  }
  if (!backendHealth.ok) {
    blockers.push('backend-health-unreachable')
  }
  if (!safeTarget.allowed) {
    blockers.push('external-base-url-not-allowed')
  }

  return {
    scope: PREFLIGHT_SCOPE,
    generatedAt: new Date().toISOString(),
    writesDatabase: false,
    callsJSONRPC: false,
    startsBrowser: false,
    startsDevServer: false,
    readsLocalConfig: false,
    readsPasswordValue: false,
    storesPasswordValue: false,
    storesAccessToken: false,
    storesAuthorizationHeader: false,
    baseURL,
    backendHealthURL,
    backendHealth,
    needsManagedDevServer: !String(
      process.env.REAL_LOGIN_SMOKE_BASE_URL || ''
    ).trim(),
    persistentTestDataAccepted,
    externalTargetAllowed,
    safeTarget,
    credentialEnvComplete,
    presentCredentialEnvNames,
    generatedRecordPrefix: 'PR-BROWSER-*',
    cleanupPolicy,
    readyForRealSmoke: blockers.length === 0,
    blockers,
    nextCommand: blockers.length
      ? 'Resolve blockers, then rerun this preflight before real browser write smoke.'
      : "REAL_LOGIN_ADMIN_USERNAME='<local-admin>' REAL_LOGIN_ADMIN_PASSWORD='<local-password>' PATH=/usr/local/bin:$PATH pnpm --dir web smoke:purchase-receipt-real-write",
  }
}

async function main() {
  const runtime = createRealLoginSmokeRuntime({
    scriptDir: import.meta.dirname,
    outputSubdir: 'purchase-receipt-real-write-browser-e2e',
    defaultPort: DEFAULT_PORT,
  })
  assertSafePersistentWriteTarget(runtime.baseURL)

  const report = {
    name: 'purchase-receipt-real-write-browser-e2e',
    run_id: runID,
    receipt_no: receiptNo,
    lot_no: lotNo,
    seed_core_demo: seedCoreDemo,
    base_url: runtime.baseURL,
    persistent_test_data_accepted: persistentTestDataAccepted,
    cleanup_policy: cleanupPolicy,
    steps: [],
    status: 'running',
    started_at: new Date().toISOString(),
  }

  if (seedCoreDemo) {
    await seedCoreDemoData(report)
  }

  const credentials = await runtime.prepare()

  try {
    const browser = await chromium.launch({ headless: runtime.headless })
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
      })
      const errors = attachErrorCollectors(page)

      try {
        await loginAsAdminForReceiptE2E(page, credentials, runtime.baseURL)
        report.steps.push({ key: 'login', status: 'pass' })

        const refs = await resolveReferenceData(page)
        report.references = {
          material_id: refs.material.id,
          unit_id: refs.unit.id,
          warehouse_id: refs.warehouse.id,
        }
        report.steps.push({ key: 'reference-data', status: 'pass' })

        const draftReceipt = await createReceiptWithItemForUI(
          page,
          refs,
          runtime.baseURL
        )
        report.receipt_id = draftReceipt.id
        report.steps.push({
          key: 'create-draft-with-item-rpc',
          status: 'pass',
        })

        const postedReceipt = await postReceiptFromUI(page)
        report.receipt_id = postedReceipt.id
        report.steps.push({ key: 'post-ui', status: 'pass' })

        await verifyInventoryTxns(page, postedReceipt.id, 1)
        report.steps.push({ key: 'inventory-txn-after-post', status: 'pass' })

        const cancelledReceipt = await cancelReceiptFromUI(page)
        assert.equal(cancelledReceipt.status, 'CANCELLED')
        report.steps.push({ key: 'cancel-ui', status: 'pass' })

        await verifyInventoryTxns(page, cancelledReceipt.id, 2)
        report.steps.push({
          key: 'inventory-reversal-after-cancel',
          status: 'pass',
        })

        await verifyTableShowsCancelledReceipt(page)
        report.steps.push({ key: 'ui-cancelled-row', status: 'pass' })

        assert.deepEqual(errors, [], '页面出现控制台或运行时错误')
        await page.screenshot({
          path: path.resolve(
            runtime.outputDir,
            'purchase-receipt-e2e-pass.png'
          ),
          fullPage: true,
        })
        report.status = 'pass'
        report.finished_at = new Date().toISOString()
      } catch (error) {
        report.status = 'fail'
        report.error = error?.stack || error?.message || String(error)
        report.finished_at = new Date().toISOString()
        await safeScreenshot(
          page,
          runtime.outputDir,
          'purchase-receipt-e2e-failed.png'
        )
        throw error
      } finally {
        await writeReport(report, runtime.outputDir)
        await page.close()
      }
    } finally {
      await browser.close()
    }

    console.log(
      [
        `[purchase-receipt-real-write-browser-e2e] 通过，采购入库 ${receiptNo} 已完成测试草稿准备、页面过账、取消冲正和库存流水校验。`,
        `[purchase-receipt-real-write-browser-e2e] ${cleanupPolicy}`,
      ].join('\n')
    )
  } finally {
    await runtime.cleanup()
  }
}

async function runCli() {
  if (printInputTemplate) {
    console.log(JSON.stringify(buildInputTemplate(), null, 2))
    return
  }

  if (printHelp) {
    console.log(
      [
        'Usage:',
        '  node web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs --print-input-template',
        '  node web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs --preflight-report output/purchase-receipt-real-write-browser-e2e/preflight.json',
        '  node web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs --accept-persistent-test-data [--seed-core-demo]',
        '',
        'This script runs a real browser E2E that persists local/development simulated purchase receipt facts. Use --print-input-template first when checking prerequisites.',
      ].join('\n')
    )
    return
  }

  if (preflightReportPath) {
    const report = await buildPreflightReport()
    await writeJSONReport(preflightReportPath, report)
    console.log(
      `[purchase-receipt-real-write-browser-e2e] preflight report written: ${path.relative(
        repoRoot,
        preflightReportPath
      )} ready=${report.readyForRealSmoke}`
    )
    return
  }

  await main()
}

function resolveOptionalReportPath(tokens) {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (
      token === '--print-input-template' ||
      token === '-h' ||
      token === '--help' ||
      token === '--accept-persistent-test-data' ||
      token === '--allow-external-base-url' ||
      token === '--seed-core-demo'
    ) {
      continue
    }
    const equalIndex = token.indexOf('=')
    const key = token.slice(2, equalIndex === -1 ? undefined : equalIndex)
    if (!token.startsWith('--')) {
      continue
    }
    if (key !== 'preflight-report') {
      continue
    }
    const value =
      equalIndex === -1 ? tokens[index + 1] : token.slice(equalIndex + 1)
    if (!value || String(value).startsWith('--')) {
      throw new Error('参数 --preflight-report 缺少值')
    }
    return resolveRepoOutputPath(value)
  }
  return ''
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

function resolveSmokeBaseURL() {
  const raw = String(process.env.REAL_LOGIN_SMOKE_BASE_URL || '').trim()
  return normalizeSmokeURL(
    raw ||
      `http://127.0.0.1:${Number(process.env.REAL_LOGIN_SMOKE_PORT || DEFAULT_PORT)}`,
    'REAL_LOGIN_SMOKE_BASE_URL'
  )
}

function resolveBackendHealthURL() {
  return normalizeSmokeURL(
    process.env.REAL_LOGIN_SMOKE_BACKEND_HEALTH_URL ||
      'http://127.0.0.1:8300/healthz',
    'REAL_LOGIN_SMOKE_BACKEND_HEALTH_URL'
  )
}

function normalizeSmokeURL(raw, label) {
  const url = new URL(String(raw || '').trim())
  if (url.username || url.password) {
    throw new Error(`${label} must not contain username or password`)
  }
  return url.toString().replace(/\/+$/u, '')
}

function analyzeSafeWriteTarget(baseURL) {
  const targetURL = new URL(baseURL)
  const safeHosts = new Set(['127.0.0.1', 'localhost', '::1'])
  const isLocalHost = safeHosts.has(targetURL.hostname)
  return {
    host: targetURL.hostname,
    isLocalHost,
    externalTargetAllowed,
    allowed: isLocalHost || externalTargetAllowed,
  }
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

async function writeJSONReport(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(`${filePath}.tmp`, `${JSON.stringify(payload, null, 2)}\n`)
  await fs.rename(`${filePath}.tmp`, filePath)
}

function assertSafePersistentWriteTarget(baseURL) {
  if (!persistentTestDataAccepted) {
    throw new Error(
      [
        '采购入库页面 e2e 会准备、过账并取消一张模拟入库单，事实单据不可物理删除。',
        '请显式确认可接受保留 PR-BROWSER-* 测试记录后再运行：',
        '  pnpm smoke:purchase-receipt-real-write',
        '或直接运行：',
        '  node web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs --accept-persistent-test-data',
      ].join('\n')
    )
  }

  const targetURL = new URL(baseURL)
  const safeHosts = new Set(['127.0.0.1', 'localhost', '::1'])
  if (!safeHosts.has(targetURL.hostname) && !externalTargetAllowed) {
    throw new Error(
      [
        `拒绝对非本地页面目标运行真实写入 e2e：${baseURL}`,
        '如果这是明确准备好的开发 / 测试环境，需同时显式传入：',
        '  --accept-persistent-test-data --allow-external-base-url',
        '禁止把该脚本直接跑到生产或目标客户环境。',
      ].join('\n')
    )
  }
}

async function seedCoreDemoData(report) {
  const repoDir = path.resolve(import.meta.dirname, '..', '..')
  const result = await runCommand('bash', ['scripts/seed-core-demo-data.sh'], {
    cwd: repoDir,
  })
  report.seed_core_demo_output = result.stdout.trim().split('\n').slice(-16)
}

async function loginAsAdminForReceiptE2E(page, credentials, baseURL) {
  await page.goto(new URL('/admin-login', `${baseURL}/`).toString(), {
    waitUntil: 'domcontentloaded',
  })
  await page.getByLabel('账号').fill(credentials.username)
  await page.locator('input[type="password"]').fill(credentials.password)

  await Promise.all([
    page.waitForFunction(
      () => window.location.pathname === '/erp/dashboard',
      null,
      { timeout: 15_000 }
    ),
    page.locator('button[type="submit"]').first().click(),
  ])

  await page.getByRole('heading', { name: '工作台' }).waitFor({
    state: 'visible',
    timeout: 15_000,
  })
}

function runCommand(command, args, { cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(
        new Error(
          `${command} ${args.join(' ')} failed with code ${code}\n${stderr}`
        )
      )
    })
  })
}

async function resolveReferenceData(page) {
  const materialsData = await rpc(page, 'masterdata', 'list_materials', {
    active_only: true,
    limit: 500,
  })
  const unitsData = await rpc(page, 'masterdata', 'list_units', { limit: 500 })
  const warehousesData = await rpc(page, 'masterdata', 'list_warehouses', {
    active_only: true,
    limit: 500,
  })

  const materials = materialsData?.materials || []
  const units = unitsData?.units || []
  const warehouses = warehousesData?.warehouses || []
  const material = materials.find((item) => item?.id > 0)
  const unit =
    units.find((item) => item?.id === material?.default_unit_id) ||
    units.find((item) => item?.id > 0)
  const warehouse = warehouses.find((item) => item?.id > 0)

  if (!material || !unit || !warehouse) {
    throw new Error(
      [
        '采购入库浏览器 e2e 缺少材料 / 单位 / 仓库前置数据。',
        '本地开发库可先执行：',
        '  bash /Users/simon/projects/plush-toy-erp/scripts/seed-core-demo-data.sh',
        '或本脚本追加参数：',
        '  pnpm smoke:purchase-receipt-real-write -- --seed-core-demo',
      ].join('\n')
    )
  }

  return { material, unit, warehouse }
}

async function createReceiptWithItemForUI(page, refs, baseURL) {
  const data = await rpc(
    page,
    'purchase',
    'create_purchase_receipt_with_items',
    {
      receipt_no: receiptNo,
      supplier_name: '浏览器 e2e 供应商',
      received_at: new Date().toISOString().slice(0, 10),
      note: `browser e2e ${runID}`,
      items: [
        {
          material_id: refs.material.id,
          warehouse_id: refs.warehouse.id,
          unit_id: refs.unit.id,
          lot_no: lotNo,
          quantity,
          source_line_no: 'BROWSER-E2E-1',
          unit_price: '3.50',
          amount: '7.00',
          note: 'browser e2e line item',
        },
      ],
    }
  )
  const receipt = data?.purchase_receipt
  assert.ok(receipt?.id, `创建采购入库测试草稿失败: ${JSON.stringify(data)}`)

  await page.goto(new URL('/erp/warehouse/inbound', `${baseURL}/`).toString(), {
    waitUntil: 'domcontentloaded',
  })
  await page.getByRole('heading', { name: '入库管理' }).waitFor({
    state: 'visible',
    timeout: 15_000,
  })
  await searchReceipt(page)
  await page
    .locator('.ant-table-tbody tr')
    .filter({ hasText: receiptNo })
    .click()
  await page
    .locator('.erp-business-selection-action-bar__tag')
    .filter({ hasText: receiptNo })
    .waitFor({ state: 'visible', timeout: 15_000 })
  return receipt
}

async function postReceiptFromUI(page) {
  await page.getByRole('button', { name: /过账入库/ }).click()
  await page.getByText('确认过账并写库存入库事实？').waitFor({
    state: 'visible',
    timeout: 15_000,
  })
  await confirmVisiblePopover(page, '确认过账并写库存入库事实？')
  await page.getByText('采购入库已过账').waitFor({
    state: 'visible',
    timeout: 15_000,
  })
  return waitForReceiptStatus(page, 'POSTED')
}

async function cancelReceiptFromUI(page) {
  await page.getByRole('button', { name: /取消入库/ }).click()
  await page.getByText('确认取消已过账入库并写库存冲正？').waitFor({
    state: 'visible',
    timeout: 15_000,
  })
  await confirmVisiblePopover(page, '确认取消已过账入库并写库存冲正？')
  await page.getByText('采购入库已取消').waitFor({
    state: 'visible',
    timeout: 15_000,
  })
  return waitForReceiptStatus(page, 'CANCELLED')
}

async function verifyTableShowsCancelledReceipt(page) {
  await searchReceipt(page)
  const row = page.locator('.ant-table-tbody tr').filter({ hasText: receiptNo })
  await row.first().waitFor({ state: 'visible', timeout: 15_000 })
  await row.first().getByText('已取消').waitFor({
    state: 'visible',
    timeout: 15_000,
  })
}

async function confirmVisiblePopover(page, title) {
  await page.getByText(title).waitFor({ state: 'visible', timeout: 15_000 })
  await page
    .locator('.ant-popover .ant-popconfirm-buttons .ant-btn-primary')
    .last()
    .click()
}

async function searchReceipt(page) {
  const searchInput = page.getByPlaceholder('搜索入库单')
  await searchInput.fill(receiptNo)
  await searchInput.press('Enter')
  await page
    .locator('.ant-table-tbody tr')
    .filter({ hasText: receiptNo })
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 })
}

async function waitForReceiptStatus(page, status) {
  const deadline = Date.now() + 15_000
  let lastReceipt = null
  while (Date.now() < deadline) {
    const data = await rpc(page, 'purchase', 'list_purchase_receipts', {
      keyword: receiptNo,
      limit: 10,
    })
    lastReceipt = (data?.purchase_receipts || []).find(
      (receipt) => receipt?.receipt_no === receiptNo
    )
    if (lastReceipt?.status === status) {
      return lastReceipt
    }
    await page.waitForTimeout(300)
  }
  throw new Error(
    `采购入库单 ${receiptNo} 未进入 ${status}，最后状态：${
      lastReceipt?.status || 'missing'
    }`
  )
}

async function verifyInventoryTxns(page, receiptID, minimumCount) {
  const data = await rpc(page, 'inventory', 'list_inventory_txns', {
    source_type: 'PURCHASE_RECEIPT',
    source_id: receiptID,
    limit: 20,
  })
  const txns = data?.inventory_txns || []
  assert.ok(
    txns.length >= minimumCount,
    `采购入库单 ${receiptNo} 预期至少 ${minimumCount} 条库存流水，实际 ${txns.length}`
  )
}

async function rpc(page, service, method, params = {}) {
  const maxAttempts = 4
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await page.evaluate(
        async ({ service, method, params }) => {
          const token = window.localStorage.getItem('admin_access_token') || ''
          const response = await window.fetch(`/rpc/${service}`, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: `browser-e2e-${Date.now()}`,
              method,
              params,
            }),
          })
          const json = await response.json()
          if (!response.ok) {
            const error = new Error(
              `HTTP ${response.status}: ${JSON.stringify(json)}`
            )
            error.status = response.status
            throw error
          }
          if (json?.result?.code !== 0) {
            throw new Error(
              `RPC ${service}.${method} failed: ${JSON.stringify(json?.result)}`
            )
          }
          return json?.result?.data || {}
        },
        { service, method, params }
      )
    } catch (error) {
      if (!String(error?.message || '').includes('HTTP 429')) {
        throw error
      }
      if (attempt === maxAttempts) {
        throw error
      }
      await delay(1_000 * attempt)
    }
  }
  throw new Error(`RPC ${service}.${method} failed after retries`)
}

async function writeReport(report, outputDir) {
  await fs.mkdir(outputDir, { recursive: true })
  const jsonPath = path.resolve(outputDir, 'report.json')
  const mdPath = path.resolve(outputDir, 'report.md')
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  await fs.writeFile(mdPath, renderMarkdownReport(report))
}

function renderMarkdownReport(report) {
  return [
    '# 采购入库页面真实写入 e2e',
    '',
    `- status: ${report.status}`,
    `- run_id: ${report.run_id}`,
    `- receipt_no: ${report.receipt_no}`,
    `- receipt_id: ${report.receipt_id || '-'}`,
    `- seed_core_demo: ${report.seed_core_demo}`,
    `- base_url: ${report.base_url}`,
    `- persistent_test_data_accepted: ${report.persistent_test_data_accepted}`,
    `- cleanup_policy: ${report.cleanup_policy}`,
    '',
    '## Steps',
    '',
    ...report.steps.map((step) => `- ${step.key}: ${step.status}`),
    '',
    report.error ? `## Error\n\n\`\`\`\n${report.error}\n\`\`\`\n` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli().catch((error) => {
    console.error(error?.stack || error?.message || error)
    process.exit(1)
  })
}
