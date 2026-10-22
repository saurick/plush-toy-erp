import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act, createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'
import { filterSelectOptions, isEmptyFilterValue } from './filterSelectOptions.mjs'

test('筛选空值按合同处理，保留分组、零、false 与真实业务范围', () => {
  const zero = { value: 0, label: '零' }
  const no = { value: false, label: '否' }
  assert.deepEqual(filterSelectOptions([
    { label: '分类', options: [{ value: 'all', label: '不限' }, zero, no] },
    { label: '空组', options: [{ value: '', label: '全部' }] },
    { value: 'ALL_WAREHOUSES', label: '全部仓库' },
  ], 'all'), [
    { label: '分类', options: [zero, no] },
    { value: 'ALL_WAREHOUSES', label: '全部仓库' },
  ])
  assert.equal(isEmptyFilterValue(0), false)
  assert.equal(isEmptyFilterValue(false), false)
  assert.equal(isEmptyFilterValue('all', 'all'), true)
})

test('筛选选择、清空及重新选择保留字段用途，清空返回声明的查询空值', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: FilterSelect } = await import('./FilterSelect.jsx')
  const changes = []
  function Example() {
    const [value, setValue] = React.useState('all')
    return h(FilterSelect, {
      id: 'supplier',
      label: '供应商',
      value,
      emptyValue: 'all',
      options: [{ value: 'all', label: '全部供应商' }, { value: 0, label: '甲厂' }],
      onChange: (next) => { changes.push(next); setValue(next) },
    })
  }
  await harness.render(h(Example))
  const input = document.querySelector('[role="combobox"]')
  const select = input.closest('.ant-select')
  assert.equal(select.querySelector('.ant-select-selection-placeholder').textContent, '供应商')
  await act(() => input.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await harness.flush()
  const options = [...document.querySelectorAll('.ant-select-item-option')]
  assert.deepEqual(options.map((node) => node.textContent), ['甲厂'])
  await harness.click(options[0])
  assert.equal(select.querySelector('.app-select__label').textContent, '供应商')
  assert.ok(select.querySelector('.ant-select-clear'))
  await act(() => select.querySelector('.ant-select-clear').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await harness.flush()
  assert.equal(select.querySelector('.ant-select-selection-placeholder').textContent, '供应商')
  assert.equal(select.querySelector('.ant-select-clear'), null)
  assert.equal(input.getAttribute('aria-expanded'), 'false')
  assert.deepEqual(changes, [0, 'all'])
  await act(() => input.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await harness.flush()
  await harness.click(document.querySelector('.ant-select-item-option'))
  assert.deepEqual(changes, [0, 'all', 0])
})

test('必填输入可暂时清空但仍阻止保存，禁用与固定模式不提供清空', async (t) => {
  const harness = await businessFormHarness(t)
  const [{ default: AppSelect }, { Form }] = await Promise.all([import('./AppSelect.jsx'), import('antd')])
  let form
  function Example() {
    [form] = Form.useForm()
    return h(Form, { form, initialValues: { unit: 'piece' } }, h(Form.Item, { name: 'unit', label: '单位', rules: [{ required: true, message: '请选择单位' }] }, h(AppSelect, { placeholder: '请选择单位', options: [{ value: 'piece', label: '个' }] })), h(AppSelect, { label: '排序方式', allowClear: false, value: 'new', options: [{ value: 'new', label: '最新优先' }] }), h(AppSelect, { label: '冻结字段', disabled: true, value: 'piece', options: [{ value: 'piece', label: '个' }] }))
  }
  await harness.render(h(Example))
  const selects = document.querySelectorAll('.app-select')
  assert.equal(selects[1].querySelector('.ant-select-clear'), null)
  assert.equal(selects[1].querySelector('.app-select__label').textContent, '排序方式')
  assert.equal(selects[2].querySelector('.ant-select-clear'), null)
  await act(() => selects[0].querySelector('.ant-select-clear').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await harness.flush()
  assert.equal(form.getFieldValue('unit'), undefined)
  await act(async () => { await assert.rejects(form.validateFields(), (error) => error.errorFields[0].errors.includes('请选择单位')) })
})
