import { yoyoosunFieldNumberingConfig } from '../../../../config/customers/yoyoosun/fieldNumberingConfig.mjs'
import { yoyoosunCustomerPackage } from '../../../../config/customers/yoyoosun/customerPackage.mjs'
import { yoyoosunMenuConfig } from '../../../../config/customers/yoyoosun/menuConfig.mjs'
import { customerPackageCatalog } from '../../../../config/catalog/customerPackageCatalog.mjs'
import { DEV_CUSTOMER_CONFIG_ROUTE } from './devCustomerConfigRoute.mjs'
import { printTemplateCatalog, printTemplateStats } from './printTemplates.mjs'

export { DEV_CUSTOMER_CONFIG_ROUTE }
export const DEV_CUSTOMER_CONFIG_QUERY_KEY = 'customer'
export const DEV_CUSTOMER_CONFIG_RELEASE_BATCH_QUERY_KEY = 'release'
export const DEV_CUSTOMER_CONFIG_VIEW_QUERY_KEY = 'view'
export const DEFAULT_DEV_CUSTOMER_KEY = ''
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
export const DEV_CUSTOMER_CONFIG_RELEASE_BATCHES_API =
  '/__dev/api/customer-config/release-batches'
export const DEV_CUSTOMER_CONFIG_RELEASE_READINESS_API =
  '/__dev/api/customer-config/release-readiness'
export const DEV_CUSTOMER_CONFIG_RELEASE_EXECUTE_TEMPLATE_COMMAND =
  'node scripts/deploy/customer-config-release-execute.mjs --print-input-template'
export const DEV_CUSTOMER_CONFIG_RELEASE_READINESS_TEMPLATE_COMMAND =
  'node scripts/deploy/customer-config-release-readiness.mjs --print-input-template'

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

const FIELD_SOURCE_FALLBACK_LABEL = '来源已登记'
const SOURCE_PATH_FALLBACK_LABEL = '来源已登记'

const SOURCE_PATH_LABELS = Object.freeze({
  [DEV_CUSTOMER_CONFIG_SOURCE_PATH]: '客户配置包说明',
  [DEV_CUSTOMER_MENU_CONFIG_SOURCE_PATH]: '客户菜单配置',
  [DEV_CUSTOMER_FIELD_NUMBERING_SOURCE_PATH]: '字段编号配置',
  [DEV_CUSTOMER_PACKAGE_SOURCE_PATH]: '客户配置包',
  [DEV_CUSTOMER_IMPORT_TOOLING_SOURCE_PATH]: '导入工具入口',
  [DEV_PRINT_TEMPLATE_SOURCE_PATH]: '打印模板字段配置',
  [DEV_PRINT_TEMPLATE_BEHAVIOR_DOC_PATH]: '打印模板字段清单',
  'config/customers/<customer-key>/': '客户配置包目录',
})

const MODULE_STATE_LABELS = Object.freeze({
  enabled: '启用',
  read_only: '只读',
  disabled: '关闭',
})

const WORKFLOW_FACT_BOUNDARY_LABELS = Object.freeze({
  workflow_only: '只做协同流转',
})

const MODULE_STATE_SOURCE_LABELS = Object.freeze({
  customer_package_override: '客户包覆盖',
  catalog_default: '目录默认',
})

const PRINT_TEMPLATE_FACT_BOUNDARY_LABELS = Object.freeze({
  read_snapshot_only: '只读快照',
})

const CATALOG_STATUS_LABELS = Object.freeze({
  preview_only: '预览，不接运行时',
  controlled_empty: '受控空目录',
  contract_preview_only: '合同预览，不启用处理器',
})

const IMPLEMENTATION_SOURCE_LABELS = Object.freeze({
  compiled_runtime_manifest: '编译清单结构预览',
  registered_deployment_package_required: '实现来自已登记部署包',
})

const RUNTIME_ENABLED_LABELS = Object.freeze({
  true: '运行时开启',
  false: '运行时关闭',
})

const CUSTOMER_PACKAGE_HANDLER_FORBIDDEN_LABEL = '禁止客户包处理器'

const POLICY_KIND_LABELS = Object.freeze({
  skip_policy: '跳过策略',
  auto_generate_policy: '自动生成策略',
  close_policy: '关闭策略',
})

const POLICY_RULE_TRIGGER_LABELS = Object.freeze({
  skip_optional_review_when_unconfigured: '可选评审未配置时',
  no_risk: '无风险事项',
  source_ready: '来源资料已就绪',
  all_tasks_done: '所有协同任务完成',
})

const POLICY_RULE_RESULT_LABELS = Object.freeze({
  manual_review_required: '进入人工评审',
  preview_only: '仅生成预览',
  requires_usecase_review: '需要 usecase 评审',
  skip_optional_review: '跳过可选评审',
  generate_next_task_preview: '生成下一任务预览',
  close_preview_flow: '关闭预览流程',
})

const BOUNDARY_LABELS = Object.freeze({
  runtimeEnabled: '运行时启用',
  previewOnly: '预览模式',
  createsTenant: '创建租户',
  changesSchema: '修改 schema',
  changesMigration: '修改 migration',
  changesBackendRbac: '修改后端 RBAC',
  changesWorkflowFactRules: '修改 Workflow / Fact 规则',
  changesRuntimeLoader: '修改运行时 loader',
  executesImport: '执行导入',
  executesRealImport: '执行真实导入',
  writesBusinessRecords: '写 business_records',
  writesFacts: '写事实层',
  writesInventoryFacts: '写库存事实',
  writesShipmentFacts: '写出货事实',
  writesFinanceFacts: '写财务事实',
})

const WRITE_CLASS_LABELS = Object.freeze({
  tracked_config_read: '读取已登记配置',
  no_write_preflight: '只读预检',
  no_write_diff_preview: '只读差异预览',
  no_write_evidence: '不写库，仅生成报告',
  test_config_control_write: '写当前后端配置控制面',
  formal_config_control_write: '写正式配置控制面',
  formal_config_control_activation: '切换正式配置版本',
  business_data_import_separate_task: '真实业务数据导入专项',
})

const EXECUTION_BOUNDARY_LABELS = Object.freeze({
  customer_config_control_plane_only: '只处理客户配置控制面',
})

const EXTENSION_RUNTIME_BLOCKERS = Object.freeze([
  'no_reviewed_extension_contract',
  'customer_package_handler_forbidden',
  'registered_deployment_package_required',
])

const REGISTRY_CHECK_FALLBACK_LABELS = Object.freeze({
  boundary: '配置边界',
  command: '命令绑定',
  extension: '扩展点绑定',
  policy: '策略绑定',
})

export function isDevCustomerConfigEnabled(env = import.meta.env) {
  return env?.DEV === true
}

function normalizeCustomerKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
}

export function assertCustomerConfigReadbackRevision(
  effectiveSession = {},
  expectedRevision = ''
) {
  const expected = String(expectedRevision || '').trim()
  const actual = String(effectiveSession?.configRevision || '').trim()
  if (!expected) {
    throw new Error('客户配置清单缺少 revision，不能确认测试应用结果。')
  }
  if (actual !== expected) {
    throw new Error(
      `客户配置读回 revision 不一致：期望 ${expected}，实际 ${actual || '未返回'}。`
    )
  }
  return effectiveSession
}

function mapSourcePathLabel(sourcePath) {
  if (typeof sourcePath !== 'string' || sourcePath.trim() === '') {
    return SOURCE_PATH_FALLBACK_LABEL
  }
  return SOURCE_PATH_LABELS[sourcePath] || SOURCE_PATH_FALLBACK_LABEL
}

function resolveBrandMark(brand = {}, label = '') {
  const explicitMark =
    typeof brand.brandMark === 'string' ? brand.brandMark.trim() : ''
  if (explicitMark) return explicitMark

  const readableName =
    [brand.companyName, brand.systemName, label].find(
      (value) => typeof value === 'string' && value.trim()
    ) || ''
  return Array.from(readableName.trim().replace(/\s+/g, ''))[0] || '客'
}

export function listRegisteredDevCustomerPackages(
  registry = DEV_CUSTOMER_CONFIG_REGISTRY
) {
  return Object.values(registry).map((item) => ({
    customerKey: item.customerKey,
    label: item.label,
    sourcePath: item.sourcePath,
    sourceLabel: mapSourcePathLabel(item.sourcePath),
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
  const normalizedKey = normalizeCustomerKey(customerKey)
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
      fieldKeyLabel: '字段锚点已登记',
      sourceLabel: candidate.source
        ? `来源：${candidate.source}`
        : FIELD_SOURCE_FALLBACK_LABEL,
    }))
  )
}

