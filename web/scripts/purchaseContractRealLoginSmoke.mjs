import assert from 'node:assert/strict'
import path from 'node:path'
import process from 'node:process'

import { chromium } from 'playwright'
import {
  attachErrorCollectors,
  createRealLoginSmokeRuntime,
  loginAsAdmin,
  resolvePositiveInteger,
  safeScreenshot,
} from './realLoginSmokeShared.mjs'

const runtime = createRealLoginSmokeRuntime({
  scriptDir: import.meta.dirname,
  outputSubdir: 'purchase-contract-real-login-smoke',
})
const defaultPreviewLatencyBudgetMs = 10_000
const previewLatencyBudgetMs = resolvePositiveInteger(
  process.env.REAL_LOGIN_PREVIEW_MAX_MS,
  defaultPreviewLatencyBudgetMs
)

async function main() {
  const credentials = await runtime.prepare()

  try {
    const browser = await chromium.launch({ headless: runtime.headless })
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
      })
      const errors = attachErrorCollectors(page)

      try {
        await loginAsAdmin(page, credentials, runtime.baseURL)
        await verifyPurchaseContractAmountEditing(page)
        const previewLatencyMs = await verifyPurchaseContractPreviewPopup(page)
        assert.deepEqual(errors, [], '页面出现控制台或运行时错误')
        await page.screenshot({
          path: path.resolve(
            runtime.outputDir,
            'purchase-contract-real-login.png'
          ),
          fullPage: true,
        })
        console.log(
          `[purchase-contract-real-login-smoke] 采购合同在线预览耗时 ${previewLatencyMs}ms（阈值 ${previewLatencyBudgetMs}ms）。`
        )
      } catch (error) {
        await safeScreenshot(
          page,
          runtime.outputDir,
          'purchase-contract-real-login-failed.png'
        )
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
    await runtime.cleanup()
  }
}

async function verifyPurchaseContractAmountEditing(page) {
  await page.goto(
    new URL(
      '/erp/print-workspace/material-purchase-contract?draft=fresh',
      `${runtime.baseURL}/`
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
  const previewStartedAt = Date.now()
  let popup = null

  try {
    ;[popup] = await Promise.all([
      page.waitForEvent('popup', { timeout: 15_000 }),
      page.getByRole('button', { name: '在线预览 PDF' }).click(),
    ])

    await popup.waitForLoadState('domcontentloaded')
    await popup.waitForURL('**/pdf-preview-shell.html**', { timeout: 15_000 })
    await popup
      .locator('iframe.pdf-preview-frame')
      .waitFor({ state: 'visible', timeout: 15_000 })

    const previewLatencyMs = Date.now() - previewStartedAt
    assert.ok(
      previewLatencyMs <= previewLatencyBudgetMs,
      `采购合同在线预览耗时 ${previewLatencyMs}ms，超过阈值 ${previewLatencyBudgetMs}ms`
    )
    return previewLatencyMs
  } catch (error) {
    if (popup) {
      await safeScreenshot(
        popup,
        runtime.outputDir,
        'purchase-contract-preview-popup-failed.png'
      )
    }
    throw error
  } finally {
    if (popup && !popup.isClosed()) {
      await popup.close()
    }
  }
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

await main()
