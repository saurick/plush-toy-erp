import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  DEV_CAPABILITY_DIAGNOSTIC_CODES,
  DEV_CAPABILITY_EVIDENCE_SOURCE_PATH,
  DEV_CAPABILITY_LEDGER_ROUTE,
  DEV_CAPABILITY_LEDGER_SOURCE_PATH,
  DEV_CUSTOMER_DELTA_LEDGER_SOURCE_PATH,
  DEV_CUSTOMER_DELIVERY_MATRIX_SOURCE_PATH,
  buildCapabilityLedgerSummary,
  buildCustomerDeltaLedgerSummary,
  buildCustomerDeliveryMatrixSummary,
  buildDevCapabilityDocsHref,
  filterCapabilityLedgerItems,
  filterCustomerDeltaLedgerItems,
  filterCustomerDeliveryMatrixItems,
  isDevCapabilityLedgerEnabled,
  parseCapabilityEvidenceMarkdown,
  parseCapabilityLedgerMarkdown,
  parseCapabilityMaturityDefinitions,
  parseCustomerDeltaLedgerMarkdown,
  parseCustomerDeliveryMatrixMarkdown,
  selectVisibleLedgerItem,
} from './devCapabilityLedger.mjs'

const ledgerMarkdown = `
# 产品能力进度台账 / Product Capability Ledger

## 任意章节编号也不影响解析

| 能力 | 所属层 | 成熟度 | 客户可见性 | 下一步 |
| --- | --- | ---: | --- | --- |
| Workflow / Fact 边界 | Product Core | L7 | 可试用；不承诺 | 后续 shipment / finance 继续复用 |
| product_skus | Product Core | L4 | 有限试用；不承诺 | SKU API/UI review |
| Customer Config 配置形态 | Customer Config | L2-L3 | 不可试用；不承诺 | customer review |

## 能力成熟度定义

| 等级 | 名称 | 含义 | 是否可对客户承诺 |
| ---: | --- | --- | --- |
| L0 | Not Started | 未开始，只在路线图里 | 否 |
| L1 | Discussed | 已讨论，有初步口径 | 否 |
| L2 | Reviewed | 已做架构 / 业务评审 | 否 |
| L3 | Drafted | 有 schema draft / design draft / data map draft | 否 |
| L4 | Schema Ready | schema / migration / generated code 已完成 | 否 |
| L5 | Runtime Ready | repo/usecase 已完成，后端核心逻辑可测 | 内部可测 |
| L6 | API Ready | API/RBAC 已完成 | 内部可联调 |
| L7 | UI Ready | 前端页面可操作 | 可试用，但需标边界 |
| L8 | Delivery Ready | 交付闭环完整 | 可对客户承诺 |
`

const evidenceMarkdown = `
# 产品能力证据详情 / Product Capability Evidence Details

### Workflow / Fact 边界

- 所属层 / 业务域：Product Core / Architecture / Workflow
- 当前成熟度：L7
- 当前结果：已明确 \`workflow done != fact posted\`
- 当前不包含：不代表 shipment facts 已实现
- 证据：\`docs/architecture/状态工作流事实边界.md\`
- 下一步：后续 shipment / finance 继续复用
- 风险：UI 文案可能误导
- 客户试用 / 交付承诺：是 / 否

### product_skus

- 所属层 / 业务域：Product Core / Product / SKU
- 当前成熟度：L4
- 当前结果：已落 schema / migration
- 当前不包含：未接导入自动创建
- 证据：roadmap
- 下一步：SKU API/UI review
- 风险：不能因颜色字段直接落 SKU
- 客户试用 / 交付承诺：有限 / 否

### Customer Config 配置形态

- 所属层 / 业务域：Customer Config / Productization
- 当前成熟度：L2-L3
- 当前结果：草案配置
- 当前不包含：不新增 tenant_id
- 证据：产品能力进度台账
- 下一步：customer review
- 风险：被误读为 Runtime Tenant
- 客户试用 / 交付承诺：否 / 否
`

const deliveryMatrixMarkdown = `
# yoyoosun 客户交付矩阵 / yoyoosun Delivery Matrix

## 标题编号可以调整

| 模块 / 能力 | 当前状态 | 客户可见承诺 | 验收证据 | 风险 / 下一步 |
| --- | --- | --- | --- | --- |
| 客户主数据 | 可试用 | 可创建客户；使用模拟数据 | V1 页面、本地测试 | 真实导入不可执行 |
| 正式菜单入口 | 已交付 | 正式菜单可访问 | 客户验收记录 | 持续核对权限 |
| 客户扩展边界 | 未开始 | 当前不承诺 | 无 | 真实需求出现后再评审 |
`

