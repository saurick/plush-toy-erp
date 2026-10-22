import { createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'
import { installRpcCallHarness } from '../../../scripts/test/rpcApiTestHarness.mjs'

const workbenchRequest = Object.freeze({
  queue_key: 'actionable',
  limit: 1,
  offset: 0,
})
const taskBoardRequest = Object.freeze({ limit: 1, offset: 0 })

function workbenchPage(params, id = params.offset + 1) {
  const risk = params.queue_key === 'risk'
  return {
    code: 0,
    data: {
      snapshot_at: 1_720_000_000,
      queue_key: params.queue_key,
      total: risk ? 1 : 2,
      limit: params.limit,
      offset: params.offset,
      items: [{ id, version: 1, task_status_key: risk ? 'blocked' : 'ready' }],
      counts: { actionable: 2, risk: 1, approval: 0 },
    },
  }
}

function taskBoardPage(params, count = 0) {
  return {
    code: 0,
    data: {
      snapshot_at: 1_720_000_000,
      total: count,
      counts: { actionable: count, exception: 0, due: 0, finished: 0 },
      source_types: [],
      owner_role_keys: [],
      lanes: ['actionable', 'exception', 'due', 'finished'].map((key) => ({
        key,
        total: key === 'actionable' ? count : 0,
        tasks:
          key === 'actionable' && count > params.offset
            ? [{ id: 1, version: 1, task_status_key: 'ready' }]
            : [],
        limit: params.limit,
        offset: params.offset,
      })),
    },
  }
}

async function dashboardHarness(t, handler) {
  const view = await createReactTestHarness(t)
  const setHandler = installRpcCallHarness((cleanup) => t.after(cleanup))
  const calls = []
  setHandler((method, params, request) => {
    calls.push({ method, params, ...request })
    return handler(method, params, request)
  })
  const { default: useWorkflowDashboardData } =
    await import('./useWorkflowDashboardData.js')
  let current
  function Consumer(props) {
    current = useWorkflowDashboardData(props)
    return createElement(
      'output',
      { 'aria-busy': current.loading },
      current.workbenchResponseState?.response?.items
        .map((item) => item.id)
        .join(',')
    )
  }
  return {
    ...view,
    calls,
    get current() {
      return current
    },
    renderQuery: (props = {}) =>
      view.render(
        createElement(Consumer, {
          scopeKey: 'scope-a',
          workbenchRequest,
          taskBoardRequest,
          isTaskBoardView: false,
          ...props,
        })
      ),
  }
}

test('workbench requests one bounded page and retains settled rows until the next page arrives', async (t) => {
  let complete
  const view = await dashboardHarness(t, (_method, params) =>
    params.offset === 0
      ? workbenchPage(params)
      : new Promise((resolve) => {
          complete = () => resolve(workbenchPage(params))
        })
  )
  await view.renderQuery()
  await view.flush()
  assert.deepEqual(
    view.calls.map(({ method, params }) => ({ method, params })),
    [{ method: 'get_workbench', params: workbenchRequest }]
  )
  assert.equal(view.current.workbenchCountsState.counts.actionable, 2)
  assert.equal(view.container.textContent, '1')
  await view.renderQuery({
    workbenchRequest: { ...workbenchRequest, offset: 1 },
  })
  assert.equal(view.current.loading, true)
  assert.equal(view.container.textContent, '1')
  await view.act(async () => complete())
  await view.flush()
  assert.equal(view.current.loading, false)
  assert.equal(view.container.textContent, '2')
})

test('a queue switch clears unrelated rows and a scope switch rejects a late response', async (t) => {
  const pending = []
  const view = await dashboardHarness(t, (_method, params) =>
    view.calls.length === 1
      ? workbenchPage(params)
      : new Promise((resolve) =>
          pending.push(() => resolve(workbenchPage(params)))
        )
  )
  await view.renderQuery()
  await view.flush()
  const riskRequest = { queue_key: 'risk', limit: 1, offset: 0 }
  await view.renderQuery({ workbenchRequest: riskRequest })
  assert.equal(view.current.workbenchResponseState.response, null)
  await view.renderQuery({ scopeKey: 'scope-b', workbenchRequest: riskRequest })
  assert.equal(view.current.workbenchCountsState, null)
  assert.equal(view.calls[1].init.signal.aborted, true)
  await view.act(async () => pending[0]())
  await view.flush()
  assert.equal(view.current.loading, true)
  assert.equal(view.current.workbenchCountsState, null)
  await view.act(async () => pending[1]())
  await view.flush()
  assert.equal(view.current.workbenchResponseState.scopeKey, 'scope-b')
  assert.equal(view.current.workbenchResponseState.response.queue_key, 'risk')
})

test('a failed workbench page retains its settled rows and pagination until retry succeeds', async (t) => {
  let fail = true
  const view = await dashboardHarness(t, (_method, params) => {
    if (params.offset === 1 && fail) throw new Error('offline')
    return workbenchPage(params)
  })
  await view.renderQuery()
  await view.flush()
  await view.renderQuery({ workbenchRequest: { ...workbenchRequest, offset: 1 } })
  await view.flush()
  assert.equal(view.current.loading, false)
  assert(view.current.workbenchResponseState.error)
  assert.equal(view.current.workbenchResponseState.response.offset, 0)
  assert.equal(view.current.workbenchResponseState.response.limit, 1)
  assert.equal(view.container.textContent, '1')

  fail = false
  await view.act(async () => view.current.reloadTaskData())
  await view.flush()
  assert.equal(view.current.workbenchResponseState.error, '')
  assert.equal(view.current.workbenchResponseState.response.offset, 1)
  assert.equal(view.container.textContent, '2')
})

test('preview and alternate views suspend task reads and resume through the same loader', async (t) => {
  const view = await dashboardHarness(t, (_method, params) =>
    workbenchPage(params)
  )
  await view.renderQuery({ productCorePreview: true })
  assert.equal(view.calls.length, 0)
  await view.renderQuery({ suspended: true })
  assert.equal(view.calls.length, 0)
  await view.renderQuery()
  await view.flush()
  assert.equal(view.calls.length, 1)
  assert.equal(view.current.loading, false)
})

test('a failed read exposes a business error and an explicit retry recovers', async (t) => {
  let fail = true
  const view = await dashboardHarness(t, (_method, params) => {
    if (fail) throw new Error('private transport detail')
    return workbenchPage(params)
  })
  await view.renderQuery()
  await view.flush()
  assert.equal(view.current.loading, false)
  assert.ok(view.current.workbenchResponseState.error)
  assert.equal(
    view.current.workbenchResponseState.error.includes(
      'private transport detail'
    ),
    false
  )
  fail = false
  await view.act(async () =>
    assert.equal(await view.current.reloadTaskData(), true)
  )
  assert.equal(view.current.workbenchResponseState.error, '')
  assert.equal(view.current.workbenchResponseState.response.items[0].id, 1)
})

test('task board responses and summary counts stay scoped to the current identity', async (t) => {
  let complete
  const view = await dashboardHarness(t, (_method, params) => {
    const response = taskBoardPage(params)
    return view.calls.length === 1
      ? response
      : new Promise((resolve) => {
          complete = () => resolve(response)
        })
  })
  await view.renderQuery({ isTaskBoardView: true })
  await view.flush()
  assert.equal(view.calls[0].method, 'get_task_board')
  assert.equal(view.current.taskBoardSummaryState.scopeKey, 'scope-a')
  await view.renderQuery({ isTaskBoardView: true, scopeKey: 'scope-b' })
  assert.equal(view.current.taskBoardSummaryState, null)
  assert.equal(view.current.taskBoardResponseState.response, null)
  await view.act(async () => complete())
  await view.flush()
  assert.equal(view.current.taskBoardSummaryState.scopeKey, 'scope-b')
})

test('task board pagination preserves the query summary while the new lane page is pending', async (t) => {
  let complete
  const view = await dashboardHarness(t, (_method, params) =>
    params.offset === 0
      ? taskBoardPage(params, 1)
      : new Promise((resolve) => {
          complete = () => resolve(taskBoardPage(params, 1))
        })
  )
  await view.renderQuery({ isTaskBoardView: true })
  await view.flush()
  assert.equal(view.current.taskBoardSummaryState.response.counts.actionable, 1)
  const summaryKey = view.current.taskBoardSummaryRequestKey
  await view.renderQuery({
    isTaskBoardView: true,
    taskBoardRequest: { ...taskBoardRequest, offset: 1 },
  })
  assert.equal(view.current.loading, true)
  assert.equal(view.current.taskBoardResponseState.response, null)
  assert.equal(view.current.taskBoardSummaryRequestKey, summaryKey)
  assert.equal(view.current.taskBoardSummaryState.response.counts.actionable, 1)
  await view.act(async () => complete())
  await view.flush()
  assert.equal(view.current.loading, false)
  assert.deepEqual(
    view.current.taskBoardResponseState.response.lanes[0].tasks,
    []
  )
})
