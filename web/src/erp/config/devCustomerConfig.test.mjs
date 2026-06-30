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
  buildCustomerPackageConsoleSummary,
  buildCustomerPackagePreviewSummary,
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
  assert.equal(summary.writesBusinessData, false)
  assert.equal(summary.writesDatabase, true)
  assert.equal(summary.canRunUiDryRun, true)
  assert.equal(summary.canApplyTestConfig, true)
  assert.equal(summary.canCheckReleaseReadiness, true)
  assert.equal(summary.uiDryRunApiPath, '/__dev/api/customer-import/dry-run')
  assert.equal(
    summary.uiRuntimeManifestApiPath,
    '/__dev/api/customer-config/runtime-manifest'
  )
  assert.equal(
    summary.uiReleaseReadinessApiPath,
    '/__dev/api/customer-config/release-readiness'
  )
  assert.equal(summary.testApply.status, 'test_apply_ready')
  assert.equal(summary.testApply.target, '测试环境 ERP 应用数据库')
  assert.equal(summary.testApply.noBusinessDataImport, true)
  assert.deepEqual(summary.testApply.operations, [
    'compile_runtime_manifest',
    'validate_customer_config',
    'publish_customer_config',
    'activate_customer_config',
    'get_effective_session',
  ])
  assert.equal(summary.releaseApply.status, 'release_gate_required')
  assert.equal(summary.releaseApply.target, '目标环境 ERP 应用数据库')
  assert.equal(summary.releaseApply.noBusinessDataImport, true)
  assert.deepEqual(summary.releaseApply.operations, [
    'release_readiness_gate',
    'validate_customer_config',
    'publish_customer_config',
    'activate_customer_config',
    'get_effective_session',
  ])
  assert.equal(summary.qaCommand, DEV_CUSTOMER_CONFIG_QA_COMMAND)
  assert.deepEqual(
    summary.importFlow.map((item) => item.status),
    [
      'passed',
      'passed',
      'preview_only',
      'test_apply_ready',
      'release_gate_required',
    ]
  )
  assert.deepEqual(
    summary.importFlow.map((item) => item.writesDatabase),
    [false, false, false, true, true]
  )
  assert.deepEqual(
    summary.databaseTargets.map((item) => item.status),
    [
      'no_write',
      'test_apply_ready',
      'release_gate_required',
      'release_gate_required',
      'separate_task_required',
    ]
  )
  assert(
    summary.databaseTargets.some(
      (item) =>
        item.key === 'customer-config-publish' &&
        item.target === '目标环境 ERP 应用数据库' &&
        item.writes.includes('customer_config_revisions') &&
        item.reason.includes('get_effective_session')
    )
  )
  assert(
    summary.databaseTargets.some(
      (item) =>
        item.key === 'business-data-import' &&
        item.status === 'separate_task_required'
    )
  )
  assert.deepEqual(
    summary.formalGates.map((item) => item.status),
    ['required', 'required', 'required', 'separate_task_required']
  )
  assert.deepEqual(
    summary.tools.map((item) => item.status),
    [
      'evidence_only',
      'preview_only',
      'report_gate_only',
      'release_gate_required',
      'release_gate_required',
    ]
  )
  assert(
    summary.tools
      .filter((item) =>
        ['freeze', 'dry-run', 'execute-report'].includes(item.key)
      )
      .every((item) => item.command.includes('scripts/import'))
  )
  const executeReport = summary.tools.find(
    (item) => item.key === 'execute-report'
  )
  assert(executeReport.command.includes('--dry-run-package'))
  assert(!executeReport.command.includes('--dry-run '))
  assert(executeReport.command.includes('--backup-evidence'))
  const rollbackReadiness = summary.tools.find(
    (item) => item.key === 'release-rollback-readiness'
  )
  assert(rollbackReadiness.command.includes('--require-rollback'))
  assert(rollbackReadiness.command.includes('--release-report'))
  const rollbackExecute = summary.tools.find(
    (item) => item.key === 'release-rollback-execute'
  )
  assert(rollbackExecute.command.includes('ROLLBACK_YOYOOSUN_CONFIG'))
  assert(rollbackExecute.command.includes('--execute --rollback'))
})

