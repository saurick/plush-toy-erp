import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement as h } from 'react'
import dayjs from 'dayjs'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('行交期沿用整单而不重复保存，单独设置及清空恢复继承', async (t) => {
  const ui = await businessFormHarness(t)
  const [{ Form }, { InheritedDateInput }] = await Promise.all([import('antd'), import('./BusinessDateInputs.jsx')])
  let form
  function Example() {
    [form] = Form.useForm()
    const header = Form.useWatch('delivery', { form, preserve: true })
    return h(Form, { form, initialValues: { delivery: '2026-11-06' } }, h(Form.Item, { name: 'line_delivery', label: '行交期' }, h(InheritedDateInput, { inheritedValue: header, label: '行交期', defaultPickerValue: dayjs('2026-11-08') })))
  }
  await ui.render(h(Example))
  assert.equal(document.querySelectorAll('.ant-picker').length, 0)
  assert.ok(ui.button('2026/11/06 · 沿用'))
  assert.equal(form.getFieldValue('line_delivery'), undefined)
  await act(() => form.setFieldValue('delivery', '2026-11-07'))
  await ui.flush()
  assert.ok(ui.button('2026/11/07 · 沿用'))
  await ui.click(ui.button('2026/11/07 · 沿用'))
  const day = document.querySelector('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden) .ant-picker-cell-in-view[title="2026-11-08"]')
  await ui.click(day)
  assert.equal(form.getFieldValue('line_delivery'), '2026-11-08')
  await act(() => form.setFieldValue('delivery', '2026-11-09'))
  await ui.flush()
  assert.equal(form.getFieldValue('line_delivery'), '2026-11-08', '整单改期不覆盖已经单独确认的行交期')
  await ui.click(document.querySelector('.ant-picker-clear'))
  assert.equal(form.getFieldValue('line_delivery'), '')
  assert.ok(ui.button('2026/11/09 · 沿用'))
  assert.equal(document.activeElement === ui.button('2026/11/09 · 沿用'), true, '清空后焦点回到同一行的沿用入口')
})

test('校验失败的行交期直接显示原值，禁用时不能展开修改', async (t) => {
  const ui = await businessFormHarness(t)
  const [{ Form }, { InheritedDateInput }] = await Promise.all([import('antd'), import('./BusinessDateInputs.jsx')])
  let form
  function Example({ disabled = false }) {
    [form] = Form.useForm()
    return h(Form, { form, disabled }, h(Form.Item, { name: 'date', label: '行交期', rules: [{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error('请核对行交期')) }] }, h(InheritedDateInput, { label: '行交期', inheritedValue: '2026-11-06', disabled })))
  }
  await ui.render(h(Example, { disabled: true }))
  assert.equal(ui.button('2026/11/06 · 沿用').disabled, true)
  await ui.click(ui.button('2026/11/06 · 沿用'))
  assert.equal(document.querySelectorAll('.ant-picker').length, 0)
  await ui.render(h(Example))
  await act(async () => { await assert.rejects(form.validateFields()) })
  assert.equal(document.querySelectorAll('.ant-picker').length, 1, '校验错误不能藏在沿用摘要后面')
})
