import assert from 'node:assert/strict'
import test from 'node:test'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'

async function harness(t) {
  await createReactTestHarness(t)
  const { JsonRpc } = await import('./jsonRpc.js')
  const events = await import('./rpcChanges.mjs')
  let source = { workspaceID: 'local-test', pane: 'left' }
  t.after(events.registerRpcChangeSource(() => source))
  const changes = []
  const eventWindow = window
  const listener = (event) => changes.push(event.detail)
  window.addEventListener(events.RPC_RECORDS_CHANGED, listener)
  t.after(() => eventWindow.removeEventListener(events.RPC_RECORDS_CHANGED, listener))
  let response
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const request = JSON.parse(init.body)
    const result = response ? await response(request) : { code: 0, data: {} }
    return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: request.id, result }) }
  })
  return {
    events,
changes,
    rpc: new JsonRpc({ url: 'masterdata', withAuth: false }),
    setSource: (value) => { source = value },
    respond: (handler) => { response = handler },
  }
}

test('only confirmed known writes announce the request origin; queries, failures and unknown methods cannot refresh another pane', async (t) => {
  const ui = await harness(t)
  let finish
  ui.respond(() => new Promise((resolve) => { finish = resolve }))
  const save = ui.rpc.call('update_material', { id: 1, name: '不应出现在通知中的内容' })
  ui.setSource({ workspaceID: 'local-test', pane: 'right' })
  assert.equal(ui.changes.length, 0)
  finish({ code: 0, data: { material: { id: 1 } } })
  await save
  assert.deepEqual(ui.changes, [{ domain: 'masterdata', method: 'update_material', source: { workspaceID: 'local-test', pane: 'left' } }])
  ui.respond(undefined)
  await ui.rpc.call('list_materials')
  await ui.rpc.call('create_unknown_record')
  assert.equal(ui.changes.length, 1)
  ui.respond(() => ({ code: 50000, message: '保存失败', data: {} }))
  await assert.rejects(ui.rpc.call('create_material'))
  assert.equal(ui.changes.length, 1)
  ui.respond(undefined)
  ui.setSource(null)
  await ui.rpc.call('create_material')
  assert.equal(ui.changes.length, 1)
})
