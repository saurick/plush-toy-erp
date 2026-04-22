import { PROCESSING_CONTRACT_TEMPLATE_KEY } from '../data/processingContractTemplate.mjs'

export const MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY =
  'material-purchase-contract'
export { PROCESSING_CONTRACT_TEMPLATE_KEY }

const PRINT_WORKSPACE_WINDOW_STATE_STORAGE_KEY_PREFIX =
  '__plush_erp_print_window_state__:'
const PRINT_WORKSPACE_WINDOW_STATE_VERSION = 1
const PRINT_WORKSPACE_WINDOW_STATE_DB_NAME =
  '__plush_erp_print_window_state_db__'
const PRINT_WORKSPACE_WINDOW_STATE_DB_VERSION = 1
const PRINT_WORKSPACE_WINDOW_STATE_DB_STORE_NAME = 'states'
const PRINT_WORKSPACE_STATE_QUERY_KEY = 'state'
const PRINT_WORKSPACE_WINDOW_STATE_TTL_MS = 24 * 60 * 60 * 1000
const PRINT_WORKSPACE_SHELL_PATH = '/print-window-shell.html'

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

const supportedPrintWorkspaceTemplateKeys = new Set([
  PROCESSING_CONTRACT_TEMPLATE_KEY,
  MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
])

function normalizeTemplateKey(templateKey = '') {
  return String(templateKey || '').trim()
}

function normalizeStateID(stateID = '') {
  return String(stateID || '').trim()
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

export function buildPrintWorkspaceWindowStateStorageKey(stateID = '') {
  return `${PRINT_WORKSPACE_WINDOW_STATE_STORAGE_KEY_PREFIX}${normalizeStateID(stateID)}`
}

export function buildPrintWorkspaceDraftStorageKey(templateKey, stateID = '') {
  const normalizedTemplateKey = normalizeTemplateKey(templateKey)
  const normalizedStateID = normalizeStateID(stateID)
  return normalizedStateID
    ? `__plush_erp_print_workspace_draft__:${normalizedTemplateKey}:${normalizedStateID}`
    : `__plush_erp_print_workspace_draft__:${normalizedTemplateKey}`
}

export function isSupportedPrintWorkspaceTemplate(templateKey) {
  return supportedPrintWorkspaceTemplateKeys.has(
    normalizeTemplateKey(templateKey)
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

export function buildPrintWorkspaceShellURL(stateID = '') {
  const shellURL = new URL(PRINT_WORKSPACE_SHELL_PATH, window.location.origin)
  const normalizedStateID = normalizeStateID(stateID)
  if (normalizedStateID) {
    shellURL.searchParams.set(
      PRINT_WORKSPACE_STATE_QUERY_KEY,
      normalizedStateID
    )
  }
  return shellURL.toString()
}

export function persistPrintWorkspaceWindowState(stateID, payload = {}) {
  const normalizedStateID = normalizeStateID(stateID)
  if (
    typeof window === 'undefined' ||
    !window.localStorage ||
    !normalizedStateID
  ) {
    return false
  }

  try {
    window.localStorage.setItem(
      buildPrintWorkspaceWindowStateStorageKey(normalizedStateID),
      JSON.stringify({
        version: PRINT_WORKSPACE_WINDOW_STATE_VERSION,
        updatedAt: Date.now(),
        ...payload,
      })
    )
    return true
  } catch (error) {
    return false
  }
}

function buildPrintWorkspaceWindowStateRecord(stateID, payload = {}) {
  const normalizedStateID = normalizeStateID(stateID)
  if (!normalizedStateID) {
    return null
  }

  return {
    version: PRINT_WORKSPACE_WINDOW_STATE_VERSION,
    stateID: normalizedStateID,
    updatedAt: Date.now(),
    ...payload,
  }
}

let printWorkspaceWindowStateDatabasePromise = null

function openPrintWorkspaceWindowStateDatabase(indexedDBLike) {
  const indexedDB = indexedDBLike || window.indexedDB
  if (!indexedDB || typeof indexedDB.open !== 'function') {
    return Promise.resolve(null)
  }
  if (printWorkspaceWindowStateDatabasePromise) {
    return printWorkspaceWindowStateDatabasePromise
  }

  printWorkspaceWindowStateDatabasePromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(
        PRINT_WORKSPACE_WINDOW_STATE_DB_NAME,
        PRINT_WORKSPACE_WINDOW_STATE_DB_VERSION
      )
      request.onupgradeneeded = () => {
        const database = request.result
        if (
          !database.objectStoreNames.contains(
            PRINT_WORKSPACE_WINDOW_STATE_DB_STORE_NAME
          )
        ) {
          database.createObjectStore(
            PRINT_WORKSPACE_WINDOW_STATE_DB_STORE_NAME,
            {
              keyPath: 'stateID',
            }
          )
        }
      }
      request.onsuccess = () => {
        const database = request.result
        database.onversionchange = () => {
          try {
            database.close()
          } catch (error) {
            // 忽略关闭失败，继续保留 localStorage 兜底。
          }
        }
        resolve(database)
      }
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch (error) {
      resolve(null)
    }
  })

  return printWorkspaceWindowStateDatabasePromise
}

function persistPrintWorkspaceWindowStateRecordToIndexedDB(
  stateID,
  indexedDBLike,
  payload = {}
) {
  const record = buildPrintWorkspaceWindowStateRecord(stateID, payload)
  if (!record) {
    return Promise.resolve(false)
  }

  return openPrintWorkspaceWindowStateDatabase(indexedDBLike).then(
    (database) => {
      if (!database) {
        return false
      }

      return new Promise((resolve) => {
        try {
          const transaction = database.transaction(
            PRINT_WORKSPACE_WINDOW_STATE_DB_STORE_NAME,
            'readwrite'
          )
          const request = transaction
            .objectStore(PRINT_WORKSPACE_WINDOW_STATE_DB_STORE_NAME)
            .put(record)
          let settled = false
          const finalize = (saved) => {
            if (settled) {
              return
            }
            settled = true
            resolve(saved)
          }
          request.onsuccess = () => finalize(true)
          request.onerror = () => finalize(false)
          transaction.oncomplete = () => finalize(true)
          transaction.onerror = () => finalize(false)
          transaction.onabort = () => finalize(false)
        } catch (error) {
          resolve(false)
        }
      })
    }
  )
}

export function persistPrintWorkspaceWindowHTML(stateID, payload = {}) {
  const normalizedStateID = normalizeStateID(stateID)
  if (!normalizedStateID) {
    return Promise.resolve(false)
  }

  const record = buildPrintWorkspaceWindowStateRecord(
    normalizedStateID,
    payload
  )
  if (!record) {
    return Promise.resolve(false)
  }

  let savedToStorage = false
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(
        buildPrintWorkspaceWindowStateStorageKey(normalizedStateID),
        JSON.stringify(record)
      )
      savedToStorage = true
    } catch (error) {
      savedToStorage = false
    }
  }

  return persistPrintWorkspaceWindowStateRecordToIndexedDB(
    normalizedStateID,
    undefined,
    payload
  ).then((savedToIndexedDB) => savedToStorage || savedToIndexedDB)
}

