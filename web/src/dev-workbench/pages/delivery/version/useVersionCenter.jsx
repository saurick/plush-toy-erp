import { useCallback, useEffect } from 'react'
import { VersionOverview } from './VersionOverview.jsx'
import { DatabaseRebuildPanel } from './DatabaseRebuildPanel.jsx'
import { buildVersionCenterModel } from './buildVersionCenterModel.mjs'
import { useVersionCenterState } from './useVersionCenterState.jsx'
import { buildVersionWorkspace } from './buildVersionWorkspace.jsx'
import { buildOperationColumns } from './buildOperationColumns.jsx'
import { createOperationActions } from './createOperationActions.jsx'
import { buildVersionColumns } from './buildVersionColumns.jsx'
import {
  OPERATION_POLL_INTERVAL_MS,
  POLLING_OPERATION_STATUSES,
  upsertOperation,
} from './shared.jsx'
import { message } from '@/common/utils/antdApp'
import {
  DEV_VERSION_CENTER_HISTORY_PAGE_SIZE,
  DEV_VERSION_CENTER_VERSION_PAGE_SIZE,
  createDeliveryIdempotencyKey,
} from '../../../config/devDelivery.mjs'
import { formatDevSummaryCheckedAt } from '../../../config/devSummarySnapshot.mjs'

