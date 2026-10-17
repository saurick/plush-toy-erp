import { useCallback, useEffect, useRef } from 'react'
import { message } from '@/common/utils/antdApp'
import { isMobileRoleTaskHistoryScope } from '../../utils/mobileTaskQueries.mjs'
import {
  MOBILE_TASK_HISTORY_ACTION_KEY,
  MOBILE_TASK_HISTORY_APPROVED_QUANTITY_KEY,
  MOBILE_TASK_HISTORY_REASON_KEY,
  MOBILE_TASK_HISTORY_SCREEN_KEY,
  MOBILE_TASK_HISTORY_TASK_KEY,
  persistMobileTaskDraftBackup,
} from '../utils/mobileTaskHistory.mjs'

export default function useMobileTaskDraftHistory({
  action,
  approvedQuantity,
  reason,
  receipt,
  scopeKey,
  taskID,
}) {
  const draftRef = useRef(null)
  draftRef.current = {
    action: action || '',
    approvedQuantity,
    reason,
    receipt,
    scopeKey,
    taskID,
  }
  const timerRef = useRef(null)
  const warningShownRef = useRef(false)

  const flush = useCallback(() => {
    if (typeof window === 'undefined') return false
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const currentState = window.history.state || {}
    const draft = draftRef.current
    if (
      draft.receipt ||
      !isMobileRoleTaskHistoryScope(currentState, draft.scopeKey) ||
      currentState[MOBILE_TASK_HISTORY_SCREEN_KEY] !== 'action' ||
      !draft.action ||
      String(currentState[MOBILE_TASK_HISTORY_TASK_KEY] || '') !==
        String(draft.taskID || '')
    ) {
      return false
    }
    if (
      currentState[MOBILE_TASK_HISTORY_ACTION_KEY] === draft.action &&
      currentState[MOBILE_TASK_HISTORY_APPROVED_QUANTITY_KEY] ===
        draft.approvedQuantity &&
      currentState[MOBILE_TASK_HISTORY_REASON_KEY] === draft.reason
    ) {
      return true
    }
    try {
      window.history.replaceState(
        {
          ...currentState,
          [MOBILE_TASK_HISTORY_ACTION_KEY]: draft.action,
          [MOBILE_TASK_HISTORY_APPROVED_QUANTITY_KEY]: draft.approvedQuantity,
          [MOBILE_TASK_HISTORY_REASON_KEY]: draft.reason,
        },
        ''
      )
      return true
    } catch {
      if (!warningShownRef.current && document.visibilityState !== 'hidden') {
        warningShownRef.current = true
        message.warning('处理内容暂时无法随页面刷新保留，请先不要刷新')
      }
      return false
    }
  }, [])

  const backup = useCallback(() => {
    const draft = draftRef.current
    return persistMobileTaskDraftBackup(draft.scopeKey, draft)
  }, [])

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !taskID ||
      !action ||
      receipt ||
      window.history.state?.[MOBILE_TASK_HISTORY_SCREEN_KEY] !== 'action'
    ) {
      return undefined
    }
    const timerID = window.setTimeout(flush, 250)
    timerRef.current = timerID
    return () => {
      if (timerRef.current === timerID) {
        window.clearTimeout(timerID)
        timerRef.current = null
      }
    }
  }, [action, approvedQuantity, flush, reason, receipt, scopeKey, taskID])

  useEffect(() => {
    window.addEventListener('pagehide', flush)
    return () => {
      flush()
      window.removeEventListener('pagehide', flush)
    }
  }, [flush])

  return { backup, flush }
}