function buildBoundaryItems(config = {}) {
  return Object.entries(config.boundaries || {}).map(([key, value]) => ({
    key,
    label: BOUNDARY_LABELS[key] || REGISTRY_CHECK_FALLBACK_LABELS.boundary,
    value: Boolean(value),
    valueLabel: value ? '是' : '否',
    expected: false,
    expectedLabel: '否',
    ok: value === false,
  }))
}

function buildPrintFieldRequirementItems(requirements = []) {
  return (Array.isArray(requirements) ? requirements : []).map(
    (requirement) => ({
      label: requirement.label || '字段要求',
      sourceLabel: requirement.source
        ? `来源：${requirement.source}`
        : '来源已登记',
      boundary: requirement.boundary || '只读字段要求，不写业务事实',
      requirementKeyLabel: '字段要求锚点已登记',
    })
  )
}

function withWriteBoundaryLabels(item = {}) {
  const writesBusinessData = item.writesBusinessData === true
  const writesConfigControl = item.writesConfigControl === true
  const writesLabel =
    item.writesLabel ||
    (writesBusinessData
      ? '客户、供应商、联系人、销售订单等业务数据'
      : writesConfigControl
        ? '客户配置版本、模块状态、角色画像、授权、责任池和审计记录'
        : '本地报告或只读结果')
  return {
    ...item,
    writesLabel,
    writeClassLabel: WRITE_CLASS_LABELS[item.writeClass] || '未标记写入类别',
    writesBusinessDataLabel: writesBusinessData
      ? '会写业务数据'
      : '不写业务数据',
    writesConfigControlLabel: writesConfigControl
      ? '写客户配置控制面'
      : '不写客户配置控制面',
    dataBoundaryLabel: writesBusinessData
      ? '业务数据导入专项'
      : writesConfigControl
        ? '配置控制面'
        : '不写数据库',
  }
}

function countPackageNodes(workflows = []) {
  return workflows.reduce(
    (total, workflow) => total + (workflow.nodes || []).length,
    0
  )
}

function buildKeySet(items = []) {
  return new Set((Array.isArray(items) ? items : []).map((item) => item.key))
}

function buildLabelMap(items = []) {
  return new Map(
    (Array.isArray(items) ? items : [])
      .filter((item) => item?.key && item?.label)
      .map((item) => [item.key, item.label])
  )
}

function resolveRegistryCheckLabel(label = '', fallback = '') {
  return String(label || '').trim() || fallback
}

function resolveModuleStateLabel(label = '') {
  return resolveRegistryCheckLabel(label, '已登记模块')
}

function buildPolicyRuleItem(rule = {}, index = 0) {
  const trigger = rule.when || rule.key || ''
  const result = rule.action || rule.decision || ''
  return {
    key: `policy-rule-${index + 1}`,
    triggerLabel: `条件：${POLICY_RULE_TRIGGER_LABELS[trigger] || '条件已登记'}`,
    resultLabel: `结果：${POLICY_RULE_RESULT_LABELS[result] || '结果已登记'}`,
    note:
      typeof rule.note === 'string' && rule.note.trim() ? rule.note.trim() : '',
  }
}

function uniqueValues(values = []) {
  return [...new Set(values.filter(Boolean))]
}

const FORBIDDEN_STATE_TRANSITIONS = Object.freeze([
  ['shipped', 'draft'],
  ['settled', 'submitted'],
  ['closed', 'processing'],
  ['closed', 'in_progress'],
  ['posted', 'draft'],
])

function isForbiddenStateTransition([from, to] = []) {
  const normalizedFrom = String(from || '')
    .trim()
    .toLowerCase()
  const normalizedTo = String(to || '')
    .trim()
    .toLowerCase()
  return FORBIDDEN_STATE_TRANSITIONS.some(
    ([blockedFrom, blockedTo]) =>
      normalizedFrom === blockedFrom && normalizedTo === blockedTo
  )
}

function allPackageBoundariesOk(boundaries = []) {
  return boundaries.every((item) => item.ok)
}

function buildCompiledCatalogSummary(config = {}) {
  const businessFlows = Array.isArray(config.businessFlows)
    ? config.businessFlows
    : []
  const stateMachines = Array.isArray(config.stateMachines)
    ? config.stateMachines
    : []
  const processPolicies = Array.isArray(config.processPolicies)
    ? config.processPolicies
    : []
  const extensionPoints = Array.isArray(config.extensionPoints)
    ? config.extensionPoints
    : []
  const extensionCatalogStatus =
    extensionPoints.length > 0 ? 'contract_preview_only' : 'controlled_empty'
  const withCatalogLabels = (item) => ({
    ...item,
    runtimeEnabledLabel:
      RUNTIME_ENABLED_LABELS[String(item.runtimeEnabled === true)],
    catalogStatusLabel: CATALOG_STATUS_LABELS[item.catalogStatus] || '未标记',
    implementationSourceLabel:
      IMPLEMENTATION_SOURCE_LABELS[item.implementationSource] || '未登记来源',
    ...(item.handlerAllowed === false
      ? { handlerAllowedLabel: CUSTOMER_PACKAGE_HANDLER_FORBIDDEN_LABEL }
      : {}),
  })

  return [
    withCatalogLabels({
      key: 'flow-catalog',
      label: '流程目录',
      status: 'preview_only',
      runtimeEnabled: false,
      catalogStatus: 'preview_only',
      implementationSource: 'compiled_runtime_manifest',
      itemCount: businessFlows.length + stateMachines.length,
      summary: `${businessFlows.length} 条业务流转 / ${stateMachines.length} 个状态机`,
      note: '编译后的流程目录只保留结构预览，运行时关闭；不改 WorkflowUsecase，也不写库存、出货、财务或开票事实。',
    }),
    withCatalogLabels({
      key: 'policy-catalog',
      label: '策略目录',
      status: 'preview_only',
      runtimeEnabled: false,
      catalogStatus: 'preview_only',
      implementationSource: 'registered_deployment_package_required',
      itemCount: processPolicies.length,
      summary: `${processPolicies.length} 条流程策略`,
      note: '编译后的策略目录只允许已登记策略锚点和参数；策略实现必须来自产品核心、行业模板或已注册部署包。',
    }),
    withCatalogLabels({
      key: 'extension-point-catalog',
      label: '扩展点目录',
      status: extensionCatalogStatus,
      runtimeEnabled: false,
      catalogStatus: extensionCatalogStatus,
      implementationSource: 'registered_deployment_package_required',
      handlerAllowed: false,
      customerPackageHandlerAllowed: false,
      blockedReasons: [...EXTENSION_RUNTIME_BLOCKERS],
      itemCount: extensionPoints.length,
      summary:
        extensionPoints.length > 0
          ? `${extensionPoints.length} 个扩展点合同预览`
          : '当前无扩展点绑定',
      note: '编译后的扩展点目录明确禁止客户包上传或启用处理器；后续实现只能来自已注册部署包。',
    }),
  ]
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
      label: resolveModuleStateLabel(item.label),
      state,
      stateLabel: MODULE_STATE_LABELS[state] || '未标记',
      reason: override?.reason || '未在客户包覆盖，编译清单默认按启用处理。',
      source: override ? 'customer_package_override' : 'catalog_default',
      sourceLabel: override
        ? MODULE_STATE_SOURCE_LABELS.customer_package_override
        : MODULE_STATE_SOURCE_LABELS.catalog_default,
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
    templateKeyLabel: '模板锚点已登记',
    category: item.category,
    readiness: item.readiness || 'unknown',
    runtimeStatus: item.runtimeStatus || 'unknown',
    factBoundary: item.factBoundary || 'unknown',
    factBoundaryLabel:
      PRINT_TEMPLATE_FACT_BOUNDARY_LABELS[item.factBoundary] || '未标记边界',
    moduleKeys: item.moduleKeys || [],
    fieldTruthCount: (item.fieldTruth || []).length,
    fieldTruthCountLabel: `${(item.fieldTruth || []).length} 条字段真源`,
    fieldRequirementCount: (item.fieldRequirements || []).length,
    fieldRequirementCountLabel: `${
      (item.fieldRequirements || []).length
    } 条字段要求`,
    sourceFileCount: (item.sourceFiles || []).length,
    fieldTruth: item.fieldTruth || [],
    fieldRequirementItems: buildPrintFieldRequirementItems(
      item.fieldRequirements || []
    ),
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
    fieldRequirementCount: templates.reduce(
      (total, item) => total + item.fieldRequirementCount,
      0
    ),
    templates,
    sourcePath,
    sourceLabel: mapSourcePathLabel(sourcePath),
    behaviorDocPath: DEV_PRINT_TEMPLATE_BEHAVIOR_DOC_PATH,
    behaviorDocLabel: mapSourcePathLabel(DEV_PRINT_TEMPLATE_BEHAVIOR_DOC_PATH),
    runtimeStatus: 'source_grounded',
    boundary:
      '当前登记采购合同、加工合同、物料明细、色卡和作业指导书；销售订单受理未接打印模板，客户抬头 / 签章 / 固定文案留在客户配置或模板边界。',
  }
}

