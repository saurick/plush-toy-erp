import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  installFactRpcMocks,
  mockShipmentSourceCandidates,
} from './factRpcMocks.mjs'
import { styleRpcResult } from './rpcMockResult.mjs'
import { createWorkflowSourceTaskFixture } from './workflowSourceTaskFixtures.mjs'

const factMockSource = readFileSync(
  new URL('./factRpcMocks.mjs', import.meta.url),
  'utf8'
)

function workflowScopes(roleKey, actions) {
  return Object.fromEntries(actions.map((action) => [action, [roleKey]]))
}

async function workflowMockHarness(
  adminProfile = {
    id: 1,
    is_super_admin: true,
    roles: [{ role_key: 'sales' }],
    permissions: [
      'workflow.task.read',
      'workflow.task.create',
      'workflow.task.complete',
      'workflow.task.update',
      'workflow.task.reject',
    ],
    effective_session: {
      actions: [
        'workflow.task.read',
        'workflow.task.create',
        'workflow.task.complete',
        'workflow.task.update',
        'workflow.task.reject',
      ],
      workflow_visible_owner_role_keys_by_capability: workflowScopes('sales', [
        'workflow.task.read',
        'workflow.task.create',
        'workflow.task.complete',
        'workflow.task.update',
        'workflow.task.reject',
      ]),
    },
  },
  {
    workflowTaskFixtures = [],
    workflowProcessContextFixtures = [],
    workflowAssignmentCandidates = [],
  } = {}
) {
  const handlers = new Map()
  const page = {
    url: () => '',
    async route(pattern, handler) {
      handlers.set(pattern, handler)
    },
  }
  await installFactRpcMocks(page, {
    adminProfile,
    effectiveSession: adminProfile?.effective_session || null,
    nowUnix: () => 1_750_000_000,
    resolveDelayFromReferer: () => 0,
    workflowTaskFixtures,
    workflowProcessContextFixtures,
    workflowAssignmentCandidates:
      workflowAssignmentCandidates.length > 0
        ? workflowAssignmentCandidates
        : undefined,
  })
  const handler = handlers.get('**/rpc/workflow')
  assert.equal(typeof handler, 'function')

  return async function call(method, params = {}) {
    let responseBody = null
    const request = {
      postDataJSON: () => ({
        jsonrpc: '2.0',
        id: method,
        method,
        params,
      }),
    }
    await handler({
      request: () => request,
      fulfill: async ({ body }) => {
        responseBody = JSON.parse(body)
      },
    })
    return responseBody
  }
}

async function purchaseMockHarness() {
  const handlers = new Map()
  const page = {
    async route(pattern, handler) {
      handlers.set(pattern, handler)
    },
  }
  await installFactRpcMocks(page, {
    adminProfile: {
      id: 1,
      is_super_admin: true,
      roles: [{ role_key: 'purchase' }],
      permissions: ['purchase.receipt.create'],
      effective_session: { actions: ['purchase.receipt.create'] },
    },
    effectiveSession: { actions: ['purchase.receipt.create'] },
    nowUnix: () => 1_750_000_000,
    resolveDelayFromReferer: () => 0,
  })
  const handler = handlers.get('**/rpc/purchase')
  assert.equal(typeof handler, 'function')

  return async function call(method, params = {}) {
    let responseBody = null
    const request = {
      postDataJSON: () => ({
        jsonrpc: '2.0',
        id: method,
        method,
        params,
      }),
    }
    await handler({
      request: () => request,
      fulfill: async ({ body }) => {
        responseBody = JSON.parse(body)
      },
    })
    return responseBody
  }
}

async function operationalFactMockHarness() {
  const handlers = new Map()
  const page = {
    async route(pattern, handler) {
      handlers.set(pattern, handler)
    },
  }
  await installFactRpcMocks(page, {
    adminProfile: {
      id: 1,
      is_super_admin: true,
      roles: [{ role_key: 'sales' }],
      permissions: ['stock.reservation.create'],
    },
    effectiveSession: null,
    nowUnix: () => 1_750_000_000,
    resolveDelayFromReferer: () => 0,
  })
  const handler = handlers.get('**/rpc/operational_fact')
  assert.equal(typeof handler, 'function')

  return async function call(method, params = {}) {
    let responseBody = null
    const request = {
      postDataJSON: () => ({
        jsonrpc: '2.0',
        id: method,
        method,
        params,
      }),
    }
    await handler({
      request: () => request,
      fulfill: async ({ body }) => {
        responseBody = JSON.parse(body)
      },
    })
    return responseBody
  }
}

async function qualityMockHarness() {
  const handlers = new Map()
  const page = {
    async route(pattern, handler) {
      handlers.set(pattern, handler)
    },
  }
  await installFactRpcMocks(page, {
    adminProfile: {
      id: 1,
      is_super_admin: true,
      roles: [{ role_key: 'quality' }],
      permissions: ['quality.inspection.read'],
    },
    effectiveSession: { actions: ['quality.inspection.read'] },
    nowUnix: () => 1_750_000_000,
    resolveDelayFromReferer: () => 0,
  })
  const handler = handlers.get('**/rpc/quality')
  assert.equal(typeof handler, 'function')

  return async function call(method, params = {}) {
    let responseBody = null
    await handler({
      request: () => ({
        postDataJSON: () => ({
          jsonrpc: '2.0',
          id: method,
          method,
          params,
        }),
      }),
      fulfill: async ({ body }) => {
        responseBody = JSON.parse(body)
      },
    })
    return responseBody
  }
}

test('style-l1 primary production draft has a canonical order source', async () => {
  const call = await operationalFactMockHarness()
  const response = await call('list_production_facts', {
    customer_key: 'yoyoosun',
    limit: 100,
    offset: 0,
  })
  assert.equal(response.result.code, 0)
  const draft = response.result.data.production_facts.find(
    (fact) => fact.fact_no === 'PROD-FACT-L1'
  )
  assert.equal(draft.status, 'DRAFT')
  assert.equal(draft.fact_type, 'FINISHED_GOODS_RECEIPT')
  assert.equal(draft.source_type, 'PRODUCTION_ORDER')
  assert.equal(draft.source_id, 71)
  assert.equal(draft.source_line_id, 7100)
})

test('style-l1 quality mock serves the strict outsourcing return read contract', async () => {
  const call = await qualityMockHarness()
  const valid = await call('list_outsourcing_return_quality_inspections', {
    customer_key: 'yoyoosun',
    fact_id: 3,
    limit: 50,
  })
  assert.equal(valid.result.code, 0)
  assert.equal(valid.result.data.quality_inspections.length, 1)
  assert.equal(valid.result.data.quality_inspections[0].source_id, 3)
  assert.equal(valid.result.data.quality_inspections[0].status, 'PASSED')
  assert.equal(valid.result.data.quality_inspections[0].result, 'PASS')

  const forged = await call('list_outsourcing_return_quality_inspections', {
    customer_key: 'yoyoosun',
    source_type: 'OUTSOURCING_FACT',
  })
  assert.equal(forged.result.code, 40010)
})

test('style-l1 quality lists preserve total while slicing requested pages', async () => {
  const call = await qualityMockHarness()
  const qualityPage = await call('list_quality_inspections', {
    limit: 1,
    offset: 1,
  })
  assert.equal(qualityPage.result.code, 0)
  assert.equal(qualityPage.result.data.total, 1)
  assert.equal(qualityPage.result.data.limit, 1)
  assert.equal(qualityPage.result.data.offset, 1)
  assert.deepEqual(qualityPage.result.data.quality_inspections, [])

  const outsourcingPage = await call(
    'list_outsourcing_return_quality_inspections',
    {
      customer_key: 'yoyoosun',
      fact_id: 3,
      limit: 1,
      offset: 1,
    }
  )
  assert.equal(outsourcingPage.result.code, 0)
  assert.equal(outsourcingPage.result.data.total, 1)
  assert.equal(outsourcingPage.result.data.limit, 1)
  assert.equal(outsourcingPage.result.data.offset, 1)
  assert.deepEqual(outsourcingPage.result.data.quality_inspections, [])
})

