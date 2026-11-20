import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act, createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('条款定位可清空并重选，清空分组联动清条目且不改合同内容', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: Tools } = await import('./ContractClauseTools.jsx')
  const clauses = [{ key: 'delivery', label: '交付约定', items: ['交期约定', '收货约定'] }]
  let selection
  function Example() {
    const [value, setValue] = React.useState({ groupKey: 'delivery', index: 0 })
    selection = value
    return h(Tools, { clauses, selection: value, onSelect: setValue, paperRef: { current: null }, onAction() { assert.fail('定位不能修改条款') }, onGroupAction() { assert.fail('定位不能修改分组') } })
  }
  await harness.render(h(Example))
  const control = (label) => document.querySelector(`[aria-label="${label}"][role="combobox"]`).closest('.ant-select')
  const clear = async (label) => {
    await act(() => control(label).querySelector('.ant-select-clear').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
    await harness.flush()
  }
  await clear('当前条目')
  assert.deepEqual(selection, { groupKey: 'delivery', index: null })
  assert.equal(control('当前条目').classList.contains('ant-select-disabled'), false)
  await clear('条款分组')
  assert.deepEqual(selection, { groupKey: null, index: null })
  assert.equal(control('条款分组').classList.contains('ant-select-disabled'), false)
  assert.equal(control('当前条目').classList.contains('ant-select-disabled'), true)
  await act(() => control('条款分组').querySelector('input').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await harness.flush()
  await harness.click(document.querySelector('.ant-select-item-option'))
  assert.deepEqual(selection, { groupKey: 'delivery', index: 0 })
  assert.deepEqual(clauses[0].items, ['交期约定', '收货约定'])
})
