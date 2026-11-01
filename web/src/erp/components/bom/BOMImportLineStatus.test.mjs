import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { getBOMImportLineIssues } from '../../utils/bomXlsxImport.mjs'

const complete = { material_id: 1, unit_id: 1, quantity: '1', loss_rate: '0' }

async function harness(t) {
  const view = await createReactTestHarness(t)
  const { default: Status } = await import('./BOMImportLineStatus.jsx')
  return {
    ...view,
    show: (line) => view.render(createElement(Status, { issues: getBOMImportLineIssues(line), rowNumber: 6 })),
    button: () => view.container.querySelector('button'),
    details: () => document.querySelector('.erp-bom-import-issues'),
  }
}

test('BOM 缺项使用短标签，点击列出当前完整原因并支持 Escape 关闭', async (t) => {
  const view = await harness(t)
  await view.show({ quantity: '', loss_rate: '-1' })
  assert.equal(view.button().textContent.trim(), '4 项待处理')
  assert.match(view.button().getAttribute('aria-label'), /Excel 第 6 行/u)
  assert.equal(view.button().getAttribute('aria-expanded'), 'false')
  assert.equal(view.details(), null)
  await view.act(async () => view.button().click())
  await view.flush()
  assert.equal(view.button().getAttribute('aria-expanded'), 'true')
  assert.deepEqual([...view.details().querySelectorAll('li')].map((node) => node.textContent), [
    '请选择现有材料', '请选择现有单位', '材料用量必须为有效正数', '损耗率必须为有效非负数',
  ])
  await view.show({ ...complete, material_id: undefined })
  assert.equal(view.button().textContent.trim(), '缺材料')
  assert.equal(view.details().querySelectorAll('li').length, 1)
  assert.equal(view.details().textContent, '请选择现有材料')
  await view.act(async () => document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  assert.equal(view.button().getAttribute('aria-expanded'), 'false')
})

test('BOM 补齐后移除缺项入口，再次清空不残留旧浮层或旧原因', async (t) => {
  const view = await harness(t)
  await view.show({ ...complete, unit_id: undefined })
  assert.equal(view.button().textContent.trim(), '缺单位')
  await view.act(async () => view.button().click())
  await view.flush()
  assert.equal(view.button().getAttribute('aria-expanded'), 'true')
  await view.show(complete)
  assert.equal(view.button(), null)
  assert.equal(view.container.textContent, '已匹配')
  assert.equal(view.details(), null)
  await view.show({ ...complete, quantity: '0' })
  assert.equal(view.button().textContent.trim(), '用量有误')
  assert.equal(view.button().getAttribute('aria-expanded'), 'false')
  await view.act(async () => view.button().click())
  await view.flush()
  assert.equal(view.details().textContent, '材料用量必须为有效正数')
  await view.show({ ...complete, loss_rate: '-1', _import_source: { lossIssue: '请核对原表损耗与总用量' } })
  assert.equal(view.button().textContent.trim(), '损耗有误')
  assert.equal(view.details().textContent, '请核对原表损耗与总用量')
})
