import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  registerJSXTestLoader,
  installTestDOM,
} from '../../../scripts/test/reactRuntime.mjs'

registerJSXTestLoader()
const dom = installTestDOM()
Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
const { default: useDesktopTaskCount } = await import('./useDesktopTaskCount.js')
const { JsonRpc } = await import('../../common/utils/jsonRpc.js')
const { RpcErrorCode } = await import('../../common/consts/errorCodes.js')
const { WORKFLOW_TASKS_CHANGED } = await import('../utils/workflowTaskChanges.mjs')
after(() => dom.restore())

const profile = {
  id: 1,
  effective_session: {
    source: 'active_customer_config_revision',
    customer: { key: 'yoyoosun' },
    config_revision: 'a',
  },
}

function taskBoardResponse(total) {
  const counts = { actionable: total, exception: 0, due: 0, finished: 0 }
  return {
    data: {
      snapshot_at: 1_720_000_000,
      total,
      counts,
      lanes: Object.entries(counts).map(([key, count]) => ({
        key, total: count, limit: 1, offset: 0, tasks: [],
      })),
      source_types: [],
      owner_role_keys: [],
    },
  }
}

function harness(t) {
  const calls = []
  const rpc = t.mock.method(JsonRpc.prototype, 'call', (method, query, options) => {
    assert.equal(method, 'get_task_board')
    return new Promise((resolve, reject) => {
      calls.push({ query, options, resolve: ({ total }) => resolve(taskBoardResponse(total)), reject })
    })
  })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  let output
  let props = { adminProfile: profile, enabled: true, pathname: '/erp/task-board' }
  let closed = false
  function Probe(nextProps) {
    output = useDesktopTaskCount(nextProps)
    return null
  }
  const h = {
    calls,
    async render(next = props) {
      props = next
      await act(async () => root.render(createElement(Probe, props)))
      return output
    },
    async settle(action = () => {}) {
      await act(async () => {
        action()
        await new Promise((resolve) => setImmediate(resolve))
      })
      return output
    },
    async refresh() {
      return h.settle(() => { output.refresh() })
    },
    async unmount() {
      if (closed) return
      closed = true
      await act(async () => root.unmount())
      container.remove()
      rpc.mock.restore()
    },
  }
  t.after(() => h.unmount())
  return h
}

test('desktop count uses the complete pending total independent of page filters', async (t) => {
  const h = harness(t)
  assert.equal((await h.render()).count, null)
  assert.deepEqual(h.calls[0].query, { todo_only: true, limit: 1 })
  assert.equal((await h.settle(() => h.calls[0].resolve({ total: 128 }))).count, 128)
  await h.render({ adminProfile: profile, enabled: true, pathname: '/erp/task-board', keyword: 'filter', page: 9 })
  assert.equal(h.calls.length, 1)
})

test('late or aborted reads cannot overwrite a new scope or newer response', async (t) => {
  const h = harness(t)
  await h.render()
  await h.refresh()
  assert.equal(h.calls[0].options.signal.aborted, true)
  await h.settle(() => h.calls[1].resolve({ total: 5 }))
  assert.equal((await h.settle(() => h.calls[0].resolve({ total: 128 }))).count, 5)
  const next = await h.render({ adminProfile: { ...profile, id: 2 }, enabled: true, pathname: '/erp/task-board' })
  assert.equal(next.count, null)
  assert.equal(next.loading, true)
  assert.equal((await h.settle(() => h.calls[2].resolve({ total: 2 }))).count, 2)
  await h.unmount()
  assert.equal(h.calls[2].options.signal.aborted, true)
  window.dispatchEvent(new Event(WORKFLOW_TASKS_CHANGED))
  window.dispatchEvent(new Event('online'))
  document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(h.calls.length, 3)
})

test('read failure preserves known counts, first failure is unknown, retry can confirm zero', async (t) => {
  const h = harness(t)
  await h.render()
  let result = await h.settle(() => h.calls[0].reject(new Error('offline')))
  assert.equal(result.count, null)
  assert.equal(result.error, true)
  await h.refresh()
  await h.settle(() => h.calls[1].resolve({ total: 6 }))
  await h.refresh()
  result = await h.settle(() => h.calls[2].reject(new Error('offline')))
  assert.equal(result.count, 6)
  assert.equal(result.error, true)
  await h.refresh()
  result = await h.settle(() => h.calls[3].resolve({ total: 0 }))
  assert.equal(result.count, 0)
  assert.equal(result.error, false)
})

test('permission and session changes clear old counts immediately', async (t) => {
  const changes = [
    { ...profile, id: 2 },
    { ...profile, effective_session: { ...profile.effective_session, config_revision: 'b' } },
    { ...profile, effective_session: null },
  ]
  for (const next of changes) {
    const h = harness(t)
    await h.render()
    await h.settle(() => h.calls[0].resolve({ total: 8 }))
    assert.equal((await h.render({ adminProfile: next, enabled: true, pathname: '/erp/task-board' })).count, null)
    await h.unmount()
  }
  for (const code of [RpcErrorCode.AUTH_REQUIRED, RpcErrorCode.ADMIN_DISABLED, RpcErrorCode.PERMISSION_DENIED]) {
    const h = harness(t)
    await h.render()
    await h.settle(() => h.calls[0].resolve({ total: 8 }))
    await h.refresh()
    assert.equal((await h.settle(() => h.calls[1].reject({ code }))).count, null)
    await h.unmount()
  }
  const h = harness(t)
  await h.render({ adminProfile: profile, enabled: false, pathname: '/erp/task-board' })
  assert.equal(h.calls.length, 0)
})

test('confirmed changes, visibility, online and route return trigger fresh reads without polling', async (t) => {
  const h = harness(t)
  await h.render()
  for (const [target, event] of [[window, WORKFLOW_TASKS_CHANGED], [window, 'online'], [document, 'visibilitychange']]) {
    await h.settle(() => target.dispatchEvent(new Event(event)))
  }
  assert.equal(h.calls.length, 4)
  await h.render({ adminProfile: profile, enabled: true, pathname: '/erp/workbench' })
  assert.equal(h.calls.length, 5)
})
