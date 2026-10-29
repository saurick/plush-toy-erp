import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h, useState } from 'react'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'

test('主题目录换项时保持目录与触发按钮挂载', async (t) => {
  const harness = await createReactTestHarness(t)
  const { WorkbenchReading } = await import('./WorkbenchPattern.jsx')
  function Page() {
    const [value, setValue] = useState('one')
    return h(WorkbenchReading, { label: '阅读目录', items: [{ value: 'one', label: '主题一' }, { value: 'two', label: '主题二' }], value, onChange: setValue }, h('p', null, value))
  }
  await harness.render(h(Page))
  const catalog = harness.container.querySelector('nav')
  const next = catalog.querySelectorAll('button')[1]
  await harness.act(() => next.click())
  assert.equal(harness.container.querySelector('nav') === catalog, true)
  assert.equal(catalog.querySelectorAll('button')[1] === next, true)
  assert.equal(next.getAttribute('aria-pressed'), 'true')
  assert.equal(harness.container.querySelector('section').textContent, 'two')
})

test('分组或表格目录可直接切换相邻详情，收起不会卸载目录', async (t) => {
  const harness = await createReactTestHarness(t)
  const { WorkbenchReading } = await import('./WorkbenchPattern.jsx')
  function Page() {
    const [value, setValue] = useState(null)
    const catalog = h('table', null, h('tbody', null, ['one', 'two'].map((item) => h('tr', { key: item }, h('td', null, h('button', { onClick: () => setValue(item) }, item))))))
    return h(WorkbenchReading, { label: '接口目录', catalog, detailVisible: Boolean(value), detailLabel: '接口详情' }, h('h2', null, value), h('button', { onClick: () => setValue(null) }, '收起'))
  }
  await harness.render(h(Page))
  const table = harness.container.querySelector('table')
  const [first, second] = table.querySelectorAll('button')
  await harness.act(() => first.click())
  assert.equal(harness.container.querySelector('h2').textContent, 'one')
  await harness.act(() => second.click())
  assert.equal(harness.container.querySelector('h2').textContent, 'two')
  assert.equal(harness.container.querySelector('table') === table, true)
  assert.equal(harness.container.querySelectorAll('[role="dialog"]').length, 0)
  await harness.act(() => harness.container.querySelector('section button').click())
  assert.equal(harness.container.querySelector('table') === table, true)
  assert.equal(harness.container.querySelectorAll('section').length, 0)
})
