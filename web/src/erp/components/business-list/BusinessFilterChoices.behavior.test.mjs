import assert from 'node:assert/strict'
import test from 'node:test'
import React, { createElement } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('短筛选直接选择、清空和禁用，长列表及排序保留下拉能力', async (t) => {
  const harness = await businessFormHarness(t)
  const { BusinessOperationPanel, SelectFilter } = await import('./BusinessListLayout.jsx')
  const options = [{ value: '', label: '全部' }, { value: 'ready', label: '待处理' }, { value: 'done', label: '已处理' }, { value: 'forbidden', label: '不可用', disabled: true }]
  const selections = []
  function Example({ disabled = false }) {
    const [value, setValue] = React.useState('')
    return createElement(BusinessOperationPanel, {
      filtersOpen: true,
      filters: createElement(
        React.Fragment,
        null,
        createElement(SelectFilter, { 'aria-label': '任务状态', value, disabled, options, onChange: (next, option) => { selections.push([next, option.label]); setValue(next) } }),
        createElement(SelectFilter, { 'aria-label': '办理人', showSearch: true, value: '', options }),
        createElement(SelectFilter, { 'aria-label': '来源单据', options: Array.from({ length: 8 }, (_, i) => ({ value: i, label: `来源${i}` })) }),
        createElement(SelectFilter, { 'aria-label': '排序方式', className: 'erp-business-filter-control--sort', value: 'new', options: [{ value: 'new', label: '最新' }, { value: 'old', label: '最早' }] })
      ),
    })
  }
  await harness.render(createElement(Example))
  const group = document.querySelector('[role="group"][aria-label="任务状态"]')
  assert.ok(group)
  assert.equal(group.querySelector('input'), null)
  await harness.click(harness.button('待处理'))
  assert.equal(harness.button('待处理').getAttribute('aria-pressed'), 'true')
  await harness.click(harness.button('全部'))
  assert.deepEqual(selections, [['ready', '待处理'], ['', '全部']])
  assert.equal(harness.button('不可用').disabled, true)
  for (const label of ['办理人', '来源单据', '排序方式']) assert.ok(document.querySelector(`[role="combobox"][aria-label="${label}"]`))
  assert.ok(document.querySelector('[role="combobox"][aria-label="来源单据"]').closest('.ant-select-show-search'))
  await harness.render(createElement(Example, { disabled: true }))
  assert.ok([...group.querySelectorAll('button')].every((button) => button.disabled))
})
