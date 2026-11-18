import { createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'
import { installRpcCallHarness } from '../../../scripts/test/rpcApiTestHarness.mjs'

const riskRequest = Object.freeze({
  queue_key: 'risk',
  limit: 1,
  offset: 0,
})
const taskBoardRequest = Object.freeze({ limit: 1, offset: 0 })

function workbenchPage(params, id = params.offset + 1) {
  return {
    code: 0,
    data: {
      snapshot_at: 1_720_000_000,
      queue_key: params.queue_key,
      total: 2,
      limit: params.limit,
      offset: params.offset,
      items: [{ id, version: 1, task_status_key: 'blocked' }],
      counts: { actionable: 0, risk: 2, approval: 0 },
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
      current.riskResponseState?.response?.items
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
          riskRequest,
          taskBoardRequest,
          ...props,
        })
      ),
  }
}

test('risk tasks request one bounded page and retains settled rows until the next page arrives', async (t) => {
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
    [{ method: 'get_workbench', params: riskRequest }]
  )
  assert.equal(view.current.riskResponseState.response.total, 2)
  assert.equal(view.container.textContent, '1')
  await view.renderQuery({
    riskRequest: { ...riskRequest, offset: 1 },
  })
  assert.equal(view.current.loading, true)
  assert.equal(view.container.textContent, '1')
  await view.act(async () => complete())
  await view.flush()
  assert.equal(view.current.loading, false)
  assert.equal(view.container.textContent, '2')
})

test('a scope switch clears settled risk rows and rejects an older page response', async (t) => {
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
  const nextRequest = { ...riskRequest, offset: 1 }
  await view.renderQuery({ riskRequest: nextRequest })
  assert.equal(view.current.riskResponseState.response.offset, 0)
  await view.renderQuery({ scopeKey: 'scope-b', riskRequest: nextRequest })
  assert.equal(view.current.riskResponseState?.response ?? null, null)
  assert.equal(view.calls[1].init.signal.aborted, true)
  await view.act(async () => pending[0]())
  await view.flush()
  assert.equal(view.current.loading, true)
  assert.equal(view.current.riskResponseState?.response ?? null, null)
  await view.act(async () => pending[1]())
  await view.flush()
  assert.equal(view.current.riskResponseState.scopeKey, 'scope-b')
  assert.equal(view.current.riskResponseState.response.queue_key, 'risk')
})

test('a failed risk page retains its settled rows and pagination until retry succeeds', async (t) => {
  let fail = true
  const view = await dashboardHarness(t, (_method, params) => {
    if (params.offset === 1 && fail) throw new Error('offline')
    return workbenchPage(params)
  })
  await view.renderQuery()
  await view.flush()
  await view.renderQuery({ riskRequest: { ...riskRequest, offset: 1 } })
  await view.flush()
  assert.equal(view.current.loading, false)
  assert(view.current.riskResponseState.error)
  assert.equal(view.current.riskResponseState.response.offset, 0)
  assert.equal(view.current.riskResponseState.response.limit, 1)
  assert.equal(view.container.textContent, '1')

  fail = false
  await view.act(async () => view.current.reloadTaskData())
  await view.flush()
  assert.equal(view.current.riskResponseState.error, '')
  assert.equal(view.current.riskResponseState.response.offset, 1)
  assert.equal(view.container.textContent, '2')
})

test('tracking views suspend task reads and resume through the same loader', async (t) => {
  const view = await dashboardHarness(t, (_method, params) =>
    workbenchPage(params)
  )
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
  assert.ok(view.current.riskResponseState.error)
  assert.equal(
    view.current.riskResponseState.error.includes(
      'private transport detail'
    ),
    false
  )
  fail = false
  await view.act(async () =>
    assert.equal(await view.current.reloadTaskData(), true)
  )
  assert.equal(view.current.riskResponseState.error, '')
  assert.equal(view.current.riskResponseState.response.items[0].id, 1)
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
  await view.renderQuery({ riskRequest: null })
  await view.flush()
  assert.equal(view.calls[0].method, 'get_task_board')
  assert.equal(view.current.taskBoardSummaryState.scopeKey, 'scope-a')
  await view.renderQuery({ riskRequest: null, scopeKey: 'scope-b' })
  assert.equal(view.current.taskBoardSummaryState, null)
  assert.equal(view.current.taskBoardFilterOptions, null)
  assert.equal(view.current.taskBoardResponseState.response, null)
  await view.act(async () => complete())
  await view.flush()
  assert.equal(view.current.taskBoardSummaryState.scopeKey, 'scope-b')
})

