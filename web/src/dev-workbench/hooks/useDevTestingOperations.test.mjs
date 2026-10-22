import assert from 'node:assert/strict'
import { createElement } from 'react'
import test from 'node:test'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'

const summary = (operations = {}, busy = { active: false, kind: '', profile: '' }) => ({
  operations: { fast: null, 'rpc-examples': null, ...operations }, busy,
})
const operation = (status = 'running') => ({
  id: '4b6c68e0-e060-4d4e-adb8-3b31c48d0a04',
  action: 'rpc-examples',
  revision: status === 'running' ? 1 : 2,
  status,
  message: '隔离样例执行结果',
})
function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function mount(t, client) {
  const view = await createReactTestHarness(t)
  const { default: useDevTestingOperations } = await import('./useDevTestingOperations.mjs')
  let state
  function Harness() {
    state = useDevTestingOperations({ client })
    return null
  }
  await view.render(createElement(Harness))
  await view.flush()
  return { ...view, state: () => state }
}

test('shared testing controller cancels stale summary reads and ignores late results after unmount', async (t) => {
  const requests = []
  const view = await mount(t, { summary: ({ signal }) => {
    const pending = deferred()
    requests.push({ ...pending, signal })
    return pending.promise
  } })
  await view.act(async () => view.state().reloadTestingSummary())
  assert.equal(requests[0].signal.aborted, true)
  await view.act(async () => requests[1].resolve(summary()))
  await view.act(async () => requests[0].resolve(summary({}, { active: true, kind: 'quality', profile: 'strict' })))
  assert.equal(view.state().testingBusy.active, false)
  await view.act(async () => view.state().reloadTestingSummary())
  await view.unmount()
  assert.equal(requests[2].signal.aborted, true)
  await view.act(async () => requests[2].reject(new Error('late read')))
  assert.equal(view.state().testingSummaryError, '')
})

test('shared testing controller respects QA exclusivity and coalesces rapid starts', async (t) => {
  let busy = true
  const pending = deferred()
  const starts = []
  const view = await mount(t, {
    summary: async () => summary({}, { active: busy, kind: busy ? 'quality' : '', profile: busy ? 'strict' : '' }),
    start: (...args) => { starts.push(args); return pending.promise },
  })
  await view.act(async () => view.state().runTestingAction('rpc-examples'))
  assert.equal(starts.length, 0)
  busy = false
  await view.act(async () => view.state().reloadTestingSummary())
  let request
  await view.act(async () => {
    request = view.state().runTestingAction('rpc-examples')
    await view.state().runTestingAction('rpc-examples')
  })
  assert.equal(starts.length, 1)
  assert.match(starts[0][1], /^testing:rpc-examples:/u)
  assert.equal(view.state().testingActionStarting, 'rpc-examples')
  await view.unmount()
  assert.equal(starts[0][2].signal.aborted, true)
  await view.act(async () => { pending.resolve(operation()); await request })
})

test('shared testing controller reuses uncertain request identity and preserves pressure scale', async (t) => {
  const starts = []
  const view = await mount(t, {
    summary: async () => summary(),
    start: async (...args) => { starts.push(args); throw new Error('response unavailable') },
  })
  await view.act(async () => view.state().runTestingAction('pressure-quick', 'medium'))
  assert.match(view.state().testingSummaryError, /同一请求/u)
  await view.act(async () => view.state().reloadTestingSummary())
  await view.act(async () => view.state().runTestingAction('pressure-quick', 'large'))
  assert.equal(starts.length, 2)
  assert.equal(starts[0][1], starts[1][1])
  assert.equal(starts[1][2].dataScale, 'medium')
})

test('shared testing controller follows existing operations to terminal state and releases polling', async (t) => {
  let last = operation()
  let reads = 0
  const view = await mount(t, {
    summary: async () => summary({ 'rpc-examples': last }),
    read: async () => { reads += 1; last = operation('completed'); return last },
  })
  assert.equal(view.state().testingHasActive, true)
  await view.act(async () => new Promise((resolve) => setTimeout(resolve, 850)))
  await view.flush()
  assert.equal(reads, 1)
  assert.equal(view.state().testingOperations['rpc-examples'].status, 'completed')
  assert.equal(view.state().testingHasActive, false)
  await view.unmount()
})