test('style-l1 purchase mock enforces retry-safe receipt mutations', async () => {
  const call = await purchaseMockHarness()
  const addParams = {
    receipt_id: 603,
    material_id: 1,
    warehouse_id: 1,
    unit_id: 1,
    lot_id: 401,
    quantity: '2.0000',
    idempotency_key: 'style-l1-add-receipt-item',
  }

  const missingKey = await call('add_purchase_receipt_item', {
    ...addParams,
    idempotency_key: '',
  })
  assert.equal(missingKey.result.code, 40010)

  const first = await call('add_purchase_receipt_item', addParams)
  const replay = await call('add_purchase_receipt_item', {
    idempotency_key: addParams.idempotency_key,
    quantity: addParams.quantity,
    lot_id: addParams.lot_id,
    unit_id: addParams.unit_id,
    warehouse_id: addParams.warehouse_id,
    material_id: addParams.material_id,
    receipt_id: addParams.receipt_id,
  })
  assert.equal(first.result.code, 0)
  assert.equal(
    replay.result.data.purchase_receipt_item.id,
    first.result.data.purchase_receipt_item.id
  )
  assert.equal(first.result.data.purchase_receipt_item.receipt_id, 603)

  const conflict = await call('add_purchase_receipt_item', {
    ...addParams,
    quantity: '3.0000',
  })
  assert.equal(conflict.result.code, 40920)

  const listed = await call('list_purchase_receipts')
  const draft = listed.result.data.purchase_receipts.find(
    (receipt) => receipt.id === 603
  )
  assert.equal(draft.items.length, 2)

  const createParams = {
    purchase_order_id: 7,
    receipt_no: 'IN-PO-7',
    warehouse_id: 1,
    received_at: '2026-07-14',
    idempotency_key: 'style-l1-create-receipt',
  }
  const created = await call(
    'create_purchase_receipt_from_purchase_order',
    createParams
  )
  const createdReplay = await call(
    'create_purchase_receipt_from_purchase_order',
    { ...createParams }
  )
  assert.equal(created.result.code, 0)
  assert.equal(
    createdReplay.result.data.purchase_receipt.id,
    created.result.data.purchase_receipt.id
  )
  assert.equal(created.result.data.purchase_receipt.items.length, 1)
})

test('style-l1 purchase exception lists preserve source filters and slices', async () => {
  const call = await purchaseMockHarness()
  for (const [method, recordKey] of [
    ['list_purchase_returns', 'purchase_returns'],
    ['list_purchase_receipt_adjustments', 'purchase_receipt_adjustments'],
  ]) {
    const firstPage = await call(method, {
      purchase_receipt_id: 601,
      limit: 1,
      offset: 0,
    })
    assert.equal(firstPage.result.code, 0)
    assert.equal(firstPage.result.data.total, 1)
    assert.equal(firstPage.result.data.limit, 1)
    assert.equal(firstPage.result.data.offset, 0)
    assert.equal(firstPage.result.data[recordKey].length, 1)

    const exhaustedPage = await call(method, {
      purchase_receipt_id: 601,
      limit: 1,
      offset: 1,
    })
    assert.equal(exhaustedPage.result.data.total, 1)
    assert.equal(exhaustedPage.result.data.offset, 1)
    assert.deepEqual(exhaustedPage.result.data[recordKey], [])

    const unrelatedPage = await call(method, {
      purchase_receipt_id: 999,
      limit: 200,
      offset: 0,
    })
    assert.equal(unrelatedPage.result.data.total, 0)
    assert.equal(unrelatedPage.result.data.limit, 200)
  }
})

test('style-l1 operational fact mock only accepts source-bound reservation fields', async () => {
  const call = await operationalFactMockHarness()
  const params = {
    customer_key: 'yoyoosun',
    reservation_no: 'RSV-SO-STYLE-L1',
    sales_order_id: 1,
    sales_order_item_id: 1,
    warehouse_id: 1,
    lot_id: 402,
    quantity: '2',
    reserved_at: '2026-07-14T08:00:00.000Z',
    note: '订单备货',
    idempotency_key: 'style-l1-sales-order-reservation',
  }

  const created = await call(
    'create_stock_reservation_from_sales_order',
    params
  )
  assert.equal(created.result.code, 0)
  assert.equal(created.result.data.stock_reservation.sales_order_id, 1)
  assert.equal(created.result.data.stock_reservation.product_id, 1)
  assert.equal(created.result.data.stock_reservation.unit_id, 1)

  const forged = await call('create_stock_reservation_from_sales_order', {
    ...params,
    product_id: 999,
  })
  assert.equal(forged.result.code, 40010)

  const retired = await call('create_stock_reservation', params)
  assert.equal(retired.result.code, 40010)
})

test('style-l1 shipment source candidates enforce remote query and paging params', async () => {
  const candidate = {
    sales_order_id: 7,
    order_no: 'SO-007',
    customer_snapshot: { code: 'C-008', name: '示例客户' },
    customer_name: '示例客户',
    sales_order_item_id: 31,
    product_code_snapshot: 'P-009',
    product_name_snapshot: '小熊',
    sku_code: '',
    sku_name: '',
  }
  assert.deepEqual(
    mockShipmentSourceCandidates({ keyword: '小熊', limit: 20, offset: 0 }, [
      candidate,
    ]),
    {
      shipment_source_candidates: [candidate],
      total: 1,
      limit: 20,
      offset: 0,
    }
  )
  assert.equal(
    styleRpcResult(mockShipmentSourceCandidates({ limit: 500 }, [candidate]))
      .code,
    40010
  )
  assert.equal(
    styleRpcResult(
      mockShipmentSourceCandidates({ unexpected: true }, [candidate])
    ).code,
    40010
  )
})

test('style-l1 operational fact mock serves the shipment source candidate RPC', async () => {
  const call = await operationalFactMockHarness()
  const result = await call('list_shipment_source_candidates', {
    keyword: 'SO-STYLE-L1',
    limit: 20,
    offset: 0,
  })
  assert.equal(result.result.code, 0)
  assert.equal(result.result.data.total, 21)
  assert.equal(result.result.data.shipment_source_candidates.length, 20)
  assert.equal(
    result.result.data.shipment_source_candidates[0].remaining_quantity,
    '10'
  )
  const secondPage = await call('list_shipment_source_candidates', {
    keyword: 'SO-STYLE-L1',
    limit: 20,
    offset: 20,
  })
  assert.equal(secondPage.result.code, 0)
  assert.equal(secondPage.result.data.shipment_source_candidates.length, 1)
  assert.equal(
    secondPage.result.data.shipment_source_candidates[0].sales_order_item_id,
    21
  )
  const invalid = await call('list_shipment_source_candidates', {
    limit: 500,
    offset: 0,
  })
  assert.equal(invalid.result.code, 40010)
})

test('style-l1 shipment draft cancellation is visible on the canonical reread', async () => {
  const call = await operationalFactMockHarness()
  const before = await call('get_shipment', { id: 1 })
  assert.equal(before.result.data.shipment.status, 'DRAFT')

  const cancelled = await call('cancel_shipment', { id: 1 })
  assert.equal(cancelled.result.data.shipment.status, 'CANCELLED')

  const reread = await call('list_shipments', { limit: 20, offset: 0 })
  assert.equal(reread.result.data.shipments[0].status, 'CANCELLED')
})

test('style-l1 production fact list preserves source filters, total and requested slices', async () => {
  const call = await operationalFactMockHarness()
  const firstPage = await call('list_production_facts', {
    limit: 1,
    offset: 0,
  })
  const secondPage = await call('list_production_facts', {
    limit: 1,
    offset: 1,
  })
  assert.ok(firstPage.result.data.total > 1)
  assert.equal(secondPage.result.data.total, firstPage.result.data.total)
  assert.equal(firstPage.result.data.limit, 1)
  assert.equal(secondPage.result.data.offset, 1)
  assert.equal(firstPage.result.data.production_facts.length, 1)
  assert.equal(secondPage.result.data.production_facts.length, 1)
  assert.notEqual(
    firstPage.result.data.production_facts[0].id,
    secondPage.result.data.production_facts[0].id
  )

  const unrelated = await call('list_production_facts', {
    source_type: 'PRODUCTION_ORDER',
    source_id: 999,
    limit: 200,
    offset: 0,
  })
  assert.equal(unrelated.result.data.total, 0)
  assert.equal(unrelated.result.data.limit, 200)
  assert.deepEqual(unrelated.result.data.production_facts, [])
})

test('style-l1 source aggregate mocks preserve full-read paging and source filters', async () => {
  const call = await operationalFactMockHarness()
  const shipments = await call('list_shipments', {
    source_id: 1,
    limit: 200,
    offset: 0,
  })
  assert.equal(shipments.result.code, 0)
  assert.equal(shipments.result.data.limit, 200)
  assert.equal(shipments.result.data.offset, 0)
  assert.equal(shipments.result.data.shipments.length, 1)

  const unrelatedShipments = await call('list_shipments', {
    source_id: 999,
    limit: 200,
    offset: 0,
  })
  assert.equal(unrelatedShipments.result.data.total, 0)

  const reservations = await call('list_stock_reservations', {
    source_id: 1,
    status: 'ACTIVE',
    limit: 200,
    offset: 0,
  })
  assert.equal(reservations.result.code, 0)
  assert.equal(reservations.result.data.limit, 200)
  assert.equal(reservations.result.data.offset, 0)
  assert.equal(reservations.result.data.stock_reservations.length, 1)

  const unrelatedReservations = await call('list_stock_reservations', {
    source_id: 999,
    status: 'ACTIVE',
    limit: 200,
    offset: 0,
  })
  assert.equal(unrelatedReservations.result.data.total, 0)
})

