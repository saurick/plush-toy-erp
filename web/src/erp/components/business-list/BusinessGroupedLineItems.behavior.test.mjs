import assert from 'node:assert/strict'
import test from 'node:test'
import React, { createElement as h } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { revealBusinessLineItemElement, revealBusinessLineItemErrors } from './businessLineItemDisclosure.mjs'

async function editor(t, { mobile = false, toolbar = false } = {}) {
  const ui = await createReactTestHarness(t)
  const [{ Form, Input }, { default: Groups }, { BusinessLineItemRow }, { BusinessPageContext }] = await Promise.all([
    import('antd'), import('./BusinessGroupedLineItems.jsx'), import('./BusinessLineItemsTable.jsx'), import('../../hooks/useBusinessPageContext.js'),
  ])
  const initial = [
    { id: 11, product_id: 1, quantity: '10', note: '甲' },
    { id: 12, product_id: 1, quantity: '20', note: '乙' },
    { id: 13, product_id: 2, quantity: '', note: '丙' },
    { id: 14, product_id: 2, quantity: '40', note: '丁' },
  ]
  let form
  let operations
  let setDevice
  function Editor() {
    const [instance] = Form.useForm()
    const [device, updateDevice] = React.useState(mobile ? 'mobile' : 'desktop')
    form = instance
    setDevice = updateDevice
    return h(BusinessPageContext.Provider, { value: React.useMemo(() => ({ taskBusiness: { device } }), [device]) }, h(Form, { form, initialValues: { items: initial } }, h(Form.List, { name: 'items' }, (fields, actions) => {
          operations = actions
          return h(Groups, {
            title: toolbar ? '订货明细' : undefined,
            headerActions: toolbar ? h('button', { type: 'button', 'data-import': true }, '导入明细') : undefined,
            fields,
            form,
            defaultExpanded: false,
            getGroup: (item) => ({ key: item.product_id, label: `产品 ${item.product_id}` }),
            tableProps: { columns: [{ label: '数量', width: 120 }], label: '明细' },
          }, (field, index) => h(BusinessLineItemRow, {
            index,
            hiddenFields: h(React.Fragment, null, ...['id', 'product_id'].map((name) => h(Form.Item, { key: name, name: [field.name, name], hidden: true }, h(Input)))),
            cells: [h(Form.Item, { key: 'quantity', name: [field.name, 'quantity'], rules: [{ required: true, message: '请填写数量' }] }, h(Input, { 'aria-label': `数量 ${index + 1}` }))],
          }, h(Form.Item, { name: [field.name, 'note'], label: '备注' }, h(Input, { 'aria-label': `备注 ${index + 1}` }))))
        })))
  }
  await ui.render(h(Editor))
  await ui.flush()
  if (!mobile) {
    const group = [...ui.container.querySelectorAll('button')].find((button) => button.textContent === '分组显示')
    await ui.act(async () => group.click())
  }
  return { ui, form, initial, operations, setDevice, rows: () => [...ui.container.querySelectorAll('.erp-editable-line-group')] }
}

test('标题、组数和操作共用工具栏，重算分组与折叠不重建输入和导入入口', async (t) => {
  const { ui, form, rows } = await editor(t, { toolbar: true })
  const heading = ui.container.querySelector('.erp-sales-order-lines-form__head')
  const controls = ui.container.querySelector('.erp-line-item-group-controls')
  const importer = ui.container.querySelector('[data-import]')
  const input = ui.container.querySelector('input[aria-label="数量 2"]')
  assert.equal(ui.container.querySelectorAll('.erp-sales-order-lines-form__head').length, 1)
  assert.equal(heading.contains(controls), true)
  assert.equal(heading.contains(importer), true)
  assert.equal(heading.querySelector('.erp-line-items-form__group-count').textContent, '2 组')
  assert.equal(heading.querySelectorAll('[data-table-scroll-toolbar]').length, 1)
  assert.equal(ui.container.querySelectorAll('.app-table-scroll-top').length, 0, '明细滚动入口不再独占一行')
  await ui.act(async () => form.setFieldValue(['items', 3, 'product_id'], 1))
  assert.equal(heading.querySelector('.erp-line-items-form__group-count').textContent, '3 组')
  assert.equal(ui.container.querySelector('[data-import]') === importer, true)
  assert.equal(ui.container.querySelector('input[aria-label="数量 2"]') === input, true)
  const collapse = [...controls.querySelectorAll('button')].find((button) => button.textContent === '全部收起')
  await ui.act(async () => collapse.click())
  assert.equal(rows().every((row) => row.hidden), true)
  assert.equal(form.getFieldValue(['items', 1, 'quantity']), '20')
})

