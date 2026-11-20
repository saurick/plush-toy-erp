import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { installRpcCallHarness } from '../../../../scripts/test/rpcApiTestHarness.mjs'

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const response = (id, name = `任务 ${id}`) => ({
  code: 0,
  data: { task: { id, version: 1, task_status_key: 'ready', task_name: name } },
})

async function mountLinkedTask(t, handler, overrides = {}) {
  const ui = await createReactTestHarness(t)
  const setHandler = installRpcCallHarness((cleanup) => t.after(cleanup))
  const calls = []
  setHandler((method, params, options) => {
    assert.equal(method, 'get_task')
    calls.push({ params, signal: options.init.signal })
    return handler(params.task_id)
  })
  const { default: useMobileLinkedTask } =
    await import('./useMobileLinkedTask.js')
  let current
  let props = {
    accessScopeKey: 'scope-a',
    adminID: 12,
    enabled: true,
    taskID: 7,
    ...overrides,
  }
  function Consumer(value) {
    current = useMobileLinkedTask(value)
    return null
  }
  const render = async (patch = {}) => {
    props = { ...props, ...patch }
    await ui.render(createElement(Consumer, props))
    await ui.flush()
  }
  await render()
  return {
    ...ui,
    render,
    calls,
    get current() {
      return current
    },
  }
}

test('linked task reads start only for an enabled selection', async (t) => {
  const ui = await mountLinkedTask(t, response, { enabled: false })
  assert.equal(ui.calls.length, 0)
  await ui.render({ enabled: true })
  assert.equal(ui.calls.length, 1)
  assert.equal(ui.current.linkedTask.task.id, 7)
  await ui.render({ enabled: false })
  assert.equal(ui.current.linkedTask, null)
})

test('switching linked tasks cancels older reads and ignores a late success', async (t) => {
  const first = deferred()
  const ui = await mountLinkedTask(t, (id) =>
    id === 7 ? first.promise : response(id)
  )
  await ui.render({ taskID: 8 })
  assert.equal(ui.calls[0].signal.aborted, true)
  assert.equal(ui.current.linkedTask.task.id, 8)
  await ui.act(async () => first.resolve(response(7, '旧任务')))
  await ui.flush()
  assert.equal(ui.current.linkedTask.task.id, 8)
})

test('access changes discard retained tasks and unmount cancels pending reads', async (t) => {
  const pending = deferred()
  const ui = await mountLinkedTask(t, () => pending.promise, { enabled: false })
  await ui.act(async () =>
    ui.current.retainLinkedTask({ id: 7, version: 1, task_status_key: 'ready' })
  )
  await ui.render({ enabled: true })
  assert.equal(ui.calls.length, 0)
  assert.equal(ui.current.linkedTask.task.id, 7)
  await ui.render({ accessScopeKey: 'scope-b', adminID: 99 })
  assert.equal(ui.calls.length, 1)
  assert.equal(ui.current.linkedTask.task, undefined)
  await ui.unmount()
  assert.equal(ui.calls[0].signal.aborted, true)
  pending.resolve(response(7))
  await ui.flush()
})

test('failed reads stay explicit and retry only after an operator request', async (t) => {
  let fail = true
  const ui = await mountLinkedTask(t, (id) => {
    if (fail) throw new Error('offline')
    return response(id)
  })
  assert.ok(ui.current.linkedTask.error)
  assert.equal(ui.calls.length, 1)
  await ui.render()
  assert.equal(ui.calls.length, 1)
  fail = false
  await ui.act(async () => ui.current.loadLinkedTask(7))
  assert.equal(ui.calls.length, 2)
  assert.equal(ui.current.linkedTask.task.id, 7)
  assert.equal(ui.current.linkedTask.error, undefined)
})
