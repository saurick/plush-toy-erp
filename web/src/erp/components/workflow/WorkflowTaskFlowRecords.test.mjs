import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import {
  installTestDOM,
  registerJSXTestLoader,
} from '../../../../scripts/test/reactRuntime.mjs'

test('flow records use the shared scope switch without replacing it across loading and errors', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: Trail }] = await Promise.all([
    import('react-dom/client'),
    import('./WorkflowTaskEventTrail.jsx'),
  ])
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    dom.restore()
  })
  const task = {
    id: 41,
    task_name: '财务用料审核',
    task_group: 'engineering_material_finance_review',
  }
  const prior = {
    id: 42,
    task_name: '老板用料审核',
    task_group: 'engineering_material_boss_review',
  }
  const events = [
    {
      id: 9,
      task_id: 41,
      event_type: 'created',
      task,
      actor_display_name: '财务演示人员',
    },
    {
      id: 8,
      task_id: 42,
      event_type: 'status_changed',
      to_status_key: 'done',
      task: prior,
      actor_display_name: '老板演示人员',
    },
  ]
  let scope = 'flow'
  let records
  const render = async (overrides = {}) => {
    records = {
      task: { items: events.slice(0, 1), status: 'ready', truncated: false },
      flow: { items: events, status: 'ready', truncated: true },
      scope,
      changeScope: (value) => {
        scope = value
      },
      ...overrides,
    }
    await act(async () =>
      root.render(
        createElement(Trail, {
          task,
          records,
          compact: true,
          showResponsibility: false,
        })
      )
    )
  }
  await render()
  assert.match(container.querySelector('h3').textContent, /处理记录/u)
  assert.equal(
    container.querySelectorAll('.workflow-task-event-trail__source').length,
    2
  )
  assert.match(
    container.querySelector('.workflow-task-event-trail__list').textContent,
    /本任务.*老板用料审核/u
  )
  assert.match(container.textContent, /加载更早记录/u)
  const switchNode = container.querySelector(
    '.workflow-task-event-trail__scope'
  )
  const taskScope = Array.from(switchNode.querySelectorAll('button')).find(
    (button) => button.textContent === '只看本任务'
  )
  assert.equal(Boolean(taskScope), true)
  await act(async () => taskScope.click())
  await render()
  assert.equal(
    container.querySelector('.workflow-task-event-trail__scope') === switchNode,
    true
  )
  assert.equal(
    container.querySelectorAll('.workflow-task-event-trail__item').length,
    1
  )
  scope = 'flow'
  await render({ flow: { items: [], status: 'error', truncated: false } })
  assert.equal(
    container.querySelector('.workflow-task-event-trail__scope') === switchNode,
    true
  )
  assert.match(container.textContent, /处理记录加载失败/u)
  assert.match(container.textContent, /重新读取/u)
})
