import { getPrintTemplateByKey } from '../config/printTemplates.mjs'
import { PROCESSING_CONTRACT_TEMPLATE_KEY } from '../data/processingContractTemplate.mjs'
import { readPreparedPrintDraft } from './printDraftStorage.mjs'

export const MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY =
  'material-purchase-contract'
export { PROCESSING_CONTRACT_TEMPLATE_KEY }

const PRINT_WORKSPACE_STATE_QUERY_KEY = 'state'
const PRINT_WORKSPACE_DRAFT_SNAPSHOT_VERSION = 1
const PRINT_WORKSPACE_DRAFT_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000
const PRINT_WORKSPACE_DRAFT_STORAGE_KEY_PREFIX =
  '__plush_erp_print_workspace_draft__:v3'
const PRINT_WORKSPACE_INITIAL_DRAFT_WINDOW_NAME_PREFIX =
  '__plush_erp_print_initial_draft__:'
const PRINT_WORKSPACE_INITIAL_DRAFT_WINDOW_NAME_VERSION = 1
const initialPrintWorkspaceDraftCache = new WeakMap()

export const PRINT_WORKSPACE_DRAFT_MODE = Object.freeze({
  RESTORE: 'restore',
  FRESH: 'fresh',
})

export const PRINT_WORKSPACE_ENTRY_SOURCE = Object.freeze({
  MENU: 'menu',
  BUSINESS: 'business',
})

export const PROCESSING_CONTRACT_WORKSPACE_PATH = `/erp/print-workspace/${PROCESSING_CONTRACT_TEMPLATE_KEY}`
export const MATERIAL_PURCHASE_CONTRACT_WORKSPACE_PATH = `/erp/print-workspace/${MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY}`

function normalizeTemplateKey(templateKey = '') {
  return String(templateKey || '').trim()
}

function normalizeStateID(stateID = '') {
  return String(stateID || '').trim()
}

function normalizeDraftScopePart(value, fallback) {
  const normalized = String(value ?? '').trim() || fallback
  return encodeURIComponent(normalized)
}

function resolvePrintWorkspaceDraftAccountKey(options = {}) {
  const accountID = Number(String(options.accountKey ?? '').trim())
  return Number.isSafeInteger(accountID) && accountID > 0
    ? String(accountID)
    : ''
}

function resolvePrintWorkspaceDraftCustomerKey(options = {}) {
  const explicitCustomerKey = String(options.customerKey ?? '').trim()
  if (explicitCustomerKey) {
    return explicitCustomerKey
  }

  const runtimeWindow =
    options.windowLike || (typeof window !== 'undefined' ? window : null)
  return String(
    runtimeWindow?.__PLUSH_ERP_CUSTOMER_CONFIG__?.customerKey ||
      runtimeWindow?.__PLUSH_ERP_CUSTOMER_CONFIG__?.brand?.customerKey ||
      ''
  ).trim()
}

function resolvePrintWorkspaceDraftConfigRevision(options = {}) {
  return String(options.configRevision ?? '').trim()
}

export function resolveRuntimeCustomerPrintCompanyName(windowLike) {
  const runtimeWindow =
    windowLike || (typeof window !== 'undefined' ? window : null)
  return String(
    runtimeWindow?.__PLUSH_ERP_CUSTOMER_CONFIG__?.brand?.companyName || ''
  ).trim()
}

function appendSearch(pathname, searchParams) {
  const query = searchParams.toString()
  return query ? `${pathname}?${query}` : pathname
}

function buildDraftSearchParams(options = {}) {
  const searchParams = new URLSearchParams()
  if (options.entrySource === PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS) {
    searchParams.set('source', PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS)
  }
  if (options.draftMode === PRINT_WORKSPACE_DRAFT_MODE.FRESH) {
    searchParams.set('draft', PRINT_WORKSPACE_DRAFT_MODE.FRESH)
  }
  const normalizedCustomerKey = String(options.customerKey || '').trim()
  if (normalizedCustomerKey) {
    searchParams.set('customer_key', normalizedCustomerKey)
  }
  const configRevision = resolvePrintWorkspaceDraftConfigRevision(options)
  if (configRevision) {
    searchParams.set('config_revision', configRevision)
  }
  const normalizedStateID = normalizeStateID(options.stateID)
  if (normalizedStateID) {
    searchParams.set(PRINT_WORKSPACE_STATE_QUERY_KEY, normalizedStateID)
  }
  return searchParams
}

