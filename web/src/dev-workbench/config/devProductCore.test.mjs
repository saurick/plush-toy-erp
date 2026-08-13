import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  DEV_PRODUCT_CORE_DOCS_HREF,
  DEV_PRODUCT_CORE_MEMBERSHIP_ALL,
  DEV_PRODUCT_CORE_ROUTE,
  DEV_PRODUCT_CORE_SOURCE_PATH,
  buildProductCoreSummary,
  filterProductCoreCapabilities,
  isDevProductCoreEnabled,
  normalizeProductCoreMembership,
  parseProductCoreCapabilities,
} from './devProductCore.mjs'

const ledgerSource = readFileSync(
  new URL('../../../../docs/product/产品能力进度台账.md', import.meta.url),
  'utf8'
)
const pageSource = readFileSync(
  new URL('../pages/DevProductCorePage.jsx', import.meta.url),
  'utf8'
)
const styleSource = readFileSync(
  new URL('../styles/dev-product-core.css', import.meta.url),
  'utf8'
)

test('devProductCore: route and source stay inside the DEV-only workbench', () => {
  assert.equal(DEV_PRODUCT_CORE_ROUTE, '/__dev/product-core')
  assert.equal(DEV_PRODUCT_CORE_SOURCE_PATH, 'docs/product/产品能力进度台账.md')
  assert.equal(
    DEV_PRODUCT_CORE_DOCS_HREF,
    '/__dev/docs?path=docs%2Fproduct%2F%E4%BA%A7%E5%93%81%E8%83%BD%E5%8A%9B%E8%BF%9B%E5%BA%A6%E5%8F%B0%E8%B4%A6.md'
  )
  assert.equal(isDevProductCoreEnabled({ DEV: true }), true)
  assert.equal(isDevProductCoreEnabled({ DEV: false }), false)
  assert.equal(isDevProductCoreEnabled({}), false)
  assert(!DEV_PRODUCT_CORE_ROUTE.startsWith('/erp/'))
  assert.match(
    pageSource,
    /import\.meta\.glob\(\s*'\.\.\/\.\.\/\.\.\/\.\.\/docs\/product\/产品能力进度台账\.md'/u
  )
})

test('devProductCore: all 15 capability rows derive from the unique ledger', () => {
  const capabilities = parseProductCoreCapabilities(ledgerSource)
  const summary = buildProductCoreSummary(capabilities)

  assert.equal(capabilities.length, 15)
  assert.equal(new Set(capabilities.map((item) => item.key)).size, 15)
  assert.deepEqual(summary.counts, {
    entered: 10,
    partial: 3,
    pending: 1,
    excluded: 1,
  })
  assert.equal(summary.total, 15)
  assert.equal(summary.readOnly, true)
  assert.match(summary.boundary, /不能推出目标环境已发布/u)
  assert(
    capabilities.every(
      (item) =>
        item.capability &&
        item.status &&
        item.membership &&
        item.availableScope &&
        item.boundary
    )
  )
  assert.deepEqual(
    [...new Map(capabilities.map((item) => [item.status, item.membership]))],
    [
      ['可试用', '已进入内核'],
      ['实现中', '部分进入'],
      ['待办', '尚未进入'],
      ['暂不做', '当前不纳入'],
    ]
  )
})

test('devProductCore: filters distinguish membership and readable keywords', () => {
  const capabilities = parseProductCoreCapabilities(ledgerSource)

  assert.equal(
    filterProductCoreCapabilities(capabilities, {
      membership: 'entered',
    }).length,
    10
  )
  assert.deepEqual(
    filterProductCoreCapabilities(capabilities, {
      membership: 'partial',
      keyword: '导入',
    }).map((item) => item.capability),
    ['客户数据导入与私有部署包']
  )
  assert.deepEqual(
    filterProductCoreCapabilities(capabilities, {
      keyword: '核销',
    }).map((item) => item.capability),
    ['应收、应付、发票、收付款、核销与红冲']
  )
  assert.equal(normalizeProductCoreMembership('unknown'), 'all')
  assert.equal(
    normalizeProductCoreMembership(''),
    DEV_PRODUCT_CORE_MEMBERSHIP_ALL
  )
})

test('devProductCore: page is one searchable table with a mobile row layout', () => {
  assert.match(pageSource, /searchParams\.get\('status'\)/u)
  assert.match(pageSource, /searchParams\.get\('q'\)/u)
  assert.match(pageSource, /aria-pressed=\{isActive\}/u)
  assert.match(pageSource, /<table className="erp-dev-product-core-table">/u)
  assert.match(pageSource, /<caption>当前 Product Core 能力与边界<\/caption>/u)
  assert.match(pageSource, /data-label="当前可用范围"/u)
  assert.match(pageSource, /进入 Product Core 不等于已发布或已验收/u)
  assert.doesNotMatch(pageSource, /parseProductCoreEvidenceEntries/u)
  assert.doesNotMatch(pageSource, /erp-dev-product-core-status-help/u)
  assert.match(styleSource, /@media \(max-width: 767px\)/u)
  assert.match(styleSource, /\.erp-dev-product-core-table td::before/u)
  assert.match(styleSource, /\.erp-dev-product-core-filter:focus-visible/u)
})
