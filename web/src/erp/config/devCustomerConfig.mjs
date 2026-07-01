import { yoyoosunFieldNumberingConfig } from '../../../../config/customers/yoyoosun/fieldNumberingConfig.mjs'
import { yoyoosunCustomerPackage } from '../../../../config/customers/yoyoosun/customerPackage.mjs'
import { yoyoosunMenuConfig } from '../../../../config/customers/yoyoosun/menuConfig.mjs'
import { customerPackageCatalog } from '../../../../config/catalog/customerPackageCatalog.mjs'
import { DEV_CUSTOMER_CONFIG_ROUTE } from './devCustomerConfigRoute.mjs'
import { printTemplateCatalog, printTemplateStats } from './printTemplates.mjs'

export { DEV_CUSTOMER_CONFIG_ROUTE }
export const DEV_CUSTOMER_CONFIG_QUERY_KEY = 'customer'
export const DEFAULT_DEV_CUSTOMER_KEY = 'yoyoosun'
export const DEV_CUSTOMER_CONFIG_SOURCE_PATH =
  'config/customers/yoyoosun/README.md'
export const DEV_CUSTOMER_MENU_CONFIG_SOURCE_PATH =
  'config/customers/yoyoosun/menuConfig.mjs'
export const DEV_CUSTOMER_FIELD_NUMBERING_SOURCE_PATH =
  'config/customers/yoyoosun/fieldNumberingConfig.mjs'
export const DEV_CUSTOMER_PACKAGE_SOURCE_PATH =
  'config/customers/yoyoosun/customerPackage.mjs'
export const DEV_CUSTOMER_IMPORT_TOOLING_SOURCE_PATH = 'scripts/import'
export const DEV_PRINT_TEMPLATE_SOURCE_PATH =
  'web/src/erp/config/printTemplates.mjs'
export const DEV_PRINT_TEMPLATE_BEHAVIOR_DOC_PATH =
  'docs/打印模板字段与编辑行为清单.md'
export const DEV_CUSTOMER_CONFIG_QA_COMMAND =
  'node scripts/qa/customer-config-boundaries.mjs'
export const DEV_CUSTOMER_PACKAGE_QA_COMMAND =
  'node scripts/qa/customer-package-lint.mjs --customer yoyoosun'
export const DEV_CUSTOMER_IMPORT_DRY_RUN_API =
  '/__dev/api/customer-import/dry-run'
export const DEV_CUSTOMER_CONFIG_RUNTIME_MANIFEST_API =
  '/__dev/api/customer-config/runtime-manifest'
export const DEV_CUSTOMER_CONFIG_RELEASE_READINESS_API =
  '/__dev/api/customer-config/release-readiness'

export const DEV_CUSTOMER_CONFIG_REGISTRY = Object.freeze({
  yoyoosun: Object.freeze({
    customerKey: 'yoyoosun',
    label: '永绅 yoyoosun',
    sourcePath: DEV_CUSTOMER_CONFIG_SOURCE_PATH,
    menuConfig: yoyoosunMenuConfig,
    menuConfigSourcePath: DEV_CUSTOMER_MENU_CONFIG_SOURCE_PATH,
    fieldNumberingConfig: yoyoosunFieldNumberingConfig,
    fieldNumberingSourcePath: DEV_CUSTOMER_FIELD_NUMBERING_SOURCE_PATH,
    customerPackage: yoyoosunCustomerPackage,
    customerPackageSourcePath: DEV_CUSTOMER_PACKAGE_SOURCE_PATH,
  }),
})

const FIELD_DECISION_LABELS = Object.freeze({
  review_required: '待客户确认',
  defer_runtime: '暂不接运行时',
})

const NUMBERING_DECISION_LABELS = Object.freeze({
  review_required: '待客户确认',
  deferred: '后续评审',
})

const MODULE_STATE_LABELS = Object.freeze({
  enabled: '启用',
  read_only: '只读',
  disabled: '关闭',
})

export function isDevCustomerConfigEnabled(env = import.meta.env) {
  return env?.DEV === true
}

function normalizeCustomerKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
}

export function listRegisteredDevCustomerPackages(
  registry = DEV_CUSTOMER_CONFIG_REGISTRY
) {
  return Object.values(registry).map((item) => ({
    customerKey: item.customerKey,
    label: item.label,
    sourcePath: item.sourcePath,
  }))
}

export function readDevCustomerKeyFromSearch(
  searchParams = '',
  defaultCustomerKey = DEFAULT_DEV_CUSTOMER_KEY
) {
  const params =
    typeof searchParams.get === 'function'
      ? searchParams
      : new URLSearchParams(searchParams)
  return (
    normalizeCustomerKey(params.get(DEV_CUSTOMER_CONFIG_QUERY_KEY)) ||
    defaultCustomerKey
  )
}

export function resolveDevCustomerConfigPackage(
  customerKey = DEFAULT_DEV_CUSTOMER_KEY,
  registry = DEV_CUSTOMER_CONFIG_REGISTRY
) {
  const normalizedKey =
    normalizeCustomerKey(customerKey) || DEFAULT_DEV_CUSTOMER_KEY
  const matched = registry[normalizedKey]
  return {
    status: matched ? 'ready' : 'missing',
    customerKey: normalizedKey,
    packageConfig: matched || null,
    registeredCustomers: listRegisteredDevCustomerPackages(registry),
  }
}

