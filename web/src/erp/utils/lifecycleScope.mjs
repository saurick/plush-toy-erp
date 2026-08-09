export const LIFECYCLE_SCOPE = Object.freeze({
  CURRENT: 'current',
  HISTORY: 'history',
  ALL: 'all',
})

export const LIFECYCLE_SCOPE_OPTIONS = Object.freeze([
  { value: LIFECYCLE_SCOPE.CURRENT, label: '当前记录' },
  { value: LIFECYCLE_SCOPE.HISTORY, label: '历史记录' },
  { value: LIFECYCLE_SCOPE.ALL, label: '全部记录' },
])

const LIFECYCLE_SCOPE_VALUES = new Set(Object.values(LIFECYCLE_SCOPE))

export function normalizeLifecycleScope(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return LIFECYCLE_SCOPE_VALUES.has(normalized)
    ? normalized
    : LIFECYCLE_SCOPE.CURRENT
}

export function lifecycleScopeFromSearchParams(searchParams) {
  return normalizeLifecycleScope(searchParams?.get?.('scope'))
}

export function withLifecycleScopeSearchParam(searchParams, value) {
  const nextParams = new URLSearchParams(searchParams || undefined)
  const scope = normalizeLifecycleScope(value)
  if (scope === LIFECYCLE_SCOPE.CURRENT) {
    nextParams.delete('scope')
  } else {
    nextParams.set('scope', scope)
  }
  return nextParams
}

export function filterLifecycleStatusOptions(
  options,
  scope,
  historyStatuses = []
) {
  const normalizedScope = normalizeLifecycleScope(scope)
  if (normalizedScope === LIFECYCLE_SCOPE.ALL) {
    return Array.isArray(options) ? options : []
  }
  const historySet = new Set(
    historyStatuses.map((value) =>
      String(value || '')
        .trim()
        .toLowerCase()
    )
  )
  return (Array.isArray(options) ? options : []).filter((option) => {
    const value = String(option?.value || '')
      .trim()
      .toLowerCase()
    if (!value) return true
    const isHistory = historySet.has(value)
    return normalizedScope === LIFECYCLE_SCOPE.HISTORY ? isHistory : !isHistory
  })
}

export function lifecycleScopeIncludesStatus(
  scope,
  status,
  historyStatuses = []
) {
  const value = String(status || '')
    .trim()
    .toLowerCase()
  if (!value || normalizeLifecycleScope(scope) === LIFECYCLE_SCOPE.ALL) {
    return true
  }
  const isHistory = historyStatuses.some(
    (candidate) =>
      String(candidate || '')
        .trim()
        .toLowerCase() === value
  )
  return normalizeLifecycleScope(scope) === LIFECYCLE_SCOPE.HISTORY
    ? isHistory
    : !isHistory
}
