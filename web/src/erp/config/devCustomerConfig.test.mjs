import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_DEV_CUSTOMER_KEY,
  DEV_CUSTOMER_CONFIG_QA_COMMAND,
  DEV_CUSTOMER_CONFIG_REGISTRY,
  DEV_CUSTOMER_CONFIG_ROUTE,
  buildCustomerConfigDevOverview,
  buildCustomerConfigDevOverviewFromSearch,
  buildCustomerMenuRuntimeSummary,
  buildFieldNumberingDraftSummary,
  buildImportToolingSummary,
  isDevCustomerConfigEnabled,
  listRegisteredDevCustomerPackages,
  readDevCustomerKeyFromSearch,
  resolveDevCustomerConfigPackage,
} from './devCustomerConfig.mjs'

test('devCustomerConfig: 只通过开发态独立路径暴露', () => {
  assert.equal(DEV_CUSTOMER_CONFIG_ROUTE, '/__dev/customer-config')
  assert.equal(isDevCustomerConfigEnabled({ DEV: true }), true)
  assert.equal(isDevCustomerConfigEnabled({ DEV: false }), false)
  assert(!DEV_CUSTOMER_CONFIG_ROUTE.startsWith('/erp/'))
})

test('devCustomerConfig: 汇总已接前端运行时的 yoyoosun 菜单配置', () => {
  const summary = buildCustomerMenuRuntimeSummary()

  assert.equal(summary.customerKey, 'yoyoosun')
  assert.equal(summary.brand.companyName, '东莞市永绅玩具有限公司')
  assert.equal(summary.runtimeStatus, 'runtime_frontend_only')
  assert.equal(summary.sectionCount, 13)
  assert.equal(summary.itemCount, 28)
  assert.deepEqual(
    summary.sections.map((section) => section.title),
    [
      '看板中心',
      '主数据',
      '销售管理',
      '产品工程',
      '采购管理',
      '质检管理',
      '库存管理',
      '委外管理',
      '生产管理',
      '出货管理',
      '财务业务',
      '运营工具',
      '系统管理',
    ]
  )
  assert(summary.sections.some((section) => section.title === '系统管理'))
  assert(summary.sections.some((section) => section.title === '库存管理'))
  assert(
    summary.sections.some(
      (section) =>
        section.title === '主数据' && section.items.includes('materials')
    )
  )
  assert(
    summary.sections.some(
      (section) =>
        section.title === '产品工程' && section.items.includes('processes')
    )
  )
  assert(
    summary.sections.some(
      (section) =>
        section.title === '出货管理' && section.items.includes('shipments')
    )
  )
  assert(!summary.sections.some((section) => section.title === '采购/仓储'))
})

test('devCustomerConfig: 默认客户包为 yoyoosun', () => {
  assert.equal(DEFAULT_DEV_CUSTOMER_KEY, 'yoyoosun')
  assert.equal(readDevCustomerKeyFromSearch(''), 'yoyoosun')

  const overview = buildCustomerConfigDevOverview()
  assert.equal(overview.status, 'ready')
  assert.equal(overview.customerKey, 'yoyoosun')
  assert.equal(overview.requestedCustomerKey, 'yoyoosun')
  assert.equal(overview.registeredCustomers.length, 1)
})

test('devCustomerConfig: query customer=yoyoosun 能解析到登记客户包', () => {
  assert.equal(readDevCustomerKeyFromSearch('?customer=yoyoosun'), 'yoyoosun')

  const overview =
    buildCustomerConfigDevOverviewFromSearch('?customer=yoyoosun')
  assert.equal(overview.status, 'ready')
  assert.equal(overview.customerKey, 'yoyoosun')
  assert.equal(overview.sourcePath, 'config/customers/yoyoosun/README.md')
})

test('devCustomerConfig: 未登记客户返回 missing 且不 fallback 到 yoyoosun', () => {
  const resolved = resolveDevCustomerConfigPackage('unknown-customer')
  assert.equal(resolved.status, 'missing')
  assert.equal(resolved.customerKey, 'unknown-customer')
  assert.equal(resolved.packageConfig, null)

  const overview = buildCustomerConfigDevOverviewFromSearch(
    '?customer=unknown-customer'
  )
  assert.equal(overview.status, 'missing')
  assert.equal(overview.customerKey, 'unknown-customer')
  assert.equal(overview.requestedCustomerKey, 'unknown-customer')
  assert.equal(overview.menuSummary, undefined)
  assert.match(overview.blockedPieces[0].boundary, /不会 fallback/)
})

test('devCustomerConfig: registry 暴露已登记客户列表', () => {
  assert.deepEqual(Object.keys(DEV_CUSTOMER_CONFIG_REGISTRY), ['yoyoosun'])
  assert.deepEqual(listRegisteredDevCustomerPackages(), [
    {
      customerKey: 'yoyoosun',
      label: '永绅 yoyoosun',
      sourcePath: 'config/customers/yoyoosun/README.md',
    },
  ])
})

test('devCustomerConfig: 字段编号配置保持 draft 且不放开边界', () => {
  const summary = buildFieldNumberingDraftSummary()

  assert.equal(summary.customerKey, 'yoyoosun')
  assert.equal(summary.status, 'draft')
  assert.equal(summary.runtimeEnabled, false)
  assert.equal(summary.fieldModuleCount, 4)
  assert.equal(summary.fieldCandidateCount, 12)
  assert.equal(summary.numberingRuleCount, 5)
  assert.equal(summary.fieldDecisionCounts.review_required, 8)
  assert.equal(summary.fieldDecisionCounts.defer_runtime, 4)
  assert(summary.boundaries.length > 0)
  assert.deepEqual(summary.boundaries[0], {
    key: 'runtimeEnabled',
    value: false,
    expected: false,
    ok: true,
  })
  assert.deepEqual(
    summary.boundaries.map((item) => item.ok),
    summary.boundaries.map(() => true)
  )
})

test('devCustomerConfig: 导入工具只作为 evidence / report gate', () => {
  const summary = buildImportToolingSummary()

  assert.equal(summary.canExecuteRealImport, false)
  assert.equal(summary.writesDatabase, false)
  assert.equal(summary.qaCommand, DEV_CUSTOMER_CONFIG_QA_COMMAND)
  assert.deepEqual(
    summary.tools.map((item) => item.status),
    ['evidence_only', 'preview_only', 'report_gate_only']
  )
  assert(summary.tools.every((item) => item.command.includes('scripts/import')))
})

test('devCustomerConfig: 总览区分 runtime、draft 和 blocked 能力', () => {
  const overview = buildCustomerConfigDevOverview()

  assert.equal(overview.customerKey, 'yoyoosun')
  assert.deepEqual(
    overview.runtimePieces.map((item) => item.key),
    ['brand-menu']
  )
  assert.deepEqual(
    overview.draftPieces.map((item) => item.key),
    ['field-numbering']
  )
  assert.deepEqual(
    overview.blockedPieces.map((item) => item.key),
    ['real-import', 'saas-tenant']
  )
})
