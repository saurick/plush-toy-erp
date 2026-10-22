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
    assert.match(container.textContent, !display_context.available ? /关联单据已不可用/u : display_context.items.length ? /产品编号未填写/u : /未关联产品／物料/u)
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

test('compact card keeps identity, task, source and status separate and clears removed associations', async (t) => {
  const { container, render } = await createReactTestHarness(t)
  const { default: WorkflowTaskIdentity } = await import('./WorkflowTaskIdentity.jsx')
  const { WorkflowTaskSource } = await import('./WorkflowTaskCopy.jsx')
  const current = { ...task, task_name: '核对样品' }
  const display = (next) => createElement(WorkflowTaskIdentity, {
    task: next,
    compact: true,
    layout: 'card',
    copyable: false,
    showTaskName: true,
    status: createElement('span', null, '待处理'),
    source: createElement(WorkflowTaskSource, { task: next, copyable: false, showUnavailable: false }),
  })
  await render(display(current))
  assert.match(container.querySelector('.erp-task-identity__card-heading').textContent, /核对样品.*待处理/u)
  assert.doesNotMatch(container.querySelector('.erp-task-identity__card-heading').textContent, /海盐企鹅/u)
  assert.match(container.querySelector('.erp-task-identity__card-body').textContent, /海盐企鹅.*27007#/u)
  assert.match(container.querySelector('.erp-task-identity__source').textContent, /YS8-XD-043/u)
  assert.equal(container.querySelector('.erp-task-identity__source').closest('.erp-task-identity__card-body'), null)
  assert.equal(container.querySelectorAll('.erp-task-copy').length, 0)
  await render(display({ ...current, display_context: { available: true, source_no: 'YS8-XD-044', items: [] } }))
  assert.match(container.querySelector('.erp-task-identity__card-heading').textContent, /核对样品.*待处理/u)
  assert.match(container.textContent, /YS8-XD-044/u)
  assert.equal(container.querySelectorAll('.erp-task-product-image').length, 1)
  assert.match(container.querySelector('.erp-task-identity__card-body').textContent, /未关联产品／物料/u)
  assert.doesNotMatch(container.textContent, /海盐企鹅|27007#|YS8-XD-043|产品编号未填写/u)
  await render(display({ ...current, display_context: { available: false, source_no: 'YS8-XD-043', items: current.display_context.items } }))
  assert.match(container.textContent, /关联单据已不可用/u)
  assert.equal(container.textContent.match(/关联单据已不可用/gu).length, 1)
  assert.doesNotMatch(container.textContent, /海盐企鹅|27007#|YS8-XD-043|SO-STALE/u)
})

test('compact tracking without products still shows its source and never borrows a stale identity', async (t) => {
  const { container, render } = await createReactTestHarness(t)
  const { default: WorkflowTaskIdentity } = await import('./WorkflowTaskIdentity.jsx')
  const source = createElement('span', null, '生产批次 DEMO-WIP-001')
  await render(createElement(WorkflowTaskIdentity, { task, compact: true, source }))
  await render(createElement(WorkflowTaskIdentity, { task: { ...task, display_context: { available: true, items: [] } }, compact: true, source }))
  assert.equal(container.textContent, '未关联产品／物料生产批次 DEMO-WIP-001')
  assert.equal(container.querySelectorAll('.erp-task-product-image').length, 1)
  assert.equal(container.querySelectorAll('.erp-task-identity__code, .erp-task-identity__association-open').length, 0)
})

test('standalone and linked tasks show business fields without data-nature badges', async (t) => {
  const { container, render } = await createReactTestHarness(t)
  const { default: WorkflowTaskIdentity } = await import('./WorkflowTaskIdentity.jsx')
  const { WorkflowTaskSource } = await import('./WorkflowTaskCopy.jsx')
  const current = { ...task, task_name: '确认颜色', source_type: null, source_id: null, source_no: null, payload: {}, display_context: { ...task.display_context, source_no: '' } }
  const display = (next) => createElement(WorkflowTaskIdentity, {
    task: next,
    compact: true,
    layout: 'card',
    showTaskName: true,
    source: createElement(WorkflowTaskSource, { task: next }),
  })
  await render(display(current))
  assert.equal(container.querySelectorAll('.erp-task-simulation').length, 0)
  assert.match(container.querySelector('.erp-task-identity__card-heading').textContent, /确认颜色/u)
  assert.equal(container.querySelector('.erp-task-identity__source').textContent, '未关联业务单据')
  assert.equal(container.querySelectorAll('[aria-label="复制单据编号"]').length, 0)
  assert.equal(container.querySelector('.erp-task-identity__field-label').textContent, '产品编号')
  assert.equal(container.querySelector('.erp-task-identity__field-value').textContent, '27007#')
  await render(display({ ...current, source_type: 'sales_order', source_id: task.source_id, source_no: task.source_no, display_context: task.display_context }))
  assert.equal(container.querySelectorAll('.erp-task-simulation').length, 0)
  assert.equal(container.querySelector('.erp-task-source__number').textContent, 'YS8-XD-043')
  assert.equal(container.querySelectorAll('[aria-label="复制单据编号"]').length, 1)
  assert.doesNotMatch(container.textContent, /模拟|演示|数据性质/u)
})

test('compact multi-product control opens every association without opening the task and clears a replaced source', async (t) => {
  const { container, render, act } = await createReactTestHarness(t)
  const { default: WorkflowTaskIdentity } = await import('./WorkflowTaskIdentity.jsx')
  const items = [
    { kind: 'product', name: '狐狸', code: 'FOX' },
    { kind: 'product', name: '挂兔', code: 'RABBIT' },
    { kind: 'product', name: '小熊', code: 'BEAR' },
  ]
  let parentClicks = 0
  const display = (display_context) => createElement('div', { onClick: () => parentClicks++ }, createElement(WorkflowTaskIdentity, { task: { ...task, display_context }, compact: true, layout: 'card', copyable: false, showTaskName: true }))
  await render(display({ available: true, source_no: 'SHIP-1', items }))
  const trigger = container.querySelector('.erp-task-identity__association-open')
  assert.equal(trigger.getAttribute('aria-label'), '查看3 款产品')
  assert.equal(container.querySelectorAll('button button').length, 0)
  await act(async () => trigger.click())
  assert.equal(parentClicks, 0)
  assert.equal(trigger.getAttribute('aria-expanded'), 'true')
  assert.ok(document.querySelector('[role="dialog"]'))
  assert.equal(document.querySelectorAll('.erp-task-linked-items > .erp-task-identity__row').length, 3)
  assert.match(document.querySelector('.erp-task-linked-items').textContent, /狐狸.*FOX.*挂兔.*RABBIT.*小熊.*BEAR/u)
  await render(display({ available: true, source_no: 'SHIP-2', items: [] }))
  assert.match(container.textContent, /未关联产品／物料/u)
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 0)
  assert.doesNotMatch(container.textContent, /FOX|RABBIT|BEAR/u)
})
