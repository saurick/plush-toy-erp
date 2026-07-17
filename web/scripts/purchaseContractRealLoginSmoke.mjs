import assert from 'node:assert/strict'
import path from 'node:path'
import process from 'node:process'

import { chromium } from 'playwright'
import {
  loadDevPorts,
  resolveDevAuxPort,
} from '../../scripts/dev-ports.mjs'
import {
  attachErrorCollectors,
  createRealLoginSmokeRuntime,
  loginAsAdmin,
  resolvePositiveInteger,
  safeScreenshot,
  verifyPdfDownloadButton,
  verifyPrintButtonInvokesWindowPrint,
} from './realLoginSmokeShared.mjs'

const devPorts = loadDevPorts(path.resolve(import.meta.dirname, '..', '..'))

const runtime = createRealLoginSmokeRuntime({
  scriptDir: import.meta.dirname,
  outputSubdir: 'purchase-contract-real-login-smoke',
  defaultPort: resolveDevAuxPort(
    devPorts,
    11,
    'purchase contract real login smoke port'
  ),
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
        acceptDownloads: true,
        viewport: { width: 1440, height: 900 },
      })
      const errors = attachErrorCollectors(page)

      try {
        await loginAsAdmin(page, credentials, runtime.baseURL)
        await verifyPurchaseContractAmountEditing(page)
        const previewLatencyMs = await verifyPurchaseContractPreviewPopup(page)
        const downloadResult = await verifyPdfDownloadButton(page)
        await verifyPrintButtonInvokesWindowPrint(page)
        assert.deepEqual(errors, [], '页面出现控制台或运行时错误')
        await page.screenshot({
          path: path.resolve(
            runtime.outputDir,
            'purchase-contract-real-login.png'
          ),
          fullPage: true,
        })
        console.log(
          `[purchase-contract-real-login-smoke] 采购合同在线预览耗时 ${previewLatencyMs}ms（阈值 ${previewLatencyBudgetMs}ms），下载文件 ${downloadResult.suggestedFilename}，打印按钮已调用浏览器打印入口。`
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

  await page.getByText('打印内容').waitFor({
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
    totalAmount: '483.45',
  })

  await quantityInput.fill('4000')
  await unitPriceInput.fill('0.5')
  await expectMaterialContractAmounts(page, {
    rowAmount: '2000.00',
    totalAmount: '2360.00',
  })
}

async function verifyPurchaseContractPreviewPopup(page) {
  const previewStartedAt = Date.now()
  let popup = null

  try {
    const [nextPopup] = await Promise.all([
      page.waitForEvent('popup', { timeout: 15_000 }),
      page.getByRole('button', { name: '在线预览 PDF' }).click(),
    ])
    popup = nextPopup

    await popup.waitForLoadState('domcontentloaded')
    await assertPdfPreviewPopupReady(popup)

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

async function assertPdfPreviewPopupReady(popup) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (popup.url().startsWith('blob:')) {
      return
    }
    const iframeCount = await popup
      .locator('iframe.pdf-preview-frame')
      .count()
      .catch(() => 0)
    if (iframeCount > 0) {
      await popup
        .locator('iframe.pdf-preview-frame')
        .waitFor({ state: 'visible', timeout: 1_000 })
      break
    }
    await popup.waitForTimeout(100)
  }
  assert.ok(
    popup.url().startsWith('blob:') ||
      (await popup
        .locator('iframe.pdf-preview-frame')
        .count()
        .catch(() => 0)) > 0,
    `PDF 预览页未进入 blob 或 iframe 预览状态，当前 URL: ${popup.url()}`
  )

  await popup.waitForTimeout(300)
  const state = await popup.evaluate(() => {
    const iframe = document.querySelector('iframe.pdf-preview-frame')
    return {
      url: location.href,
      bodyText: document.body?.textContent?.trim() || '',
      iframeSrc: iframe?.getAttribute('src') || '',
      iframeCount: document.querySelectorAll('iframe.pdf-preview-frame').length,
    }
  })

  assert.equal(state.iframeCount, 1)
  assert.match(state.iframeSrc, /^blob:/)
  assert.doesNotMatch(state.bodyText, /正在等待 PDF 预览结果/)
  assert.doesNotMatch(state.bodyText, /PDF 预览不存在或已过期/)
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
