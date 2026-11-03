import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

async function editor(t, { mobile = false, readOnly = false } = {}) {
  const ui = await businessFormHarness(t)
  const { revealBusinessLineItemErrors } = await import('../business-list/businessLineItemDisclosure.mjs')
  const [{ Form, Input }, { default: Groups }, { BusinessLineItemRow: Row }, { default: Fields }, { default: Summary }, { BusinessPageContext }] = await Promise.all([
    import('antd'), import('../business-list/BusinessGroupedLineItems.jsx'), import('../business-list/BusinessLineItemsTable.jsx'),
    import('./PurchaseMaterialSnapshotFields.jsx'), import('./PurchaseOrderLineSummary.jsx'), import('../../hooks/useBusinessPageContext.js'),
  ])
  const materials = [{ id: 1, name: '短毛绒', code: 'M-1', color: '米白' }, { id: 2, name: '里布', code: 'M-2', color: '白色' }]
  let form
  function Example() {
    [form] = Form.useForm()
    return h(BusinessPageContext.Provider, { value: { taskBusiness: { device: mobile ? 'mobile' : 'desktop' } } }, h(Form, { form, disabled: readOnly, initialValues: { items: materials.map((material) => ({ material_id: material.id, purchased_quantity: '12', material_name_snapshot: material.name, material_code_snapshot: material.code, color_snapshot: material.color, note: '已核对' })) } }, h(Form.List, { name: 'items' }, (fields) => h(Groups, {
          form,
fields,
defaultExpanded: !mobile,
          getGroup: (item) => ({ key: item.material_id, label: `材料 ${item.material_id}` }),
          tableProps: { columns: [{ label: '材料', width: 200 }, { label: '采购数量', width: 120 }], label: '采购明细' },
        }, (field, index) => h(Row, {
          index,
collapsibleDetails: true,
detailsToggleLabel: '下单资料',
          detailsLabel: `第 ${index + 1} 条 · 下单资料与来源`,
          detailsIdentity: h(Summary, { form, fieldName: field.name, materials, identityOnly: true }),
          hiddenFields: h(Form.Item, { name: [field.name, 'material_id'], hidden: true }, h(Input)),
          cells: [h(Summary, { key: 'summary', form, fieldName: field.name, materials }), h(Form.Item, { key: 'quantity', name: [field.name, 'purchased_quantity'], label: `数量 ${index + 1}` }, h(Input))],
        }, h(Fields, { fieldName: field.name, disabled: readOnly }), h(Form.Item, { name: [field.name, 'note'], label: `备注 ${index + 1}`, rules: [{ required: true, message: '请核对本条备注' }] }, h(Input)))))))
  }
  await ui.render(h(Example))
  return { ui, form, materials, revealBusinessLineItemErrors, row: (index) => document.querySelectorAll('.erp-editable-line-group')[index] }
}

test('采购主行默认可见，资料收起保留字段节点、快照与已输入草稿', async (t) => {
  const { ui, form, row } = await editor(t)
  assert.equal(row(0).hidden, false)
  assert.equal(row(1).hidden, false)
  const first = row(0)
  const detail = first.querySelector('.erp-line-item-table__details-row')
  const input = first.querySelector('[id$="material_name_snapshot"]')
  assert.equal(detail.hidden, true)
  const toggle = first.querySelector('button[aria-controls]')
  await ui.click(toggle)
  await ui.fill(input, '本单专用面料名称')
  assert.equal(first.querySelector('.erp-purchase-line-summary').textContent.includes('下单：本单专用面料名称'), true)
  await ui.click(toggle)
  assert.equal(detail.hidden, true)
  assert.equal(toggle.getAttribute('aria-expanded'), 'false')
  assert.equal(first.querySelector('.erp-line-item-table__index').rowSpan, 1)
  assert.equal(first.querySelector('[id$="material_name_snapshot"]') === input, true)
  let saved
  await act(async () => { saved = await form.validateFields() })
  assert.equal(saved.items[0].material_name_snapshot, '本单专用面料名称')
  assert.equal(saved.items[0].material_code_snapshot, 'M-1')
  assert.equal(saved.items[0].note, '已核对')
  await ui.click(toggle)
  assert.equal(detail.hidden, false)
  assert.equal(first.querySelector('[id$="material_name_snapshot"]') === input, true)
})

