import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs/promises'
import { assertBusinessModalViewport } from './modalAssertions.mjs'
import { assertNoHorizontalOverflow } from './pageAssertions.mjs'
import { clickERPThemeOption } from './themeAssertions.mjs'
import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'

async function assertArrivalModalViewport(page, dialog, options) {
  const metrics = await assertBusinessModalViewport(page, dialog, {
    ...options,
    maxWidth: 1800,
  })
  // This business acceptance rule stays independent of the component's selected size tier.
  const expectedWidth = Math.min(
    1800,
    metrics.viewport.width * 0.94,
    metrics.viewport.width - 32
  )
  assert.ok(
    Math.abs(metrics.dialog.width - expectedWidth) <= 1,
    `${options.label}: 采购到货须保留明细档宽度，预期 ${expectedWidth}px，实际 ${metrics.dialog.width}px；单条记录或卡片布局不能缩窄弹窗`
  )
  return metrics
}

export async function verifyPurchaseArrivalRedesign(page, { outputDir }) {
  try {
    await verifyArrival(page, { outputDir })
  } catch (error) {
    await page.screenshot({
      path: path.join(outputDir, 'purchase-arrival-failure.png'),
      fullPage: true,
    })
    await fs.writeFile(
      path.join(outputDir, 'purchase-arrival-failure.html'),
      await page.content()
    )
    throw error
  }
}