export function readPrintWorkspaceWindowState(stateID, storageLike) {
  const normalizedStateID = normalizeStateID(stateID)
  const storage =
    storageLike || (typeof window !== 'undefined' ? window.localStorage : null)
  if (!storage || !normalizedStateID) {
    return null
  }

  try {
    const raw = storage.getItem(
      buildPrintWorkspaceWindowStateStorageKey(normalizedStateID)
    )
    if (!raw) {
      return null
    }
    const payload = JSON.parse(raw)
    const updatedAt = Number(payload?.updatedAt)
    if (Number(payload?.version) !== PRINT_WORKSPACE_WINDOW_STATE_VERSION) {
      return null
    }
    if (
      Number.isFinite(updatedAt) &&
      updatedAt > 0 &&
      Date.now() - updatedAt > PRINT_WORKSPACE_WINDOW_STATE_TTL_MS
    ) {
      storage.removeItem(
        buildPrintWorkspaceWindowStateStorageKey(normalizedStateID)
      )
      return null
    }
    return payload
  } catch (error) {
    return null
  }
}

export function syncPrintWorkspaceShellHistory(stateID) {
  if (
    typeof window === 'undefined' ||
    !window.history ||
    typeof window.history.replaceState !== 'function'
  ) {
    return false
  }

  const normalizedStateID = normalizeStateID(stateID)
  if (!normalizedStateID) {
    return false
  }

  const shellURL = new URL(buildPrintWorkspaceShellURL(normalizedStateID))
  if (
    window.location.pathname === shellURL.pathname &&
    window.location.search === shellURL.search
  ) {
    return false
  }

  window.history.replaceState(
    null,
    '',
    `${shellURL.pathname}${shellURL.search}${shellURL.hash}`
  )
  return true
}

export function openPrintWorkspaceWindow(
  templateKey = PROCESSING_CONTRACT_TEMPLATE_KEY,
  options = {}
) {
  const stateID = createPrintWorkspaceStateID()
  const workspaceURL = buildPrintWorkspaceURL(templateKey, {
    ...options,
    stateID,
  })
  const popupURL = persistPrintWorkspaceWindowState(stateID, {
    templateKey: normalizeTemplateKey(templateKey),
    workspaceURL,
  })
    ? buildPrintWorkspaceShellURL(stateID)
    : workspaceURL
  const popup = window.open(popupURL, '_blank', 'width=1440,height=920')

  if (!popup) {
    throw new Error('浏览器拦截了弹窗，请允许弹窗后重试')
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