test('任务单据查询只复用同一可见范围的筛选候选，结果随新请求更新', async (t) => {
  let reply
  const view = await dashboardHarness(t, (_method, params) => new Promise((resolve) => {
    reply = (sourceTypes, count = 0) => {
      const result = taskBoardPage(params, count)
      Object.assign(result.data, {
        source_types: sourceTypes,
        owner_role_keys: ['warehouse', 'quality'],
        assignees: [{ id: 7, name: '模拟办理人' }],
      })
      resolve(result)
    }
  }))
  const query = (filters) => view.renderQuery({
    riskRequest: null,
    taskBoardRequest: { ...taskBoardRequest, ...filters },
  })
  const respond = (types, count) => view.act(async () => reply(types, count))
  await query({})
  const sources = ['purchase_receipt', 'quality_inspection']
  await respond(sources, 1)
  await query({ source_section: 'quality' })
  assert.equal(view.current.taskBoardResponseState.response, null)
  assert.notEqual(view.current.taskBoardSummaryState.requestKey, view.current.taskBoardSummaryRequestKey)
  assert.deepEqual(view.current.taskBoardFilterOptions, {
    sourceTypes: sources,
    ownerRoleKeys: ['warehouse', 'quality'],
    assignees: [{ id: 7, name: '模拟办理人' }],
  })
  await respond(['purchase_receipt'])
  assert.equal(view.current.taskBoardResponseState.response.total, 0)
  assert.deepEqual(view.current.taskBoardFilterOptions.sourceTypes, ['purchase_receipt'])
  for (const scope of [{ owner_role_key: 'quality' }, { todo_only: true }, { approval_only: true }]) {
    await query(scope)
    assert.equal(view.current.taskBoardFilterOptions, null)
    await respond([])
    assert.deepEqual(view.current.taskBoardFilterOptions.sourceTypes, [])
  }
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
  await view.renderQuery({ riskRequest: null })
  await view.flush()
  assert.equal(view.current.taskBoardSummaryState.response.counts.actionable, 1)
  const summaryKey = view.current.taskBoardSummaryRequestKey
  await view.renderQuery({
    riskRequest: null,
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

test('task board refresh retains settled rows and replaces them after the response arrives', async (t) => {
  let complete
  const view = await dashboardHarness(t, (_method, params) =>
    view.calls.length === 1
      ? taskBoardPage(params, 1)
      : new Promise((resolve) => {
          complete = () => resolve(taskBoardPage(params, 0))
        })
  )
  await view.renderQuery({ riskRequest: null })
  await view.flush()
  let refresh
  await view.act(() => {
    refresh = view.current.reloadTaskData()
  })
  assert.equal(view.current.loading, true)
  assert.equal(
    view.current.taskBoardResponseState.response.lanes[0].tasks[0].id,
    1
  )
  await view.act(async () => {
    complete()
    await refresh
  })
  assert.equal(view.current.loading, false)
  assert.equal(view.current.taskBoardResponseState.response.total, 0)
})

test('task board search changes clear old rows and ignore a superseded response', async (t) => {
  const pending = new Map()
  const view = await dashboardHarness(t, (_method, params) =>
    !params.keyword
      ? taskBoardPage(params, 1)
      : new Promise((resolve) =>
          pending.set(params.keyword, () =>
            resolve(taskBoardPage(params, params.keyword === '旧条件' ? 1 : 0))
          )
        )
  )
  await view.renderQuery({ riskRequest: null })
  await view.flush()
  await view.renderQuery({
    riskRequest: null,
    taskBoardRequest: { ...taskBoardRequest, keyword: '旧条件' },
  })
  assert.equal(view.current.taskBoardResponseState.response, null)
  await view.renderQuery({
    riskRequest: null,
    taskBoardRequest: { ...taskBoardRequest, keyword: '新条件' },
  })
  assert.equal(view.calls[1].init.signal.aborted, true)
  await view.act(async () => pending.get('新条件')())
  assert.equal(view.current.taskBoardResponseState.response.total, 0)
  await view.act(async () => pending.get('旧条件')())
  assert.equal(view.current.taskBoardResponseState.response.total, 0)
  assert.equal(view.current.loading, false)
})