test('折叠保留全部字段、来源和输入，保存仍校验隐藏明细并展开对应组', async (t) => {
  const { ui, form, initial, rows } = await editor(t)
  assert.equal(rows().length, 4)
  assert.equal(rows()[0].hidden, false)
  assert.equal(rows()[2].hidden, true)
  assert.equal(ui.container.querySelectorAll('input[aria-label^="数量"]').length, 4, '折叠不能卸载表单字段')
  await ui.act(async () => form.setFieldValue(['items', 3, 'note'], '保留隐藏行备注'))
  let errors
  await ui.act(async () => {
    try { await form.validateFields() } catch (error) { errors = error.errorFields }
  })
  assert.deepEqual(errors.map((field) => field.name), [['items', 2, 'quantity']])
  assert.equal(rows()[2].hidden, true)
  await ui.act(async () => {
    revealBusinessLineItemErrors(form, errors)
    assert.equal(rows()[2].hidden, false, '表单开始同步滚动和聚焦前，错误行已经可见')
  })
  await ui.flush()
  assert.equal(rows()[2].hidden, false)
  assert(ui.container.textContent.includes('1 项待修改'))
  await ui.act(async () => form.setFieldValue(['items', 2, 'quantity'], '30'))
  let saved
  await ui.act(async () => { saved = await form.validateFields() })
  assert.deepEqual(saved.items, initial.map((row, index) => ({ ...row, ...(index === 2 ? { quantity: '30' } : {}), ...(index === 3 ? { note: '保留隐藏行备注' } : {}) })))
})

test('改变产品只更新相邻分组，保留当前输入节点、焦点与独立来源行', async (t) => {
  const { ui, form, rows } = await editor(t)
  const input = ui.container.querySelector('input[aria-label="数量 2"]')
  await ui.act(async () => input.focus())
  await ui.act(async () => form.setFieldValue(['items', 1, 'product_id'], 3))
  assert.equal(ui.container.querySelector('input[aria-label="数量 2"]') === input, true)
  assert.equal(document.activeElement === input, true)
  assert.equal(rows()[1].hidden, false)
  assert.equal(ui.container.querySelectorAll('.erp-line-item-identity-group').length, 3)
  await ui.act(async () => form.setFieldValue(['items', 1, 'product_id'], 1))
  assert.equal(ui.container.querySelector('input[aria-label="数量 2"]') === input, true)
  assert.deepEqual(form.getFieldValue('items').map((row) => row.id), [11, 12, 13, 14])
})

test('追加及移除后按原索引定位折叠组，不清除其他组已填写内容', async (t) => {
  const { ui, form, operations, rows } = await editor(t)
  await ui.act(async () => operations.add({ product_id: 2, quantity: '50', note: '新增行' }))
  assert.equal(rows()[4].hidden, true)
  await ui.act(async () => revealBusinessLineItemElement(rows()[4], 4))
  assert.equal(rows()[4].hidden, false)
  await ui.act(async () => operations.remove(1))
  assert.deepEqual(form.getFieldValue('items').map((row) => row.id), [11, 13, 14, undefined])
  assert.equal(form.getFieldValue(['items', 3, 'note']), '新增行')
})

test('清空明细后重新录入，展开状态从首组开始', async (t) => {
  const { ui, form, operations, rows } = await editor(t)
  await ui.act(async () => operations.remove([0, 1, 2, 3]))
  assert.equal(rows().length, 0)
  await ui.act(async () => {
    operations.add({ product_id: 9, quantity: '1' })
    operations.add({ product_id: 10, quantity: '2' })
  })
  assert.equal(rows()[0].hidden, false)
  assert.equal(rows()[1].hidden, true)
  assert.deepEqual(form.getFieldValue('items').map((row) => row.product_id), [9, 10])
})

test('手机分组仍能展开、编辑和整单保存，切换呈现不丢值', async (t) => {
  const { ui, form, rows, setDevice } = await editor(t, { mobile: true })
  assert.equal(ui.container.querySelectorAll('.erp-task-line-card').length, 4)
  assert.equal(rows()[2].hidden, true)
  const expand = [...ui.container.querySelectorAll('button')].find((button) => button.textContent === '全部展开')
  await ui.act(async () => expand.click())
  assert.equal(rows().every((row) => !row.hidden), true)
  await ui.act(async () => form.setFieldValue(['items', 2, 'quantity'], '30'))
  await ui.act(async () => setDevice('desktop'))
  assert.equal(Boolean(ui.container.querySelector('table')), true)
  let saved
  await ui.act(async () => { saved = await form.validateFields() })
  assert.deepEqual(saved.items.map((row) => row.quantity), ['10', '20', '30', '40'])
})

test('弹层内独立表单不继承外层明细的折叠与行索引', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ Form, Input }, { createPortal }, { BusinessLineItemRow, default: Table }, { BusinessLineItemDisclosureContext }] = await Promise.all([
    import('antd'), import('react-dom'), import('./BusinessLineItemsTable.jsx'), import('./BusinessLineItemDisclosureContext.js'),
  ])
  function Editor() {
    const [outer] = Form.useForm()
    const [inner] = Form.useForm()
    const row = (label) => h(BusinessLineItemRow, { index: 0, cells: [h(Input, { key: 'input', 'aria-label': label })] })
    return h(Form, { form: outer }, h(BusinessLineItemDisclosureContext.Provider, { value: { form: outer, hidden: true, index: 3, onFocus: () => {} } }, h(Table, { columns: [{ label: '名称' }] }, row('外层明细')), createPortal(h(Form, { form: inner }, h(Table, { columns: [{ label: '名称' }] }, row('弹层明细'))), document.body)))
  }
  await ui.render(h(Editor))
  const outerRow = document.querySelector('input[aria-label="外层明细"]').closest('[data-line-item-collapsed]')
  const innerRow = document.querySelector('input[aria-label="弹层明细"]').closest('.erp-editable-line-group')
  assert.equal(outerRow.hidden, true)
  assert.equal(outerRow.dataset.lineItemIndex, '3')
  assert.equal(innerRow.hidden, false)
  assert.equal(innerRow.hasAttribute('data-line-item-index'), false)
})