test('style-l1 inventory aggregate mocks use the shared paging response contract', () => {
  for (const [method, nextMethod, recordKey] of [
    ['list_inventory_balances', 'list_inventory_lots', 'inventory_balances'],
    ['list_inventory_txns', 'default:', 'inventory_txns'],
  ]) {
    const listCase = factMockSource.slice(
      factMockSource.indexOf(`case '${method}'`),
      factMockSource.indexOf(
        nextMethod.startsWith('list_') ? `case '${nextMethod}'` : nextMethod,
        factMockSource.indexOf(`case '${method}'`)
      )
    )
    assert.match(listCase, /stylePaginatedRpcData/u)
    assert.match(listCase, new RegExp(`'${recordKey}'`, 'u'))
    assert.match(listCase, /params/u)
  }
})

test('style-l1 operational fact mock enforces production requirement and issue allowlists', async () => {
  const call = await operationalFactMockHarness()
  const requirements = await call(
    'list_production_order_material_requirements',
    { customer_key: 'yoyoosun', production_order_id: 71 }
  )
  assert.equal(requirements.result.code, 0)
  assert.equal(requirements.result.data.material_requirements.length, 1)
  assert.equal(
    requirements.result.data.material_requirements[0].remaining_quantity,
    '8.000000'
  )

  const params = {
    customer_key: 'yoyoosun',
    fact_no: 'PROD-MI-STYLE-L1',
    production_order_id: 71,
    production_order_item_id: 7101,
    production_order_material_requirement_id: 7201,
    warehouse_id: 1,
    lot_id: 403,
    quantity: '3',
    occurred_at: '2026-07-14T08:00:00.000Z',
    note: '首批领料',
    idempotency_key: 'style-l1-production-material-issue',
  }
  const created = await call(
    'create_production_material_issue_from_order',
    params
  )
  assert.equal(created.result.code, 0)
  assert.equal(created.result.data.production_fact.subject_id, 1)
  assert.equal(created.result.data.production_fact.unit_id, 1)
  assert.equal(created.result.data.production_fact.source_line_id, 7201)

  for (const derivedField of [
    'material_id',
    'unit_id',
    'subject_type',
    'subject_id',
    'source_type',
    'source_id',
    'source_line_id',
  ]) {
    const forged = await call('create_production_material_issue_from_order', {
      ...params,
      [derivedField]: derivedField.endsWith('_type') ? 'FORGED' : 999,
    })
    assert.equal(forged.result.code, 40010, derivedField)
  }

  const forgedList = await call('list_production_order_material_requirements', {
    production_order_id: 71,
    material_id: 1,
  })
  assert.equal(forgedList.result.code, 40010)
})

test('style-l1 operational fact mock enforces production completion lot intent', async () => {
  const call = await operationalFactMockHarness()
  const params = {
    customer_key: 'yoyoosun',
    fact_no: 'PROD-FG-STYLE-L1',
    production_order_id: 71,
    production_order_item_id: 7101,
    warehouse_id: 1,
    new_lot_no: 'PROD-NEW-LOT-REREAD-L1',
    quantity: '2',
    occurred_at: '2026-07-14T08:00:00.000Z',
    note: '首批完工',
    idempotency_key: 'style-l1-production-completion',
  }

  const ambiguous = await call(
    'create_production_completion_from_order',
    params
  )
  assert.equal(ambiguous.result.code, 0)
  assert.equal(ambiguous.result.data.production_fact, null)

  const listed = await call('list_production_facts', {
    customer_key: 'yoyoosun',
    source_type: 'PRODUCTION_ORDER',
    source_id: 71,
    source_line_id: 7101,
    limit: 100,
    offset: 0,
  })
  assert.equal(listed.result.code, 0)
  const reread = listed.result.data.production_facts.find(
    (fact) => fact.idempotency_key === params.idempotency_key
  )
  assert.equal(reread.fact_type, 'FINISHED_GOODS_RECEIPT')
  assert.equal(reread.lot_id, 480)

  const replay = await call('create_production_completion_from_order', params)
  assert.equal(replay.result.code, 0)
  assert.equal(replay.result.data.production_fact.id, reread.id)

  const bothLots = await call('create_production_completion_from_order', {
    ...params,
    idempotency_key: 'style-l1-production-completion-both-lots',
    lot_id: 402,
  })
  assert.equal(bothLots.result.code, 40010)

  const missingLot = await call('create_production_completion_from_order', {
    ...params,
    idempotency_key: 'style-l1-production-completion-missing-lot',
    new_lot_no: undefined,
  })
  assert.equal(missingLot.result.code, 40010)

  const changedIntent = await call('create_production_completion_from_order', {
    ...params,
    quantity: '3',
  })
  assert.equal(changedIntent.result.code, 40010)
})

test('style-l1 operational fact mock enforces source-bound production rework', async () => {
  const call = await operationalFactMockHarness()
  const listedSources = await call('list_production_facts', {
    customer_key: 'yoyoosun',
    limit: 100,
    offset: 0,
  })
  const source = listedSources.result.data.production_facts.find(
    (fact) => fact.fact_no === 'PROD-FG-POSTED-L1'
  )
  assert.equal(source.status, 'POSTED')
  assert.equal(source.fact_type, 'FINISHED_GOODS_RECEIPT')

  const params = {
    customer_key: 'yoyoosun',
    fact_no: 'RW-PROD-FG-POSTED-L1',
    source_completion_fact_id: source.id,
    quantity: '2',
    occurred_at: '2026-07-14T08:00:00.000Z',
    reason: 'STYLE-L1-REWORK-REREAD',
    idempotency_key: 'style-l1-production-rework',
  }
  const ambiguous = await call(
    'create_production_rework_from_completion',
    params
  )
  assert.equal(ambiguous.result.code, 0)
  assert.equal(ambiguous.result.data.production_fact, null)

  const reread = await call('list_production_facts', {
    customer_key: 'yoyoosun',
    source_type: 'PRODUCTION_FACT',
    source_id: source.id,
    limit: 100,
    offset: 0,
  })
  const created = reread.result.data.production_facts.find(
    (fact) => fact.idempotency_key === params.idempotency_key
  )
  assert.equal(created.fact_type, 'REWORK')
  assert.equal(created.status, 'DRAFT')
  assert.equal(created.source_id, source.id)
  assert.equal(created.lot_id, source.lot_id)

  const replay = await call('create_production_rework_from_completion', params)
  assert.equal(replay.result.code, 0)
  assert.equal(replay.result.data.production_fact.id, created.id)

  for (const forbidden of [
    'subject_id',
    'warehouse_id',
    'lot_id',
    'source_type',
    'source_id',
    'note',
  ]) {
    const forged = await call('create_production_rework_from_completion', {
      ...params,
      idempotency_key: `style-l1-production-rework-${forbidden}`,
      [forbidden]: 999,
    })
    assert.equal(forged.result.code, 40010, forbidden)
  }

  const changedIntent = await call('create_production_rework_from_completion', {
    ...params,
    quantity: '3',
  })
  assert.equal(changedIntent.result.code, 40010)
})

