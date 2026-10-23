import assert from 'node:assert/strict'

export async function assertContractPaperSource(
  page,
  { material, storageKey, currency }
) {
  const paper = page
    .locator(
      material
        ? '.erp-material-contract-paper'
        : '.erp-processing-contract-paper'
    )
    .first()
  const headers = material
    ? [
        '采购订单号',
        '产品订单编号',
        '产品编号',
        '产品名称',
        '材料品名',
        '厂商料号',
        '规格',
        '单位',
        '单价',
        '采购数量',
        '采购金额',
        '备注',
      ]
    : [
        '委外加工订单号',
        '产品订单编号',
        '产品编号',
        '产品名称',
        '工序名称',
        '加工厂商',
        '工序类别',
        '单位',
        '单价',
        '委托加工数量',
        '委托加工金额',
        '备注',
      ]
  assert.deepEqual(await paper.locator('thead th').allTextContents(), headers)
  assert.equal(
    await paper.locator('[class$="paper__title"]').textContent(),
    '合同订单'
  )
  assert.equal(await paper.locator('tbody tr').count(), 5)
  assert.equal(await paper.locator('tr[data-print-layout-row]').count(), 3)
  assert.equal(
    await paper.locator('tr[data-print-layout-row] [contenteditable]').count(),
    0
  )
  const price = paper
    .locator('td[data-print-blank-field="unitPrice"] [contenteditable]')
    .first()
  const amount = paper
    .locator('td[data-print-blank-field="amount"] [contenteditable]')
    .first()
  assert.equal(await price.textContent(), '1.250')
  assert.equal(await amount.textContent(), '2.50')
  for (const media of ['screen', 'print']) {
    await page.emulateMedia({ media })
    const geometry = await price.evaluate((node) => {
      const range = document.createRange()
      range.selectNodeContents(node)
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0)
      return {
        lines: new Set(rects.map((rect) => Math.round(rect.top))).size,
        width: node.clientWidth,
        scrollWidth: node.scrollWidth,
      }
    })
    assert.equal(geometry.lines, 1, `${media} 单价不可断行`)
    assert(
      geometry.scrollWidth <= geometry.width + 1,
      `${media} 单价不可横向溢出`
    )
  }
  await page.emulateMedia({ media: 'screen' })
  await price.focus()
  await price.blur()
  const date = paper
    .locator(
      '.erp-material-contract-signature__date-value, .erp-processing-contract-signature__date-value'
    )
    .first()
  await date.focus()
  await date.blur()
  await page.locator('[data-print-draft-save-status="saved"]').waitFor()
  const readSaved = () =>
    page.evaluate(async (key) => {
      const { preparePrintDraftStorage, readPreparedPrintDraft } =
        // eslint-disable-next-line import/no-absolute-path -- 浏览器侧从 Vite 同源模块读取窗口草稿。
        await import('/src/erp/utils/printDraftStorage.mjs')
      await preparePrintDraftStorage(key)
      const draft = readPreparedPrintDraft(key)
      return {
        currency: draft.currency,
        lineCount: draft.lines.length,
        price: draft.lines[0].unitPrice,
        date: draft.buyerSignDateText ?? draft.signDateText,
      }
    }, storageKey)
  assert.deepEqual(
    await readSaved(),
    { currency, lineCount: 1, price: '1.25', date: '' },
    '纸面补零、日期留白和四行版面不得改写内部草稿'
  )
  await date.fill('2026/10/24')
  await date.blur()
  await page.locator('[data-print-draft-save-status="saved"]').waitFor()
  assert.equal(
    (await readSaved()).date,
    '2026/10/24',
    '日期显示转换不得写回草稿'
  )
  await date.fill('')
  await date.blur()
  await date.fill('临时日期')
  await date.fill('')
  await date.blur()
  await page.locator('[data-print-draft-save-status="saved"]').waitFor()
  assert.equal(
    (await readSaved()).date,
    '',
    '同一次编辑中输入再清空不得残留旧值'
  )
}
