import assert from 'node:assert/strict'

export async function readBOMVersion(editor) {
  const summary = editor.locator('.erp-bom-version-summary[data-bom-version-state="ready"]')
  await summary.waitFor({ state: 'visible' })
  return summary.locator('strong').innerText()
}

export async function isBOMVersionReadOnly(editor) {
  const display = await readBOMVersion(editor)
  const summary = editor.getByLabel('BOM 版本', { exact: true })
  await summary.waitFor({ state: 'visible' })
  const metadata = editor.locator('input[id$="version"]')
  const value = await metadata.inputValue()
  return !(await metadata.isVisible()) &&
    await summary.locator('input, textarea, select, [contenteditable="true"]').count() === 0 &&
    display === (value || '保存后自动生成') &&
    await summary.getByRole('button', { name: '复制BOM 版本', exact: true }).count() === (value ? 1 : 0)
}

export async function assertBOMEditorDensity(editor) {
  const metrics = await editor.evaluate((root) => {
    const rect = (node) => {
      if (!node) return null
      const box = node.getBoundingClientRect()
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height }
    }
    const primary = root.querySelector('.erp-bom-header-primary')
    const product = primary.querySelector('.erp-bom-header-product')
    const table = root.querySelector('.erp-bom-parts-table')
    const nav = root.querySelector('.erp-business-form-page__navigation')
    const body = root.querySelector('.erp-business-form-page__body')
    const links = nav?.querySelector('.erp-business-form-page__section-links')
    return {
      width: innerWidth,
      primary: rect(primary),
      product: rect(product),
      thumbnail: rect(product.querySelector('.erp-product-identity__picture')),
      selector: rect(product.querySelector('.ant-select')),
      duplicateIdentity: product.querySelectorAll('.erp-product-identity__text').length,
      version: root.querySelector('.erp-bom-version-summary')?.textContent.trim(),
      versionInHeader: Boolean(root.querySelector('.erp-business-form-page__header .erp-bom-version-summary')),
      visibleVersionInputs: [...root.querySelectorAll('input[id$="version"]')].filter((node) => node.getClientRects().length).length,
      sourceInPrimary: Boolean(primary.querySelector('input[id$="source_order_no"]')),
      body: rect(body),
      navigation: rect(nav),
      linksVisible: Boolean(links?.getClientRects().length),
      bodyOverflow: body.scrollWidth - body.clientWidth,
      tableMinimum: Number.parseFloat(getComputedStyle(table).minWidth),
      columns: table.querySelectorAll('thead th').length,
      materialColumns: [...table.querySelectorAll('thead th')].slice(0, 4).map((node) => node.textContent.trim()),
      readOnly: root.dataset.readonly === 'true',
      groups: [...table.querySelectorAll('.erp-bom-material-group')].map((group) => ({
        headings: group.querySelectorAll('.erp-bom-material-heading').length,
        materialControls: group.querySelectorAll('input[aria-label^="物料名称 "]').length,
        unitControls: group.querySelectorAll('input[aria-label^="单位 "]').length,
        partCount: group.querySelectorAll('tr[data-bom-part-index]').length,
        materialRowSpans: [...group.querySelector('tr[data-bom-part-index]').querySelectorAll('.erp-bom-material-cell')].map((cell) => cell.rowSpan),
        summaries: group.querySelectorAll('.erp-bom-material-group__summary').length,
      })),
    }
  })
  const detail = JSON.stringify(metrics)
  assert.equal(metrics.duplicateIdentity, 0, `产品身份不在输入框下方重复展示：${detail}`)
  assert.equal(metrics.versionInHeader, true, '版号与页头状态放在一起')
  assert.equal(metrics.visibleVersionInputs, 0, '服务端版号不呈现为可填写字段')
  assert.ok(metrics.version?.length > 0, '新建提示与已有版号都可读')
  assert.equal(metrics.sourceInPrimary, true, '来源订单号与产品、订单数量同区')
  assert.ok(metrics.bodyOverflow <= 1, `明细横向滚动收口到表格：${detail}`)
  assert.equal(metrics.tableMinimum, 1620, `材料表保留原列宽与自身横向滚动：${detail}`)
  assert.equal(metrics.columns, 12)
  assert.deepEqual(metrics.materialColumns, ['物料名称', '厂商料号', '规格', '单位'])
  if (metrics.thumbnail && metrics.width >= 768) {
    assert.ok(metrics.thumbnail.right <= metrics.selector.left + 1, `产品图片与选择框并排：${detail}`)
    assert.ok(metrics.thumbnail.bottom <= metrics.selector.bottom + 10, `图片不另撑一行：${detail}`)
  }
  if (metrics.linksVisible) {
    assert.ok(Math.abs(metrics.navigation.right - metrics.body.left) <= 1, `BOM 桌面目录沿用共享左栏：${detail}`)
    assert.ok(Math.abs(metrics.navigation.top - metrics.body.top) <= 1 && Math.abs(metrics.navigation.bottom - metrics.body.bottom) <= 1, `目录底色与分隔线覆盖整列：${detail}`)
  }
  for (const group of metrics.groups) {
    assert.equal(group.headings, 0, '材料字段不移入分组标题行')
    assert.equal(group.materialControls, 1, '同组部位共享物料关联')
    assert.equal(group.unitControls, 1, '同组部位共享单位')
    assert.deepEqual(group.materialRowSpans, Array(4).fill(group.partCount + 1), '原有材料列跨部位及组尾合并')
    assert.equal(group.summaries, 1, '每组保留原有用量汇总')
    assert.ok(group.partCount > 0, '身份行对应真实部位')
  }
  console.log(`[style:l1] bom-editor-density=${detail}`)
}
