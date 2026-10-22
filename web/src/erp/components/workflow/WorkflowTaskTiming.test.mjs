import assert from 'node:assert/strict'
import { createElement } from 'react'
import test from 'node:test'
import { createReactTestHarness, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

registerJSXTestLoader()

test('clearing a deadline retains its position and removes the old date and risk styling', async (t) => {
  const { container, render } = await createReactTestHarness(t)
  const { default: WorkflowTaskTiming } = await import('./WorkflowTaskTiming.jsx')
  const task = { task_status_key: 'ready', due_at: 1788840000 }
  const display = (record, detail = false) => createElement(WorkflowTaskTiming, { task: record, detail, includeKeys: ['due', 'ended'], nowMs: 1789000000000 })
  await render(display(task))
  assert.ok(container.querySelector('[data-task-time="due"] time'))
  assert.match(container.textContent, /已超时/u)
  for (const due_at of [null, 0, '', 'invalid']) {
    await render(display({ ...task, due_at, updated_at: task.due_at }))
    assert.equal(container.querySelectorAll('[data-task-time="due"]').length, 1)
    assert.equal(container.querySelectorAll('time, .erp-task-timing__row--danger, .erp-task-timing__row--warning').length, 0)
    assert.match(container.textContent, due_at === 'invalid' ? /时间待核对/u : /未设置截止/u)
  }
  await render(display({ ...task, due_at: null }, true))
  assert.equal(container.querySelector('dt').hidden, false)
  assert.equal(container.querySelector('dt').textContent, '处理截止')
})

test('ended tasks retain an explicit end-time slot without reviving a past deadline', async (t) => {
  const { container, render } = await createReactTestHarness(t)
  const { default: WorkflowTaskTiming } = await import('./WorkflowTaskTiming.jsx')
  for (const task_status_key of ['done', 'rejected', 'withdrawn']) {
    await render(createElement(WorkflowTaskTiming, { task: { task_status_key, due_at: 1788840000, completed_at: null, updated_at: 1789000000 } }))
    assert.equal(container.querySelectorAll('[data-task-time="ended"]').length, 1)
    assert.equal(container.querySelector('dd').textContent, '结束时间未记录')
    assert.equal(container.querySelectorAll('[data-task-time="due"], time').length, 0)
    assert.doesNotMatch(container.textContent, /已超时|2026/u)
  }
})
