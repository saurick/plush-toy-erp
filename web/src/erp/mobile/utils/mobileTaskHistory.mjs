import {
  MOBILE_ROLE_TASK_PAGE_LIMIT,
  mobileTaskQueryScope,
  normalizeMobileTaskQueryOptions,
} from '../../utils/mobileTaskQueries.mjs'
import { MOBILE_MAIN_TAB_KEYS } from './mobileRoleTaskModel.mjs'

export const MOBILE_TASK_HISTORY_SCREEN_KEY = 'mobileRoleTasksScreen'
export const MOBILE_TASK_HISTORY_DEPTH_KEY = 'mobileRoleTasksDepth'
export const MOBILE_TASK_HISTORY_TASK_KEY = 'mobileRoleTasksTaskID'
export const MOBILE_TASK_HISTORY_LINKED_KEY = 'mobileRoleTasksLinkedTaskID'
export const MOBILE_TASK_HISTORY_ACTION_KEY = 'mobileRoleTasksAction'
export const MOBILE_TASK_HISTORY_RECEIPT_KEY = 'mobileRoleTasksReceipt'
export const MOBILE_TASK_HISTORY_MAIN_TAB_KEY = 'mobileRoleTasksMainTab'
export const MOBILE_TASK_HISTORY_MESSAGE_TAB_KEY = 'mobileRoleTasksMessageTab'
export const MOBILE_TASK_HISTORY_FILTER_KEY = 'mobileRoleTasksFilter'
export const MOBILE_TASK_HISTORY_SCROLL_TOP_KEY = 'mobileRoleTasksScrollTop'
export const MOBILE_TASK_HISTORY_LIST_LIMITS_KEY = 'mobileRoleTasksListLimits'
export const MOBILE_TASK_HISTORY_LOADED_COUNTS_KEY =
  'mobileRoleTasksLoadedCountsByView'
export const MOBILE_TASK_HISTORY_SCOPE_KEY = 'mobileRoleTasksScope'
export const MOBILE_TASK_HISTORY_KEYWORD_KEY = 'mobileRoleTasksKeyword'
export const MOBILE_TASK_HISTORY_SORT_KEY = 'mobileRoleTasksSort'
export const MOBILE_TASK_HISTORY_STATUS_KEY = 'mobileRoleTasksStatus'
export const MOBILE_TASK_HISTORY_DATES_KEY = 'mobileRoleTasksDates'
export const MOBILE_TASK_HISTORY_QUERY_PAGES_KEY = 'mobileRoleTasksQueryPages'
export const MOBILE_TASK_HISTORY_REASON_KEY = 'mobileRoleTasksReason'
export const MOBILE_TASK_HISTORY_MATERIAL_DRAFT_KEY =
  'mobileRoleTasksMaterialDraft'
export const MOBILE_TASK_HISTORY_APPROVED_QUANTITY_KEY =
  'mobileRoleTasksApprovedQuantity'
const MOBILE_TASK_DRAFT_STORAGE_PREFIX = 'plush-toy-erp:mobile-task-draft:v1:'

export const MOBILE_TASK_HISTORY_SCREENS = new Set([
  'detail',
  'action',
  'receipt',
])
const MOBILE_TASK_RESTORE_PAGE_LIMIT = 20
export const MOBILE_TASK_RESTORE_ITEM_LIMIT =
  MOBILE_ROLE_TASK_PAGE_LIMIT * MOBILE_TASK_RESTORE_PAGE_LIMIT

export const MOBILE_TASK_QUERY_PAGE_KEYS = Object.freeze({
  TASKS: 'tasks',
  HISTORY: 'history',
  RISKS: 'risks',
})
export const DEFAULT_MOBILE_TASK_QUERY_OPTIONS = Object.freeze({
  keyword: '',
  sortKey: 'newest',
  statusKey: '',
})

export function readMobileTaskHistoryState() {
  if (typeof window === 'undefined') return {}
  const { state } = window.history
  return state && typeof state === 'object'
    ? {
        ...state.usr?.mobileRoleTasksReturn?.returnListState,
        ...state,
        ...state.usr?.workflowTaskReturn?.returnListState,
      }
    : {}
}

function mobileTaskDraftStorageKey(scopeKey, taskID) {
  const normalizedScopeKey = String(scopeKey || '').trim()
  const normalizedTaskID = String(taskID || '').trim()
  if (!normalizedScopeKey || !normalizedTaskID) return ''
  return `${MOBILE_TASK_DRAFT_STORAGE_PREFIX}${encodeURIComponent(
    normalizedScopeKey
  )}:${encodeURIComponent(normalizedTaskID)}`
}

