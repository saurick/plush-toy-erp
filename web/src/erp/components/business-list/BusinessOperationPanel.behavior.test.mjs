import assert from 'node:assert/strict'
import test from 'node:test'
import React, { createElement } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('共享筛选只在存在可清空的条件时显示直接清空入口', async (t) => {
  const harness = await businessFormHarness(t)
  const { BusinessOperationPanel, SearchInput, SelectFilter } = await import('./BusinessListLayout.jsx')
  const filters = createElement(SelectFilter, { value: '', options: [{ value: '', label: '全部' }] })
  const clear = () => document.querySelector('button[aria-label="清空筛选"]')
  for (const activeFilterCount of [0, undefined]) {
    await harness.render(createElement(BusinessOperationPanel, { filters, onClearFilters() {}, activeFilterCount }))
    assert.equal(clear(), null)
  }
  await harness.render(createElement(BusinessOperationPanel, { filters, activeFilterCount: 1 }))
  assert.equal(clear(), null, '没有清空回调时不展示动作')
  await harness.render(createElement(BusinessOperationPanel, { filters, onClearFilters() {}, activeFilterCount: 1 }))
  assert.ok(clear())
  assert.equal(document.querySelector('button button'), null, '打开和清空使用两个独立按钮')
  await harness.render(createElement(BusinessOperationPanel, {
    filters: createElement(SearchInput, { value: '', onChange() {} }),
    onClearFilters() {},
    activeFilterCount: 1,
  }))
  assert.equal(clear(), null, '只有搜索时不额外生成筛选入口')
})

test('直接清空只调用一次原回调、恢复结果与焦点，重新筛选仍可用', async (t) => {
  const harness = await businessFormHarness(t)
  const { BusinessOperationPanel, SearchInput, SelectFilter } = await import('./BusinessListLayout.jsx')
  let cleared = 0
  const opens = []
  function Example() {
    const [status, setStatus] = React.useState('ready')
    return createElement(BusinessOperationPanel, {
      onClearFilters() { cleared += 1; setStatus('') },
      activeFilterCount: Number(Boolean(status)),
      onFiltersOpenChange(open) { opens.push(open) },
      filters: createElement(React.Fragment, null, createElement(SearchInput, { value: '小熊', onChange() {} }), createElement(SelectFilter, {
          'aria-label': '任务状态',
value: status,
onChange: setStatus,
          options: [{ value: '', label: '全部' }, { value: 'ready', label: '待处理' }],
        })
      ),
    }, createElement('output', null, status ? '共 1 条' : '共 2 条'))
  }
  await harness.render(createElement(Example))
  const trigger = () => document.querySelector('button[aria-haspopup="dialog"]')
  await harness.click(document.querySelector('button[aria-label="清空筛选"]'))
  assert.equal(cleared, 1)
  assert.equal(trigger().getAttribute('aria-expanded'), 'false')
  assert.equal(opens.includes(true), false, '直接清空不会打开面板')
  assert.equal(document.querySelector('output').textContent, '共 2 条')
  assert.equal(document.querySelector('input').value, '小熊', '组件不另行改写页面搜索条件')
  assert.equal(document.querySelector('button[aria-label="清空筛选"]'), null)
  assert.equal(document.activeElement, trigger())
  await harness.click(trigger())
  await harness.click(harness.button('待处理'))
  await harness.click(harness.button('完成'))
  assert.ok(document.querySelector('button[aria-label="清空筛选"]'))
  assert.equal(document.querySelector('output').textContent, '共 1 条')
  assert.equal(trigger().textContent.trim(), '筛选 · 1')
  assert.equal(trigger().getAttribute('aria-label'), '筛选，已应用 1 项')
  assert.equal(trigger().getAttribute('aria-expanded'), 'false')
})

test('受控面板直接清空会关闭并恢复焦点，面板内清空保留面板', async (t) => {
  const harness = await businessFormHarness(t)
  const { BusinessOperationPanel, SelectFilter } = await import('./BusinessListLayout.jsx')
  let cleared = 0
  function Example() {
    const [open, setOpen] = React.useState(false)
    const [value, setValue] = React.useState('ready')
    return createElement(BusinessOperationPanel, {
      filtersOpen: open,
      onFiltersOpenChange: setOpen,
      activeFilterCount: Number(Boolean(value)),
      onClearFilters() { cleared += 1; setValue('') },
      filters: createElement(SelectFilter, {
        'aria-label': '任务状态',
value,
onChange: setValue,
        options: [{ value: '', label: '全部' }, { value: 'ready', label: '待处理' }],
      }),
    })
  }
  await harness.render(createElement(Example))
  const trigger = document.querySelector('button[aria-haspopup="dialog"]')
  await harness.click(trigger)
  assert.equal(trigger.getAttribute('aria-expanded'), 'true')
  await harness.click(document.querySelector('button[aria-label="清空筛选"]'))
  assert.equal(cleared, 1)
  assert.equal(trigger.getAttribute('aria-expanded'), 'false')
  assert.equal(document.activeElement, trigger)
  await harness.click(trigger)
  await harness.click(harness.button('待处理'))
  await harness.click(harness.button('清空筛选'))
  assert.equal(cleared, 2)
  assert.equal(trigger.getAttribute('aria-expanded'), 'true')
  assert.ok(document.querySelector('[role="dialog"][aria-label="筛选条件"]').contains(document.activeElement))
})
