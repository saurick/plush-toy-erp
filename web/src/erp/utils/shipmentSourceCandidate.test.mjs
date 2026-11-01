import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeShipmentSourceCandidate,
  loadShipmentSourceSelection,
  shipmentSourceCandidateListParams,
  shipmentSourceOrderFromCandidate,
  validateShipmentSourceCandidatePage,
} from './shipmentSourceCandidate.mjs'

test('shipment filtered selection reads complete scoped pages and normalizes every source line', async () => {
  const requests = []
  const data = Array.from({ length: 205 }, (_, index) => candidate({ sales_order_item_id: index + 1, line_no: index + 1 }))
  const params = shipmentSourceCandidateListParams({ salesOrderID: 7, customerID: 8, selectable: true, keyword: '小熊', page: 2 })
  const rows = await loadShipmentSourceSelection(async (query) => {
    requests.push(query)
    return { shipment_source_candidates: data.slice(query.offset, query.offset + query.limit), total: 205, limit: query.limit, offset: query.offset }
  }, params, { signal: new AbortController().signal, expectedTotal: 205 })
  assert.deepEqual(requests.map((query) => query.offset), [0, 200])
  assert.equal(requests.every((query) => query.sales_order_id === 7 && query.customer_id === 8 && query.selectable && query.keyword === '小熊'), true)
  assert.equal(rows.length, 205)
  assert.equal(rows.at(-1).id, 205)
  assert.equal(rows.at(-1).remainingQuantity, '11.5')
  assert.equal(rows.at(-1).disabledReason, '')
})

test('shipment filtered selection rejects unscoped, ineligible, mixed, incomplete or changed batches', async () => {
  const base = { sales_order_id: 7, customer_id: 8, selectable: true }
  const options = { signal: new AbortController().signal, expectedTotal: 1 }
  let calls = 0
  const listPage = async (query, records = [candidate()]) => {
    calls++
    return { shipment_source_candidates: records, total: records.length, limit: query.limit, offset: query.offset }
  }
  for (const params of [{ ...base, sales_order_id: undefined }, { ...base, selectable: false }]) {
    await assert.rejects(loadShipmentSourceSelection(listPage, params, options), { isInvalidResponse: true })
  }
  assert.equal(calls, 0)
  for (const overrides of [{ sales_order_id: 9 }, { customer_id: 9 }, { selectable: false }]) {
    await assert.rejects(loadShipmentSourceSelection((query) => listPage(query, [candidate(overrides)]), base, options), { isInvalidResponse: true })
  }
  await assert.rejects(loadShipmentSourceSelection(listPage, base, { ...options, expectedTotal: 2 }), { isInvalidResponse: true })
  await assert.rejects(loadShipmentSourceSelection(async (query) => ({ shipment_source_candidates: [], total: 2, limit: query.limit, offset: query.offset }), base, { ...options, expectedTotal: 2 }), { isInvalidResponse: true })
})

test('shipment filtered selection ignores a late batch after cancellation', async () => {
  const request = new AbortController()
  const rows = await loadShipmentSourceSelection(async (query) => {
    request.abort()
    return { shipment_source_candidates: [candidate()], total: 1, limit: query.limit, offset: query.offset }
  }, { sales_order_id: 7, selectable: true }, { signal: request.signal, expectedTotal: 1 })
  assert.deepEqual(rows, [])
})

function candidate(overrides = {}) {
  return {
    sales_order_id: 7,
    order_no: 'SO-007',
    order_status: 'active',
    order_version: 3,
    currency: 'USD',
    customer_id: 8,
    customer_snapshot: { code: 'C-008', name: '示例客户' },
    delivery_snapshot: {
      country_region: '中国',
      recipient: '王女士',
      phone: '13800000000',
      address: '上海测试仓 1 号',
    },
    customer_name: '当前客户名称',
    sales_order_item_id: 31,
    line_no: 1,
    line_status: 'open',
    product_id: 9,
    product_code: 'P-CURRENT-009',
    product_name: '当前产品名称',
    product_code_snapshot: 'P-009',
    product_name_snapshot: '小熊',
    product_sku_id: 10,
    sku_code: 'SKU-010',
    sku_name: '棕色',
    unit_id: 2,
    unit_code: 'PCS',
    unit_name: '个',
    ordered_quantity: '20',
    shipped_quantity: '8.5',
    remaining_quantity: '11.5',
    selectable: true,
    disabled_reason: '',
    ...overrides,
  }
}