test('devCustomerConfig: 客户配置包流程结构只作为 preview', () => {
  const summary = buildCustomerPackagePreviewSummary()

  assert.equal(summary.customerKey, 'yoyoosun')
  assert.equal(summary.status, 'draft')
  assert.equal(summary.runtimeEnabled, false)
  assert.equal(summary.previewOnly, true)
  assert.equal(summary.publishEnabled, false)
  assert.equal(summary.activateEnabled, false)
  assert.equal(summary.rollbackEnabled, false)
  assert.equal(summary.workflowCount, 4)
  assert.equal(summary.workflowNodeCount, 18)
  assert.equal(summary.businessFlowCount, 4)
  assert.equal(summary.stateMachineCount, 3)
  assert.equal(summary.processPolicyCount, 3)
  assert.equal(
    summary.workflows.find((item) => item.key === 'sales_order_approval')
      ?.factBoundary,
    'workflow_only'
  )
  assert.equal(
    summary.workflows.find((item) => item.key === 'finished_goods_delivery')
      ?.factBoundary,
    'workflow_only'
  )
  assert(summary.qaCommand.includes('customer-package-lint.mjs'))
  assert.deepEqual(
    summary.boundaries.map((item) => item.ok),
    summary.boundaries.map(() => true)
  )
  assert.equal(summary.boundaryOk, true)
})

test('devCustomerConfig: 配置包预检控制台只展示 preview / blocked 门禁', () => {
  const overview = buildCustomerConfigDevOverview()
  const summary = buildCustomerPackageConsoleSummary({
    menuSummary: overview.menuSummary,
    fieldNumberingSummary: overview.fieldNumberingSummary,
    customerPackageSummary: overview.customerPackageSummary,
    importSummary: overview.importSummary,
  })

  assert.equal(summary.primaryStatus, 'PREVIEW_READY')
  assert.equal(summary.reviewDecision.status, 'REVIEW_READY')
  assert.match(summary.reviewDecision.summary, /正式发布必须先通过/)
  assert.deepEqual(
    summary.decisionCards.map((item) => item.status),
    ['REVIEW_READY', 'blocked_by_design', 'release_gate_required']
  )
  assert.deepEqual(
    summary.preflightStages.map((item) => item.status),
    [
      'passed',
      'passed',
      'preview_only',
      'preview_only',
      'release_gate_required',
    ]
  )
  assert.deepEqual(
    summary.assetSummary.map((item) => item.status),
    ['runtime_frontend_only', 'draft_only', 'preview_only', 'preview_only']
  )
  assert(summary.validationChecks.some((item) => item.key === 'real-import'))
  assert(
    summary.diffItems.every((item) =>
      [
        'runtime_frontend_only',
        'draft_only',
        'preview_only',
        'report_gate_only',
      ].includes(item.status)
    )
  )
  assert.deepEqual(
    summary.versionGates.map((item) => item.enabled),
    [false, false, false]
  )
  assert.deepEqual(
    summary.reviewChecklist.map((item) => item.status),
    [
      'passed',
      'draft_only',
      'preview_only',
      'report_gate_only',
      'release_gate_required',
    ]
  )
  assert(
    summary.qaCommands.some((item) =>
      item.command.includes(
        '--out output/customers/yoyoosun/customer-package-preview.json'
      )
    )
  )
  assert.deepEqual(
    summary.sourceReferences.map((item) => item.status),
    ['runtime_frontend_only', 'draft_only', 'preview_only', 'report_gate_only']
  )
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
    ['field-numbering', 'process-package']
  )
  assert.deepEqual(
    overview.blockedPieces.map((item) => item.key),
    ['real-import', 'saas-tenant']
  )
  assert.equal(overview.packageConsoleSummary.primaryStatus, 'PREVIEW_READY')
})
