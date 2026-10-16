import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Empty, Spin } from 'antd'
import { RightOutlined } from '@ant-design/icons'
import { canOpenRelatedDocumentPath } from '../../utils/relatedDocumentNavigation.mjs'
import { resolveMenuPermissionKey } from '../../config/menuPermissions.mjs'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  isAuthFailureCode,
  isAdminSessionUnavailableCode,
  RpcErrorCode,
} from '@/common/consts/errorCodes'
import { listBusinessProgress } from '../../api/businessProgressApi.mjs'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator'
import BusinessProgressFilterFields, { ProgressDueFilters, ProgressBlockedFilter } from '../../components/business-visualizations/BusinessProgressFilters.jsx'
import BusinessProgressDrawer from '../../components/business-visualizations/BusinessProgressDrawer'
import WorkflowTaskCard from '../../components/workflow/WorkflowTaskCard.jsx'
import { ProgressIdentity, ProgressDue, ProgressDelivery, ProgressAttention } from '../../components/business-visualizations/ProgressCompactContent.jsx'
import {
  progressQueryFromURL,
  PROGRESS_SCOPE_OPTIONS,
  progressFilterCount,
  PROGRESS_FILTER_RESET,
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
import MobileAppliedFilters from './MobileAppliedFilters.jsx'
import MobileSearchInput from '@/common/components/navigation/MobileSearchInput'
import MobileBackToTop from '@/common/components/scroll/MobileBackToTop'
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
  canEnterDesktop,
}) {
  const navigate = useNavigate()
  const initial = useRef(
    readMobileProgressState(
      window.history.state,
      scopeKey,
      mobileProgressDefaultView(roleKey, access)
    )
  ).current
  const [values, setValues] = useState(initial.query)
  const queriesRef = useRef(initial.queries)
  const [keyword, setKeyword] = useState(initial.query.q)
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
  const scrollRef = useRef(null)
  const loadMoreRef = useRef(null)
  const loadMorePending = useRef(false)
  const restoreScroll = useRef(initial.scrollTop)
  const timer = useRef(null)
  const composing = useRef(false)
  const begin = useLatestRequestCoordinator()
  const query = useMemo(
    () => progressQueryFromURL(new URLSearchParams(values)),
    [values]
  )
  const queryKey = JSON.stringify(query)
  const data =
    result?.key === queryKey && result?.scope === scopeKey ? result.data : null
  const hasMore = Boolean(data && !endReached && data.rows.length < data.total)
  const resultRef = useRef(result)
  resultRef.current = result
  const latest = useRef({ values, selection })
  latest.current = { values, selection }

  const remember = useCallback(
    (changes = {}) => {
      window.history.replaceState(
        {
          ...window.history.state,
          mobileProgress: {
            ...(window.history.state?.mobileProgress?.scope === scopeKey
              ? window.history.state.mobileProgress
              : {}),
            scope: scopeKey,
            query: latest.current.values,
            queries: queriesRef.current,
            selection: latest.current.selection,
            scrollTop: scrollRef.current?.scrollTop || 0,
            ...changes,
          },
        },
        ''
      )
    },
    [scopeKey]
  )
  useEffect(() => {
    remember()
  }, [remember, values, selection])
  useEffect(() => () => clearTimeout(timer.current), [])
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
      const restored = readMobileProgressState(
        window.history.state,
        scopeKey,
        mobileProgressDefaultView(roleKey, access)
      )
      setSuppressDetailOpenMotion(Boolean(restored.selection))
      setSelection(restored.selection)
      queriesRef.current = restored.queries
      setValues(restored.query)
      setKeyword(restored.query.q)
      restoreScroll.current = restored.scrollTop
    }
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [access, roleKey, scopeKey])

  const update = (changes) => {
    clearTimeout(timer.current)
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
    if (switching) setKeyword(next.q)
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
      if (!active) {
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
    [active, begin, query, queryKey, scopeKey]
  )
  const refresh = useCallback(() => load(), [load])
  const loadFeedback = usePageLoadFeedback({
    error: error || loadMoreError,
    retry: error ? refresh : () => load({ append: true }),
    enabled: active && !selection,
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

  const open = (row, section = 'lines') => {
    remember()
    setSuppressDetailOpenMotion(false)
    const next = { id: row.id, view: row.view, orderNo: row.order_no, section }
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
  const counts = data?.counts
  const options = [
    ...(access.sales && data?.access.sales !== false
      ? [{ value: 'orders', label: '订单交付' }]
      : []),
    ...(access.production && data?.access.production !== false
      ? [{ value: 'production', label: '生产执行' }]
      : []),
  ]
  const filterCount = progressFilterCount(query)
  const filtered = values.q || filterCount > 0
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
        onScroll={() => remember()}
      >
        <div className="mobile-progress-controls">
          <SlidingSegmented
            block
            className="mobile-progress-view-switch"
            aria-label="进度视图"
            options={options}
            value={query.view}
            onChange={(view) => update({ view })}
          />
          <div className="mobile-progress-search">
            <MobileSearchInput
              aria-label="搜索进度"
              placeholder="单号、名称或负责人"
              value={keyword}
              maxLength={100}
              onCompositionStart={() => {
                composing.current = true
                clearTimeout(timer.current)
              }}
              onCompositionEnd={(event) => {
                composing.current = false
                setKeyword(event.currentTarget.value)
                update({ q: event.currentTarget.value.trim() })
              }}
              onChange={(event) => {
                const { value } = event.target
                setKeyword(value)
                clearTimeout(timer.current)
                if (!composing.current && !event.nativeEvent.isComposing) {
                  timer.current = setTimeout(
                    () => update({ q: value.trim() }),
                    300
                  )
                }
              }}
              onPressEnter={(event) => {
                if (
                  composing.current ||
                  event.nativeEvent.isComposing ||
                  event.nativeEvent.keyCode === 229
                ) {
                  return
                }
                update({ q: keyword.trim() })
              }}
              onClear={() => {
                composing.current = false
                setKeyword('')
                update({ q: '' })
              }}
            />
            <MobileFilterPopover
              contextLabel="进度"
              title="进度筛选"
              open={filtersOpen && active}
              onOpenChange={setFiltersOpen}
              count={filterCount}
              onReset={() => update(PROGRESS_FILTER_RESET)}
            >
              <BusinessProgressFilterFields
                compact
                query={query}
                counts={filterCounts}
                taskAccess={data?.access.tasks}
                onChange={update}
              />
            </MobileFilterPopover>
          </div>
          <div
            className="mobile-progress-risks"
            role="group"
            aria-label="进度快捷筛选"
          >
            <ProgressDueFilters
              compact
              query={query}
              counts={filterCounts}
              onChange={update}
            />
            <ProgressBlockedFilter
              compact
              query={query}
              counts={filterCounts}
              taskAccess={data?.access.tasks}
              onChange={update}
            />
          </div>
          <MobileAppliedFilters
            label="当前进度筛选"
            items={[
              query.scope !== 'active' && {
                key: 'scope',
                label: `记录范围：${PROGRESS_SCOPE_OPTIONS.find(({ value }) => value === query.scope)?.label}`,
              },
              query.due_status === 'undated' && {
                key: 'due_status',
                label: '未定交期',
              },
              query.unlinked_only && {
                key: 'unlinked_only',
                label: '仅看未关联销售',
              },
            ]}
            onClear={(key) =>
              update({
                [key]:
                  key === 'scope'
                    ? 'active'
                    : key === 'due_status'
                      ? 'all'
                      : key === 'unlinked_only'
                        ? false
                        : '',
              })
            }
          />
          <MobileScrollEdge scrollContainerRef={scrollRef} enabled={active && !selection} />
        </div>
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
                        } else open(row, 'tasks')
                      }}
                    >
                      <ProgressAttention row={row} access={data.access} />
                      <RightOutlined aria-hidden="true" />
                    </button>
                  ) : (
                    <div className="mobile-progress-task-entry mobile-progress-task-entry--empty">
                      <ProgressAttention row={row} access={data.access} />
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
                image={Empty.PRESENTED_IMAGE_SIMPLE}
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
            已显示 {data.rows.length} / 共 {data.total} 张
            {query.view === 'orders' ? '订单' : '生产单'}
          </div>
        ) : null}
        <MobileBackToTop enabled={active && !selection} />
      </div>
      <BusinessProgressDrawer
        mobile
        suppressOpenMotion={suppressDetailOpenMotion}
        selection={active ? selection : null}
        adminProfile={adminProfile}
        onClose={close}
        canOpen={(path) =>
          canEnterDesktop &&
          canOpenRelatedDocumentPath({
            path,
            adminProfile,
            allowedMenuPaths: (adminProfile?.menus || []).map((menu) =>
              resolveMenuPermissionKey(
                typeof menu === 'string' ? menu : menu.path
              )
            ),
          })
        }
        onNavigate={(path) => {
          remember()
          navigate(path)
        }}
        onOpenProduction={(record) =>
          open({ id: record.id, view: 'production', order_no: record.number })
        }
        onOpenTask={onOpenTask}
        onSectionChange={(section) =>
          setSelection((current) =>
            current ? { ...current, section } : current
          )
        }
      />
    </section>
  )
}
