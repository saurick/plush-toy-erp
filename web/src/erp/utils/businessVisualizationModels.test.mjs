import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildFinanceDueModel,
  buildInventoryDistributionModel,
  buildProductionOrderOverviewModel,
  buildProductionProcessModel,
  buildPurchaseArrivalModel,
  buildSalesDeliveryModel,
  moveMonthKey,
} from './businessVisualizationModels.mjs'

const unix = (date) => Date.parse(`${date}T00:00:00Z`) / 1000

test('sales delivery keeps unknown shipment facts explicit and sorts risks first', () => {
  const model = buildSalesDeliveryModel(
    [
      {
        id: 1,
        sales_order_id: 10,
        order_no: 'SO-DELIVERED',
        ordered_quantity: '10',
        shipped_quantity: '10',
        unshipped_quantity: '0',
        planned_delivery_date: unix('2026-09-25'),
        lifecycle_status: 'active',
        line_status: 'open',
        unit_name: '只',
      },
      {
        id: 2,
        sales_order_id: 11,
        order_no: 'SO-UNKNOWN',
        ordered_quantity: '10',
        shipped_quantity: null,
        unshipped_quantity: null,
        planned_delivery_date: unix('2026-09-20'),
        lifecycle_status: 'active',
        line_status: 'open',
        unit_name: '只',
      },
      {
        id: 3,
        sales_order_id: 12,
        order_no: 'SO-OVERDUE',
        ordered_quantity: '10',
        shipped_quantity: '4',
        unshipped_quantity: '6',
        planned_delivery_date: unix('2026-09-20'),
        lifecycle_status: 'active',
        line_status: 'open',
        unit_name: '只',
      },
    ],
    { today: '2026-09-22' }
  )

  assert.deepEqual(
    model.rows.map((row) => row.orderNo),
    ['SO-OVERDUE', 'SO-UNKNOWN', 'SO-DELIVERED']
  )
  const unknown = model.rows.find((row) => row.status.key === 'unknown')
  const overdue = model.rows.find((row) => row.status.key === 'overdue')
  assert.equal(unknown.percent, null)
  assert.equal(overdue.percent, 40)
  assert.equal(model.counts.overdue, 1)
  assert.equal(model.counts.delivered, 1)
})

test('purchase arrival uses supplier confirmation before expected date and builds a monday calendar', () => {
  const model = buildPurchaseArrivalModel(
    [
      {
        id: 1,
        purchase_order_no: 'PO-1',
        lifecycle_status: 'approved',
        supplier_confirmed_arrival_date: unix('2026-09-24'),
        expected_arrival_date: unix('2026-09-30'),
        supplier_snapshot: { name: '示例供应商' },
      },
      {
        id: 2,
        purchase_order_no: 'PO-2',
        lifecycle_status: 'approved',
      },
    ],
    { today: '2026-09-22', monthKey: '2026-09' }
  )

  const confirmed = model.rows.find((row) => row.id === 1)
  assert.equal(confirmed.arrivalDate, '2026-09-24')
  assert.equal(confirmed.dateSource, 'confirmed')
  assert.equal(model.days[0].dateKey, '2026-08-31')
  assert.equal(
    model.days.find((day) => day.dateKey === '2026-09-24').items.length,
    1
  )
  assert.equal(model.unscheduled.length, 1)
  assert.equal(moveMonthKey('2026-12', 1), '2027-01')
})

test('finance due uses outstanding facts without combining currencies', () => {
  const model = buildFinanceDueModel(
    [
      {
        id: 1,
        fact_no: 'AR-1',
        fact_type: 'RECEIVABLE',
        status: 'POSTED',
        amount: '100',
        outstanding_amount: '40',
        currency: 'CNY',
        due_at: unix('2026-09-20'),
      },
      {
        id: 2,
        fact_no: 'AP-1',
        fact_type: 'PAYABLE',
        status: 'SETTLED',
        amount: '20',
        outstanding_amount: '0',
        currency: 'USD',
        due_at: unix('2026-09-30'),
      },
    ],
    { today: '2026-09-22' }
  )

  assert.equal(model.rows[0].dueStatus.key, 'overdue')
  assert.equal(model.rows[0].outstanding, 40)
  assert.equal(model.counts.overdue, 1)
  assert.equal(model.counts.settled, 1)
  assert.equal(Object.hasOwn(model.counts, 'amount'), false)
})

