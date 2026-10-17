import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildProductionProcessWorkspace,
  filterProductionProcessItems,
} from './productionProcessWorkspace.mjs'
import { PRODUCTION_WIP_ROUTE_CODE } from './productionWipModel.mjs'

function fixture() {
  return {
    initialized: true,
    productionOrder: { id: 7, order_no: 'MO-PROCESS-007', status: 'RELEASED' },
    items: [
      {
        id: 11,
        line_no: 1,
        product_id: 22,
        product_name_snapshot: '小熊',
        product_code_snapshot: 'BEAR',
        sku_code_snapshot: 'BLUE-L',
        planned_quantity: '30',
        unit_name_snapshot: '个',
        route_code: PRODUCTION_WIP_ROUTE_CODE,
      },
    ],
    operations: ['FABRIC_PROCESSING', 'SEWING', 'HANDWORK', 'PACKAGING'].map(
      (operation_code, index) => ({
        id: 41 + index,
        production_order_item_id: 11,
        step_no: (index + 1) * 10,
        operation_code,
        process_name_snapshot: ['裁片', '本体车缝', '手工收口', '包装'][index],
        required_quality_gates: index === 3 ? [] : ['FINISHED_GOODS'],
      })
    ),
    batches: [
      {
        id: 51,
        production_order_item_id: 11,
        production_order_operation_id: 41,
        quantity: '30',
        batch_no: 'WIP-PROCESS-051',
        status: 'PLANNED',
        execution_mode: null,
        flow_type: 'NORMAL',
      },
    ],
    qualityInspections: [],
    finishedGoodsReceipts: [],
    packagingConfirmations: [],
  }
}

test('plain operation names retain the actual craft snapshot only for trace', () => {
  const model = buildProductionProcessWorkspace(fixture())
  assert.deepEqual(
    model.items[0].steps.map((step) => step.name),
    ['布料加工', '缝制', '手工制作', '包装']
  )
  assert.equal(model.items[0].steps[1].originalName, '本体车缝')
  assert.equal(model.items[0].steps[2].originalName, '手工收口')
  assert.equal(model.items[0].current.action, 'ASSIGN_EXECUTION')
  assert.equal(model.items[0].current.quantity, '30')
  assert.equal(model.items[0].current.owner, '生产安排')
  assert.equal(model.items[0].steps[0].activeBatches[0].executionLabel, '未安排加工方式')
})

test('saving an arrangement does not imply that the batch has started', () => {
  const data = fixture()
  data.batches[0].execution_mode = 'IN_HOUSE'
  const matter = buildProductionProcessWorkspace(data).items[0].current
  assert.equal(matter.action, 'START_OPERATION')
  assert.equal(matter.state, '待开工')
  assert.equal(matter.owner, '仓库')
  assert.equal(matter.label, '领料并开工')
  assert.equal(buildProductionProcessWorkspace(data).items[0].steps[0].activeBatches[0].executionLabel, '本厂生产')
})

test('outsourced batches go to warehouse return receipt instead of in-house completion', () => {
  const data = fixture()
  Object.assign(data.batches[0], {
    status: 'OUTSOURCED',
    execution_mode: 'OUTSOURCED',
  })
  const matter = buildProductionProcessWorkspace(data).items[0].current
  assert.equal(matter.action, 'RECEIVE_OUTSOURCING_RETURN')
  assert.equal(matter.owner, '仓库')
  assert.equal(matter.label, '登记外发回货')
  assert.equal(buildProductionProcessWorkspace(data).items[0].steps[0].activeBatches[0].executionLabel, '外发加工')
})

test('quality draft, submitted and absent records keep distinct next steps', () => {
  const data = fixture()
  data.batches[0].status = 'WAITING_QUALITY'
  data.qualityInspections = [
    {
      id: 61,
      production_wip_batch_id: 51,
      inspection_no: 'QI-PROCESS-061',
      status: 'DRAFT',
      gate_code: 'FINISHED_GOODS',
    },
  ]
  let matter = buildProductionProcessWorkspace(data).items[0].current
  assert.equal(matter.state, '待提交检验')
  assert.equal(matter.recordID, 61)
  assert.equal(matter.target, 'inspection')
  data.qualityInspections[0].status = 'SUBMITTED'
  assert.equal(
    buildProductionProcessWorkspace(data).items[0].current.state,
    '待检验判定'
  )
  data.qualityInspections[0].status = 'CANCELLED'
  matter = buildProductionProcessWorkspace(data).items[0].current
  assert.equal(matter.target, '')
  assert.equal(matter.recordID, undefined)
})

test('parallel batch issues remain visible and filtering picks the matching issue', () => {
  const data = fixture()
  data.batches[0].status = 'REJECTED'
  data.batches.push({
    ...data.batches[0],
    id: 52,
    production_order_operation_id: 42,
    status: 'WAITING_QUALITY',
  })
  const model = buildProductionProcessWorkspace(data)
  const item = model.items[0]
  assert.equal(item.matters.length, 2)
  assert.equal(item.current.key, 'exception')
  assert.equal(
    filterProductionProcessItems(model.items, { filter: 'quality' })[0].current
      .stepID,
    42
  )
  assert.equal(model.filters.find((entry) => entry.key === 'quality').count, 1)
  assert.equal(
    model.filters.find((entry) => entry.key === 'exception').count,
    1
  )
})

