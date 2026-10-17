import { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { canonicalBusinessPath, mobileBusinessPath, mobileBusinessRole } from '../utils/businessTaskRoute.mjs'
import { workflowTaskEntryNavigation, workflowTaskNavigationState } from '../utils/workflowTaskNavigation.mjs'
import { workflowTaskSourceForEntryPath } from '../utils/dashboardTaskDisplay.mjs'
import { listWorkflowTasks } from '../api/workflowApi.mjs'
import { mobileTaskBusinessPath, selectMobileRelatedBusinessTask } from '../mobile/utils/mobileTaskBusiness.mjs'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

// Both shells render the same business forms; related-document navigation
// keeps the current mobile role and the originating task context.
export default function useBusinessNavigate() {
  const navigate = useNavigate()
  const location = useLocation()
  const outlet = useOutletContext()
  const roleKey = mobileBusinessRole(location.pathname)
  const taskID = Number(/^\/m\/[a-z_]+\/tasks\/([1-9][0-9]*)\/handle\//u.exec(location.pathname)?.[1] || 0)
  const pending = useRef(null)
  useEffect(() => () => pending.current?.controller.abort(), [location.pathname, location.search, outlet?.adminProfile])
  return useCallback(async (to, options = {}) => {
    if (typeof to === 'number') return navigate(to)
    const path = roleKey ? mobileBusinessPath(to, roleKey, taskID) : to
    const targetPath = typeof path === 'string' ? path : `${path.pathname || location.pathname}${path.search || ''}${path.hash || ''}`
    const context = options.state?.workflowTaskNavigation || outlet?.workflowTaskNavigation || location.state?.workflowTaskNavigation
    const targetSource = workflowTaskSourceForEntryPath(canonicalBusinessPath(targetPath))
    const currentSource = workflowTaskSourceForEntryPath(canonicalBusinessPath(`${location.pathname}${location.search}`))
    if (taskID && targetSource && (targetSource.source_type !== currentSource?.source_type || targetSource.source_id !== currentSource?.source_id)) {
      if (pending.current?.target === targetPath) return
      pending.current?.controller.abort()
      const controller = new AbortController()
      const attempt = { target: targetPath, controller }
      pending.current = attempt
      try {
        if (outlet?.mobileTaskBusiness?.confirmLeave && !(await outlet.mobileTaskBusiness.confirmLeave())) return
        const page = await listWorkflowTasks({ ...targetSource, limit: 100 }, { signal: controller.signal })
        if (controller.signal.aborted) return
        const task = selectMobileRelatedBusinessTask(page, targetSource, roleKey)
        const target = task ? mobileTaskBusinessPath(task, roleKey) : ''
        if (!target) {
          message.warning('请从任务管理选择对应的办理任务。')
          return
        }
        const navigation = workflowTaskEntryNavigation(task, target, context?.returnPath || `/m/${roleKey}/tasks`, outlet?.adminProfile?.id)
        navigate(target, { ...options,
state: {
          ...options.state,
          ...navigation.state,
          workflowTaskNavigation: {
            ...navigation.state.workflowTaskNavigation,
            returnListState: context?.returnListState,
            returnHistoryIndex: context?.returnHistoryIndex,
            returnPosition: context?.returnPosition,
          },
        } })
      } catch (error) {
        if (!controller.signal.aborted) message.error(getActionErrorMessage(error, '打开关联业务任务'))
      } finally {
        if (pending.current === attempt) pending.current = null
      }
      return
    }
    return navigate(path, {
      ...options,
      state: workflowTaskNavigationState(options.state, context, targetPath),
    })
  }, [navigate, roleKey, taskID, location.pathname, location.search, location.state, outlet])
}