export function useVersionCenter() {
  const {
    actionKey,
    activeDeliverySnapshotKeyRef,
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
  } = useVersionCenterState()

  const {
    canDispatch,
    currentTargetRelease,
    currentTargetSha,
    customerTestRebuildEligible,
    customerTestRebuildExplanation,
    dispatchExplanation,
    filteredHistoryOperations,
    hasOpenOperation,
    hasOperationHistoryFilters,
    historyOperations,
    initializationPreflight,
    initializationReady,
    isMutationRunning,
    openOperations,
    operationCachePresentation,
    operationDetailIdempotency,
    operationDetailNeedsRetryCard,
    operationDetailView,
    operationHistoryPresentation,
    operationHistoryState,
    operationReleaseMetricItems,
    operationServerDigest,
    operationTargetMetricItems,
    operationWebDigest,
    operations,
    pollingOperationId,
    publicEntry,
    qualityGateIdentityCurrent,
    releaseDecision,
    releaseVersion,
    repository,
    selectedTargetDefinition,
    strictProof,
    strictSummaryLabel,
    target,
    targetPassed,
    versions,
  } = buildVersionCenterModel({
    actionKey,
    customerReady,
    initialLoading,
    loadError,
    operationDetail,
    operationHistoryFilters,
    qualityGateError,
    qualityGateSummary,
    refreshing,
    selectedTargetKey,
    summary,
    summaryFresh,
  })
  const refreshBusy = initialLoading || refreshing
  const refreshStatusText = initialLoading
    ? '正在读取最新状态'
    : refreshing
      ? `正在后台核对，当前显示 ${formatDevSummaryCheckedAt(checkedAt)} 的结果`
      : summaryFresh
        ? `已核对 ${formatDevSummaryCheckedAt(checkedAt)}`
        : summary
          ? `显示 ${formatDevSummaryCheckedAt(checkedAt)} 的上次结果，写操作暂不可用`
          : '尚未取得可用状态'

  useEffect(() => {
    const pageCount = Math.max(
      1,
      Math.ceil(versions.length / DEV_VERSION_CENTER_VERSION_PAGE_SIZE)
    )
    setVersionPage((current) => Math.min(current, pageCount))
  }, [versions.length, setVersionPage])

  useEffect(() => {
    const pageCount = Math.max(
      1,
      Math.ceil(
        filteredHistoryOperations.length / DEV_VERSION_CENTER_HISTORY_PAGE_SIZE
      )
    )
    setHistoryPage((current) => Math.min(current, pageCount))
  }, [filteredHistoryOperations.length, setHistoryPage])

  const changeTablePage = useCallback((setPage, tableRef, nextPage) => {
    setPage(nextPage)
    window.requestAnimationFrame(() => {
      tableRef.current?.scrollIntoView({ block: 'start' })
    })
  }, [])

  useEffect(() => {
    if (!pollingOperationId) {
      setOperationPollError('')
      return undefined
    }

    let cancelled = false
    let timer = 0
    const poll = async () => {
      try {
        const operation = await client.operation(pollingOperationId)
        if (cancelled) return
        setOperationPollError('')
        updateSummary((current) =>
          current
            ? {
                ...current,
                operations: upsertOperation(
                  current.operations || [],
                  operation
                ),
              }
            : current
        )
        if (!POLLING_OPERATION_STATUSES.has(operation.status)) {
          await refresh()
          return
        }
      } catch (error) {
        if (cancelled) return
        setOperationPollError(error?.message || '操作状态读取暂时失败')
      }
      if (!cancelled) {
        timer = window.setTimeout(poll, OPERATION_POLL_INTERVAL_MS)
      }
    }

    timer = window.setTimeout(poll, OPERATION_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    client,
    pollingOperationId,
    refresh,
    updateSummary,
    setOperationPollError,
  ])

  const submitRelease = async () => {
    if (!repository || !summaryFresh) return
    const succeeded = await performAction(
      'dispatch-release',
      'dispatch-release',
      {
        gitSha: repository.commit,
        version: releaseVersion,
        idempotencyKey: createDeliveryIdempotencyKey('release'),
      }
    )
    if (succeeded) setReleaseModalOpen(false)
  }

  const openOperationDetail = async (operation, trigger) => {
    const requestedSnapshotKey = deliverySnapshotKey
    if (
      !summaryInCurrentScope ||
      activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey
    ) {
      return
    }
    const requestId = operationDetailRequestRef.current + 1
    operationDetailRequestRef.current = requestId
    clearOperationDetailFocusRestoreTimer()
    operationDetailTriggerRef.current = trigger
    setOperationDetail(operation)
    setOperationDetailLoading(true)
    try {
      const nextOperation = await client.operation(operation.id)
      if (
        operationDetailRequestRef.current !== requestId ||
        activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey
      ) {
        return
      }
      setOperationDetail(nextOperation)
    } catch (error) {
      if (
        operationDetailRequestRef.current !== requestId ||
        activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey
      ) {
        return
      }
      message.error(error?.message || '操作详情读取失败')
    } finally {
      if (
        operationDetailRequestRef.current === requestId &&
        activeDeliverySnapshotKeyRef.current === requestedSnapshotKey
      ) {
        setOperationDetailLoading(false)
      }
    }
  }

  const versionColumns = buildVersionColumns({
    actionKey,
    currentTargetRelease,
    currentTargetSha,
    hasOpenOperation,
    initializationReady,
    isMutationRunning,
    performAction,
    selectedTargetDefinition,
    selectedTargetKey,
    summaryFresh,
    target,
    targetPassed,
  })

  const renderOperationActions = createOperationActions({
    actionKey,
    hasOpenOperation,
    isMutationRunning,
    openOperationDetail,
    performAction,
    setConfirmOperation,
    setConfirmationText,
    summaryFresh,
  })

  const operationColumns = buildOperationColumns({ renderOperationActions })

  const versionOverview = (
    <VersionOverview
      currentTargetSha={currentTargetSha}
      deliveryProviderName={deliveryProviderName}
      initializationPreflight={initializationPreflight}
      initializationReady={initializationReady}
      publicEntry={publicEntry}
      qualityGateIdentityCurrent={qualityGateIdentityCurrent}
      releaseDecision={releaseDecision}
      repository={repository}
      selectedTargetDefinition={selectedTargetDefinition}
      strictProof={strictProof}
      strictSummaryLabel={strictSummaryLabel}
      target={target}
      targetPassed={targetPassed}
      versions={versions}
    />
  )

  const databaseRebuildPanel = (
    <DatabaseRebuildPanel
      actionKey={actionKey}
      currentTargetRelease={currentTargetRelease}
      currentTargetSha={currentTargetSha}
      customerTestRebuildEligible={customerTestRebuildEligible}
      customerTestRebuildExplanation={customerTestRebuildExplanation}
      performAction={performAction}
      selectedTargetKey={selectedTargetKey}
    />
  )

  const workspaceItems = buildVersionWorkspace({
    loadError,
    changeTablePage,
    clearOperationHistoryFilters,
    databaseRebuildPanel,
    deliveryProviderName,
    filteredHistoryOperations,
    hasOperationHistoryFilters,
    historyOperations,
    historyPage,
    historyTableRef,
    initialLoading,
    openPipelineDetails,
    operationColumns,
    operationHistoryFilters,
    operationHistoryPresentation,
    operationHistoryState,
    operations,
    setHistoryPage,
    setVersionPage,
    summary,
    updateOperationHistoryFilter,
    versionColumns,
    versionOverview,
    versionPage,
    versionTableRef,
    versions,
  })
  return {
    actionKey,
    activeView,
    canDispatch,
    clearOperationDetailFocusRestoreTimer,
    closeOperationDetail,
    confirmOperation,
    confirmationText,
    customerReady,
    customerScope,
    deliveryProviderName,
    dispatchExplanation,
    isMutationRunning,
    loadError,
    openOperations,
    operationCachePresentation,
    operationDetail,
    operationDetailIdempotency,
    operationDetailLoading,
    operationDetailNeedsRetryCard,
    operationDetailView,
    operationPollError,
    operationReleaseMetricItems,
    operationServerDigest,
    operationTargetMetricItems,
    operationWebDigest,
    performAction,
    refresh,
    refreshBusy,
    refreshStatusText,
    releaseModalOpen,
    releaseVersion,
    renderOperationActions,
    repository,
    restoreOperationDetailTriggerFocus,
    selectView,
    selectedTargetDefinition,
    selectedTargetKey,
    setConfirmOperation,
    setConfirmationText,
    setReleaseModalOpen,
    setSelectedTargetKey,
    submitRelease,
    summary,
    summaryFresh,
    workspaceItems,
    workspaceRef,
  }
}
