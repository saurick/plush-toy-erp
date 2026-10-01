import assert from 'node:assert/strict'
import test from 'node:test'
import { buildProductionWipFormPayload } from './productionWipFormPayload.mjs'
import {
  PRODUCTION_WIP_ACTION as ACTION,
  PRODUCTION_WIP_EXECUTION_MODE as MODE,
} from './productionWipModel.mjs'

function payload(action, values = {}, overrides = {}) {
  return buildProductionWipFormPayload({
    action,
    values,
    orderID: 1,
    batch: {
      id: 2,
      version: 3,
      production_order_item_id: 4,
      quantity: '10.000001',
    },
    nextOperation: { id: 5 },
    packagingConfirmation: { version: 6 },
    isNormalFabricBatch: false,
    materialRequirements: [],
    ...overrides,
  })
}

test('production form splitting conserves quantity and transfer uses the full selected batch', () => {
  assert.deepEqual(payload(ACTION.SPLIT_BATCH, { quantity: '4' }).splits, [
    { quantity: '4' },
    { quantity: '6.000001' },
  ])
  const transfer = payload(ACTION.TRANSFER_TO_NEXT_OPERATION, {
    quantity: '99',
    target_operation_id: 99,
  })
  assert.equal(transfer.quantity, '10.000001')
  assert.equal(transfer.target_operation_id, 5)
  const rework = payload(ACTION.REWORK, {
    quantity: '2',
    target_operation_id: 8,
    reason: '返工',
  })
  assert.equal(rework.quantity, '2')
  assert.equal(rework.target_operation_id, 8)
  assert.equal(rework.reason, '返工')
})

test('production assignment maps fabric requirements and excludes stale external choices for in-house work', () => {
  assert.deepEqual(
    payload(ACTION.ASSIGN_EXECUTION, {
      execution_mode: MODE.IN_HOUSE,
      outsourcing_order_item_id: 90,
    }).outsourcing_allocations,
    []
  )
  assert.deepEqual(
    payload(ACTION.ASSIGN_EXECUTION, {
      execution_mode: MODE.OUTSOURCED,
      outsourcing_order_item_id: 90,
    }).outsourcing_allocations,
    [{ outsourcing_order_item_id: 90 }]
  )
  assert.deepEqual(
    payload(
      ACTION.ASSIGN_EXECUTION,
      {
        execution_mode: MODE.OUTSOURCED,
        fabric_outsourcing_item_ids: { 11: 90, 12: 91 },
      },
      {
        isNormalFabricBatch: true,
        materialRequirements: [{ id: 11 }, { id: 12 }],
      }
    ).outsourcing_allocations,
    [
      {
        outsourcing_order_item_id: 90,
        production_order_material_requirement_id: 11,
      },
      {
        outsourcing_order_item_id: 91,
        production_order_material_requirement_id: 12,
      },
    ]
  )
})

test('packaging confirmation binds the item version rather than the batch version', () => {
  assert.deepEqual(
    payload(ACTION.CONFIRM_PACKAGING_MATERIAL, {
      packaging_version_snapshot: '版次一',
      note: '确认',
    }),
    {
      production_order_id: 1,
      production_order_item_id: 4,
      expected_version: 6,
      packaging_version_snapshot: '版次一',
      note: '确认',
    }
  )
})
