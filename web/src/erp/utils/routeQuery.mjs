export function routeWithQuery(path, params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, String(value))
  })
  const queryText = query.toString()
  return queryText ? `${path}?${queryText}` : path
}

export function searchParamText(searchParams, key) {
  return String(searchParams?.get(key) || '').trim()
}

export function searchParamPositiveIntText(searchParams, key) {
  const value = Number(searchParams?.get(key) || 0)
  return Number.isFinite(value) && value > 0 ? String(Math.trunc(value)) : ''
}