test('source filters preserve exact customer/order and both eligibility values', () => {
  for (const selectable of [true, false]) {
    assert.deepEqual(shipmentSourceCandidateListParams({ customerID: 8, salesOrderID: 7, selectable, page: 2 }),
      { customer_id: 8, sales_order_id: 7, selectable, limit: 20, offset: 20 })
  }
  assert.deepEqual(shipmentSourceCandidateListParams({}), { limit: 20, offset: 0 })
})

test('shipment source candidate request maps search and server page exactly', () => {
  assert.deepEqual(
    shipmentSourceCandidateListParams({
      keyword: '  SO-007  ',
      page: 3,
      pageSize: 20,
      salesOrderID: '7',
    }),
    { keyword: 'SO-007', sales_order_id: 7, limit: 20, offset: 40 }
  )
  assert.throws(
    () => shipmentSourceCandidateListParams({ page: 1, pageSize: 201 }),
    /分页参数不合法/u
  )
  assert.throws(
    () =>
      shipmentSourceCandidateListParams({
        page: Number.MAX_SAFE_INTEGER,
        pageSize: 200,
      }),
    /分页参数不合法/u
  )
  assert.throws(
    () => shipmentSourceCandidateListParams({ keyword: '😀'.repeat(129) }),
    /不能超过 128 个字符/u
  )
  assert.equal(
    shipmentSourceCandidateListParams({ keyword: '😀'.repeat(128) }).keyword,
    '😀'.repeat(128)
  )
})

test('shipment source candidate page accepts complete middle and last pages', () => {
  const middleRows = Array.from({ length: 20 }, (_, index) =>
    candidate({ sales_order_item_id: index + 1 })
  )
  assert.equal(
    validateShipmentSourceCandidatePage(
      {
        shipment_source_candidates: middleRows,
        total: 50,
        limit: 20,
        offset: 0,
      },
      { limit: 20, offset: 0 }
    ).total,
    50
  )
  assert.equal(
    validateShipmentSourceCandidatePage(
      {
        shipment_source_candidates: [candidate({ sales_order_item_id: 41 })],
        total: 41,
        limit: 20,
        offset: 40,
      },
      { limit: 20, offset: 40 }
    ).total,
    41
  )
})

test('shipment source candidate quantities are checked as exact numeric(20,6)', () => {
  const exact = candidate({
    ordered_quantity: '99999999999999.999999',
    shipped_quantity: '99999999999999.999998',
    remaining_quantity: '0.000001',
  })
  assert.equal(
    validateShipmentSourceCandidatePage(
      {
        shipment_source_candidates: [exact],
        total: 1,
        limit: 20,
        offset: 0,
      },
      { limit: 20, offset: 0 }
    ).total,
    1
  )
  assert.equal(
    normalizeShipmentSourceCandidate(exact).remainingQuantity,
    '0.000001'
  )
  assert.throws(
    () =>
      validateShipmentSourceCandidatePage(
        {
          shipment_source_candidates: [
            candidate({
              ordered_quantity: '2e1',
              shipped_quantity: '8.5',
              remaining_quantity: '11.5',
            }),
          ],
          total: 1,
          limit: 20,
          offset: 0,
        },
        { limit: 20, offset: 0 }
      ),
    (error) => error?.isInvalidResponse === true
  )
})

