import assert from 'node:assert/strict'
import test from 'node:test'

import {
  productionReferenceSnapshotOptions,
  resolveProductionOrderDetailAccess,
} from './productionOrderPermissionAccess.mjs'

const sourcedItems = [
  {
    product_id: 1,
    product_code_snapshot: 'P-1',
    product_name_snapshot: '小熊',
    product_sku_id: 2,
    sku_code_snapshot: 'SKU-2',
    unit_id: 3,
    unit_name_snapshot: '只',
    sales_order_item_id: 4,
    bom_header_id: 5,
    bom_version_snapshot: 'BOM-V1',
  },
]

test('production order view uses frozen snapshots without remote source reads', () => {
  assert.deepEqual(
    resolveProductionOrderDetailAccess({
      requestedMode: 'view',
      items: sourcedItems,
      referenceAccess: {},
    }),
    {
      mode: 'view',
      unreadableSources: ['销售订单行', 'BOM 版本'],
    }
  )

  const options = productionReferenceSnapshotOptions(sourcedItems)
  assert.equal(options.product[0].label, 'P-1 / 小熊')
  assert.equal(options.product_sku[0].label, 'SKU-2')
  assert.equal(options.unit[0].label, '只')
  assert.equal(options.sales_order_item[0].label, '销售订单行已关联')
  assert.equal(options.active_bom[0].label, 'BOM-V1')
})

test('production order edit downgrades to view until every retained source is readable', () => {
  assert.deepEqual(
    resolveProductionOrderDetailAccess({
      requestedMode: 'edit',
      items: sourcedItems,
      referenceAccess: {
        sales_order_item: false,
        active_bom: true,
      },
    }),
    {
      mode: 'view',
      unreadableSources: ['销售订单行'],
    }
  )
  assert.deepEqual(
    resolveProductionOrderDetailAccess({
      requestedMode: 'edit',
      items: sourcedItems,
      referenceAccess: {
        sales_order_item: true,
        active_bom: true,
      },
    }),
    {
      mode: 'edit',
      unreadableSources: [],
    }
  )
})
