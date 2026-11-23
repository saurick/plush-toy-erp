import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Alert, Button, Spin } from 'antd'
import { RightOutlined } from '@ant-design/icons'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import SlidingTabList from '@/common/components/navigation/SlidingTabList'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  isAuthFailureCode,
  isAdminSessionUnavailableCode,
  RpcErrorCode,
} from '@/common/consts/errorCodes'
import { listBusinessProgress } from '../../api/businessProgressApi.mjs'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator'
import BusinessProgressFilterFields, { ProgressDueFilters, ProgressBlockedFilter, ProgressDeliveryFilters, ProgressDeliverySwitch } from '../../components/business-visualizations/BusinessProgressFilters.jsx'
import BusinessProgressDrawer from '../../components/business-visualizations/BusinessProgressDrawer'
import useBusinessStatistics from '../../components/business-visualizations/useBusinessStatistics.jsx'
import SalesDeliveryWorkspace from '../../components/sales-orders/SalesDeliveryWorkspace.jsx'
import { useSalesDeliveryWorkspace } from '../../components/sales-orders/useSalesDeliveryWorkspace.js'
import { progressBoardViews, scopeProgressBoardQuery } from '../../utils/progressBoardAccess.mjs'
import { canOpenRelatedDocumentPath } from '../../utils/relatedDocumentNavigation.mjs'
import WorkflowTaskCard from '../../components/workflow/WorkflowTaskCard.jsx'
import { ProgressIdentity, ProgressDue, ProgressDelivery, ProgressAttention, ProgressDocumentNumber, ProgressLineProduct, ProgressLineRemaining, ProgressLineStatus } from '../../components/business-visualizations/ProgressCompactContent.jsx'
import {
  progressQueryFromURL,
  progressExtraFilters,
  progressFilterCount,
  progressFilterReset,
  withProgressFilters,
} from '../../utils/businessProgress.mjs'
import { getWorkflowTaskOwnerRoleLabel } from '../../utils/workflowTaskBoard.mjs'
import {
  mobileProgressDefaultView,
  mobileProgressTaskSummary,
  normalizeMobileProgressQuery,
  readMobileProgressState,
} from '../utils/mobileProgress.mjs'
import MobileTaskPullRefresh from './MobileTaskPullRefresh'
import MobileScrollEdge from './MobileScrollEdge.jsx'
import MobileFilterPopover from './MobileFilterPopover'
import MobileSearchInput from '@/common/components/navigation/MobileSearchInput'
import MobileBackToTop from '@/common/components/scroll/MobileBackToTop'
import HorizontalScroll from '@/common/components/scroll/HorizontalScroll'
import { usePageLoadFeedback } from '../../components/PageLoadFeedback.jsx'
import '../../styles/app/progress-board.css'
import '../mobileProgress.css'

const roleLabel = (key) =>
  getWorkflowTaskOwnerRoleLabel({ owner_role_key: key })
const timeLabel = (value) =>
  value
    ? new Date(value).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : ''

