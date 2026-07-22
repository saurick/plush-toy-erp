import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  DEV_CAPABILITY_LEDGER_ROUTE,
  DEV_CAPABILITY_LEDGER_SOURCE_PATH,
  DEV_CAPABILITY_SOURCE_ITEMS,
  DEV_CUSTOMER_DELIVERY_MATRIX_SOURCE_PATH,
  buildDevCapabilityDocsHref,
  isDevCapabilityLedgerEnabled,
} from './devCapabilityLedger.mjs'

const read = (path) =>
  readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8')

const capabilityPageSource = read(
  'web/src/erp/pages/DevCapabilityLedgerPage.jsx'
)

test('devCapabilityLedger: 开发入口只登记两份正式真源', () => {
  assert.equal(DEV_CAPABILITY_LEDGER_ROUTE, '/__dev/capability-ledger')
  assert.equal(
    DEV_CAPABILITY_LEDGER_SOURCE_PATH,
    'docs/product/产品能力进度台账.md'
  )
  assert.equal(
    DEV_CUSTOMER_DELIVERY_MATRIX_SOURCE_PATH,
    'docs/customers/yoyoosun/客户交付矩阵.md'
  )
  assert.deepEqual(
    DEV_CAPABILITY_SOURCE_ITEMS.map((item) => item.sourcePath),
    [
      DEV_CAPABILITY_LEDGER_SOURCE_PATH,
      DEV_CUSTOMER_DELIVERY_MATRIX_SOURCE_PATH,
    ]
  )
  assert.equal(isDevCapabilityLedgerEnabled({ DEV: true }), true)
  assert.equal(isDevCapabilityLedgerEnabled({ DEV: false }), false)
  assert(!DEV_CAPABILITY_LEDGER_ROUTE.startsWith('/erp/'))
})

test('devCapabilityLedger: 两个入口的职责和边界保持分离', () => {
  const [product, customer] = DEV_CAPABILITY_SOURCE_ITEMS
  assert.equal(product.kind, '全局产品')
  assert.match(product.description, /成熟/u)
  assert.match(product.boundary, /不记录单个客户/u)
  assert.equal(customer.kind, '当前客户')
  assert.match(customer.description, /试用|验收/u)
  assert.match(customer.boundary, /不反向定义 Product Core/u)
})

test('devCapabilityLedger: 页面只做导航，不维护第二套台账状态', () => {
  assert.doesNotMatch(capabilityPageSource, /\.md\?raw/u)
  assert.doesNotMatch(capabilityPageSource, /import\.meta\.glob/u)
  assert.doesNotMatch(capabilityPageSource, /fetch\([^)]*\.md/u)
  assert.doesNotMatch(capabilityPageSource, /useSearchParams/u)
  assert.doesNotMatch(capabilityPageSource, /MetricTile|DistributionBars/u)
  assert.doesNotMatch(capabilityPageSource, /Select|Input/u)
  assert.match(capabilityPageSource, /不复制台账内容/u)
  assert.match(capabilityPageSource, /DEV_CAPABILITY_SOURCE_ITEMS\.map/u)
})

test('devCapabilityLedger: 两份正式文档仍保留对应真源标题', () => {
  assert.match(
    read(DEV_CAPABILITY_LEDGER_SOURCE_PATH),
    /^# 产品能力进度台账/u
  )
  assert.match(
    read(DEV_CUSTOMER_DELIVERY_MATRIX_SOURCE_PATH),
    /^# yoyoosun 客户能力、交付与差异矩阵/u
  )
})

test('devCapabilityLedger: 真源路径跳到开发文档查看器', () => {
  assert.equal(
    buildDevCapabilityDocsHref(DEV_CAPABILITY_LEDGER_SOURCE_PATH),
    '/__dev/docs?path=docs%2Fproduct%2F%E4%BA%A7%E5%93%81%E8%83%BD%E5%8A%9B%E8%BF%9B%E5%BA%A6%E5%8F%B0%E8%B4%A6.md'
  )
  assert.equal(buildDevCapabilityDocsHref(), '/__dev/docs')
})
