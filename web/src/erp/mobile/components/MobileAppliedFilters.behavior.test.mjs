import assert from 'node:assert/strict'
import test from 'node:test'
import React, { createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('手机共享条件行只展示单项取消，空条件不留空行', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: Applied } = await import('./MobileAppliedFilters.jsx')
  await harness.render(h(Applied, { items: [] }))
  assert.equal(document.querySelector('.mobile-applied-filters'), null, '没有条件时不留空行')
  await harness.render(h(Applied, { items: [false, { key: 'status', label: '已完成' }, { key: 'source', label: '销售订单' }], onClear() {} }))
  assert.equal(document.querySelectorAll('.erp-filter-chip').length, 2)
  assert.equal(document.querySelectorAll('button').length, 2, '多条件也不再追加全局清空按钮')
})

test('单项取消各触发一次，保留搜索和范围并恢复筛选入口焦点', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: Applied } = await import('./MobileAppliedFilters.jsx')
  const calls = []
  function Example() {
    const [filters, setFilters] = React.useState({ status: 'done', source: 'sales_order' })
    const triggerRef = React.useRef(null)
    const change = (value) => { calls.push(value); setFilters((current) => ({ ...current, ...value })) }
    return h('section', null, h('button', { ref: triggerRef }, '筛选已办'), h('input', { value: '小熊', readOnly: true }), h('output', null, '当前：已办 / 我参与的'), h(Applied, {
        items: ['status', 'source'].map((key) => filters[key] && { key, label: filters[key] }),
        onClear: (key) => change({ [key]: '' }),
        triggerRef,
      }), h('pre', null, JSON.stringify(filters)))
  }
  await harness.render(h(Example))
  await harness.click(document.querySelector('[aria-label="清除sales_order"]'))
  assert.deepEqual(calls, [{ source: '' }])
  assert.equal(document.activeElement, harness.button('筛选已办'))
  assert.ok(document.querySelector('[aria-label="清除done"]'), '单项取消不连带清除其他条件')
  await harness.click(document.querySelector('[aria-label="清除done"]'))
  assert.deepEqual(calls, [{ source: '' }, { status: '' }])
  assert.equal(document.querySelector('.mobile-applied-filters'), null)
  assert.equal(document.querySelector('input').value, '小熊')
  assert.equal(document.querySelector('output').textContent, '当前：已办 / 我参与的')
  assert.equal(document.activeElement, harness.button('筛选已办'))
})
