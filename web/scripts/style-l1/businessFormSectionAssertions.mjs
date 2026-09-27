import assert from 'node:assert/strict'
import { assertBusinessFormPage } from './businessFormPageAssertions.mjs'

const expectedSections = {
  customers: ['基本资料', '联系人', '默认收货信息', '结算方式', '备注'],
  suppliers: ['基本资料', '联系人', '结算与发票', '加工能力', '备注'],
  materials: ['基本资料', '采购与库存', '备注'],
  products: ['基本资料', '外贸信息', '计量信息', '产品图片'],
  'product-skus': ['归属与编号', '规格属性', '计量信息', '附件'],
  processes: ['基本资料', '路线与加工能力', '备注'],
  production: ['生产计划', '生产明细', '备注'],
  outsourcing: ['合同与加工厂', '加工明细', '合同双方信息', '备注与附件'],
  shipment: ['单据与客户', '出货明细', '收货信息', '运输与费用', '备注与附件'],
  completion: ['完工来源与数量', '待核对的入库仓库与批次', '备注'],
  bom: ['版本信息', '材料分析明细表', '订单与制表资料', '备注与附件'],
  purchase: [
    '订单与供应商',
    '采购明细',
    '交付与结算',
    '合同订购方信息',
    '备注与附件',
  ],
  sales: ['订单与客户', '订货明细', '联系与交付', '结算与报价', '备注与附件'],
}

export async function assertBusinessFormSections(page, editor, key) {
  const titles = expectedSections[key]
  if (!titles) {
    assert.equal(
      await editor.getByRole('navigation', { name: '表单分区' }).count(),
      0
    )
    return
  }
  const initialViewport = page.viewportSize()
  await page.setViewportSize({ width: 1440, height: 900 })
  const nav = editor.getByRole('navigation', { name: '表单分区' })
  await nav.getByRole('button', { name: titles[0], exact: true }).waitFor()
  assert.deepEqual(await nav.getByRole('button').allTextContents(), titles)
  const sections = editor.locator('[data-form-section]')
  const body = editor.locator('.erp-business-form-page__body')
  const originalInput = await editor
    .locator('input:not([type="hidden"])')
    .first()
    .inputValue()
  if (['outsourcing', 'shipment', 'production'].includes(key)) {
    const detail = await sections.nth(1).boundingBox()
    const viewport = await body.boundingBox()
    assert(
      detail.y < viewport.y + viewport.height - 100,
      `${key}: details must start in the first screen`
    )
  }
  const lastLink = nav.getByRole('button', { name: titles.at(-1), exact: true })
  await lastLink.focus()
  await page.keyboard.press('Enter')
  await page.waitForFunction((title) => {
    const current = document.querySelector(
      '.erp-business-form-page:not([hidden]) nav button[aria-current="location"]'
    )
    return current?.textContent === title
  }, titles.at(-1))
  assert.equal(
    await body.evaluate(
      () =>
        document.activeElement?.closest('[data-form-section]')?.dataset
          .formSection
    ),
    titles.at(-1)
  )
  const attachment = editor.locator('.business-attachment-panel')
  if (await attachment.count()) {
    assert.equal(
      await attachment
        .getByRole('button', { name: '选择附件', exact: true })
        .isVisible(),
      false
    )
    await attachment
      .getByRole('button', { name: '管理附件', exact: true })
      .click()
    await attachment
      .getByRole('button', { name: '选择附件', exact: true })
      .waitFor()
    await attachment
      .getByRole('button', { name: '收起附件', exact: true })
      .click()
  }
  if (key === 'bom') {
    const supplementary = editor.locator('details[data-form-section]')
    assert.equal(await supplementary.getAttribute('open'), null)
    await nav
      .getByRole('button', { name: '订单与制表资料', exact: true })
      .click()
    await supplementary.locator('input').first().waitFor({ state: 'visible' })
    await supplementary.locator('summary').click()
  }
  // Native scrolling, without clicking the directory, must also update its position.
  if (await body.evaluate((node) => node.scrollTop > 0)) {
    await body.evaluate((node) =>
      node.scrollTo({ top: 0, behavior: 'instant' })
    )
  } else {
    await nav.getByRole('button', { name: titles[0], exact: true }).click()
  }
  await page.waitForFunction(
    (title) =>
      document.querySelector(
        '.erp-business-form-page:not([hidden]) nav button[aria-current="location"]'
      )?.textContent === title,
    titles[0]
  )
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 844 })
    const picker = nav.getByLabel('跳转到')
    await picker.waitFor({ state: 'visible' })
    assert.equal(await lastLink.isVisible(), false)
    const target = await sections.nth(1).getAttribute('id')
    await picker.selectOption(target)
    await page.waitForFunction(
      (id) =>
        document.activeElement?.closest('[data-form-section]')?.id === id &&
        document.querySelector('.erp-business-form-page__section-picker select')
          ?.value === id,
      target
    )
    await assertBusinessFormPage(page, editor)
    assert.equal(await picker.inputValue(), target)
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await nav.getByRole('button', { name: titles[0], exact: true }).click()
  await page.waitForFunction(
    (title) =>
      document.querySelector(
        '.erp-business-form-page:not([hidden]) nav button[aria-current="location"]'
      )?.textContent === title,
    titles[0]
  )
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  assert.equal(
    await editor.locator('input:not([type="hidden"])').first().inputValue(),
    originalInput
  )
  assert.equal(await editor.getAttribute('data-unsaved'), 'false')
  await page.setViewportSize(initialViewport)
}
