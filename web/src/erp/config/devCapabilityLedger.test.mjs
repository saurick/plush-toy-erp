import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEV_CAPABILITY_LEDGER_ROUTE,
  DEV_CAPABILITY_LEDGER_SOURCE_PATH,
  buildCapabilityLedgerSummary,
  filterCapabilityLedgerItems,
  isDevCapabilityLedgerEnabled,
  parseCapabilityLedgerMarkdown,
} from './devCapabilityLedger.mjs'

const ledgerMarkdown = `
# 产品能力进度台账、客户交付矩阵与客户差异台账 / Product Delivery Ledgers

## 4. 产品能力进度台账

| Capability ID | 能力名称 | 所属层 | 业务域 | 当前成熟度 | 当前结果 | 当前不包含 | 证据 | 下一步 | 风险 | 可客户试用 | 可交付承诺 |
| ------------- | -------- | ------ | ------ | ---------: | -------- | ---------- | ---- | ------ | ---- | ------------ | ---------- |
| CAP-001 | Workflow / Fact 边界 | Product Core | Architecture / Workflow | L7 | 已明确 \`workflow done != fact posted\` | 不代表 shipment facts 已实现 | \`docs/architecture/status-workflow-fact-boundary.md\` | 后续 shipment / finance 继续复用 | UI 文案可能误导 | Yes | No |
| CAP-013 | product_skus | Product Core | Product / SKU | L3 | Draft Only | 未落 schema / runtime / UI | roadmap | SKU/BOM version review | 不能因颜色字段直接落 SKU | No | No |
| CAP-029 | Customer Config 配置形态 | Customer Config | Productization | L2-L3 | 草案配置 | 不新增 \`tenant_id\` | \`docs/product/product-delivery-ledgers.md\` | customer review | 被误读为 Runtime Tenant | Limited | No |

---

# 第二部分：客户交付矩阵
`

test('devCapabilityLedger: 只通过开发态独立路径暴露', () => {
  assert.equal(DEV_CAPABILITY_LEDGER_ROUTE, '/__dev/capability-ledger')
  assert.equal(
    DEV_CAPABILITY_LEDGER_SOURCE_PATH,
    'docs/product/product-delivery-ledgers.md'
  )
  assert.equal(isDevCapabilityLedgerEnabled({ DEV: true }), true)
  assert.equal(isDevCapabilityLedgerEnabled({ DEV: false }), false)
  assert(!DEV_CAPABILITY_LEDGER_ROUTE.startsWith('/erp/'))
})

test('devCapabilityLedger: 从正式台账 Markdown 解析产品能力表', () => {
  const capabilities = parseCapabilityLedgerMarkdown(ledgerMarkdown)

  assert.equal(capabilities.length, 3)
  assert.deepEqual(
    capabilities.map((item) => item.id),
    ['CAP-001', 'CAP-013', 'CAP-029']
  )
  assert.equal(
    capabilities[0].currentResult,
    '已明确 workflow done != fact posted'
  )
  assert.equal(capabilities[0].maturityMax, 7)
  assert.equal(capabilities[1].maturityBucket, 'L3')
  assert.equal(capabilities[2].maturityMin, 2)
  assert.equal(capabilities[2].maturityMax, 3)
  assert.equal(capabilities[2].trialStatus, 'limited')
  assert.equal(capabilities[2].deliveryStatus, 'no')
  assert.match(capabilities[2].searchText, /runtime tenant/)
})

test('devCapabilityLedger: 汇总成熟度、试用和交付承诺', () => {
  const capabilities = parseCapabilityLedgerMarkdown(ledgerMarkdown)
  const summary = buildCapabilityLedgerSummary(capabilities)

  assert.equal(summary.total, 3)
  assert.equal(summary.trialYes, 1)
  assert.equal(summary.trialLimited, 1)
  assert.equal(summary.deliveryYes, 0)
  assert.equal(summary.highMaturity, 1)
  assert.equal(summary.lowMaturity, 2)
  assert.deepEqual(summary.byLayer[0], { key: 'Product Core', count: 2 })
})

test('devCapabilityLedger: 支持按关键词、层级、业务域和成熟度筛选', () => {
  const capabilities = parseCapabilityLedgerMarkdown(ledgerMarkdown)

  assert.deepEqual(
    filterCapabilityLedgerItems(capabilities, { keyword: 'tenant' }).map(
      (item) => item.id
    ),
    ['CAP-029']
  )
  assert.deepEqual(
    filterCapabilityLedgerItems(capabilities, {
      layer: 'Product Core',
      maturity: 'L3',
    }).map((item) => item.id),
    ['CAP-013']
  )
  assert.deepEqual(
    filterCapabilityLedgerItems(capabilities, {
      domain: 'Architecture / Workflow',
    }).map((item) => item.id),
    ['CAP-001']
  )
})
