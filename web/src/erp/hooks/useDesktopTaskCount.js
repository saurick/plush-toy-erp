import { useCallback, useEffect, useRef, useState } from 'react'
import { getWorkflowTaskBoard } from '../api/workflowApi.mjs'
import { canMountCustomerRuntime } from '../utils/adminProfileSync.mjs'
import { workflowTaskAdminAccessRequestIdentity } from '../utils/workflowTaskActionAccess.mjs'
import { WORKFLOW_TASKS_CHANGED } from '../utils/workflowTaskChanges.mjs'
import {
  isAuthFailureCode,
  isAdminSessionUnavailableCode,
  RpcErrorCode,
} from '@/common/consts/errorCodes'

export default function useDesktopTaskCount({ adminProfile, enabled: available, pathname }) {
  const enabled = Boolean(available && adminProfile?.id && canMountCustomerRuntime(adminProfile))
  const scope = `${workflowTaskAdminAccessRequestIdentity(adminProfile)}|${enabled}`
  const currentScope = useRef(scope)
  currentScope.current = scope
  const pending = useRef(null)
  const [state, setState] = useState(null)

  const refresh = useCallback(async () => {
    pending.current?.abort()
    if (!enabled) return false
    const controller = new AbortController()
    pending.current = controller
    const isCurrent = () => !controller.signal.aborted && currentScope.current === scope
    setState((previous) => ({
      scope,
      count: previous?.scope === scope ? previous.count : null,
      error: previous?.scope === scope && previous.error,
      loading: true,
    }))
    try {
      const response = await getWorkflowTaskBoard(
        { todo_only: true, limit: 1 },
        { signal: controller.signal }
      )
      if (!isCurrent()) return false
      setState({ scope, count: response.total, error: false, loading: false })
      return true
    } catch (error) {
      if (!isCurrent()) return false
      const accessLost = isAuthFailureCode(error?.code) ||
        isAdminSessionUnavailableCode(error?.code) ||
        Number(error?.code) === RpcErrorCode.PERMISSION_DENIED
      setState((previous) => ({
        scope,
        count: !accessLost && previous?.scope === scope ? previous.count : null,
        error: true,
        loading: false,
      }))
      return false
    }
  }, [enabled, scope])

  useEffect(() => {
    refresh()
    return () => pending.current?.abort()
  }, [refresh, pathname])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener(WORKFLOW_TASKS_CHANGED, refresh)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener(WORKFLOW_TASKS_CHANGED, refresh)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const visible = enabled && state?.scope === scope ? state : null
  return {
    enabled,
    count: visible?.count ?? null,
    error: visible?.error === true,
    loading: enabled && (!visible || visible.loading),
    refresh,
  }
}
