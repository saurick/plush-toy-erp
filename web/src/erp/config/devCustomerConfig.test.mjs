import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { customerPackageCatalog } from '../../../../config/catalog/customerPackageCatalog.mjs'
import {
  DEFAULT_DEV_CUSTOMER_KEY,
  DEV_CUSTOMER_CONFIG_QA_COMMAND,
  DEV_CUSTOMER_CONFIG_REGISTRY,
  DEV_CUSTOMER_CONFIG_ROUTE,
  assertCustomerConfigReadbackRevision,
  buildCustomerConfigDevOverview,
  buildCustomerConfigDevOverviewFromSearch,
  buildCustomerMenuRuntimeSummary,
  buildCustomerPackageConsoleSummary,
  buildCustomerPackagePreviewSummary,
  buildFieldNumberingDraftSummary,
  buildPrintTemplateFieldSummary,
  buildImportToolingSummary,
  isDevCustomerConfigEnabled,
  listRegisteredDevCustomerPackages,
  readDevCustomerKeyFromSearch,
  resolveDevCustomerConfigPackage,
} from './devCustomerConfig.mjs'

function collectConsoleVisibleText(summary) {
  const values = []
  const push = (value) => {
    if (typeof value === 'string' && value.trim()) values.push(value)
  }
  push(summary.reviewDecision?.summary)
  push(summary.reviewDecision?.nextAction)
  for (const item of summary.decisionCards || []) {
    push(item.label)
    push(item.outcome)
    push(item.note)
    push(item.nextAction)
  }
  for (const item of summary.preflightStages || []) {
    push(item.label)
    push(item.note)
  }
  for (const item of summary.reviewChecklist || []) {
    push(item.label)
    push(item.role)
    push(item.sourceLabel)
    push(item.nextAction)
  }
  for (const item of summary.assetSummary || []) {
    push(item.label)
    push(item.note)
  }
  for (const item of summary.sourceReferences || []) {
    push(item.label)
    push(item.sourceLabel)
  }
  for (const item of summary.validationChecks || []) {
    push(item.label)
    push(item.note)
  }
  for (const item of summary.diffItems || []) {
    push(item.type)
    push(item.current)
    push(item.incoming)
    push(item.impact)
  }
  return values.join('\n')
}

test('devCustomerConfig: 只通过开发态独立路径暴露', () => {
  assert.equal(DEV_CUSTOMER_CONFIG_ROUTE, '/__dev/customer-config')
  assert.equal(isDevCustomerConfigEnabled({ DEV: true }), true)
  assert.equal(isDevCustomerConfigEnabled({ DEV: false }), false)
  assert(!DEV_CUSTOMER_CONFIG_ROUTE.startsWith('/erp/'))
})

test('devCustomerConfig: 测试应用只接受与 manifest 完全一致的读回 revision', () => {
  const session = { configRevision: 'yoyoosun-v7' }
  assert.equal(
    assertCustomerConfigReadbackRevision(session, 'yoyoosun-v7'),
    session
  )
  assert.throws(
    () =>
      assertCustomerConfigReadbackRevision(
        { configRevision: 'yoyoosun-v6' },
        'yoyoosun-v7'
      ),
    /读回 revision 不一致/u
  )
  assert.throws(
    () => assertCustomerConfigReadbackRevision({}, 'yoyoosun-v7'),
    /实际 未返回/u
  )
  assert.throws(
    () => assertCustomerConfigReadbackRevision(session, ''),
    /清单缺少 revision/u
  )
})

