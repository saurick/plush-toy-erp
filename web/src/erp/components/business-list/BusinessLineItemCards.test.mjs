import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act, createElement as h } from 'react'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

test('手机逐条编辑明细后保存完整单据，收起的行及来源关联不丢失', async (t) => {
  const dom = installTestDOM()
  Object.defineProperty(dom.runtimeWindow, 'innerWidth', { configurable: true, value: 393 })
  registerJSXTestLoader()
  const [{ createRoot }, { Form, Input }, { default: Lines, BusinessLineItemRow }, { BusinessPageContext }] = await Promise.all([
    import('react-dom/client'), import('antd'), import('./BusinessLineItemsTable.jsx'), import('../../hooks/useBusinessPageContext.js'),
  ])
  const initial = [{ id: 71, source_item_id: 101, quantity: '2', note: '第一行' }, { id: 72, source_item_id: 102, quantity: '5', note: '未展开的行' }]
  let form
  let saved
  let setDevice
  function Editor() {
    const [device, updateDevice] = React.useState('mobile'); setDevice = updateDevice
    const [instance] = Form.useForm(); form = instance
    return h(BusinessPageContext.Provider, { value: { taskBusiness: { taskID: 31, device } } }, h(Form, { form, initialValues: { items: initial }, onFinish: (value) => { saved = value } }, h(Form.List, { name: 'items' }, (fields) => h(Lines, { columns: [{ label: '数量', width: 100 }] }, fields.map((field, index) => h(BusinessLineItemRow, { key: field.key,
index,
hiddenFields: h(React.Fragment, null, ...['id', 'source_item_id', 'note'].map((key) => h(Form.Item, { key, name: [field.name, key], hidden: true }, h(Input)))),
cells: [h(Form.Item, { key: 'quantity', name: [field.name, 'quantity'], rules: [{ required: true }] }, h(Input))] })))), h('button', { type: 'submit' }, '保存')))
  }
  const container = document.createElement('div'); document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => { await act(async () => root.unmount()); container.remove(); dom.restore() })
  await act(async () => root.render(h(Editor)))
  const cards = container.querySelectorAll('.erp-task-line-card')
  assert.equal(cards.length, 2)
  assert.equal(cards[0].open, true)
  assert.equal(cards[1].open, false)
  assert.equal(container.querySelector('table'), null)
  await act(async () => form.setFieldValue(['items', 0, 'quantity'], '3'))
  await act(async () => form.submit())
  assert.deepEqual(saved.items, [{ ...initial[0], quantity: '3' }, initial[1]])
  await act(async () => setDevice('desktop'))
  assert.equal(Boolean(container.querySelector('table')), true)
  assert.equal(container.querySelector('.erp-task-line-card'), null)
  await act(async () => form.submit())
  assert.deepEqual(saved.items, [{ ...initial[0], quantity: '3' }, initial[1]], 'switching presentation keeps both source identities and every line value')
})