export default function MobileProgressPanel({
  active,
  access,
  scopeKey,
  roleKey,
  adminProfile,
  onOpenTask,
  onOpenRelatedTasks,
}) {
  const initial = useRef(
    readMobileProgressState(
      window.history.state,
      scopeKey,
      mobileProgressDefaultView(roleKey, access)
    )
  ).current
  const [values, setValues] = useState(initial.query)
  const [statisticsParams, setStatisticsParams] = useState(() => new URLSearchParams(initial.statisticsQuery))
  const updateStatisticsParams = useCallback((updater) => setStatisticsParams(updater), [])
  const queriesRef = useRef(initial.queries)
  const [selection, setSelection] = useState(initial.selection)
  const [suppressDetailOpenMotion, setSuppressDetailOpenMotion] = useState(
    Boolean(initial.selection)
  )
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [loadMoreError, setLoadMoreError] = useState('')
  const [endReached, setEndReached] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filterTriggerRef = useRef(null)
  const scrollRef = useRef(null)
  const loadMoreRef = useRef(null)
  const loadMorePending = useRef(false)
  const restoreScroll = useRef(initial.scrollTop)
  const scrollHistoryTimer = useRef(null)
  const begin = useLatestRequestCoordinator()
  const views = progressBoardViews(access)
  const view = views.some(({ value }) => value === values.view) ? values.view : mobileProgressDefaultView(roleKey, access)
  const viewingList = view === 'orders' || view === 'production'
  const listActive = active && viewingList
  const deliveryWorkspace = useSalesDeliveryWorkspace(adminProfile, active && access.sales)
  const scopedOrderID = active && selection?.view === 'orders' && access.scopedDelivery ? selection.id : null
  const { openProgress, close: closeDelivery } = deliveryWorkspace
  useEffect(() => {
    if (scopedOrderID) openProgress(scopedOrderID)
    else closeDelivery()
  }, [scopedOrderID, openProgress, closeDelivery])
  const query = useMemo(
    () => scopeProgressBoardQuery(progressQueryFromURL(new URLSearchParams(values)), view, access),
    [access, values, view]
  )
  const queryKey = JSON.stringify(query)
  const lines = query.display === 'lines'
  const data =
    result?.key === queryKey && result?.scope === scopeKey ? result.data : null
  const hasMore = Boolean(data && !endReached && data.rows.length < data.total)
  const resultRef = useRef(result)
  resultRef.current = result
  const latest = useRef({ values, selection, statisticsParams })
  latest.current = { values, selection, statisticsParams }

  const remember = useCallback(
    (changes = {}) => {
      clearTimeout(scrollHistoryTimer.current)
      const current = window.history.state || {}
      const mobileProgress = {
        ...(current.mobileProgress?.scope === scopeKey ? current.mobileProgress : {}),
        scope: scopeKey,
        query: latest.current.values,
        queries: queriesRef.current,
        selection: latest.current.selection,
        statisticsQuery: latest.current.statisticsParams.toString(),
        scrollTop: restoreScroll.current ?? scrollRef.current?.scrollTop ?? 0,
        ...changes,
      }
      if (JSON.stringify(current.mobileProgress) === JSON.stringify(mobileProgress)) return
      window.history.replaceState(
        { ...current, mobileProgress },
        ''
      )
    },
    [scopeKey]
  )
  useEffect(() => {
    if (active) remember()
  }, [active, remember, values, selection, statisticsParams])
  useEffect(() => () => {
    clearTimeout(scrollHistoryTimer.current)
  }, [])
  useEffect(() => {
    if (!suppressDetailOpenMotion) return undefined
    const frame = requestAnimationFrame(() => {
      setSuppressDetailOpenMotion(false)
    })
    return () => cancelAnimationFrame(frame)
  }, [suppressDetailOpenMotion])
  useEffect(() => {
    if (!active) { setFiltersOpen(false) }
  }, [active])
  useEffect(() => {
    const pop = () => {
      clearTimeout(scrollHistoryTimer.current)
      const restored = readMobileProgressState(
        window.history.state,
        scopeKey,
        mobileProgressDefaultView(roleKey, access)
      )
      setSuppressDetailOpenMotion(Boolean(restored.selection))
      setSelection(restored.selection)
      queriesRef.current = restored.queries
      setValues(restored.query)
      setStatisticsParams(new URLSearchParams(restored.statisticsQuery))
      restoreScroll.current = restored.scrollTop
    }
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [access, roleKey, scopeKey])

  const update = (changes) => {
    const current = latest.current.values
    queriesRef.current[current.view] = current
    const switching = changes.view && changes.view !== current.view
    const next = normalizeMobileProgressQuery(
      switching ? queriesRef.current[changes.view] : withProgressFilters(current, changes),
      changes.view || mobileProgressDefaultView(roleKey, access)
    )
    queriesRef.current[next.view] = next
    latest.current = { ...latest.current, values: next }
    setValues(next)
    restoreScroll.current = 0
    scrollRef.current?.scrollTo({ top: 0 })
  }
  const load = useCallback(
    async ({ append = false } = {}) => {
      const { current } = resultRef
      const currentData =
        current?.key === queryKey && current?.scope === scopeKey
          ? current.data
          : null
      if (
        append &&
        (loadMorePending.current ||
          !currentData ||
          currentData.rows.length >= currentData.total)
      ) {
        return false
      }
      if (append) loadMorePending.current = true
      else loadMorePending.current = false
      const request = begin('mobile-progress')
      if (!listActive) {
        loadMorePending.current = false
        setLoading(false)
        setLoadingMore(false)
        request.finish()
        return false
      }
      if (append) setLoadingMore(true)
      else {
        setLoading(true)
        setLoadingMore(false)
        setError('')
        setEndReached(false)
      }
      setLoadMoreError('')
      try {
        const response = await listBusinessProgress(
          {
            ...query,
            offset: append ? currentData.rows.length : 0,
          },
          {
            signal: request.signal,
          }
        )
        if (!request.isCurrent()) return false
        if (append) {
          const seen = new Set(currentData.rows.map((row) => row.id))
          const additions = response.rows.filter((row) => !seen.has(row.id))
          const rows = [...currentData.rows, ...additions]
          setEndReached(additions.length === 0 || rows.length >= response.total)
          setResult({
            key: queryKey,
            scope: scopeKey,
            data: { ...response, rows },
          })
        } else {
          setEndReached(response.rows.length >= response.total)
          setResult({ key: queryKey, scope: scopeKey, data: response })
        }
        return true
      } catch (failure) {
        if (request.isCurrent()) {
          const message = getActionErrorMessage(failure, '查询进度失败，请重试')
          const accessLost =
            isAuthFailureCode(failure?.code) ||
            isAdminSessionUnavailableCode(failure?.code) ||
            Number(failure?.code) === RpcErrorCode.PERMISSION_DENIED
          if (append && !accessLost) setLoadMoreError(message)
          else {
            if (!currentData || accessLost) setResult(null)
            setError(
              currentData && !accessLost
                ? `${message}，已保留上次数据`
                : message
            )
          }
        }
        return false
      } finally {
        if (append) loadMorePending.current = false
        if (request.isCurrent()) {
          if (append) setLoadingMore(false)
          else setLoading(false)
          request.finish()
        }
      }
    },
    [listActive, begin, query, queryKey, scopeKey]
  )
  const refresh = useCallback(() => load(), [load])
  const loadFeedback = usePageLoadFeedback({
    error: error || loadMoreError,
    retry: error ? refresh : () => load({ append: true }),
    enabled: listActive && !selection,
  })
  const loadMore = useCallback(() => {
    if (!active || loading || loadingMore || error || loadMoreError || !hasMore) {
      return Promise.resolve(false)
    }
    return load({ append: true })
  }, [active, error, hasMore, load, loadMoreError, loading, loadingMore])
  useEffect(() => {
    refresh()
    return () => {
      const request = begin('mobile-progress')
      request.finish()
    }
  }, [refresh, begin])
  useEffect(() => {
    const root = scrollRef.current
    const target = loadMoreRef.current
    if (
      !active ||
      selection ||
      !hasMore ||
      loading ||
      loadingMore ||
      loadMoreError ||
      !root ||
      !target
    ) {
      return undefined
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) loadMore()
      },
      { root, rootMargin: '0px 0px 240px' }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [
    active,
    hasMore,
    loadMore,
    loadMoreError,
    loading,
    loadingMore,
    selection,
  ])
  useLayoutEffect(() => {
    if (active && data && restoreScroll.current !== null && scrollRef.current) {
      scrollRef.current.scrollTop = restoreScroll.current
      const maxScroll = Math.max(
        0,
        scrollRef.current.scrollHeight - scrollRef.current.clientHeight
      )
      if (restoreScroll.current <= maxScroll || !hasMore) {
        restoreScroll.current = null
      }
    }
  }, [active, data, hasMore])

  const open = (row, section, sourceOrderNo) => {
    remember()
    setSuppressDetailOpenMotion(false)
    const next = { id: row.line?.sales_order_id || row.id, lineID: row.line ? row.id : undefined, view: row.view, orderNo: row.order_no, section: section ?? null, sourceOrderNo }
    window.history.pushState(
      {
        ...window.history.state,
        mobileProgress: {
          ...window.history.state.mobileProgress,
          selection: next,
          detailEntry: true,
        },
      },
      ''
    )
    setSelection(next)
  }
  const close = () => {
    if (window.history.state?.mobileProgress?.detailEntry) window.history.back()
    else setSelection(null)
  }
  const openProductionFromDetail = (record, context) => {
    latest.current.selection = { ...selection, ...context }
    open({ id: record.id, view: 'production', order_no: record.number }, null, selection.orderNo)
  }
  const openTaskFromDetail = (taskID, context) => {
    remember({ selection: { ...selection, ...context } })
    onOpenTask(taskID)
  }
  const counts = data?.counts
  const canReadStatisticsSource = useCallback((path) => canOpenRelatedDocumentPath({
    path,
    adminProfile,
    allowedMenuPaths: adminProfile?.menus?.map((menu) => menu.path),
  }), [adminProfile])
  const statistics = useBusinessStatistics({
    active: active && view === 'statistics' && access.global,
    adminProfile,
    params: statisticsParams,
    setParams: updateStatisticsParams,
    onOpenOrder: open,
    canOpen: canReadStatisticsSource,
    allowDocumentNavigation: false,
  })
  const options = views.map((option) => ({
    ...option,
    disabled: option.value === 'orders' && data?.access.sales === false ||
      option.value === 'production' && data?.access.production === false ||
      option.value === 'statistics' && !statistics.canUse,
  }))
  const filterCount = progressFilterCount(query)
  const filterSummary = progressExtraFilters(query).map(({ key, label }) => {
    if (key === 'scope') return `记录范围：${label}`
    if (key === 'due_status') return `交期：${label}`
    return label
  })
  const filtered = values.q || filterCount > 0 || query.due_status !== 'all' ||
    lines && query.delivery_status !== 'all' || query.blocked_only
  const filterCounts = loading ? undefined : counts
  return (
    <section
      hidden={!active}
      className="mobile-progress-panel erp-mobile-controls"
      data-refreshing={loading || loadingMore}
      aria-label="手机进度看板"
      data-testid="mobile-progress-panel"
    >
      <div
        className="mobile-progress-scroll"
        ref={scrollRef}
        onScroll={(event) => {
          if (!active) return
          const { scrollTop } = event.currentTarget
          clearTimeout(scrollHistoryTimer.current)
          scrollHistoryTimer.current = setTimeout(() => remember({ scrollTop }), 150)
        }}
      >
        <div className="mobile-progress-controls">
          <SlidingTabList
            block
            className="mobile-workspace-primary-tabs mobile-progress-view-switch"
            aria-label="进度视图"
            options={options}
            value={view}
            onChange={(view) => update({ view })}
          />
          {viewingList && (
          <>
            <div className="mobile-progress-search erp-mobile-search-row">
              <MobileSearchInput
                aria-label="搜索进度"
                placeholder="单号/名称"
                searchHint="可搜索：单号、名称、负责人"
                value={values.q}
                resetKey={`${scopeKey}:${query.view}:${active}`}
                onFocus={() => setFiltersOpen(false)}
                onSearch={(q) => update({ q })}
              />
              <MobileFilterPopover
                contextLabel="进度"
                title="进度筛选"
                open={filtersOpen && active}
                onOpenChange={setFiltersOpen}
                count={filterCount}
                summary={filterSummary}
                triggerRef={filterTriggerRef}
                onReset={() => update(progressFilterReset(query))}
              >
                <BusinessProgressFilterFields
                  adminProfile={adminProfile}
                  compact
                  query={query}
                  counts={filterCounts}
                  taskAccess={data?.access.tasks}
                  onChange={update}
                />
              </MobileFilterPopover>
            </div>
            {query.view === 'orders' && !access.scopedDelivery && (
            <ProgressDeliverySwitch
              query={query}
              onChange={(display) => update({
                display: display === 'lines' ? 'lines' : '',
                due_status: '',
                delivery_status: '',
                blocked_only: '',
              })}
            />
          )}
            <HorizontalScroll
              className="mobile-progress-risks"
              role="group"
              aria-label="进度快捷筛选"
            >
              {lines ? (
                <ProgressDeliveryFilters query={query} counts={filterCounts} onChange={update} />
            ) : (
              <ProgressDueFilters
                compact
                query={query}
                counts={filterCounts}
                onChange={update}
              />
            )}
              <ProgressBlockedFilter
                compact
                query={query}
                counts={filterCounts}
                taskAccess={data?.access.tasks}
                onChange={update}
              />
            </HorizontalScroll>
            <MobileScrollEdge scrollContainerRef={scrollRef} enabled={active && !selection} />
          </>
          )}
        </div>
        {view === 'statistics' && <div className="erp-progress-board erp-progress-board--statistics">{statistics.content}</div>}
        {viewingList && (
        <>
          <MobileTaskPullRefresh
            key={`${scopeKey}|${queryKey}`}
            scrollContainerRef={scrollRef}
            enabled={active && !selection}
            busy={loading || loadingMore}
            onRefresh={refresh}
            lastUpdated={timeLabel(data?.snapshot_at)}
          />
          {error && loadFeedback.visible ? (
            <Alert
              className="mobile-progress-error"
              type="error"
              showIcon
              message={error}
              action={
                <Button onClick={loadFeedback.retry} loading={loading || loadFeedback.retrying} aria-label="重试">
                  重试
                </Button>
            }
            />
        ) : null}
          <Spin spinning={loading}>
            <div
              className="mobile-progress-list"
              aria-busy={loading || loadingMore}
            >
              {data?.rows.map((row) => {
              if (row.line) { return (
                <article key={row.id} className="mobile-progress-card">
                  <WorkflowTaskCard
                    className="mobile-progress-card-selection"
                    contentClassName="mobile-progress-card-main"
                    label={`查看 ${row.order_no} · ${row.product} · 第 ${row.line.line_no} 行进度`}
                    onOpen={() => open(row, 'lines')}
                  >
                    <span className="mobile-progress-card-identity">
                      <ProgressLineProduct row={row} />
                      <ProgressLineStatus row={row} snapshotAt={data.snapshot_at} />
                    </span>
                    <span className="erp-progress-reference">
                      <ProgressDocumentNumber number={row.order_no} />{' · '}
                      {row.customer || '客户未填写'}
                    </span>
                    <span>交付日期 {row.due_date || '未排交期'} · 剩余待交 <ProgressLineRemaining row={row} /></span>
                    <ProgressDelivery row={row} showProgress />
                  </WorkflowTaskCard>
                </article>
              ) }
              const taskSummary = mobileProgressTaskSummary(row, roleLabel)
              const directTaskID = onOpenTask ? taskSummary.taskID : null
              return (
                <article key={row.id} className="mobile-progress-card">
                  <WorkflowTaskCard
                    className="mobile-progress-card-selection"
                    contentClassName="mobile-progress-card-main"
                    label={`查看 ${row.order_no} 进度`}
                    onOpen={() => open(row)}
                  >
                    <span className="mobile-progress-card-identity">
                      <ProgressIdentity row={row} />
                      <ProgressDue row={row} snapshotAt={data.snapshot_at} />
                    </span>
                    <ProgressDelivery
                      row={row}
                      onOpenDetails={() => open(row, 'lines')}
                    />
                  </WorkflowTaskCard>
                  {data.access.tasks && row.open_tasks > 0 ? (
                    <button
                      type="button"
                      className="mobile-progress-task-entry"
                      aria-label={
                        directTaskID
                          ? `查看 ${row.order_no} 的${taskSummary.title}`
                          : `查看 ${row.order_no} 的关联任务`
                      }
                      onClick={() => {
                        if (directTaskID) {
                          remember()
                          onOpenTask(directTaskID)
                        } else { remember(); onOpenRelatedTasks({ view: row.view, id: row.id, orderNo: row.order_no }) }
                      }}
                    >
                      <ProgressAttention
                        row={row}
                        access={data.access}
                        compact
                        suffix={<RightOutlined aria-hidden="true" />}
                      />
                    </button>
                  ) : (
                    <div className="mobile-progress-task-entry mobile-progress-task-entry--empty">
                      <ProgressAttention row={row} access={data.access} compact />
                    </div>
                  )}
                </article>
              )
            })}
              {data?.rows.length === 0 && (
              <Empty
                description={
                  filtered ? '没有符合条件的记录' : '当前范围暂无记录'
                }
              />
            )}
            </div>
            {data &&
            data.total > 0 &&
            (hasMore ||
              loadingMore ||
              loadMoreError ||
              data.rows.length > query.limit) && (
              <div
                className="mobile-progress-continuation"
                ref={hasMore && !loadMoreError ? loadMoreRef : null}
                role="status"
                aria-live="polite"
              >
                {loadMoreError ? loadFeedback.visible && !error ? (
                  <>
                    <span>继续加载失败</span>
                    <button
                      type="button"
                      className="erp-control-button"
                      disabled={loadingMore || loadFeedback.retrying}
                      onClick={loadFeedback.retry}
                    >
                      重试
                    </button>
                  </>
                ) : null : loadingMore ? (
                  <span>正在加载更多…</span>
                ) : hasMore ? (
                  <span>继续下滑加载</span>
                ) : (
                  <span>已显示全部 {data.rows.length} 条</span>
                )}
              </div>
            )}
          </Spin>
          {data ? (
            <div className="mobile-progress-range" role="status">
              已显示 {data.rows.length} / 共 {data.total}
              {lines ? ' 条交付明细' : query.view === 'orders' ? ' 张订单' : ' 张生产单'}
            </div>
        ) : null}
          <MobileBackToTop enabled={active && !selection} />
        </>
        )}
      </div>
      <BusinessProgressDrawer
        mobile
        suppressOpenMotion={suppressDetailOpenMotion}
        selection={active && !scopedOrderID ? selection : null}
        sourceOrderNo={selection?.sourceOrderNo}
        adminProfile={adminProfile}
        onClose={close}
        onOpenProduction={selection?.view === 'orders' ? openProductionFromDetail : undefined}
        onOpenTask={onOpenTask ? openTaskFromDetail : undefined}
        onSectionChange={(section) =>
          setSelection((current) =>
            current ? { ...current, section } : current
          )
        }
      />
      <SalesDeliveryWorkspace workspace={deliveryWorkspace} onMobileClose={close} mobile />
    </section>
  )
}