function countMenuItems(sections = []) {
  return sections.reduce(
    (total, section) => total + (section.items || []).length,
    0
  )
}

function countBy(items = [], field = '') {
  return items.reduce((result, item) => {
    const key = item?.[field] || 'unknown'
    result[key] = (result[key] || 0) + 1
    return result
  }, {})
}

function flattenFieldCandidates(config = {}) {
  return (config.fieldDisplayReview || []).flatMap((moduleConfig) =>
    (moduleConfig.candidates || []).map((candidate) => ({
      ...candidate,
      module: moduleConfig.module,
      moduleLabel: moduleConfig.label,
      decisionLabel: FIELD_DECISION_LABELS[candidate.decision] || '未标记',
    }))
  )
}

function buildBoundaryItems(config = {}) {
  return Object.entries(config.boundaries || {}).map(([key, value]) => ({
    key,
    value: Boolean(value),
    expected: false,
    ok: value === false,
  }))
}

function countPackageNodes(workflows = []) {
  return workflows.reduce(
    (total, workflow) => total + (workflow.nodes || []).length,
    0
  )
}

function allPackageBoundariesOk(boundaries = []) {
  return boundaries.every((item) => item.ok)
}

function buildModuleStateSummary(
  config = {},
  catalog = customerPackageCatalog
) {
  const moduleKeys = new Set((catalog.modules || []).map((item) => item.key))
  const overrideMap = new Map(
    (Array.isArray(config.moduleStates) ? config.moduleStates : [])
      .filter((item) => item && typeof item === 'object')
      .map((item) => [
        String(item.moduleKey || '').trim(),
        {
          state: String(item.state || '').trim(),
          reason: String(item.reason || '').trim(),
        },
      ])
      .filter(([moduleKey]) => moduleKey)
  )
  const moduleStates = (catalog.modules || []).map((item) => {
    const override = overrideMap.get(item.key)
    const state = override?.state || 'enabled'
    return {
      moduleKey: item.key,
      label: item.label || item.key,
      state,
      stateLabel: MODULE_STATE_LABELS[state] || state || '未标记',
      reason:
        override?.reason || '未在客户包覆盖，manifest 编译时默认 enabled。',
      source: override ? 'customer_package_override' : 'catalog_default',
      overridden: Boolean(override),
    }
  })
  const unknownOverrides = [...overrideMap.keys()]
    .filter((moduleKey) => !moduleKeys.has(moduleKey))
    .map((moduleKey) => ({
      moduleKey,
      state: overrideMap.get(moduleKey)?.state || '',
      reason: overrideMap.get(moduleKey)?.reason || '',
    }))
  const stateCounts = countBy(moduleStates, 'state')
  const nonEnabledModuleStates = moduleStates.filter(
    (item) => item.state !== 'enabled'
  )

  return {
    catalogModuleCount: moduleStates.length,
    overrideCount: moduleStates.filter((item) => item.overridden).length,
    unknownOverrideCount: unknownOverrides.length,
    stateCounts,
    moduleStates,
    nonEnabledModuleStates,
    unknownOverrides,
    source:
      overrideMap.size > 0
        ? 'customer_package_override'
        : 'catalog_default_all_enabled',
  }
}

export function buildPrintTemplateFieldSummary(
  catalog = printTemplateCatalog,
  sourcePath = DEV_PRINT_TEMPLATE_SOURCE_PATH
) {
  const templates = (Array.isArray(catalog) ? catalog : []).map((item) => ({
    key: item.key,
    title: item.title,
    category: item.category,
    readiness: item.readiness || 'unknown',
    fieldTruthCount: (item.fieldTruth || []).length,
    sourceFileCount: (item.sourceFiles || []).length,
    fieldTruth: item.fieldTruth || [],
    output: item.output || '',
  }))

  return {
    templateCount: templates.length,
    sourceGroundedCount:
      templates.filter((item) => item.readiness === 'source_grounded').length ||
      printTemplateStats.sourceGrounded,
    fieldTruthCount: templates.reduce(
      (total, item) => total + item.fieldTruthCount,
      0
    ),
    templates,
    sourcePath,
    behaviorDocPath: DEV_PRINT_TEMPLATE_BEHAVIOR_DOC_PATH,
    runtimeStatus: 'source_grounded',
    boundary:
      '当前只登记采购合同和加工合同；销售订单受理未接打印模板，客户抬头 / 签章 / 固定文案留在客户配置或模板边界。',
  }
}