export function persistMobileTaskDraftBackup(scopeKey, draft) {
  if (typeof window === 'undefined') return false
  const storageKey = mobileTaskDraftStorageKey(scopeKey, draft?.taskID)
  const action = String(draft?.action || '').trim()
  if (!storageKey || !action) return false
  try {
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        action,
        approvedQuantity: String(draft?.approvedQuantity || ''),
        reason: String(draft?.reason || ''),
        scopeKey: String(scopeKey || '').trim(),
        taskID: String(draft.taskID),
      })
    )
    return true
  } catch {
    return false
  }
}

export function readMobileTaskDraftBackup(scopeKey, taskID) {
  if (typeof window === 'undefined') return null
  const storageKey = mobileTaskDraftStorageKey(scopeKey, taskID)
  if (!storageKey) return null
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(storageKey) || 'null'
    )
    if (
      !value ||
      typeof value !== 'object' ||
      value.scopeKey !== String(scopeKey || '').trim() ||
      value.taskID !== String(taskID || '') ||
      !String(value.action || '').trim()
    ) {
      return null
    }
    return {
      action: String(value.action),
      approvedQuantity: String(value.approvedQuantity || ''),
      reason: String(value.reason || ''),
    }
  } catch {
    return null
  }
}

export function clearMobileTaskDraftBackup(scopeKey, taskID) {
  if (typeof window === 'undefined') return false
  const storageKey = mobileTaskDraftStorageKey(scopeKey, taskID)
  if (!storageKey) return false
  try {
    window.sessionStorage.removeItem(storageKey)
    return true
  } catch {
    return false
  }
}

export function mobileTaskHistoryChoice(value, choices, fallback) {
  return choices.includes(value) ? value : fallback
}

export function isLinkedTaskTab(tab) {
  return [
    MOBILE_MAIN_TAB_KEYS.PROGRESS,
    MOBILE_MAIN_TAB_KEYS.TRACKING,
    MOBILE_MAIN_TAB_KEYS.EXCEPTIONS,
  ].includes(tab)
}

export function mobileTaskQueryPageKey(mainTabKey) {
  if (mainTabKey === MOBILE_MAIN_TAB_KEYS.DONE) {
    return MOBILE_TASK_QUERY_PAGE_KEYS.HISTORY
  }
  return mainTabKey === MOBILE_MAIN_TAB_KEYS.MESSAGES
    ? MOBILE_TASK_QUERY_PAGE_KEYS.RISKS
    : MOBILE_TASK_QUERY_PAGE_KEYS.TASKS
}

export function readMobileTaskQueryPages(
  history,
  accessScope,
  activePageKey,
  activeOptions
) {
  const trusted =
    String(history?.[MOBILE_TASK_HISTORY_SCOPE_KEY] || '').trim() ===
    mobileTaskQueryScope(accessScope, activeOptions)
  const stored = trusted ? history?.[MOBILE_TASK_HISTORY_QUERY_PAGES_KEY] : null
  const pages = {
    [MOBILE_TASK_QUERY_PAGE_KEYS.TASKS]: normalizeMobileTaskQueryOptions(
      stored?.[MOBILE_TASK_QUERY_PAGE_KEYS.TASKS]
    ),
    [MOBILE_TASK_QUERY_PAGE_KEYS.RISKS]: normalizeMobileTaskQueryOptions(
      stored?.[MOBILE_TASK_QUERY_PAGE_KEYS.RISKS]
    ),
    [MOBILE_TASK_QUERY_PAGE_KEYS.HISTORY]: normalizeMobileTaskQueryOptions(
      stored?.[MOBILE_TASK_QUERY_PAGE_KEYS.HISTORY],
      true
    ),
  }
  pages[activePageKey] = normalizeMobileTaskQueryOptions(
    activeOptions,
    activePageKey === MOBILE_TASK_QUERY_PAGE_KEYS.HISTORY
  )
  return pages
}

export function readMobileTaskListLimits(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, limit]) => {
      const normalized = Number(limit)
      return Number.isSafeInteger(normalized) && normalized > 0
        ? [[key, Math.min(normalized, MOBILE_TASK_RESTORE_ITEM_LIMIT)]]
        : []
    })
  )
}
