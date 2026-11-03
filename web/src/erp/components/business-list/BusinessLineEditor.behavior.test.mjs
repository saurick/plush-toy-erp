import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

async function example(t, { mobile = false, readOnly = false } = {}) {
  const ui = await businessFormHarness(t)
  const [{ Form, Input, Button }, { default: Groups }, { BusinessLineItemRow: Row }, { BusinessPageContext }] = await Promise.all([
    import('antd'), import('./BusinessGroupedLineItems.jsx'), import('./BusinessLineItemsTable.jsx'), import('../../hooks/useBusinessPageContext.js'),
  ])
  const { revealBusinessLineItemErrors } = await import('./businessLineItemDisclosure.mjs')
  let form
  function Example() {
    [form] = Form.useForm()
    return h(BusinessPageContext.Provider, { value: { taskBusiness: { device: mobile ? 'mobile' : 'desktop' } } }, h(Form, { form,
disabled: readOnly,
initialValues: { items: [
        { id: 11, name: '面料', quantity: '12', note: '甲' },
        { id: 12, name: '填充棉', quantity: '20', note: '乙' },
      ] } }, h(Form.List, { name: 'items' }, (fields, { add, remove }) => h(Groups, {
        title: '采购明细',
fields,
form,
getGroup: (item) => ({ key: item.name, label: item.name }),
        tableProps: { columns: [{ label: '名称', width: 180 }, { label: '数量', width: 120 }] },
      }, (field, index) => h(Row, {
        index,
        hiddenFields: h(Form.Item, { name: [field.name, 'id'], hidden: true }, h(Input)),
        actions: h('span', null, h(Button, { 'aria-label': `复制行 ${index + 1}`, onClick: () => add({ ...form.getFieldValue(['items', field.name]), id: undefined }, index + 1) }, '复制行'), h(Button, { 'aria-label': `移除行 ${index + 1}`, disabled: fields.length <= 1, onClick: () => remove(field.name) }, '移除行')),
        cells: [
          h(Form.Item, { key: 'name', name: [field.name, 'name'], label: `名称 ${index + 1}` }, h(Input)),
          h(Form.Item, { key: 'quantity', name: [field.name, 'quantity'], label: `数量 ${index + 1}` }, h(Input)),
        ],
      }, h(Form.Item, { name: [field.name, 'note'], label: `备注 ${index + 1}`, rules: [{ required: true, message: '请核对备注' }] }, h(Input)))))))
  }
  await ui.render(h(Example))
  const root = () => document.querySelector('.erp-line-editor')
  const selected = () => root().querySelector('[data-line-editor-selected="true"]')
  const row = (index) => root().querySelectorAll('tbody.erp-editable-line-group')[index]
  return { ui, form, root, selected, row, revealBusinessLineItemErrors }
}