export function buildCustomerPackagePreviewSummary(
  config = yoyoosunCustomerPackage,
  sourcePath = DEV_CUSTOMER_PACKAGE_SOURCE_PATH,
  catalog = customerPackageCatalog
) {
  const moduleStateSummary = buildModuleStateSummary(config, catalog)
  const boundaries = [
    {
      key: 'runtimeEnabled',
      value: config.runtimeEnabled === true,
      expected: false,
      ok: config.runtimeEnabled !== true,
    },
    {
      key: 'previewOnly',
      value: config.sourcePolicy?.previewOnly === true,
      expected: true,
      ok: config.sourcePolicy?.previewOnly === true,
    },
    ...buildBoundaryItems(config),
  ]

  return {
    customerKey: config.customerKey,
    label: config.label,
    status: config.status,
    runtimeEnabled: config.runtimeEnabled === true,
    previewOnly: config.sourcePolicy?.previewOnly === true,
    publishEnabled: config.sourcePolicy?.publishEnabled === true,
    activateEnabled: config.sourcePolicy?.activateEnabled === true,
    rollbackEnabled: config.sourcePolicy?.rollbackEnabled === true,
    workflowCount: (config.workflows || []).length,
    workflowNodeCount: countPackageNodes(config.workflows || []),
    workflows: (config.workflows || []).map((workflow) => ({
      key: workflow.key,
      label: workflow.label,
      status: workflow.status,
      ownerPools: workflow.ownerPools || [],
      nodeCount: (workflow.nodes || []).length,
      factBoundary: workflow.factBoundary,
      guardrail: workflow.guardrail,
    })),
    businessFlowCount: (config.businessFlows || []).length,
    businessFlows: config.businessFlows || [],
    stateMachineCount: (config.stateMachines || []).length,
    stateMachines: (config.stateMachines || []).map((item) => ({
      key: item.key,
      label: item.label,
      status: item.status,
      stateCount: (item.states || []).length,
      transitionCount: (item.transitions || []).length,
      guardrail: item.guardrail,
    })),
    processPolicyCount: (config.processPolicies || []).length,
    processPolicies: (config.processPolicies || []).map((item) => ({
      key: item.key,
      label: item.label,
      status: item.status,
      kind: item.kind,
      ruleCount: (item.rules || []).length,
      guardrail: item.guardrail,
    })),
    moduleStateCatalogCount: moduleStateSummary.catalogModuleCount,
    moduleStateOverrideCount: moduleStateSummary.overrideCount,
    moduleStateUnknownOverrideCount: moduleStateSummary.unknownOverrideCount,
    moduleStateCounts: moduleStateSummary.stateCounts,
    moduleStates: moduleStateSummary.moduleStates,
    nonEnabledModuleStates: moduleStateSummary.nonEnabledModuleStates,
    moduleStateSource: moduleStateSummary.source,
    boundaries,
    boundaryOk: allPackageBoundariesOk(boundaries),
    qaCommand: DEV_CUSTOMER_PACKAGE_QA_COMMAND,
    sourcePath,
  }
}

export function buildCustomerMenuRuntimeSummary(
  menuConfig = yoyoosunMenuConfig,
  sourcePath = DEV_CUSTOMER_MENU_CONFIG_SOURCE_PATH
) {
  const sections = menuConfig.desktopMenu?.sections || []
  return {
    customerKey: menuConfig.customerKey,
    label: menuConfig.label,
    brand: menuConfig.brand || {},
    sectionCount: sections.length,
    itemCount: countMenuItems(sections),
    sections,
    sourcePath,
    runtimeStatus: 'runtime_frontend_only',
  }
}

export function buildFieldNumberingDraftSummary(
  config = yoyoosunFieldNumberingConfig,
  sourcePath = DEV_CUSTOMER_FIELD_NUMBERING_SOURCE_PATH
) {
  const fieldCandidates = flattenFieldCandidates(config)
  const fieldDecisionCounts = countBy(fieldCandidates, 'decision')
  const numberingDecisionCounts = countBy(
    config.numberingRuleReview || [],
    'currentDecision'
  )
  return {
    customerKey: config.customerKey,
    label: config.label,
    status: config.status,
    runtimeEnabled: config.runtimeEnabled === true,
    fieldModuleCount: (config.fieldDisplayReview || []).length,
    fieldCandidateCount: fieldCandidates.length,
    fieldDecisionCounts,
    fieldCandidates,
    numberingRuleCount: (config.numberingRuleReview || []).length,
    numberingDecisionCounts,
    numberingRules: (config.numberingRuleReview || []).map((item) => ({
      ...item,
      decisionLabel:
        NUMBERING_DECISION_LABELS[item.currentDecision] || '未标记',
    })),
    boundaries: [
      {
        key: 'runtimeEnabled',
        value: config.runtimeEnabled === true,
        expected: false,
        ok: config.runtimeEnabled !== true,
      },
      ...buildBoundaryItems(config),
    ],
    sourcePath,
  }
}

