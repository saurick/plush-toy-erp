import assert from 'node:assert/strict'
import test from 'node:test'
import { installRpcCallHarness } from '../../../../scripts/test/rpcApiTestHarness.mjs'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

let loadQualityInspectionList
let loadQualityInspectionExport

function query(filters = {}, context = {}) {
  return {
    customerKey: 'query-fixture',
    pagination: { current: 2, pageSize: 100 },
    filters: {
      dateFilterEnd: '',
      dateFilterField: 'inspected_at',
      dateFilterStart: '',
      inspectionTypeFilter: '',
      keyword: '',
      lotFilter: '',
      materialFilter: '',
      purchaseReceiptFilter: '',
      resultFilter: '',
      statusFilter: '',
      warehouseFilter: '',
      ...filters,
    },
    context: {
      linkedKeyword: '',
      routePurchaseOrderID: 0,
      routePurchaseReceiptID: 0,
      routeQualityInspectionID: 0,
      routeSourceID: 0,
      routeSourceType: '',
      ...context,
    },
  }
}

async function rpcHarness(t, handler) {
  await createReactTestHarness(t)
  ;({ loadQualityInspectionList, loadQualityInspectionExport } =
    await import('./qualityInspectionQueries.mjs'))
  const calls = []
  const setHandler = installRpcCallHarness((cleanup) => t.after(cleanup))
  setHandler(async (method, params, request) => {
    calls.push({ method, params, signal: request.init.signal })
    const data = handler
      ? await handler(method, params)
      : {
          quality_inspections: [],
          total: 0,
          limit: params.limit,
          offset: params.offset,
        }
    return { code: 0, data }
  })
  return calls
}

test('incoming exact-source lists retain structured filters without adding a conflicting keyword', async (t) => {
  const calls = await rpcHarness(t)
  const controller = new AbortController()
  await loadQualityInspectionList({
    ...query(
      {
        inspectionTypeFilter: 'INCOMING',
        statusFilter: 'SUBMITTED',
        resultFilter: 'PASS',
        keyword: 'needle',
        warehouseFilter: 4,
        lotFilter: 5,
        materialFilter: 6,
        dateFilterStart: '2026-10-01',
        dateFilterEnd: '2026-10-17',
        dateFilterField: 'created_at',
      },
      { routePurchaseOrderID: 7, routePurchaseReceiptID: 8 }
    ),
    signal: controller.signal,
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'list_quality_inspections')
  assert.deepEqual(calls[0].params, {
    include_status_counts: true,
    status: 'SUBMITTED',
    result: 'PASS',
    date_from: '2026-10-01',
    date_to: '2026-10-17',
    limit: 100,
    offset: 100,
    warehouse_id: 4,
    inventory_lot_id: 5,
    inspection_type: 'INCOMING',
    date_field: 'created_at',
    purchase_receipt_id: 8,
    purchase_order_id: 7,
    material_id: 6,
  })
  assert.equal(calls[0].signal, controller.signal)
  assert.equal(calls[0].params.keyword, undefined)
})

test('ordinary list search keeps the operator keyword', async (t) => {
  const calls = await rpcHarness(t)
  await loadQualityInspectionList(query({ keyword: 'needle' }))
  assert.equal(calls[0].params.keyword, 'needle')
})

test('each inspection family uses its owning read contract', async (t) => {
  const calls = await rpcHarness(t)
  await loadQualityInspectionList(
    query(
      { inspectionTypeFilter: 'OUTSOURCING_RETURN', warehouseFilter: 4 },
      { routeSourceType: 'OUTSOURCING_FACT', routeSourceID: 25 }
    )
  )
  await loadQualityInspectionList(
    query(
      { inspectionTypeFilter: 'FINISHED_GOODS', lotFilter: 5 },
      { routeSourceType: 'SHIPMENT', routeSourceID: 26 }
    )
  )
  await loadQualityInspectionList(
    query({
      inspectionTypeFilter: 'PRODUCTION_STAGE',
      keyword: 'WIP',
      warehouseFilter: 4,
      materialFilter: 6,
    })
  )
  assert.deepEqual(
    calls.map(({ method }) => method),
    [
      'list_outsourcing_return_quality_inspections',
      'list_finished_goods_quality_inspections',
      'list_production_stage_quality_inspections',
    ]
  )
  assert.equal(calls[0].params.fact_id, 25)
  assert.equal(calls[0].params.customer_key, 'query-fixture')
  assert.equal(calls[1].params.source_type, 'SHIPMENT')
  assert.equal(calls[1].params.source_id, 26)
  assert.equal(calls[2].params.keyword, 'WIP')
  assert.equal(calls[2].params.warehouse_id, undefined)
  assert.equal(calls[2].params.material_id, undefined)
})

test('export retains list filters and fetches all batches with the same cancellation signal', async (t) => {
  const calls = await rpcHarness(t, (_method, params) => ({
    quality_inspections: Array.from(
      { length: Math.min(params.limit, 201 - params.offset) },
      (_, index) => ({ id: params.offset + index + 1 })
    ),
    total: 201,
    limit: params.limit,
    offset: params.offset,
  }))
  const controller = new AbortController()
  const result = await loadQualityInspectionExport(
    query({ statusFilter: 'PASSED', warehouseFilter: 4 }),
    { signal: controller.signal }
  )
  assert.equal(result.length, 201)
  assert.deepEqual(
    calls.map(({ params }) => params.offset),
    [0, 200]
  )
  for (const call of calls) {
    assert.equal(call.params.status, 'PASSED')
    assert.equal(call.params.warehouse_id, 4)
    assert.equal(call.params.include_status_counts, undefined)
    assert.equal(call.signal, controller.signal)
  }
})

test('an exact inspection export reads that record without broadening the list', async (t) => {
  const calls = await rpcHarness(t, () => ({
    quality_inspection: { id: 77, inspection_no: 'QI-77' },
  }))
  const rows = await loadQualityInspectionExport(
    query({}, { routeQualityInspectionID: 77 })
  )
  assert.deepEqual(rows, [{ id: 77, inspection_no: 'QI-77' }])
  assert.deepEqual(
    calls.map(({ method, params }) => ({ method, params })),
    [{ method: 'get_quality_inspection', params: { id: 77 } }]
  )
})

test('production-stage exact exports stay on the production read model', async (t) => {
  const calls = await rpcHarness(t, (_method, params) => ({
    quality_inspections: [{ id: 77 }, { id: 78 }],
    total: 2,
    limit: params.limit,
    offset: params.offset,
  }))
  const rows = await loadQualityInspectionExport(
    query(
      { inspectionTypeFilter: 'PRODUCTION_STAGE' },
      { routeQualityInspectionID: 77 }
    )
  )
  assert.deepEqual(rows, [{ id: 77 }])
  assert.equal(calls[0].method, 'list_production_stage_quality_inspections')
})

test('failed reads remain errors instead of successful empty lists', async (t) => {
  await rpcHarness(t, () => {
    throw new Error('connection closed')
  })
  await assert.rejects(loadQualityInspectionList(query()))
})