test('mixed results describe rejected batches without marking every batch or downstream stage as rejected', () => {
  const data = fixture()
  const base = { ...data.batches[0], production_order_operation_id: 43, quantity: '10' }
  data.batches = [
    { ...base, id: 51, status: 'ACCEPTED' },
    { ...base, id: 52, status: 'REJECTED' },
    { ...base, id: 53, status: 'PLANNED' },
    { ...base, id: 54, production_order_operation_id: 44, status: 'ACCEPTED' },
    { ...base, id: 55, status: 'CANCELLED' },
  ]
  data.qualityInspections = [
    { id: 61, production_wip_batch_id: 51, status: 'PASSED', gate_code: 'FINISHED_GOODS' },
    { id: 62, production_wip_batch_id: 52, status: 'REJECTED', gate_code: 'FINISHED_GOODS' },
  ]
  const { steps } = buildProductionProcessWorkspace(data).items[0]
  const handwork = steps[2]
  assert.equal(handwork.state.label, '有不合格批次')
  assert.deepEqual(handwork.problemBatches.map((batch) => batch.id), [52])
  assert.equal(handwork.activeBatches.length, 3)
  assert.equal(handwork.quantity, '30')
  assert.match(handwork.batchSummary, /1 批检验合格/u)
  assert.match(handwork.batchSummary, /1 批检验不合格/u)
  assert.doesNotMatch(handwork.batchSummary, /取消/u)
  assert.deepEqual(handwork.inspections.map((inspection) => inspection.batchID), [51, 52])
  assert.equal(steps[3].state.key, 'done')
  assert.equal(data.batches[3].status, 'ACCEPTED')
})

test('handwork acceptance, receipt draft and posted inbound stay separate', () => {
  const data = fixture()
  Object.assign(data.batches[0], {
    production_order_operation_id: 43,
    status: 'ACCEPTED',
  })
  let matter = buildProductionProcessWorkspace(data).items[0].current
  assert.equal(matter.action, 'completion')
  assert.equal(matter.label, '登记成品收仓')
  data.finishedGoodsReceipts.push({
    id: 71,
    production_wip_batch_id: 51,
    fact_no: 'FG-PROCESS-071',
    status: 'DRAFT',
    quantity: '20',
    reworked_quantity: '0',
  })
  matter = buildProductionProcessWorkspace(data).items[0].current
  assert.equal(matter.key, 'inbound')
  assert.equal(matter.recordID, 71)
  assert.equal(matter.quantity, '20')
  assert.match(matter.reason, /未增加库存/u)
  data.finishedGoodsReceipts[0].status = 'POSTED'
  matter = buildProductionProcessWorkspace(data).items[0].current
  assert.equal(matter.action, 'TRANSFER_TO_NEXT_OPERATION')
  assert.equal(matter.owner, '仓库')
})

test('pending inspection and partial inbound drafts remain separate matters for one batch', () => {
  const data = fixture()
  Object.assign(data.batches[0], {
    production_order_operation_id: 43,
    status: 'WAITING_QUALITY',
  })
  data.finishedGoodsReceipts.push({
    id: 71,
    production_wip_batch_id: 51,
    fact_no: 'FG-PROCESS-071',
    status: 'DRAFT',
    quantity: '20',
  })
  const model = buildProductionProcessWorkspace(data)
  assert.equal(model.items[0].matters.length, 2)
  assert.equal(model.filters.find((entry) => entry.key === 'inbound').count, 1)
  const selected = filterProductionProcessItems(model.items, {
    filter: 'inbound',
  })[0]
  assert.equal(selected.current.quantity, '20')
  assert.equal(selected.current.target, 'record')
  assert.equal(selected.current.color, 'gold')
  assert.equal(data.batches[0].status, 'WAITING_QUALITY')
})

test('cancelled and split batches remain traceable without contributing current issues or quantity', () => {
  const data = fixture()
  data.batches = [
    { ...data.batches[0], quantity: '1.000001' },
    { ...data.batches[0], id: 52, quantity: '2.000002' },
    { ...data.batches[0], id: 53, quantity: '999', status: 'CANCELLED' },
    { ...data.batches[0], id: 54, quantity: '999', status: 'SPLIT' },
  ]
  const step = buildProductionProcessWorkspace(data).items[0].steps[0]
  assert.equal(step.matters.length, 2)
  assert.equal(step.activeBatches.length, 2)
  assert.equal(step.batches.length, 4)
  assert.equal(step.quantity, '3.000003')
  assert.equal(step.problemBatches.length, 0)
  assert.doesNotMatch(step.batchSummary, /取消|拆分/u)
})

test('closed normal orders cannot become writable through a presentation action', () => {
  const data = fixture()
  data.productionOrder.status = 'CLOSED'
  assert.equal(
    buildProductionProcessWorkspace(data).items[0].current.allowedForOrder,
    false
  )
})

test('searching product and SKU or clearing a query only changes local matches', () => {
  const { items } = buildProductionProcessWorkspace(fixture())
  assert.equal(
    filterProductionProcessItems(items, { query: 'BLUE-l' }).length,
    1
  )
  assert.equal(filterProductionProcessItems(items, { query: 'BEAR' }).length, 1)
  assert.equal(
    filterProductionProcessItems(items, { query: '不存在' }).length,
    0
  )
  assert.equal(filterProductionProcessItems(items, { query: '' }).length, 1)
  assert.equal(
    filterProductionProcessItems(items, { filter: 'quality' }).length,
    0
  )
  assert.equal(items.length, 1)
})

test('unloaded aggregate does not fabricate products, owners or progress', () => {
  const model = buildProductionProcessWorkspace(null)
  assert.equal(model.items.length, 0)
  assert.equal(model.initialized, false)
  assert.ok(model.filters.every((entry) => entry.count === 0))
})
