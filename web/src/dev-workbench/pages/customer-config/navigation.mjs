import { DEFAULT_DEV_CUSTOMER_CONFIG_PAGE_KEY } from '../../config/devCustomerConfig.mjs'

export const VIEW_OVERVIEW = 'overview'
export const VIEW_PREFLIGHT = 'preflight'
export const VIEW_DIFF = 'diff'
export const VIEW_ASSETS = 'assets'
export const VIEW_IMPORT = 'import'
export const PREFLIGHT_SECTION_PACKAGE = 'package'
export const PREFLIGHT_SECTION_RUNTIME = 'runtime'
export const PREFLIGHT_SECTION_FLOW = 'flow'
export const PREFLIGHT_SECTION_EVIDENCE = 'evidence'
export const IMPORT_ACTION_DRY_RUN = 'dry-run'
export const IMPORT_ACTION_TEST_APPLY = 'test-apply'
export const IMPORT_ACTION_RELEASE = 'release'

export const CUSTOMER_CONFIG_STEPS = Object.freeze([
  { value: VIEW_OVERVIEW, label: '配置总览', description: '范围与下一步' },
  {
    value: VIEW_PREFLIGHT,
    label: '检查配置',
    description: '结构与使用范围',
    number: 1,
  },
  {
    value: VIEW_DIFF,
    label: '核对变化',
    description: '默认值与候选值',
    number: 2,
  },
  {
    value: VIEW_ASSETS,
    label: '预览界面',
    description: '菜单、字段与打印',
    number: 3,
  },
  {
    value: VIEW_IMPORT,
    label: '测试验证',
    description: '样本试跑与本地应用',
    number: 4,
  },
  {
    value: 'release',
    label: '发布交接',
    description: '检查证据后交接',
    number: 5,
  },
])

export const PREFLIGHT_SECTION_OPTIONS = Object.freeze([
  { label: '包结构', value: PREFLIGHT_SECTION_PACKAGE },
  { label: '运行设置', value: PREFLIGHT_SECTION_RUNTIME },
  { label: '流程策略', value: PREFLIGHT_SECTION_FLOW },
  { label: '评审依据', value: PREFLIGHT_SECTION_EVIDENCE },
])

export const IMPORT_ACTION_OPTIONS = Object.freeze([
  { label: '样本试跑', value: IMPORT_ACTION_DRY_RUN },
  { label: '本地配置应用', value: IMPORT_ACTION_TEST_APPLY },
])

const views = new Set([
  VIEW_OVERVIEW,
  VIEW_PREFLIGHT,
  VIEW_DIFF,
  VIEW_ASSETS,
  VIEW_IMPORT,
])
const sections = new Set(PREFLIGHT_SECTION_OPTIONS.map((item) => item.value))
const actions = new Set([
  ...IMPORT_ACTION_OPTIONS.map((item) => item.value),
  IMPORT_ACTION_RELEASE,
])

function single(params, key) {
  const values = params.getAll(key)
  return values.length === 1 ? values[0].trim() : ''
}

export function resolveCustomerConfigLocation(input) {
  const params = new URLSearchParams(input)
  const requestedView = single(params, 'view')
  const activeView = views.has(requestedView) ? requestedView : VIEW_OVERVIEW
  const requestedSection = single(params, 'section')
  const activePreflightSection = sections.has(requestedSection)
    ? requestedSection
    : PREFLIGHT_SECTION_PACKAGE
  const requestedAction = single(params, 'action')
  const activeImportAction = actions.has(requestedAction)
    ? requestedAction
    : IMPORT_ACTION_DRY_RUN
  if (
    !params.has('customer') ||
    (params.getAll('customer').length === 1 && !single(params, 'customer'))
  ) {
    params.set('customer', DEFAULT_DEV_CUSTOMER_CONFIG_PAGE_KEY)
  }
  const canonical = (key, value, omit) => {
    if (omit) params.delete(key)
    else params.set(key, value)
  }
  canonical('view', activeView, activeView === VIEW_OVERVIEW)
  canonical(
    'section',
    activePreflightSection,
    activeView !== VIEW_PREFLIGHT ||
      activePreflightSection === PREFLIGHT_SECTION_PACKAGE
  )
  canonical(
    'action',
    activeImportAction,
    activeView !== VIEW_IMPORT || activeImportAction === IMPORT_ACTION_DRY_RUN
  )
  const requestedReleaseBatch = single(params, 'release')
  canonical('release', requestedReleaseBatch, !requestedReleaseBatch)
  return {
    activeView,
    activePreflightSection,
    activeImportAction,
    activeStep:
      activeView === VIEW_IMPORT && activeImportAction === IMPORT_ACTION_RELEASE
        ? 'release'
        : activeView,
    requestedReleaseBatch,
    canonicalSearch: params.toString(),
  }
}

export function customerConfigStepSearch(input, step) {
  if (!CUSTOMER_CONFIG_STEPS.some((item) => item.value === step)) {
    throw new Error('Unknown customer configuration step')
  }
  const params = new URLSearchParams(input)
  params.set('view', step === 'release' ? VIEW_IMPORT : step)
  if (step === 'release') params.set('action', IMPORT_ACTION_RELEASE)
  else if (
    step === VIEW_IMPORT &&
    params.get('action') === IMPORT_ACTION_RELEASE
  ) {
    params.delete('action')
  }
  return resolveCustomerConfigLocation(params).canonicalSearch
}

export function releaseHistoryForBatch(operations, releaseBatch) {
  if (!releaseBatch) return null
  return (
    operations.find(
      (item) =>
        item.action === 'release-readiness' &&
        item.result?.releaseBatch === releaseBatch
    ) || null
  )
}
