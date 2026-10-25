import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useVersionCenterRoute } from './useVersionCenterRoute.jsx'
import { deliveryActionErrorMessage, deliveryReadErrorMessage } from '../readError.mjs'
import { OPERATION_DETAIL_FOCUS_RESTORE_FALLBACK_MS } from './shared.jsx'
import { message } from '@/common/utils/antdApp'

import { createDevDeliveryClient } from '../../../config/devDelivery.mjs'
import {
  loadDevSummarySnapshot,
  readDevSummarySnapshot,
  updateDevSummarySnapshot,
} from '../../../config/devSummarySnapshot.mjs'
import { createDevQualityGateClient } from '../../../config/devQualityGates.mjs'

export function useVersionCenterState() {
  const [historyPage, setHistoryPage] = useState(1)
  const workspaceRef = useRef(null)
  const {
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
  } = useVersionCenterRoute({ setHistoryPage, workspaceRef })
  const client = useMemo(() => createDevDeliveryClient(), [])
  const qualityGateClient = useMemo(() => createDevQualityGateClient(), [])
  const initialSnapshot = useMemo(
    () =>
      deliverySnapshotKey ? readDevSummarySnapshot(deliverySnapshotKey) : null,
    [deliverySnapshotKey]
  )
  const [storedSummary, setStoredSummary] = useState(
    initialSnapshot?.summary || null
  )
  const [summarySnapshotKey, setSummarySnapshotKey] =
    useState(deliverySnapshotKey)
  const summaryRef = useRef(initialSnapshot?.summary || null)
  const summarySnapshotKeyRef = useRef(deliverySnapshotKey)
  const activeDeliverySnapshotKeyRef = useRef(deliverySnapshotKey)
  activeDeliverySnapshotKeyRef.current = deliverySnapshotKey
  const [initialLoading, setInitialLoading] = useState(
    Boolean(deliverySnapshotKey && !initialSnapshot)
  )
  const [refreshing, setRefreshing] = useState(false)
  const [storedSummaryFresh, setStoredSummaryFresh] = useState(false)
  const [checkedAt, setCheckedAt] = useState(initialSnapshot?.checkedAt || '')
  const [actionKey, setActionKey] = useState('')
  const [loadError, setLoadError] = useState('')
  const [releaseModalOpen, setReleaseModalOpen] = useState(false)
  const [confirmOperation, setConfirmOperation] = useState(null)
  const [confirmationText, setConfirmationText] = useState('')
  const [operationDetail, setOperationDetail] = useState(null)
  const [operationDetailLoading, setOperationDetailLoading] = useState(false)
  const [operationPollError, setOperationPollError] = useState('')
  const [versionPage, setVersionPage] = useState(1)
  const [qualityGateSummary, setQualityGateSummary] = useState(null)
  const [qualityGateError, setQualityGateError] = useState('')
  const mutationInFlightRef = useRef(false)
  const refreshRequestRef = useRef(0)
  const refreshAbortRef = useRef(null)
  const qualityGateRequestRef = useRef(0)
  const operationDetailRequestRef = useRef(0)
  const operationDetailAbortRef = useRef(null)
  const activeOperationScopeRef = useRef('')
  activeOperationScopeRef.current = `${deliverySnapshotKey}:${selectedTargetKey}:${operationHistoryFilters.target}`
  const versionTableRef = useRef(null)
  const historyTableRef = useRef(null)
  const operationDetailTriggerRef = useRef(null)
  const operationDetailFocusRestoreTimerRef = useRef(null)
  const summaryInCurrentScope =
    customerReady && summarySnapshotKey === deliverySnapshotKey
  const summary = summaryInCurrentScope ? storedSummary : null
  const summaryFresh = summaryInCurrentScope && storedSummaryFresh
  const deliveryProviderName =
    summary?.boundaries?.provider === 'github' ? 'GitHub 历史只读' : 'GitLab'

  const restoreOperationDetailTriggerFocus = useCallback(() => {
    const trigger = operationDetailTriggerRef.current
    const { activeElement } = document
    if (
      !trigger?.isConnected ||
      (activeElement &&
        activeElement !== document.body &&
        activeElement !== trigger &&
        activeElement.isConnected)
    ) {
      return false
    }
    trigger.focus({ preventScroll: true })
    if (document.activeElement !== trigger) return false
    operationDetailTriggerRef.current = null
    return true
  }, [])

  const clearOperationDetailFocusRestoreTimer = useCallback(() => {
    if (operationDetailFocusRestoreTimerRef.current !== null) {
      window.clearTimeout(operationDetailFocusRestoreTimerRef.current)
      operationDetailFocusRestoreTimerRef.current = null
    }
  }, [])

  const closeOperationDetail = useCallback(() => {
    operationDetailRequestRef.current += 1
    operationDetailAbortRef.current?.abort()
    setOperationDetail(null)
    clearOperationDetailFocusRestoreTimer()
    // 快速关闭可能打断 Drawer 动画回调，仍在关闭截止后恢复原触发点。
    operationDetailFocusRestoreTimerRef.current = window.setTimeout(() => {
      operationDetailFocusRestoreTimerRef.current = null
      restoreOperationDetailTriggerFocus()
      operationDetailTriggerRef.current = null
    }, OPERATION_DETAIL_FOCUS_RESTORE_FALLBACK_MS)
  }, [
    clearOperationDetailFocusRestoreTimer,
    restoreOperationDetailTriggerFocus,
  ])

  const cancelOperationDetailRead = useCallback(() => {
    operationDetailAbortRef.current?.abort()
  }, [])

  useEffect(() => {
    operationDetailRequestRef.current += 1
    cancelOperationDetailRead()
    setOperationDetail(null)
    setOperationDetailLoading(false)
    return cancelOperationDetailRead
  }, [selectedTargetKey, operationHistoryFilters.target, cancelOperationDetailRead])

  useEffect(
    () => () => {
      clearOperationDetailFocusRestoreTimer()
    },
    [clearOperationDetailFocusRestoreTimer]
  )

  const updateSummary = useCallback(
    (update) => {
      if (
        !deliverySnapshotKey ||
        activeDeliverySnapshotKeyRef.current !== deliverySnapshotKey ||
        summarySnapshotKeyRef.current !== deliverySnapshotKey
      ) {
        return summaryRef.current
      }
      const { current } = summaryRef
      const next = typeof update === 'function' ? update(current) : update
      if (!next) return current
      summaryRef.current = next
      updateDevSummarySnapshot(deliverySnapshotKey, () => next)
      setStoredSummary(next)
      return next
    },
    [deliverySnapshotKey]
  )

  const refreshQualityGate = useCallback(
    async (requestedSnapshotKey) => {
      if (
        !requestedSnapshotKey ||
        activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey
      ) {
        return false
      }
      const requestId = qualityGateRequestRef.current + 1
      qualityGateRequestRef.current = requestId
      try {
        const next = await qualityGateClient.summary()
        if (
          qualityGateRequestRef.current !== requestId ||
          activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey
        ) {
          return false
        }
        setQualityGateSummary(next)
        setQualityGateError('')
        return true
      } catch {
        if (
          qualityGateRequestRef.current !== requestId ||
          activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey
        ) {
          return false
        }
        setQualityGateError('严格门禁摘要暂时不可用')
        return false
      }
    },
    [qualityGateClient]
  )

  const refresh = useCallback(async () => {
    const requestedSnapshotKey = deliverySnapshotKey
    if (
      !customerReady ||
      !requestedSnapshotKey ||
      activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey
    ) {
      return false
    }
    refreshQualityGate(requestedSnapshotKey)
    const requestId = refreshRequestRef.current + 1
    refreshRequestRef.current = requestId
    const hasVisibleSummary = Boolean(
      summarySnapshotKeyRef.current === requestedSnapshotKey &&
      summaryRef.current
    )
    setInitialLoading(!hasVisibleSummary)
    setRefreshing(hasVisibleSummary)
    setStoredSummaryFresh(false)
    setLoadError('')
    refreshAbortRef.current?.abort()
    const controller = new AbortController()
    refreshAbortRef.current = controller
    try {
      const snapshot = await loadDevSummarySnapshot(requestedSnapshotKey,
        ({ signal }) => client.summary({ signal }),
        { signal: controller.signal }
      )
      if (
        controller.signal.aborted ||
        refreshRequestRef.current !== requestId ||
        activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey
      ) {
        return false
      }
      summarySnapshotKeyRef.current = requestedSnapshotKey
      summaryRef.current = snapshot.summary
      setSummarySnapshotKey(requestedSnapshotKey)
      setStoredSummary(snapshot.summary)
      setCheckedAt(snapshot.checkedAt)
      setStoredSummaryFresh(true)
      return true
    } catch (error) {
      if (
        controller.signal.aborted ||
        refreshRequestRef.current !== requestId ||
        activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey
      ) {
        return false
      }
      setLoadError(deliveryReadErrorMessage(error, '读取发布状态'))
      return false
    } finally {
      if (
        refreshRequestRef.current === requestId &&
        activeDeliverySnapshotKeyRef.current === requestedSnapshotKey
      ) {
        setInitialLoading(false)
        setRefreshing(false)
      }
    }
  }, [client, customerReady, deliverySnapshotKey, refreshQualityGate])

  useEffect(() => {
    refreshRequestRef.current += 1
    qualityGateRequestRef.current += 1
    operationDetailRequestRef.current += 1
    const snapshot = deliverySnapshotKey
      ? readDevSummarySnapshot(deliverySnapshotKey)
      : null
    summarySnapshotKeyRef.current = deliverySnapshotKey
    summaryRef.current = snapshot?.summary || null
    setSummarySnapshotKey(deliverySnapshotKey)
    setStoredSummary(snapshot?.summary || null)
    setCheckedAt(snapshot?.checkedAt || '')
    setStoredSummaryFresh(false)
    setLoadError('')
    setQualityGateSummary(null)
    setQualityGateError('')
    setOperationPollError('')
    setOperationDetail(null)
    setOperationDetailLoading(false)
    setReleaseModalOpen(false)
    setConfirmOperation(null)
    setConfirmationText('')

    if (!customerReady) {
      setInitialLoading(false)
      setRefreshing(false)
      return undefined
    }
    refresh()
    return () => {
      refreshAbortRef.current?.abort()
      refreshRequestRef.current += 1
      qualityGateRequestRef.current += 1
      operationDetailRequestRef.current += 1
    }
  }, [customerReady, deliverySnapshotKey, refresh])

  const performAction = useCallback(
    async (key, action, payload) => {
      const requestedSnapshotKey = deliverySnapshotKey
      if (
        !customerReady ||
        !requestedSnapshotKey ||
        activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey ||
        !summaryFresh ||
        mutationInFlightRef.current
      ) {
        return false
      }
      mutationInFlightRef.current = true
      setStoredSummaryFresh(false)
      setActionKey(key)
      try {
        await client.action(action, payload)
        if (activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey) {
          return false
        }
        message.success(
          action === 'sync-gitlab-record'
            ? 'GitLab 记录已补齐，未执行部署'
            : action === 'dispatch-release'
            ? `${deliveryProviderName}发布任务已登记`
            : action === 'retry-operation'
              ? '已创建关联的新尝试'
              : action === 'prepare-promotion'
                ? '部署准备结果已登记'
                : action === 'prepare-database-rebuild'
                  ? '测试数据清空重建资格结果已登记'
                  : action === 'prepare-rollback'
                    ? '回滚资格结果已登记'
                    : action === 'execute-database-rebuild'
                      ? '测试数据清空重建执行器已启动，请按操作记录跟踪'
                      : '部署执行器已启动，请按操作记录跟踪'
        )
        await refresh()
        return true
      } catch (error) {
        if (activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey) {
          return false
        }
        message.error(deliveryActionErrorMessage(error))
        await refresh()
        return false
      } finally {
        mutationInFlightRef.current = false
        setActionKey('')
      }
    },
    [
      client,
      customerReady,
      deliveryProviderName,
      deliverySnapshotKey,
      refresh,
      summaryFresh,
    ]
  )
  return {
    actionKey,
    activeDeliverySnapshotKeyRef,
    activeOperationScopeRef,
    activeView,
    checkedAt,
    clearOperationDetailFocusRestoreTimer,
    clearOperationHistoryFilters,
    client,
    closeOperationDetail,
    confirmOperation,
    confirmationText,
    customerReady,
    customerScope,
    deliveryProviderName,
    deliverySnapshotKey,
    historyPage,
    historyTableRef,
    initialLoading,
    loadError,
    openPipelineDetails,
    operationDetail,
    operationDetailLoading,
    operationDetailRequestRef,
    operationDetailAbortRef,
    operationDetailTriggerRef,
    operationHistoryFilters,
    operationPollError,
    performAction,
    qualityGateError,
    qualityGateSummary,
    refresh,
    refreshing,
    releaseModalOpen,
    restoreOperationDetailTriggerFocus,
    selectView,
    selectedTargetKey,
    setConfirmOperation,
    setConfirmationText,
    setHistoryPage,
    setOperationDetail,
    setOperationDetailLoading,
    setOperationPollError,
    setReleaseModalOpen,
    setSelectedTargetKey,
    setVersionPage,
    summary,
    summaryFresh,
    summaryInCurrentScope,
    updateOperationHistoryFilter,
    updateSummary,
    versionPage,
    versionTableRef,
    workspaceRef,
  }
}