test('style-l1 operational fact mock only accepts source-bound outsourcing fields', async () => {
  const call = await operationalFactMockHarness()
  const base = {
    customer_key: 'yoyoosun',
    fact_no: 'OUT-MI-STYLE-L1',
    outsourcing_order_id: 1,
    outsourcing_order_item_id: 11,
    warehouse_id: 1,
    lot_id: 401,
    quantity: '2',
    occurred_at: '2026-07-14T08:00:00.000Z',
    note: '委外备料',
    idempotency_key: 'style-l1-outsourcing-source-fact',
  }

  const materialIssue = await call(
    'create_outsourcing_material_issue_from_order',
    base
  )
  assert.equal(materialIssue.result.code, 0)
  assert.equal(
    materialIssue.result.data.outsourcing_fact.fact_type,
    'MATERIAL_ISSUE'
  )
  assert.equal(materialIssue.result.data.outsourcing_fact.source_line_id, 11)

  const returnReceipt = await call(
    'create_outsourcing_return_receipt_from_order',
    {
      ...base,
      fact_no: 'OUT-RR-STYLE-L1',
      outsourcing_order_item_id: 12,
      lot_id: 402,
      idempotency_key: 'style-l1-outsourcing-return-receipt',
    }
  )
  assert.equal(returnReceipt.result.code, 0)
  assert.equal(
    returnReceipt.result.data.outsourcing_fact.subject_type,
    'PRODUCT'
  )
  assert.equal(returnReceipt.result.data.outsourcing_fact.product_sku_id, 201)
  assert.equal(materialIssue.result.data.outsourcing_fact.product_sku_id, null)

  const postedMaterialIssue = await call('post_outsourcing_fact', {
    customer_key: 'yoyoosun',
    id: materialIssue.result.data.outsourcing_fact.id,
  })
  assert.equal(postedMaterialIssue.result.code, 0)
  assert.equal(
    postedMaterialIssue.result.data.outsourcing_fact.status,
    'POSTED'
  )
  const materialIssueReread = await call('list_outsourcing_facts', {
    customer_key: 'yoyoosun',
    source_type: 'OUTSOURCING_ORDER',
    source_id: 1,
    source_line_id: 11,
    limit: 100,
    offset: 0,
  })
  assert.equal(
    materialIssueReread.result.data.outsourcing_facts.find(
      (fact) => fact.id === materialIssue.result.data.outsourcing_fact.id
    )?.status,
    'POSTED'
  )

  const voidedReturnReceipt = await call('cancel_outsourcing_fact', {
    customer_key: 'yoyoosun',
    id: returnReceipt.result.data.outsourcing_fact.id,
  })
  assert.equal(voidedReturnReceipt.result.code, 0)
  assert.equal(
    voidedReturnReceipt.result.data.outsourcing_fact.status,
    'CANCELLED'
  )
  const returnReceiptReread = await call('list_outsourcing_facts', {
    customer_key: 'yoyoosun',
    source_type: 'OUTSOURCING_ORDER',
    source_id: 1,
    source_line_id: 12,
    limit: 100,
    offset: 0,
  })
  assert.equal(
    returnReceiptReread.result.data.outsourcing_facts.find(
      (fact) => fact.id === returnReceipt.result.data.outsourcing_fact.id
    )?.status,
    'CANCELLED'
  )

  const changedIntent = await call(
    'create_outsourcing_return_receipt_from_order',
    {
      ...base,
      fact_no: 'OUT-RR-CONFLICT-L1',
      outsourcing_order_item_id: 12,
    }
  )
  assert.equal(changedIntent.result.code, 40010)
  assert.equal(
    changedIntent.result.data?.outsourcing_fact?.fact_type,
    undefined,
    '同一请求标识不得把委外发料伪装成回货成功'
  )

  const newLotParams = {
    ...base,
    fact_no: 'OUT-RR-NEW-LOT-L1',
    outsourcing_order_item_id: 12,
    lot_id: undefined,
    new_lot_no: 'OUT-NEW-LOT-REREAD-L1',
    idempotency_key: 'style-l1-outsourcing-return-new-lot',
  }
  const ambiguousNewLot = await call(
    'create_outsourcing_return_receipt_from_order',
    newLotParams
  )
  assert.equal(ambiguousNewLot.result.code, 0)
  assert.equal(ambiguousNewLot.result.data.outsourcing_fact, null)
  const listed = await call('list_outsourcing_facts', {
    customer_key: 'yoyoosun',
    source_type: 'OUTSOURCING_ORDER',
    source_id: 1,
    source_line_id: 12,
    limit: 100,
    offset: 0,
  })
  const reread = listed.result.data.outsourcing_facts.find(
    (fact) => fact.idempotency_key === newLotParams.idempotency_key
  )
  assert.equal(reread.fact_type, 'RETURN_RECEIPT')
  assert.equal(reread.lot_id, 482)

  const forged = await call('create_outsourcing_material_issue_from_order', {
    ...base,
    subject_id: 999,
  })
  assert.equal(forged.result.code, 40010)

  const missingReturnLot = await call(
    'create_outsourcing_return_receipt_from_order',
    { ...base, lot_id: undefined }
  )
  assert.equal(missingReturnLot.result.code, 40010)

  const bothReturnLots = await call(
    'create_outsourcing_return_receipt_from_order',
    {
      ...newLotParams,
      idempotency_key: 'style-l1-outsourcing-return-both-lots',
      lot_id: 402,
    }
  )
  assert.equal(bothReturnLots.result.code, 40010)

  const materialIssueNewLot = await call(
    'create_outsourcing_material_issue_from_order',
    {
      ...base,
      idempotency_key: 'style-l1-outsourcing-material-new-lot',
      lot_id: undefined,
      new_lot_no: 'MAT-NEW-NOT-ALLOWED',
    }
  )
  assert.equal(materialIssueNewLot.result.code, 40010)

  const missingIdempotencyKey = await call(
    'create_outsourcing_material_issue_from_order',
    { ...base, idempotency_key: '' }
  )
  assert.equal(missingIdempotencyKey.result.code, 40010)

  const retired = await call('create_outsourcing_fact', base)
  assert.equal(retired.result.code, 40010)
})

test('style-l1 operational fact mock enforces strict finance source commands', async () => {
  const call = await operationalFactMockHarness()
  const common = {
    customer_key: 'yoyoosun',
    fact_no: 'AP-SOURCE-L1',
    occurred_at: '2026-07-14T08:00:00.000Z',
    note: '来源核对',
    idempotency_key: 'style-l1-finance-source',
  }

  const receivable = await call('create_receivable_from_shipment', {
    ...common,
    fact_no: 'AR-SHIP-L1',
    shipment_id: 1,
  })
  assert.equal(receivable.result.code, 0)
  assert.equal(receivable.result.data.finance_fact.fact_type, 'RECEIVABLE')
  assert.equal(receivable.result.data.finance_fact.source_type, 'SHIPMENT')

  const invoice = await call('create_invoice_from_shipment', {
    ...common,
    fact_no: 'INV-SHIP-L1',
    shipment_id: 1,
    invoice_category: 'VAT_SPECIAL_13',
  })
  assert.equal(invoice.result.code, 0)
  assert.equal(invoice.result.data.finance_fact.fact_type, 'INVOICE')
  assert.equal(invoice.result.data.finance_fact.source_type, 'SHIPMENT')
  assert.equal(
    invoice.result.data.finance_fact.invoice_category,
    'VAT_SPECIAL_13'
  )

  const invoiceWithoutCategory = await call('create_invoice_from_shipment', {
    ...common,
    fact_no: 'INV-SHIP-NO-CATEGORY-L1',
    shipment_id: 1,
  })
  assert.equal(invoiceWithoutCategory.result.code, 40010)

  const receivableWithCategory = await call('create_receivable_from_shipment', {
    ...common,
    fact_no: 'AR-SHIP-WITH-CATEGORY-L1',
    shipment_id: 1,
    invoice_category: 'VAT_SPECIAL_13',
  })
  assert.equal(receivableWithCategory.result.code, 40010)

  const purchase = await call('create_payable_from_purchase_receipt', {
    ...common,
    purchase_receipt_id: 601,
  })
  assert.equal(purchase.result.code, 0)
  assert.equal(
    purchase.result.data.finance_fact.source_type,
    'PURCHASE_RECEIPT'
  )

  const outsourcing = await call('create_payable_from_outsourcing_return', {
    ...common,
    fact_no: 'AP-OUT-RR-L1',
    outsourcing_fact_id: 3,
  })
  assert.equal(outsourcing.result.code, 0)
  assert.equal(
    outsourcing.result.data.finance_fact.source_type,
    'OUTSOURCING_FACT'
  )

  const reconciliation = await call('create_reconciliation_from_finance_fact', {
    ...common,
    fact_no: 'REC-AR-L1',
    finance_fact_id: 1,
  })
  assert.equal(reconciliation.result.code, 0)
  assert.equal(
    reconciliation.result.data.finance_fact.fact_type,
    'RECONCILIATION'
  )

  for (const [method, sourceKey, sourceID, extra] of [
    ['create_receivable_from_shipment', 'shipment_id', 1, {}],
    [
      'create_invoice_from_shipment',
      'shipment_id',
      1,
      { invoice_category: 'VAT_SPECIAL_13' },
    ],
    ['create_payable_from_purchase_receipt', 'purchase_receipt_id', 601, {}],
    ['create_payable_from_outsourcing_return', 'outsourcing_fact_id', 3, {}],
    ['create_reconciliation_from_finance_fact', 'finance_fact_id', 1, {}],
  ]) {
    const forged = await call(method, {
      ...common,
      [sourceKey]: sourceID,
      ...extra,
      amount: '999999',
    })
    assert.equal(forged.result.code, 40010, method)
  }
})

test('style-l1 operational fact mock retires generic fact creation methods', async () => {
  const call = await operationalFactMockHarness()
  for (const method of [
    'create_production_fact',
    'create_outsourcing_fact',
    'create_finance_fact',
  ]) {
    const retired = await call(method)
    assert.equal(retired.result.code, 40010, method)
    assert.match(retired.result.message, new RegExp(method, 'u'))
  }
})

