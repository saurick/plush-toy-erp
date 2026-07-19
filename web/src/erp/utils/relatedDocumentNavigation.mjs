import { businessModuleDefinitions } from '../config/businessModules.mjs'
import { effectiveSessionAllowsPage } from './adminProfileSync.mjs'
import { routeWithQuery, searchParamText } from './routeQuery.mjs'

export const RELATED_DOCUMENT_QUERY_KEYS = Object.freeze([
  'link_keyword',
  'link_source',
  'link_fields',
])

const BUSINESS_PAGE_KEY_BY_PATH = new Map(
  businessModuleDefinitions.map((moduleItem) => [
    moduleItem.path,
    moduleItem.key,
  ])
)

function normalizePath(path = '') {
  return String(path || '')
    .trim()
    .split('?')[0]
}

function normalizeFields(fields = []) {
  return [
    ...new Set(
      (Array.isArray(fields) ? fields : String(fields || '').split(','))
        .map((field) => String(field || '').trim())
        .filter(Boolean)
    ),
  ]
}

export function relatedDocumentRoute(
  path,
  exactParams = {},
  { keyword = '', source = '', fields = [] } = {}
) {
  const normalizedKeyword = String(keyword || '').trim()
  const normalizedSource = String(source || '').trim()
  const normalizedFields = normalizeFields(fields)
  return routeWithQuery(path, {
    ...exactParams,
    link_keyword: normalizedKeyword || undefined,
    link_source: normalizedSource || undefined,
    link_fields:
      normalizedKeyword && normalizedFields.length > 0
        ? normalizedFields.join(',')
        : undefined,
  })
}

export function linkedDocumentContext(searchParams) {
  return {
    keyword: searchParamText(searchParams, 'link_keyword'),
    source: searchParamText(searchParams, 'link_source'),
    fields: normalizeFields(searchParamText(searchParams, 'link_fields')),
  }
}

export function clearLinkedDocumentParams(searchParams) {
  const nextParams = new URLSearchParams(searchParams)
  RELATED_DOCUMENT_QUERY_KEYS.forEach((key) => nextParams.delete(key))
  return nextParams
}

export function linkedDocumentRequestKeyword({
  localKeyword = '',
  linkedKeyword = '',
  hasExactContext = false,
} = {}) {
  if (hasExactContext) return ''
  const normalizedLocalKeyword = String(localKeyword || '').trim()
  if (normalizedLocalKeyword) return normalizedLocalKeyword
  return String(linkedKeyword || '').trim()
}

export function canOpenRelatedDocumentPath({
  path,
  adminProfile = {},
  allowedMenuPaths = [],
} = {}) {
  const normalizedPath = normalizePath(path)
  const pageKey = BUSINESS_PAGE_KEY_BY_PATH.get(normalizedPath) || ''
  if (!normalizedPath || !pageKey) return false

  const isSuperAdmin = adminProfile?.is_super_admin === true
  const allowedPaths = new Set(
    Array.isArray(allowedMenuPaths) ? allowedMenuPaths : []
  )
  if (!isSuperAdmin && !allowedPaths.has(normalizedPath)) return false

  return effectiveSessionAllowsPage(adminProfile, pageKey, {
    isLocalDev: false,
    isSuperAdmin,
  })
}
