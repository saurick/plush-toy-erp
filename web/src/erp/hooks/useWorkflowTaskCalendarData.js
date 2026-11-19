import { useEffect, useRef, useState } from 'react'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { getWorkflowTaskCalendar } from '../api/workflowApi.mjs'
import { TASK_CALENDAR_PAGE_SIZE } from '../utils/workflowTaskCalendar.mjs'
import { WORKFLOW_TASKS_CHANGED } from '../utils/workflowTaskChanges.mjs'

export default function useWorkflowTaskCalendarData({ state, query, scopeKey, refreshKey = 0 }) {
  const [revision, setRevision] = useState(0)
  const [page, setPage] = useState(null)
  const [requestState, setRequestState] = useState(null)
  const requestRef = useRef(null)
  const request = query && {
    ...query,
    calendar_month: state.month,
    calendar_selection: state.selection,
    limit: TASK_CALENDAR_PAGE_SIZE,
  }
  const queryKey = request ? JSON.stringify([scopeKey, request]) : null
  const monthKey = request ? JSON.stringify([scopeKey, query, state.month]) : null
  const current = page?.key === queryKey ? page : null
  const calendar = current?.calendar
  // 日期切换期间继续使用同一权限、筛选条件和月份下的统计。
  const monthCalendar = page?.monthKey === monthKey ? page.calendar : null
  const loading = requestState?.key !== queryKey || requestState.loading
  const error = requestState?.key === queryKey ? requestState.error : ''
  const items = current?.items || []
  const hasMore = Boolean(calendar && items.length < calendar.total)

  const load = async (append = false, { showRefreshFeedback = false } = {}) => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setRequestState({ key: queryKey, loading: true, error: '', append })
    const offset = append ? items.length : 0
    try {
      const result = await getWorkflowTaskCalendar(
        {
          ...request,
          calendar_offset: offset,
          ...(append ? { calendar_revision: calendar.revision } : {}),
        },
        { signal: controller.signal }
      )
      if (controller.signal.aborted || requestRef.current !== controller) return
      const added = result.items.filter(
        (task) => !items.some((item) => item.id === task.id)
      )
      const restarted = append && result.revision !== calendar.revision
      if (append && !restarted && hasMore && !added.length) {
        throw new Error('待办已有变动，请重新加载')
      }
      setPage({
        key: queryKey,
        monthKey,
        calendar: result,
        items: append && !restarted ? [...items, ...added] : result.items,
      })
      setRequestState({ key: queryKey, loading: false, error: '' })
      if (showRefreshFeedback) {
        message.success({
          key: 'workflow-task-calendar-refresh',
          content: '待办日历已刷新',
        })
      }
    } catch (err) {
      if (
        !controller.signal.aborted &&
        requestRef.current === controller &&
        !isRpcAbortError(err)
      ) {
        const errorMessage = getActionErrorMessage(
          err,
          showRefreshFeedback
            ? '待办日历刷新失败，请重试'
            : '待办日历加载失败，请重试'
        )
        setRequestState({ key: queryKey, loading: false, error: errorMessage })
        if (showRefreshFeedback) {
          message.error({
            key: 'workflow-task-calendar-refresh',
            content: errorMessage,
          })
        }
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null
    }
  }

  const handleRefresh = () => {
    if (loading || requestRef.current) return
    return load(false, { showRefreshFeedback: true })
  }

  useEffect(() => {
    if (!queryKey) {
      setPage(null)
      setRequestState(null)
      return undefined
    }
    load()
    const refresh = () => setRevision((value) => value + 1)
    window.addEventListener(WORKFLOW_TASKS_CHANGED, refresh)
    return () => {
      requestRef.current?.abort()
      window.removeEventListener(WORKFLOW_TASKS_CHANGED, refresh)
    }
    // 由完整请求和权限范围控制读取周期。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, revision, refreshKey])

  return {
    calendar,
    monthCalendar,
    items,
    hasMore,
    loading,
    appending: loading && requestState?.key === queryKey && requestState.append,
    error,
    load,
    handleRefresh,
  }
}
