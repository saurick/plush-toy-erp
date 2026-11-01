import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

const items = Array.from({ length: 17 }, (_, index) => ({
  material_id: index < 3 ? 1 : undefined,
  unit_id: 1,
  position: `部位${index + 1}`,
  quantity: '1',
  loss_rate: '0',
  _import_source: { rowNumber: index + 1, materialName: `原表材料${index + 1}`, unit: '个', cells: [] },
}))

async function harness(t) {
  const view = await createReactTestHarness(t)
  const { default: Preview } = await import('./BOMExcelImportPreview.jsx')
  const confirmed = []
  return {
    ...view,
    confirmed,
    renderPreview: (props = {}) => view.render(createElement(Preview, {
      pending: { target: 'new', draft: { values: { items }, review: { fileName: '核对样例.xlsx', sheetName: '材料明细' } } },
      existingCount: 0,
      materialOptions: [],
      unitOptions: [],
      onConfirm: (mode) => confirmed.push(mode),
      ...props,
    })),
    confirm: () => document.querySelector('.ant-modal-footer .ant-btn-primary'),
    status: () => document.querySelector('[role="status"]').textContent,
  }
}

test('BOM 按整份文件带入，分页与筛选均不改变确认数量', async (t) => {
  const view = await harness(t)
  await view.renderPreview()
  assert.match(view.confirm().textContent, /17 个部位/u)
  assert.match(view.status(), /整份文件导入/u)
  assert.equal(document.querySelectorAll('input[type="checkbox"]').length, 0)
  assert.equal(document.querySelectorAll('.ant-table-tbody > tr[data-row-key]').length, 10)
  await view.act(async () => document.querySelector('.ant-pagination-next button').click())
  assert.equal(document.querySelectorAll('.ant-table-tbody > tr[data-row-key]').length, 7)
  assert.match(document.querySelector('.ant-table-tbody').textContent, /部位11/u)
  assert.match(view.confirm().textContent, /17 个部位/u)
  const filter = document.querySelector('input[aria-label="BOM 核对筛选"]')
  await view.act(async () => filter.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await view.flush()
  await view.act(async () => [...document.querySelectorAll('.ant-select-item-option')].find((node) => node.textContent.trim() === '待选择材料').click())
  assert.match(view.status(), /筛选结果 14 \/ 17 个部位/u)
  assert.equal(document.querySelectorAll('.ant-table-tbody > tr[data-row-key]').length, 10)
  assert.match(view.confirm().textContent, /17 个部位/u)
  assert.equal(view.confirm().getAttribute('aria-describedby'), document.querySelector('[role="status"]').id)
  await view.act(async () => view.confirm().click())
  assert.deepEqual(view.confirmed, ['replace'])
})

test('BOM 追加超限、替换与空文件的限制保持可见并阻止无效确认', async (t) => {
  const view = await harness(t)
  await view.renderPreview({ pending: { target: 'items', draft: { values: { items }, review: {} } }, existingCount: 997 })
  assert.equal(view.confirm().disabled, true)
  assert.match(document.body.textContent, /追加后超过 1000 个部位/u)
  const replace = [...document.querySelectorAll('input[type="radio"]')].find((node) => node.value === 'replace')
  await view.act(async () => replace.click())
  assert.equal(view.confirm().disabled, false)
  assert.match(view.confirm().textContent, /替换并带入 17 个部位/u)
  assert.match(document.body.textContent, /将替换当前草稿明细/u)
  await view.act(async () => view.confirm().click())
  assert.deepEqual(view.confirmed, ['replace'])
  await view.renderPreview({ pending: { target: 'new', draft: { values: { items: [] }, review: {} } } })
  assert.equal(view.confirm().disabled, true)
  assert.match(view.confirm().textContent, /0 个部位/u)
})
