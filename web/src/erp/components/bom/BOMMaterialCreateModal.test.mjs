import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('原表预填仅在打开时初始化，资料回读不重置正在编辑的建档表单', async (t) => {
  const view = await createReactTestHarness(t)
  const { default: Create } = await import('./BOMMaterialCreateModal.jsx')
  const initial = { code: 'MAT-SOURCE', name: '原表面料', supplier_item_no: 'SUP-1', spec: '51"', color: '黑色', default_unit_id: 1 }
  const render = (open, values, materials = []) => view.render(createElement(Create, {
    open, initialValues: values, materials, unitOptions: [{ value: 1, label: '个' }], onCancel() {}, onCreated() {},
  }))
  await render(true, initial)
  await view.flush()
  assert.equal(document.querySelector('input#name').value, '原表面料')
  assert.equal(document.querySelector('input#code').value, 'MAT-SOURCE')
  assert.equal(document.querySelector('input#supplier_item_no').value, 'SUP-1')
  await render(true, { ...initial, name: '后续渲染中的来源名称' }, [{ id: 9, code: 'MAT-9', name: '刚回读的档案' }])
  await view.flush()
  assert.equal(document.querySelector('input#name').value, '原表面料')
  assert.equal(document.querySelector('input#code').value, 'MAT-SOURCE')
  await render(false, initial)
  await render(true, { ...initial, name: '另一组原表面料' })
  await view.flush()
  assert.equal(document.querySelector('input#name').value, '另一组原表面料')
})
