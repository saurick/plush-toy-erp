import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

import { chromium } from 'playwright'
import {
  attachErrorCollectors,
  createRealLoginSmokeRuntime,
  safeScreenshot,
} from './realLoginSmokeShared.mjs'

const runtime = createRealLoginSmokeRuntime({
  scriptDir: import.meta.dirname,
  outputSubdir: 'purchase-receipt-real-write-browser-e2e',
  defaultPort: 4196,
})

const runID = `PR-BROWSER-${Date.now()}`
const receiptNo = runID
const lotNo = `${runID}-LOT`
const quantity = '2'
const args = new Set(process.argv.slice(2))
const seedCoreDemo = args.has('--seed-core-demo')
const persistentTestDataAccepted =
  args.has('--accept-persistent-test-data') ||
  process.env.PURCHASE_RECEIPT_E2E_ACCEPT_PERSISTENT_TEST_DATA === '1'
const externalTargetAllowed =
  args.has('--allow-external-base-url') ||
  process.env.PURCHASE_RECEIPT_E2E_ALLOW_EXTERNAL_BASE_URL === '1'
const cleanupPolicy =
  '采购入库是不可物理删除的事实源单据；本脚本过账后只做取消冲正，保留带 PR-BROWSER-* 前缀的可追踪模拟单据。'

async function main() {
  assertSafePersistentWriteTarget()

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
        await loginAsAdminForReceiptE2E(page, credentials)
        report.steps.push({ key: 'login', status: 'pass' })

        const refs = await resolveReferenceData(page)
        report.references = {
          material_id: refs.material.id,
          unit_id: refs.unit.id,
          warehouse_id: refs.warehouse.id,
        }
        report.steps.push({ key: 'reference-data', status: 'pass' })

        await createReceiptWithItemFromUI(page, refs)
        report.steps.push({ key: 'create-draft-with-item-ui', status: 'pass' })

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
        await writeReport(report)
        await page.close()
      }
    } finally {
      await browser.close()
    }

    console.log(
      [
        `[purchase-receipt-real-write-browser-e2e] 通过，采购入库 ${receiptNo} 已完成页面整单创建、过账、取消冲正和库存流水校验。`,
        `[purchase-receipt-real-write-browser-e2e] ${cleanupPolicy}`,
      ].join('\n')
    )
  } finally {
    await runtime.cleanup()
  }
}

function assertSafePersistentWriteTarget() {
  if (!persistentTestDataAccepted) {
    throw new Error(
      [
        '采购入库页面 e2e 会创建、过账并取消一张模拟入库单，事实单据不可物理删除。',
        '请显式确认可接受保留 PR-BROWSER-* 测试记录后再运行：',
        '  pnpm smoke:purchase-receipt-real-write',
        '或直接运行：',
        '  node web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs --accept-persistent-test-data',
      ].join('\n')
    )
  }

  const targetURL = new URL(runtime.baseURL)
  const safeHosts = new Set(['127.0.0.1', 'localhost', '::1'])
  if (!safeHosts.has(targetURL.hostname) && !externalTargetAllowed) {
    throw new Error(
      [
        `拒绝对非本地页面目标运行真实写入 e2e：${runtime.baseURL}`,
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

async function loginAsAdminForReceiptE2E(page, credentials) {
  await page.goto(new URL('/admin-login', `${runtime.baseURL}/`).toString(), {
    waitUntil: 'domcontentloaded',
  })
  await page.getByLabel('管理员账号').fill(credentials.username)
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

async function createReceiptWithItemFromUI(page, refs) {
  await page.goto(
    new URL('/erp/warehouse/inbound', `${runtime.baseURL}/`).toString(),
    {
      waitUntil: 'domcontentloaded',
    }
  )
  await page.getByRole('heading', { name: '入库管理' }).waitFor({
    state: 'visible',
    timeout: 15_000,
  })
  await page.getByRole('button', { name: /新建入库单/ }).click()
  await page.getByText('新建采购入库单').waitFor({
    state: 'visible',
    timeout: 15_000,
  })

  await page.locator('.ant-modal input#receipt_no').fill(receiptNo)
  await page.locator('.ant-modal input#supplier_name').fill('浏览器 e2e 供应商')
  await page.locator('.ant-modal textarea#note').fill(`browser e2e ${runID}`)
  await chooseModalSelectOption(page, '材料', refs.material.code)
  await chooseModalSelectOption(page, '仓库', refs.warehouse.code)
  await chooseModalSelectOption(page, '单位', refs.unit.code)
  await fillModalField(page, '入库数量', quantity)
  await fillModalField(page, '批次号', lotNo)
  await fillModalField(page, '来源行号', 'BROWSER-E2E-1')
  await fillModalField(page, '单价', '3.50')
  await fillModalField(page, '金额', '7.00')
  await fillModalField(page, '备注', 'browser e2e line item')
  await page.getByRole('button', { name: '创建草稿' }).click()
  await page.getByText('采购入库草稿和明细已创建').waitFor({
    state: 'visible',
    timeout: 15_000,
  })
  await page
    .locator('.erp-business-selection-action-bar__tag')
    .filter({ hasText: receiptNo })
    .waitFor({ state: 'visible', timeout: 15_000 })
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
  const searchInput = page.getByPlaceholder('搜索入库单号 / 供应商')
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

async function fillModalField(page, label, value) {
  const field = modalFormItem(page, label)
  await field.locator('input,textarea').first().fill(value)
}

async function chooseModalSelectOption(page, label, searchText) {
  const field = modalFormItem(page, label)
  await field.locator('.ant-select-selector').click()
  const searchInput = field.locator('.ant-select-selection-search-input')
  await searchInput.fill(String(searchText))
  const dropdown = page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .last()
  await dropdown
    .locator('.ant-select-item-option')
    .filter({ hasText: String(searchText) })
    .first()
    .click()
}

function modalFormItem(page, label) {
  return page
    .locator('.ant-modal .ant-form-item')
    .filter({ hasText: label })
    .first()
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

async function writeReport(report) {
  await fs.mkdir(runtime.outputDir, { recursive: true })
  const jsonPath = path.resolve(runtime.outputDir, 'report.json')
  const mdPath = path.resolve(runtime.outputDir, 'report.md')
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

await main()