const deltaLedgerMarkdown = `
# yoyoosun 客户差异台账 / yoyoosun Delta Ledger

## 标题编号可以调整

| Delta ID | Customer | 差异/需求 | 来源 | 分类 | 当前判断 | 是否进入 Product Core | 处理方式 | 前置条件 | 风险 | 下一步 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DELTA-YOYOOSUN-004 | yoyoosun | 客户 / 供应商 / 联系人正式主数据 | V1 需求 | Product Core | 已进入 V1 | 是 | 已做 V1 能力 | 已完成基础链路 | 后续字段扩张风险 | 地址/账期另评审 |
| DELTA-YOYOOSUN-006 | yoyoosun | 颜色、尺寸、客户款号 | Excel/订单字段线索 | Industry Template Candidate / Deferred | SKU schema 已落，但不自动创建 | 暂不进入运行时写入 | 作为 SKU 评审输入 | product_sku runtime review | 过早建 SKU | SKU API/UI review |
| DELTA-YOYOOSUN-027 | yoyoosun | 客户配置包 / 配置 loader | 产品化交付需要 | Customer Config | 品牌配置 loader 已接入前端 | 否 | 不新增 tenant_id | 字段 / 编号配置评审 | 被误读为 Runtime Tenant / SaaS | customer field review |
`

const currentLedgerMarkdown = readFileSync(
  new URL('../../../../docs/product/产品能力进度台账.md', import.meta.url),
  'utf8'
)
const currentEvidenceMarkdown = readFileSync(
  new URL('../../../../docs/product/产品能力证据详情.md', import.meta.url),
  'utf8'
)
const currentDeliveryMarkdown = readFileSync(
  new URL(
    '../../../../docs/customers/yoyoosun/客户交付矩阵.md',
    import.meta.url
  ),
  'utf8'
)
const currentDeltaMarkdown = readFileSync(
  new URL(
    '../../../../docs/customers/yoyoosun/客户差异台账.md',
    import.meta.url
  ),
  'utf8'
)
const capabilityPageSource = readFileSync(
  new URL('../pages/DevCapabilityLedgerPage.jsx', import.meta.url),
  'utf8'
)

test('devCapabilityLedger: 只通过开发态独立路径暴露四份只读真源', () => {
  assert.equal(DEV_CAPABILITY_LEDGER_ROUTE, '/__dev/capability-ledger')
  assert.equal(
    DEV_CAPABILITY_LEDGER_SOURCE_PATH,
    'docs/product/产品能力进度台账.md'
  )
  assert.equal(
    DEV_CAPABILITY_EVIDENCE_SOURCE_PATH,
    'docs/product/产品能力证据详情.md'
  )
  assert.equal(
    DEV_CUSTOMER_DELIVERY_MATRIX_SOURCE_PATH,
    'docs/customers/yoyoosun/客户交付矩阵.md'
  )
  assert.equal(
    DEV_CUSTOMER_DELTA_LEDGER_SOURCE_PATH,
    'docs/customers/yoyoosun/客户差异台账.md'
  )
  assert.equal(isDevCapabilityLedgerEnabled({ DEV: true }), true)
  assert.equal(isDevCapabilityLedgerEnabled({ DEV: false }), false)
  assert(!DEV_CAPABILITY_LEDGER_ROUTE.startsWith('/erp/'))
})

test('devCapabilityLedger: 按当前表头签名解析能力快查并精确连接证据详情', () => {
  const result = parseCapabilityLedgerMarkdown(ledgerMarkdown, evidenceMarkdown)
  const { items } = result

  assert.equal(result.diagnostics.length, 0)
  assert.equal(items.length, 3)
  assert.deepEqual(
    items.map((item) => item.name),
    ['Workflow / Fact 边界', 'product_skus', 'Customer Config 配置形态']
  )
  assert(items.every((item) => item.detailMatched))
  assert.equal(items[0].domain, 'Architecture / Workflow')
  assert.equal(items[0].currentResult, '已明确 workflow done != fact posted')
  assert.equal(items[0].maturityMax, 7)
  assert.equal(items[1].maturityBucket, 'L4')
  assert.equal(items[2].maturityMin, 2)
  assert.equal(items[2].maturityMax, 3)
  assert.equal(items[1].trialStatus, 'limited')
  assert.equal(items[2].trialStatus, 'no')
  assert.equal(items[0].deliveryStatus, 'no')
  assert.match(items[2].searchText, /runtime tenant/)
})