test('shipment source candidate accepts backend disabled-reason precedence', () => {
  for (const row of [
    candidate({
      line_status: 'closed',
      shipped_quantity: '21',
      remaining_quantity: '0',
      selectable: false,
      disabled_reason: 'line_not_open',
    }),
    candidate({
      shipped_quantity: '21',
      remaining_quantity: '0',
      selectable: false,
      disabled_reason: 'source_mismatch',
    }),
    candidate({
      shipped_quantity: '21',
      remaining_quantity: '0',
      selectable: false,
      disabled_reason: 'shipped_quantity_exceeded',
    }),
    candidate({
      shipped_quantity: '20',
      remaining_quantity: '0',
      selectable: false,
      disabled_reason: 'fully_shipped',
    }),
  ]) {
    assert.equal(
      validateShipmentSourceCandidatePage(
        {
          shipment_source_candidates: [row],
          total: 1,
          limit: 20,
          offset: 0,
        },
        { limit: 20, offset: 0 }
      ).total,
      1
    )
  }
})

test('shipment source candidate rejects reasons that violate backend precedence', () => {
  for (const row of [
    candidate({
      line_status: 'closed',
      selectable: false,
      disabled_reason: 'fully_shipped',
    }),
    candidate({
      shipped_quantity: '21',
      remaining_quantity: '0',
      selectable: false,
      disabled_reason: 'fully_shipped',
    }),
    candidate({
      shipped_quantity: '20',
      remaining_quantity: '0',
      selectable: false,
      disabled_reason: 'shipped_quantity_exceeded',
    }),
  ]) {
    assert.throws(
      () =>
        validateShipmentSourceCandidatePage(
          {
            shipment_source_candidates: [row],
            total: 1,
            limit: 20,
            offset: 0,
          },
          { limit: 20, offset: 0 }
        ),
      (error) => error?.isInvalidResponse === true
    )
  }
})

test('shipment source candidate accepts missing historical snapshots with current display truth', () => {
  for (const customerSnapshot of [{}, null]) {
    const withoutSnapshots = candidate({
      customer_snapshot: customerSnapshot,
      delivery_snapshot: null,
      product_code_snapshot: null,
      product_name_snapshot: null,
    })
    assert.equal(
      validateShipmentSourceCandidatePage(
        {
          shipment_source_candidates: [withoutSnapshots],
          total: 1,
          limit: 20,
          offset: 0,
        },
        { limit: 20, offset: 0 }
      ).total,
      1
    )
  }
})

test('shipment source candidate page fails closed on truncated totals and invalid rows', () => {
  for (const data of [
    {
      shipment_source_candidates: [candidate()],
      total: 50,
      limit: 20,
      offset: 0,
    },
    {
      shipment_source_candidates: [
        candidate({ shipped_quantity: '21', remaining_quantity: '0' }),
      ],
      total: 1,
      limit: 20,
      offset: 0,
    },
    {
      shipment_source_candidates: [candidate({ remaining_quantity: '12' })],
      total: 1,
      limit: 20,
      offset: 0,
    },
    {
      shipment_source_candidates: [candidate({ order_status: 'closed' })],
      total: 1,
      limit: 20,
      offset: 0,
    },
    {
      shipment_source_candidates: [candidate({ currency: 'EUR' })],
      total: 1,
      limit: 20,
      offset: 0,
    },
    {
      shipment_source_candidates: [candidate({ currency: ' usd ' })],
      total: 1,
      limit: 20,
      offset: 0,
    },
    {
      shipment_source_candidates: [
        candidate({ ordered_quantity: '-1', remaining_quantity: '0' }),
      ],
      total: 1,
      limit: 20,
      offset: 0,
    },
    {
      shipment_source_candidates: [
        candidate({ shipped_quantity: '-1', remaining_quantity: '21' }),
      ],
      total: 1,
      limit: 20,
      offset: 0,
    },
    {
      shipment_source_candidates: [
        candidate({
          selectable: false,
          disabled_reason: 'unknown_reason',
        }),
      ],
      total: 1,
      limit: 20,
      offset: 0,
    },
    {
      shipment_source_candidates: [
        candidate(),
        candidate({ sales_order_id: 9 }),
      ],
      total: 2,
      limit: 20,
      offset: 0,
    },
    {
      shipment_source_candidates: [
        candidate({ selectable: false, disabled_reason: '' }),
      ],
      total: 1,
      limit: 20,
      offset: 0,
    },
    {
      shipment_source_candidates: [candidate({ sales_order_id: 1.5 })],
      total: 1,
      limit: 20,
      offset: 0,
    },
    {
      shipment_source_candidates: [
        candidate({ product_id: Number.MAX_SAFE_INTEGER + 1 }),
      ],
      total: 1,
      limit: 20,
      offset: 0,
    },
  ]) {
    assert.throws(
      () => validateShipmentSourceCandidatePage(data, { limit: 20, offset: 0 }),
      (error) => error?.isInvalidResponse === true
    )
  }
})

