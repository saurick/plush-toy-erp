const DEV_DOCS_ORIGIN = 'https://dev-docs.local'

function decodeUrlPart(value = '') {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function normalizeHref(value = '') {
  const href = String(value || '').trim()
  if (href.startsWith('<') && href.endsWith('>')) {
    return href.slice(1, -1).trim()
  }
  return href
}

export function buildDevDocsLocation({
  pathname = '/__dev/docs',
  search = '',
  path = '',
  headingId = '',
} = {}) {
  const params = new URLSearchParams(search)
  params.set('path', String(path || '').trim())
  return {
    pathname,
    search: `?${params.toString()}`,
    hash: headingId ? `#${encodeURIComponent(headingId)}` : '',
  }
}

export function resolveDevDocsMarkdownHref(href = '', currentPath = '') {
  const normalizedHref = normalizeHref(href)
  const normalizedCurrentPath = String(currentPath || '').trim()
  if (!normalizedHref || !normalizedCurrentPath) {
    return null
  }

  if (normalizedHref.startsWith('#')) {
    return {
      path: normalizedCurrentPath,
      headingId: decodeUrlPart(normalizedHref.slice(1)),
    }
  }

  if (
    normalizedHref.startsWith('/') ||
    normalizedHref.startsWith('//') ||
    /^[a-z][a-z\d+.-]*:/iu.test(normalizedHref)
  ) {
    return null
  }

  let target
  try {
    target = new URL(
      normalizedHref,
      `${DEV_DOCS_ORIGIN}/${normalizedCurrentPath}`
    )
  } catch {
    return null
  }

  const targetPath = decodeUrlPart(target.pathname.replace(/^\/+/, ''))
  if (!/\.md$/iu.test(targetPath)) {
    return null
  }

  return {
    path: targetPath,
    headingId: decodeUrlPart(target.hash.replace(/^#/, '')),
  }
}