export function buildImportToolingSummary(
  customerKey = DEFAULT_DEV_CUSTOMER_KEY
) {
  const normalizedCustomerKey = normalizeCustomerKey(customerKey)
  const fixtureBasePath = `scripts/import/fixtures/customers/${normalizedCustomerKey}`
  const outputBasePath = `output/customers/${normalizedCustomerKey}`
  const uiDryRunOut = `${outputBasePath}/ui-import-dry-run`
  const releaseEvidenceDir = `deployments/${normalizedCustomerKey}/evidence/releases/<YYYY-MM-DD>`
  const releaseManifestPath = `${outputBasePath}/customer-config-runtime-manifest.json`
  const releaseReportPath = `${outputBasePath}/customer-config-release/customer-config-release-report.json`
  return {
    sourcePath: DEV_CUSTOMER_IMPORT_TOOLING_SOURCE_PATH,
    qaCommand: DEV_CUSTOMER_CONFIG_QA_COMMAND,
    uiDryRunApiPath: DEV_CUSTOMER_IMPORT_DRY_RUN_API,
    uiRuntimeManifestApiPath: DEV_CUSTOMER_CONFIG_RUNTIME_MANIFEST_API,
    uiReleaseReadinessApiPath: DEV_CUSTOMER_CONFIG_RELEASE_READINESS_API,
    canRunUiDryRun: normalizedCustomerKey === 'yoyoosun',
    canApplyTestConfig: normalizedCustomerKey === 'yoyoosun',
    canCheckReleaseReadiness: normalizedCustomerKey === 'yoyoosun',
    canExecuteRealImport: false,
    writesBusinessData: false,
    writesDatabase: true,
    testApply: {
      key: 'test-config-apply',
      label: '应用到测试环境',
      status:
        normalizedCustomerKey === 'yoyoosun' ? 'test_apply_ready' : 'blocked',
      target: '测试环境 ERP 应用数据库',
      writes:
        'customer_config_revisions / deployment_module_states / role_profiles / access_entitlements / work_pools / work_pool_memberships / runtime_audit_events',
      operations: [
        'compile_runtime_manifest',
        'validate_customer_config',
        'publish_customer_config',
        'activate_customer_config',
        'get_effective_session',
      ],
      note: '使用当前管理员登录态调用后端 customer_config；成功后后台和岗位任务端读取 active revision 的测试配置投影。',
      noBusinessDataImport: true,
    },
    releaseApply: {
      key: 'release-config-apply',
      label: '发布到正式版',
      status: 'release_gate_required',
      target: '目标环境 ERP 应用数据库',
      evidenceDir: `deployments/${normalizedCustomerKey}/evidence/releases`,
      writes:
        'customer_config_revisions / deployment_module_states / role_profiles / access_entitlements / work_pools / work_pool_memberships / runtime_audit_events',
      operations: [
        'release_readiness_gate',
        'validate_customer_config',
        'publish_customer_config',
        'activate_customer_config',
        'get_effective_session',
      ],
      note: '先检查 release evidence 和 manifest hash 绑定；门禁通过后才允许用当前管理员登录态发布并激活正式配置版本。',
      noBusinessDataImport: true,
    },
    importFlow: [
      {
        key: 'tracked-package',
        step: '1',
        title: '读取客户包',
        status: 'passed',
        outcome: '已登记 yoyoosun 客户包',
        target: 'config/customers/yoyoosun/customerPackage.mjs',
        writesDatabase: false,
      },
      {
        key: 'preflight',
        step: '2',
        title: '预检与差异',
        status: 'passed',
        outcome:
          'lint / diff / moduleStates / menu / role / field projection preview',
        target: '只读解析，不写库',
        writesDatabase: false,
      },
      {
        key: 'ui-dry-run',
        step: '3',
        title: '测试 Dry Run',
        status:
          normalizedCustomerKey === 'yoyoosun' ? 'preview_only' : 'blocked',
        outcome: '生成本地 evidence',
        target: uiDryRunOut,
        writesDatabase: false,
      },
      {
        key: 'test-apply',
        step: '4',
        title: '测试环境应用',
        status:
          normalizedCustomerKey === 'yoyoosun' ? 'test_apply_ready' : 'blocked',
        outcome: 'validate / publish / activate',
        target: '测试环境 ERP 应用数据库',
        writesDatabase: true,
      },
      {
        key: 'formal-import',
        step: '5',
        title: '正式发布门禁',
        status: 'release_gate_required',
        outcome: '检查证据后发布正式版',
        target: '目标环境 ERP 应用数据库',
        writesDatabase: true,
      },
    ],
    databaseTargets: [
      {
        key: 'ui-dry-run',
        label: '当前页面可执行',
        status: 'no_write',
        target: '不写数据库',
        writes: uiDryRunOut,
        reason: '只生成 review evidence，供人工确认和后续发布门禁复核。',
      },
      {
        key: 'test-config-apply',
        label: '测试环境应用',
        status:
          normalizedCustomerKey === 'yoyoosun' ? 'test_apply_ready' : 'blocked',
        target: '测试环境 ERP 应用数据库',
        writes:
          'customer_config_revisions / deployment_module_states / role_profiles / access_entitlements / work_pools / work_pool_memberships / runtime_audit_events',
        reason:
          '这是客户配置控制面写入；登录后的后台和岗位任务端通过 get_effective_session 读取 active revision。',
      },
      {
        key: 'customer-config-publish',
        label: '正式版发布配置',
        status: 'release_gate_required',
        target: '目标环境 ERP 应用数据库',
        writes:
          'customer_config_revisions / deployment_module_states / role_profiles / access_entitlements / work_pools / work_pool_memberships / runtime_audit_events',
        reason:
          '登录后的 get_effective_session 必须从当前 ERP 后端数据库读取 active revision，并与 RBAC 菜单取交集。',
      },
      {
        key: 'customer-config-activate',
        label: '正式版激活配置',
        status: 'release_gate_required',
        target: '目标环境 ERP 应用数据库',
        writes: 'customer_config_revisions.status / runtime_audit_events',
        reason: '激活只是切换有效配置版本，不写库存、出货、财务或业务事实。',
      },
      {
        key: 'business-data-import',
        label: '真实客户业务数据',
        status: 'separate_task_required',
        target: '目标环境 ERP 应用数据库的业务表',
        writes: '客户、供应商、联系人、销售订单等领域表',
        reason:
          '这是历史业务数据迁移专项，必须走领域 usecase、备份、审计和回滚，不混入客户配置包发布。',
      },
    ],
    formalGates: [
      {
        key: 'manifest-evidence',
        label: 'Manifest hash 证据',
        status: 'required',
        note: 'runtime manifest 必须绑定 sha256，避免发布时替换 payload。',
      },
      {
        key: 'release-evidence',
        label: '目标环境发布证据',
        status: 'required',
        note: '备份恢复、migration、smoke 和 sign-off 必须齐备。',
      },
      {
        key: 'admin-confirmation',
        label: '管理员确认短语',
        status: 'required',
        note: 'publish / activate 必须显式确认，不能由页面默认触发。',
      },
      {
        key: 'business-import',
        label: '业务数据导入',
        status: 'separate_task_required',
        note: '配置版本发布不等于客户历史业务数据导入。',
      },
    ],
    tools: [
      {
        key: 'freeze',
        title: 'source snapshot freeze',
        command: `node scripts/import/customerSourceSnapshotFreezeCheck.mjs --source ${fixtureBasePath}/source-snapshot.freeze.sample.json --existing ${fixtureBasePath}/existing-v1.freeze.sample.json --out ${outputBasePath}/source-snapshot-freeze`,
        status: 'evidence_only',
      },
      {
        key: 'dry-run',
        title: 'customer import dry-run',
        command: `node scripts/import/customerImportDryRun.mjs --source ${fixtureBasePath}/source-snapshot.sample.json --existing ${fixtureBasePath}/existing-v1.sample.json --out ${outputBasePath}/import-dry-run`,
        status: 'preview_only',
      },
      {
        key: 'execute-report',
        title: 'import execution report',
        command: `node scripts/import/customerImportExecute.mjs --dry-run-package ${outputBasePath}/import-dry-run --approval ${fixtureBasePath}/import-approval.sample.json --backup-evidence ${outputBasePath}/backup-evidence.txt --out ${outputBasePath}/import-execution`,
        status: 'report_gate_only',
      },
      {
        key: 'release-rollback-readiness',
        title: 'customer config rollback readiness',
        command: `node scripts/deploy/customer-config-release-readiness.mjs --manifest ${releaseManifestPath} --evidence-dir ${releaseEvidenceDir} --release-report ${releaseReportPath} --require-executed --require-rollback`,
        status: 'release_gate_required',
      },
      {
        key: 'release-rollback-execute',
        title: 'customer config rollback executor',
        command: `CUSTOMER_CONFIG_CONFIRM=ROLLBACK_YOYOOSUN_CONFIG CUSTOMER_CONFIG_ADMIN_TOKEN='<admin-token>' node scripts/deploy/customer-config-release-execute.mjs --manifest ${releaseManifestPath} --evidence-dir ${releaseEvidenceDir} --out ${outputBasePath}/customer-config-release --backend-url http://127.0.0.1:8300 --execute --rollback`,
        status: 'release_gate_required',
      },
    ],
  }
}