test('devCapabilityLedger: 汇总成熟度、试用、承诺和详情对齐状态', () => {
  const { items } = parseCapabilityLedgerMarkdown(
    ledgerMarkdown,
    evidenceMarkdown
  )
  const summary = buildCapabilityLedgerSummary(items)

  assert.equal(summary.total, 3)
  assert.equal(summary.trialYes, 1)
  assert.equal(summary.trialLimited, 1)
  assert.equal(summary.deliveryYes, 0)
  assert.equal(summary.highMaturity, 1)
  assert.equal(summary.lowMaturity, 1)
  assert.equal(summary.detailMatched, 3)
  assert.equal(summary.detailMissing, 0)
  assert.deepEqual(summary.byLayer[0], { key: 'Product Core', count: 2 })
})

test('devCapabilityLedger: 从正式台账解析完整 L0-L8 成熟度定义', () => {
  const result = parseCapabilityMaturityDefinitions(ledgerMarkdown)

  assert.equal(result.diagnostics.length, 0)
  assert.deepEqual(
    result.items.map((item) => item.level),
    ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8']
  )
  assert.equal(result.items[1].name, 'Discussed')
  assert.equal(result.items[7].meaning, '前端页面可操作')
  assert.equal(result.items[8].customerCommitment, '可对客户承诺')
})

test('devCapabilityLedger: 支持按关键词、层级、业务域和成熟度筛选', () => {
  const { items } = parseCapabilityLedgerMarkdown(
    ledgerMarkdown,
    evidenceMarkdown
  )

  assert.deepEqual(
    filterCapabilityLedgerItems(items, { keyword: 'tenant' }).map(
      (item) => item.name
    ),
    ['Customer Config 配置形态']
  )
  assert.deepEqual(
    filterCapabilityLedgerItems(items, {
      layer: 'Product Core',
      maturity: 'L4',
    }).map((item) => item.name),
    ['product_skus']
  )
  assert.deepEqual(
    filterCapabilityLedgerItems(items, {
      domain: 'Architecture / Workflow',
    }).map((item) => item.name),
    ['Workflow / Fact 边界']
  )
})

test('devCapabilityLedger: 按当前中文表头解析客户交付矩阵，不伪造 CAP 关系', () => {
  const result = parseCustomerDeliveryMatrixMarkdown(deliveryMatrixMarkdown)
  const summary = buildCustomerDeliveryMatrixSummary(result.items)

  assert.equal(result.diagnostics.length, 0)
  assert.equal(result.items.length, 3)
  assert.equal(result.items[0].customerKey, 'yoyoosun')
  assert.equal(result.items[1].customerDeliveryStatus, '已交付')
  assert.equal('capabilityIds' in result.items[1], false)
  assert.match(result.items[2].searchText, /真实需求/)
  assert.equal(summary.total, 3)
  assert.equal(summary.trialReady, 1)
  assert.equal(summary.delivered, 1)
  assert.equal(summary.notStarted, 1)
  assert.deepEqual(
    filterCustomerDeliveryMatrixItems(result.items, {
      status: '未开始',
    }).map((item) => item.moduleName),
    ['客户扩展边界']
  )
})

test('devCapabilityLedger: 按表头签名解析客户差异台账且不从正文猜 CAP 关系', () => {
  const result = parseCustomerDeltaLedgerMarkdown(deltaLedgerMarkdown)
  const summary = buildCustomerDeltaLedgerSummary(result.items)

  assert.equal(result.diagnostics.length, 0)
  assert.equal(result.items.length, 3)
  assert.equal('capabilityIds' in result.items[1], false)
  assert.equal(result.items[2].productCoreDecision, '否')
  assert.equal(summary.total, 3)
  assert.equal(summary.productCoreYes, 1)
  assert.equal(summary.productCoreCandidates, 1)
  assert.equal(summary.deferredOrForbidden, 1)
  assert.deepEqual(
    filterCustomerDeltaLedgerItems(result.items, {
      category: 'Customer Config',
    }).map((item) => item.id),
    ['DELTA-YOYOOSUN-027']
  )
  assert.deepEqual(
    filterCustomerDeltaLedgerItems(result.items, {
      keyword: 'sku',
      coreDecision: '暂不进入运行时写入',
    }).map((item) => item.id),
    ['DELTA-YOYOOSUN-006']
  )
})

test('devCapabilityLedger: 表头漂移返回显式 schema diagnostic 而不是静默空数组', () => {
  const result = parseCapabilityLedgerMarkdown(
    ledgerMarkdown.replace('| 能力 | 所属层 |', '| 能力名称 | 所属层 |'),
    evidenceMarkdown
  )

  assert.deepEqual(result.items, [])
  assert(
    result.diagnostics.some(
      (item) =>
        item.code === DEV_CAPABILITY_DIAGNOSTIC_CODES.SOURCE_SCHEMA_MISMATCH &&
        item.severity === 'error'
    )
  )
})