test('shipment source candidate normalization keeps backend quantity truth and snapshots', () => {
  const normalized = normalizeShipmentSourceCandidate(candidate())
  assert.equal(normalized.id, 31)
  assert.equal(normalized.orderedQuantity, '20')
  assert.equal(normalized.shippedQuantity, '8.5')
  assert.equal(normalized.remainingQuantity, '11.5')
  assert.equal(normalized.disabledReason, '')
  assert.deepEqual(shipmentSourceOrderFromCandidate(normalized), {
    id: 7,
    order_no: 'SO-007',
    lifecycle_status: 'active',
    version: 3,
    currency: 'USD',
    customer_id: 8,
    customer_snapshot: { code: 'C-008', name: '示例客户' },
    customer_name: '当前客户名称',
    delivery_snapshot: {
      country_region: '中国',
      recipient: '王女士',
      phone: '13800000000',
      address: '上海测试仓 1 号',
    },
  })
  assert.equal(
    normalizeShipmentSourceCandidate(
      candidate({
        selectable: false,
        disabled_reason: 'fully_shipped',
        remaining_quantity: '0',
      })
    ).disabledReason,
    '已全部确认出货'
  )
})

test('source filter options use the complete eligibility scope and preserve only the current empty scope as disabled context', async () => {
  const { shipmentSourceFilterOptions, validateShipmentSourceOrderOptions } = await import('./shipmentSourceCandidate.mjs')
  const orders = [
    { sales_order_id: 7, order_no: 'SO-007', customer_id: 8, customer_code: 'CUS-8', customer_name: '客户甲', customer_name_snapshot: '下单时客户甲' },
    { sales_order_id: 9, order_no: 'SO-009', customer_id: 10, customer_code: 'CUS-10', customer_name: '客户乙', customer_name_snapshot: '' },
    { sales_order_id: 11, order_no: 'SO-011', customer_id: 8, customer_code: 'CUS-8', customer_name: '客户甲', customer_name_snapshot: '' },
  ]
  assert.equal(validateShipmentSourceOrderOptions(orders), orders)
  const options = shipmentSourceFilterOptions(orders, { customerID: 8 })
  assert.deepEqual(options.customers.map((option) => option.value), [8, 10])
  assert.deepEqual(options.orders.map((option) => option.value), [7, 11])
  assert.equal(options.orders[0].label, 'SO-007 · 下单时客户甲')
  const empty = shipmentSourceFilterOptions([], {
    customerID: 8,
    salesOrderID: 7,
    customerOptions: options.customers,
    salesOrderOptions: options.orders,
  })
  assert.deepEqual(empty.customers, [{ ...options.customers[0], disabled: true }])
  assert.deepEqual(empty.orders, [{ ...options.orders[0], disabled: true }])
  for (const invalid of [undefined, {}, [orders[0], orders[0]], [{ ...orders[0], customer_id: 0 }], [{ ...orders[0], customer_name: '' }]]) {
    assert.throws(() => validateShipmentSourceOrderOptions(invalid), /不完整/u)
  }
})
