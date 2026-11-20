import React, {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { message } from '@/common/utils/antdApp'
import { getPageLoadErrorMessage } from '@/common/utils/errorMessage'

const LoadFeedbackContext = createContext(null)

// 单据页并行加载列表与基础资料时共用一条浮动提示，业务写入继续使用独立反馈。
export function showPageLoadError(error, action) {
  return message.error({
    key: 'erp-page-load-error',
    content: getPageLoadErrorMessage(error, action),
  })
}

// 同页的工作范围、主内容和导航计数共用提示与重试；只登记读取，不能重放业务写入。
export function PageLoadFeedbackBoundary({ children }) {
  const [failures, setFailures] = useState({})
  const [retrying, setRetrying] = useState(false)
  const pending = useRef(null)
  const current = useRef(failures)
  current.current = failures
  const register = useCallback((id, failure) => {
    setFailures((previous) => ({ ...previous, [id]: failure }))
    return () =>
      setFailures((previous) => {
        const next = { ...previous }
        delete next[id]
        return next
      })
  }, [])
  const retry = useCallback(() => {
    if (pending.current) return pending.current
    setRetrying(true)
    const reads = Object.values(current.current)
    const request = Promise.allSettled(
      reads.map((failure) => Promise.resolve().then(failure.retry))
    ).finally(() => {
      pending.current = null
      setRetrying(false)
    })
    pending.current = request
    return request
  }, [])
  const primary = Object.keys(failures).sort(
    (a, b) => failures[b].priority - failures[a].priority
  )[0]
  const value = useMemo(
    () => ({ register, primary, retry, retrying }),
    [register, primary, retry, retrying]
  )
  return (
    <LoadFeedbackContext.Provider value={value}>
      {children}
    </LoadFeedbackContext.Provider>
  )
}

// 共享面板独立使用时在原位反馈；处于同一页面边界时只显示主要读取故障。
export function usePageLoadFeedback({
  error,
  retry,
  priority = 20,
  enabled = true,
}) {
  const boundary = useContext(LoadFeedbackContext)
  const id = useId()
  const latestRetry = useRef(retry)
  latestRetry.current = retry
  const retryCurrent = useCallback(() => latestRetry.current(), [])
  const register = boundary?.register
  const failed = enabled && Boolean(error)
  useLayoutEffect(() => {
    if (!failed || !register) return undefined
    return register(id, { priority, retry: retryCurrent })
  }, [failed, id, priority, register, retryCurrent])
  return {
    visible: failed && (!boundary || boundary.primary === id),
    retry: boundary ? boundary.retry : retryCurrent,
    retrying: boundary?.retrying || false,
  }
}
