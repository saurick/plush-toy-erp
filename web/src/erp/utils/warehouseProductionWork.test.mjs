import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WarehouseProductionKind as Kind,
  WarehouseProductionStage as Stage,
} from '../../common/consts/statuses.generated.mjs'
import {
  validateWarehouseProductionWorkPage,
  warehouseProductionStageOptions,
  warehouseProductionActionLabel,
} from './warehouseProductionWork.mjs'

const row = {
  id: 1,
  kind: Kind.RECEIPT,
  stage: Stage.INBOUND,
  quantity: '30',
  pending_inspection_quantity: '0',
  pending_packaging_quantity: '0',
}
const page = (item = row) => ({
  items: [item],
  total: 1,
  counts: { [Stage.INBOUND]: 1 },
})

test('warehouse work accepts exact decimal quantities and rejects malformed page data', () => {
  assert.equal(
    validateWarehouseProductionWorkPage(page(), { kind: Kind.RECEIPT }).items
      .length,
    1
  )
  for (const item of [
    { ...row, id: 0 },
    { ...row, kind: Kind.RETURN },
    { ...row, quantity: '-1' },
    { ...row, pending_packaging_quantity: 'wrong' },
    { ...row, stage: 'UNKNOWN' },
  ]) {
    assert.throws(() =>
      validateWarehouseProductionWorkPage(page(item), { kind: Kind.RECEIPT })
    )
  }
  assert.throws(() =>
    validateWarehouseProductionWorkPage(
      { ...page(), total: 0 },
      { kind: Kind.RECEIPT }
    )
  )
  assert.throws(() =>
    validateWarehouseProductionWorkPage(page(), {
      kind: Kind.RECEIPT,
      stage: Stage.PACKAGING,
    })
  )
})

test('warehouse classifications and action labels distinguish WIP, receipt posting and packing', () => {
  assert.ok(
    warehouseProductionStageOptions(Kind.RETURN).some(
      (entry) => entry.value === Stage.RETURN
    )
  )
  assert.ok(
    !warehouseProductionStageOptions(Kind.RETURN).some(
      (entry) => entry.value === Stage.INBOUND
    )
  )
  assert.equal(
    warehouseProductionActionLabel({ stage: Stage.RETURN }),
    '登记回货点数'
  )
  assert.equal(
    warehouseProductionActionLabel({ stage: Stage.INBOUND }),
    '确认成品入库'
  )
  assert.equal(
    warehouseProductionActionLabel({ stage: Stage.PACKAGING }),
    '办理查货包装'
  )
  assert.equal(
    warehouseProductionActionLabel({ stage: Stage.QUALITY }),
    '查看处理进度'
  )
})