export function createPrintWorkspaceStateID() {
  if (
    typeof window !== 'undefined' &&
    window.crypto &&
    typeof window.crypto.randomUUID === 'function'
  ) {
    return window.crypto.randomUUID()
  }

  return `${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export function buildPrintWorkspaceDraftStorageKey(
  templateKey,
  stateID = '',
  options = {}
) {
  const normalizedTemplateKey = normalizeTemplateKey(templateKey)
  const normalizedStateID = normalizeStateID(stateID)
  const accountKey = resolvePrintWorkspaceDraftAccountKey(options)
  if (!accountKey) {
    return ''
  }
  const customerScope = normalizeDraftScopePart(
    resolvePrintWorkspaceDraftCustomerKey(options),
    'product-core'
  )
  const accountScope = normalizeDraftScopePart(accountKey, '')
  const configRevisionScope = normalizeDraftScopePart(
    resolvePrintWorkspaceDraftConfigRevision(options),
    'unversioned'
  )
  const templateScope = normalizeDraftScopePart(
    normalizedTemplateKey,
    'unknown-template'
  )
  const stateScope = normalizeDraftScopePart(normalizedStateID, 'shared')
  return `${PRINT_WORKSPACE_DRAFT_STORAGE_KEY_PREFIX}:${customerScope}:${accountScope}:${configRevisionScope}:${templateScope}:${stateScope}`
}

function buildInitialDraftWindowNamePayload(
  templateKey,
  stateID,
  draft,
  storageKey
) {
  const normalizedTemplateKey = normalizeTemplateKey(templateKey)
  const normalizedStateID = normalizeStateID(stateID)
  if (!normalizedTemplateKey || !normalizedStateID) {
    return ''
  }

  return `${PRINT_WORKSPACE_INITIAL_DRAFT_WINDOW_NAME_PREFIX}${JSON.stringify({
    version: PRINT_WORKSPACE_INITIAL_DRAFT_WINDOW_NAME_VERSION,
    templateKey: normalizedTemplateKey,
    stateID: normalizedStateID,
    storageKey,
    draft,
  })}`
}

export function readInitialPrintWorkspaceDraftFromWindowName(
  templateKey,
  stateID,
  windowLike,
  storageKey
) {
  const targetWindow =
    windowLike || (typeof window !== 'undefined' ? window : null)
  const normalizedTemplateKey = normalizeTemplateKey(templateKey)
  const normalizedStateID = normalizeStateID(stateID)
  if (
    !targetWindow ||
    !normalizedTemplateKey ||
    !normalizedStateID ||
    !storageKey
  ) {
    return null
  }

  const cacheKey = storageKey
  const cachedDrafts = initialPrintWorkspaceDraftCache.get(targetWindow)
  if (cachedDrafts?.has(cacheKey)) {
    return cachedDrafts.get(cacheKey)
  }

  const rawName = String(targetWindow.name || '')
  if (!rawName.startsWith(PRINT_WORKSPACE_INITIAL_DRAFT_WINDOW_NAME_PREFIX)) {
    return null
  }

  targetWindow.name = ''
  try {
    const payload = JSON.parse(
      rawName.slice(PRINT_WORKSPACE_INITIAL_DRAFT_WINDOW_NAME_PREFIX.length)
    )
    if (
      Number(payload?.version) !==
        PRINT_WORKSPACE_INITIAL_DRAFT_WINDOW_NAME_VERSION ||
      normalizeTemplateKey(payload?.templateKey) !== normalizedTemplateKey ||
      normalizeStateID(payload?.stateID) !== normalizedStateID ||
      payload?.storageKey !== storageKey ||
      !Object.prototype.hasOwnProperty.call(payload, 'draft')
    ) {
      return null
    }
    const nextCachedDrafts = cachedDrafts || new Map()
    nextCachedDrafts.set(cacheKey, payload.draft)
    if (!cachedDrafts) {
      initialPrintWorkspaceDraftCache.set(targetWindow, nextCachedDrafts)
    }
    return payload.draft
  } catch {
    return null
  }
}

export function clearInitialPrintWorkspaceDraftCache(storageKey, windowLike) {
  const targetWindow =
    windowLike || (typeof window !== 'undefined' ? window : null)
  if (!targetWindow || !String(storageKey || '').trim()) {
    return
  }
  initialPrintWorkspaceDraftCache.delete(targetWindow)
}

export function isSupportedPrintWorkspaceTemplate(templateKey) {
  return Boolean(
    getPrintTemplateByKey(normalizeTemplateKey(templateKey))?.runtime
  )
}

export function buildPrintCenterPath(templateKey = '', options = {}) {
  const normalizedTemplateKey = normalizeTemplateKey(templateKey)
  const searchParams = buildDraftSearchParams(options)

  if (isSupportedPrintWorkspaceTemplate(normalizedTemplateKey)) {
    searchParams.set('template', normalizedTemplateKey)
  }

  return appendSearch('/erp/print-center', searchParams)
}

export function buildPrintWorkspacePath(
  templateKey = PROCESSING_CONTRACT_TEMPLATE_KEY,
  options = {}
) {
  const normalizedTemplateKey = normalizeTemplateKey(templateKey)
  const targetPath = `/erp/print-workspace/${normalizedTemplateKey}`
  return appendSearch(targetPath, buildDraftSearchParams(options))
}

export function buildPrintWorkspaceURL(
  templateKey = PROCESSING_CONTRACT_TEMPLATE_KEY,
  options = {}
) {
  return new URL(
    buildPrintWorkspacePath(templateKey, options),
    window.location.origin
  ).toString()
}

export function buildRestorablePrintWorkspaceURL(
  templateKey = PROCESSING_CONTRACT_TEMPLATE_KEY,
  options = {}
) {
  return buildPrintWorkspaceURL(templateKey, {
    ...options,
    draftMode: PRINT_WORKSPACE_DRAFT_MODE.RESTORE,
  })
}

export function persistPrintWorkspaceDraftSnapshot(
  storageKey,
  draft,
  storageLike,
  windowLike
) {
  const normalizedStorageKey = String(storageKey || '').trim()
  const storage =
    storageLike || (typeof window !== 'undefined' ? window.localStorage : null)

  if (!normalizedStorageKey || !storage) {
    return false
  }

  try {
    storage.setItem(
      normalizedStorageKey,
      JSON.stringify({
        version: PRINT_WORKSPACE_DRAFT_SNAPSHOT_VERSION,
        updatedAt: Date.now(),
        draft,
      })
    )
    clearInitialPrintWorkspaceDraftCache(normalizedStorageKey, windowLike)
    return true
  } catch {
    return false
  }
}

export function readPrintWorkspaceDraftSnapshot(storageKey, storageLike) {
  const normalizedStorageKey = String(storageKey || '').trim()
  if (!storageLike) {
    const prepared = readPreparedPrintDraft(normalizedStorageKey)
    if (prepared !== undefined) return prepared
  }
  const storage =
    storageLike || (typeof window !== 'undefined' ? window.localStorage : null)
  if (!normalizedStorageKey || !storage) {
    return null
  }

  const removeInvalidSnapshot = () => {
    try {
      storage.removeItem(normalizedStorageKey)
    } catch {
      // 读取失败时保持 fail closed；清理只是尽力而为。
    }
  }

  try {
    const raw = storage.getItem(normalizedStorageKey)
    if (!raw) {
      return null
    }
    const payload = JSON.parse(raw)
    const updatedAt = Number(payload?.updatedAt)
    if (
      Number(payload?.version) !== PRINT_WORKSPACE_DRAFT_SNAPSHOT_VERSION ||
      !Number.isFinite(updatedAt) ||
      updatedAt <= 0 ||
      !Object.prototype.hasOwnProperty.call(payload, 'draft')
    ) {
      removeInvalidSnapshot()
      return null
    }
    if (Date.now() - updatedAt > PRINT_WORKSPACE_DRAFT_SNAPSHOT_TTL_MS) {
      removeInvalidSnapshot()
      return null
    }
    return payload.draft
  } catch {
    removeInvalidSnapshot()
    return null
  }
}

export function openPrintWorkspaceWindow(
  templateKey = PROCESSING_CONTRACT_TEMPLATE_KEY,
  options = {}
) {
  const stateID = createPrintWorkspaceStateID()
  const { initialDraft, ...workspaceOptions } = options
  const hasInitialDraft = Object.prototype.hasOwnProperty.call(
    options,
    'initialDraft'
  )
  let initialDraftStorageKey = ''
  let initialDraftWindowNamePayload = ''
  if (hasInitialDraft) {
    try {
      const serializedDraft = JSON.stringify(initialDraft)
      if (!serializedDraft) {
        throw new Error('empty draft')
      }
      initialDraftStorageKey = buildPrintWorkspaceDraftStorageKey(
        templateKey,
        stateID,
        {
          customerKey: workspaceOptions.customerKey,
          accountKey: workspaceOptions.accountKey,
          configRevision: workspaceOptions.configRevision,
          windowLike: typeof window !== 'undefined' ? window : null,
        }
      )
      if (
        typeof window === 'undefined' ||
        !window.localStorage ||
        !persistPrintWorkspaceDraftSnapshot(
          initialDraftStorageKey,
          initialDraft,
          window.localStorage,
          window
        )
      ) {
        const storageKey = initialDraftStorageKey
        if (!storageKey) throw new Error('missing account scope')
        initialDraftStorageKey = ''
        initialDraftWindowNamePayload = buildInitialDraftWindowNamePayload(
          templateKey,
          stateID,
          initialDraft,
          storageKey
        )
        if (!initialDraftWindowNamePayload) {
          throw new Error('empty draft payload')
        }
      }
    } catch (_error) {
      throw new Error('浏览器无法写入打印草稿，请检查存储权限后重试')
    }
  }
  const workspaceURL = buildRestorablePrintWorkspaceURL(templateKey, {
    ...workspaceOptions,
    stateID,
  })
  const popupURL = workspaceURL
  const popup = initialDraftWindowNamePayload
    ? window.open('about:blank', '_blank', 'width=1440,height=920')
    : window.open(popupURL, '_blank', 'width=1440,height=920')

  if (!popup) {
    if (initialDraftStorageKey) {
      try {
        window.localStorage.removeItem(initialDraftStorageKey)
      } catch {
        // 弹窗被拦截时只尽力清理本次临时草稿，不影响用户重试。
      }
    }
    throw new Error('浏览器拦截了弹窗，请允许弹窗后重试')
  }

  if (initialDraftWindowNamePayload) {
    popup.name = initialDraftWindowNamePayload
    if (popup.location && typeof popup.location.replace === 'function') {
      popup.location.replace(popupURL)
    } else if (popup.location) {
      popup.location.href = popupURL
    }
  }

  popup.focus()
  return popup
}

export function resolvePrintWorkspaceDraftMode(searchParamsLike) {
  if (!searchParamsLike) {
    return PRINT_WORKSPACE_DRAFT_MODE.RESTORE
  }

  const searchParams =
    typeof searchParamsLike === 'string'
      ? new URLSearchParams(searchParamsLike.replace(/^\?/, ''))
      : searchParamsLike

  return searchParams.get('draft') === PRINT_WORKSPACE_DRAFT_MODE.FRESH
    ? PRINT_WORKSPACE_DRAFT_MODE.FRESH
    : PRINT_WORKSPACE_DRAFT_MODE.RESTORE
}

export function resolvePrintWorkspaceEntrySource(searchParamsLike) {
  if (!searchParamsLike) {
    return PRINT_WORKSPACE_ENTRY_SOURCE.MENU
  }

  const searchParams =
    typeof searchParamsLike === 'string'
      ? new URLSearchParams(searchParamsLike.replace(/^\?/, ''))
      : searchParamsLike

  return searchParams.get('source') === PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS
    ? PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS
    : PRINT_WORKSPACE_ENTRY_SOURCE.MENU
}

export function resolvePrintWorkspaceCustomerKey(
  searchParamsLike,
  fallbackCustomerKey = ''
) {
  const searchParams =
    typeof searchParamsLike === 'string'
      ? new URLSearchParams(searchParamsLike.replace(/^\?/, ''))
      : searchParamsLike
  const queryCustomerKey = String(
    searchParams?.get?.('customer_key') || ''
  ).trim()
  return queryCustomerKey || String(fallbackCustomerKey || '').trim()
}

export function resolvePrintWorkspaceStateID(searchParamsLike) {
  if (!searchParamsLike) {
    return ''
  }

  const searchParams =
    typeof searchParamsLike === 'string'
      ? new URLSearchParams(searchParamsLike.replace(/^\?/, ''))
      : searchParamsLike

  return normalizeStateID(searchParams.get(PRINT_WORKSPACE_STATE_QUERY_KEY))
}