function buildPackagePreviewReportCommand(
  customerKey = DEFAULT_DEV_CUSTOMER_KEY
) {
  const normalizedCustomerKey = normalizeCustomerKey(customerKey)
  return `node scripts/qa/customer-package-lint.mjs --customer ${normalizedCustomerKey} --out output/customers/${normalizedCustomerKey}/customer-package-preview.json`
}

export function buildCustomerPackageConsoleSummary({
  menuSummary,
  fieldNumberingSummary,
  customerPackageSummary,
  importSummary,
  printTemplateSummary,
} = {}) {
  const fieldReviewCount = fieldNumberingSummary?.fieldCandidateCount || 0
  const workflowCount = customerPackageSummary?.workflowCount || 0
  const processPolicyCount = customerPackageSummary?.processPolicyCount || 0
  const moduleStateCount = customerPackageSummary?.moduleStateCatalogCount || 0
  const moduleStateOverrideCount =
    customerPackageSummary?.moduleStateOverrideCount || 0
  const moduleStateNonEnabledCount =
    customerPackageSummary?.nonEnabledModuleStates?.length || 0
  const menuItemCount = menuSummary?.itemCount || 0
  const printTemplateCount = printTemplateSummary?.templateCount || 0
  const printFieldTruthCount = printTemplateSummary?.fieldTruthCount || 0
  const boundaryOk = customerPackageSummary?.boundaryOk === true
  const customerKey =
    customerPackageSummary?.customerKey ||
    menuSummary?.customerKey ||
    DEFAULT_DEV_CUSTOMER_KEY
  const packageQaCommand =
    customerPackageSummary?.qaCommand || DEV_CUSTOMER_PACKAGE_QA_COMMAND
  const boundaryFailedCount = (customerPackageSummary?.boundaries || []).filter(
    (item) => !item.ok
  ).length

  return {
    primaryStatus: boundaryOk ? 'PREVIEW_READY' : 'BLOCKED',
    packageLabel: customerPackageSummary?.label || '未登记客户配置包',
    reviewDecision: {
      status: boundaryOk ? 'REVIEW_READY' : 'BLOCKED',
      title: boundaryOk ? '可以进入人工评审' : '先修复配置包阻塞项',
      summary: boundaryOk
        ? '结构与禁止项已通过 lint；页面可做测试环境应用，正式发布必须先通过 release evidence 门禁。'
        : `配置包存在 ${boundaryFailedCount} 个阻塞项；修复后重新运行 lint。`,
      nextAction: boundaryOk
        ? '先做 Dry Run 和测试环境应用；正式版进入发布门禁检查。'
        : '先修复 failed boundary，再重新运行客户包 lint。',
    },
    decisionCards: [
      {
        key: 'review-ready',
        label: '人工评审',
        status: boundaryOk ? 'REVIEW_READY' : 'BLOCKED',
        outcome: boundaryOk ? '可继续' : '阻塞',
        note: boundaryOk
          ? '只进入 review evidence，不改变 runtime。'
          : '必须先修复配置包禁止项。',
        nextAction: boundaryOk
          ? '生成 customer-package-preview.json'
          : packageQaCommand,
      },
      {
        key: 'real-import',
        label: '真实导入',
        status: 'blocked_by_design',
        outcome: '不可执行',
        note: '配置发布不等于客户历史业务数据导入。',
        nextAction:
          '正式导入另开任务，并先完成客户确认、备份 evidence 和回滚方案。',
      },
      {
        key: 'publish-runtime',
        label: '发布 / 激活',
        status: 'release_gate_required',
        outcome: '门禁后可执行',
        note: '发布版必须先通过 manifest hash、release evidence 和管理员确认。',
        nextAction: '在导入工作台检查发布门禁；通过后再发布到正式版。',
      },
    ],
    preflightStages: [
      {
        key: 'registered-package',
        label: '读取已登记客户包',
        status: 'passed',
        note: '只读取 tracked config，不接上传入口。',
      },
      {
        key: 'schema-lint',
        label: '结构与禁止项校验',
        status: boundaryOk ? 'passed' : 'blocked',
        note: packageQaCommand,
      },
      {
        key: 'diff-preview',
        label: '差异预览',
        status: 'preview_only',
        note: `${menuItemCount} 个菜单项、${fieldReviewCount} 个字段候选、${moduleStateOverrideCount} 个模块状态 override、${printTemplateCount} 套打印模板进入人工评审。`,
      },
      {
        key: 'dry-run',
        label: '测试版 UI Dry Run',
        status: importSummary?.canRunUiDryRun ? 'preview_only' : 'blocked',
        note: '在开发页触发 dry-run，生成 evidence / report，不写数据库。',
      },
      {
        key: 'publish',
        label: '发布与回滚',
        status: 'release_gate_required',
        note: 'publish / activate / rollback 都必须走 release evidence；页面只提供命令复核，不提供裸回滚按钮。',
      },
    ],
    reviewChecklist: [
      {
        key: 'package-lint',
        label: '客户包结构预检',
        role: '实施 / 开发',
        status: boundaryOk ? 'passed' : 'blocked',
        sourcePath: customerPackageSummary?.sourcePath,
        nextAction: packageQaCommand,
      },
      {
        key: 'field-numbering-review',
        label: '字段显示与编号人工确认',
        role: '实施 / 客户确认',
        status: 'draft_only',
        sourcePath: fieldNumberingSummary?.sourcePath,
        nextAction: `${fieldReviewCount} 个字段候选仍为 draft，不接前端运行时。`,
      },
      {
        key: 'module-state-review',
        label: '模块状态投影确认',
        role: '实施 / 产品评审',
        status: 'preview_only',
        sourcePath: customerPackageSummary?.sourcePath,
        nextAction:
          moduleStateOverrideCount > 0
            ? `${moduleStateOverrideCount} 个 moduleStates override 将编译为后端 module_states；非 enabled 必须保留 reason。`
            : `${moduleStateCount} 个 catalog 模块默认编译为 enabled；客户包未声明 read_only / disabled override。`,
      },
      {
        key: 'print-template-field-review',
        label: '打印模板字段链路复核',
        role: '实施 / 产品评审',
        status: 'source_grounded',
        sourcePath: printTemplateSummary?.sourcePath,
        nextAction: `${printTemplateCount} 套模板、${printFieldTruthCount} 条 fieldTruth 只读展示；销售订单受理当前未接打印模板。`,
      },
      {
        key: 'workflow-structure-review',
        label: '流程结构与 Fact 边界确认',
        role: '产品 / 业务评审',
        status: 'preview_only',
        sourcePath: customerPackageSummary?.sourcePath,
        nextAction: `${workflowCount} 条 Workflow preview 只评审结构，不写 WorkflowUsecase 或事实表。`,
      },
      {
        key: 'dry-run-evidence',
        label: '导入证据包',
        role: '实施 / 运维',
        status: 'report_gate_only',
        sourcePath: importSummary?.sourcePath,
        nextAction: '只允许 freeze、dry-run 和 execution report evidence。',
      },
      {
        key: 'runtime-publish',
        label: '发布生效',
        role: '发布负责人',
        status: 'release_gate_required',
        sourcePath: customerPackageSummary?.sourcePath,
        nextAction: '先跑 release readiness gate，通过后才可发布 / 激活。',
      },
    ],
    qaCommands: [
      {
        key: 'package-lint',
        label: '客户包 lint',
        command: packageQaCommand,
        note: '校验结构、禁止项和 preview-only 边界。',
      },
      {
        key: 'package-preview-report',
        label: '生成预检报告',
        command: buildPackagePreviewReportCommand(customerKey),
        note: '输出 review evidence，不写运行时配置。',
      },
      {
        key: 'customer-config-boundaries',
        label: '客户配置边界',
        command: importSummary?.qaCommand || DEV_CUSTOMER_CONFIG_QA_COMMAND,
        note: '校验客户配置、导入 tooling 和禁止项。',
      },
    ],
    sourceReferences: [
      {
        key: 'menu',
        label: '菜单品牌',
        status: 'runtime_frontend_only',
        sourcePath: menuSummary?.sourcePath,
      },
      {
        key: 'field-numbering',
        label: '字段编号',
        status: 'draft_only',
        sourcePath: fieldNumberingSummary?.sourcePath,
      },
      {
        key: 'print-templates',
        label: '打印模板字段',
        status: 'source_grounded',
        sourcePath: printTemplateSummary?.sourcePath,
      },
      {
        key: 'package',
        label: '流程配置包',
        status: 'preview_only',
        sourcePath: customerPackageSummary?.sourcePath,
      },
      {
        key: 'import-tools',
        label: '导入工具边界',
        status: 'report_gate_only',
        sourcePath: importSummary?.sourcePath,
      },
    ],
    assetSummary: [
      {
        key: 'menus',
        label: '菜单品牌',
        value: menuItemCount,
        unit: '项',
        status: 'runtime_frontend_only',
        note: `${menuSummary?.sectionCount || 0} 个分组，只影响前端展示。`,
      },
      {
        key: 'fields',
        label: '字段编号',
        value: fieldReviewCount,
        unit: '项',
        status: 'draft_only',
        note: 'runtimeEnabled=false，必须人工确认。',
      },
      {
        key: 'workflows',
        label: '工作流',
        value: workflowCount,
        unit: '条',
        status: 'preview_only',
        note: `${customerPackageSummary?.workflowNodeCount || 0} 个节点，不写事实。`,
      },
      {
        key: 'module-states',
        label: '模块状态',
        value: moduleStateCount,
        unit: '项',
        status: 'preview_only',
        note:
          moduleStateNonEnabledCount > 0
            ? `${moduleStateNonEnabledCount} 个非 enabled 状态需要 reason，编译到 deployment_module_states。`
            : `${moduleStateCount} 个模块默认 enabled，未声明关闭或只读 override。`,
      },
      {
        key: 'print-templates',
        label: '打印模板',
        value: printTemplateCount,
        unit: '套',
        status: 'source_grounded',
        note: `${printFieldTruthCount} 条 fieldTruth；当前只覆盖采购合同和加工合同。`,
      },
      {
        key: 'policies',
        label: '策略预览',
        value: processPolicyCount,
        unit: '条',
        status: 'preview_only',
        note: '只允许绑定检查，不导入代码。',
      },
    ],
    validationChecks: [
      {
        key: 'no-code-sql-secret',
        label: '禁止代码 / SQL / secret',
        status: boundaryOk ? 'passed' : 'blocked',
        level: '高',
        note: '客户包不能携带 JS / Go / SQL / secret 或原始客户资料。',
      },
      {
        key: 'workflow-fact-boundary',
        label: 'Workflow / Fact 边界',
        status: customerPackageSummary?.workflows?.every(
          (item) => item.factBoundary === 'workflow_only'
        )
          ? 'passed'
          : 'blocked',
        level: '高',
        note: '协同流转预览不生成库存、出货、财务或发票事实。',
      },
      {
        key: 'runtime-loader',
        label: '运行时 loader',
        status: customerPackageSummary?.runtimeEnabled ? 'blocked' : 'passed',
        level: '高',
        note: '配置包仍是 preview，不接后端 loader。',
      },
      {
        key: 'module-states',
        label: '模块状态枚举',
        status:
          customerPackageSummary?.moduleStateUnknownOverrideCount > 0
            ? 'blocked'
            : 'passed',
        level: '高',
        note: 'moduleStates 只允许 catalog 模块和 enabled / read_only / disabled；非 enabled 必须写 reason。',
      },
      {
        key: 'print-template-boundary',
        label: '打印模板字段边界',
        status:
          printTemplateCount === 2 && printFieldTruthCount > 0
            ? 'passed'
            : 'blocked',
        level: '中',
        note: '打印字段来自 printTemplates catalog 和打印行为清单；销售订单未接打印模板前不得绕过字段策略硬编码打印字段。',
      },
      {
        key: 'real-import',
        label: '真实导入',
        status: importSummary?.canExecuteRealImport
          ? 'blocked'
          : 'blocked_by_design',
        level: '高',
        note: '客户配置发布只写控制面；真实客户业务数据导入仍不在本页执行。',
      },
    ],
    diffItems: [
      {
        key: 'menu-brand',
        type: '前端展示',
        current: '中性产品默认包',
        incoming: menuSummary?.label || '客户菜单配置',
        impact: '部署包可替换品牌、菜单分组、排序和文案。',
        status: 'runtime_frontend_only',
      },
      {
        key: 'field-numbering',
        type: '字段显示',
        current: 'V1 字段真源',
        incoming: `${fieldReviewCount} 个字段 / 编号候选`,
        impact: '需要人工确认，不自动变成 Product Core 必填。',
        status: 'draft_only',
      },
      {
        key: 'workflow-preview',
        type: '流程编排',
        current: '当前 WorkflowUsecase',
        incoming: `${workflowCount} 条工作流预览`,
        impact: '只做结构预览，不改变当前任务状态规则。',
        status: 'preview_only',
      },
      {
        key: 'module-states',
        type: '模块状态',
        current: 'catalog 默认 enabled',
        incoming:
          moduleStateOverrideCount > 0
            ? `${moduleStateOverrideCount} 个客户包 override`
            : '无客户包 override',
        impact:
          '只作为后端 module_states 控制面输入，不安装 / 卸载模块，也不代表完整关闭流程已交付。',
        status: 'preview_only',
      },
      {
        key: 'print-template-fields',
        type: '打印模板',
        current: '采购合同 / 加工合同',
        incoming: `${printTemplateCount} 套模板 / ${printFieldTruthCount} 条 fieldTruth`,
        impact:
          '只展示当前模板字段真源和缺口，不新增销售订单打印模板，不把客户专属抬头写入 Product Core。',
        status: 'source_grounded',
      },
      {
        key: 'import-tooling',
        type: '导入工具',
        current: 'dry-run evidence',
        incoming: 'execution report gate',
        impact: '没有明确批准前不写 DB，不生成业务事实。',
        status: 'report_gate_only',
      },
    ],
    versionGates: [
      {
        key: 'publishEnabled',
        label: '发布配置版本',
        enabled: customerPackageSummary?.publishEnabled === true,
      },
      {
        key: 'activateEnabled',
        label: '切换生效版本',
        enabled: customerPackageSummary?.activateEnabled === true,
      },
      {
        key: 'rollbackEnabled',
        label: '回滚配置版本',
        enabled: customerPackageSummary?.rollbackEnabled === true,
      },
    ],
  }
}

