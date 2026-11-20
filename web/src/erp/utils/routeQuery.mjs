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
  const rawValue = String(searchParams?.get(key) || '').trim()
  if (!/^\d+$/u.test(rawValue)) return ''
  const value = Number(rawValue)
  return Number.isSafeInteger(value) && value > 0 ? String(value) : ''
}

export function searchParamPositiveInt(searchParams, key) {
  const text = searchParamPositiveIntText(searchParams, key)
  return text ? Number(text) : 0
}
