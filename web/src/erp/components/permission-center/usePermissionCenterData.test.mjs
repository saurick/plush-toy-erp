import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  installTestDOM,
  registerJSXTestLoader,
} from '../../../../scripts/test/reactRuntime.mjs'

let runtime
async function mountData(t) {
  const dom = installTestDOM()
  runtime ||=
    (registerJSXTestLoader(),
    Promise.all([
      import('./usePermissionCenterData.mjs'),
      import('../../../common/utils/jsonRpc.js'),
    ]))
  const [{ usePermissionCenterData }, { JsonRpc }] = await runtime
  const requests = []
  t.mock.method(JsonRpc.prototype, 'call', (method, params, options) => {
    return new Promise((resolve, reject) =>
      requests.push({ method, params, options, resolve, reject })
    )
  })
  let state
  function View() {
    state = usePermissionCenterData()
    return null
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let unmounted = false
  async function unmount() {
    if (unmounted) return
    unmounted = true
    await act(async () => root.unmount())
  }
  t.after(async () => {
    await unmount()
    dom.restore()
  })
  await act(async () => root.render(createElement(View)))
  return {
    requests,
    unmount,
    get state() {
      return state
    },
  }
}

const admin = { id: 9, is_super_admin: true }
async function resolveIdentity(request, data = admin) {
  await act(async () => request.resolve({ data }))
}
async function resolveOptions(requests, label) {
  await act(async () => {
    requests
      .find((request) => request.method === 'list')
      .resolve({ data: { admins: [{ id: label }] } })
    requests
      .find((request) => request.method === 'rbac_options')
      .resolve({
        data: {
          roles: [{ role_key: label }],
          permissions: [{ key: label }],
          menus: [{ key: label }],
          warehouse_scope_options: [{ id: label }],
        },
      })
  })
}

for (const staleStage of ['identity', 'options']) {
  test(`permission data ignores delayed ${staleStage} after a newer refresh succeeds`, async (t) => {
    const view = await mountData(t)
    const oldIdentity = view.requests[0]
    if (staleStage === 'options') await resolveIdentity(oldIdentity)
    const oldRequests = [...view.requests]
    let refresh
    await act(async () => {
      refresh = view.state.loadData()
    })
    assert.equal(oldIdentity.options.signal.aborted, true)
    await resolveIdentity(view.requests.at(-1), { ...admin, id: 10 })
    await resolveOptions(view.requests.slice(oldRequests.length), 'latest')
    assert.equal(await refresh, true)
    assert.equal(view.state.currentAdmin.id, 10)
    assert.equal(view.state.loading, false)

    if (staleStage === 'identity') await resolveIdentity(oldIdentity)
    else await resolveOptions(oldRequests, 'stale')

    assert.deepEqual(view.state.admins, [{ id: 'latest' }])
    assert.deepEqual(view.state.roles, [{ role_key: 'latest' }])
    assert.deepEqual(view.state.permissions, [{ key: 'latest' }])
    assert.deepEqual(view.state.permissionMenuOptions, [{ key: 'latest' }])
    assert.deepEqual(view.state.warehouseScopeOptions, [{ id: 'latest' }])
    assert.equal(view.state.currentAdmin.id, 10)
    assert.equal(view.state.loading, false)
    assert.equal(view.requests.length, staleStage === 'identity' ? 4 : 6)
  })
}

test('permission withdrawal clears account and role data without unauthorized reads', async (t) => {
  const view = await mountData(t)
  await resolveIdentity(view.requests[0])
  await resolveOptions(view.requests, 'allowed')
  assert.equal(view.state.admins.length, 1)
  let refresh
  await act(async () => {
    refresh = view.state.loadData()
  })
  await resolveIdentity(view.requests.at(-1), { id: 9, permissions: [] })
  assert.equal(await refresh, true)
  assert.equal(view.requests.length, 4)
  for (const field of [
    'admins',
    'roles',
    'permissions',
    'permissionMenuOptions',
    'warehouseScopeOptions',
  ]) {
    assert.deepEqual(view.state[field], [])
  }
})

test('permission data aborts pending reads on unmount without starting follow-up reads', async (t) => {
  const view = await mountData(t)
  const pending = view.requests[0]
  await view.unmount()
  assert.equal(pending.options.signal.aborted, true)
  await resolveIdentity(pending)
  assert.equal(view.requests.length, 1)
})