export function buildCustomerConfigDevOverview({
  customerKey = DEFAULT_DEV_CUSTOMER_KEY,
  registry = DEV_CUSTOMER_CONFIG_REGISTRY,
  menuConfig,
  fieldNumberingConfig,
  customerPackage,
} = {}) {
  const resolved = resolveDevCustomerConfigPackage(customerKey, registry)
  if (!resolved.packageConfig) {
    return {
      status: resolved.status,
      customerKey: resolved.customerKey,
      requestedCustomerKey: resolved.customerKey,
      route: DEV_CUSTOMER_CONFIG_ROUTE,
      sourcePath: '',
      registeredCustomers: resolved.registeredCustomers,
      runtimePieces: [],
      draftPieces: [],
      blockedPieces: [
        {
          key: 'missing-customer-package',
          title: '未登记客户配置包',
          sourcePath: 'config/customers/<customer-key>/',
          status: '未登记',
          boundary:
            '当前 URL customer 参数没有对应客户配置包；开发态总控不会 fallback 到 yoyoosun 冒充，也不会创建 SaaS tenant。',
        },
      ],
    }
  }

  const { packageConfig } = resolved
  const activeMenuConfig = menuConfig || packageConfig.menuConfig
  const activeFieldNumberingConfig =
    fieldNumberingConfig || packageConfig.fieldNumberingConfig
  const activeCustomerPackage = customerPackage || packageConfig.customerPackage
  const menuSummary = buildCustomerMenuRuntimeSummary(
    activeMenuConfig,
    packageConfig.menuConfigSourcePath
  )
  const fieldNumberingSummary = buildFieldNumberingDraftSummary(
    activeFieldNumberingConfig,
    packageConfig.fieldNumberingSourcePath
  )
  const customerPackageSummary = buildCustomerPackagePreviewSummary(
    activeCustomerPackage,
    packageConfig.customerPackageSourcePath
  )
  const printTemplateSummary = buildPrintTemplateFieldSummary()
  const importSummary = buildImportToolingSummary(packageConfig.customerKey)
  const packageConsoleSummary = buildCustomerPackageConsoleSummary({
    menuSummary,
    fieldNumberingSummary,
    customerPackageSummary,
    importSummary,
    printTemplateSummary,
  })

  return {
    status: resolved.status,
    customerKey: menuSummary.customerKey,
    requestedCustomerKey: resolved.customerKey,
    route: DEV_CUSTOMER_CONFIG_ROUTE,
    sourcePath: packageConfig.sourcePath,
    registeredCustomers: resolved.registeredCustomers,
    menuSummary,
    fieldNumberingSummary,
    customerPackageSummary,
    printTemplateSummary,
    packageConsoleSummary,
    importSummary,
    runtimePieces: [
      {
        key: 'brand-menu',
        title: '品牌 / 桌面菜单展示配置',
        sourcePath: menuSummary.sourcePath,
        status: '已接前端运行时',
        boundary:
          '只控制前端品牌展示、桌面菜单分组、排序、隐藏和文案；不是安全边界。',
      },
    ],
    draftPieces: [
      {
        key: 'field-numbering',
        title: '字段显示 / 编号规则',
        sourcePath: fieldNumberingSummary.sourcePath,
        status: '草案',
        boundary:
          'runtimeEnabled=false；只作为客户确认清单，不接前端运行时、不改后端、不执行导入。',
      },
      {
        key: 'process-package',
        title: '流程结构 / 策略预览',
        sourcePath: customerPackageSummary.sourcePath,
        status: 'preview_only',
        boundary:
          'raw 客户包只做 lint 和 preview；必须编译为受控 runtime manifest 后才可走 customer_config publish / activate，不接 Workflow / Fact runtime。',
      },
    ],
    blockedPieces: [
      {
        key: 'real-import',
        title: '真实客户数据导入',
        sourcePath: importSummary.sourcePath,
        status: '未批准',
        boundary:
          '客户配置测试 / 发布只写控制面表；客户、供应商、订单、库存、出货、财务等历史业务数据导入必须另走专项。',
      },
      {
        key: 'saas-tenant',
        title: 'SaaS tenant / tenant_id',
        sourcePath: DEV_CUSTOMER_CONFIG_SOURCE_PATH,
        status: '禁止误接',
        boundary:
          'customer key 只表示客户包选择，不代表 SaaS runtime tenant，也不新增 tenant_id。',
      },
    ],
  }
}

export function buildCustomerConfigDevOverviewFromSearch(searchParams = '') {
  return buildCustomerConfigDevOverview({
    customerKey: readDevCustomerKeyFromSearch(searchParams),
  })
}
