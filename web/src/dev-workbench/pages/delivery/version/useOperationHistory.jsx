import { useEffect, useRef, useState } from 'react'
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
  const snapshots = useRef(new Map())
  const [request, setRequest] = useState(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!enabled) return undefined
    const { filters: requestedFilters, page: requestedPage } =
      JSON.parse(queryKey)
    const controller = new AbortController()
    setRequest({ key: queryKey, loading: true, error: '' })
    const load = async () => {
      try {
        const data = await client.history({
          ...requestedFilters,
          page: requestedPage,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        snapshots.current.delete(queryKey)
        snapshots.current.set(queryKey, data)
        if (snapshots.current.size > 20) snapshots.current.delete(snapshots.current.keys().next().value)
        setRequest({ key: queryKey, loading: false, error: '' })
        if (data.page !== requestedPage) setPage(data.page)
      } catch {
        if (!controller.signal.aborted) {
          setRequest({
            key: queryKey,
            loading: false,
            error: '发布历史读取失败',
          })
        }
      }
    }
    load()
    return () => controller.abort()
  }, [client, enabled, queryKey, refreshKey, setPage, retry])
  const data = snapshots.current.get(queryKey) || null
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
