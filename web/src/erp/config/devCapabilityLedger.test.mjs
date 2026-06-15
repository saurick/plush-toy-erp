import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEV_CAPABILITY_LEDGER_ROUTE,
  DEV_CAPABILITY_LEDGER_SOURCE_PATH,
  DEV_CUSTOMER_DELTA_LEDGER_SOURCE_PATH,
  DEV_CUSTOMER_DELIVERY_MATRIX_SOURCE_PATH,
  buildCapabilityLedgerSummary,
  buildCustomerDeltaLedgerSummary,
  buildCustomerDeliveryMatrixSummary,
  filterCapabilityLedgerItems,
  filterCustomerDeltaLedgerItems,
  filterCustomerDeliveryMatrixItems,
  isDevCapabilityLedgerEnabled,
  parseCapabilityLedgerMarkdown,
  parseCustomerDeltaLedgerMarkdown,
  parseCustomerDeliveryMatrixMarkdown,
} from './devCapabilityLedger.mjs'

const ledgerMarkdown = `
# 产品能力进度台账 / Product Capability Ledger

## 4. 产品能力进度台账

| Capability ID | 能力名称 | 所属层 | 业务域 | 当前成熟度 | 当前结果 | 当前不包含 | 证据 | 下一步 | 风险 | 可客户试用 | 可交付承诺 |
| ------------- | -------- | ------ | ------ | ---------: | -------- | ---------- | ---- | ------ | ---- | ------------ | ---------- |
| CAP-001 | Workflow / Fact 边界 | Product Core | Architecture / Workflow | L7 | 已明确 \`workflow done != fact posted\` | 不代表 shipment facts 已实现 | \`docs/architecture/状态工作流事实边界.md\` | 后续 shipment / finance 继续复用 | UI 文案可能误导 | Yes | No |
| CAP-013 | product_skus | Product Core | Product / SKU | L4 | 已落 schema / migration | 未接 API / UI / 导入自动创建 | roadmap | SKU API/UI review | 不能因颜色字段直接落 SKU | Limited | No |
| CAP-029 | Customer Config 配置形态 | Customer Config | Productization | L2-L3 | 草案配置 | 不新增 \`tenant_id\` | \`docs/product/产品能力进度台账.md\` | customer review | 被误读为 Runtime Tenant | Limited | No |

---

# 第二部分：客户交付矩阵
`

const deliveryMatrixMarkdown = `
# yoyoosun 客户交付矩阵 / yoyoosun Delivery Matrix

## 6. 客户交付矩阵：yoyoosun

| Customer Key | 模块 / 能力 | 产品能力 ID | 交付状态 | 当前客户可见方式 | 交付结果 | 不包含 | 前置条件 | 客户确认项 | 风险 |
| ------------ | ----------- | ----------- | -------- | ---------------- | -------- | ------ | -------- | ---------- | ---- |
| yoyoosun | 客户主数据 | CAP-003 | Trial Ready | 桌面正式菜单 | 可创建客户 | 真实导入不可执行 | 模拟数据 | 客户编码规则 | 模拟数据误读 |
| yoyoosun | 正式菜单入口 | CAP-010 / CAP-011 | Target Released | 桌面正式菜单 | 菜单配置已接入 | 不创建真实账号 | trial feedback | 试用账号核对 | 权限误配 |
| yoyoosun | 客户扩展边界 | CAP-030 | Not Planned | 无 | 当前没有专属 extension | 不创建 extension runtime | 真实需求 | 暂无 | 过早造层 |

---
`

