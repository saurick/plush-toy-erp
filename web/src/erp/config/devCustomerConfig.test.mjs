import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEV_CUSTOMER_CONFIG_QA_COMMAND,
  DEV_CUSTOMER_CONFIG_ROUTE,
  buildCustomerConfigDevOverview,
  buildCustomerMenuRuntimeSummary,
  buildFieldNumberingDraftSummary,
  buildImportToolingSummary,
  isDevCustomerConfigEnabled,
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
  assert.equal(summary.sectionCount, 8)
  assert.equal(summary.itemCount, 23)
  assert(summary.sections.some((section) => section.title === '系统管理'))
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
