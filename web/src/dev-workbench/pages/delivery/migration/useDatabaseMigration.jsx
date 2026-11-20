import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MigrationPath } from './MigrationPath.jsx'
import { buildMigrationColumns } from './buildMigrationColumns.jsx'
import {
  MIGRATION_VIEW_ITEMS,
  OPERATION_POLL_INTERVAL_MS,
  DATABASE_MIGRATION_SNAPSHOT_KEY,
  issueText,
  upsertOperation,
  runtimePresentation,
  toolReadinessPresentation,
} from './shared.jsx'
import { message } from '@/common/utils/antdApp'
import {
  createDevDatabaseMigrationClient,
  databaseMigrationPathStatuses,
  databaseMigrationPreparationAvailable,
  databaseMigrationUpgradePresentation,
  isDatabaseMigrationOperationPolling,
  selectActiveDatabaseMigrationOperation,
  selectDatabaseMigrationPathOperation,
} from '../../../config/devDatabaseMigration.mjs'
import {
  formatDevSummaryCheckedAt,
  loadDevSummarySnapshot,
  readDevSummarySnapshot,
  updateDevSummarySnapshot,
} from '../../../config/devSummarySnapshot.mjs'
import { isDevDatabaseMigrationRecoveryActive } from '../../../config/devRuntimeRecovery.mjs'

