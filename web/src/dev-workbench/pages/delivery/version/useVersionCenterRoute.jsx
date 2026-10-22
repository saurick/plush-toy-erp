import { useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import useDevCustomerScope from '../../../hooks/useDevCustomerScope.mjs'
import { buildDevCustomerSnapshotKey } from '../../../config/devCustomerScope.mjs'
import {
  DEV_DELIVERY_SUMMARY_SNAPSHOT_KEY,
  DEV_DELIVERY_TARGETS,
  DEV_VERSION_CENTER_HISTORY_FILTER_ALL,
  DEV_VERSION_CENTER_HISTORY_FILTER_QUERY_KEYS,
  DEV_VERSION_CENTER_VIEW_HISTORY,
  DEV_VERSION_CENTER_VIEW_PIPELINE,
  DEV_VERSION_CENTER_VIEW_QUERY_KEY,
  resolveDevOperationHistoryFilters,
  resolveDevVersionCenterView,
} from '../../../config/devDelivery.mjs'

export function useVersionCenterRoute({ setHistoryPage, workspaceRef }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const customerScope = useDevCustomerScope({
    searchParams,
    setSearchParams,
  })
  const customerReady = customerScope.status === 'ready'
  const deliverySnapshotKey = customerReady
    ? buildDevCustomerSnapshotKey(
        DEV_DELIVERY_SUMMARY_SNAPSHOT_KEY,
        customerScope.customerKey
      )
    : ''
  const requestedViewValues = searchParams.getAll(
    DEV_VERSION_CENTER_VIEW_QUERY_KEY
  )
  const requestedViewCount = requestedViewValues.length
  const requestedView = requestedViewCount === 1 ? requestedViewValues[0] : ''
  const activeView = resolveDevVersionCenterView(requestedView)
  const requestedHistoryActionValues = searchParams.getAll(
    DEV_VERSION_CENTER_HISTORY_FILTER_QUERY_KEYS.action
  )
  const requestedHistoryResultValues = searchParams.getAll(
    DEV_VERSION_CENTER_HISTORY_FILTER_QUERY_KEYS.result
  )
  const requestedHistoryTargetValues = searchParams.getAll(
    DEV_VERSION_CENTER_HISTORY_FILTER_QUERY_KEYS.target
  )
  const requestedHistoryKeywordValues = searchParams.getAll(
    DEV_VERSION_CENTER_HISTORY_FILTER_QUERY_KEYS.keyword
  )
  const requestedHistoryActionCount = requestedHistoryActionValues.length
  const requestedHistoryResultCount = requestedHistoryResultValues.length
  const requestedHistoryTargetCount = requestedHistoryTargetValues.length
  const requestedHistoryKeywordCount = requestedHistoryKeywordValues.length
  const requestedHistoryAction =
    requestedHistoryActionCount === 1 ? requestedHistoryActionValues[0] : ''
  const requestedHistoryResult =
    requestedHistoryResultCount === 1 ? requestedHistoryResultValues[0] : ''
  const requestedHistoryTarget =
    requestedHistoryTargetCount === 1 ? requestedHistoryTargetValues[0] : ''
  const requestedHistoryKeyword =
    requestedHistoryKeywordCount === 1 ? requestedHistoryKeywordValues[0] : ''
  const targetValues = searchParams.getAll('target')
  const isEnvironment = (value) => DEV_DELIVERY_TARGETS.some((target) => target.key === value)
  const requestedTargetCount = targetValues.length
  const requestedTarget = requestedTargetCount === 1 ? targetValues[0] : ''
  const selectedTargetKey = isEnvironment(requestedHistoryTarget) ? requestedHistoryTarget
    : isEnvironment(requestedTarget) ? requestedTarget : 'demo-133'
  const operationHistoryFilters = resolveDevOperationHistoryFilters({
    action: requestedHistoryAction,
    result: requestedHistoryResult,
    target: ['gitlab-release', 'github-release', 'test-133'].includes(requestedHistoryTarget)
      ? requestedHistoryTarget : selectedTargetKey,
    keyword: requestedHistoryKeyword,
  })
  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams)
    let changed = false
    if (requestedTargetCount !== 1 || requestedTarget !== selectedTargetKey) {
      nextParams.set('target', selectedTargetKey)
      changed = true
    }
    if (requestedViewCount !== 1 || requestedView !== activeView) {
      nextParams.set(DEV_VERSION_CENTER_VIEW_QUERY_KEY, activeView)
      changed = true
    }
    for (const [key, value, defaultValue, requestedCount] of [
      [
        DEV_VERSION_CENTER_HISTORY_FILTER_QUERY_KEYS.action,
        operationHistoryFilters.action,
        DEV_VERSION_CENTER_HISTORY_FILTER_ALL,
        requestedHistoryActionCount,
      ],
      [
        DEV_VERSION_CENTER_HISTORY_FILTER_QUERY_KEYS.result,
        operationHistoryFilters.result,
        DEV_VERSION_CENTER_HISTORY_FILTER_ALL,
        requestedHistoryResultCount,
      ],
      [
        DEV_VERSION_CENTER_HISTORY_FILTER_QUERY_KEYS.target,
        operationHistoryFilters.target,
        selectedTargetKey,
        requestedHistoryTargetCount,
      ],
      [
        DEV_VERSION_CENTER_HISTORY_FILTER_QUERY_KEYS.keyword,
        operationHistoryFilters.keyword,
        '',
        requestedHistoryKeywordCount,
      ],
    ]) {
      if (value === defaultValue) {
        if (nextParams.has(key)) {
          nextParams.delete(key)
          changed = true
        }
      } else if (requestedCount !== 1 || nextParams.get(key) !== value) {
        nextParams.set(key, value)
        changed = true
      }
    }
    if (changed) setSearchParams(nextParams, { replace: true })
  }, [
    activeView,
    operationHistoryFilters.action,
    operationHistoryFilters.keyword,
    operationHistoryFilters.result,
    operationHistoryFilters.target,
    requestedView,
    requestedHistoryActionCount,
    requestedHistoryKeywordCount,
    requestedHistoryResultCount,
    requestedHistoryTargetCount,
    requestedViewCount,
    searchParams,
    setSearchParams,
    selectedTargetKey,
    requestedTargetCount,
    requestedTarget,
  ])

  const setSelectedTargetKey = useCallback((target) => {
    if (!DEV_DELIVERY_TARGETS.some((item) => item.key === target)) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('target', target)
    nextParams.delete(DEV_VERSION_CENTER_HISTORY_FILTER_QUERY_KEYS.target)
    nextParams.delete(DEV_VERSION_CENTER_HISTORY_FILTER_QUERY_KEYS.action)
    setHistoryPage(1)
    setSearchParams(nextParams)
  }, [searchParams, setSearchParams, setHistoryPage])

  const selectView = useCallback(
    (nextView) => {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set(
        DEV_VERSION_CENTER_VIEW_QUERY_KEY,
        resolveDevVersionCenterView(nextView)
      )
      setSearchParams(nextParams)
    },
    [searchParams, setSearchParams]
  )

  const updateOperationHistoryFilter = useCallback(
    (key, value, { replace = false } = {}) => {
      const nextParams = new URLSearchParams(searchParams)
      const normalized = String(value || '').trim()
      if (key === DEV_VERSION_CENTER_HISTORY_FILTER_QUERY_KEYS.target &&
        DEV_DELIVERY_TARGETS.some((target) => target.key === normalized)) {
        nextParams.set('target', normalized)
        nextParams.delete(key)
      } else if (!normalized || normalized === DEV_VERSION_CENTER_HISTORY_FILTER_ALL) {
        nextParams.delete(key)
      } else {
        nextParams.set(key, normalized)
      }
      if (key === DEV_VERSION_CENTER_HISTORY_FILTER_QUERY_KEYS.target) {
        nextParams.delete(DEV_VERSION_CENTER_HISTORY_FILTER_QUERY_KEYS.action)
      }
      nextParams.set(
        DEV_VERSION_CENTER_VIEW_QUERY_KEY,
        DEV_VERSION_CENTER_VIEW_HISTORY
      )
      setHistoryPage(1)
      setSearchParams(nextParams, { replace })
    },
    [searchParams, setSearchParams, setHistoryPage]
  )

  const clearOperationHistoryFilters = useCallback(() => {
    const nextParams = new URLSearchParams(searchParams)
    for (const key of Object.values(
      DEV_VERSION_CENTER_HISTORY_FILTER_QUERY_KEYS
    )) {
      if (key === DEV_VERSION_CENTER_HISTORY_FILTER_QUERY_KEYS.target) continue
      nextParams.delete(key)
    }
    nextParams.set(
      DEV_VERSION_CENTER_VIEW_QUERY_KEY,
      DEV_VERSION_CENTER_VIEW_HISTORY
    )
    setHistoryPage(1)
    setSearchParams(nextParams)
  }, [searchParams, setSearchParams, setHistoryPage])

  const openPipelineDetails = useCallback(() => {
    selectView(DEV_VERSION_CENTER_VIEW_PIPELINE)
    window.requestAnimationFrame(() => {
      workspaceRef.current?.scrollIntoView({ block: 'start' })
    })
  }, [selectView, workspaceRef])

  return {
    customerScope,
    customerReady,
    deliverySnapshotKey,
    activeView,
    operationHistoryFilters,
    selectedTargetKey,
    setSelectedTargetKey,
    selectView,
    updateOperationHistoryFilter,
    clearOperationHistoryFilters,
    openPipelineDetails,
  }
}