test('style-l1 workflow mock keeps explain_action_access params canonical', async () => {
  const call = await workflowMockHarness()
  const unknownMethod = await call('unknown_workflow_method')
  assert.equal(unknownMethod.result.code, 40010)
  assert.match(unknownMethod.result.message, /unknown_workflow_method/u)
  const validCreateParams = {
    task_code: 'STYLE-L1-CREATE-REQUIRED',
    task_group: 'workflow-contract',
    task_name: '创建合同必填测试',
    source_type: 'workflow-contract',
    source_id: 10,
    owner_role_key: 'sales',
  }
  const beforeInvalidCreates = await call('list_tasks', {
    source_type: 'workflow-contract',
  })
  const beforeInvalidCreateCount = beforeInvalidCreates.result.data.total
  for (const key of [
    'idempotency_key',
    'expected_version',
    'command_key',
    'intent_hash',
    'customer_key',
    'unexpected',
  ]) {
    const invalidCreate = await call('create_task', {
      task_code: `STYLE-L1-CREATE-STRICT-${key}`,
      task_group: 'workflow-contract',
      task_name: '创建合同测试',
      source_type: 'workflow-contract',
      source_id: 1,
      task_status_key: 'ready',
      owner_role_key: 'sales',
      [key]: 'non-contract-value',
    })
    assert.equal(invalidCreate.result.code, 40010)
    assert.equal(
      invalidCreate.result.message,
      '任务资料包含无法识别的内容，请刷新后重试'
    )
    assert.doesNotMatch(invalidCreate.result.message, new RegExp(key, 'u'))
  }
  for (const params of [
    {},
    { task_code: 'ONLY-CODE' },
    {
      task_code: 'INVALID-SOURCE-ID',
      task_group: 'workflow-contract',
      task_name: '创建合同测试',
      source_type: 'workflow-contract',
      source_id: 0,
      owner_role_key: 'sales',
    },
    {
      task_code: 'INVALID-STATUS',
      task_group: 'workflow-contract',
      task_name: '创建合同测试',
      source_type: 'workflow-contract',
      source_id: 1,
      task_status_key: 'unknown',
      owner_role_key: 'sales',
    },
  ]) {
    const invalidCreate = await call('create_task', params)
    assert.equal(invalidCreate.result.code, 40010)
  }
  for (const requiredKey of [
    'task_code',
    'task_group',
    'task_name',
    'source_type',
    'source_id',
    'owner_role_key',
  ]) {
    const params = { ...validCreateParams }
    delete params[requiredKey]
    const invalidCreate = await call('create_task', params)
    assert.equal(invalidCreate.result.code, 40010)
  }
  for (const requiredStringKey of [
    'task_code',
    'task_group',
    'task_name',
    'source_type',
    'owner_role_key',
  ]) {
    const invalidCreate = await call('create_task', {
      ...validCreateParams,
      [requiredStringKey]: '   ',
    })
    assert.equal(invalidCreate.result.code, 40010)
  }
  for (const invalidSourceID of [0, -1, 1.5, '1']) {
    const invalidCreate = await call('create_task', {
      ...validCreateParams,
      source_id: invalidSourceID,
    })
    assert.equal(invalidCreate.result.code, 40010)
  }
  for (const invalidDueAt of [
    { not: 'unix' },
    '1800000000',
    1.5,
    0,
    -1,
    9_224_318_016_000,
  ]) {
    const invalidCreate = await call('create_task', {
      ...validCreateParams,
      due_at: invalidDueAt,
    })
    assert.equal(invalidCreate.result.code, 40010)
  }
  const afterInvalidCreates = await call('list_tasks', {
    source_type: 'workflow-contract',
  })
  assert.equal(afterInvalidCreates.result.data.total, beforeInvalidCreateCount)

  const defaultStatusCreated = await call('create_task', validCreateParams)
  assert.equal(defaultStatusCreated.result.code, 0)
  assert.equal(defaultStatusCreated.result.data.task.task_status_key, 'ready')

  const created = await call('create_task', {
    task_code: 'STYLE-L1-EXPLAIN-CONTRACT',
    task_group: 'workflow-contract',
    task_name: '动作权限合同测试',
    source_type: 'workflow-contract',
    source_id: 1,
    task_status_key: 'ready',
    owner_role_key: 'sales',
  })
  assert.equal(created.result.code, 0)
  const taskID = created.result.data.task.id

  const paddedStatusAction = await call('complete_task_action', {
    task_id: taskID,
    expected_version: 1,
    idempotency_key: 'style-l1-padded-complete',
    action_key: ' complete ',
  })
  assert.equal(paddedStatusAction.result.code, 40010)
  const paddedUrgeAction = await call('urge_task', {
    task_id: taskID,
    expected_version: 1,
    idempotency_key: 'style-l1-padded-urge',
    action: ' urge_task ',
    reason: '请尽快处理',
  })
  assert.equal(paddedUrgeAction.result.code, 40010)

  const allActions = await call('explain_action_access', { task_id: taskID })
  assert.equal(allActions.result.code, 0)
  assert.deepEqual(
    allActions.result.data.actions.map((item) => item.action_key),
    ['complete', 'block', 'reject', 'resume', 'urge']
  )
  assert.equal(
    allActions.result.data.actions.find((item) => item.action_key === 'reject')
      .required_permission,
    'workflow.task.reject'
  )
  assert.equal(
    allActions.result.data.actions.find((item) => item.action_key === 'urge')
      .status_key,
    ''
  )

  for (const actionKey of ['complete', 'block', 'reject', 'resume', 'urge']) {
    const exact = await call('explain_action_access', {
      task_id: taskID,
      action_key: actionKey,
    })
    assert.equal(exact.result.code, 0)
    assert.equal(exact.result.data.action.action_key, actionKey)
  }

  for (const params of [
    { id: taskID },
    { task_id: taskID, action: 'complete' },
    { task_id: taskID, action_key: '' },
    { task_id: taskID, action_key: '   ' },
    { task_id: taskID, action_key: 1 },
    { task_id: taskID, action_key: ' complete ' },
    { task_id: taskID, action_key: 'done' },
    { task_id: taskID, action_key: 'blocked' },
    { task_id: taskID, action_key: 'rejected' },
    { task_id: taskID, action_key: 'urge_task' },
    { task_id: taskID, action_key: 'escalate' },
    { task_id: taskID, action_key: 'complete', unknown: true },
  ]) {
    const invalid = await call('explain_action_access', params)
    assert.equal(invalid.result.code, 40010)
  }

  const completed = await call('complete_task_action', {
    task_id: taskID,
    expected_version: 1,
    idempotency_key: 'style-l1-terminal-explain',
    action_key: 'complete',
    payload: {},
  })
  assert.equal(completed.result.code, 0)

  const terminalActions = await call('explain_action_access', {
    task_id: taskID,
  })
  assert.equal(terminalActions.result.code, 0)
  for (const action of terminalActions.result.data.actions) {
    assert.equal(action.allowed, false)
    assert.equal(action.reason_code, 'terminal_task')
    assert.equal(action.reason, '该任务已结束，只能查看任务详情。')
  }
})

test('style-l1 workflow mock rejects source-produced task groups and code namespaces', async () => {
  const call = await workflowMockHarness()
  for (const [taskGroup, taskCode] of [
    ['production_scheduling', 'STYLE-L1-MANUAL-SCHEDULING'],
    ['production_exception', 'STYLE-L1-MANUAL-EXCEPTION'],
    ['shipment_release', 'STYLE-L1-MANUAL-SHIPMENT'],
    ['trial_pmc_work', 'source-production-scheduling-71'],
    ['trial_production_work', 'source-production-exception-81'],
    ['trial_warehouse_work', 'source-shipment-release-92'],
  ]) {
    const rejected = await call('create_task', {
      task_code: taskCode,
      task_group: taskGroup,
      task_name: '不允许手工伪造来源任务',
      source_type: 'trial-workflow',
      source_id: 1,
      owner_role_key: 'warehouse',
    })
    assert.equal(rejected.result.code, 40010, `${taskGroup}/${taskCode}`)
    assert.equal(
      rejected.result.message,
      '该类任务由业务单据自动生成，不能手工创建'
    )
  }
  const listed = await call('list_tasks', { limit: 50, offset: 0 })
  assert.equal(listed.result.code, 0)
  assert.equal(listed.result.data.total, 0)
})

test('style-l1 workflow source task fixtures inject all formal producer contracts directly', async () => {
  const fixtures = [
    createWorkflowSourceTaskFixture({
      taskGroup: 'production_scheduling',
      sourceID: 71,
      taskID: 971,
      sourceNo: 'MO-STYLE-L1-71',
      intentHash: '6'.repeat(64),
    }),
    createWorkflowSourceTaskFixture({
      taskGroup: 'production_exception',
      sourceID: 81,
      taskID: 981,
      sourceNo: 'RW-STYLE-L1-81',
      intentHash: '7'.repeat(64),
    }),
    createWorkflowSourceTaskFixture({
      taskGroup: 'shipment_release',
      sourceID: 92,
      taskID: 992,
      sourceNo: 'SHIP-STYLE-L1-92',
      intentHash: '8'.repeat(64),
    }),
  ]
  const call = await workflowMockHarness(undefined, {
    workflowTaskFixtures: fixtures,
  })
  const listed = await call('list_tasks', { limit: 50, offset: 0 })
  assert.equal(listed.result.code, 0)
  assert.equal(listed.result.data.total, 3)
  assert.deepEqual(
    listed.result.data.tasks.map((task) => ({
      code: task.task_code,
      group: task.task_group,
      sourceType: task.source_type,
      owner: task.owner_role_key,
      contract: task.payload.source_task_contract,
      producer: task.payload.source_task_producer,
      intent: task.payload.source_task_intent_hash,
    })),
    [
      {
        code: 'source-production-scheduling-71',
        group: 'production_scheduling',
        sourceType: 'production-orders',
        owner: 'pmc',
        contract: 'workflow.source-task/v1',
        producer: 'production_order.release',
        intent: '6'.repeat(64),
      },
      {
        code: 'source-production-exception-81',
        group: 'production_exception',
        sourceType: 'production-progress',
        owner: 'production',
        contract: 'workflow.source-task/v1',
        producer: 'production_rework.post',
        intent: '7'.repeat(64),
      },
      {
        code: 'source-shipment-release-92',
        group: 'shipment_release',
        sourceType: 'shipments',
        owner: 'warehouse',
        contract: 'workflow.source-task/v1',
        producer: 'shipment.submit_release',
        intent: '8'.repeat(64),
      },
    ]
  )
})

