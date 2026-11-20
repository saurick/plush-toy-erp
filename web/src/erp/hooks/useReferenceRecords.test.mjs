import { createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'
import { installRpcCallHarness } from '../../../scripts/test/rpcApiTestHarness.mjs'
import { getRequestScopeCancellation } from '../../common/utils/requestScopeCancellation.mjs'

async function harness(t, handler) {
  const view = await createReactTestHarness(t)
  const setHandler = installRpcCallHarness((cleanup) => t.after(cleanup))
  const calls = []
  setHandler(async (method, params, request) => {
    calls.push({ method, params, request })
    return { code: 0, data: await handler(params) }
  })
  const { useReferenceRecords, useReferenceHydration } = await import('./useReferenceRecords.js')
  let records
  function Consumer({ ids, refresh = 0, enabled = true, profile = null }) {
    const [current, , merge] = useReferenceRecords(profile)
    records = current
    useReferenceHydration({ materials: { ids, records: current, onRecords: merge, enabled } }, profile, refresh)
    return null
  }
  return {
    ...view,
    calls,
    get records() { return records },
    async renderReferences(props) {
      await view.render(createElement(Consumer, props))
      await view.flush()
    },
  }
}

function materialPage(params, name = '历史停用材料') {
  return { materials: params.ids.map((id) => ({ id, name, is_active: false })), total: params.ids.length, limit: params.limit, offset: params.offset }
}

test('display references batch exact IDs, retain inactive history and re-read on an explicit list refresh', async (t) => {
  let name = '历史停用材料'
  const view = await harness(t, (params) => materialPage(params, name))
  await view.renderReferences({ ids: [1, 2, 1, null] })
  assert.deepEqual(view.calls[0].params.ids, [1, 2])
  assert.equal(view.calls[0].params.active_only, undefined)
  assert.equal(view.records.length, 2)
  assert.equal(view.records[0].is_active, false)
  await view.renderReferences({ ids: [2, 1] })
  assert.equal(view.calls.length, 1)
  name = '更新后的名称'
  await view.renderReferences({ ids: [1, 2], refresh: 1 })
  assert.equal(view.calls.length, 2)
  assert.ok(view.records.every((row) => row.name === name))
})

test('identity changes cancel old hydration and an unreadable scope never fetches references', async (t) => {
  let complete
  const view = await harness(t, async (params) => {
    await new Promise((resolve) => { complete = resolve })
    return materialPage(params)
  })
  await view.renderReferences({ ids: [1], profile: { id: 1 } })
  await view.renderReferences({ ids: [1], enabled: false, profile: { id: 2 } })
  assert.equal(view.calls[0].request.init.signal.aborted, true)
  assert.equal(getRequestScopeCancellation(view.calls[0].request.init.signal.reason)?.cause, 'superseded')
  await view.act(async () => complete())
  await view.flush()
  assert.deepEqual(view.records, [])
  assert.equal(view.calls.length, 1)
})

test('a replaced reference read cannot overwrite the latest result and unmount records disposal', async (t) => {
  const pending = new Map()
  const view = await harness(t, (params) => new Promise((resolve) => {
    pending.set(params.ids[0], () => resolve(materialPage(params)))
  }))
  await view.renderReferences({ ids: [1] })
  const firstSignal = view.calls[0].request.init.signal
  await view.renderReferences({ ids: [2] })
  assert.equal(firstSignal.aborted, true)
  assert.equal(getRequestScopeCancellation(firstSignal.reason)?.cause, 'superseded')
  await view.act(async () => pending.get(2)())
  await view.flush()
  assert.deepEqual(view.records.map((row) => row.id), [2])
  await view.act(async () => pending.get(1)())
  await view.flush()
  assert.deepEqual(view.records.map((row) => row.id), [2])
  await view.renderReferences({ ids: [3] })
  const finalSignal = view.calls[2].request.init.signal
  await view.unmount()
  assert.equal(finalSignal.aborted, true)
  assert.equal(getRequestScopeCancellation(finalSignal.reason)?.cause, 'disposed')
  await view.act(async () => pending.get(3)())
})
