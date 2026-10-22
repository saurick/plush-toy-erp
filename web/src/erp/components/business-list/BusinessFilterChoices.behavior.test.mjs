import assert from 'node:assert/strict'
import test from 'node:test'
import React, { createElement } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('固定单选按选项直接选择、清空和禁用，显式搜索与排序保留下拉能力', async (t) => {
  const harness = await businessFormHarness(t)
  const { BusinessOperationPanel, SelectFilter } = await import('./BusinessListLayout.jsx')
  const options = [{ value: '', label: '全部' }, { value: 'ready', label: '待处理' }, { value: 'done', label: '已处理' }, { value: 'forbidden', label: '不可用', disabled: true }]
  const selections = []
  const sourceSelections = []
  function Example({ disabled = false }) {
    const [value, setValue] = React.useState('')
    const [source, setSource] = React.useState(undefined)
    return createElement(BusinessOperationPanel, {
      filtersOpen: true,
      filters: createElement(
        React.Fragment,
        null,
        createElement(SelectFilter, { 'aria-label': '任务状态', value, disabled, options, onChange: (next, option) => { selections.push([next, option.label]); setValue(next) } }),
        createElement(SelectFilter, { 'aria-label': '办理人', showSearch: true, value: '', options }),
        createElement(SelectFilter, { 'aria-label': '来源单据', value: source, disabled, allowClear: true, options: Array.from({ length: 8 }, (_, i) => ({ value: i, label: `来源${i}` })), onChange: (next, option) => { sourceSelections.push([next, option.label]); setSource(next) } }),
        createElement(SelectFilter, { 'aria-label': '排序方式', allowClear: false, className: 'erp-business-filter-control--sort', value: 'new', options: [{ value: 'new', label: '最新' }, { value: 'old', label: '最早' }] })
      ),
    })
  }
  await harness.render(createElement(Example))
  const group = document.querySelector('[role="group"][aria-label="任务状态"]')
  assert.ok(group)
  assert.equal(group.querySelector('input'), null)
  await harness.click(harness.button('待处理'))
  assert.equal(harness.button('待处理').getAttribute('aria-pressed'), 'true')
  await harness.click([...group.querySelectorAll('button')].find((button) => button.textContent === '不限'))
  assert.deepEqual(selections, [['ready', '待处理'], ['', '不限']])
  assert.equal(harness.button('不可用').disabled, true)
  const sourceGroup = document.querySelector('[role="group"][aria-label="来源单据"]')
  assert.ok(sourceGroup)
  assert.equal(sourceGroup.querySelector('input'), null)
  assert.deepEqual([...sourceGroup.querySelectorAll('button')].map((button) => button.textContent), ['不限', ...Array.from({ length: 8 }, (_, i) => `来源${i}`)])
  const sourceButton = (label) => [...sourceGroup.querySelectorAll('button')].find((button) => button.textContent === label)
  for (const i of [0, 5, 7]) {
    await harness.click(sourceButton(`来源${i}`))
    assert.equal(sourceButton(`来源${i}`).getAttribute('aria-pressed'), 'true')
    assert.equal(sourceGroup.querySelectorAll('[aria-pressed="true"]').length, 1)
  }
  await harness.click(sourceButton('不限'))
  assert.deepEqual(sourceSelections, [[0, '来源0'], [5, '来源5'], [7, '来源7'], ['', '不限']])
  for (const label of ['办理人', '排序方式']) assert.ok(document.querySelector(`[role="combobox"][aria-label="${label}"]`))
  assert.ok(document.querySelector('[role="combobox"][aria-label="办理人"]').closest('.ant-select-show-search'))
  assert.equal(document.querySelector('[role="combobox"][aria-label="排序方式"]').closest('.ant-select-show-search'), null)
  await harness.render(createElement(Example, { disabled: true }))
  assert.ok([...group.querySelectorAll('button')].every((button) => button.disabled))
  assert.ok([...sourceGroup.querySelectorAll('button')].every((button) => button.disabled))
})
