import {
  TRACKING_STATUS_OPTIONS,
  TRACKING_SCOPE_OPTIONS,
  TRACKING_ROLE_OPTIONS,
  TRACKING_ATTENTION_OPTIONS,
  TRACKING_SOURCE_OPTIONS,
  normalizeTrackingFilters,
} from '../../utils/workflowTrackingFilters.mjs'

export const MOBILE_TRACKING_PAGE_SIZE = 20
export const MOBILE_TRACKING_HISTORY_KEY = 'mobileWorkflowTracking'

const allowedValue = (options, value) =>
  options.some((option) => option.value === value) ? value : ''

export function normalizeMobileTrackingQuery(value = {}) {
  const query = value && typeof value === 'object' ? value : {}
  return normalizeTrackingFilters({
    keyword: String(query.keyword || '').trim().slice(0, 100),
    status: allowedValue(TRACKING_STATUS_OPTIONS, query.status),
    owner_role_key: allowedValue(TRACKING_ROLE_OPTIONS, query.owner_role_key),
    attention: allowedValue(TRACKING_ATTENTION_OPTIONS, query.attention),
  })
}

export function readMobileTrackingSource(search) {
  const params = new URLSearchParams(search)
  const type = params.get('track_source_type')
  const rawID = params.get('track_source_id') || ''
  const id = Number(rawID)
  return params.get('tracking') === 'visible' && type && TRACKING_SOURCE_OPTIONS.some((item) => item.value === type) && /^\d+$/u.test(rawID) && Number.isSafeInteger(id) && id > 0
    ? { source_type: type, source_id: id } : null
}

export function readMobileTrackingState(history, accessScope, source = null) {
  const availableScopes = source ? [{ value: 'visible' }] : TRACKING_SCOPE_OPTIONS
  const saved = history?.[MOBILE_TRACKING_HISTORY_KEY]
  const state = accessScope && saved?.accessScope === accessScope ? saved : {}
  const scopes = Object.fromEntries(availableScopes.map(({ value }) => {
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
    scope: availableScopes.some(({ value }) => value === state.scope)
      ? state.scope : availableScopes[0].value,
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
