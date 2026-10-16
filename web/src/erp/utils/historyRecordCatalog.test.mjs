import assert from 'node:assert/strict'
import test from 'node:test'

import {
  HISTORY_RECORD_SOURCES,
  buildHistoryListParams,
  getAvailableHistorySources,
  normalizeHistoryRecords,
} from './historyRecordCatalog.mjs'

test('历史记录源只暴露已有菜单且具备真实读取权限的对象', () => {
  const sources = getAvailableHistorySources({
    visibleMenuPaths: [
      '/erp/master/products',
      '/erp/purchase/accessories',
      '/erp/production/orders',
    ],
    canReadPermission: (permission) =>
      ['product.read', 'purchase.order.read', 'production.wip.read'].includes(
        permission
      ),
  })
  assert.deepEqual(
    sources.map((source) => source.key),
    ['products', 'purchase_orders', 'production_orders']
  )
})

test('历史读取参数始终带只读 history scope，并沿用对象自己的状态字段', () => {
  const purchaseSource = HISTORY_RECORD_SOURCES.find(
    (source) => source.key === 'purchase_orders'
  )
  assert.deepEqual(
    buildHistoryListParams(purchaseSource, {
      keyword: ' PO-1 ',
      status: 'closed',
    }),
    {
      keyword: 'PO-1',
      lifecycle_scope: 'history',
      lifecycle_status: 'closed',
    }
  )
})

test('历史记录只投影岗位可读字段，跳转链接保留所属模块和历史范围', () => {
  const salesSource = HISTORY_RECORD_SOURCES.find(
    (source) => source.key === 'sales_orders'
  )
  const [record] = normalizeHistoryRecords(salesSource, [
    {
      id: 7,
      order_no: 'SO-007',
      customer_snapshot: { name: '示例客户' },
      lifecycle_status: 'closed',
      updated_at: 123,
    },
  ])
  assert.equal(record.primary, 'SO-007')
  assert.equal(record.secondary, '示例客户')
  assert.equal(record.status, '已关闭')
  assert.match(record.link, /scope=history/u)
  assert.match(record.link, /sales_order_id=7/u)
  assert.equal(Object.hasOwn(record, 'id'), false)
})
