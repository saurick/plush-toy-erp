import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildFinanceDueModel,
  buildInventoryDistributionModel,
  buildProductionProcessModel,
  moveBusinessDate,
  paginateVisualizationRows,
} from './businessVisualizationModels.mjs'

const unix = (date) => Date.parse(`${date}T00:00:00Z`) / 1000

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
  assert.equal(model.rows[0].outstanding_amount, '40')
  assert.equal(model.counts.overdue, 1)
  assert.equal(model.counts.settled, 1)
  assert.equal(Object.hasOwn(model.counts, 'amount'), false)
})

test('both account types sort the entire due queue before paging, preserving original financial fields', () => {
  for (const fact_type of ['RECEIVABLE', 'PAYABLE']) {
    const fact = { fact_type, status: 'POSTED', currency: 'USD', amount: '100.000001', outstanding_amount: '7.123456' }
    const facts = [
      ['Z', '2026-09-19'], ['A', '2026-09-23'], ['B', '2026-09-17'], ['A1', '2026-09-19'],
    ].map(([fact_no, date], index) => ({ ...fact, id: index + 1, fact_no, due_at: unix(date), source_no: 'S-1' }))
    const model = buildFinanceDueModel(facts, { today: '2026-09-22' })
    const first = paginateVisualizationRows(model.rows, 1, 2)
    const second = paginateVisualizationRows(model.rows, 2, 2)
    assert.deepEqual(first.rows.map((row) => row.fact_no), ['B', 'A1'])
    assert.deepEqual(second.rows.map((row) => row.fact_no), ['Z', 'A'])
    assert.equal(first.rows[0].dueStatus.label, '逾期 5 天')
    assert.equal(second.rows[1].dueStatus.key, 'dueSoon')
    assert.equal(first.rows[0].outstanding_amount, '7.123456')
    assert.equal(first.rows[0].source_no, 'S-1')
  }
})

test('inventory distribution renders server aggregates without combining quantity units', () => {
  const model = buildInventoryDistributionModel([
    { warehouse_id: 7, warehouse_name: '材料仓（WH-M）', record_count: 2, stock_count: 2, available_record_count: 1, unavailable_record_count: 1 },
    { warehouse_id: 8, warehouse_name: '成品仓（WH-F）', record_count: 1, stock_count: 1, available_record_count: 1, unavailable_record_count: 0 },
  ])
  assert.equal(model.rows[0].warehouseName, '材料仓（WH-M）')
  assert.equal(model.rows[0].recordCount, 2)
  assert.equal(model.rows[0].stockCount, 2)
  assert.equal(model.rows[0].unavailableRecordCount, 1)
  assert.equal(model.counts.records, 3)
  assert.equal(Object.hasOwn(model.rows[0], 'quantity'), false)
})

test('inventory distribution uses the server label for inactive historical warehouses', () => {
  const model = buildInventoryDistributionModel([
    { warehouse_id: 99, warehouse_name: '已停用历史仓库', record_count: 1, stock_count: 1, available_record_count: 1, unavailable_record_count: 0 },
  ])
  assert.equal(model.rows[0].warehouseName, '已停用历史仓库')
  assert.deepEqual(buildInventoryDistributionModel().counts, { warehouses: 0, records: 0, stocks: 0, unavailableRecords: 0 })
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
        product_id: 101,
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
  assert.equal(model.items[0].productID, 101)
  assert.equal(model.items[0].steps[0].state.key, 'done')
  assert.equal(model.items[0].steps[1].state.key, 'quality')
  assert.equal(model.items[0].steps[1].batchSummary, '1 批待品质检验')
  assert.equal(model.counts.activeBatches, 2)
  assert.equal(model.counts.outsourced, 1)
  assert.equal(model.counts.waitingQuality, 1)
  assert.equal(model.lineageCount, 1)
})

test('visual pagination bounds 500 records and recovers after a narrower filter', () => {
  const rows = Array.from({ length: 500 }, (_, id) => ({ id }))
  const first = paginateVisualizationRows(rows)
  const last = paginateVisualizationRows(rows, 20)
  assert.equal(first.rows.length, 25)
  assert.equal(last.rows[0].id, 475)
  assert.equal(last.rows.at(-1).id, 499)
  assert.equal(paginateVisualizationRows(rows.slice(0, 10), 20).page, 1)
  assert.deepEqual(paginateVisualizationRows([], 20).rows, [])
  assert.equal(paginateVisualizationRows(rows, -3).page, 1)
})

test('cancelled quality and downstream batches remain history without current risk or completion', () => {
  const model = buildProductionProcessModel({
    items: [{ id: 11 }],
    operations: [
      { id: 41, production_order_item_id: 11, step_no: 10 },
      { id: 42, production_order_item_id: 11, step_no: 20 },
    ],
    batches: [
      {
        id: 31,
        production_order_item_id: 11,
        production_order_operation_id: 41,
        status: 'PLANNED',
      },
      {
        id: 32,
        production_order_item_id: 11,
        production_order_operation_id: 42,
        status: 'CANCELLED',
      },
    ],
    qualityInspections: [
      {
        id: 71,
        production_wip_batch_id: 31,
        status: 'CANCELLED',
        result: 'REJECT',
      },
      {
        id: 72,
        production_wip_batch_id: 32,
        status: 'REJECTED',
        result: 'REJECT',
      },
    ],
  })
  assert.deepEqual(
    model.items[0].steps.map((step) => step.state.key),
    ['ready', 'waiting']
  )
  assert.equal(model.counts.exceptions, 0)
  assert.equal(model.counts.activeBatches, 1)
  assert.equal(model.items[0].steps[0].inspections.length, 1)
})

test('finance missing amounts or currency never become zero, settled or overdue', () => {
  const rows = [
    { id: 1, amount: null, outstanding_amount: null, currency: 'CNY' },
    { id: 2, amount: '10', outstanding_amount: '5', currency: '' },
  ].map((row) => ({
    fact_type: 'RECEIVABLE',
    status: 'POSTED',
    due_at: unix('2026-09-01'),
    ...row,
  }))
  const model = buildFinanceDueModel(rows, { today: '2026-09-26' })
  assert.equal(model.counts.unknown, 2)
  assert.equal(model.counts.overdue, 0)
  assert.equal(model.counts.settled, 0)
  assert.equal(model.rows[0].outstanding_amount, null)
})

test('business calendar date movement crosses months and years without local timezone drift', () => {
  assert.equal(moveBusinessDate('2026-12-25', 14), '2027-01-08')
  assert.equal(moveBusinessDate('2026-10-22', 13), '2026-11-04')
})
