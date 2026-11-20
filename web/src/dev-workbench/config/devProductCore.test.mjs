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
  resolveProductCoreCapability,
} from './devProductCore.mjs'

const ledgerSource = readFileSync(
  new URL('../../../../docs/product/产品能力进度台账.md', import.meta.url),
  'utf8'
)
const pageSource = readFileSync(
  new URL('../pages/DevProductCorePage.jsx', import.meta.url),
  'utf8'
)
const ledgerSection = ledgerSource.split('## 能力状态')[1]?.split('\n## ')[0] || ''
const ledgerEntries = [...ledgerSection.matchAll(
  /^\|\s*([^|]+?)\s*\|\s*(可试用|部分可用|当前不纳入)\s*\|/gmu
)].map(([, capability, status]) => [capability, status])

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

test('devProductCore: every published capability and status derives from the unique ledger', () => {
  const capabilities = parseProductCoreCapabilities(ledgerSource)
  const summary = buildProductCoreSummary(capabilities)

  assert(ledgerEntries.length > 0)
  assert.deepEqual(capabilities.map((item) => [item.capability, item.status]), ledgerEntries)
  assert.equal(new Set(capabilities.map((item) => item.key)).size, ledgerEntries.length)
  assert.deepEqual(summary.counts, {
    entered: ledgerEntries.filter(([, status]) => status === '可试用').length,
    partial: ledgerEntries.filter(([, status]) => status === '部分可用').length,
    excluded: ledgerEntries.filter(([, status]) => status === '当前不纳入').length,
  })
  assert.equal(summary.total, ledgerEntries.length)
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
      ['部分可用', '部分进入'],
      ['当前不纳入', '当前不纳入'],
    ]
  )
  assert.doesNotMatch(ledgerSource, /下一步|未完成范围/u)
  assert.doesNotMatch(pageSource, /主要边界\s*\/\s*下一步/u)
})

test('devProductCore: parsing, summaries and filters keep the three statuses distinct', () => {
  const capabilities = parseProductCoreCapabilities(`
# 测试台账
## 能力状态
| 业务能力 | 状态 | 当前可用范围 | 当前边界 |
| --- | --- | --- | --- |
| 订单 | 可试用 | 草稿与提交 | 不替代出货 |
### 实施与边界
| 业务能力 | 状态 | 当前可用范围 | 当前边界 |
| --- | --- | --- | --- |
| 资料导入 | 部分可用 | 只读提取 | 没有写入执行器 |
| 多租户 | 当前不纳入 | 单客户部署 | 无租户隔离 |
### 辅助说明
| 说明 | 状态 |
| --- | --- |
| 无关表格 | 可试用 |
## 证据入口
| 业务能力 | 状态 | 当前可用范围 | 当前边界 |
| --- | --- | --- | --- |
| 无关表格 | 可试用 | 不属于能力状态 | 不应进入投影 |
`)
  assert.deepEqual(capabilities.map((item) => [item.capability, item.membershipKey]), [
    ['订单', 'entered'],
    ['资料导入', 'partial'],
    ['多租户', 'excluded'],
  ])
  const summary = buildProductCoreSummary(capabilities)
  assert.equal(summary.total, 3)
  assert.deepEqual(summary.counts, { entered: 1, partial: 1, excluded: 1 })
  assert.deepEqual(filterProductCoreCapabilities(capabilities, {
    membership: 'partial', keyword: '导入',
  }).map((item) => item.capability), ['资料导入'])
  assert.deepEqual(filterProductCoreCapabilities(capabilities, {
    membership: 'excluded', keyword: '导入',
  }), [])
})

test('devProductCore: filters distinguish membership and readable keywords', () => {
  const capabilities = parseProductCoreCapabilities(ledgerSource)

  assert.equal(
    filterProductCoreCapabilities(capabilities, {
      membership: 'entered',
    }).length,
    ledgerEntries.filter(([, status]) => status === '可试用').length
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
    ['应收、应付、发票、收付款、核销与账款调整']
  )
  assert.equal(normalizeProductCoreMembership('unknown'), 'all')
  assert.equal(normalizeProductCoreMembership('pending'), 'all')
  assert.equal(
    normalizeProductCoreMembership(''),
    DEV_PRODUCT_CORE_MEMBERSHIP_ALL
  )
})

test('devProductCore: page consumes the searchable read-only capability projection', () => {
  assert.match(pageSource, /searchParams\.get\('status'\)/u)
  assert.match(pageSource, /searchParams\.get\('q'\)/u)
  assert.match(pageSource, /selected=\{isActive\}/u)
  assert.match(pageSource, /进入 Product Core 不等于已发布或已验收/u)
  assert.doesNotMatch(pageSource, /parseProductCoreEvidenceEntries/u)
})

test('devProductCore: selection follows the filtered ledger and survives row reordering', () => {
  const capabilities = parseProductCoreCapabilities(ledgerSource)
  const chosen = capabilities[2]
  assert.equal(resolveProductCoreCapability(capabilities, chosen.capability), chosen)
  assert.equal(resolveProductCoreCapability([...capabilities].reverse(), chosen.capability), chosen)
  const partial = filterProductCoreCapabilities(capabilities, { membership: 'partial' })
  assert.equal(resolveProductCoreCapability(capabilities), null)
  assert.equal(resolveProductCoreCapability(partial, chosen.capability), null)
  assert.equal(resolveProductCoreCapability(capabilities, '已移除的能力'), null)
  assert.equal(resolveProductCoreCapability([], chosen.capability), null)
})