test('隐藏资料校验失败时，在同步滚动前展开对应材料组和资料区', async (t) => {
  const { ui, form, row, revealBusinessLineItemErrors } = await editor(t)
  const second = row(1)
  const note = ui.field('备注 2')
  await act(() => form.setFieldValue(['items', 1, 'note'], ''))
  await ui.click(ui.button('分组显示'))
  await ui.click(ui.button('全部收起'))
  assert.equal(second.hidden, true)
  assert.equal(second.querySelector('.erp-line-item-table__details-row').hidden, true)
  let errors
  await act(async () => { try { await form.validateFields() } catch (error) { errors = error.errorFields } })
  assert.deepEqual(errors.map((field) => field.name), [['items', 1, 'note']])
  await act(async () => {
    revealBusinessLineItemErrors(form, errors)
    assert.equal(second.hidden, false)
    assert.equal(second.querySelector('.erp-line-item-table__details-row').hidden, false, '开始同步定位时资料已可见')
  })
  assert.equal(second.querySelector('input[id$="note"]') === note, true)
  assert.equal(second.textContent.includes('1 项待修改'), true)
  await ui.click(second.querySelector('button[aria-controls]'))
  assert.equal(second.querySelector('.erp-line-item-table__details-row').hidden, true)
  await act(async () => {
    revealBusinessLineItemErrors(form, errors)
    assert.equal(second.querySelector('.erp-line-item-table__details-row').hidden, false, '相同错误再次定位也要同步展开')
  })
  await ui.fill(note, '已补齐核对意见')
  let saved
  await act(async () => { saved = await form.validateFields() })
  assert.equal(saved.items[1].note, '已补齐核对意见')
  assert.equal(second.querySelector('.erp-line-item-table__details-row').hidden, false)
})

test('手机提供完整字段标签，保留只读字段与原有材料分组', async (t) => {
  const { row } = await editor(t, { mobile: true, readOnly: true })
  assert.equal(document.querySelectorAll('.erp-task-line-card').length, 2)
  assert.equal(row(0).querySelectorAll('.erp-line-item-table__details-row').length, 0)
  assert.equal(row(0).querySelector('[id$="material_name_snapshot"]').disabled, true)
  assert.equal(row(0).querySelectorAll('button[aria-controls]').length, 0)
})

test('只读状态允许展开下单资料，不能修改字段', async (t) => {
  const { ui, row } = await editor(t, { readOnly: true })
  const second = row(1)
  const toggle = second.querySelector('button[aria-controls]')
  assert.equal(toggle.disabled, false)
  await ui.click(toggle)
  assert.equal(second.querySelector('.erp-line-item-table__details-row').hidden, false)
  assert.equal(second.querySelector('[id$="material_name_snapshot"]').disabled, true)
})

test('插入和移除前面的明细后，摘要按当前字段位置读取，不串用相邻行颜色', async (t) => {
  const ui = await businessFormHarness(t)
  const [{ Form }, { default: Summary }] = await Promise.all([import('antd'), import('./PurchaseOrderLineSummary.jsx')])
  let form
  let operations
  function Example() {
    [form] = Form.useForm()
    return h(Form, { form, initialValues: { items: [{ color_snapshot: '米白' }, {}] } }, h(Form.List, { name: 'items' }, (fields, actions) => {
      operations = actions
      return fields.map((field) => h('div', { key: field.key, 'data-summary-line': true }, h(Summary, { form, fieldName: field.name, materials: [] })))
    }))
  }
  await ui.render(h(Example))
  const textAt = (index) => document.querySelectorAll('[data-summary-line]')[index].textContent
  await act(() => operations.add({ color_snapshot: '米白' }, 1))
  assert.equal(textAt(0), '颜色：米白')
  assert.equal(textAt(1), '颜色：米白')
  assert.equal(textAt(2), '', '后移的空白行不显示相邻材料颜色')
  await act(() => operations.remove(0))
  assert.equal(textAt(0), '颜色：米白')
  assert.equal(textAt(1), '', '前移后仍对应空白行')
})
