import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  DEV_PRODUCT_CORE_MEMBERSHIP_ALL,
  DEV_PRODUCT_CORE_ROUTE,
  DEV_PRODUCT_CORE_SOURCE_PATH,
  buildProductCoreSummary,
  filterProductCoreCapabilities,
  isDevProductCoreEnabled,
  normalizeProductCoreMembership,
  parseProductCoreCapabilities,
  parseProductCoreEvidenceEntries,
  parseProductCoreStatusDefinitions,
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
  assert.equal(isDevProductCoreEnabled({ DEV: true }), true)
  assert.equal(isDevProductCoreEnabled({ DEV: false }), false)
  assert.equal(isDevProductCoreEnabled({}), false)
  assert(!DEV_PRODUCT_CORE_ROUTE.startsWith('/erp/'))
  assert.match(
    pageSource,
    /import\.meta\.glob\(\s*'\.\.\/\.\.\/\.\.\/\.\.\/docs\/product\/产品能力进度台账\.md'/u
  )
})

test('devProductCore: status definitions preserve the ledger wording and readable membership', () => {
  assert.deepEqual(
    parseProductCoreStatusDefinitions(ledgerSource).map((item) => [
      item.status,
      item.membership,
    ]),
    [
      ['待办', '尚未进入'],
      ['实现中', '部分进入'],
      ['可试用', '已进入内核'],
      ['暂不做', '当前不纳入'],
    ]
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
})

test('devProductCore: filters distinguish entered, partial and unavailable capabilities', () => {
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

test('devProductCore: evidence links resolve back into the shared document viewer', () => {
  const evidence = parseProductCoreEvidenceEntries(ledgerSource)
  const links = evidence.flatMap((item) => item.links)

  assert.equal(evidence.length, 6)
  assert(links.length >= 7)
  assert(
    links.every(
      (link) =>
        link.path.endsWith('.md') &&
        link.devDocsHref.startsWith('/__dev/docs?path=')
    )
  )
  assert(
    links.some(
      (link) => link.path === 'docs/architecture/状态工作流事实边界.md'
    )
  )
  assert(
    evidence.some(
      (item) => item.label === '客户可见、发布、UAT、签收和差异决定'
    )
  )
})

test('devProductCore: page keeps filters in the URL and mobile controls touch friendly', () => {
  assert.match(pageSource, /searchParams\.get\('status'\)/u)
  assert.match(pageSource, /searchParams\.get\('q'\)/u)
  assert.match(pageSource, /aria-pressed=\{isActive\}/u)
  assert.match(pageSource, /进入 Product Core 不等于已发布或已验收/u)
  assert.match(styleSource, /@media \(max-width: 767px\)/u)
  assert.match(
    styleSource,
    /\.erp-dev-product-core-filter\s*\{[\s\S]*?min-height:\s*68px/u
  )
})
