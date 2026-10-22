import { useEffect, useState } from 'react'
import { resolveDevOperationHistoryState } from '../../../config/devDelivery.mjs'
import { operationHistoryStatePresentation } from './shared.jsx'

export function useOperationHistory({
  client,
  enabled,
  scope,
  filters,
  page,
  refreshKey,
  setPage,
}) {
  const queryKey = JSON.stringify({ scope, filters, page })
  const [snapshot, setSnapshot] = useState(null)
  const [request, setRequest] = useState(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!enabled) return undefined
    const { filters: requestedFilters, page: requestedPage } =
      JSON.parse(queryKey)
    let cancelled = false
    setRequest({ key: queryKey, loading: true, error: '' })
    const timer = window.setTimeout(async () => {
      try {
        const data = await client.history({
          ...requestedFilters,
          page: requestedPage,
        })
        if (cancelled) return
        setSnapshot({ key: queryKey, data })
        setRequest({ key: queryKey, loading: false, error: '' })
        if (data.page !== requestedPage) setPage(data.page)
      } catch {
        if (!cancelled) {
          setRequest({
            key: queryKey,
            loading: false,
            error: '发布历史读取失败',
          })
        }
      }
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [client, enabled, queryKey, refreshKey, setPage, retry])
  const data = snapshot?.key === queryKey ? snapshot.data : null
  const loading = enabled && (request?.key !== queryKey || request.loading)
  const error = request?.key === queryKey ? request.error : ''
  const state = resolveDevOperationHistoryState({
    initialLoading: loading && !data,
    loadError: error,
    hasSummary: Boolean(data),
    summaryFresh: Boolean(data && !loading && !error),
    operationCount: data?.matched || 0,
  })
  return {
    historyResult: data,
    historyLoading: loading,
    retryHistory: () => setRetry((value) => value + 1),
    filteredHistoryOperations: data?.operations || [],
    operationHistoryState: state,
    operationHistoryPresentation: operationHistoryStatePresentation(state),
  }
}