test('点击或聚焦明细直接选行，顶部操作跟随当前行且保留字段节点与草稿', async (t) => {
  const { ui, form, root, selected, row } = await example(t)
  const name = row(0).querySelector('[id$="name"]')
  const second = row(1)
  const note = second.querySelector('[id$="note"]')
  assert.equal(root().querySelectorAll('th.erp-line-item-table__actions').length, 0)
  assert.equal(root().querySelectorAll('td.erp-line-item-table__actions').length, 0)
  assert.equal(root().querySelectorAll('.erp-line-item-identity-group').length, 0)
  assert.equal(root().querySelector('fieldset').disabled, true)
  await ui.click(root().querySelector('fieldset button'))
  assert.equal(form.getFieldValue('items').length, 2, '未选择时不能触发原按钮')
  assert.equal(root().querySelectorAll('.erp-line-editor__row-marker input').length, 0)
  await ui.click(second.querySelector('td'))
  assert.equal(selected().textContent.includes('第 2 行 · 填充棉'), true)
  await act(() => name.focus())
  await ui.fill(name, '本单面料')
  assert.equal(selected().textContent.includes('第 1 行 · 本单面料'), true, '键盘进入字段后操作对象跟随所在行')
  await ui.click(second.querySelector('button[aria-controls]'))
  await ui.fill(note, '保留当前行备注')
  assert.equal(selected().textContent.includes('第 2 行 · 填充棉'), true)
  assert.equal(row(0).querySelector('[id$="name"]') === name, true)
  await ui.click(second.querySelector('button[aria-controls]'))
  assert.equal(second.querySelector('.erp-line-item-table__details-row').hidden, true)
  assert.equal(second.querySelector('[id$="note"]') === note, true)
  assert.equal(form.getFieldValue(['items', 1, 'note']), '保留当前行备注')
  await ui.click(selected().querySelector('button[aria-label="清空明细选择"]'))
  assert.equal(selected(), null)
  assert.equal(document.activeElement === second, true, '清空后回到原行，不重选且不增加 Tab 停靠点')
  await ui.click(second.querySelector('td'))
  await ui.click(selected().querySelector('button[aria-label="复制行 2"]'))
  assert.equal(form.getFieldValue('items').length, 3)
  assert.equal(form.getFieldValue(['items', 2, 'note']), '保留当前行备注')
  assert.equal(form.getFieldValue(['items', 2, 'id']), undefined)
  await ui.click(row(2).querySelector('td'))
  await ui.click(selected().querySelector('button[aria-label="移除行 3"]'))
  assert.equal(form.getFieldValue('items').length, 2)
  assert.equal(selected(), null, '移除后不将选择转移到其他行')
  assert.equal(root().querySelector('fieldset').disabled, true)
  assert.deepEqual(Object.keys(form.getFieldsValue(true)), ['items'])
})

test('隐藏资料校验在同步定位前展开，重复相同错误仍能定位', async (t) => {
  const { ui, form, row, revealBusinessLineItemErrors } = await example(t)
  const second = row(1)
  const input = second.querySelector('[id$="note"]')
  assert.equal(second.querySelector('.erp-line-item-table__details-row').hidden, true)
  await act(() => form.setFieldValue(['items', 1, 'note'], ''))
  let errors
  await act(async () => { try { await form.validateFields() } catch (error) { errors = error.errorFields } })
  await act(() => { revealBusinessLineItemErrors(form, errors); assert.equal(second.querySelector('.erp-line-item-table__details-row').hidden, false) })
  await ui.click(second.querySelector('button[aria-controls]'))
  await act(() => { revealBusinessLineItemErrors(form, errors); assert.equal(second.querySelector('.erp-line-item-table__details-row').hidden, false) })
  assert.equal(second.querySelector('[id$="note"]') === input, true)
  await ui.fill(input, '已补齐')
  let saved
  await act(async () => { saved = await form.validateFields() })
  assert.equal(saved.items[1].note, '已补齐')
})

test('只读保留资料导航；手机保留完整表单与就近行操作', async (t) => {
  const { ui, root, row } = await example(t, { readOnly: true })
  assert.equal(root().querySelectorAll('.erp-line-editor__row-marker input[type="radio"]').length, 0)
  assert.equal(root().querySelectorAll('.erp-line-editor__action-host').length, 0)
  const toggle = row(0).querySelector('button[aria-controls]')
  assert.equal(toggle.disabled, false)
  await ui.click(toggle)
  assert.equal(row(0).querySelector('.erp-line-item-table__details-row').hidden, false)
  assert.equal(row(0).querySelector('[id$="note"]').disabled, true)
})

test('手机不引入选中行工具栏和第二层资料折叠', async (t) => {
  const { root } = await example(t, { mobile: true })
  assert.equal(root().querySelectorAll('.erp-task-line-card').length, 2)
  assert.equal(root().querySelectorAll('.erp-line-editor__action-host').length, 0)
  assert.equal(root().querySelectorAll('.erp-line-editor__row-marker input[type="radio"]').length, 0)
  assert.equal(root().querySelectorAll('.erp-task-line-card__actions button').length, 4)
  assert.equal(root().querySelectorAll('button[aria-controls]').length, 0)
})

