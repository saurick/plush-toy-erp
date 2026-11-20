import { useCallback, useEffect, useRef, useState } from 'react'
import { listWorkflowRoleTasks } from '../../api/workflowApi.mjs'
import { canMountCustomerRuntime } from '../../utils/adminProfileSync.mjs'
import { workflowTaskAdminAccessRequestIdentity } from '../../utils/workflowTaskActionAccess.mjs'
import {
  isAuthFailureCode,
  isAdminSessionUnavailableCode,
  RpcErrorCode,
} from '@/common/consts/errorCodes'

export default function useMobileNavigationCounts({
  adminProfile,
  roleKey,
  refreshRevision,
}) {
  const enabled = Boolean(
    roleKey && adminProfile?.id && canMountCustomerRuntime(adminProfile)
  )
  const scope = `${roleKey}|${workflowTaskAdminAccessRequestIdentity(adminProfile)}|${enabled}`
  const currentScope = useRef(scope)
  currentScope.current = scope
  const sequence = useRef(0)
  const [state, setState] = useState(null)

  const refresh = useCallback(async () => {
    const request = ++sequence.current
    if (!enabled) return false
    setState((previous) => ({
      scope,
      counts: previous?.scope === scope ? previous.counts : null,
      error: previous?.scope === scope ? previous.error : false,
      loading: true,
    }))
    try {
      // 首屏响应包含完整岗位计数；不传列表搜索、状态或分页条件。
      const response = await listWorkflowRoleTasks({
        role_key: roleKey,
        view_key: 'todo',
        limit: 1,
      })
      if (currentScope.current !== scope || sequence.current !== request) {
        return false
      }
      setState({ scope, counts: response.counts, error: false, loading: false })
      return true
    } catch (error) {
      if (currentScope.current !== scope || sequence.current !== request) {
        return false
      }
      const accessLost =
        isAuthFailureCode(error?.code) ||
        isAdminSessionUnavailableCode(error?.code) ||
        Number(error?.code) === RpcErrorCode.PERMISSION_DENIED
      setState((previous) => ({
        scope,
        counts:
          !accessLost && previous?.scope === scope ? previous.counts : null,
        error: true,
        loading: false,
      }))
      return false
    }
  }, [enabled, roleKey, scope])

  useEffect(() => {
    refresh()
    return () => {
      sequence.current += 1
    }
  }, [refresh])

  const previousRevision = useRef(refreshRevision)
  useEffect(() => {
    if (previousRevision.current === refreshRevision) return
    previousRevision.current = refreshRevision
    if (refreshRevision) refresh()
  }, [refresh, refreshRevision])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const visible = enabled && state?.scope === scope ? state : null
  return {
    counts: visible?.counts || null,
    error: visible?.error === true,
    loading: visible?.loading === true,
    refresh,
  }
}
