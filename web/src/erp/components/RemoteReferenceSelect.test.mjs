import { createElement, forwardRef } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'
import { installRpcCallHarness } from '../../../scripts/test/rpcApiTestHarness.mjs'

async function harness(t, handler) {
  const view = await createReactTestHarness(t)
  const setHandler = installRpcCallHarness((cleanup) => t.after(cleanup))
  const calls = []
  setHandler(async (method, params, request) => {
    calls.push({ method, params, request })
    return { code: 0, data: await handler(params, request) }
  })
  const { default: RemoteReferenceSelect, ReferenceRecordsContext } = await import('./RemoteReferenceSelect.jsx')
  let current
  const Probe = forwardRef((props, _ref) => { current = props; return createElement('output', null, JSON.stringify(props.options)) })
  return {
    ...view,
    calls,
    get current() { return current },
    renderSelect: (props, profile) => view.render(createElement(ReferenceRecordsContext.Provider, { value: { adminProfile: profile } }, createElement(RemoteReferenceSelect, { referenceType: 'materials', component: Probe, ...props }))),
    wait: (ms = 15) => view.act(async () => delay(ms)),
  }
}
function page(params) {
  const ids = params.ids || Array.from({ length: Math.min(50, 501 - params.offset) }, (_, i) => i + params.offset + 1)
  return { materials: ids.map((id) => ({ id, name: `材料 ${id}`, is_active: !params.ids })), total: params.ids ? ids.length : 501, limit: params.limit, offset: params.offset }
}

test('reference select loads on opening, pages beyond the first 50 and searches remotely', async (t) => {
  const view = await harness(t, page)
  await view.renderSelect()
  assert.equal(view.calls.length, 0)
  await view.act(async () => view.current.onOpenChange(true))
  await view.wait()
  assert.equal(view.calls.length, 1)
  assert.equal(view.calls[0].params.limit, 50)
  assert.equal(view.current.options.length, 50)
  await view.act(async () => view.current.onPopupScroll({ currentTarget: { scrollHeight: 100, scrollTop: 80, clientHeight: 20 } }))
  await view.wait()
  assert.equal(view.calls[1].params.offset, 50)
  assert.equal(view.current.options.length, 100)
  await view.act(async () => view.current.onSearch('最末材料'))
  await view.wait(250)
  assert.equal(view.calls[2].params.keyword, '最末材料')
  assert.equal(view.calls[2].params.offset, 0)
  assert.equal(view.current.filterOption, false)
})

test('selected historical values use exact IDs and clearing leaves no stale selected option', async (t) => {
  const view = await harness(t, page)
  const accepted = []
  await view.renderSelect({ value: 900, onRecords: (rows) => accepted.push(...rows) })
  await view.wait()
  assert.deepEqual(view.calls[0].params.ids, [900])
  assert.equal(view.calls[0].params.active_only, undefined)
  assert.equal(accepted[0].is_active, false)
  assert.equal(view.current.options[0].value, 900)
  await view.renderSelect({ value: undefined })
  assert.equal(view.current.options.length, 0)
})

test('late search responses and permission changes cannot overwrite current choices', async (t) => {
  let finishOld
  const view = await harness(t, async (params) => {
    if (params.keyword === '旧') await new Promise((resolve) => { finishOld = resolve })
    const data = page(params)
    data.materials = [{ id: params.keyword === '旧' ? 99 : 7, name: params.keyword }]
    data.total = 1
    return data
  })
  await view.renderSelect()
  await view.act(async () => view.current.onSearch('旧'))
  await view.wait(250)
  await view.act(async () => view.current.onSearch('新'))
  await view.wait(250)
  assert.equal(view.calls[0].request.init.signal.aborted, true)
  await view.act(async () => finishOld())
  await view.wait()
  assert.deepEqual(view.current.options.map((option) => option.value), [7])
  await view.renderSelect({}, { effective_session: { actions: [] } })
  assert.equal(view.current.disabled, true)
  assert.deepEqual(view.current.options, [])
  const count = view.calls.length
  await view.act(async () => view.current.onOpenChange(true))
  await view.wait()
  assert.equal(view.calls.length, count)
})
