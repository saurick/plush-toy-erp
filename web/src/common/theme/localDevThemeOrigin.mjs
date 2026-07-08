const CANONICAL_LOCAL_DEV_HOST = '127.0.0.1'
const ALIAS_LOCAL_DEV_HOST = 'localhost'

export function buildCanonicalLocalDevUrl(locationLike) {
  if (locationLike?.hostname !== ALIAS_LOCAL_DEV_HOST) {
    return ''
  }

  const port = locationLike.port ? `:${locationLike.port}` : ''
  const pathname = locationLike.pathname || '/'
  const search = locationLike.search || ''
  const hash = locationLike.hash || ''
  return `${locationLike.protocol}//${CANONICAL_LOCAL_DEV_HOST}${port}${pathname}${search}${hash}`
}

export function redirectToCanonicalLocalDevHost(windowObject) {
  const canonicalUrl = buildCanonicalLocalDevUrl(windowObject?.location)
  if (!canonicalUrl) {
    return false
  }

  if (typeof windowObject.location.replace === 'function') {
    windowObject.location.replace(canonicalUrl)
  } else {
    windowObject.location.href = canonicalUrl
  }
  return true
}
