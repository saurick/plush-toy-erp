import assert from 'node:assert/strict'
import test from 'node:test'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'

test('recorded receipts read each real source through its existing API and reject substituted identities', async (t) => {
  await createReactTestHarness(t)
  const [{ JsonRpc }, { loadWorkflowTaskBusinessReadback }] = await Promise.all([import('../../common/utils/jsonRpc.js'), import('./workflowTaskBusinessReadback.mjs')])
  const original = JsonRpc.prototype.call
  t.after(() => { JsonRpc.prototype.call = original })
  const cases = [
    ['sales_order', 'get_sales_order', 'sales_order', 'order_no'],
    ['purchase_order', 'get_purchase_order', 'purchase_order', 'purchase_order_no'],
    ['outsourcing_order', 'get_outsourcing_order', 'outsourcing_order', 'outsourcing_order_no'],
    ['purchase_receipt', 'get_purchase_receipt', 'purchase_receipt', 'receipt_no'],
    ['quality_inspection', 'get_quality_inspection', 'quality_inspection', 'inspection_no'],
    ['shipment', 'get_shipment', 'shipment', 'shipment_no'],
    ['finance_payment', 'get_finance_payment', 'payment', 'payment_no'],
    ['inventory_operation', 'get_inventory_operation', 'inventory_operation', 'operation_no'],
    ['production_exception_decision', 'get_production_exception', 'production_exception', 'decision_no'],
  ]
  for (const [source_type, expected, entity, no] of cases) {
    let wrongID = false
    JsonRpc.prototype.call = async (method, params) => {
      assert.equal(method, expected)
      assert.equal(params.id, 3)
      return { data: { [entity]: { id: wrongID ? 4 : 3, [no]: 'SOURCE-003', status: 'POSTED', updated_by_name: '当前资料修改人', updated_at: 1800000000 } } }
    }
    const task = { id: 7, version: 2, source_type, source_id: 3, process_instance_id: 11, process_node_instance_id: 12, task_status_key: 'done' }
    const value = await loadWorkflowTaskBusinessReadback(task)
    assert.equal(value.recordNo, 'SOURCE-003', source_type)
    assert.equal(Object.hasOwn(value, 'actorLabel'), false, 'a later source editor cannot become the historical task actor')
    assert.equal(Object.hasOwn(value, 'timeLabel'), false)
    wrongID = true
    await assert.rejects(() => loadWorkflowTaskBusinessReadback(task), /来源资料已变化/u)
  }
})

test('production order readback uses the validated aggregate and list-only facts stay bounded to the exact task', async (t) => {
  await createReactTestHarness(t)
  const [{ JsonRpc }, { loadWorkflowTaskBusinessReadback }] = await Promise.all([import('../../common/utils/jsonRpc.js'), import('./workflowTaskBusinessReadback.mjs')])
  const original = JsonRpc.prototype.call
  t.after(() => { JsonRpc.prototype.call = original })
  let total = 1
  JsonRpc.prototype.call = async (method, params) => {
    if (method === 'get_production_order') return { data: { production_order: { id: 3, version: 2, order_no: 'MO-3', status: 'RELEASED' }, production_order_items: [{ id: 5, production_order_id: 3, line_no: 1, product_id: 6, unit_id: 1, planned_quantity: '20', route_code: 'PLUSH_SEW_HAND_V1', customer_inspection_required: false }], production_material_requirements: [], material_requirements_state: 'NOT_REQUIRED' } }
    assert.equal(method, 'list_production_facts')
    assert.equal(params.keyword, 'FACT-3')
    assert.equal(params.limit, 100)
    assert.equal(params.offset, 0)
    return { data: { production_facts: [{ id: 3, fact_no: 'FACT-3', status: 'POSTED', quantity: '20' }], total } }
  }
  const formal = { id: 7, version: 2, process_instance_id: 11, process_node_instance_id: 12, task_status_key: 'done', source_id: 3 }
  assert.equal((await loadWorkflowTaskBusinessReadback({ ...formal, source_type: 'production_order' })).recordNo, 'MO-3')
  const fact = { ...formal, source_type: 'production_fact', source_no: 'FACT-3' }
  assert.equal((await loadWorkflowTaskBusinessReadback(fact)).recordNo, 'FACT-3')
  total = 101
  await assert.rejects(() => loadWorkflowTaskBusinessReadback(fact), /尚未核对完整/u)
  assert.equal(await loadWorkflowTaskBusinessReadback({ ...fact, source_no: '' }), null)
  assert.equal(await loadWorkflowTaskBusinessReadback({ ...formal, source_type: 'unknown' }), null)
})

test('current source line names and units use permitted exact references and never replace stored snapshots', async (t) => {
  await createReactTestHarness(t)
  const [{ JsonRpc }, { loadWorkflowTaskBusinessReadback }] = await Promise.all([import('../../common/utils/jsonRpc.js'), import('./workflowTaskBusinessReadback.mjs')])
  const original = JsonRpc.prototype.call
  t.after(() => { JsonRpc.prototype.call = original })
  const calls = []
  JsonRpc.prototype.call = async (method, params) => {
    calls.push({ method, params })
    if (method === 'get_shipment') return { data: { shipment: { id: 3, shipment_no: 'SHIP-3', status: 'CANCELLED', items: [{ id: 5, product_id: 8, unit_id: 2, quantity: '1' }, { id: 6, product_id: 9, unit_id: 3, quantity: '2', product_name_snapshot: '原单产品名', unit_name_snapshot: '套' }] } } }
    assert.equal(params.ids.length, 1)
    const units = method === 'list_units'
    assert.equal(method, units ? 'list_units' : 'list_products')
    assert.deepEqual(params.ids, [units ? 2 : 8])
    return { data: { [units ? 'units' : 'products']: [{ id: units ? 2 : 8, name: units ? '个' : '当前产品名称' }], total: 1, limit: params.limit, offset: 0 } }
  }
  const task = { id: 7, version: 2, source_type: 'shipment', source_id: 3, process_instance_id: 11, process_node_instance_id: 12, task_status_key: 'withdrawn' }
  const result = await loadWorkflowTaskBusinessReadback(task, { profile: { id: 1, permissions: ['product.read'], effective_session: { actions: ['product.read'] } } })
  assert.deepEqual(result.items, [{ label: '当前产品名称', quantity: '1', unit: '个' }, { label: '原单产品名', quantity: '2', unit: '套' }])
  calls.length = 0
  const denied = await loadWorkflowTaskBusinessReadback(task, { profile: { id: 1, permissions: [] } })
  assert.equal(calls.some((call) => call.method === 'list_products'), false)
  assert.equal(denied.items[0].label, '第 1 行（名称未记录）')
})
