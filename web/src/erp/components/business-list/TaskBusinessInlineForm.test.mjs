import React, { act, createElement as h } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('task form uses the existing form inline, portals its footer and disables writes after completion', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ createMemoryRouter, RouterProvider }, { App, Form, Input }, { default: BusinessModal }, { BusinessPageContext }] = await Promise.all([
    import('react-router-dom'), import('antd'), import('./BusinessModal.jsx'), import('../../hooks/useBusinessPageContext.js'),
  ])
  const actionHost = document.createElement('div')
  document.body.appendChild(actionHost)
  t.after(() => actionHost.remove())
  let form
  let saves = 0
  let editing = false
  let update
  function Editor() {
    const [{ readOnly, open }, setSettings] = React.useState({ readOnly: false, open: true }); update = setSettings
    const [instance] = Form.useForm(); form = instance
    return h(App, null, h(BusinessPageContext.Provider, { value: { taskBusiness: { taskID: 31, readOnly, actionHost, onFormEditingChange: (value) => { editing = value } } } }, h(BusinessModal, { taskInline: true, open, title: '本次到货', form, onOk: async () => { await form.validateFields(); saves++ }, onCancel: () => {}, okText: '确认到货' }, h(Form, { form, initialValues: { quantity: '2', items: [{ note: '原明细' }] } }, h(Form.Item, { name: 'quantity', label: '本次数量', rules: [{ required: true }] }, h(Input, { 'aria-label': '本次数量' })), h(Form.List, { name: 'items' }, (fields) => fields.map((field) => h(Form.Item, { key: field.key, name: [field.name, 'note'] }, h(Input, { 'aria-label': '明细备注' }))))
          )
        )
      ))
  }
  const router = createMemoryRouter([{ path: '/', element: h(Editor) }], { future: { v7_relativeSplatPath: true } })
  t.after(() => router.dispose())
  await ui.render(h(RouterProvider, { router, future: { v7_startTransition: true } }))
  assert.equal(editing, true)
  assert.equal(document.querySelector('.ant-modal'), null)
  assert.ok(ui.container.querySelector('[data-business-form-page]'))
  assert.ok(actionHost.textContent.includes('确认到货'))
  await act(async () => form.setFieldValue('quantity', '3'))
  await act(async () => [...actionHost.querySelectorAll('button')].find((button) => button.textContent === '确认到货').click())
  assert.equal(saves, 1)
  await act(async () => update({ readOnly: true, open: true }))
  assert.equal(ui.container.querySelector('input[aria-label="本次数量"]').disabled, true)
  assert.equal(ui.container.querySelector('input[aria-label="明细备注"]').disabled, true)
  assert.equal(ui.container.querySelector('input[aria-label="明细备注"]').value, '原明细')
  assert.ok(!actionHost.textContent.includes('确认到货'))
  assert.equal(form.getFieldValue('quantity'), '3')
  await act(async () => update({ readOnly: true, open: false }))
  assert.equal(editing, false)
  assert.equal(actionHost.querySelector('button'), null)
})

test('source information stays in step one regardless of readonly state or an open editor', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ App }, { BusinessDataTable }, { BusinessPageContext }] = await Promise.all([
    import('antd'), import('./BusinessListLayout.jsx'), import('../../hooks/useBusinessPageContext.js'),
  ])
  const informationHost = document.createElement('div')
  document.body.appendChild(informationHost)
  t.after(() => informationHost.remove())
  const information = { host: informationHost, scopeKey: 'account1:task31:v2', release: () => {}, stage: () => {} }
  let update
  function Task() {
    const [settings, setSettings] = React.useState({ readOnly: true, formEditing: false }); update = setSettings
    return h(App, null, h(BusinessPageContext.Provider, { value: { taskBusiness: { ...settings, information, task: { id: 31, task_status_key: 'done' } } } }, h(BusinessDataTable, {
      columns: [{ title: '单据编号', dataIndex: 'document_no' }, { title: '本次数量', dataIndex: 'quantity' }],
      dataSource: [{ id: 9, document_no: 'SIM-ORDER-9', quantity: '12' }],
      rowSelection: { selectedRowKeys: [9] },
    })))
  }
  await ui.render(h(Task))
  const updateSettings = update
  for (const settings of [
    { readOnly: true, formEditing: false },
    { readOnly: true, formEditing: true },
    { readOnly: false, formEditing: false },
    { readOnly: false, formEditing: true },
  ]) {
    await act(async () => updateSettings(settings))
    assert.equal(ui.container.querySelector('[data-testid="mobile-task-business-source"]'), null, 'handling never owns the full source summary')
    assert.ok(informationHost.textContent.includes('来源业务当前资料'))
    assert.ok(informationHost.textContent.includes('SIM-ORDER-9'))
    assert.ok(informationHost.textContent.includes('12'))
    assert.equal(informationHost.querySelectorAll('[data-testid="mobile-task-business-source"]').length, 1)
    assert.equal(informationHost.querySelector('input, button[type="submit"]'), null)
  }
})