test('固定来源的核销明细不增加选行或虚构的增删动作', async (t) => {
  const ui = await businessFormHarness(t)
  const [{ Form, Input }, { default: Table, BusinessCompactFieldRow: Row }] = await Promise.all([import('antd'), import('./BusinessCompactFieldTable.jsx')])
  let form
  function Example() {
    [form] = Form.useForm()
    return h(Form, { form, initialValues: { amount: '12.5' } }, h(Table, { showSequence: true, label: '核销明细', columns: [{ label: '本次金额' }] }, h(Row, { sequence: 1, cells: [h(Form.Item, { key: 'amount', name: 'amount' }, h(Input))] })))
  }
  await ui.render(h(Example))
  assert.equal(document.querySelectorAll('.erp-line-editor__action-host, .erp-line-editor__row-marker input[type="radio"]').length, 0)
  assert.equal(form.getFieldValue('amount'), '12.5')
})

test('联系人选择与主联系人分开，复制和移除沿用原有主联系人规则', async (t) => {
  const ui = await businessFormHarness(t)
  const [{ Form }, { default: Contacts }] = await Promise.all([import('antd'), import('../master-data/ContactFormList.jsx')])
  let form
  function Example() {
    [form] = Form.useForm()
    return h(Form, { form, initialValues: { contacts: [{ id: 1, name: '张三', is_primary: true, note: '保留备注' }, { id: 2, name: '李四', is_primary: false }] } }, h(Contacts, { form, entityLabel: '客户' }))
  }
  await ui.render(h(Example))
  const first = document.querySelector('.erp-master-contact-list__row')
  const note = first.querySelector('textarea')
  await ui.click(first.querySelector('td'))
  assert.deepEqual(form.getFieldValue('contacts').map((row) => row.is_primary), [true, false])
  let selected = document.querySelector('[data-line-editor-selected="true"]')
  await ui.click(selected.querySelector('button[aria-label="复制联系人条目 1"]'))
  assert.deepEqual(form.getFieldValue('contacts').map((row) => row.is_primary), [true, false, false])
  assert.equal(first.querySelector('textarea') === note, true)
  await ui.click(first.querySelector('td'))
  selected = document.querySelector('[data-line-editor-selected="true"]')
  await ui.click(selected.querySelector('button[aria-label="移除联系人条目 1"]'))
  assert.deepEqual(form.getFieldValue('contacts').map((row) => row.is_primary), [true, false])
  assert.equal(form.getFieldValue('contacts')[0].note, '保留备注')
})

test('弹层的独立表单拥有自己的选择和操作区，不复用外层操作对象', async (t) => {
  const ui = await businessFormHarness(t)
  const [{ Form, Input, Button }, { createPortal }, { default: Table, BusinessLineItemRow: Row }] = await Promise.all([import('antd'), import('react-dom'), import('./BusinessLineItemsTable.jsx')])
  let outerActions = 0
  let innerActions = 0
  function Example() {
    const [outer] = Form.useForm()
    const [inner] = Form.useForm()
    const nested = createPortal(h(Form, { form: inner, className: 'inner-line-form' }, h(Table, { label: '内层明细', columns: [{ label: '数量' }] }, h(Row, { index: 0, cells: [h(Input, { key: 'inner' })], actions: h(Button, { onClick: () => { innerActions += 1 } }, '执行内层操作') }))), document.body)
    return h(Form, { form: outer, className: 'outer-line-form' }, h(Table, { label: '外层明细', columns: [{ label: '数量' }] }, h(Row, { index: 0, cells: [h(Input, { key: 'outer' })], actions: h(Button, { onClick: () => { outerActions += 1 } }, '执行外层操作') }, nested)))
  }
  await ui.render(h(Example))
  const outer = document.querySelector('.outer-line-form')
  const inner = document.querySelector('.inner-line-form')
  await ui.click(outer.querySelector('tbody td'))
  await ui.click(inner.querySelector('tbody td'))
  assert.equal(outer.querySelector('[data-line-editor-selected="true"]').textContent.includes('执行内层操作'), false)
  await ui.click(inner.querySelector('[data-line-editor-selected="true"] fieldset button'))
  assert.equal(innerActions, 1)
  assert.equal(outerActions, 0)
})
