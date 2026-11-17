import assert from 'node:assert/strict'
import test from 'node:test'
import { installRpcCallHarness } from '../../../scripts/test/rpcApiTestHarness.mjs'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'
import { resolveShipmentWeightPreview } from './shipmentWeight.mjs'

test('source order hydration is bounded to selected IDs and includes historical sources', async (t) => {
  await createReactTestHarness(t)
  const { loadReferenceIDs } = await import('./remoteReferences.mjs')
  const handler = installRpcCallHarness((cleanup) => t.after(cleanup))
  handler((method, params) => {
    assert.equal(method, 'list_sales_orders')
    assert.deepEqual(params.ids, [17, 23])
    assert.equal(params.lifecycle_scope, 'all')
    return { code: 0, data: { sales_orders: [{ id: 17 }, { id: 23 }], total: 2, limit: 200, offset: 0 } }
  })
  const result = await loadReferenceIDs('sales_orders', [17, 23])
  assert.equal(result.sales_orders.length, 2)
})

test('selected inactive product weights remain readable without loading a product catalog', async (t) => {
  await createReactTestHarness(t)
  const { loadReferenceIDs } = await import('./remoteReferences.mjs')
  const handler = installRpcCallHarness((cleanup) => t.after(cleanup))
  handler((method, params) => {
    assert.equal(method, 'list_products')
    assert.deepEqual(params.ids, [251])
    assert.equal(params.active_only, undefined)
    return { code: 0, data: { products: [{ id: 251, default_unit_id: 10, is_active: false, unit_net_weight_g: '0.625' }], total: 1, limit: 200, offset: 0 } }
  })
  const result = await loadReferenceIDs('products', [251])
  const preview = resolveShipmentWeightPreview({ items: [{ product_id: 251, unit_id: 10, quantity: '2' }], products: result.products })
  assert.equal(preview.totalNetWeightG, '1.25')
})

test('inventory distribution accepts an empty result and rejects inconsistent counts', async (t) => {
  await createReactTestHarness(t)
  const { getInventoryDistribution } = await import('../api/inventoryApi.mjs')
  const handler = installRpcCallHarness((cleanup) => t.after(cleanup))
  let warehouses = []
  handler((method) => {
    assert.equal(method, 'get_inventory_distribution')
    return { code: 0, data: { distribution: { warehouses } } }
  })
  assert.deepEqual(await getInventoryDistribution(), { warehouses: [] })
  warehouses = [{ warehouse_id: 1, record_count: 2, stock_count: 1, available_record_count: 1, unavailable_record_count: 0 }]
  await assert.rejects(getInventoryDistribution(), (error) => error.isInvalidResponse === true)
})
