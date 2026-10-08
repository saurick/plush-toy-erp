import {
  TRACKING_STATUS_OPTIONS,
  TRACKING_ROLE_OPTIONS,
  TRACKING_ATTENTION_OPTIONS,
  TRACKING_SOURCE_OPTIONS,
} from '../../utils/workflowTrackingFilters.mjs'

export const MOBILE_TRACKING_SCOPES = [
  { value: 'started', label: '我发起的' },
  { value: 'participated', label: '我参与的' },
]

export const MOBILE_TRACKING_PAGE_SIZE = 20
export const MOBILE_TRACKING_HISTORY_KEY = 'mobileWorkflowTracking'

const allowedValue = (options, value) =>
  options.some((option) => option.value === value) ? value : ''

export function normalizeMobileTrackingQuery(value = {}) {
  const query = value && typeof value === 'object' ? value : {}
  return {
    keyword: String(query.keyword || '').trim().slice(0, 100),
    status: allowedValue(TRACKING_STATUS_OPTIONS, query.status),
    owner_role_key: allowedValue(TRACKING_ROLE_OPTIONS, query.owner_role_key),
    attention: allowedValue(TRACKING_ATTENTION_OPTIONS, query.attention),
    source_type: allowedValue(TRACKING_SOURCE_OPTIONS, query.source_type),
  }
}

export function readMobileTrackingState(history, accessScope) {
  const saved = history?.[MOBILE_TRACKING_HISTORY_KEY]
  const state = accessScope && saved?.accessScope === accessScope ? saved : {}
  const scopes = Object.fromEntries(MOBILE_TRACKING_SCOPES.map(({ value }) => {
    const slot = state.scopes?.[value] || {}
    return [value, {
      query: normalizeMobileTrackingQuery(slot.query),
      scrollTop: Number.isFinite(slot.scrollTop) ? Math.max(0, slot.scrollTop) : 0,
      loadedCount: Number.isSafeInteger(slot.loadedCount)
        ? Math.min(1000, Math.max(MOBILE_TRACKING_PAGE_SIZE, slot.loadedCount))
        : MOBILE_TRACKING_PAGE_SIZE,
    }]
  }))
  const candidate = state.selection
  const selection = ['task', 'process'].includes(candidate?.kind)
    && Number.isSafeInteger(candidate.id) && candidate.id > 0
    ? { kind: candidate.kind, id: candidate.id } : null
  return {
    accessScope,
    scope: MOBILE_TRACKING_SCOPES.some(({ value }) => value === state.scope)
      ? state.scope : 'started',
    scopes,
    selection,
    detailEntry: Boolean(state.detailEntry && selection),
  }
}

export function mergeMobileTrackingItems(previous, items) {
  const records = new Map(previous.map((item) => [`${item.kind}:${item.id}`, item]))
  for (const item of items) records.set(`${item.kind}:${item.id}`, item)
  return [...records.values()]
}