export function useDatabaseMigration() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeView = MIGRATION_VIEW_ITEMS.some(
    (item) => item.value === searchParams.get('view')
  )
    ? searchParams.get('view')
    : 'migration'
  const selectView = (value) =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('view', value)
      return next
    })
  const recoveryActive = isDevDatabaseMigrationRecoveryActive()
  const client = useMemo(() => createDevDatabaseMigrationClient(), [])
  const initialSnapshot = useMemo(
    () => readDevSummarySnapshot(DATABASE_MIGRATION_SNAPSHOT_KEY),
    []
  )
  const [summary, setSummary] = useState(initialSnapshot?.summary || null)
  const summaryRef = useRef(initialSnapshot?.summary || null)
  const [initialLoading, setInitialLoading] = useState(!initialSnapshot)
  const [refreshing, setRefreshing] = useState(false)
  const [summaryFresh, setSummaryFresh] = useState(false)
  const [checkedAt, setCheckedAt] = useState(initialSnapshot?.checkedAt || '')
  const [loadError, setLoadError] = useState('')
  const [actionKey, setActionKey] = useState('')
  const [confirmationOperation, setConfirmationOperation] = useState(null)
  const [confirmationText, setConfirmationText] = useState('')
  const [operationDetail, setOperationDetail] = useState(null)
  const mutationInFlightRef = useRef(false)
  const refreshRequestRef = useRef(0)

  const updateSummary = useCallback((update) => {
    const { current } = summaryRef
    const next = typeof update === 'function' ? update(current) : update
    if (!next) return current
    summaryRef.current = next
    updateDevSummarySnapshot(DATABASE_MIGRATION_SNAPSHOT_KEY, () => next)
    setSummary(next)
    return next
  }, [])

  const refresh = useCallback(async () => {
    const requestId = refreshRequestRef.current + 1
    refreshRequestRef.current = requestId
    const hasVisibleSummary = Boolean(summaryRef.current)
    setInitialLoading(!hasVisibleSummary)
    setRefreshing(hasVisibleSummary)
    setSummaryFresh(false)
    setLoadError('')
    try {
      const snapshot = await loadDevSummarySnapshot(
        DATABASE_MIGRATION_SNAPSHOT_KEY,
        () => client.summary()
      )
      if (refreshRequestRef.current !== requestId) return false
      summaryRef.current = snapshot.summary
      setSummary(snapshot.summary)
      setCheckedAt(snapshot.checkedAt)
      setSummaryFresh(true)
      return true
    } catch (error) {
      if (refreshRequestRef.current !== requestId) return false
      setLoadError(error?.message || '数据库迁移状态读取失败')
      return false
    } finally {
      if (refreshRequestRef.current === requestId) {
        setInitialLoading(false)
        setRefreshing(false)
      }
    }
  }, [client])

  useEffect(() => {
    refresh()
    return () => {
      refreshRequestRef.current += 1
    }
  }, [refresh])

  const operations = summary?.operations || []
  const activeOperation = selectActiveDatabaseMigrationOperation(operations)
  const pollingOperation = operations.find((operation) =>
    isDatabaseMigrationOperationPolling(operation.status)
  )

  useEffect(() => {
    if (!pollingOperation) return undefined
    let cancelled = false
    let timer = 0
    const poll = async () => {
      try {
        const operation = await client.operation(pollingOperation.id)
        if (cancelled) return
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
        if (!isDatabaseMigrationOperationPolling(operation.status)) {
          await refresh()
          return
        }
      } catch (error) {
        if (!cancelled) {
          message.error(error?.message || '迁移操作状态读取失败')
        }
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
  }, [client, pollingOperation, refresh, updateSummary])

  const performAction = async (key, action) => {
    if (
      !summaryFresh ||
      summaryRef.current?.readOnly === true ||
      mutationInFlightRef.current
    ) {
      return null
    }
    mutationInFlightRef.current = true
    setSummaryFresh(false)
    setActionKey(key)
    try {
      const operation = await client.act(action)
      updateSummary((current) =>
        current
          ? {
              ...current,
              operations: upsertOperation(current.operations || [], operation),
            }
          : current
      )
      if (['blocked', 'failed', 'not_proven'].includes(operation.status)) {
        message.warning(issueText(operation.issues) || operation.message)
      } else {
        message.success(
          operation.status === 'passed'
            ? operation.message
            : action.action === 'prepare'
              ? '已开始检查、计划与备份恢复验证'
              : action.action === 'restart'
                ? '已开始重启本地后端'
                : '已接受确认，开始升级数据库'
        )
      }
      refresh()
      return operation
    } catch (error) {
      message.error(error?.message || '数据库迁移操作提交失败')
      await refresh()
      return null
    } finally {
      mutationInFlightRef.current = false
      setActionKey('')
    }
  }

  const target = summary?.target
  const runtime = summary?.runtime
  const tools = summary?.tools
  const readOnly = summary?.readOnly === true
  const runtimeState = runtimePresentation(runtime)
  const toolState = toolReadinessPresentation(tools)
  const pendingFiles = target?.pendingFiles
  const isLatest = pendingFiles === 0
  const pathOperation = selectDatabaseMigrationPathOperation(summary)
  const pathStatuses = databaseMigrationPathStatuses(pathOperation)
  const upgradeState = databaseMigrationUpgradePresentation(summary)
  const hasRunningOperation = operations.some((operation) =>
    ['preparing', 'applying', 'restarting'].includes(operation.status)
  )
  const readyOperation =
    activeOperation?.status === 'ready' ? activeOperation : null
  const canPrepare =
    summaryFresh && !actionKey && databaseMigrationPreparationAvailable(summary)
  const canRestart =
    summaryFresh &&
    !readOnly &&
    !actionKey &&
    summary?.status === 'success' &&
    (isLatest || runtime?.bundleId) &&
    !runtime?.available &&
    !hasRunningOperation
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

  const columns = buildMigrationColumns({ setOperationDetail })

  const migrationFlow = (
    <MigrationPath pathOperation={pathOperation} pathStatuses={pathStatuses} />
  )
  return {
    actionKey,
    activeOperation,
    activeView,
    canPrepare,
    canRestart,
    columns,
    confirmationOperation,
    confirmationText,
    hasRunningOperation,
    initialLoading,
    isLatest,
    loadError,
    migrationFlow,
    operationDetail,
    operations,
    pathOperation,
    pendingFiles,
    performAction,
    readOnly,
    readyOperation,
    recoveryActive,
    refresh,
    refreshBusy,
    refreshStatusText,
    runtime,
    runtimeState,
    selectView,
    setConfirmationOperation,
    setConfirmationText,
    setOperationDetail,
    summary,
    summaryFresh,
    target,
    toolState,
    tools,
    upgradeState,
  }
}