async function verifyArrival(page, { outputDir }) {
  await page.getByRole('heading', { name: '采购订单', exact: true }).waitFor()
  await page
    .locator('.erp-business-data-table-card .ant-table-tbody tr')
    .filter({ hasText: 'PO-STYLE-L1' })
    .first()
    .click()
  const open = () =>
    page.locator('[data-business-action-key="generate-inbound"]').click()
  await open()
  const dialog = page.getByRole('dialog', { name: '登记采购到货', exact: true })
  const quantity = (number) =>
    dialog.getByRole('spinbutton', {
      name: `第${number}条实点数量`,
      exact: true,
    })
  const declared = (number) =>
    dialog.getByRole('spinbutton', {
      name: `第${number}条标示数量`,
      exact: true,
    })
  const close = () => dialog.getByRole('button', { name: /^关\s*闭$/u }).click()
  const save = dialog.getByRole('button', {
    name: '保存到货并送检',
    exact: true,
  })
  const discard = async () => {
    await close()
    await page.getByRole('button', { name: '放弃登记', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
  }

  await quantity(1).waitFor()
  assert.equal(
    await dialog.getByLabel('到货备注', { exact: true }).inputValue(),
    ''
  )
  assert.equal(
    await dialog.locator('.ant-alert').count(),
    0,
    '正常登记不展示大面积提示框'
  )
  assert.equal(
    await dialog.getByRole('combobox', { name: '补充到货材料' }).count(),
    0,
    '已有材料使用组内增卷操作'
  )
  await dialog.getByText('可登记 12.999997 件', { exact: true }).waitFor()
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('aria-label') === '第1条实点数量'
  )

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
    { width: 1024, height: 568 },
    { width: 720, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    const label = `purchase-arrival-${viewport.width}-${viewport.height}`
    await assertArrivalModalViewport(page, dialog, { label })
    const overflow = await dialog
      .locator(
        '.erp-purchase-arrival__receipt, .erp-purchase-arrival__material, .erp-purchase-arrival__fields'
      )
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => node.scrollWidth > node.clientWidth + 1)
          .map((node) => node.className)
      )
    assert.deepEqual(overflow, [], `${label}: 录入区域无需横向滚动`)
    await assertNoHorizontalOverflow(page, label)
    await page.screenshot({
      path: path.join(outputDir, `${label}.png`),
      fullPage: true,
    })
    if (viewport.width === 1366) {
      await dialog.screenshot({
        path: path.join(outputDir, 'purchase-arrival-preview.png'),
      })
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 })
  await save.click()
  await dialog
    .getByRole('alert')
    .filter({ hasText: '请至少填写一条实点数量' })
    .waitFor()
  await declared(1).fill('10')
  await save.click()
  await dialog
    .getByText('请输入大于 0 的实点数量，最多六位小数', { exact: true })
    .waitFor()
  await quantity(1).fill('8')
  await dialog.getByText('比标示少 2 件', { exact: true }).waitFor()
  await dialog.getByText('本次实点 8 件', { exact: true }).waitFor()
  await dialog.getByRole('button', { name: '增加一卷 / 包' }).click()
  await quantity(2).waitFor()
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('aria-label') === '第2条实点数量'
  )
  assert.equal(await quantity(1).inputValue(), '8', '增卷保留已有实点')
  assert.equal(await quantity(2).inputValue(), '', '增卷不会复制数量')
  await quantity(2).fill('0.000001')
  await declared(2).fill('0')
  await dialog.getByText('本次实点 8.000001 件', { exact: true }).waitFor()
  await dialog.getByText('比标示多 0.000001 件', { exact: true }).waitFor()
  await quantity(1).fill('99999999999999.999999')
  await dialog
    .getByText('本次实点 100000000000000 件', { exact: true })
    .waitFor()
  await quantity(1).fill('8')
  const second = dialog.getByRole('group', {
    name: '第2条到货记录',
    exact: true,
  })
  await second.locator('summary').click()
  await second
    .getByRole('textbox', { name: '第2条说明' })
    .fill('模拟卷包说明，需要逐卷核对数量。'.repeat(12))
  await page.screenshot({
    path: path.join(outputDir, 'purchase-arrival-split.png'),
    fullPage: true,
  })

  await dialog.getByRole('button', { name: '移除第1条到货记录' }).click()
  await page.getByRole('button', { name: /^保\s*留$/u }).click()
  assert.equal(await quantity(1).inputValue(), '8')
  await close()
  await page.getByRole('button', { name: '继续填写', exact: true }).click()
  assert.equal(
    await quantity(2).inputValue(),
    '0.000001',
    '取消关闭保留分卷内容'
  )
  await discard()
  await open()
  await quantity(1).waitFor()
  assert.equal(await dialog.locator('.erp-purchase-arrival__record').count(), 1)
  assert.equal(await quantity(1).inputValue(), '', '重新打开不残留上次实点')
  await dialog.getByRole('button', { name: '移除第1条到货记录' }).click()
  await dialog
    .getByText('选择本次到货的材料后开始清点', { exact: true })
    .waitFor()
  await dialog.getByRole('combobox', { name: '补充到货材料' }).click()
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText('1 · 样式材料（MAT-STYLE-L1）', { exact: true })
    .click()
  await quantity(1).waitFor()

  for (let index = 0; index < 12; index += 1) {
    await dialog.getByRole('button', { name: '增加一卷 / 包' }).click()
  }
  const beforeScroll = await assertArrivalModalViewport(page, dialog, {
    label: 'purchase-arrival-many-lines',
    scrollable: true,
  })
  await dialog
    .getByLabel('到货备注', { exact: true })
    .fill('模拟到货长备注，需要完整显示并保持操作可达。'.repeat(10))
  const afterScroll = await assertArrivalModalViewport(page, dialog, {
    label: 'purchase-arrival-many-lines-scrolled',
    scrollable: true,
  })
  assert.ok(
    Math.abs(beforeScroll.footer.top - afterScroll.footer.top) <= 1,
    '正文滚动不移动保存区'
  )
  await page.screenshot({
    path: path.join(outputDir, 'purchase-arrival-many-lines.png'),
    fullPage: true,
  })
  await discard()

  await clickERPThemeOption(page, '暗色')
  await open()
  await quantity(1).waitFor()
  await quantity(1).fill('8')
  await declared(1).fill('10')
  await dialog.getByText('比标示少 2 件', { exact: true }).waitFor()
  await assertArrivalModalViewport(page, dialog, {
    label: 'purchase-arrival-dark',
  })
  await page.screenshot({
    path: path.join(outputDir, 'purchase-arrival-dark.png'),
    fullPage: true,
  })

  let release
  const pending = new Promise((resolve) => {
    release = resolve
  })
  const submissions = []
  await page.route('**/rpc/purchase', async (route) => {
    const { id, method, params } = route.request().postDataJSON()
    if (method !== 'create_purchase_receipt_from_purchase_order') {
      return route.fallback()
    }
    submissions.push(params)
    await pending
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          code: RpcErrorCode.INTERNAL,
          message: '模拟服务暂不可用',
          data: {},
        },
      }),
    })
  })
  const request = page.waitForRequest(
    (item) =>
      item.postDataJSON()?.method ===
      'create_purchase_receipt_from_purchase_order'
  )
  await save.click()
  await request
  assert.equal(
    await dialog.getByRole('button', { name: /^关\s*闭$/u }).isEnabled(),
    false
  )
  assert.equal(await quantity(1).isEnabled(), false)
  assert.equal(
    await dialog.getByRole('button', { name: '增加一卷 / 包' }).isEnabled(),
    false
  )
  await page.keyboard.press('Escape')
  assert.equal(await dialog.isVisible(), true, '保存中 Escape 不关闭')
  release()
  await quantity(1).waitFor()
  await page.waitForFunction(
    () => !document.querySelector('[aria-label="第1条实点数量"]')?.disabled
  )
  assert.equal(await quantity(1).inputValue(), '8', '保存失败保留实点')
  assert.equal(submissions.length, 1)
  assert.equal(submissions[0].items[0].quantity, '8')
  assert.equal(submissions[0].items[0].declared_quantity, '10')
  const retried = page.waitForResponse(
    (response) =>
      response.request().postDataJSON()?.method ===
      'create_purchase_receipt_from_purchase_order'
  )
  await save.click()
  await retried
  assert.equal(submissions.length, 2)
  assert.equal(
    submissions[1].idempotency_key,
    submissions[0].idempotency_key,
    '结果未知的重试复用原登记标识'
  )
  await page.waitForFunction(
    () => !document.querySelector('[aria-label="第1条实点数量"]')?.disabled
  )
  await discard()
  await clickERPThemeOption(page, '浅色')

  let failRead = true
  await page.route('**/rpc/purchase_order', async (route) => {
    const { id, method } = route.request().postDataJSON()
    if (method !== 'get_purchase_order_receipt_progress' || !failRead) {
      return route.fallback()
    }
    failRead = false
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          code: RpcErrorCode.INTERNAL,
          message: '模拟材料加载失败',
          data: {},
        },
      }),
    })
  })
  await open()
  await dialog.getByRole('button', { name: '重新加载', exact: true }).waitFor()
  assert.equal(await save.isEnabled(), false)
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await quantity(1).waitFor()
  assert.equal(await save.isEnabled(), true)
  await close()
  await dialog.waitFor({ state: 'hidden' })
}
