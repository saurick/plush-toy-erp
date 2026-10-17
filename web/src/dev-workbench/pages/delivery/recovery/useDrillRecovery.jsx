import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { deliveryReadErrorMessage } from '../readError.mjs'
import { RECOVERY_VIEWS } from './shared.jsx'
import {
  buildDevCustomerScopedRoute,
  buildDevCustomerSnapshotKey,
} from '../../../config/devCustomerScope.mjs'
import {
  DEV_DELIVERY_SUMMARY_SNAPSHOT_KEY,
  createDevDeliveryClient,
} from '../../../config/devDelivery.mjs'
import { buildDevRecoveryOverview } from '../../../config/devRecovery.mjs'
import {
  formatDevSummaryCheckedAt,
  loadDevSummarySnapshot,
  readDevSummarySnapshot,
} from '../../../config/devSummarySnapshot.mjs'
import useDevCustomerScope from '../../../hooks/useDevCustomerScope.mjs'

export function useDrillRecovery() {
  const navigate = useNavigate()
  const [selectedDrillKey, setSelectedDrillKey] = useState('')
  const drillTriggerRef = useRef(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedViews = searchParams.getAll('view')
  const activeView =
    requestedViews.length === 1 &&
    RECOVERY_VIEWS.some((item) => item.value === requestedViews[0])
      ? requestedViews[0]
      : 'security'
  const selectView = (value) =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('view', value)
      return next
    })
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
  const client = useMemo(() => createDevDeliveryClient(), [])
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
  const [checkedAt, setCheckedAt] = useState(initialSnapshot?.checkedAt || '')
  const [loading, setLoading] = useState(
    Boolean(deliverySnapshotKey && !initialSnapshot)
  )
  const [refreshing, setRefreshing] = useState(false)
  const [storedSummaryFresh, setStoredSummaryFresh] = useState(false)
  const [loadError, setLoadError] = useState('')
  const requestRef = useRef(0)
  const summaryInCurrentScope =
    customerReady && summarySnapshotKey === deliverySnapshotKey
  const summary = summaryInCurrentScope ? storedSummary : null
  const fresh = summaryInCurrentScope && storedSummaryFresh

  const refresh = useCallback(async () => {
    const requestedSnapshotKey = deliverySnapshotKey
    if (
      !customerReady ||
      !requestedSnapshotKey ||
      activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey
    ) {
      return false
    }
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    const hasVisibleSummary = Boolean(
      summarySnapshotKeyRef.current === requestedSnapshotKey &&
      summaryRef.current
    )
    setLoading(!hasVisibleSummary)
    setRefreshing(hasVisibleSummary)
    setStoredSummaryFresh(false)
    setLoadError('')
    try {
      const snapshot = await loadDevSummarySnapshot(requestedSnapshotKey, () =>
        client.summary()
      )
      if (
        requestRef.current !== requestId ||
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
        requestRef.current !== requestId ||
        activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey
      ) {
        return false
      }
      setLoadError(deliveryReadErrorMessage(error, '读取恢复证据'))
      return false
    } finally {
      if (
        requestRef.current === requestId &&
        activeDeliverySnapshotKeyRef.current === requestedSnapshotKey
      ) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [client, customerReady, deliverySnapshotKey])

  useEffect(() => {
    requestRef.current += 1
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

    if (!customerReady) {
      setLoading(false)
      setRefreshing(false)
      return undefined
    }
    refresh()
    return () => {
      requestRef.current += 1
    }
  }, [customerReady, deliverySnapshotKey, refresh])

  const navigateWithinCustomerScope = useCallback(
    (route) => {
      if (!customerReady) return
      navigate(buildDevCustomerScopedRoute(route, customerScope.customerKey))
    },
    [customerReady, customerScope.customerKey, navigate]
  )

  const overview = useMemo(
    () => buildDevRecoveryOverview(summary || {}),
    [summary]
  )
  const targetHealthy = overview.targetStatus === 'passed'
  const publicHealthy = overview.publicEntry?.status === 'passed'
  const runtimeProven = Boolean(overview.currentSha)
  const recoveryReady = targetHealthy && publicHealthy && runtimeProven
  const statusText = !customerReady
    ? '请选择已登记甲方'
    : loading
      ? '正在读取最新状态'
      : refreshing
        ? `正在后台核对，当前显示 ${formatDevSummaryCheckedAt(checkedAt)} 的结果`
        : fresh
          ? `交付证据已读取 ${formatDevSummaryCheckedAt(checkedAt)}`
          : checkedAt
            ? `显示 ${formatDevSummaryCheckedAt(checkedAt)} 的上次结果`
            : '尚未取得状态'
  return {
    activeView,
    customerReady,
    customerScope,
    drillTriggerRef,
    loadError,
    loading,
    navigateWithinCustomerScope,
    overview,
    publicHealthy,
    recoveryReady,
    refresh,
    refreshing,
    runtimeProven,
    selectView,
    selectedDrillKey,
    setSelectedDrillKey,
    statusText,
    summary,
  }
}
