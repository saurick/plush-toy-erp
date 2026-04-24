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
  outputSubdir: 'processing-contract-real-login-smoke',
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
        await verifyProcessingContractEditing(page)
        const previewLatencyMs =
          await verifyProcessingContractPreviewPopup(page)
        assert.deepEqual(errors, [], '页面出现控制台或运行时错误')
        await page.screenshot({
          path: path.resolve(
            runtime.outputDir,
            'processing-contract-real-login.png'
          ),
          fullPage: true,
        })
        console.log(
          `[processing-contract-real-login-smoke] 加工合同在线预览耗时 ${previewLatencyMs}ms（阈值 ${previewLatencyBudgetMs}ms）。`
        )
      } catch (error) {
        await safeScreenshot(
          page,
          runtime.outputDir,
          'processing-contract-real-login-failed.png'
        )
        throw error
      } finally {
        await page.close()
      }
    } finally {
      await browser.close()
    }

    console.log(
      `[processing-contract-real-login-smoke] 通过，已使用真实管理员登录验证加工合同联动与预览链路（账号：${credentials.username}）。`
    )
  } finally {
    await runtime.cleanup()
  }
}

async function verifyProcessingContractEditing(page) {
  await page.goto(
    new URL(
      '/erp/print-workspace/processing-contract?draft=fresh',
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
  await page.getByText('加工合同').first().waitFor({
    state: 'visible',
    timeout: 15_000,
  })

  const firstDetailRow = page
    .locator('.erp-print-shell__detail-table tbody tr')
    .first()
  const processNameInput = firstDetailRow.locator('textarea').nth(0)
  const quantityInput = firstDetailRow.locator('input').nth(0)
  const unitPriceInput = firstDetailRow.locator('input').nth(1)

  await processNameInput.fill('测试工序A')
  await quantityInput.fill('4000')
  await unitPriceInput.fill('0.5')

  await expectProcessingContractValues(page, {
    processName: '测试工序A',
    rowQuantity: '4000',
    rowAmount: '2000',
    totalQuantity: '22048',
    totalAmount: '4256',
  })
}

async function verifyProcessingContractPreviewPopup(page) {
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
      `加工合同在线预览耗时 ${previewLatencyMs}ms，超过阈值 ${previewLatencyBudgetMs}ms`
    )
    return previewLatencyMs
  } catch (error) {
    if (popup) {
      await safeScreenshot(
        popup,
        runtime.outputDir,
        'processing-contract-preview-popup-failed.png'
      )
    }
    throw error
  } finally {
    if (popup && !popup.isClosed()) {
      await popup.close()
    }
  }
}

async function expectProcessingContractValues(page, expected) {
  await page.waitForFunction(
    ({ processName, rowQuantity, rowAmount, totalQuantity, totalAmount }) => {
      const normalizeText = (selector) =>
        document
          .querySelector(selector)
          ?.textContent?.replace(/\u00a0/g, ' ')
          ?.trim() || ''

      return (
        normalizeText(
          '.erp-processing-contract-table tbody tr:not(.erp-processing-contract-table__total) td:nth-child(5)'
        ) === processName &&
        normalizeText(
          '.erp-processing-contract-table tbody tr:not(.erp-processing-contract-table__total) td:nth-child(10)'
        ) === rowQuantity &&
        normalizeText(
          '.erp-processing-contract-table tbody tr:not(.erp-processing-contract-table__total) td:nth-child(11)'
        ) === rowAmount &&
        normalizeText(
          '.erp-processing-contract-table__total td:nth-child(5)'
        ) === totalQuantity &&
        normalizeText(
          '.erp-processing-contract-table__total td:nth-child(6)'
        ) === totalAmount
      )
    },
    expected,
    { timeout: 15_000 }
  )

  const actual = await page.evaluate(() => {
    const normalizeText = (selector) =>
      document
        .querySelector(selector)
        ?.textContent?.replace(/\u00a0/g, ' ')
        ?.trim() || ''

    return {
      processName: normalizeText(
        '.erp-processing-contract-table tbody tr:not(.erp-processing-contract-table__total) td:nth-child(5)'
      ),
      rowQuantity: normalizeText(
        '.erp-processing-contract-table tbody tr:not(.erp-processing-contract-table__total) td:nth-child(10)'
      ),
      rowAmount: normalizeText(
        '.erp-processing-contract-table tbody tr:not(.erp-processing-contract-table__total) td:nth-child(11)'
      ),
      totalQuantity: normalizeText(
        '.erp-processing-contract-table__total td:nth-child(5)'
      ),
      totalAmount: normalizeText(
        '.erp-processing-contract-table__total td:nth-child(6)'
      ),
    }
  })

  assert.deepEqual(actual, expected)
}

await main()
