import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'
import { buildPurchaseOrderItemSourceValuesFromMaterial } from '../../utils/sourceOrderLineValues.mjs'

test('采购下单名称复用行补充资料折叠，收起后完整保存，切换与清空材料不留旧值', async (t) => {
  const ui = await businessFormHarness(t)
  const [{ Form }, { default: Fields }, { BusinessLineItemRow }, { default: BusinessLineTable }] =
    await Promise.all([
      import('antd'),
      import('./PurchaseMaterialSnapshotFields.jsx'),
      import('../business-list/BusinessLineItemsTable.jsx'),
      import('../business-list/BusinessLineTable.jsx'),
    ])
  const materials = [{ id: 1, code: 'MAT-1', name: '短毛绒', color: '米白', default_unit_id: 1 }, { id: 2, code: 'MAT-2', name: '长毛绒', color: '棕色', default_unit_id: 1 }]
  let form
  function Example() {
    [form] = Form.useForm()
    const rows = h(Form.List, { name: 'items' }, (fields) => fields.map((field) => h(BusinessLineItemRow, {
      key: field.key,
      index: field.name,
      cells: [h('span', null, '材料')],
      collapsibleDetails: true,
      detailsToggleLabel: '下单材料信息',
    }, h(Fields, { fieldName: field.name }))))
    return h(Form, { form, initialValues: { items: [buildPurchaseOrderItemSourceValuesFromMaterial(materials[0])] } }, h(BusinessLineTable, {
      label: '采购明细',
      columns: [{ key: 'line', label: '序号' }, { key: 'material', label: '材料' }],
      expandableDetails: true,
    }, rows))
  }
  await ui.render(h(Example))
  assert.equal(Boolean(ui.field('下单材料名称').closest('[hidden]')), true)
  const toggle = document.querySelector('button[aria-controls]')
  await ui.click(toggle)
  assert.equal(Boolean(ui.field('下单材料名称').closest('[hidden]')), false)
  await ui.fill('下单材料名称', '原单专用名称')
  await ui.click(toggle)
  const saved = await form.validateFields()
  assert.equal(saved.items[0].material_name_snapshot, '原单专用名称')
  assert.equal(saved.items[0].material_code_snapshot, 'MAT-1')
  await act(() => form.setFieldValue(['items', 0], buildPurchaseOrderItemSourceValuesFromMaterial(materials[1])))
  await ui.flush()
  assert.equal(form.getFieldValue(['items', 0, 'material_name_snapshot']), '长毛绒')
  await act(() => form.setFieldValue(['items', 0], buildPurchaseOrderItemSourceValuesFromMaterial({})))
  await ui.flush()
  assert.equal(form.getFieldValue(['items', 0, 'material_name_snapshot']), '')
  assert.equal(form.getFieldValue(['items', 0, 'color_snapshot']), '')
})

test('历史材料不可读时保留已保存名称，只读状态不允许改写', async (t) => {
  const ui = await businessFormHarness(t)
  const [{ Form }, { default: Fields }] = await Promise.all([import('antd'), import('./PurchaseMaterialSnapshotFields.jsx')])
  function Example() {
    const [form] = Form.useForm()
    return h(Form, { form, initialValues: { items: [{ material_id: 9, material_code_snapshot: 'OLD-9', material_name_snapshot: '历史下单名称', color_snapshot: '' }] } }, h(Form.List, { name: 'items' }, (fields) => fields.map((field) => h(Fields, { key: field.key, fieldName: field.name, disabled: true }))))
  }
  await ui.render(h(Example))
  assert.equal(ui.field('下单材料名称').value, '历史下单名称')
  assert.equal(ui.field('下单材料名称').disabled, true)
  assert.equal(ui.field('下单材料编码').value, 'OLD-9')
})
