import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  installOrderRpcMocks,
  mockSalesOrderItemsList,
} from './orderRpcMocks.mjs'
import { styleRpcResult } from './rpcMockResult.mjs'

const salesOrderItem = Object.freeze({
  id: 7,
  sales_order_id: 3,
  line_status: 'open',
})
const source = readFileSync(
  new URL('./orderRpcMocks.mjs', import.meta.url),
  'utf8'
)

async function orderMockHarness(routePattern) {
  const handlers = new Map()
  const page = {
    async route(pattern, handler) {
      handlers.set(pattern, handler)
    },
  }
  await installOrderRpcMocks(page, { nowUnix: () => 1_750_000_000 })
  const handler = handlers.get(routePattern)
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

test('sales order item L1 mock rejects the old unscoped list request', () => {
  assert.equal(
    styleRpcResult(mockSalesOrderItemsList({}, salesOrderItem)).code,
    40010
  )
  assert.equal(
    styleRpcResult(mockSalesOrderItemsList({ limit: 500 }, salesOrderItem))
      .code,
    40010
  )
})

test('sales order item L1 mock follows the backend source and paging contract', () => {
  assert.deepEqual(
    mockSalesOrderItemsList(
      { sales_order_id: 3, line_status: 'open', limit: 200, offset: 0 },
      salesOrderItem
    ),
    {
      sales_order_items: [salesOrderItem],
      total: 1,
      limit: 200,
      offset: 0,
    }
  )
  assert.deepEqual(
    mockSalesOrderItemsList({ sales_order_id: 4 }, salesOrderItem)
      .sales_order_items,
    []
  )
})

test('sales order list L1 mock echoes requested paging through the shared helper', () => {
  const listCase = source.slice(
    source.indexOf("case 'list_sales_orders'"),
    source.indexOf("case 'list_sales_order_items'")
  )
  assert.match(listCase, /stylePaginatedRpcData/u)
  assert.match(listCase, /'sales_orders'/u)
  assert.match(listCase, /params/u)
  assert.doesNotMatch(listCase, /limit:\s*100|offset:\s*0/u)
})

test('BOM version list L1 mock echoes requested full-read paging', () => {
  const listCase = source.slice(
    source.indexOf("case 'list_bom_versions'"),
    source.indexOf("case 'get_bom_version'")
  )
  assert.match(listCase, /stylePaginatedRpcData/u)
  assert.match(listCase, /'bom_versions'/u)
  assert.match(listCase, /params/u)
  assert.doesNotMatch(listCase, /limit:\s*100|offset:\s*0/u)
})

test('purchase order mocks preserve filters, total and requested slices', async () => {
  const call = await orderMockHarness('**/rpc/purchase_order')
  const firstOrderPage = await call('list_purchase_orders', {
    limit: 1,
    offset: 0,
  })
  assert.equal(firstOrderPage.result.data.total, 1)
  assert.equal(firstOrderPage.result.data.limit, 1)
  assert.equal(firstOrderPage.result.data.offset, 0)
  assert.equal(firstOrderPage.result.data.purchase_orders.length, 1)

  const exhaustedOrderPage = await call('list_purchase_orders', {
    limit: 1,
    offset: 1,
  })
  assert.equal(exhaustedOrderPage.result.data.total, 1)
  assert.equal(exhaustedOrderPage.result.data.offset, 1)
  assert.deepEqual(exhaustedOrderPage.result.data.purchase_orders, [])

  const firstItemPage = await call('list_purchase_order_items', {
    purchase_order_id: 1,
    limit: 1,
    offset: 0,
  })
  assert.equal(firstItemPage.result.data.total, 1)
  assert.equal(firstItemPage.result.data.purchase_order_items.length, 1)

  const exhaustedItemPage = await call('list_purchase_order_items', {
    purchase_order_id: 1,
    limit: 1,
    offset: 1,
  })
  assert.equal(exhaustedItemPage.result.data.total, 1)
  assert.equal(exhaustedItemPage.result.data.offset, 1)
  assert.deepEqual(exhaustedItemPage.result.data.purchase_order_items, [])

  const unrelatedItems = await call('list_purchase_order_items', {
    purchase_order_id: 999,
    limit: 200,
    offset: 0,
  })
  assert.equal(unrelatedItems.result.data.total, 0)
  assert.equal(unrelatedItems.result.data.limit, 200)
})