test('style-l1 workflow assignment mock keeps operator authority separate from eligible recipients', async () => {
  const task = {
    id: 875,
    task_code: 'STYLE-L1-ASSIGNMENT-875',
    task_group: 'workflow-contract',
    task_name: '仓库请假转交',
    source_type: 'workflow-contract',
    source_id: 875,
    source_no: 'ASSIGN-875',
    task_status_key: 'ready',
    owner_role_key: 'warehouse',
    assignee_id: null,
    version: 1,
    payload: { source_snapshot: 'unchanged' },
  }
  const call = await workflowMockHarness(
    {
      id: 1,
      is_super_admin: true,
      roles: [{ role_key: 'boss' }],
      permissions: ['workflow.task.read', 'workflow.task.assign'],
      effective_session: {
        actions: ['workflow.task.read', 'workflow.task.assign'],
        workflow_visible_owner_role_keys_by_capability: workflowScopes(
          'warehouse',
          ['workflow.task.read']
        ),
      },
    },
    {
      workflowTaskFixtures: [task],
      workflowAssignmentCandidates: [
        {
          admin_id: 901,
          username: 'super-without-warehouse-role',
          role_keys: ['admin'],
          permissions: [
            'workflow.task.read',
            'workflow.task.update',
            'workflow.task.complete',
          ],
        },
        {
          admin_id: 902,
          username: 'disabled-warehouse',
          disabled: true,
          role_keys: ['warehouse'],
          permissions: [
            'workflow.task.read',
            'workflow.task.update',
            'workflow.task.complete',
          ],
        },
        {
          admin_id: 903,
          username: 'eligible-warehouse',
          role_keys: ['warehouse'],
          permissions: [
            'workflow.task.read',
            'workflow.task.update',
            'workflow.task.complete',
          ],
        },
        {
          admin_id: 904,
          username: 'readonly-warehouse',
          role_keys: ['warehouse'],
          permissions: ['workflow.task.read'],
        },
      ],
    }
  )

  const options = await call('get_task_assignment_options', { task_id: 875 })
  assert.equal(options.result.code, 0)
  assert.equal(options.result.data.assignment.can_reassign, true)
  assert.equal(options.result.data.assignment.can_return_to_pool, false)
  assert.deepEqual(
    options.result.data.assignment.candidates.map(
      (candidate) => candidate.admin_id
    ),
    [903],
    '超级管理员本身没有仓库岗位时不能自动成为接收人'
  )

  const params = {
    task_id: 875,
    expected_version: 1,
    idempotency_key: 'style-l1-assignment-875',
    assignee_id: 903,
    reason: '原处理人请假',
  }
  const assigned = await call('reassign_task', params)
  assert.equal(assigned.result.code, 0)
  assert.equal(assigned.result.data.task.assignee_id, 903)
  assert.equal(assigned.result.data.task.version, 2)
  assert.equal(assigned.result.data.task.task_status_key, 'ready')
  assert.deepEqual(assigned.result.data.task.payload, task.payload)

  const replayed = await call('reassign_task', params)
  assert.equal(replayed.result.code, 0)
  assert.equal(replayed.result.data.task.version, 2)

  const assignedOptions = await call('get_task_assignment_options', {
    task_id: 875,
  })
  assert.equal(assignedOptions.result.data.assignment.can_return_to_pool, true)
  assert.deepEqual(assignedOptions.result.data.assignment.candidates, [])

  const released = await call('reassign_task', {
    task_id: 875,
    expected_version: 2,
    idempotency_key: 'style-l1-assignment-release-875',
    assignee_id: null,
    reason: '退回仓库岗位待办池',
  })
  assert.equal(released.result.code, 0)
  assert.equal(Number(released.result.data.task.assignee_id || 0), 0)
  assert.equal(released.result.data.task.version, 3)
  assert.equal(released.result.data.task.task_status_key, 'ready')
  assert.deepEqual(released.result.data.task.payload, task.payload)
})

test('style-l1 workflow role task view mock applies role, view and cursor boundaries', async () => {
  const call = await workflowMockHarness()
  const createTask = (params) =>
    call('create_task', {
      task_group: 'workflow-contract',
      source_type: 'workflow-contract',
      priority: 1,
      ...params,
    })

  const todoA = await createTask({
    task_code: 'STYLE-L1-ROLE-TODO-A',
    task_name: '销售待办 A',
    source_id: 101,
    task_status_key: 'ready',
    owner_role_key: 'sales',
  })
  const todoRisk = await createTask({
    task_code: 'STYLE-L1-ROLE-RISK',
    task_name: '销售风险任务',
    source_id: 102,
    task_status_key: 'ready',
    owner_role_key: 'sales',
    priority: 3,
  })
  const historyCreated = await createTask({
    task_code: 'STYLE-L1-ROLE-HISTORY',
    task_name: '销售已办任务',
    source_id: 103,
    task_status_key: 'ready',
    owner_role_key: 'sales',
  })
  const history = await call('complete_task_action', {
    task_id: historyCreated.result.data.task.id,
    expected_version: 1,
    idempotency_key: 'style-l1-role-history',
    action_key: 'complete',
  })
  assert.equal(history.result.code, 0)
  await createTask({
    task_code: 'STYLE-L1-ROLE-OTHER',
    task_name: '老板已办任务',
    source_id: 104,
    task_status_key: 'ready',
    owner_role_key: 'boss',
  })

  const firstTodoPage = await call('list_role_tasks', {
    view_key: 'todo',
    role_key: 'sales',
    limit: 1,
  })
  assert.equal(firstTodoPage.result.code, 0)
  assert.equal(firstTodoPage.result.data.items.length, 1)
  assert.equal(
    firstTodoPage.result.data.items[0].id,
    todoRisk.result.data.task.id
  )
  assert.equal(firstTodoPage.result.data.has_more, true)
  assert.equal(typeof firstTodoPage.result.data.next_cursor, 'string')
  assert.equal(firstTodoPage.result.data.server_time, 1_750_000_000)

  const secondTodoPage = await call('list_role_tasks', {
    view_key: 'todo',
    role_key: 'sales',
    limit: 1,
    cursor: firstTodoPage.result.data.next_cursor,
  })
  assert.deepEqual(
    secondTodoPage.result.data.items.map((task) => task.id),
    [todoA.result.data.task.id]
  )
  assert.equal(secondTodoPage.result.data.has_more, false)
  assert.equal(secondTodoPage.result.data.next_cursor, '')
  assert.equal(
    secondTodoPage.result.data.server_time,
    firstTodoPage.result.data.server_time
  )

  const riskPage = await call('list_role_tasks', {
    view_key: 'risk',
    role_key: 'sales',
    limit: 50,
  })
  assert.deepEqual(
    riskPage.result.data.items.map((task) => task.id),
    [todoRisk.result.data.task.id]
  )

  const historyPage = await call('list_role_tasks', {
    view_key: 'history',
    role_key: 'sales',
    limit: 50,
  })
  assert.deepEqual(
    historyPage.result.data.items.map((task) => task.id),
    [history.result.data.task.id]
  )
})

test('style-l1 workflow mock serves the dedicated task board projection', async () => {
  const call = await workflowMockHarness()
  for (let index = 1; index <= 10; index += 1) {
    const created = await call('create_task', {
      task_code: `STYLE-L1-BOARD-${index}`,
      task_group: 'trial_warehouse_work',
      task_name: `任务看板分页 ${index}`,
      source_type: 'shipping-release',
      source_id: index,
      task_status_key: 'ready',
      owner_role_key: 'sales',
    })
    assert.equal(created.result.code, 0)
  }

  const overview = await call('get_task_board', { limit: 5, offset: 0 })
  assert.equal(overview.result.code, 0)
  assert.equal(overview.result.data.total, 10)
  assert.deepEqual(overview.result.data.counts, {
    actionable: 10,
    exception: 0,
    due: 0,
    finished: 0,
  })
  assert.equal(overview.result.data.lanes.length, 4)
  assert.equal(overview.result.data.lanes[0].tasks.length, 5)

  const focused = await call('get_task_board', {
    lane_key: 'actionable',
    limit: 8,
    offset: 8,
  })
  assert.equal(focused.result.code, 0)
  assert.equal(focused.result.data.lanes.length, 1)
  assert.equal(focused.result.data.lanes[0].total, 10)
  assert.equal(focused.result.data.lanes[0].tasks.length, 2)
})

