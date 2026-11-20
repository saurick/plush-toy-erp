import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

async function example(t, { readOnly = false, singleGroup = false } = {}) {
  const ui = await businessFormHarness(t)
  const [{ Form }, { default: Editor }] = await Promise.all([import('antd'), import('./BOMMaterialGroupsForm.jsx')])
  const materials = [{ id: 1, name: '短毛绒', unit_id: 1 }, { id: 2, name: '填充棉', unit_id: 2 }]
  const units = [{ value: 1, label: '米', unit_precision: 6 }, { value: 2, label: '千克', unit_precision: 6 }]
  const items = [
    { id: 11, material_id: 1, unit_id: 1, position: '左耳', quantity: '0.125', loss_rate: '0.1', note: '保留左耳说明', source_snapshot: { quantity_format: '0.000' }, total_usage_snapshot: '2', _import_source: { rowNumber: 5 } },
    { id: 12, material_id: 1, unit_id: 1, position: '右耳', quantity: '0.25', loss_rate: '0', note: '保留右耳说明' },
    ...singleGroup ? [] : [{ id: 13, material_id: 2, unit_id: 2, position: '身体', quantity: '0.5', loss_rate: '0', note: '另一种物料' }],
  ]
  let form
  function Example() {
    [form] = Form.useForm()
    return h(Form, { form, initialValues: { quantity_text: '10', items }, disabled: readOnly }, h(Editor, { canEdit: !readOnly, canCreateMaterial: false, form, materialByID: new Map(materials.map((m) => [m.id, m])), materialOptions: materials.map((m) => ({ value: m.id, label: m.name, record: m })), unitOptions: units }))
  }
  await ui.render(h(Example))
  const part = (index) => document.querySelector(`tr[data-bom-part-index="${index - 1}"]`)
  const material = (name) => [...document.querySelectorAll('.erp-bom-material-group')].find((node) => node.getAttribute('aria-label') === `${name}的部位`)?.querySelector('.erp-bom-material-cell')
  const status = () => document.querySelector('.erp-bom-selection-actions [role="status"]')?.textContent
  return { ui, form, part, material, status, items }
}

test('BOM 点击部位或聚焦字段后从顶部操作，复制保留源快照清理规则与字段节点', async (t) => {
  const { ui, form, part, status } = await example(t)
  assert.equal([...document.querySelectorAll('thead th')].some((node) => node.textContent === '操作'), false)
  assert.equal(document.querySelectorAll('.erp-bom-part-actions').length, 0)
  assert.equal(document.querySelectorAll('input[type="radio"], .erp-bom-selection-cell').length, 0)
  assert.equal(document.querySelectorAll('thead th').length, 12)
  assert.equal(ui.button('复制部位').disabled, true)
  const first = document.querySelector('textarea[aria-label="部位 1"]')
  await ui.click(part(1))
  assert.equal(status(), '部位：短毛绒 · 左耳')
  await ui.click(document.querySelector('button[aria-label="清空 BOM 选择"]'))
  assert.equal(document.activeElement === part(1), true)
  assert.equal(status(), '点击物料或部位后操作')
  await ui.click(part(1))
  await ui.fill(first, '左耳片')
  assert.equal(status(), '部位：短毛绒 · 左耳片')
  const second = document.querySelector('textarea[aria-label="部位 2"]')
  await act(() => second.focus())
  await ui.fill(second, '右耳片')
  assert.equal(status(), '部位：短毛绒 · 右耳片', '键盘进入另一行后顶部动作跟随所在部位')
  await act(() => first.focus())
  assert.equal(document.querySelector('textarea[aria-label="部位 1"]') === first, true)
  await ui.click(ui.button('复制部位'))
  const values = form.getFieldsValue(true)
  assert.equal(values.items.length, 4)
  assert.equal(values.items[1].position, '左耳片')
  assert.equal(values.items[1].note, '保留左耳说明')
  for (const key of ['id', 'source_snapshot', 'total_usage_snapshot', '_import_source']) assert.equal(Object.hasOwn(values.items[1], key), false, key)
  assert.equal(values.items[0].id, 11)
  assert.equal(values.items[2].position, '右耳片')
  assert.deepEqual(Object.keys(values).sort(), ['items', 'quantity_text'])
  assert.equal(document.querySelector('textarea[aria-label="部位 1"]') === first, true)
  await ui.click(ui.button('移除部位'))
  assert.equal(form.getFieldValue('items').length, 3)
  assert.equal(form.getFieldValue(['items', 0, 'position']), '左耳片')
  assert.equal(status(), '点击物料或部位后操作')
})

