import { createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { installRpcCallHarness } from '../../../../scripts/test/rpcApiTestHarness.mjs'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'

async function inventoryHarness(t, handler) {
  const view = await createReactTestHarness(t)
  const setHandler = installRpcCallHarness((cleanup) => t.after(cleanup))
  const calls = []
  setHandler((method, params, request) => {
    calls.push({ method, params, ...request })
    return handler(method, params, request)
  })
  const { default: useInventoryReferences } =
    await import('./useInventoryReferences.js')
  let current
  function Consumer({ adminProfile }) {
    current = useInventoryReferences({ adminProfile })
    return null
  }
  return {
    ...view,
    calls,
    get current() {
      return current
    },
    renderProfile: async (adminProfile) => {
      await view.render(createElement(Consumer, { adminProfile }))
      await view.flush()
    },
  }
}

const actions = [PermissionCode.MATERIAL_READ]
const profile = (id) => ({
  id,
  permissions: actions,
  effective_session: { actions },
})
function referencePage(method, params, id) {
  const key = method === 'list_materials' ? 'materials' : 'units'
  return {
    code: 0,
    data: {
      [key]: [{ id, name: `reference-${id}` }],
      total: 1,
      limit: params.limit,
      offset: params.offset,
    },
  }
}

test('inventory references respect effective permissions and load only the units needed by that scope', async (t) => {
  const view = await inventoryHarness(t, (method, params) =>
    referencePage(method, params, 1)
  )
  await view.renderProfile(profile(7))
  assert.deepEqual(view.calls.map((call) => call.method).sort(), [
    'list_materials',
    'list_units',
  ])
  assert.equal(view.current.materials[0].id, 1)
  assert.equal(view.current.units[0].id, 1)
  assert.deepEqual(view.current.products, [])
  assert.deepEqual(view.current.productSKUs, [])
  assert.deepEqual(view.current.warehouses, [])
  assert.deepEqual(view.current.inventoryLots, [])
  await view.renderProfile({
    id: 7,
    is_super_admin: true,
    effective_session: { actions: [] },
  })
  assert.equal(view.calls.length, 2)
  assert.deepEqual(view.current.materials, [])
})

test('identity changes reload references even when the set of readable capabilities is unchanged', async (t) => {
  const view = await inventoryHarness(t, (method, params) =>
    referencePage(method, params, view.calls.length)
  )
  await view.renderProfile(profile(7))
  const firstMaterial = view.current.materials[0].id
  await view.renderProfile(profile(8))
  assert.equal(view.calls.length, 4)
  assert.notEqual(view.current.materials[0].id, firstMaterial)
})