test('style-l1 workflow explain mock fails closed on permission and owner mismatch', async () => {
  const missingPermissionCall = await workflowMockHarness({
    id: 2,
    is_super_admin: false,
    roles: [{ role_key: 'sales' }],
    permissions: ['workflow.task.read', 'workflow.task.create'],
    effective_session: {
      actions: ['workflow.task.read', 'workflow.task.create'],
      workflow_visible_owner_role_keys_by_capability: workflowScopes('sales', [
        'workflow.task.read',
        'workflow.task.create',
      ]),
    },
  })
  const missingPermissionTask = await missingPermissionCall('create_task', {
    task_code: 'STYLE-L1-MISSING-PERMISSION',
    task_group: 'workflow-contract',
    task_name: '权限缺失测试',
    source_type: 'workflow-contract',
    source_id: 2,
    task_status_key: 'ready',
    owner_role_key: 'sales',
  })
  const deniedByPermission = await missingPermissionCall(
    'explain_action_access',
    { task_id: missingPermissionTask.result.data.task.id }
  )
  assert.equal(
    deniedByPermission.result.data.actions.find(
      (item) => item.action_key === 'complete'
    ).reason_code,
    'missing_permission'
  )
  assert.equal(
    deniedByPermission.result.data.actions.some((item) => item.allowed),
    false
  )

  const wrongOwnerCall = await workflowMockHarness({
    id: 3,
    is_super_admin: false,
    roles: [{ role_key: 'purchase' }],
    permissions: [
      'workflow.task.read',
      'workflow.task.create',
      'workflow.task.complete',
      'workflow.task.update',
      'workflow.task.reject',
    ],
    effective_session: {
      actions: [
        'workflow.task.read',
        'workflow.task.create',
        'workflow.task.complete',
        'workflow.task.update',
        'workflow.task.reject',
      ],
      workflow_visible_owner_role_keys_by_capability: {
        'workflow.task.read': ['sales'],
        'workflow.task.create': ['purchase'],
        'workflow.task.complete': ['purchase'],
        'workflow.task.update': ['purchase'],
        'workflow.task.reject': ['purchase'],
      },
    },
  })
  const wrongOwnerTask = await wrongOwnerCall('create_task', {
    task_code: 'STYLE-L1-WRONG-OWNER',
    task_group: 'workflow-contract',
    task_name: '责任角色不匹配测试',
    source_type: 'workflow-contract',
    source_id: 3,
    task_status_key: 'ready',
    owner_role_key: 'sales',
  })
  const deniedByOwner = await wrongOwnerCall('explain_action_access', {
    task_id: wrongOwnerTask.result.data.task.id,
  })
  assert.equal(
    deniedByOwner.result.data.actions.find(
      (item) => item.action_key === 'complete'
    ).reason_code,
    'not_owner_or_assignee'
  )
  assert.equal(
    deniedByOwner.result.data.actions.some((item) => item.allowed),
    false
  )
  for (const action of deniedByOwner.result.data.actions) {
    assert.equal(action.owner_role_matched, false)
    assert.equal(action.work_pool_role_matched, false)
    assert.equal(action.work_pool_entitlement_matched, false)
    assert.equal(action.work_pool_entitlement_scope_matched, false)
  }

  const missingEffectiveActionCall = await workflowMockHarness({
    id: 4,
    is_super_admin: false,
    roles: [{ role_key: 'sales' }],
    permissions: [
      'workflow.task.read',
      'workflow.task.create',
      'workflow.task.complete',
      'workflow.task.update',
      'workflow.task.reject',
    ],
    effective_session: {
      actions: ['workflow.task.read', 'workflow.task.create'],
      workflow_visible_owner_role_keys_by_capability: workflowScopes('sales', [
        'workflow.task.read',
        'workflow.task.create',
      ]),
    },
  })
  const missingEffectiveActionTask = await missingEffectiveActionCall(
    'create_task',
    {
      task_code: 'STYLE-L1-MISSING-EFFECTIVE-SESSION',
      task_group: 'workflow-contract',
      task_name: '生效权限缺失测试',
      source_type: 'workflow-contract',
      source_id: 4,
      task_status_key: 'ready',
      owner_role_key: 'sales',
    }
  )
  const deniedByEffectiveSession = await missingEffectiveActionCall(
    'explain_action_access',
    { task_id: missingEffectiveActionTask.result.data.task.id }
  )
  assert.equal(
    deniedByEffectiveSession.result.data.actions.some((item) => item.allowed),
    false
  )
  for (const action of deniedByEffectiveSession.result.data.actions) {
    assert.equal(action.allowed, false)
    assert.equal(
      action.reason_code,
      action.action_key === 'resume'
        ? 'status_transition_not_allowed'
        : 'missing_permission'
    )
  }
})

test('style-l1 workflow mutation routes enforce the same permission, owner and assignee decisions', async () => {
  const ownerCall = await workflowMockHarness({
    id: 7,
    is_super_admin: false,
    roles: [{ role_key: 'warehouse' }],
    permissions: [
      'workflow.task.read',
      'workflow.task.create',
      'workflow.task.complete',
    ],
    effective_session: {
      actions: [
        'workflow.task.read',
        'workflow.task.create',
        'workflow.task.complete',
      ],
      workflow_visible_owner_role_keys_by_capability: workflowScopes(
        'warehouse',
        ['workflow.task.read', 'workflow.task.create', 'workflow.task.complete']
      ),
    },
  })
  const assignedOther = await ownerCall('create_task', {
    task_code: 'STYLE-L1-ASSIGNED-OTHER',
    task_group: 'workflow-contract',
    task_name: '已指派给其他人',
    source_type: 'workflow-contract',
    source_id: 71,
    task_status_key: 'ready',
    owner_role_key: 'warehouse',
    assignee_id: 99,
  })
  const visibleAssignedOther = await ownerCall('list_tasks', {
    source_id: 71,
  })
  assert.equal(visibleAssignedOther.result.data.total, 1)
  const deniedAssignedOther = await ownerCall('complete_task_action', {
    task_id: assignedOther.result.data.task.id,
    expected_version: 1,
    idempotency_key: 'style-l1-assigned-other-complete',
    action_key: 'complete',
  })
  assert.equal(deniedAssignedOther.result.code, 40010)

  const assignedSelf = await ownerCall('create_task', {
    task_code: 'STYLE-L1-ASSIGNED-SELF',
    task_group: 'workflow-contract',
    task_name: '已指派给当前处理人',
    source_type: 'workflow-contract',
    source_id: 72,
    task_status_key: 'ready',
    owner_role_key: 'sales',
    assignee_id: 7,
  })
  const allowedAssignedSelf = await ownerCall('complete_task_action', {
    task_id: assignedSelf.result.data.task.id,
    expected_version: 1,
    idempotency_key: 'style-l1-assigned-self-complete',
    action_key: 'complete',
  })
  assert.equal(allowedAssignedSelf.result.code, 0)

  const superCall = await workflowMockHarness({
    id: 8,
    is_super_admin: true,
    roles: [{ role_key: 'finance' }],
    permissions: [],
    effective_session: {
      actions: [
        'workflow.task.read',
        'workflow.task.create',
        'workflow.task.complete',
        'workflow.task.update',
      ],
      workflow_visible_owner_role_keys_by_capability: workflowScopes(
        'finance',
        [
          'workflow.task.read',
          'workflow.task.create',
          'workflow.task.complete',
          'workflow.task.update',
        ]
      ),
    },
  })
  const warehouseTask = await superCall('create_task', {
    task_code: 'STYLE-L1-SUPER-NON-OWNER',
    task_group: 'workflow-contract',
    task_name: 'super admin 非责任岗位',
    source_type: 'workflow-contract',
    source_id: 73,
    task_status_key: 'ready',
    owner_role_key: 'warehouse',
  })
  const deniedSuperComplete = await superCall('complete_task_action', {
    task_id: warehouseTask.result.data.task.id,
    expected_version: 1,
    idempotency_key: 'style-l1-super-non-owner-complete',
    action_key: 'complete',
  })
  assert.equal(deniedSuperComplete.result.code, 40010)
  const allowedSuperUrge = await superCall('urge_task', {
    task_id: warehouseTask.result.data.task.id,
    expected_version: 1,
    idempotency_key: 'style-l1-super-urge',
    action: 'urge_task',
    reason: '请尽快处理',
  })
  assert.equal(allowedSuperUrge.result.code, 0)
})

