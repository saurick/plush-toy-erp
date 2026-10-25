import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

const task = (id, status = 'ready', extra = {}) => ({
  id,
  version: 1,
  task_name: `任务 ${id}`,
  task_group: 'handoff_shell_quality',
  task_status_key: status,
  owner_role_key: 'quality',
  source_type: 'production_wip_batch',
  source_no: 'QA-DEMO-001',
  discovery: { stage_key: 'shell_quality' },
  ...extra,
})
async function mount(t, { query = '', respond } = {}) {
  const harness = await createReactTestHarness(t)
  const requests = []
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const rpc = JSON.parse(options.body)
    requests.push({ ...rpc, signal: options.signal })
    const result = await respond(rpc, options)
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result }))
  })
  const { default: View } = await import('./BusinessChainInstanceView.jsx')
  const loaded = []
  const opened = []
  const selected = []
  const navigation = {}
  const onTaskLoaded = (value) => loaded.push(value)
  let taskId = '21'
  function Probe() {
    navigation.location = useLocation()
    return h(View, {
      taskId,
      onTaskLoaded,
      onSelectTask: (...args) => selected.push(args),
      onOpenView: (...args) => opened.push(args),
    })
  }
  const render = async (id = taskId) => {
    taskId = id
    await harness.render(
      h(
        MemoryRouter,
        {
          initialEntries: [`/status-flows?view=tracking&task_id=21${query}`],
          future: { v7_startTransition: true, v7_relativeSplatPath: true },
        },
        h(Probe)
      )
    )
    await harness.flush()
  }
  await render()
  const click = async (text) => {
    const element = [...harness.container.querySelectorAll('button')].find(
      (node) => node.textContent.trim() === text
    )
    assert(element, text)
    await harness.act(() => element.click())
    await harness.flush()
  }
  return {
    ...harness,
    requests,
    loaded,
    opened,
    selected,
    navigation,
    render,
    click,
  }
}
const success = (rpc) => ({
  code: 0,
  data:
    rpc.method === 'get_task'
      ? { task: task(Number(rpc.params.task_id)) }
      : {
          items: [
            task(21),
            task(22, 'done'),
            task(23, 'blocked', {
              exception_id: 4,
              task_group: 'production_exception',
            }),
          ],
          truncated: true,
        },
})

test('instance filtering retains URL context, true statuses and registered flow navigation without inventing times', async (t) => {
  const view = await mount(t, {
    query: '&task_filter=pending',
    respond: success,
  })
  assert.equal(view.container.querySelectorAll('[data-task-record]').length, 2)
  assert(view.container.textContent.includes('最多展示 100 项'))
  assert.equal(
    view.container.querySelectorAll('time').length,
    0,
    '接口未提供时间，不制造时间线'
  )
  assert(
    view.requests.every((rpc) =>
      ['get_task', 'get_task_handling_chain'].includes(rpc.method)
    )
  )
  await view.click('查看对应办理流程')
  assert.equal(view.opened.at(-1)[1].flow_stage, 'shell_quality')
  await view.click('协同记录')
  assert.equal(view.opened.at(-1)[0], 'workflow')
  assert.equal(
    new URLSearchParams(view.navigation.location.search).get('task_filter'),
    'pending'
  )
  await view.click('全部任务3')
  assert.equal(view.container.querySelectorAll('[data-task-record]').length, 3)
  assert.equal(
    new URLSearchParams(view.navigation.location.search).has('task_filter'),
    false
  )
})

test('unknown instance group stays empty and offers a deliberate clear', async (t) => {
  const view = await mount(t, {
    query: '&task_stage=retired',
    respond: success,
  })
  assert.equal(view.container.querySelectorAll('[data-task-record]').length, 0)
  assert(view.container.querySelector('[role=alert]'))
  await view.click('清除筛选')
  assert.equal(view.container.querySelectorAll('[data-task-record]').length, 3)
})

test('read failure clears records and retry uses the same task', async (t) => {
  let denied = true
  const view = await mount(t, {
    respond: (rpc) =>
      denied ? { code: 1, message: '读取失败' } : success(rpc),
  })
  assert(view.container.textContent.includes('关联任务读取失败'))
  assert.equal(view.container.querySelectorAll('[data-task-record]').length, 0)
  denied = false
  await view.click('重新读取')
  assert.equal(view.container.querySelectorAll('[data-task-record]').length, 3)
  assert(view.requests.every((rpc) => rpc.params.task_id === 21))
})

test('task replacement aborts outstanding reads and ignores late results', async (t) => {
  let release
  const pending = new Promise((resolve) => {
    release = resolve
  })
  const view = await mount(t, {
    respond: async (rpc) => {
      if (rpc.params.task_id === 21) await pending
      return success(rpc)
    },
  })
  await view.render('24')
  assert(
    view.requests
      .filter((rpc) => rpc.params.task_id === 21)
      .every((rpc) => rpc.signal.aborted)
  )
  await view.act(async () => {
    release()
    await pending
  })
  await view.flush()
  assert.equal(
    view.container.querySelector('[data-instance-task]').dataset.instanceTask,
    '24'
  )
  assert.deepEqual(
    view.loaded.map((value) => value.id),
    [24]
  )
})