test('devCustomerConfig: 汇总已接前端运行时的 yoyoosun 菜单配置', () => {
  const summary = buildCustomerMenuRuntimeSummary()

  assert.equal(summary.customerKey, 'yoyoosun')
  assert.equal(summary.brand.companyName, '东莞市永绅玩具有限公司')
  assert.equal(summary.brand.brandMark, '永')
  assert.equal(summary.sourceLabel, '客户菜单配置')
  assert.equal(summary.runtimeStatus, 'runtime_frontend_only')
  assert.equal(summary.sectionCount, 13)
  assert.equal(summary.itemCount, 30)
  assert.deepEqual(
    summary.sections.map((section) => section.title),
    [
      '看板中心',
      '基础资料',
      '销售管理',
      '产品工程',
      '采购管理',
      '质检管理',
      '库存管理',
      '委外管理',
      '生产管理',
      '出货管理',
      '财务管理',
      '运营工具',
      '系统管理',
    ]
  )
  assert(summary.sections.some((section) => section.title === '系统管理'))
  assert(summary.sections.some((section) => section.title === '库存管理'))
  assert(
    summary.sections.some(
      (section) =>
        section.title === '基础资料' && section.items.includes('materials')
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
  assert(
    summary.sections.some(
      (section) =>
        section.title === '生产管理' &&
        section.items.includes('production-orders')
    )
  )
  assert(!summary.sections.some((section) => section.title === '采购/仓储'))
})

test('devCustomerConfig: 默认不自动进入任一客户包', () => {
  assert.equal(DEFAULT_DEV_CUSTOMER_KEY, '')
  assert.equal(readDevCustomerKeyFromSearch(''), '')

  const overview = buildCustomerConfigDevOverview()
  assert.equal(overview.status, 'missing')
  assert.equal(overview.customerKey, '')
  assert.equal(overview.requestedCustomerKey, '')
  assert.equal(overview.sourceLabel, '未选择客户配置包')
  assert.equal(overview.registeredCustomers.length, 1)
  assert.equal(overview.blockedPieces[0].key, 'customer-package-not-selected')
  assert.equal(overview.blockedPieces[0].title, '未选择客户配置包')
  assert.equal(overview.blockedPieces[0].status, '未选择')
  assert.match(overview.blockedPieces[0].boundary, /不会 fallback/)
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
  assert.equal(overview.sourceLabel, '未登记客户配置包')
  assert.equal(overview.menuSummary, undefined)
  assert.equal(overview.blockedPieces[0].key, 'missing-customer-package')
  assert.equal(overview.blockedPieces[0].title, '未登记客户配置包')
  assert.equal(overview.blockedPieces[0].status, '未登记')
  assert.match(overview.blockedPieces[0].boundary, /不会 fallback/)
})

test('devCustomerConfig: registry 暴露已登记客户列表', () => {
  assert.deepEqual(Object.keys(DEV_CUSTOMER_CONFIG_REGISTRY), ['yoyoosun'])
  assert.deepEqual(listRegisteredDevCustomerPackages(), [
    {
      customerKey: 'yoyoosun',
      label: '永绅 yoyoosun',
      sourcePath: 'config/customers/yoyoosun/README.md',
      sourceLabel: '客户配置包说明',
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
    label: '运行时启用',
    value: false,
    valueLabel: '否',
    expected: false,
    expectedLabel: '否',
    ok: true,
  })
  assert.deepEqual(
    summary.boundaries.map((item) => item.ok),
    summary.boundaries.map(() => true)
  )
})

test('devCustomerConfig: 导入工具只作为 evidence / report gate', () => {
  const defaultSummary = buildImportToolingSummary()
  assert.equal(defaultSummary.canRunUiDryRun, false)
  assert.equal(defaultSummary.canApplyTestConfig, false)
  assert.equal(defaultSummary.canCheckReleaseReadiness, false)
  assert.equal(defaultSummary.testApply.status, 'blocked')

  const summary = buildImportToolingSummary('yoyoosun')

  assert.equal(summary.canExecuteRealImport, false)
  assert.equal(summary.writesBusinessData, false)
  assert.equal(summary.writesBusinessDataLabel, '不写业务数据')
  assert.equal(summary.writesConfigControl, true)
  assert.equal(summary.writesConfigControlLabel, '写客户配置控制面')
  assert.equal(summary.executionBoundary, 'customer_config_control_plane_only')
  assert.equal(summary.executionBoundaryLabel, '只处理客户配置控制面')
  assert.equal(summary.canExecuteRealImportLabel, '不执行真实业务数据导入')
  assert.deepEqual(
    summary.executionFlagSummary.map((item) => [
      item.key,
      item.label,
      item.valueLabel,
    ]),
    [
      ['canExecuteRealImport', '真实业务数据导入', '不执行'],
      ['writesBusinessData', '业务数据写入', '不写业务数据'],
      ['writesConfigControl', '配置控制面写入', '允许受控写入'],
      ['executionBoundary', '执行边界', '只处理客户配置控制面'],
    ]
  )
  assert.equal(summary.notBusinessDataImport, true)
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
    summary.uiReleaseBatchesApiPath,
    '/__dev/api/customer-config/release-batches'
  )
  assert.equal(
    summary.uiReleaseReadinessApiPath,
    '/__dev/api/customer-config/release-readiness'
  )
  assert.equal(summary.testApply.status, 'test_apply_ready')
  assert.deepEqual(summary.testApply.blockedReasons, [])
  assert.match(summary.testApply.note, /loopback/)
  assert.match(summary.testApply.note, /已登记的本地开发库/)
  assert.match(summary.testApply.note, /正式目标环境不接受/)
  assert.equal(
    summary.testApply.target,
    '当前 Vite /rpc 代理后端'
  )
  assert.equal(summary.testApply.noBusinessDataImport, true)
  assert.deepEqual(summary.testApply.operations, [
    'compile_runtime_manifest',
    'validate_customer_config',
    'publish_customer_config',
    'check_customer_config_transition',
    'activate_customer_config',
    'get_effective_session',
  ])
  assert.equal(summary.releaseApply.status, 'release_gate_required')
  assert.equal(
    summary.releaseApply.target,
    '由正式执行器参数显式确认的目标环境'
  )
  assert.equal(summary.releaseApply.noBusinessDataImport, true)
  assert.deepEqual(summary.releaseApply.operations, [
    'release_readiness_gate',
    'customer_config_release_execute',
    'authenticated_readback',
    'release_report',
  ])
  assert.match(summary.releaseApply.evidenceDir, /<release-batch>$/)
  assert.match(summary.releaseApply.note, /不直接发布或激活/)
  assert.equal(summary.releaseReadbackPreflight.status, 'report_gate_only')
  assert.equal(summary.releaseReadbackPreflight.writesDatabase, false)
  assert.equal(summary.releaseReadbackPreflight.writesConfigControl, false)
  assert.equal(summary.releaseReadbackPreflight.writesBusinessData, false)
  assert.equal(summary.releaseReadbackPreflight.requiresReleaseEvidence, true)
  assert.equal(
    summary.releaseReadbackPreflight.requiresAdminConfirmation,
    false
  )
  assert.equal(
    summary.releaseReadbackPreflight.command,
    'node scripts/deploy/customer-config-release-readiness.mjs --print-input-template'
  )
  assert(!summary.releaseReadbackPreflight.command.includes('<release-batch>'))
  assert(!summary.releaseReadbackPreflight.command.includes('--execute'))
  assert(
    !summary.releaseReadbackPreflight.command.includes(
      'CUSTOMER_CONFIG_ADMIN_TOKEN'
    )
  )
  assert.match(summary.releaseReadbackPreflight.note, /不写入/)
  assert.match(summary.releaseReadbackPreflight.note, /不调用后端/)
  assert.equal(summary.qaCommand, DEV_CUSTOMER_CONFIG_QA_COMMAND)
  assert.deepEqual(
    summary.importFlow.map((item) => item.status),
    [
      'passed',
      'passed',
      'preview_only',
      'preview_only',
      'test_apply_ready',
      'release_gate_required',
    ]
  )
  assert.deepEqual(
    summary.importFlow.map((item) => item.writesDatabase),
    [false, false, false, false, true, true]
  )
  assert.deepEqual(
    summary.importFlow.map((item) => item.writeClass),
    [
      'tracked_config_read',
      'no_write_preflight',
      'no_write_diff_preview',
      'no_write_evidence',
      'test_config_control_write',
      'formal_config_control_write',
    ]
  )
  assert.deepEqual(
    summary.importFlow.map((item) => item.writesBusinessData),
    [false, false, false, false, false, false]
  )
  assert.deepEqual(
    summary.importFlow.map((item) => item.requiresReleaseEvidence),
    [false, false, false, false, false, true]
  )
  assert.deepEqual(
    summary.importFlow.map((item) => item.title),
    ['读取已登记包', '校验', '差异对比', '测试试跑', '应用测试配置', '发布']
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
        item.key === 'test-config-apply' &&
        item.target === '当前 Vite /rpc 代理后端' &&
        item.writeClass === 'test_config_control_write' &&
        item.writeClassLabel === '写当前后端配置控制面' &&
        item.writesLabel ===
          '客户配置版本、模块状态、角色画像、授权、责任池和审计记录' &&
        item.dataBoundaryLabel === '配置控制面' &&
        item.writesConfigControl === true &&
        item.writesBusinessData === false &&
        item.writesBusinessDataLabel === '不写业务数据' &&
        item.writesConfigControlLabel === '写客户配置控制面' &&
        item.requiresReleaseEvidence === false &&
        item.requiresAdminConfirmation === true &&
        item.reason.includes('当前 Vite /rpc 代理后端') &&
        item.reason.includes('正式目标环境由统一执行器显式确认')
    )
  )
  assert(
    summary.databaseTargets.some(
      (item) =>
        item.key === 'customer-config-publish' &&
        item.target === '目标环境 ERP 应用数据库' &&
        item.writeClass === 'formal_config_control_write' &&
        item.writesConfigControl === true &&
        item.writesBusinessData === false &&
        item.requiresReleaseEvidence === true &&
        item.requiresAdminConfirmation === true &&
        item.writes.includes('customer_config_revisions') &&
        item.reason.includes('客户配置投影')
    )
  )
  assert(
    summary.databaseTargets.some(
      (item) =>
        item.key === 'business-data-import' &&
        item.status === 'separate_task_required' &&
        item.writeClass === 'business_data_import_separate_task' &&
        item.writeClassLabel === '真实业务数据导入专项' &&
        item.writesLabel === '客户、供应商、联系人、销售订单等业务数据' &&
        item.dataBoundaryLabel === '业务数据导入专项' &&
        item.writesConfigControl === false &&
        item.writesBusinessData === true &&
        item.requiresSeparateTask === true
    )
  )
  assert(
    summary.databaseTargets
      .filter((item) => item.key !== 'business-data-import')
      .every((item) => item.writesBusinessData === false)
  )
  assert(
    summary.databaseTargets
      .filter((item) => item.status === 'release_gate_required')
      .every((item) => item.requiresReleaseEvidence === true)
  )
  assert.deepEqual(
    summary.formalGates.map((item) => item.status),
    [
      'required',
      'required',
      'required',
      'snapshot_supported',
      'audit_supported',
      'rollback_supported',
      'separate_task_required',
    ]
  )
  assert.deepEqual(
    summary.versionAuditSupport.map((item) => item.status),
    [
      'snapshot_supported',
      'test_apply_ready',
      'rollback_supported',
      'audit_supported',
    ]
  )
  assert.deepEqual(
    summary.tools.map((item) => item.status),
    [
      'evidence_only',
      'preview_only',
      'report_gate_only',
      'release_gate_required',
    ]
  )
  assert(
    summary.tools
      .filter((item) => ['freeze', 'dry-run'].includes(item.key))
      .every((item) => item.command.includes('scripts/import'))
  )
  const readbackPreflight = summary.tools.find(
    (item) => item.key === 'release-readback-preflight'
  )
  assert.equal(readbackPreflight.status, 'report_gate_only')
  assert.equal(
    readbackPreflight.command,
    'node scripts/deploy/customer-config-release-readiness.mjs --print-input-template'
  )
  assert(!readbackPreflight.command.includes('<release-batch>'))
  assert(!readbackPreflight.command.includes('--execute'))
  assert(!readbackPreflight.command.includes('CUSTOMER_CONFIG_ADMIN_TOKEN'))
  assert.match(readbackPreflight.note, /不调用后端/)
  assert.match(readbackPreflight.note, /不读取令牌/)
  assert.match(readbackPreflight.note, /不证明真实 active revision/)
  const rollbackExecute = summary.tools.find(
    (item) => item.key === 'release-rollback-execute'
  )
  assert.equal(rollbackExecute.title, '正式发布 / 回滚执行器输入模板')
  assert.equal(
    rollbackExecute.command,
    'node scripts/deploy/customer-config-release-execute.mjs --print-input-template'
  )
  assert(!rollbackExecute.command.includes('CUSTOMER_CONFIG_ADMIN_TOKEN'))
  assert(!rollbackExecute.command.includes('ROLLBACK_YOYOOSUN_CONFIG'))
  assert(!rollbackExecute.command.includes('--execute'))
  assert(!rollbackExecute.command.includes('--rollback'))
  assert(
    summary.tools.every(
      (item) =>
        typeof item.note === 'string' &&
        item.note.trim().length > 0 &&
        !item.command.includes('<release-batch>') &&
        !item.command.includes('CUSTOMER_CONFIG_ADMIN_TOKEN') &&
        !item.command.includes('--execute')
    )
  )
})

test('devCustomerConfig: 本地测试应用仍对客户包边界失败关闭', () => {
  const packageSummary = buildCustomerPackagePreviewSummary()
  assert.equal(packageSummary.localTestApplyEnabled, true)
  assert.equal(
    buildImportToolingSummary('yoyoosun', packageSummary)
      .canApplyTestConfig,
    true
  )

  const unsafeBoundary = {
    ...packageSummary,
    boundaryOk: false,
  }
  const boundaryResult = buildImportToolingSummary(
    'yoyoosun',
    unsafeBoundary
  )
  assert.equal(boundaryResult.canApplyTestConfig, false)
  assert(boundaryResult.testApply.blockedReasons.includes('package_boundary_invalid'))

  const disabled = {
    ...packageSummary,
    localTestApplyEnabled: false,
  }
  const disabledResult = buildImportToolingSummary('yoyoosun', disabled)
  assert.equal(disabledResult.canApplyTestConfig, false)
  assert(
    disabledResult.testApply.blockedReasons.includes(
      'local_test_apply_disabled'
    )
  )
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
  assert.equal(summary.extensionPointCount, 0)
  assert.equal(summary.importMappingCount, 0)
  assert.equal(summary.printTemplateDefaultCount, 2)
  assert.deepEqual(
    summary.printTemplateDefaults.map((item) => [
      item.templateKey,
      item.status,
      item.defaultFieldCount,
      item.defaultFieldCountLabel,
      item.supplierDefaultsAllowed,
      item.supplierDefaultsAllowedLabel,
    ]),
    [
      [
        'material-purchase-contract',
        'preview_only',
        5,
        '5 个默认方字段',
        false,
        '供应商快照受保护',
      ],
      [
        'processing-contract',
        'preview_only',
        5,
        '5 个默认方字段',
        false,
        '供应商快照受保护',
      ],
    ]
  )
  assert.equal(summary.missingWorkflowEndCount, 0)
  assert.equal(summary.missingWorkflowRoleCount, 0)
  assert.equal(summary.illegalStateTransitionCount, 0)
  assert.equal(summary.unregisteredPolicyBindingCount, 0)
  assert.equal(summary.unregisteredCommandBindingCount, 0)
  assert.equal(summary.unregisteredExtensionBindingCount, 0)
  assert(
    summary.strategyRegistryChecks.every(
      (item) => item.status === 'registered_binding'
    )
  )
  assert(
    summary.commandBindingChecks.every(
      (item) => item.status === 'registered_binding'
    )
  )
  assert.deepEqual(summary.extensionRegistryChecks, [
    {
      key: 'controlled-empty-extension-catalog',
      label: '扩展点绑定',
      status: 'controlled_empty',
      implementationSource: 'registered_deployment_package_required',
      implementationSourceLabel: '实现来自已登记部署包',
      handlerAllowed: false,
      handlerAllowedLabel: '禁止客户包处理器',
      customerPackageHandlerAllowed: false,
      blockedReasons: [
        'no_reviewed_extension_contract',
        'customer_package_handler_forbidden',
        'registered_deployment_package_required',
      ],
      note: '当前客户包未绑定扩展点；后续如绑定，处理器必须来自已注册部署包。',
    },
  ])
  assert.deepEqual(
    summary.compiledCatalogSummary.map((item) => [
      item.key,
      item.label,
      item.status,
      item.runtimeEnabled,
      item.runtimeEnabledLabel,
      item.catalogStatus,
      item.catalogStatusLabel,
      item.implementationSourceLabel,
      item.itemCount,
      item.summary,
    ]),
    [
      [
        'flow-catalog',
        '流程目录',
        'preview_only',
        false,
        '运行时关闭',
        'preview_only',
        '预览，不接运行时',
        '编译清单结构预览',
        7,
        '4 条业务流转 / 3 个状态机',
      ],
      [
        'policy-catalog',
        '策略目录',
        'preview_only',
        false,
        '运行时关闭',
        'preview_only',
        '预览，不接运行时',
        '实现来自已登记部署包',
        3,
        '3 条流程策略',
      ],
      [
        'extension-point-catalog',
        '扩展点目录',
        'controlled_empty',
        false,
        '运行时关闭',
        'controlled_empty',
        '受控空目录',
        '实现来自已登记部署包',
        0,
        '当前无扩展点绑定',
      ],
    ]
  )
  const compiledExtensionCatalog = summary.compiledCatalogSummary.find(
    (item) => item.key === 'extension-point-catalog'
  )
  assert.equal(compiledExtensionCatalog.handlerAllowed, false)
  assert.equal(compiledExtensionCatalog.handlerAllowedLabel, '禁止客户包处理器')
  assert.equal(compiledExtensionCatalog.customerPackageHandlerAllowed, false)
  assert.deepEqual(compiledExtensionCatalog.blockedReasons, [
    'no_reviewed_extension_contract',
    'customer_package_handler_forbidden',
    'registered_deployment_package_required',
  ])
  assert.match(compiledExtensionCatalog.note, /禁止客户包上传或启用处理器/)
  assert(
    summary.strategyRegistryChecks.every(
      (item) => item.implementationSourceLabel === '实现来自已登记部署包'
    )
  )
  assert(
    summary.commandBindingChecks.every(
      (item) => item.implementationSourceLabel === '实现来自已登记部署包'
    )
  )
  assert(
    summary.extensionRegistryChecks.every(
      (item) =>
        item.implementationSourceLabel === '实现来自已登记部署包' &&
        item.handlerAllowedLabel === '禁止客户包处理器'
    )
  )
  assert.equal(
    summary.moduleStateCatalogCount,
    customerPackageCatalog.modules.length
  )
  assert.equal(summary.moduleStateOverrideCount, 0)
  assert.equal(
    summary.moduleStateCounts.enabled,
    customerPackageCatalog.modules.length
  )
  assert.deepEqual(summary.nonEnabledModuleStates, [])
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

test('devCustomerConfig: 注册检查保留机器 key 但可见 label 不 fallback 到 raw key', () => {
  const defaultSummary = buildCustomerPackagePreviewSummary()
  const registeredCommand = defaultSummary.commandBindingChecks.find(
    (item) => item.key === 'submit_sales_order'
  )

  assert.equal(registeredCommand.label, '提交销售订单')
  assert.notEqual(registeredCommand.label, registeredCommand.key)

  const summary = buildCustomerPackagePreviewSummary({
    ...DEV_CUSTOMER_CONFIG_REGISTRY.yoyoosun.customerPackage,
    boundaries: Object.freeze({
      ...DEV_CUSTOMER_CONFIG_REGISTRY.yoyoosun.customerPackage.boundaries,
      rawBoundaryKey: false,
    }),
    workflows: Object.freeze([
      Object.freeze({
        key: 'unknown_command_workflow',
        label: '未知命令流程',
        status: 'preview_only',
        sourceModules: Object.freeze(['sales_orders']),
        ownerPools: Object.freeze(['sales']),
        factBoundary: 'workflow_only',
        nodes: Object.freeze([
          Object.freeze({
            key: 'sales_submit',
            type: 'human_task',
            ownerPool: 'sales',
            command: 'unknown_command_key',
          }),
          Object.freeze({
            key: 'end',
            type: 'end',
            ownerPool: 'sales',
          }),
        ]),
        guardrail: '测试未知命令只允许阻断，不把 raw key 当可见 label。',
      }),
    ]),
    processPolicies: Object.freeze([
      Object.freeze({
        key: 'unknown_policy_key',
        label: '',
        status: 'preview_only',
        kind: 'unknown_kind',
        rules: Object.freeze(['blocked']),
        guardrail: '测试空策略标签使用中文兜底。',
      }),
    ]),
    extensionPoints: Object.freeze([
      Object.freeze({
        key: 'raw_extension_key',
        label: '',
        status: 'preview_only',
        runtimeEnabled: false,
        guardrail: '测试空扩展点标签使用中文兜底。',
      }),
      Object.freeze({
        key: 'handler_extension_key',
        label: '测试扩展点处理器',
        status: 'preview_only',
        runtimeEnabled: false,
        handler: 'customerPackageHandler',
        guardrail: '测试 runtimeEnabled=false 也不能豁免客户包处理器。',
      }),
    ]),
  })

  const unknownCommand = summary.commandBindingChecks.find(
    (item) => item.key === 'unknown_command_key'
  )
  assert.equal(unknownCommand.status, 'blocked')
  assert.equal(unknownCommand.label, '命令绑定')
  assert.notEqual(unknownCommand.label, unknownCommand.key)

  const unknownPolicy = summary.strategyRegistryChecks.find(
    (item) => item.key === 'unknown_policy_key'
  )
  assert.equal(unknownPolicy.status, 'blocked')
  assert.equal(unknownPolicy.label, '策略绑定')
  assert.notEqual(unknownPolicy.label, unknownPolicy.key)

  const unknownExtension = summary.extensionRegistryChecks.find(
    (item) => item.key === 'raw_extension_key'
  )
  assert.equal(unknownExtension.status, 'controlled_empty')
  assert.equal(unknownExtension.label, '扩展点绑定')
  assert.notEqual(unknownExtension.label, unknownExtension.key)

  const handlerExtension = summary.extensionRegistryChecks.find(
    (item) => item.key === 'handler_extension_key'
  )
  assert.equal(handlerExtension.status, 'blocked')
  assert.equal(handlerExtension.label, '测试扩展点处理器')
  assert.match(handlerExtension.note, /客户包不得上传扩展点实现/)
  assert.equal(summary.unregisteredExtensionBindingCount, 1)
  const handlerExtensionSummary = summary.extensionPoints.find(
    (item) => item.key === 'handler_extension_key'
  )
  assert.equal(handlerExtensionSummary.hasCustomerPackageHandler, true)
  assert.equal(handlerExtensionSummary.registered, false)
  assert.equal('handler' in handlerExtensionSummary, false)

  const unknownBoundary = summary.boundaries.find(
    (item) => item.key === 'rawBoundaryKey'
  )
  assert.equal(unknownBoundary.label, '配置边界')
  assert.notEqual(unknownBoundary.label, unknownBoundary.key)
})

test('devCustomerConfig: 页面只展示客户配置目录标签，不直出 raw key', async () => {
  const source = await readFile(
    new URL('../pages/DevCustomerConfigPage.jsx', import.meta.url),
    'utf8'
  )

  assert.match(source, /const PREFLIGHT_SECTION_QUERY_KEY = 'section'/)
  assert.match(source, /const IMPORT_ACTION_QUERY_KEY = 'action'/)
  assert.match(source, /ariaLabel="配置预检任务"/)
  assert.match(source, /ariaLabel="配置执行任务"/)
  assert.match(source, /activeSection === PREFLIGHT_SECTION_PACKAGE/)
  assert.match(source, /activeSection === PREFLIGHT_SECTION_RUNTIME/)
  assert.match(source, /activeSection === PREFLIGHT_SECTION_FLOW/)
  assert.match(source, /activeSection === PREFLIGHT_SECTION_EVIDENCE/)
  assert.match(source, /activeAction === IMPORT_ACTION_DRY_RUN/)
  assert.match(source, /activeAction === IMPORT_ACTION_TEST_APPLY/)
  assert.match(source, /activeAction === IMPORT_ACTION_RELEASE/)

  assert.doesNotMatch(source, />runtime off</)
  assert.doesNotMatch(source, />handler forbidden</)
  assert.doesNotMatch(source, /禁止客户包 handler/)
  assert.doesNotMatch(source, /Compiled Catalogs/)
  assert.doesNotMatch(source, /Registry Checks/)
  assert.doesNotMatch(source, /State Machines And Policies/)
  assert.doesNotMatch(source, /Missing Customer Package/)
  assert.doesNotMatch(source, /Product Core/)
  assert.doesNotMatch(source, />business data</)
  assert.doesNotMatch(source, />config boundary</)
  assert.doesNotMatch(source, /fieldTruthCount\} fieldTruth/)
  assert.doesNotMatch(source, /fieldRequirementCount\} fieldRequirements/)
  assert.doesNotMatch(source, /defaultFieldCount\} defaults/)
  assert.doesNotMatch(source, />supplier snapshots protected</)
  assert.doesNotMatch(source, />canExecuteRealImport</)
  assert.doesNotMatch(source, />writesBusinessData</)
  assert.doesNotMatch(source, />writesConfigControl</)
  assert.doesNotMatch(source, />executionBoundary</)
  assert.doesNotMatch(source, /\{item\.implementationSource\}/)
  assert.doesNotMatch(source, /\{item\.catalogStatus\}/)
  assert.doesNotMatch(source, /\{item\.writeClass\}/)
  assert.doesNotMatch(source, /<Text>\{item\.writes\}<\/Text>/)
  assert.doesNotMatch(source, /<Text>\{item\.key\}<\/Text>/)
  assert.doesNotMatch(source, /<Tag>\{item\.moduleKey\}<\/Tag>/)
  assert.doesNotMatch(source, /status=\{item\.state\}/)
  assert.doesNotMatch(source, />override</)
  assert.doesNotMatch(source, /\{result\.reportPreview\}/)
  assert.doesNotMatch(source, /\{candidate\.key\} \/ \{candidate\.source\}/)
  assert.doesNotMatch(source, /<Text strong>\{item\.templateKey\}<\/Text>/)
  assert.doesNotMatch(source, /\{requirement\.key\}/)
  assert.doesNotMatch(source, /<Tag>\{requirement\.key\}<\/Tag>/)
  assert.doesNotMatch(
    source,
    /\{flow\.key\} \/ \{\(flow\.modules \|\| \[\]\)\.join/
  )
  assert.doesNotMatch(source, /\{item\.stateCount\} states/)
  assert.doesNotMatch(source, /\{item\.ruleCount\} rules/)
  assert.doesNotMatch(source, /<Tag>\{template\.key\}<\/Tag>/)
  assert.doesNotMatch(source, /\(item\.partyDefaultKeys \|\| \[\]\)\.join/)
  assert.match(
    source,
    /sourcePath=\{overview\.sourcePath \|\| DEV_CUSTOMER_CONFIG_SOURCE_PATH\}/
  )
  assert.doesNotMatch(source, /\{item\.sourcePath\}/)
  assert.match(source, /<Select\s+aria-label="客户包选择"/u)
  assert.doesNotMatch(source, /customerKey\.slice/)
  assert.doesNotMatch(source, /\$\{item\.label\} \(\$\{item\.customerKey\}\)/)
  assert.doesNotMatch(source, /\{item\.label\} \/ \{item\.customerKey\}/)
  assert.match(source, /candidate\.fieldKeyLabel/)
  assert.match(source, /candidate\.sourceLabel/)
  assert.match(source, /template\.templateKeyLabel/)
  assert.match(source, /template\.fieldRequirementItems\.map/)
  assert.match(source, /requirement\.requirementKeyLabel/)
  assert.match(source, /item\.partyDefaultKeysLabel/)
  assert.match(source, /item\.templateLabel/)
  assert.match(source, /flow\.flowKeyLabel/)
  assert.match(source, /item\.stateCountLabel/)
  assert.match(source, /item\.ruleCountLabel/)
  assert.match(source, /item\.ruleItems\.map/)
  assert.match(source, /rule\.triggerLabel/)
  assert.match(source, /rule\.resultLabel/)
})

test('devCustomerConfig: 打印模板字段只读进入客户配置控制台', () => {
  const summary = buildPrintTemplateFieldSummary()

  assert.equal(summary.templateCount, 5)
  assert.equal(summary.sourceGroundedCount, 5)
  assert(summary.fieldTruthCount > 0)
  assert(summary.fieldRequirementCount > 0)
  assert.equal(summary.runtimeStatus, 'source_grounded')
  assert.equal(summary.sourcePath, 'web/src/erp/config/printTemplates.mjs')
  assert.equal(summary.sourceLabel, '打印模板字段配置')
  assert.equal(summary.behaviorDocPath, 'docs/打印模板字段与编辑行为清单.md')
  assert.equal(summary.behaviorDocLabel, '打印模板字段清单')
  assert.match(summary.boundary, /销售订单受理未接打印模板/)
  assert.deepEqual(
    summary.templates.map((item) => item.title),
    ['采购合同', '加工合同', '物料分析明细表', '色卡', '作业指导书']
  )
  assert(
    summary.templates.every(
      (item) =>
        item.readiness === 'source_grounded' &&
        item.runtimeStatus === 'official_template' &&
        item.factBoundary === 'read_snapshot_only' &&
        item.factBoundaryLabel === '只读快照' &&
        item.fieldTruthCount > 0 &&
        item.fieldTruthCountLabel.includes('字段真源') &&
        item.fieldRequirementCount > 0 &&
        item.fieldRequirementCountLabel.includes('字段要求') &&
        item.fieldRequirementItems.length === item.fieldRequirementCount &&
        item.fieldRequirementItems.every(
          (requirement) =>
            requirement.label &&
            requirement.sourceLabel.startsWith('来源：') &&
            requirement.boundary &&
            requirement.requirementKeyLabel === '字段要求锚点已登记'
        ) &&
        item.templateKeyLabel === '模板锚点已登记' &&
        item.moduleKeys.length > 0 &&
        item.sourceFileCount > 0
    )
  )
})

test('devCustomerConfig: 客户包打印默认方信息经 effective session 投影但不覆盖供应商', () => {
  const overview = buildCustomerConfigDevOverview({ customerKey: 'yoyoosun' })
  const { customerPackageSummary } = overview
  const printReview = overview.packageConsoleSummary.reviewChecklist.find(
    (item) => item.key === 'print-template-field-review'
  )
  const printDefaultsAsset = overview.packageConsoleSummary.assetSummary.find(
    (item) => item.key === 'print-template-defaults'
  )

  assert.equal(customerPackageSummary.printTemplateDefaultCount, 2)
  assert(
    customerPackageSummary.printTemplateDefaults.every(
      (item) =>
        item.runtimeConsumed === true &&
        item.supplierDefaultsAllowed === false &&
        item.templateKeyLabel === '模板锚点已登记' &&
        item.partyDefaultKeysLabel.includes('默认方字段已登记') &&
        item.partyDefaultKeys.includes('buyerCompany') &&
        ['采购合同', '加工合同'].includes(item.templateLabel)
    )
  )
  assert.match(printReview.nextAction, /有效配置投影/)
  assert.equal(printDefaultsAsset.status, 'effective_session_projected')
})

test('devCustomerConfig: moduleStates 进入控制台预检但不改变默认客户包', () => {
  const summary = buildCustomerPackagePreviewSummary({
    ...DEV_CUSTOMER_CONFIG_REGISTRY.yoyoosun.customerPackage,
    moduleStates: Object.freeze([
      Object.freeze({
        moduleKey: 'shipments',
        state: 'read_only',
        reason: '试用阶段只允许查看出货模块',
      }),
      Object.freeze({
        moduleKey: 'finance',
        state: 'disabled',
        reason: '试用阶段暂不开放财务模块',
      }),
    ]),
  })

  assert.equal(
    summary.moduleStateCatalogCount,
    customerPackageCatalog.modules.length
  )
  assert.equal(summary.moduleStateOverrideCount, 2)
  assert.equal(
    summary.moduleStateCounts.enabled,
    customerPackageCatalog.modules.length - 2
  )
  assert.equal(summary.moduleStateCounts.read_only, 1)
  assert.equal(summary.moduleStateCounts.disabled, 1)
  assert.deepEqual(
    summary.nonEnabledModuleStates
      .map((item) => [item.moduleKey, item.state, item.reason])
      .sort(),
    [
      ['finance', 'disabled', '试用阶段暂不开放财务模块'],
      ['shipments', 'read_only', '试用阶段只允许查看出货模块'],
    ].sort()
  )
  assert(
    summary.moduleStates
      .find((item) => item.moduleKey === 'sales_orders')
      ?.reason.includes('默认按启用处理')
  )
  assert.equal(
    summary.moduleStates.find((item) => item.moduleKey === 'shipments')
      ?.sourceLabel,
    '客户包覆盖'
  )
  assert.equal(
    summary.moduleStates.find((item) => item.moduleKey === 'sales_orders')
      ?.sourceLabel,
    '目录默认'
  )
})

test('devCustomerConfig: moduleStates 可见标签不 fallback 到 raw module key', () => {
  const customCatalog = {
    ...customerPackageCatalog,
    modules: customerPackageCatalog.modules.map((item) =>
      item.key === 'sales_orders' ? { ...item, label: '' } : item
    ),
  }

  const summary = buildCustomerPackagePreviewSummary(
    DEV_CUSTOMER_CONFIG_REGISTRY.yoyoosun.customerPackage,
    'config/customers/yoyoosun/customerPackage.mjs',
    customCatalog
  )
  const salesOrderModuleState = summary.moduleStates.find(
    (item) => item.moduleKey === 'sales_orders'
  )

  assert.equal(salesOrderModuleState.label, '已登记模块')
  assert.notEqual(salesOrderModuleState.label, salesOrderModuleState.moduleKey)
  assert.equal(salesOrderModuleState.stateLabel, '启用')
  assert.equal(salesOrderModuleState.sourceLabel, '目录默认')
})

test('devCustomerConfig: 规则策略和打印默认方提供业务可读投影 label', () => {
  const summary = buildCustomerPackagePreviewSummary()
  const firstFieldCandidate =
    buildFieldNumberingDraftSummary().fieldCandidates[0]
  const firstBusinessFlow = summary.businessFlows[0]
  const firstStateMachine = summary.stateMachines[0]
  const firstProcessPolicy = summary.processPolicies[0]

  assert.equal(firstFieldCandidate.fieldKeyLabel, '字段锚点已登记')
  assert.match(firstFieldCandidate.sourceLabel, /^来源：/)
  assert.notEqual(firstFieldCandidate.fieldKeyLabel, firstFieldCandidate.key)

  assert.equal(firstBusinessFlow.flowKeyLabel, '业务流锚点已登记')
  assert.match(firstBusinessFlow.moduleRouteLabel, /^关联模块：\d+ 个$/)
  assert.notEqual(firstBusinessFlow.flowKeyLabel, firstBusinessFlow.key)

  assert.match(firstStateMachine.stateCountLabel, /^\d+ 个状态$/)
  assert.match(firstStateMachine.transitionCountLabel, /^\d+ 条转换$/)
  assert.doesNotMatch(firstStateMachine.stateCountLabel, /states/)
  assert.doesNotMatch(firstStateMachine.transitionCountLabel, /transitions/)

  assert.match(firstProcessPolicy.kindLabel, /^策略类型：/)
  assert.doesNotMatch(firstProcessPolicy.kindLabel, /skip_policy/)
  assert.doesNotMatch(firstProcessPolicy.kindLabel, /auto_generate_policy/)
  assert.doesNotMatch(firstProcessPolicy.kindLabel, /close_policy/)
  assert.match(firstProcessPolicy.ruleCountLabel, /^\d+ 条规则$/)
  assert.doesNotMatch(firstProcessPolicy.ruleCountLabel, /rules/)
  assert(firstProcessPolicy.ruleItems.length > 0)
  assert.deepEqual(firstProcessPolicy.ruleItems[0], {
    key: 'policy-rule-1',
    triggerLabel: '条件：可选评审未配置时',
    resultLabel: '结果：进入人工评审',
    note: '',
  })
  assert.doesNotMatch(
    firstProcessPolicy.ruleItems[0].triggerLabel,
    /skip_optional_review_when_unconfigured/
  )
  assert.doesNotMatch(
    firstProcessPolicy.ruleItems[0].resultLabel,
    /manual_review_required/
  )

  assert.deepEqual(
    summary.printTemplateDefaults.map((item) => item.templateLabel),
    ['采购合同', '加工合同']
  )
  assert.deepEqual(
    summary.printTemplateDefaults.map((item) => item.templateKeyLabel),
    ['模板锚点已登记', '模板锚点已登记']
  )
  assert(
    summary.printTemplateDefaults.every((item) =>
      item.partyDefaultKeysLabel.endsWith('默认方字段已登记')
    )
  )
})

test('devCustomerConfig: 配置包预检控制台区分本地测试应用与正式发布门禁', () => {
  const overview = buildCustomerConfigDevOverview({ customerKey: 'yoyoosun' })
  const summary = buildCustomerPackageConsoleSummary({
    menuSummary: overview.menuSummary,
    fieldNumberingSummary: overview.fieldNumberingSummary,
    printTemplateSummary: overview.printTemplateSummary,
    customerPackageSummary: overview.customerPackageSummary,
    importSummary: overview.importSummary,
  })

  assert.equal(summary.primaryStatus, 'PREVIEW_READY')
  assert.equal(summary.reviewDecision.status, 'REVIEW_READY')
  assert.match(summary.reviewDecision.summary, /已满足测试应用门禁/)
  assert.match(summary.reviewDecision.summary, /正式发布仍须/)
  assert.match(summary.reviewDecision.nextAction, /本地\/测试后端配置应用/)
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
    [
      'runtime_frontend_only',
      'draft_only',
      'preview_only',
      'preview_only',
      'source_grounded',
      'effective_session_projected',
      'preview_only',
    ]
  )
  assert(summary.validationChecks.some((item) => item.key === 'real-import'))
  assert(summary.validationChecks.some((item) => item.key === 'module-states'))
  assert(
    summary.validationChecks.some(
      (item) => item.key === 'unregistered-strategy' && item.status === 'passed'
    )
  )
  assert(
    summary.validationChecks.some(
      (item) =>
        item.key === 'unregistered-extension' && item.status === 'passed'
    )
  )
  assert(
    summary.validationChecks.some(
      (item) => item.key === 'workflow-closed-loop' && item.status === 'passed'
    )
  )
  assert(
    summary.validationChecks.some(
      (item) => item.key === 'role-coverage' && item.status === 'passed'
    )
  )
  assert(
    summary.validationChecks.some(
      (item) =>
        item.key === 'illegal-state-transition' && item.status === 'passed'
    )
  )
  assert(
    summary.validationChecks.some((item) => item.key === 'rollback-no-facts')
  )
  assert(
    summary.validationChecks.some(
      (item) => item.key === 'print-template-boundary'
    )
  )
  assert(
    summary.diffItems.every((item) =>
      [
        'runtime_frontend_only',
        'draft_only',
        'preview_only',
        'report_gate_only',
        'source_grounded',
      ].includes(item.status)
    )
  )
  assert.deepEqual(
    summary.versionGates.map((item) => item.enabled),
    [false, false, false]
  )
  assert.deepEqual(
    summary.packageAssetScope.map((item) => item.key),
    [
      'config-assets',
      'rule-assets',
      'workflow-assets',
      'strategy-bindings',
      'extension-bindings',
      'template-assets',
      'import-mapping-assets',
    ]
  )
  assert(
    summary.packageAssetScope.some(
      (item) =>
        item.key === 'strategy-bindings' && item.status === 'registered_binding'
    )
  )
  assert(
    summary.packageAssetScope.some(
      (item) =>
        item.key === 'extension-bindings' && item.status === 'controlled_empty'
    )
  )
  assert(
    summary.registryChecks.some((item) =>
      item.note.includes('策略实现不得由客户包上传')
    )
  )
  assert(
    summary.registryChecks.some((item) =>
      item.note.includes('处理器必须来自已注册部署包')
    )
  )
  const visibleTexts = [
    ...summary.packageAssetScope.flatMap((item) => [item.label, item.note]),
    ...summary.registryChecks.flatMap((item) => [
      item.label,
      item.note,
      item.handlerAllowedLabel,
    ]),
    ...(
      buildCustomerPackagePreviewSummary().compiledCatalogSummary || []
    ).flatMap((item) => [item.label, item.summary, item.note]),
  ]
    .filter(Boolean)
    .join('\n')
  assert.doesNotMatch(visibleTexts, /process policy/)
  assert.doesNotMatch(visibleTexts, /business flow/)
  assert.doesNotMatch(visibleTexts, /state machine/)
  assert.doesNotMatch(visibleTexts, /Product Core/)
  assert.doesNotMatch(visibleTexts, /handler/)
  assert.deepEqual(
    summary.versionAuditSupport.map((item) => item.status),
    [
      'snapshot_supported',
      'test_apply_ready',
      'rollback_supported',
      'audit_supported',
    ]
  )
  assert.deepEqual(
    summary.reviewChecklist.map((item) => item.status),
    [
      'passed',
      'draft_only',
      'preview_only',
      'source_grounded',
      'preview_only',
      'report_gate_only',
      'release_gate_required',
    ]
  )
  assert(
    summary.sourceReferences.some(
      (item) =>
        item.key === 'print-templates' &&
        item.sourcePath === 'web/src/erp/config/printTemplates.mjs' &&
        item.sourceLabel === '打印模板字段配置'
    )
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
    [
      'runtime_frontend_only',
      'draft_only',
      'source_grounded',
      'effective_session_projected',
      'preview_only',
      'report_gate_only',
    ]
  )
  assert.doesNotMatch(
    collectConsoleVisibleText(summary),
    /fieldTruth|override|party defaults|moduleStates|module_states|enabled|read_only|disabled|dry-run evidence|execution report gate|effective session|\bDB\b|config\/customers|web\/src|scripts\/import/u
  )
})

test('devCustomerConfig: 总览区分 runtime、draft 和 blocked 能力', () => {
  const overview = buildCustomerConfigDevOverview({ customerKey: 'yoyoosun' })

  assert.equal(overview.customerKey, 'yoyoosun')
  assert.equal(overview.sourceLabel, '客户配置包说明')
  assert.deepEqual(
    overview.runtimePieces.map((item) => item.key),
    ['brand-menu']
  )
  assert.deepEqual(
    overview.runtimePieces.map((item) => item.sourceLabel),
    ['客户菜单配置']
  )
  assert.deepEqual(
    overview.draftPieces.map((item) => item.key),
    ['field-numbering', 'process-package']
  )
  assert.deepEqual(
    overview.draftPieces.map((item) => item.sourceLabel),
    ['字段编号配置', '客户配置包']
  )
  assert.deepEqual(
    overview.blockedPieces.map((item) => item.key),
    ['real-import', 'saas-tenant']
  )
  assert.deepEqual(
    overview.blockedPieces.map((item) => item.sourceLabel),
    ['导入工具入口', '客户配置包说明']
  )
  assert.equal(overview.packageConsoleSummary.primaryStatus, 'PREVIEW_READY')
})
