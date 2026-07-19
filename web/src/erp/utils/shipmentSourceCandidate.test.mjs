import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeShipmentSourceCandidate,
  shipmentSourceCandidateListParams,
  shipmentSourceOrderFromCandidate,
  validateShipmentSourceCandidatePage,
} from './shipmentSourceCandidate.mjs'

function candidate(overrides = {}) {
  return {
    sales_order_id: 7,
    order_no: 'SO-007',
    order_status: 'active',
    order_version: 3,
    customer_id: 8,
    customer_snapshot: { code: 'C-008', name: '示例客户' },
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
    customer_id: 8,
    customer_snapshot: { code: 'C-008', name: '示例客户' },
    customer_name: '当前客户名称',
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
