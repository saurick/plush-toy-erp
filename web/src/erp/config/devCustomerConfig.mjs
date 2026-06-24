import { yoyoosunFieldNumberingConfig } from '../../../../config/customers/yoyoosun/fieldNumberingConfig.mjs'
import { yoyoosunMenuConfig } from '../../../../config/customers/yoyoosun/menuConfig.mjs'
import { DEV_CUSTOMER_CONFIG_ROUTE } from './devCustomerConfigRoute.mjs'

export { DEV_CUSTOMER_CONFIG_ROUTE }
export const DEV_CUSTOMER_CONFIG_QUERY_KEY = 'customer'
export const DEFAULT_DEV_CUSTOMER_KEY = 'yoyoosun'
export const DEV_CUSTOMER_CONFIG_SOURCE_PATH =
  'config/customers/yoyoosun/README.md'
export const DEV_CUSTOMER_MENU_CONFIG_SOURCE_PATH =
  'config/customers/yoyoosun/menuConfig.mjs'
export const DEV_CUSTOMER_FIELD_NUMBERING_SOURCE_PATH =
  'config/customers/yoyoosun/fieldNumberingConfig.mjs'
export const DEV_CUSTOMER_IMPORT_TOOLING_SOURCE_PATH = 'scripts/import'
export const DEV_CUSTOMER_CONFIG_QA_COMMAND =
  'node scripts/qa/customer-config-boundaries.mjs'

export const DEV_CUSTOMER_CONFIG_REGISTRY = Object.freeze({
  yoyoosun: Object.freeze({
    customerKey: 'yoyoosun',
    label: '永绅 yoyoosun',
    sourcePath: DEV_CUSTOMER_CONFIG_SOURCE_PATH,
    menuConfig: yoyoosunMenuConfig,
    menuConfigSourcePath: DEV_CUSTOMER_MENU_CONFIG_SOURCE_PATH,
    fieldNumberingConfig: yoyoosunFieldNumberingConfig,
    fieldNumberingSourcePath: DEV_CUSTOMER_FIELD_NUMBERING_SOURCE_PATH,
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
  return {
    sourcePath: DEV_CUSTOMER_IMPORT_TOOLING_SOURCE_PATH,
    qaCommand: DEV_CUSTOMER_CONFIG_QA_COMMAND,
    canExecuteRealImport: false,
    writesDatabase: false,
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
        command: `node scripts/import/customerImportExecute.mjs --dry-run ${outputBasePath}/import-dry-run --approval ${fixtureBasePath}/import-approval.sample.json --out ${outputBasePath}/import-execution`,
        status: 'report_gate_only',
      },
    ],
  }
}

export function buildCustomerConfigDevOverview({
  customerKey = DEFAULT_DEV_CUSTOMER_KEY,
  registry = DEV_CUSTOMER_CONFIG_REGISTRY,
  menuConfig,
  fieldNumberingConfig,
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
  const menuSummary = buildCustomerMenuRuntimeSummary(
    activeMenuConfig,
    packageConfig.menuConfigSourcePath
  )
  const fieldNumberingSummary = buildFieldNumberingDraftSummary(
    activeFieldNumberingConfig,
    packageConfig.fieldNumberingSourcePath
  )
  const importSummary = buildImportToolingSummary(packageConfig.customerKey)

  return {
    status: resolved.status,
    customerKey: menuSummary.customerKey,
    requestedCustomerKey: resolved.customerKey,
    route: DEV_CUSTOMER_CONFIG_ROUTE,
    sourcePath: packageConfig.sourcePath,
    registeredCustomers: resolved.registeredCustomers,
    menuSummary,
    fieldNumberingSummary,
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
    ],
    blockedPieces: [
      {
        key: 'real-import',
        title: '真实客户数据导入',
        sourcePath: importSummary.sourcePath,
        status: '未批准',
        boundary:
          '当前只有 dry-run、freeze 和 execution report 工具；不写 DB，不写 business_records，不生成库存、出货或财务事实。',
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
