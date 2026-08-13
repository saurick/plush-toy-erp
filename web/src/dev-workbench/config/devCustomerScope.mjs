export const DEV_CUSTOMER_QUERY_KEY = 'customer'
export const DEFAULT_DEV_CUSTOMER_SCOPE_KEY = 'yoyoosun'

const DEV_CUSTOMER_SNAPSHOT_KEY_PATTERN = /^[a-z][a-z0-9-]{2,63}$/u

export const DEV_CUSTOMER_SCOPE_REGISTRY = Object.freeze({
  yoyoosun: Object.freeze({
    customerKey: 'yoyoosun',
    label: '永绅 yoyoosun',
  }),
})

const registeredCustomers = Object.freeze(
  Object.values(DEV_CUSTOMER_SCOPE_REGISTRY)
)

const cleanText = (value) => (typeof value === 'string' ? value.trim() : '')

function asSearchParams(value) {
  if (value instanceof URLSearchParams) return new URLSearchParams(value)
  return new URLSearchParams(String(value || ''))
}

export function resolveDevCustomerScope(
  value,
  { defaultCustomerKey = DEFAULT_DEV_CUSTOMER_SCOPE_KEY } = {}
) {
  const searchParams = asSearchParams(value)
  const requestedValues = searchParams.getAll(DEV_CUSTOMER_QUERY_KEY)
  const requestedCustomerKey = cleanText(requestedValues[0])
  const normalizedDefaultCustomerKey = cleanText(defaultCustomerKey)
  const effectiveCustomerKey =
    requestedCustomerKey || normalizedDefaultCustomerKey

  if (requestedValues.length > 1) {
    return Object.freeze({
      status: 'invalid',
      reason: 'duplicate_customer_query',
      requestedCustomerKey,
      customerKey: '',
      customer: null,
      defaulted: false,
      registeredCustomers,
    })
  }

  const customer = DEV_CUSTOMER_SCOPE_REGISTRY[effectiveCustomerKey] || null
  return Object.freeze({
    status: customer ? 'ready' : 'missing',
    reason: customer ? '' : 'unregistered_customer',
    requestedCustomerKey,
    customerKey: customer?.customerKey || '',
    customer,
    defaulted: !requestedCustomerKey,
    registeredCustomers,
  })
}

export function buildDevCustomerScopeSearch(value, customerKey) {
  const normalizedCustomerKey = cleanText(customerKey)
  if (!DEV_CUSTOMER_SCOPE_REGISTRY[normalizedCustomerKey]) {
    throw new Error('customer scope requires a registered customer')
  }
  const searchParams = asSearchParams(value)
  searchParams.set(DEV_CUSTOMER_QUERY_KEY, normalizedCustomerKey)
  return searchParams
}

export function buildDevCustomerScopedRoute(route, customerKey) {
  const normalizedRoute = cleanText(route)
  if (!normalizedRoute.startsWith('/') || normalizedRoute.startsWith('//')) {
    throw new Error('customer scoped route requires an absolute app path')
  }

  const hashIndex = normalizedRoute.indexOf('#')
  const routeWithoutHash =
    hashIndex === -1 ? normalizedRoute : normalizedRoute.slice(0, hashIndex)
  const hash = hashIndex === -1 ? '' : normalizedRoute.slice(hashIndex)
  const queryIndex = routeWithoutHash.indexOf('?')
  const pathname =
    queryIndex === -1 ? routeWithoutHash : routeWithoutHash.slice(0, queryIndex)
  const search = queryIndex === -1 ? '' : routeWithoutHash.slice(queryIndex + 1)
  const searchParams = buildDevCustomerScopeSearch(search, customerKey)
  return `${pathname}?${searchParams.toString()}${hash}`
}

export function buildDevCustomerSnapshotKey(baseKey, customerKey) {
  const normalizedBaseKey = cleanText(baseKey)
  const normalizedCustomerKey = cleanText(customerKey)
  if (
    !normalizedBaseKey ||
    !DEV_CUSTOMER_SCOPE_REGISTRY[normalizedCustomerKey]
  ) {
    throw new Error('customer snapshot key requires a registered customer')
  }
  const snapshotKey = `${normalizedBaseKey}-${normalizedCustomerKey}`
  if (!DEV_CUSTOMER_SNAPSHOT_KEY_PATTERN.test(snapshotKey)) {
    throw new Error('customer snapshot key is incompatible with snapshots')
  }
  return snapshotKey
}
