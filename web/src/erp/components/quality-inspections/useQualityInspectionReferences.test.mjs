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

function materialPage(params, id = 1) {
  return {
    code: 0,
    data: {
      materials: [{ id, code: `M-${id}` }],
      total: 1,
      limit: params.limit,
      offset: params.offset,
    },
  }
}

test('reference reads use the effective permission intersection and leave unauthorized sets empty', async (t) => {
  const view = await referenceHarness(t, (_method, params) =>
    materialPage(params)
  )
  await view.renderProfile(profile([PermissionCode.MATERIAL_READ]))
  assert.equal(view.current.referenceDataState, 'ready')
  assert.equal(view.calls.length, 1)
  assert.equal(view.calls[0].method, 'list_materials')
  assert.equal(view.calls[0].params.active_only, true)
  assert.equal(view.current.materials[0].code, 'M-1')
  assert.deepEqual(view.current.purchaseReceipts, [])
  assert.deepEqual(view.current.inventoryLots, [])
  assert.deepEqual(view.current.products, [])
  assert.deepEqual(view.current.warehouses, [])

  await view.renderProfile({
    is_super_admin: true,
    effective_session: { actions: [] },
  })
  assert.equal(view.current.referenceDataState, 'ready')
  assert.equal(view.calls.length, 1)
  assert.deepEqual(view.current.materials, [])
})

test('a late response from an earlier permission scope cannot repopulate reference data', async (t) => {
  let complete
  const pending = new Promise((resolve) => {
    complete = resolve
  })
  const view = await referenceHarness(t, async (_method, params) => {
    await pending
    return materialPage(params)
  })
  await view.renderProfile(profile([PermissionCode.MATERIAL_READ]))
  assert.equal(view.current.referenceDataState, 'loading')
  await view.renderProfile(profile())
  assert.equal(view.calls[0].init.signal.aborted, true)
  assert.equal(view.current.referenceDataState, 'ready')
  await view.act(async () => complete())
  await view.flush()
  assert.deepEqual(view.current.materials, [])
})

test('authorized source dictionaries read every page and share cancellation across all five reads', async (t) => {
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
  assert.equal(view.calls.length, 6)
  const receiptCalls = view.calls.filter(
    (call) => call.method === 'list_purchase_receipts'
  )
  assert.equal(receiptCalls[1].params.offset, receiptCalls[0].params.limit)
  assert.equal(
    view.current.purchaseReceipts.length,
    receiptCalls[0].params.limit + 1
  )
  assert.equal(view.current.inventoryLots.length, 1)
  assert.equal(view.current.materials.length, 1)
  assert.equal(view.current.products.length, 1)
  assert.equal(view.current.warehouses.length, 1)
  assert.ok(
    view.calls.every((call) => call.init.signal === view.calls[0].init.signal)
  )
})

test('reference failures clear stale choices and an explicit retry restores the current data', async (t) => {
  let fail = false
  const view = await referenceHarness(t, (_method, params) => {
    if (fail) throw new Error('offline')
    return materialPage(params, 2)
  })
  const { message } = await import('../../../common/utils/antdApp.js')
  const originalError = message.error
  const errors = []
  message.error = (value) => errors.push(value)
  t.after(() => {
    message.error = originalError
  })
  await view.renderProfile(profile([PermissionCode.MATERIAL_READ]))
  assert.equal(view.current.materials[0].id, 2)
  fail = true
  await view.act(async () =>
    assert.equal(await view.current.loadReferenceOptions(), false)
  )
  assert.equal(view.current.referenceDataState, 'error')
  assert.deepEqual(view.current.materials, [])
  assert.equal(errors.length, 1)
  fail = false
  await view.act(async () =>
    assert.equal(await view.current.loadReferenceOptions(), true)
  )
  assert.equal(view.current.referenceDataState, 'ready')
  assert.equal(view.current.materials[0].id, 2)
})