export function buildCustomerPackagePreviewSummary(
  config = yoyoosunCustomerPackage,
  sourcePath = DEV_CUSTOMER_PACKAGE_SOURCE_PATH,
  catalog = customerPackageCatalog
) {
  const moduleStateSummary = buildModuleStateSummary(config, catalog)
  const catalogPolicyKeys = buildKeySet(catalog.policies)
  const catalogCommandKeys = buildKeySet(catalog.commands)
  const catalogPolicyLabels = buildLabelMap(catalog.policies)
  const catalogCommandLabels = buildLabelMap(catalog.commands)
  const catalogWorkPoolKeys = buildKeySet(catalog.workPools)
  const catalogWorkPoolLabels = buildLabelMap(catalog.workPools)
  const workflows = Array.isArray(config.workflows) ? config.workflows : []
  const processPolicies = Array.isArray(config.processPolicies)
    ? config.processPolicies
    : []
  const extensionPoints = Array.isArray(config.extensionPoints)
    ? config.extensionPoints
    : []
  const printTemplateDefaults = Array.isArray(config.printTemplateDefaults)
    ? config.printTemplateDefaults
    : []
  const printTemplateLabels = buildLabelMap(
    printTemplateCatalog.map((item) => ({
      key: item.key,
      label: item.title,
    }))
  )
  const workflowCommandKeys = uniqueValues(
    workflows.flatMap((workflow) =>
      (workflow.nodes || []).map((node) => node.command)
    )
  )
  const missingWorkflowEndCount = workflows.filter(
    (workflow) => !(workflow.nodes || []).some((node) => node.type === 'end')
  ).length
  const missingWorkflowRoleCount = workflows.reduce(
    (total, workflow) =>
      total +
      (workflow.nodes || []).filter(
        (node) => node.ownerPool && !catalogWorkPoolKeys.has(node.ownerPool)
      ).length,
    0
  )
  const illegalStateTransitionCount = (config.stateMachines || []).reduce(
    (total, stateMachine) =>
      total +
      (stateMachine.transitions || []).filter(isForbiddenStateTransition)
        .length,
    0
  )
  const unregisteredPolicyBindingCount = processPolicies.filter(
    (item) => !catalogPolicyKeys.has(item.key)
  ).length
  const unregisteredCommandBindingCount = workflowCommandKeys.filter(
    (key) => !catalogCommandKeys.has(key)
  ).length
  const unregisteredExtensionBindingCount = extensionPoints.filter(
    (item) => item.handler
  ).length
  const boundaries = [
    {
      key: 'runtimeEnabled',
      label: BOUNDARY_LABELS.runtimeEnabled,
      value: config.runtimeEnabled === true,
      valueLabel: config.runtimeEnabled === true ? '是' : '否',
      expected: false,
      expectedLabel: '否',
      ok: config.runtimeEnabled !== true,
    },
    {
      key: 'previewOnly',
      label: BOUNDARY_LABELS.previewOnly,
      value: config.sourcePolicy?.previewOnly === true,
      valueLabel: config.sourcePolicy?.previewOnly === true ? '是' : '否',
      expected: true,
      expectedLabel: '是',
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
    workflowCount: workflows.length,
    workflowNodeCount: countPackageNodes(workflows),
    workflows: workflows.map((workflow) => ({
      key: workflow.key,
      label: workflow.label,
      status: workflow.status,
      ownerPools: workflow.ownerPools || [],
      ownerPoolLabels: (workflow.ownerPools || []).map(
        (pool) =>
          catalogWorkPoolLabels.get(pool) ||
          resolveRegistryCheckLabel('', '责任池')
      ),
      nodeCount: (workflow.nodes || []).length,
      hasEndNode: (workflow.nodes || []).some((node) => node.type === 'end'),
      commandKeys: (workflow.nodes || [])
        .map((node) => node.command)
        .filter(Boolean),
      factBoundary: workflow.factBoundary,
      factBoundaryLabel:
        WORKFLOW_FACT_BOUNDARY_LABELS[workflow.factBoundary] ||
        '协同边界未标记',
      guardrail: workflow.guardrail,
    })),
    businessFlowCount: (config.businessFlows || []).length,
    businessFlows: (config.businessFlows || []).map((item) => ({
      ...item,
      flowKeyLabel: '业务流锚点已登记',
      moduleRouteLabel: (item.modules || []).length
        ? `关联模块：${(item.modules || []).length} 个`
        : '关联模块未声明',
    })),
    stateMachineCount: (config.stateMachines || []).length,
    stateMachines: (config.stateMachines || []).map((item) => ({
      key: item.key,
      label: item.label,
      status: item.status,
      stateCount: (item.states || []).length,
      transitionCount: (item.transitions || []).length,
      stateCountLabel: `${(item.states || []).length} 个状态`,
      transitionCountLabel: `${(item.transitions || []).length} 条转换`,
      guardrail: item.guardrail,
    })),
    processPolicyCount: processPolicies.length,
    processPolicies: processPolicies.map((item) => ({
      key: item.key,
      label: item.label,
      status: item.status,
      kind: item.kind,
      ruleCount: (item.rules || []).length,
      kindLabel: item.kind
        ? `策略类型：${POLICY_KIND_LABELS[item.kind] || '已登记策略'}`
        : '策略类型未声明',
      ruleCountLabel: `${(item.rules || []).length} 条规则`,
      ruleItems: (item.rules || []).map((rule, ruleIndex) =>
        buildPolicyRuleItem(rule, ruleIndex)
      ),
      registered: catalogPolicyKeys.has(item.key),
      guardrail: item.guardrail,
    })),
    extensionPointCount: extensionPoints.length,
    extensionPoints: extensionPoints.map((item) => ({
      key: item.key,
      label: item.label,
      status: item.status,
      runtimeEnabled: item.runtimeEnabled === true,
      hasCustomerPackageHandler: Boolean(item.handler),
      registered: !item.handler && item.runtimeEnabled !== true,
      guardrail: item.guardrail,
    })),
    strategyRegistryChecks: processPolicies.map((item) => ({
      key: item.key,
      label: resolveRegistryCheckLabel(
        item.label || catalogPolicyLabels.get(item.key),
        REGISTRY_CHECK_FALLBACK_LABELS.policy
      ),
      status: catalogPolicyKeys.has(item.key)
        ? 'registered_binding'
        : 'blocked',
      implementationSource: 'registered_deployment_package_required',
      implementationSourceLabel:
        IMPLEMENTATION_SOURCE_LABELS.registered_deployment_package_required,
      note: catalogPolicyKeys.has(item.key)
        ? '只允许绑定已登记策略 key；策略实现不得由客户包上传。'
        : '策略 key 未登记，必须阻断客户配置发布。',
    })),
    commandBindingChecks: workflowCommandKeys.map((key) => ({
      key,
      label: resolveRegistryCheckLabel(
        catalogCommandLabels.get(key),
        REGISTRY_CHECK_FALLBACK_LABELS.command
      ),
      status: catalogCommandKeys.has(key) ? 'registered_binding' : 'blocked',
      implementationSource: 'registered_deployment_package_required',
      implementationSourceLabel:
        IMPLEMENTATION_SOURCE_LABELS.registered_deployment_package_required,
      note: catalogCommandKeys.has(key)
        ? '流程节点只绑定已登记命令锚点；运行时执行仍由部署包 / 后端处理器决定。'
        : '流程节点命令未登记，必须阻断客户配置发布。',
    })),
    extensionRegistryChecks:
      extensionPoints.length > 0
        ? extensionPoints.map((item) => ({
            key: item.key,
            label: resolveRegistryCheckLabel(
              item.label,
              REGISTRY_CHECK_FALLBACK_LABELS.extension
            ),
            status:
              item.runtimeEnabled === true || item.handler
                ? 'blocked'
                : 'controlled_empty',
            implementationSource: 'registered_deployment_package_required',
            implementationSourceLabel:
              IMPLEMENTATION_SOURCE_LABELS.registered_deployment_package_required,
            handlerAllowed: false,
            handlerAllowedLabel: CUSTOMER_PACKAGE_HANDLER_FORBIDDEN_LABEL,
            customerPackageHandlerAllowed: false,
            blockedReasons: [...EXTENSION_RUNTIME_BLOCKERS],
            note:
              item.runtimeEnabled === true || item.handler
                ? '客户包不得上传扩展点实现或未登记处理器。'
                : '扩展点合同只保留绑定位，不发布可执行处理器。',
          }))
        : [
            {
              key: 'controlled-empty-extension-catalog',
              label: '扩展点绑定',
              status: 'controlled_empty',
              implementationSource: 'registered_deployment_package_required',
              implementationSourceLabel:
                IMPLEMENTATION_SOURCE_LABELS.registered_deployment_package_required,
              handlerAllowed: false,
              handlerAllowedLabel: CUSTOMER_PACKAGE_HANDLER_FORBIDDEN_LABEL,
              customerPackageHandlerAllowed: false,
              blockedReasons: [...EXTENSION_RUNTIME_BLOCKERS],
              note: '当前客户包未绑定扩展点；后续如绑定，处理器必须来自已注册部署包。',
            },
          ],
    compiledCatalogSummary: buildCompiledCatalogSummary(config),
    importMappingCount: Array.isArray(config.importMappings)
      ? config.importMappings.length
      : 0,
    printTemplateDefaultCount: printTemplateDefaults.length,
    printTemplateDefaults: printTemplateDefaults.map((item) => ({
      templateKey: item.templateKey,
      templateLabel:
        printTemplateLabels.get(item.templateKey) || '已登记打印模板',
      templateKeyLabel: '模板锚点已登记',
      status: item.status,
      defaultFieldCount: Object.keys(item.partyDefaults || {}).length,
      defaultFieldCountLabel: `${
        Object.keys(item.partyDefaults || {}).length
      } 个默认方字段`,
      partyDefaultKeysLabel: `${
        Object.keys(item.partyDefaults || {}).length
      } 个默认方字段已登记`,
      partyDefaultKeys: Object.keys(item.partyDefaults || {}),
      runtimeConsumed: true,
      supplierDefaultsAllowed: false,
      supplierDefaultsAllowedLabel: '供应商快照受保护',
      guardrail: item.guardrail,
    })),
    missingWorkflowEndCount,
    missingWorkflowRoleCount,
    illegalStateTransitionCount,
    unregisteredPolicyBindingCount,
    unregisteredCommandBindingCount,
    unregisteredExtensionBindingCount,
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
    sourceLabel: mapSourcePathLabel(sourcePath),
  }
}

export function buildCustomerMenuRuntimeSummary(
  menuConfig = yoyoosunMenuConfig,
  sourcePath = DEV_CUSTOMER_MENU_CONFIG_SOURCE_PATH
) {
  const sections = menuConfig.desktopMenu?.sections || []
  const brand = menuConfig.brand || {}
  return {
    customerKey: menuConfig.customerKey,
    label: menuConfig.label,
    brand: {
      ...brand,
      brandMark: resolveBrandMark(brand, menuConfig.label),
    },
    sectionCount: sections.length,
    itemCount: countMenuItems(sections),
    sections,
    sourcePath,
    sourceLabel: mapSourcePathLabel(sourcePath),
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
        label: BOUNDARY_LABELS.runtimeEnabled,
        value: config.runtimeEnabled === true,
        valueLabel: config.runtimeEnabled === true ? '是' : '否',
        expected: false,
        expectedLabel: '否',
        ok: config.runtimeEnabled !== true,
      },
      ...buildBoundaryItems(config),
    ],
    sourcePath,
    sourceLabel: mapSourcePathLabel(sourcePath),
  }
}