const deltaLedgerMarkdown = `
# yoyoosun 客户差异台账 / yoyoosun Delta Ledger

## 8. 客户差异台账：yoyoosun

| Delta ID | Customer | 差异/需求 | 来源 | 分类 | 当前判断 | 是否进入 Product Core | 处理方式 | 前置条件 | 风险 | 下一步 |
| -------- | -------- | --------- | ---- | ---- | -------- | --------------------- | -------- | -------- | ---- | ------ |
| DELTA-YOYOOSUN-004 | yoyoosun | 客户 / 供应商 / 联系人正式主数据 | V1 需求 | Product Core | 已进入 V1 | 是 | 已做 V1 能力 | 已完成基础链路 | 后续字段扩张风险 | 地址/账期另评审 |
| DELTA-YOYOOSUN-006 | yoyoosun | 颜色、尺寸、客户款号 | Excel/订单字段线索 | Industry Template Candidate / Deferred | SKU schema 已落，但不自动创建 | 暂不进入运行时写入 | 作为 CAP-013 评审输入 | product_sku runtime review | 过早建 SKU | SKU API/UI review |
| DELTA-YOYOOSUN-027 | yoyoosun | 客户配置包 / 配置 loader | 产品化交付需要 | Customer Config | 品牌配置 loader 已接入前端 | 否 | 不新增 tenant_id | 字段 / 编号配置评审 | 被误读为 Runtime Tenant / SaaS | customer field review |

---
`

test('devCapabilityLedger: 只通过开发态独立路径暴露', () => {
  assert.equal(DEV_CAPABILITY_LEDGER_ROUTE, '/__dev/capability-ledger')
  assert.equal(
    DEV_CAPABILITY_LEDGER_SOURCE_PATH,
    'docs/product/产品能力进度台账.md'
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
  assert.equal(capabilities[1].maturityBucket, 'L4')
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
  assert.equal(summary.trialLimited, 2)
  assert.equal(summary.deliveryYes, 0)
  assert.equal(summary.highMaturity, 1)
  assert.equal(summary.lowMaturity, 1)
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
      maturity: 'L4',
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

test('devCapabilityLedger: 解析 yoyoosun 客户交付矩阵并提取能力关联', () => {
  const deliveryItems = parseCustomerDeliveryMatrixMarkdown(
    deliveryMatrixMarkdown
  )
  const summary = buildCustomerDeliveryMatrixSummary(deliveryItems)

  assert.equal(deliveryItems.length, 3)
  assert.deepEqual(deliveryItems[1].capabilityIds, ['CAP-010', 'CAP-011'])
  assert.equal(deliveryItems[1].customerDeliveryStatus, 'Target Released')
  assert.match(deliveryItems[2].searchText, /extension runtime/)
  assert.equal(summary.total, 3)
  assert.equal(summary.trialReady, 1)
  assert.equal(summary.targetReleased, 1)
  assert.equal(summary.blockedOrDeferred, 1)
  assert.equal(summary.linkedCapabilities, 3)
  assert.deepEqual(
    filterCustomerDeliveryMatrixItems(deliveryItems, {
      capabilityId: 'CAP-011',
    }).map((item) => item.moduleName),
    ['正式菜单入口']
  )
  assert.deepEqual(
    filterCustomerDeliveryMatrixItems(deliveryItems, {
      status: 'Not Planned',
    }).map((item) => item.moduleName),
    ['客户扩展边界']
  )
})

test('devCapabilityLedger: 解析 yoyoosun 客户差异台账并保持显式能力关联', () => {
  const deltaItems = parseCustomerDeltaLedgerMarkdown(deltaLedgerMarkdown)
  const summary = buildCustomerDeltaLedgerSummary(deltaItems)

  assert.equal(deltaItems.length, 3)
  assert.deepEqual(deltaItems[0].capabilityIds, [])
  assert.deepEqual(deltaItems[1].capabilityIds, ['CAP-013'])
  assert.equal(deltaItems[2].productCoreDecision, '否')
  assert.equal(summary.total, 3)
  assert.equal(summary.productCoreYes, 1)
  assert.equal(summary.productCoreCandidates, 1)
  assert.equal(summary.deferredOrForbidden, 1)
  assert.equal(summary.linkedCapabilities, 1)
  assert.deepEqual(
    filterCustomerDeltaLedgerItems(deltaItems, {
      category: 'Customer Config',
    }).map((item) => item.id),
    ['DELTA-YOYOOSUN-027']
  )
  assert.deepEqual(
    filterCustomerDeltaLedgerItems(deltaItems, {
      keyword: 'sku',
      coreDecision: '暂不进入运行时写入',
    }).map((item) => item.id),
    ['DELTA-YOYOOSUN-006']
  )
})