test('style-l1 workflow approval completion uses the explicit approve capability', async () => {
  const approvalFixture = (id) => ({
    id,
    task_code: `STYLE-L1-APPROVAL-${id}`,
    task_group: 'order_approval',
    task_name: '订单审批',
    source_type: 'project-orders',
    source_id: id,
    task_status_key: 'ready',
    owner_role_key: 'boss',
    required_capability_key: 'workflow.task.approve',
    version: 1,
    payload: {},
  })
  const approveOnlyCall = await workflowMockHarness(
    {
      id: 9,
      is_super_admin: false,
      roles: [{ role_key: 'boss' }],
      permissions: ['workflow.task.create', 'workflow.task.approve'],
      effective_session: {
        actions: ['workflow.task.create', 'workflow.task.approve'],
        workflow_visible_owner_role_keys_by_capability: workflowScopes('boss', [
          'workflow.task.create',
          'workflow.task.approve',
        ]),
      },
    },
    { workflowTaskFixtures: [approvalFixture(81)] }
  )
  const allowed = await approveOnlyCall('complete_task_action', {
    task_id: 81,
    expected_version: 1,
    idempotency_key: 'style-l1-boss-approve-only',
    action_key: 'complete',
  })
  assert.equal(allowed.result.code, 0)

  const completeOnlyCall = await workflowMockHarness(
    {
      id: 10,
      is_super_admin: false,
      roles: [{ role_key: 'boss' }],
      permissions: ['workflow.task.create', 'workflow.task.complete'],
      effective_session: {
        actions: ['workflow.task.create', 'workflow.task.complete'],
        workflow_visible_owner_role_keys_by_capability: workflowScopes('boss', [
          'workflow.task.create',
          'workflow.task.complete',
        ]),
      },
    },
    { workflowTaskFixtures: [approvalFixture(82)] }
  )
  const denied = await completeOnlyCall('complete_task_action', {
    task_id: 82,
    expected_version: 1,
    idempotency_key: 'style-l1-boss-complete-only',
    action_key: 'complete',
  })
  assert.equal(denied.result.code, 40010)
})

test('style-l1 workflow process context mock returns only visible task runtime truth', async () => {
  const task = {
    id: 83,
    task_code: 'STYLE-L1-PROCESS-CONTEXT-83',
    task_group: 'engineering_data',
    task_name: '工程资料',
    source_type: 'sales_order',
    source_id: 83,
    source_no: 'SO-L1-83',
    task_status_key: 'ready',
    owner_role_key: 'sales',
    required_capability_key: 'workflow.task.complete',
    process_instance_id: 830,
    process_node_instance_id: 831,
    version: 1,
    payload: {},
  }
  const processContext = {
    source: { type: 'sales_order', id: 83, no: 'SO-L1-83' },
    process_instance: {
      id: 830,
      process_key: 'sales_order_acceptance',
      process_version: 'v1',
      status: 'active',
      started_at: 1_750_000_000,
      completed_at: null,
    },
    nodes: [
      {
        id: 831,
        process_instance_id: 830,
        node_key: 'engineering_data',
        node_type: 'human_task',
        attempt: 1,
        status: 'active',
        outcome: '',
      },
    ],
    current_nodes: [
      {
        id: 831,
        process_instance_id: 830,
        node_key: 'engineering_data',
        node_type: 'human_task',
        attempt: 1,
        status: 'active',
        outcome: '',
      },
    ],
    completed_nodes: [],
  }
  const call = await workflowMockHarness(undefined, {
    workflowTaskFixtures: [task],
    workflowProcessContextFixtures: [{ taskID: 83, processContext }],
  })

  const visible = await call('get_task_process_context', { task_id: 83 })
  assert.equal(visible.result.code, 0)
  assert.deepEqual(visible.result.data.process_context, processContext)

  const missing = await call('get_task_process_context', { task_id: 84 })
  assert.equal(missing.result.code, 40010)
  assert.deepEqual(missing.result.data, {})
})

test('style-l1 workflow mutations replay exact receipts before terminal and CAS checks', async () => {
  const cases = [
    {
      method: 'complete_task_action',
      actionKey: 'complete',
      extra: {},
    },
    {
      method: 'block_task_action',
      actionKey: 'block',
      extra: { reason: '等待资料' },
    },
    {
      method: 'reject_task_action',
      actionKey: 'reject',
      extra: { reason: '资料不完整' },
    },
    {
      method: 'urge_task',
      actionKey: null,
      extra: { action: 'urge_task', reason: '请尽快处理' },
    },
  ]

  for (const [index, item] of cases.entries()) {
    const call = await workflowMockHarness()
    const created = await call('create_task', {
      task_code: `STYLE-L1-REPLAY-${index}`,
      task_group: 'workflow-contract',
      task_name: `精确重放 ${item.method}`,
      source_type: 'workflow-contract',
      source_id: 900 + index,
      task_status_key: 'ready',
      owner_role_key: 'sales',
    })
    const params = {
      task_id: created.result.data.task.id,
      expected_version: 1,
      idempotency_key: `style-l1-replay-${item.method}`,
      ...(item.actionKey ? { action_key: item.actionKey } : {}),
      ...item.extra,
    }
    const first = await call(item.method, params)
    assert.equal(first.result.code, 0, item.method)
    if (item.method === 'urge_task') {
      assert.equal(first.result.data.task.urge_count, 1)
      assert.equal(first.result.data.task.last_urged_by, 1)
      assert.equal(first.result.data.task.last_urged_by_role_key, 'sales')
      assert(
        Number.isSafeInteger(first.result.data.task.last_urged_at) &&
          first.result.data.task.last_urged_at > 0
      )
    }
    const replay = await call(item.method, {
      ...params,
      expected_version: 999,
    })
    assert.equal(replay.result.code, 0, item.method)
    assert.deepEqual(
      replay.result.data.task,
      first.result.data.task,
      item.method
    )
  }
})

test('style-l1 workflow resume is a reasoned blocked-to-ready mutation with exact replay', async () => {
  const call = await workflowMockHarness()
  const created = await call('create_task', {
    task_code: 'STYLE-L1-RESUME-REPLAY',
    task_group: 'workflow-contract',
    task_name: '解除阻塞精确重放',
    source_type: 'workflow-contract',
    source_id: 905,
    task_status_key: 'ready',
    owner_role_key: 'sales',
  })
  const blocked = await call('block_task_action', {
    task_id: created.result.data.task.id,
    expected_version: 1,
    idempotency_key: 'style-l1-resume-precondition',
    action_key: 'block',
    reason: '等待客户补齐资料',
  })
  assert.equal(blocked.result.code, 0)
  assert.equal(blocked.result.data.task.task_status_key, 'blocked')

  const params = {
    task_id: created.result.data.task.id,
    expected_version: blocked.result.data.task.version,
    idempotency_key: 'style-l1-resume-replay',
    action_key: 'resume',
    reason: '客户资料已经补齐',
  }
  const resumed = await call('resume_task_action', params)
  assert.equal(resumed.result.code, 0)
  assert.equal(resumed.result.data.task.task_status_key, 'ready')
  assert.equal(resumed.result.data.task.blocked_reason, '')

  const replay = await call('resume_task_action', {
    ...params,
    expected_version: 999,
  })
  assert.equal(replay.result.code, 0)
  assert.deepEqual(replay.result.data.task, resumed.result.data.task)

  const changedIntent = await call('resume_task_action', {
    ...params,
    reason: '另一个解除说明',
  })
  assert.equal(changedIntent.result.code, 40920)

  const newIntentAfterReady = await call('resume_task_action', {
    ...params,
    idempotency_key: 'style-l1-resume-new-intent',
  })
  assert.equal(newIntentAfterReady.result.code, 40010)
})

test('style-l1 workflow mutation accepts action capability without read capability', async () => {
  const admin = {
    id: 12,
    is_super_admin: false,
    roles: [{ role_key: 'warehouse' }],
    permissions: ['workflow.task.create', 'workflow.task.complete'],
    effective_session: {
      actions: ['workflow.task.create', 'workflow.task.complete'],
      workflow_visible_owner_role_keys_by_capability: workflowScopes(
        'warehouse',
        ['workflow.task.create', 'workflow.task.complete']
      ),
    },
  }
  const call = await workflowMockHarness(admin)
  const created = await call('create_task', {
    task_code: 'STYLE-L1-ACTION-ONLY',
    task_group: 'workflow-contract',
    task_name: '动作权限独立于读取权限',
    source_type: 'workflow-contract',
    source_id: 990,
    task_status_key: 'ready',
    owner_role_key: 'warehouse',
  })
  admin.permissions = ['workflow.task.complete']
  admin.effective_session.actions = ['workflow.task.complete']
  admin.effective_session.workflow_visible_owner_role_keys_by_capability =
    workflowScopes('warehouse', ['workflow.task.complete'])

  const hidden = await call('list_tasks', { source_id: 990 })
  assert.equal(hidden.result.code, 40010)
  const completed = await call('complete_task_action', {
    task_id: created.result.data.task.id,
    expected_version: 1,
    idempotency_key: 'style-l1-action-only-complete',
    action_key: 'complete',
  })
  assert.equal(completed.result.code, 0)
})
