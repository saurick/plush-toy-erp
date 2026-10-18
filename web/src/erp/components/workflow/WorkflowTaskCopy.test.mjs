import { createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createReactTestHarness, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

registerJSXTestLoader()

const task = {
  id: 8,
  source_type: 'sales_order',
  source_id: 43,
  source_no: 'SO-STALE',
  display_context: {
    available: true,
    source_no: 'YS8-XD-043',
    items: [{ kind: 'product', name: '海盐企鹅', code: '27007#', style_no: 'PENGUIN-7' }],
  },
}

test('source number copy is separate from the desktop source action and never opens its parent', async (t) => {
  const { container, render, act } = await createReactTestHarness(t)
  const { WorkflowTaskSource } = await import('./WorkflowTaskCopy.jsx')
  const writes = []
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => writes.push(value) } })
  let opened = 0
  let parentClicks = 0
  await render(createElement('div', { onClick: () => parentClicks++ }, createElement(WorkflowTaskSource, { task, onOpen: () => opened++ })))
  const copy = container.querySelector('[aria-label="复制单据编号"]')
  assert.ok(copy)
  assert.equal(container.querySelectorAll('button button').length, 0)
  await act(async () => copy.click())
  assert.deepEqual(writes, ['YS8-XD-043'])
  assert.equal(opened, 0)
  assert.equal(parentClicks, 0)
  await act(async () => container.querySelector('.erp-task-source-link').click())
  assert.equal(opened, 1, 'the existing desktop source action stays available separately')
})

test('mobile source copies only the current number and removes the icon when the projection is cleared or unavailable', async (t) => {
  const { container, render, act } = await createReactTestHarness(t)
  const { WorkflowTaskSource } = await import('./WorkflowTaskCopy.jsx')
  const writes = []
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => writes.push(value) } })
  await render(createElement(WorkflowTaskSource, { task, label: '销售订单 · YS8-XD-043' }))
  assert.equal(container.querySelectorAll('a, .erp-task-source-link').length, 0)
  assert.equal(container.querySelectorAll('button').length, 1)
  await act(async () => container.querySelector('button').click())
  const next = { ...task, display_context: { ...task.display_context, source_no: 'YS8-XD-044' } }
  await render(createElement(WorkflowTaskSource, { task: next }))
  await act(async () => container.querySelector('button').click())
  assert.deepEqual(writes, ['YS8-XD-043', 'YS8-XD-044'])
  for (const display_context of [{ available: true, source_no: '' }, { available: false, source_no: 'YS8-XD-044' }]) {
    await render(createElement(WorkflowTaskSource, { task: { ...task, display_context } }))
    assert.equal(container.querySelectorAll('.erp-task-copy').length, 0)
    assert.doesNotMatch(container.textContent, /SO-STALE|YS8-XD-044/u)
  }
  await render(createElement(WorkflowTaskSource, { task, copyable: false }))
  assert.equal(container.querySelectorAll('.erp-task-copy').length, 0, 'receipt and processing contexts can still omit copies')
})

test('task identity restores the primary number copy without inline summary copies or stale product numbers', async (t) => {
  const { container, render, act } = await createReactTestHarness(t)
  const { default: WorkflowTaskIdentity } = await import('./WorkflowTaskIdentity.jsx')
  const writes = []
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => writes.push(value) } })
  await render(createElement(WorkflowTaskIdentity, { task, detailView: true }))
  assert.equal(container.querySelectorAll('.erp-task-copy').length, 1)
  assert.equal(container.querySelectorAll('.erp-task-copy--label').length, 0)
  await act(async () => container.querySelector('[aria-label="复制产品编号"]').click())
  const next = { ...task, id: 9, display_context: { available: true, items: [{ kind: 'product', name: '新产品', code: '27008#' }] } }
  await render(createElement(WorkflowTaskIdentity, { task: next, detailView: true }))
  await act(async () => container.querySelector('[aria-label="复制产品编号"]').click())
  assert.deepEqual(writes, ['27007#', '27008#'])
  assert.doesNotMatch(container.textContent, /27007#|海盐企鹅/u)
  for (const display_context of [{ available: true, items: [{ kind: 'product', name: '无编号产品', code: '' }] }, { available: true, items: [] }, { available: false, items: task.display_context.items }]) {
    await render(createElement(WorkflowTaskIdentity, { task: { ...task, display_context }, detailView: true }))
    assert.equal(container.querySelectorAll('.erp-task-copy').length, 0)
    assert.doesNotMatch(container.textContent, /27007#/u)
  }
  await render(createElement(WorkflowTaskIdentity, { task, detailView: true, copyable: false }))
  assert.equal(container.querySelectorAll('.erp-task-copy').length, 0)
})

test('tracking keeps pure code copies and inline multi-product expansion when the full summary moves to its menu', async (t) => {
  const { container, render, act } = await createReactTestHarness(t)
  const { default: WorkflowTaskIdentity } = await import('./WorkflowTaskIdentity.jsx')
  const writes = []
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => writes.push(value) } })
  const multi = { ...task, display_context: { ...task.display_context, items: [...task.display_context.items, { kind: 'product', name: '第二件产品', code: 'P-LONG-20261018-000000000002' }] } }
  await render(createElement(WorkflowTaskIdentity, { task: multi, summaryCopyable: false }))
  assert.equal(container.querySelectorAll('.erp-task-copy--label').length, 0)
  const details = container.querySelector('.erp-task-identity__more')
  assert.ok(details, '原行内展开保留，不换成新的弹窗流程')
  details.open = true
  assert.match(details.textContent, /第二件产品/u)
  const copies = container.querySelectorAll('[aria-label="复制产品编号"]')
  assert.equal(copies.length, 2)
  await act(async () => copies[1].click())
  assert.deepEqual(writes, ['P-LONG-20261018-000000000002'])
})
