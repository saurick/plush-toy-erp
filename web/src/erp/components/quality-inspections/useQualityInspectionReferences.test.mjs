import { createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { installRpcCallHarness } from '../../../../scripts/test/rpcApiTestHarness.mjs'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'

const profile = (actions = []) => ({
  permissions: actions,
  effective_session: { actions },
})

async function referenceHarness(t, handler) {
  const view = await createReactTestHarness(t)
  const setHandler = installRpcCallHarness((cleanup) => t.after(cleanup))
  const calls = []
  setHandler(async (method, params, request) => {
    calls.push({ method, params, ...request })
    return handler(method, params, request)
  })
  const { default: useQualityInspectionReferences } =
    await import('./useQualityInspectionReferences.js')
  let current
  function Consumer({ adminProfile }) {
    current = useQualityInspectionReferences({ adminProfile })
    return createElement(
      'output',
      null,
      `${current.referenceDataState}:${current.materials.length}`
    )
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

function warehousePage(params, id = 1) {
  return {
    code: 0,
    data: {
      warehouses: [{ id, code: `WH-${id}` }],
      total: 1,
      limit: params.limit,
      offset: params.offset,
    },
  }
}

test('initialization does not scan source catalogs; cached records are cleared when effective permissions change', async (t) => {
  const view = await referenceHarness(t, (_method, params) => warehousePage(params))
  await view.renderProfile(profile([PermissionCode.MATERIAL_READ]))
  assert.equal(view.current.referenceDataState, 'ready')
  assert.equal(view.calls.length, 0)
  const oldMerge = view.current.referenceRecords.materials
  await view.act(async () => oldMerge([{ id: 7, code: 'M-7' }]))
  assert.equal(view.current.materials[0].id, 7)
  await view.renderProfile({ is_super_admin: true, effective_session: { actions: [] } })
  await view.act(async () => oldMerge([{ id: 8, code: 'M-8' }]))
  assert.deepEqual(view.current.materials, [])
  assert.deepEqual(view.current.purchaseReceipts, [])
  assert.deepEqual(view.current.inventoryLots, [])
  assert.equal(view.calls.length, 0)
})

test('a late response from an earlier permission scope cannot repopulate reference data', async (t) => {
  let complete
  const pending = new Promise((resolve) => {
    complete = resolve
  })
  const view = await referenceHarness(t, async (_method, params) => {
    await pending
    return warehousePage(params)
  })
  await view.renderProfile(profile([PermissionCode.WAREHOUSE_INVENTORY_READ]))
  assert.equal(view.current.referenceDataState, 'loading')
  await view.renderProfile(profile())
  assert.equal(view.calls[0].init.signal.aborted, true)
  assert.equal(view.current.referenceDataState, 'ready')
  await view.act(async () => complete())
  await view.flush()
  assert.deepEqual(view.current.materials, [])
})

test('authorized initialization reads only warehouse configuration and leaves source catalogs lazy', async (t) => {
  const keys = {
    list_purchase_receipts: 'purchase_receipts',
    list_inventory_lots: 'inventory_lots',
    list_materials: 'materials',
    list_products: 'products',
    list_warehouses: 'warehouses',
  }
  const view = await referenceHarness(t, (method, params) => {
    const key = keys[method]
    assert.ok(key, method)
    const total = key === 'purchase_receipts' ? params.limit + 1 : 1
    return {
      code: 0,
      data: {
        [key]: Array.from(
          { length: Math.min(params.limit, total - params.offset) },
          (_, index) => ({ id: params.offset + index + 1 })
        ),
        total,
        limit: params.limit,
        offset: params.offset,
      },
    }
  })
  await view.renderProfile(
    profile([
      PermissionCode.PURCHASE_RECEIPT_READ,
      PermissionCode.WAREHOUSE_INVENTORY_READ,
      PermissionCode.MATERIAL_READ,
      PermissionCode.PRODUCT_READ,
    ])
  )
  assert.equal(view.current.referenceDataState, 'ready')
  assert.equal(view.calls.length, 1)
  assert.equal(view.calls[0].method, 'list_warehouses')
  assert.deepEqual(view.current.purchaseReceipts, [])
  assert.deepEqual(view.current.inventoryLots, [])
  assert.deepEqual(view.current.materials, [])
  assert.deepEqual(view.current.products, [])
  assert.equal(view.current.warehouses.length, 1)
})

test('reference failures clear stale choices and an explicit retry restores the current data', async (t) => {
  let fail = false
  const view = await referenceHarness(t, (_method, params) => {
    if (fail) throw new Error('offline')
    return warehousePage(params, 2)
  })
  const { message } = await import('../../../common/utils/antdApp.js')
  const originalError = message.error
  const errors = []
  message.error = (value) => errors.push(value)
  t.after(() => {
    message.error = originalError
  })
  await view.renderProfile(profile([PermissionCode.WAREHOUSE_INVENTORY_READ]))
  assert.equal(view.current.warehouses[0].id, 2)
  fail = true
  await view.act(async () =>
    assert.equal(await view.current.loadReferenceOptions(), false)
  )
  assert.equal(view.current.referenceDataState, 'error')
  assert.deepEqual(view.current.warehouses, [])
  assert.equal(errors.length, 1)
  fail = false
  await view.act(async () =>
    assert.equal(await view.current.loadReferenceOptions(), true)
  )
  assert.equal(view.current.referenceDataState, 'ready')
  assert.equal(view.current.warehouses[0].id, 2)
})
