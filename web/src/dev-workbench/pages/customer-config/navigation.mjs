import { DEFAULT_DEV_CUSTOMER_CONFIG_PAGE_KEY } from '../../config/devCustomerConfig.mjs'

const VIEW_PREFLIGHT = 'preflight'
const VIEW_IMPORT = 'import'
const IMPORT_ACTION_TEST_APPLY = 'test-apply'
const IMPORT_ACTION_RELEASE = 'release'
export const REVIEW_TASK = 'review'
export const VALIDATION_TASK = 'validation'
export const RELEASE_TASK = 'release'
export const REVIEW_FIELDS = 'fields'
export const REVIEW_FLOW = 'flow'
export const REVIEW_EXTENSIONS = 'extensions'
export const DETAIL_PREVIEW = 'preview'
export const DETAIL_EVIDENCE = 'evidence'
export const DETAIL_STRATEGY = 'strategy'
export const DETAIL_EXPORT = 'export'

export const CUSTOMER_CONFIG_TASKS = Object.freeze([
  { value: REVIEW_TASK, label: '配置核对' },
  { value: VALIDATION_TASK, label: '本地验证' },
  { value: RELEASE_TASK, label: '发布交接' },
])

export const CUSTOMER_CONFIG_REVIEW_TABS = Object.freeze([
  { value: REVIEW_FIELDS, label: '配置字段' },
  { value: REVIEW_FLOW, label: '流程与策略' },
  { value: REVIEW_EXTENSIONS, label: '扩展登记' },
])

const reviewSections = new Set(CUSTOMER_CONFIG_REVIEW_TABS.map(({ value }) => value))
const reviewDetails = new Set([DETAIL_PREVIEW, DETAIL_EVIDENCE, DETAIL_STRATEGY, DETAIL_EXPORT])

function single(params, key) {
  const values = params.getAll(key)
  return values.length === 1 ? values[0].trim() : ''
}

export function resolveCustomerConfigLocation(input) {
  const params = new URLSearchParams(input)
  const requestedView = single(params, 'view')
  const requestedSection = single(params, 'section')
  const requestedAction = single(params, 'action')
  const requestedDetail = single(params, 'detail')
  const activeTask = requestedView === VIEW_IMPORT
    ? (requestedAction === IMPORT_ACTION_RELEASE ? RELEASE_TASK : VALIDATION_TASK)
    : REVIEW_TASK
  const activeSection = requestedView === VIEW_PREFLIGHT && reviewSections.has(requestedSection)
    ? requestedSection
    : REVIEW_FIELDS
  const focusTestApply = activeTask === VALIDATION_TASK && requestedAction === IMPORT_ACTION_TEST_APPLY
  const legacyEvidenceLink = requestedView === VIEW_PREFLIGHT &&
    (!params.has('section') || ['package', 'evidence'].includes(requestedSection))
  const legacyDetail = requestedView === 'assets'
    ? DETAIL_PREVIEW
    : legacyEvidenceLink ? DETAIL_EVIDENCE : ''
  const activeDetail = activeTask === REVIEW_TASK
    ? (reviewDetails.has(requestedDetail) ? requestedDetail : legacyDetail)
    : ''
  if (
    !params.has('customer') ||
    (params.getAll('customer').length === 1 && !single(params, 'customer'))
  ) {
    params.set('customer', DEFAULT_DEV_CUSTOMER_CONFIG_PAGE_KEY)
  }
  const hasReviewSection = activeSection !== REVIEW_FIELDS
  const view = activeTask !== REVIEW_TASK
    ? VIEW_IMPORT
    : hasReviewSection ? VIEW_PREFLIGHT : ''
  const action = activeTask === RELEASE_TASK
    ? IMPORT_ACTION_RELEASE
    : focusTestApply ? IMPORT_ACTION_TEST_APPLY : ''
  setOptional(params, 'view', view)
  setOptional(params, 'section', hasReviewSection ? activeSection : '')
  setOptional(params, 'action', action)
  setOptional(params, 'detail', activeDetail)
  const requestedReleaseBatch = single(params, 'release')
  setOptional(params, 'release', requestedReleaseBatch)
  return {
    activeTask,
    activeSection,
    activeDetail,
    focusTestApply,
    requestedReleaseBatch,
    canonicalSearch: params.toString(),
  }
}

function setOptional(params, key, value) {
  if (value) params.set(key, value)
  else params.delete(key)
}

export function customerConfigTaskSearch(input, task, section = REVIEW_FIELDS) {
  if (!CUSTOMER_CONFIG_TASKS.some((item) => item.value === task)) {
    throw new Error('Unknown customer configuration task')
  }
  if (!reviewSections.has(section)) throw new Error('Unknown customer configuration section')
  const params = new URLSearchParams(input)
  const showReviewSection = task === REVIEW_TASK && section !== REVIEW_FIELDS
  setOptional(params, 'view', task !== REVIEW_TASK ? VIEW_IMPORT : showReviewSection ? VIEW_PREFLIGHT : '')
  setOptional(params, 'section', showReviewSection ? section : '')
  setOptional(params, 'action', task === RELEASE_TASK ? IMPORT_ACTION_RELEASE : '')
  params.delete('detail')
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