function resolveCustomerConfigTestApplyAvailability(
  customerKey,
  customerPackageSummary
) {
  const normalizedCustomerKey = normalizeCustomerKey(customerKey)
  if (!normalizedCustomerKey) {
    return {
      canApply: false,
      blockedReasons: ['customer_not_selected'],
      note: '请先选择已登记客户配置包；当前不会发布或激活任何配置。',
    }
  }
  if (
    !customerPackageSummary ||
    normalizeCustomerKey(customerPackageSummary.customerKey) !==
      normalizedCustomerKey
  ) {
    return {
      canApply: false,
      blockedReasons: ['customer_package_not_loaded'],
      note: '当前客户配置包未登记或未加载，不能应用到后端。',
    }
  }

  const checks = [
    {
      code: 'package_not_release_ready',
      blocked: customerPackageSummary.status !== 'release_ready',
      message:
        customerPackageSummary.status === 'draft'
          ? '配置包仍是草案'
          : '配置包尚未进入发布就绪状态',
    },
    {
      code: 'preview_only',
      blocked: customerPackageSummary.previewOnly !== false,
      message: '当前配置只供预览',
    },
    {
      code: 'runtime_disabled',
      blocked: customerPackageSummary.runtimeEnabled !== true,
      message: '运行时编译未开放',
    },
    {
      code: 'publish_disabled',
      blocked: customerPackageSummary.publishEnabled !== true,
      message: '发布未开放',
    },
    {
      code: 'activate_disabled',
      blocked: customerPackageSummary.activateEnabled !== true,
      message: '激活未开放',
    },
  ]
  const blockers = checks.filter((item) => item.blocked)
  if (blockers.length === 0) {
    return {
      canApply: true,
      blockedReasons: [],
      note: '当前配置包已满足测试应用门禁；操作只写客户配置控制面，不导入业务数据。',
    }
  }
  return {
    canApply: false,
    blockedReasons: blockers.map((item) => item.code),
    note: `当前配置包不可应用：${blockers
      .map((item) => item.message)
      .join('；')}。可继续做只读预览和试跑，不能发布或激活。`,
  }
}