test('inventory distribution compares balance records without summing mixed units', () => {
  const model = buildInventoryDistributionModel(
    [
      {
        id: 1,
        warehouse_id: 7,
        subject_type: 'MATERIAL',
        subject_id: 11,
        unit_id: 1,
        quantity: '500',
        available_quantity: '450',
      },
      {
        id: 2,
        warehouse_id: 7,
        subject_type: 'MATERIAL',
        subject_id: 12,
        unit_id: 2,
        quantity: '3',
        available_quantity: '0',
      },
      {
        id: 3,
        warehouse_id: 8,
        subject_type: 'PRODUCT',
        subject_id: 20,
        unit_id: 3,
        quantity: '10',
        available_quantity: '10',
      },
    ],
    [
      { id: 7, name: '材料仓', code: 'WH-M' },
      { id: 8, name: '成品仓', code: 'WH-F' },
    ]
  )

  assert.equal(model.rows[0].warehouseName, '材料仓（WH-M）')
  assert.equal(model.rows[0].recordCount, 2)
  assert.equal(model.rows[0].stockCount, 2)
  assert.equal(model.rows[0].unavailableRecordCount, 1)
  assert.equal(model.counts.records, 3)
  assert.equal(Object.hasOwn(model.rows[0], 'quantity'), false)
})

test('inventory distribution identifies historical warehouses missing from active references', () => {
  const model = buildInventoryDistributionModel([
    {
      id: 1,
      warehouse_id: 99,
      subject_type: 'MATERIAL',
      subject_id: 11,
      unit_id: 1,
      available_quantity: '1',
    },
  ])

  assert.equal(model.rows[0].warehouseName, '仓库 #99（未启用）')
})

test('production overview ranks plan risk without inventing completion progress', () => {
  const model = buildProductionOrderOverviewModel(
    [
      {
        id: 1,
        order_no: 'MO-OVERDUE',
        status: 'RELEASED',
        planned_start_at: unix('2026-09-10'),
        planned_end_at: unix('2026-09-20'),
      },
      {
        id: 2,
        order_no: 'MO-DRAFT',
        status: 'DRAFT',
      },
      {
        id: 3,
        order_no: 'MO-CLOSED',
        status: 'CLOSED',
        planned_end_at: unix('2026-09-18'),
      },
    ],
    { today: '2026-09-22' }
  )

  assert.equal(model.rows[0].orderNo, 'MO-OVERDUE')
  assert.equal(model.rows[0].scheduleStatus.key, 'overdue')
  assert.equal(model.counts.active, 1)
  assert.equal(model.counts.overdue, 1)
  assert.equal(
    model.statusGroups.find((group) => group.key === 'DRAFT').count,
    1
  )
  assert.equal(Object.hasOwn(model.rows[0], 'progress'), false)
})

test('production process derives each product lane from authoritative operations and batches', () => {
  const model = buildProductionProcessModel({
    productionOrder: {
      id: 7,
      order_no: 'MO-ROUTE-001',
      status: 'RELEASED',
    },
    initialized: true,
    items: [
      {
        id: 11,
        line_no: 1,
        product_code_snapshot: 'BEAR-20',
        product_name_snapshot: '毛绒小熊',
        sku_code_snapshot: 'BROWN',
        planned_quantity: '120',
        unit_name_snapshot: '只',
      },
    ],
    operations: [
      {
        id: 41,
        production_order_item_id: 11,
        step_no: 10,
        process_name_snapshot: '布料加工',
        required_quality_gates: ['CUT_PIECE'],
      },
      {
        id: 42,
        production_order_item_id: 11,
        step_no: 20,
        process_name_snapshot: '车缝',
        required_quality_gates: ['SHELL'],
      },
    ],
    batches: [
      {
        id: 31,
        production_order_item_id: 11,
        production_order_operation_id: 41,
        execution_mode: 'OUTSOURCED',
        status: 'ACCEPTED',
        flow_type: 'NORMAL',
      },
      {
        id: 32,
        production_order_item_id: 11,
        production_order_operation_id: 42,
        source_batch_id: 31,
        execution_mode: 'IN_HOUSE',
        status: 'WAITING_QUALITY',
        flow_type: 'NORMAL',
      },
    ],
    qualityInspections: [
      {
        production_wip_batch_id: 32,
        status: 'SUBMITTED',
        result: null,
      },
    ],
  })

  assert.equal(model.order.orderNo, 'MO-ROUTE-001')
  assert.equal(model.items[0].steps[0].state.key, 'done')
  assert.equal(model.items[0].steps[1].state.key, 'quality')
  assert.equal(model.items[0].steps[1].batchSummary, '1 批待品质检验')
  assert.equal(model.counts.activeBatches, 2)
  assert.equal(model.counts.outsourced, 1)
  assert.equal(model.counts.waitingQuality, 1)
  assert.equal(model.lineageCount, 1)
})