test('BOM 物料动作只影响本组，确认显示部位数量；切换对象会关闭旧确认', async (t) => {
  const { ui, form, material, status } = await example(t)
  await ui.click(ui.button('全部展开'))
  await ui.click(material('短毛绒'))
  assert.equal(status(), '物料：短毛绒 · 2 个部位')
  assert.equal(Boolean(ui.button('复制部位')), false)
  await ui.click(ui.button('添加部位'))
  assert.equal(form.getFieldValue('items').length, 4)
  assert.equal(form.getFieldValue(['items', 2, 'material_id']), 1)
  assert.equal(form.getFieldValue(['items', 2, 'quantity']), '')
  await ui.click(material('短毛绒'))
  await ui.click(ui.button('移除物料'))
  assert.equal(document.body.textContent.includes('短毛绒 及其 3 个部位'), true)
  await ui.click(ui.button('保留'))
  assert.equal(form.getFieldValue('items').length, 4)
  await ui.click(ui.button('移除物料'))
  await ui.click(material('填充棉'))
  assert.equal(status(), '物料：填充棉 · 1 个部位')
  assert.equal(document.querySelectorAll('.ant-popover:not(.ant-popover-hidden)').length, 0)
  await ui.click(ui.button('移除物料'))
  await ui.click(ui.button('移除整组'))
  assert.equal(form.getFieldValue('items').length, 3)
  assert.equal(form.getFieldValue('items').every((item) => item.material_id === 1), true)
  assert.equal(status(), '点击物料或部位后操作')
})

test('BOM 最后一个部位保留原限制，收起和重置清除不可见或失效选择', async (t) => {
  const { ui, form, part, status } = await example(t)
  await ui.click(ui.button('全部展开'))
  await ui.click(part(3))
  assert.equal(ui.button('移除部位').disabled, true)
  assert.match(ui.button('移除部位').title, /仅剩一个部位/u)
  await ui.click(ui.button('全部收起'))
  assert.equal(status(), '点击物料或部位后操作')
  await ui.click(ui.button('全部展开'))
  await ui.click(part(2))
  await act(() => form.resetFields())
  assert.equal(status(), '点击物料或部位后操作')
  assert.equal(form.getFieldValue(['items', 1, 'position']), '右耳')
})

test('单组 BOM 仍能选择物料并移除整组，添加物料恢复原字段布局', async (t) => {
  const { ui, form, material } = await example(t, { singleGroup: true })
  assert.equal(document.querySelectorAll('.erp-line-item-disclosure-heading').length, 0)
  await ui.click(material('短毛绒'))
  await ui.click(ui.button('移除物料'))
  await ui.click(ui.button('移除整组'))
  assert.deepEqual(form.getFieldValue('items'), [])
  await ui.click(ui.button('添加物料'))
  assert.equal(form.getFieldValue('items').length, 1)
  assert.equal(document.querySelectorAll('input[aria-label^="物料名称 "]').length, 1)
  assert.equal(document.querySelectorAll('thead th').length, 12)
})

test('只读 BOM 不提供选择和业务动作，仍可展开所有分组和查看原字段', async (t) => {
  const { ui, form } = await example(t, { readOnly: true })
  assert.equal(document.querySelectorAll('input[type="radio"]').length, 0)
  assert.equal(document.querySelectorAll('.erp-bom-selection-actions').length, 0)
  assert.equal(document.querySelectorAll('thead th').length, 12)
  await ui.click(ui.button('全部展开'))
  assert.equal(document.querySelector('textarea[aria-label="部位 3"]').disabled, true)
  assert.equal(form.getFieldValue('items').length, 3)
})