export function buildImportToolingSummary(
  customerKey = DEFAULT_DEV_CUSTOMER_KEY,
  customerPackageSummary = null
) {
  const normalizedCustomerKey = normalizeCustomerKey(customerKey)
  const resolvedCustomerPackageSummary =
    customerPackageSummary ||
    (normalizedCustomerKey === 'yoyoosun'
      ? buildCustomerPackagePreviewSummary()
      : null)
  const testApplyAvailability = resolveCustomerConfigTestApplyAvailability(
    normalizedCustomerKey,
    resolvedCustomerPackageSummary
  )
  const fixtureBasePath = `scripts/import/fixtures/customers/${normalizedCustomerKey}`
  const outputBasePath = `output/customers/${normalizedCustomerKey}`
  const uiDryRunOut = `${outputBasePath}/ui-import-dry-run`
  const releaseEvidenceDir = `deployments/${normalizedCustomerKey}/evidence/releases/<release-batch>`
  const releaseReadbackPreflightReportPath = `${outputBasePath}/customer-config-readback-preflight.json`
  return {
    sourcePath: DEV_CUSTOMER_IMPORT_TOOLING_SOURCE_PATH,
    sourceLabel: mapSourcePathLabel(DEV_CUSTOMER_IMPORT_TOOLING_SOURCE_PATH),
    qaCommand: DEV_CUSTOMER_CONFIG_QA_COMMAND,
    uiDryRunApiPath: DEV_CUSTOMER_IMPORT_DRY_RUN_API,
    uiRuntimeManifestApiPath: DEV_CUSTOMER_CONFIG_RUNTIME_MANIFEST_API,
    uiReleaseBatchesApiPath: DEV_CUSTOMER_CONFIG_RELEASE_BATCHES_API,
    uiReleaseReadinessApiPath: DEV_CUSTOMER_CONFIG_RELEASE_READINESS_API,
    canRunUiDryRun: normalizedCustomerKey === 'yoyoosun',
    canApplyTestConfig: testApplyAvailability.canApply,
    canCheckReleaseReadiness: normalizedCustomerKey === 'yoyoosun',
    canExecuteRealImport: false,
    writesBusinessData: false,
    writesBusinessDataLabel: '不写业务数据',
    writesConfigControl: true,
    writesConfigControlLabel: '写客户配置控制面',
    executionBoundary: 'customer_config_control_plane_only',
    executionBoundaryLabel:
      EXECUTION_BOUNDARY_LABELS.customer_config_control_plane_only,
    canExecuteRealImportLabel: '不执行真实业务数据导入',
    notBusinessDataImport: true,
    writesDatabase: true,
    executionFlagSummary: [
      {
        key: 'canExecuteRealImport',
        label: '真实业务数据导入',
        value: false,
        valueLabel: '不执行',
        status: 'blocked_by_design',
      },
      {
        key: 'writesBusinessData',
        label: '业务数据写入',
        value: false,
        valueLabel: '不写业务数据',
        status: 'passed',
      },
      {
        key: 'writesConfigControl',
        label: '配置控制面写入',
        value: true,
        valueLabel: '允许受控写入',
        status: testApplyAvailability.canApply ? 'test_apply_ready' : 'blocked',
      },
      {
        key: 'executionBoundary',
        label: '执行边界',
        value: 'customer_config_control_plane_only',
        valueLabel:
          EXECUTION_BOUNDARY_LABELS.customer_config_control_plane_only,
        status: 'passed',
      },
    ],
    testApply: {
      key: 'test-config-apply',
      label: '本地/测试后端应用',
      status: testApplyAvailability.canApply ? 'test_apply_ready' : 'blocked',
      target: '当前 Vite /rpc 代理后端（http://127.0.0.1:8300）',
      writes:
        'customer_config_revisions / deployment_module_states / role_profiles / access_entitlements / work_pools / work_pool_memberships / runtime_audit_events',
      writesLabel: '客户配置版本、模块状态、角色画像、授权、责任池和审计记录',
      operations: [
        'compile_runtime_manifest',
        'validate_customer_config',
        'publish_customer_config',
        'check_customer_config_transition',
        'activate_customer_config',
        'get_effective_session',
      ],
      blockedReasons: testApplyAvailability.blockedReasons,
      note: testApplyAvailability.canApply
        ? '使用当前管理员登录态，通过 Vite /rpc 固定代理 http://127.0.0.1:8300 调用客户配置接口；成功后后台和岗位任务端读取有效配置版本的测试投影。正式目标环境不从此按钮选择。'
        : testApplyAvailability.note,
      noBusinessDataImport: true,
    },
    releaseApply: {
      key: 'release-config-apply',
      label: '正式发布执行器交接',
      status: 'release_gate_required',
      target: '由正式执行器参数显式确认的目标环境',
      evidenceDir: releaseEvidenceDir,
      writes:
        'customer_config_revisions / deployment_module_states / role_profiles / access_entitlements / work_pools / work_pool_memberships / runtime_audit_events',
      writesLabel: '客户配置版本、模块状态、角色画像、授权、责任池和审计记录',
      operations: [
        'release_readiness_gate',
        'customer_config_release_execute',
        'authenticated_readback',
        'release_report',
      ],
      command: DEV_CUSTOMER_CONFIG_RELEASE_EXECUTE_TEMPLATE_COMMAND,
      note: '页面只检查选定证据批次并交接正式执行器输入模板；不直接发布或激活正式配置。正式执行器负责目标端点、令牌、确认短语、release report 和 authenticated readback。',
      noBusinessDataImport: true,
    },
    releaseReadbackPreflight: {
      key: 'release-readback-preflight',
      label: '有效版本读回预检',
      status: 'report_gate_only',
      target: releaseReadbackPreflightReportPath,
      command: DEV_CUSTOMER_CONFIG_RELEASE_READINESS_TEMPLATE_COMMAND,
      writesDatabase: false,
      writesConfigControl: false,
      writesBusinessData: false,
      requiresReleaseEvidence: true,
      requiresAdminConfirmation: false,
      notProvenByThisReport: [
        '目标后端已经读回有效客户配置版本',
        '目标环境有效配置读回 smoke 已通过',
        '目标环境发布已执行',
      ],
      note: '只打印生成读回缺口报告所需的显式 manifest、证据批次和 release report 输入；不调用后端、不读取令牌、不写入发布证据、不发布或激活客户配置。',
    },
    importFlow: [
      withWriteBoundaryLabels({
        key: 'tracked-package',
        step: '1',
        title: '读取已登记包',
        status: 'passed',
        outcome: '读取已登记客户包并解析资产清单',
        target:
          'config/customers/yoyoosun/customerPackage.mjs；不开放原始压缩包或任意代码上传',
        writesDatabase: false,
        writesConfigControl: false,
        writesBusinessData: false,
        writeClass: 'tracked_config_read',
        requiresReleaseEvidence: false,
        requiresAdminConfirmation: false,
        requiresSeparateTask: false,
      }),
      withWriteBoundaryLabels({
        key: 'preflight',
        step: '2',
        title: '校验',
        status: 'passed',
        outcome:
          '阻断非法状态、未登记策略 / 扩展点、流程无闭环和角色缺失；模块状态只作为控制面输入',
        target: '只读解析，不写库',
        writesDatabase: false,
        writesConfigControl: false,
        writesBusinessData: false,
        writeClass: 'no_write_preflight',
        requiresReleaseEvidence: false,
        requiresAdminConfirmation: false,
        requiresSeparateTask: false,
      }),
      withWriteBoundaryLabels({
        key: 'diff-preview',
        step: '3',
        title: '差异对比',
        status: 'preview_only',
        outcome: '行业模板 / 当前生效配置 / 候选客户包三方口径',
        target: '页面只读差异，不写库',
        writesDatabase: false,
        writesConfigControl: false,
        writesBusinessData: false,
        writeClass: 'no_write_diff_preview',
        requiresReleaseEvidence: false,
        requiresAdminConfirmation: false,
        requiresSeparateTask: false,
      }),
      withWriteBoundaryLabels({
        key: 'ui-dry-run',
        step: '4',
        title: '测试试跑',
        status:
          normalizedCustomerKey === 'yoyoosun' ? 'preview_only' : 'blocked',
        outcome: '生成本地证据',
        target: uiDryRunOut,
        writesDatabase: false,
        writesConfigControl: false,
        writesBusinessData: false,
        writeClass: 'no_write_evidence',
        requiresReleaseEvidence: false,
        requiresAdminConfirmation: false,
        requiresSeparateTask: false,
      }),
      withWriteBoundaryLabels({
        key: 'import-draft-revision',
        step: '5',
        title: '应用测试配置',
        status: testApplyAvailability.canApply ? 'test_apply_ready' : 'blocked',
        outcome: '校验并发布受控配置版本',
        target: '当前 Vite /rpc 代理后端（http://127.0.0.1:8300）',
        writesDatabase: true,
        writesConfigControl: true,
        writesBusinessData: false,
        writeClass: 'test_config_control_write',
        requiresReleaseEvidence: false,
        requiresAdminConfirmation: true,
        requiresSeparateTask: false,
      }),
      withWriteBoundaryLabels({
        key: 'formal-import',
        step: '6',
        title: '发布',
        status: 'release_gate_required',
        outcome: '激活切换有效配置版本；失败保留旧版本',
        target: '目标环境 ERP 应用数据库',
        writesDatabase: true,
        writesConfigControl: true,
        writesBusinessData: false,
        writeClass: 'formal_config_control_write',
        requiresReleaseEvidence: true,
        requiresAdminConfirmation: true,
        requiresSeparateTask: false,
      }),
    ],
    databaseTargets: [
      withWriteBoundaryLabels({
        key: 'ui-dry-run',
        label: '当前页面可执行',
        status: 'no_write',
        target: '不写数据库',
        writes: uiDryRunOut,
        writeClass: 'no_write_evidence',
        writesConfigControl: false,
        writesBusinessData: false,
        requiresReleaseEvidence: false,
        requiresAdminConfirmation: false,
        requiresSeparateTask: false,
        reason: '只生成评审证据，供人工确认和后续发布门禁复核。',
      }),
      withWriteBoundaryLabels({
        key: 'test-config-apply',
        label: '本地/测试后端应用',
        status: testApplyAvailability.canApply ? 'test_apply_ready' : 'blocked',
        target: '当前 Vite /rpc 代理后端（http://127.0.0.1:8300）',
        writes:
          'customer_config_revisions / deployment_module_states / role_profiles / access_entitlements / work_pools / work_pool_memberships / runtime_audit_events',
        writeClass: 'test_config_control_write',
        writesConfigControl: true,
        writesBusinessData: false,
        requiresReleaseEvidence: false,
        requiresAdminConfirmation: true,
        requiresSeparateTask: false,
        reason:
          '这是当前 Vite /rpc 固定代理 http://127.0.0.1:8300 的客户配置控制面写入；登录后的后台和岗位任务端通过客户配置接口读取有效版本。正式目标环境由统一执行器显式确认。',
      }),
      withWriteBoundaryLabels({
        key: 'customer-config-publish',
        label: '正式版发布配置',
        status: 'release_gate_required',
        target: '目标环境 ERP 应用数据库',
        writes:
          'customer_config_revisions / deployment_module_states / role_profiles / access_entitlements / work_pools / work_pool_memberships / runtime_audit_events',
        writeClass: 'formal_config_control_write',
        writesConfigControl: true,
        writesBusinessData: false,
        requiresReleaseEvidence: true,
        requiresAdminConfirmation: true,
        requiresSeparateTask: false,
        reason:
          '登录后的客户配置投影必须从当前 ERP 后端数据库读取有效版本，并与角色权限菜单取交集。',
      }),
      withWriteBoundaryLabels({
        key: 'customer-config-activate',
        label: '正式版激活配置',
        status: 'release_gate_required',
        target: '目标环境 ERP 应用数据库',
        writes: 'customer_config_revisions.status / runtime_audit_events',
        writeClass: 'formal_config_control_activation',
        writesConfigControl: true,
        writesBusinessData: false,
        requiresReleaseEvidence: true,
        requiresAdminConfirmation: true,
        requiresSeparateTask: false,
        reason: '激活只是切换有效配置版本，不写库存、出货、财务或业务事实。',
      }),
      withWriteBoundaryLabels({
        key: 'business-data-import',
        label: '真实客户业务数据',
        status: 'separate_task_required',
        target: '目标环境 ERP 应用数据库的业务表',
        writes: '客户、供应商、联系人、销售订单等领域表',
        writeClass: 'business_data_import_separate_task',
        writesConfigControl: false,
        writesBusinessData: true,
        requiresReleaseEvidence: true,
        requiresAdminConfirmation: true,
        requiresSeparateTask: true,
        reason:
          '这是历史业务数据迁移专项，必须走领域 usecase、备份、审计和回滚，不混入客户配置包发布。',
      }),
    ],
    formalGates: [
      {
        key: 'manifest-evidence',
        label: '清单指纹证据',
        status: 'required',
        note: '运行时清单必须绑定 sha256，避免发布时替换内容。',
      },
      {
        key: 'release-evidence',
        label: '目标环境发布证据',
        status: 'required',
        note: '备份恢复、迁移、冒烟检查和签收必须齐备。',
      },
      {
        key: 'admin-confirmation',
        label: '管理员确认短语',
        status: 'required',
        note: '发布 / 激活必须显式确认，不能由页面默认触发。',
      },
      {
        key: 'version-snapshot',
        label: '配置版本快照',
        status: 'snapshot_supported',
        note: '发布写入编译快照和配置指纹；激活只切换有效配置版本。',
      },
      {
        key: 'audit-log',
        label: '审计日志',
        status: 'audit_supported',
        note: '发布 / 激活 / 回滚会写脱敏运行审计事件。',
      },
      {
        key: 'rollback',
        label: '受控回滚',
        status: 'rollback_supported',
        note: 'rollback_customer_config 只切换配置版本，不删除库存、出货、财务或业务事实。',
      },
      {
        key: 'business-import',
        label: '业务数据导入',
        status: 'separate_task_required',
        note: '配置版本发布不等于客户历史业务数据导入。',
      },
    ],
    versionAuditSupport: [
      {
        key: 'compiled-snapshot',
        label: '配置版本快照',
        status: 'snapshot_supported',
        note: '客户配置版本保存编译快照、配置指纹和版本状态。',
      },
      {
        key: 'draft-before-active',
        label: '草稿先行',
        status: testApplyAvailability.canApply ? 'test_apply_ready' : 'blocked',
        note: testApplyAvailability.canApply
          ? '发布写入受控版本，激活单独切换有效版本；发布失败不影响旧版本。'
          : testApplyAvailability.note,
      },
      {
        key: 'rollback-control',
        label: '受控回滚',
        status: 'rollback_supported',
        note: 'rollback_customer_config 只恢复已发布配置版本，不删除业务事实。',
      },
      {
        key: 'runtime-audit',
        label: '审计日志',
        status: 'audit_supported',
        note: '发布 / 激活 / 回滚写脱敏运行审计。',
      },
    ],
    tools: [
      {
        key: 'freeze',
        title: '来源快照冻结检查',
        command: `node scripts/import/customerSourceSnapshotFreezeCheck.mjs --source ${fixtureBasePath}/source-snapshot.freeze.sample.json --existing ${fixtureBasePath}/existing-v1.freeze.sample.json --out ${outputBasePath}/source-snapshot-freeze`,
        status: 'evidence_only',
        note: '只读冻结来源快照，不连接后端、不写数据库、不代表真实导入批准。',
      },
      {
        key: 'dry-run',
        title: '客户导入试跑',
        command: `node scripts/import/customerImportDryRun.mjs --source ${fixtureBasePath}/source-snapshot.sample.json --existing ${fixtureBasePath}/existing-v1.sample.json --out ${outputBasePath}/import-dry-run`,
        status: 'preview_only',
        note: '只生成候选、冲突和未决队列预览，不写客户业务表。',
      },
      {
        key: 'release-readback-preflight',
        title: '发布门禁输入模板',
        command: DEV_CUSTOMER_CONFIG_RELEASE_READINESS_TEMPLATE_COMMAND,
        status: 'report_gate_only',
        note: '只打印门禁所需输入；显式证据批次在页面选择，实际 manifestPath 以只读检查结果为准。不调用后端、不读取令牌、不证明真实 active revision。',
      },
      {
        key: 'release-rollback-execute',
        title: '正式发布 / 回滚执行器输入模板',
        command: DEV_CUSTOMER_CONFIG_RELEASE_EXECUTE_TEMPLATE_COMMAND,
        status: 'release_gate_required',
        note: '只打印发布 / 激活 / 回滚输入模板，不读取 token、不调用客户配置接口。',
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
  const printTemplateDefaultCount =
    customerPackageSummary?.printTemplateDefaultCount || 0
  const boundaryOk = customerPackageSummary?.boundaryOk === true
  const policyBindingCount = customerPackageSummary?.processPolicyCount || 0
  const extensionPointCount = customerPackageSummary?.extensionPointCount || 0
  const importMappingCount = customerPackageSummary?.importMappingCount || 0
  const unregisteredStrategyCount =
    (customerPackageSummary?.unregisteredPolicyBindingCount || 0) +
    (customerPackageSummary?.unregisteredCommandBindingCount || 0)
  const unregisteredExtensionCount =
    customerPackageSummary?.unregisteredExtensionBindingCount || 0
  const missingWorkflowEndCount =
    customerPackageSummary?.missingWorkflowEndCount || 0
  const missingWorkflowRoleCount =
    customerPackageSummary?.missingWorkflowRoleCount || 0
  const illegalStateTransitionCount =
    customerPackageSummary?.illegalStateTransitionCount || 0
  const customerKey =
    customerPackageSummary?.customerKey ||
    menuSummary?.customerKey ||
    DEFAULT_DEV_CUSTOMER_KEY
  const packageQaCommand =
    customerPackageSummary?.qaCommand || DEV_CUSTOMER_PACKAGE_QA_COMMAND
  const boundaryFailedCount = (customerPackageSummary?.boundaries || []).filter(
    (item) => !item.ok
  ).length
  const canApplyTestConfig = importSummary?.canApplyTestConfig === true
  const testApplyNote =
    importSummary?.testApply?.note || '当前配置包不可应用到后端。'

  return {
    primaryStatus: boundaryOk ? 'PREVIEW_READY' : 'BLOCKED',
    packageLabel: customerPackageSummary?.label || '未登记客户配置包',
    reviewDecision: {
      status: boundaryOk ? 'REVIEW_READY' : 'BLOCKED',
      title: boundaryOk ? '可以继续预览评审' : '先修复配置包阻塞项',
      summary: boundaryOk
        ? canApplyTestConfig
          ? '结构与禁止项已通过检查；当前配置包已满足测试应用门禁，正式发布仍须通过发布证据门禁。'
          : `结构与禁止项已通过检查，但当前配置包仍是草案且仅供预览。${testApplyNote}`
        : `配置包存在 ${boundaryFailedCount} 个阻塞项；修复后重新运行 lint。`,
      nextAction: boundaryOk
        ? canApplyTestConfig
          ? '先做试跑和本地/测试后端配置应用；正式版进入发布门禁检查。'
          : '继续只读预览和试跑；完成正式评审并开放运行时、发布与激活后再应用。'
        : '先修复 failed boundary，再重新运行客户包 lint。',
    },
    decisionCards: [
      {
        key: 'review-ready',
        label: '人工评审',
        status: boundaryOk ? 'REVIEW_READY' : 'BLOCKED',
        outcome: boundaryOk ? '可继续' : '阻塞',
        note: boundaryOk
          ? '只进入评审证据，不改变运行时。'
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
        nextAction: '正式导入另开任务，并先完成客户确认、备份证据和回滚方案。',
      },
      {
        key: 'publish-runtime',
        label: '发布 / 激活',
        status: canApplyTestConfig ? 'release_gate_required' : 'blocked',
        outcome: canApplyTestConfig ? '门禁后可执行' : '当前未开放',
        note: canApplyTestConfig
          ? '发布版必须先通过清单指纹、发布证据和管理员确认。'
          : testApplyNote,
        nextAction: canApplyTestConfig
          ? '在预检与发布工作台检查发布门禁；通过后再发布到正式版。'
          : '先完成客户配置包正式评审并开放运行时、发布与激活。',
      },
    ],
    preflightStages: [
      {
        key: 'registered-package',
        label: '读取已登记客户包',
        status: 'passed',
        note: '只读取 registry 已登记配置，不接上传入口。',
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
        note: `${menuItemCount} 个菜单项、${fieldReviewCount} 个字段候选、${moduleStateOverrideCount} 个模块状态覆盖、${printTemplateCount} 套打印模板进入人工评审。`,
      },
      {
        key: 'dry-run',
        label: '测试版页面试跑',
        status: importSummary?.canRunUiDryRun ? 'preview_only' : 'blocked',
        note: '在开发页触发试跑，生成证据和报告，不写数据库。',
      },
      {
        key: 'publish',
        label: '发布与回滚',
        status: canApplyTestConfig ? 'release_gate_required' : 'blocked',
        note: canApplyTestConfig
          ? '发布 / 激活 / 回滚都必须走发布证据；页面只提供命令复核，不提供裸回滚按钮。'
          : testApplyNote,
      },
    ],
    reviewChecklist: [
      {
        key: 'package-lint',
        label: '客户包结构预检',
        role: '实施 / 开发',
        status: boundaryOk ? 'passed' : 'blocked',
        sourcePath: customerPackageSummary?.sourcePath,
        sourceLabel: customerPackageSummary?.sourceLabel,
        nextAction: packageQaCommand,
      },
      {
        key: 'field-numbering-review',
        label: '字段显示与编号人工确认',
        role: '实施 / 客户确认',
        status: 'draft_only',
        sourcePath: fieldNumberingSummary?.sourcePath,
        sourceLabel: fieldNumberingSummary?.sourceLabel,
        nextAction: `${fieldReviewCount} 个字段候选仍为草案，不接前端运行时。`,
      },
      {
        key: 'module-state-review',
        label: '模块状态投影确认',
        role: '实施 / 产品评审',
        status: 'preview_only',
        sourcePath: customerPackageSummary?.sourcePath,
        sourceLabel: customerPackageSummary?.sourceLabel,
        nextAction:
          moduleStateOverrideCount > 0
            ? `${moduleStateOverrideCount} 个模块状态覆盖将编译为后端模块状态控制面；非启用必须保留原因。`
            : `${moduleStateCount} 个登记模块默认按启用编译；客户包未声明只读 / 关闭覆盖。`,
      },
      {
        key: 'print-template-field-review',
        label: '打印模板字段链路复核',
        role: '实施 / 产品评审',
        status: 'source_grounded',
        sourcePath: printTemplateSummary?.sourcePath,
        sourceLabel: printTemplateSummary?.sourceLabel,
        nextAction: `${printTemplateCount} 套模板、${printFieldTruthCount} 条字段真源只读展示；${printTemplateDefaultCount} 条客户包打印默认方信息经有效配置投影后可供正式采购 / 委外合同打印入口消费；销售订单受理当前未接打印模板。`,
      },
      {
        key: 'workflow-structure-review',
        label: '流程结构与 Fact 边界确认',
        role: '产品 / 业务评审',
        status: 'preview_only',
        sourcePath: customerPackageSummary?.sourcePath,
        sourceLabel: customerPackageSummary?.sourceLabel,
        nextAction: `${workflowCount} 条 Workflow preview 只评审结构，不写 WorkflowUsecase 或事实表。`,
      },
      {
        key: 'dry-run-evidence',
        label: '导入证据包',
        role: '实施 / 运维',
        status: 'report_gate_only',
        sourcePath: importSummary?.sourcePath,
        sourceLabel: importSummary?.sourceLabel,
        nextAction: '只允许冻结检查、试跑和执行报告证据。',
      },
      {
        key: 'runtime-publish',
        label: '发布生效',
        role: '发布负责人',
        status: canApplyTestConfig ? 'release_gate_required' : 'blocked',
        sourcePath: customerPackageSummary?.sourcePath,
        sourceLabel: customerPackageSummary?.sourceLabel,
        nextAction: canApplyTestConfig
          ? '先跑发布就绪门禁，通过后才可发布 / 激活。'
          : testApplyNote,
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
        note: '输出评审证据，不写运行时配置。',
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
        sourceLabel: menuSummary?.sourceLabel,
      },
      {
        key: 'field-numbering',
        label: '字段编号',
        status: 'draft_only',
        sourcePath: fieldNumberingSummary?.sourcePath,
        sourceLabel: fieldNumberingSummary?.sourceLabel,
      },
      {
        key: 'print-templates',
        label: '打印模板字段',
        status: 'source_grounded',
        sourcePath: printTemplateSummary?.sourcePath,
        sourceLabel: printTemplateSummary?.sourceLabel,
      },
      {
        key: 'print-template-defaults',
        label: '打印默认方信息',
        status:
          printTemplateDefaultCount > 0
            ? 'effective_session_projected'
            : 'controlled_empty',
        sourcePath: customerPackageSummary?.sourcePath,
        sourceLabel: customerPackageSummary?.sourceLabel,
      },
      {
        key: 'package',
        label: '流程配置包',
        status: 'preview_only',
        sourcePath: customerPackageSummary?.sourcePath,
        sourceLabel: customerPackageSummary?.sourceLabel,
      },
      {
        key: 'import-tools',
        label: '导入工具边界',
        status: 'report_gate_only',
        sourcePath: importSummary?.sourcePath,
        sourceLabel: importSummary?.sourceLabel,
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
        note: '运行时未启用，必须人工确认。',
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
            ? `${moduleStateNonEnabledCount} 个非启用状态需要原因，编译到模块状态控制面。`
            : `${moduleStateCount} 个模块默认启用，未声明关闭或只读覆盖。`,
      },
      {
        key: 'print-templates',
        label: '打印模板',
        value: printTemplateCount,
        unit: '套',
        status: 'source_grounded',
        note: `${printFieldTruthCount} 条字段真源；当前覆盖合同和工程资料打印模板。`,
      },
      {
        key: 'print-template-defaults',
        label: '打印默认方信息',
        value: printTemplateDefaultCount,
        unit: '条',
        status:
          printTemplateDefaultCount > 0
            ? 'effective_session_projected'
            : 'controlled_empty',
        note:
          printTemplateDefaultCount > 0
            ? '客户包打印默认方信息通过有效配置投影供打印入口消费，不覆盖供应商快照。'
            : '当前客户包未声明打印默认方信息。',
      },
      {
        key: 'policies',
        label: '策略预览',
        value: processPolicyCount,
        unit: '条',
        status: 'preview_only',
        note: '只允许绑定检查，不接收客户包代码。',
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
        key: 'unregistered-strategy',
        label: '未注册策略 / 命令',
        status: unregisteredStrategyCount > 0 ? 'blocked' : 'passed',
        level: '高',
        note:
          unregisteredStrategyCount > 0
            ? `${unregisteredStrategyCount} 个策略或命令绑定未登记，必须阻断客户配置发布。`
            : '流程策略和命令只允许绑定 catalog 已登记 key；实现不得由客户包上传。',
      },
      {
        key: 'unregistered-extension',
        label: '未注册扩展点',
        status: unregisteredExtensionCount > 0 ? 'blocked' : 'passed',
        level: '高',
        note:
          unregisteredExtensionCount > 0
            ? `${unregisteredExtensionCount} 个扩展点处理器未登记或来自客户包，必须阻断客户配置发布。`
            : '当前扩展点目录为受控空目录；后续处理器必须来自已注册部署包。',
      },
      {
        key: 'workflow-closed-loop',
        label: '流程闭环',
        status: missingWorkflowEndCount > 0 ? 'blocked' : 'passed',
        level: '高',
        note:
          missingWorkflowEndCount > 0
            ? `${missingWorkflowEndCount} 条流程缺少结束节点，必须阻断客户配置发布。`
            : '已检查每条流程预览都有结束节点；流程运行仍需后端运行时清单校验。',
      },
      {
        key: 'role-coverage',
        label: '角色覆盖',
        status: missingWorkflowRoleCount > 0 ? 'blocked' : 'passed',
        level: '高',
        note:
          missingWorkflowRoleCount > 0
            ? `${missingWorkflowRoleCount} 个流程节点责任池未登记，必须阻断客户配置发布。`
            : '流程节点责任池均来自登记目录；运行时清单还会映射为后端角色画像和授权。',
      },
      {
        key: 'illegal-state-transition',
        label: '非法状态跳转',
        status: illegalStateTransitionCount > 0 ? 'blocked' : 'passed',
        level: '高',
        note:
          illegalStateTransitionCount > 0
            ? `${illegalStateTransitionCount} 条状态跳转命中禁止回退规则，必须阻断客户配置发布。`
            : '当前状态机预览未包含已出货退回草稿、已结算退回已提交、已关闭退回处理中等非法跳转。',
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
        note: '模块状态只允许登记模块和启用 / 只读 / 关闭；非启用必须写原因。',
      },
      {
        key: 'print-template-boundary',
        label: '打印模板字段边界',
        status:
          printTemplateCount > 0 &&
          printTemplateSummary?.sourceGroundedCount === printTemplateCount &&
          printFieldTruthCount > 0
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
      {
        key: 'rollback-no-facts',
        label: '回滚不删除业务事实',
        status: 'rollback_supported',
        level: '高',
        note: '受控回滚只切 active customer_config revision；库存流水、出货、财务和业务单据必须保留。',
      },
    ],
    packageAssetScope: [
      {
        key: 'config-assets',
        label: '配置资产',
        value: menuItemCount + fieldReviewCount + moduleStateCount,
        status: 'preview_only',
        note: '菜单、字段显示、编号和模块状态只进入客户配置控制面。',
      },
      {
        key: 'rule-assets',
        label: '规则资产',
        value: policyBindingCount,
        status: 'registered_binding',
        note: '客户包只声明规则 / 策略绑定和参数，不接收策略实现代码。',
      },
      {
        key: 'workflow-assets',
        label: '流程编排',
        value:
          workflowCount +
          (customerPackageSummary?.businessFlowCount || 0) +
          (customerPackageSummary?.stateMachineCount || 0),
        status: 'preview_only',
        note: '协同流程、业务流转和状态机必须闭环，且不写业务事实。',
      },
      {
        key: 'strategy-bindings',
        label: '策略绑定',
        value:
          (customerPackageSummary?.strategyRegistryChecks || []).length +
          (customerPackageSummary?.commandBindingChecks || []).length,
        status:
          unregisteredStrategyCount > 0 ? 'blocked' : 'registered_binding',
        note: '策略 / 命令实现必须来自产品核心、行业模板或客户部署包登记。',
      },
      {
        key: 'extension-bindings',
        label: '扩展点绑定',
        value: extensionPointCount,
        status: unregisteredExtensionCount > 0 ? 'blocked' : 'controlled_empty',
        note: '客户包只能绑定扩展点；处理器必须来自已注册部署包。',
      },
      {
        key: 'template-assets',
        label: '模板资产',
        value: printTemplateCount,
        status: 'source_grounded',
        note: '当前展示正式合同和工程资料打印模板字段真源。',
      },
      {
        key: 'import-mapping-assets',
        label: '导入映射',
        value: importMappingCount,
        status: 'report_gate_only',
        note: '历史数据映射只进入试跑和执行报告；真实业务数据导入另开专项。',
      },
    ],
    registryChecks: [
      ...(customerPackageSummary?.strategyRegistryChecks || []),
      ...(customerPackageSummary?.commandBindingChecks || []),
      ...(customerPackageSummary?.extensionRegistryChecks || []),
    ],
    versionAuditSupport: [
      {
        key: 'compiled-snapshot',
        label: '配置版本快照',
        status: 'snapshot_supported',
        note: '客户配置版本保存编译快照、配置指纹和版本状态。',
      },
      {
        key: 'draft-before-active',
        label: '草稿先行',
        status: canApplyTestConfig ? 'test_apply_ready' : 'blocked',
        note: canApplyTestConfig
          ? '发布先写入受控版本，激活单独切换有效版本；发布失败不影响旧版本。'
          : testApplyNote,
      },
      {
        key: 'rollback-control',
        label: '受控回滚',
        status: 'rollback_supported',
        note: 'rollback_customer_config 只恢复已发布配置版本，不删除业务事实。',
      },
      {
        key: 'runtime-audit',
        label: '审计日志',
        status: 'audit_supported',
        note: '发布、激活、回滚都会写脱敏审计记录。',
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
        impact: '需要人工确认，不自动变成产品核心必填。',
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
        current: '登记模块默认启用',
        incoming:
          moduleStateOverrideCount > 0
            ? `${moduleStateOverrideCount} 个客户包覆盖`
            : '无客户包覆盖',
        impact:
          '只作为后端模块状态控制面输入，不安装 / 卸载模块，也不代表完整关闭流程已交付。',
        status: 'preview_only',
      },
      {
        key: 'print-template-fields',
        type: '打印模板',
        current: '采购合同 / 加工合同',
        incoming: `${printTemplateCount} 套模板 / ${printFieldTruthCount} 条字段真源`,
        impact:
          '只展示当前模板字段真源和缺口，不新增销售订单打印模板，不把客户专属抬头写入产品核心。',
        status: 'source_grounded',
      },
      {
        key: 'import-tooling',
        type: '导入工具',
        current: '试跑证据',
        incoming: '执行报告门禁',
        impact: '没有明确批准前不写数据库，不生成业务事实。',
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
    const hasRequestedCustomerKey = Boolean(resolved.customerKey)
    const missingPackageTitle = hasRequestedCustomerKey
      ? '未登记客户配置包'
      : '未选择客户配置包'
    const missingPackageStatus = hasRequestedCustomerKey ? '未登记' : '未选择'
    const missingPackageBoundary = hasRequestedCustomerKey
      ? '当前 URL customer 参数没有对应客户配置包；开发态总控不会 fallback 到 yoyoosun 冒充，也不会创建 SaaS tenant。'
      : '当前 URL 缺少 customer 参数；开发态总控必须显式选择客户配置包，不会 fallback 到 yoyoosun 冒充，也不会创建 SaaS tenant。'
    return {
      status: resolved.status,
      customerKey: resolved.customerKey,
      requestedCustomerKey: resolved.customerKey,
      route: DEV_CUSTOMER_CONFIG_ROUTE,
      sourcePath: '',
      sourceLabel: missingPackageTitle,
      registeredCustomers: resolved.registeredCustomers,
      runtimePieces: [],
      draftPieces: [],
      blockedPieces: [
        {
          key: hasRequestedCustomerKey
            ? 'missing-customer-package'
            : 'customer-package-not-selected',
          title: missingPackageTitle,
          sourcePath: 'config/customers/<customer-key>/',
          sourceLabel: mapSourcePathLabel('config/customers/<customer-key>/'),
          status: missingPackageStatus,
          boundary: missingPackageBoundary,
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
  const importSummary = buildImportToolingSummary(
    packageConfig.customerKey,
    customerPackageSummary
  )
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
    sourceLabel: mapSourcePathLabel(packageConfig.sourcePath),
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
        sourceLabel: menuSummary.sourceLabel,
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
        sourceLabel: fieldNumberingSummary.sourceLabel,
        status: '草案',
        boundary:
          '运行时未启用；只作为客户确认清单，不接前端运行时、不改后端、不执行导入。',
      },
      {
        key: 'process-package',
        title: '流程结构 / 策略预览',
        sourcePath: customerPackageSummary.sourcePath,
        sourceLabel: customerPackageSummary.sourceLabel,
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
        sourceLabel: importSummary.sourceLabel,
        status: '未批准',
        boundary:
          '客户配置测试 / 发布只写控制面表；客户、供应商、订单、库存、出货、财务等历史业务数据导入必须另走专项。',
      },
      {
        key: 'saas-tenant',
        title: 'SaaS tenant / tenant_id',
        sourcePath: DEV_CUSTOMER_CONFIG_SOURCE_PATH,
        sourceLabel: mapSourcePathLabel(DEV_CUSTOMER_CONFIG_SOURCE_PATH),
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
