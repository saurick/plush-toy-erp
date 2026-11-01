import assert from 'node:assert/strict'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export async function assertShipmentLineGrouping(page, editor, outputDir) {
  const rows = editor.locator('.erp-sales-order-lines-form__row')
  const headings = editor.locator('.erp-line-item-identity-group')
  const product = (row) => row.getByRole('combobox', { name: /行产品$/u })
  const chooseProduct = async (row, code = 'SELECT-PRODUCT-001') => {
    const input = product(row)
    await input.press('ArrowDown')
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: code }).first().click()
    await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
  }
  await chooseProduct(rows.first())
  const firstQuantity = rows.first().locator('input[id$="_quantity"]')
  await firstQuantity.fill('40')
  await rows.first().locator('textarea[id$="_package_description"]').fill('每箱独立包装')
  for (const quantity of ['30', '5']) {
    await editor.getByRole('button', { name: '添加出货明细', exact: true }).first().click()
    await page.waitForFunction(() => document.activeElement?.id?.endsWith('_product_id'))
    await chooseProduct(rows.last())
    await rows.last().locator('input[id$="_quantity"]').fill(quantity)
  }
  assert.equal(await headings.count(), 1, '相邻同产品身份共用一次')
  assert((await headings.innerText()).includes('3 条明细'))
  const third = rows.nth(2)
  await third.locator('input[id$="_unit_id"]').press('ArrowDown')
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '箱' }).first().click()
  await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
  const quantities = () => rows.locator('input[id$="_quantity"]').evaluateAll((nodes) => nodes.map((node) => node.value))
  assert.deepEqual(await quantities(), ['40', '30', '5'], '不同单位、数量保持三条独立记录')

  const secondProduct = await product(rows.nth(1)).elementHandle()
  await chooseProduct(rows.nth(1), 'SELECT-PRODUCT-002')
  assert.equal(await headings.count(), 3, '非相邻同产品不重排为同组')
  assert(await secondProduct.evaluate((node) => node === document.activeElement), '拆组后保留当前产品输入节点与焦点')
  assert.deepEqual(await quantities(), ['40', '30', '5'])
  assert((await third.locator('input[id$="_unit_id"]').locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]').innerText()).includes('箱'))
  await chooseProduct(rows.nth(1))
  assert.equal(await headings.count(), 1, '重新选择后只重算身份标题')
  assert(await secondProduct.evaluate((node) => node === document.activeElement))
  await secondProduct.dispose()
  await rows.nth(1).locator('textarea[id$="_note"]').click()
  await page.keyboard.type('连续录入 ABC')
  assert.equal(await rows.nth(1).locator('textarea[id$="_note"]').inputValue(), '连续录入 ABC')

  for (const width of [3840, 1920, 1024]) {
    await page.setViewportSize({ width, height: 1080 })
    await waitForFiniteAnimations(page)
    const geometry = await editor.evaluate((node) => {
      const region = node.querySelector('.erp-sales-order-lines-form__list')
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        tables: region.querySelectorAll('table').length,
        headers: region.querySelectorAll('thead').length,
        rowCount: region.querySelectorAll('.erp-editable-line-group').length,
        sequences: [...region.querySelectorAll('.erp-editable-line-group__sequence')].map((cell) => ({ width: cell.getBoundingClientRect().width, span: cell.rowSpan })),
        heights: [...region.querySelectorAll('.ant-select, .ant-input-affix-wrapper:not(.ant-input-textarea-affix-wrapper)')].map((control) => control.getBoundingClientRect().height),
      }
    })
    assert.equal(geometry.overflow, 0, JSON.stringify(geometry))
    assert.equal(geometry.tables, 1)
    assert.equal(geometry.headers, 1)
    assert.equal(geometry.rowCount, 3)
    assert(geometry.sequences.every((cell) => Math.abs(cell.width - 44) <= 1 && cell.span === 2), JSON.stringify(geometry))
    assert(geometry.heights.every((height) => height === 34), JSON.stringify(geometry))
  }
  await page.setViewportSize({ width: 1920, height: 1080 })
  await firstQuantity.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${outputDir}/shipment-hybrid-4k.png` })

  await rows.nth(1).getByRole('button', { name: /移除明细/u }).click()
  assert.equal(await rows.count(), 2)
  assert.equal(await headings.count(), 1)
  assert.deepEqual(await quantities(), ['40', '5'])
  assert.deepEqual(await rows.locator('.erp-editable-line-group__number').allTextContents(), ['1', '2'])
  await rows.last().locator('.erp-line-item-identity-action .ant-select-clear').click()
  assert.equal(await headings.count(), 2, '清空产品的草稿保持独立')
  assert((await headings.last().innerText()).includes('待选择产品'))
  assert.equal(await rows.last().locator('input[id$="_product_sku_id"]').isDisabled(), true)
  assert.equal(await rows.first().locator('textarea[id$="_package_description"]').inputValue(), '每箱独立包装')
}