test('devCapabilityLedger: 详情只按完全同名标题对齐，不做模糊匹配', () => {
  const quickSource = ledgerMarkdown.replace(
    'Workflow / Fact 边界',
    'Workflow / Fact 边界增强'
  )
  const result = parseCapabilityLedgerMarkdown(quickSource, evidenceMarkdown)
  const renamedItem = result.items[0]
  const missing = result.diagnostics.find(
    (item) => item.code === DEV_CAPABILITY_DIAGNOSTIC_CODES.DETAIL_MISSING
  )
  const orphan = result.diagnostics.find(
    (item) => item.code === DEV_CAPABILITY_DIAGNOSTIC_CODES.DETAIL_ORPHAN
  )

  assert.equal(renamedItem.detailMatched, false)
  assert.deepEqual(missing?.names, ['Workflow / Fact 边界增强'])
  assert.deepEqual(orphan?.names, ['Workflow / Fact 边界'])
})

test('devCapabilityLedger: 真实四份 Markdown 保持可解析且能力标题完全对齐', () => {
  const evidenceResult = parseCapabilityEvidenceMarkdown(
    currentEvidenceMarkdown
  )
  const capabilityResult = parseCapabilityLedgerMarkdown(
    currentLedgerMarkdown,
    currentEvidenceMarkdown
  )
  const deliveryResult = parseCustomerDeliveryMatrixMarkdown(
    currentDeliveryMarkdown
  )
  const deltaResult = parseCustomerDeltaLedgerMarkdown(currentDeltaMarkdown)
  assert.equal(evidenceResult.items.length, 38)
  assert.equal(
    evidenceResult.items.filter((item) => item.structured).length,
    38
  )
  assert.equal(capabilityResult.items.length, 38)
  assert.equal(capabilityResult.maturityDefinitions.length, 9)
  assert.equal(deliveryResult.items.length, 25)
  assert.equal(deltaResult.items.length, 27)
  assert.equal(
    capabilityResult.diagnostics.filter((item) => item.severity === 'error')
      .length,
    0
  )
  assert.equal(deliveryResult.diagnostics.length, 0)
  assert.equal(deltaResult.diagnostics.length, 0)
  assert.equal(capabilityResult.diagnostics.length, 0)
})

test('devCapabilityLedger: 当前筛选为空时不回退到筛选外详情', () => {
  const { items } = parseCapabilityLedgerMarkdown(
    ledgerMarkdown,
    evidenceMarkdown
  )

  assert.equal(selectVisibleLedgerItem([], items[0].key), null)
  assert.equal(selectVisibleLedgerItem(items, 'missing')?.key, items[0].key)
})

test('devCapabilityLedger: 真源路径可跳到开发文档查看器', () => {
  assert.equal(
    buildDevCapabilityDocsHref(DEV_CAPABILITY_EVIDENCE_SOURCE_PATH),
    '/__dev/docs?path=docs%2Fproduct%2F%E4%BA%A7%E5%93%81%E8%83%BD%E5%8A%9B%E8%AF%81%E6%8D%AE%E8%AF%A6%E6%83%85.md'
  )
})

test('devCapabilityLedger: view 和 item 由 canonical query 驱动', () => {
  assert.match(capabilityPageSource, /useSearchParams\(\)/)
  assert.match(capabilityPageSource, /const VIEW_QUERY_KEY = 'view'/)
  assert.match(capabilityPageSource, /const ITEM_QUERY_KEY = 'item'/)
  assert.match(capabilityPageSource, /const ANALYSIS_QUERY_KEY = 'analysis'/)
  assert.match(capabilityPageSource, /showAnalysis \? '收起分布分析'/)
  assert.match(capabilityPageSource, /showAnalysis && activeView ===/)
  assert.match(
    capabilityPageSource,
    /requestedView = searchParams\.get\(VIEW_QUERY_KEY\)/
  )
  assert.match(
    capabilityPageSource,
    /requestedItemKey = searchParams\.get\(ITEM_QUERY_KEY\)/
  )
  assert.match(
    capabilityPageSource,
    /setSearchParams\(nextParams, \{ replace: true \}\)/
  )
  assert.doesNotMatch(
    capabilityPageSource,
    /\[\s*activeView\s*,\s*setActiveView\s*\]/
  )
  assert.doesNotMatch(
    capabilityPageSource,
    /\[\s*selectedCapabilityKey\s*,\s*setSelectedCapabilityKey\s*\]/
  )
  assert.doesNotMatch(
    capabilityPageSource,
    /\[\s*selectedDeliveryKey\s*,\s*setSelectedDeliveryKey\s*\]/
  )
  assert.doesNotMatch(
    capabilityPageSource,
    /\[\s*selectedDeltaKey\s*,\s*setSelectedDeltaKey\s*\]/
  )
  assert.match(
    capabilityPageSource,
    /aria-current=\{item\.key === selectedKey \? 'true' : undefined\}/u
  )
})
