import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Empty, Spin, Tag } from 'antd'
import MobileSearchInput from '@/common/components/navigation/MobileSearchInput'
import HorizontalScroll from '@/common/components/scroll/HorizontalScroll'
import BusinessStatusFilter from '../../components/business-list/BusinessStatusFilter.jsx'
import { resolveBusinessStatusCounts } from '../../utils/businessStatusCounts.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { message } from '@/common/utils/antdApp'
import { listWorkflowTracking } from '../../api/workflowApi.mjs'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator'
import WorkflowTaskCard from '../../components/workflow/WorkflowTaskCard.jsx'
import WorkflowTaskIdentity, { WorkflowTaskAssociation } from '../../components/workflow/WorkflowTaskIdentity.jsx'
import { WorkflowTaskSource } from '../../components/workflow/WorkflowTaskCopy.jsx'
import WorkflowResponsibilities from '../../components/workflow/WorkflowResponsibilities.jsx'
import WorkflowInitiator from '../../components/workflow/WorkflowInitiator.jsx'
import WorkflowTrackingDrawer from '../../components/workflow/WorkflowTrackingDrawer.jsx'
import {
  trackingTitle,
  trackingStatus,
  trackingStatusColor,
  trackingHandoff,
  trackingResponsibilityParts,
} from '../../utils/workflowTracking.mjs'
import {
  TRACKING_STATUS_OPTIONS,
  TRACKING_SCOPE_OPTIONS,
  TRACKING_ROLE_OPTIONS,
  TRACKING_ATTENTION_OPTIONS,
} from '../../utils/workflowTrackingFilters.mjs'
import { formatWorkflowTaskEventTime } from '../../utils/workflowTaskEventPresentation.mjs'
import { WORKFLOW_TASKS_CHANGED } from '../../utils/workflowTaskChanges.mjs'
import {
  MOBILE_TRACKING_PAGE_SIZE,
  MOBILE_TRACKING_HISTORY_KEY,
  readMobileTrackingSource,
  readMobileTrackingState,
  normalizeMobileTrackingQuery,
  mergeMobileTrackingItems,
} from '../utils/mobileWorkflowTracking.mjs'
import MobileFilterPopover from './MobileFilterPopover.jsx'
import MobileFilterChoices from './MobileFilterChoices.jsx'
import MobileTaskPullRefresh from './MobileTaskPullRefresh.jsx'
import MobileScrollEdge from './MobileScrollEdge.jsx'
import { usePageLoadFeedback } from '../../components/PageLoadFeedback.jsx'
import '../mobileWorkflowTracking.css'

function TrackingSearch({ value, onSearch }) {
  const search = { value, onSearch }
  return (
    <MobileSearchInput
      aria-label="搜索流转记录"
      placeholder="单号/任务"
      title="搜索单号、任务、产品或款号"
      maxLength={100}
      {...search}
    />
  )
}

export default function MobileWorkflowTrackingPanel({ accessScope, ...props }) {
  const location = useLocation()
  const navigate = useNavigate()
  const clearSource = () => {
    const params = new URLSearchParams(location.search)
    params.delete('track_source_type')
    params.delete('track_source_id')
    navigate(
      {
        pathname: location.pathname,
        search: params.toString(),
        hash: location.hash,
      },
      { replace: true }
    )
  }
  const source = readMobileTrackingSource(location.search)
  const scopeKey = source
    ? `${accessScope}|source:${source.source_type}:${source.source_id}`
    : accessScope
  return (
    <MobileTrackingContent
      key={scopeKey}
      {...props}
      accessScope={scopeKey}
      source={source}
      onClearSource={clearSource}
    />
  )
}

function MobileTrackingContent({
  accessScope,
  scrollContainerRef,
  onOpenTask,
  source,
  onClearSource,
}) {
  const [state, setState] = useState(() =>
    readMobileTrackingState(window.history.state, accessScope, source)
  )
  const [result, setResult] = useState(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filterTriggerRef = useRef(null)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(false)
  const stateRef = useRef(state)
  const resultRef = useRef(result)
  const appendPending = useRef(false)
  const sentinel = useRef(null)
  const restoreScroll = useRef(true)
  const returnEntry = useRef(
    state.selection ? `${state.selection.kind}:${state.selection.id}` : ''
  )
  const focusAfterClose = useRef(false)
  const positions = useRef(
    Object.fromEntries(
      Object.entries(state.scopes).map(([name, slot]) => [name, slot.scrollTop])
    )
  )
  const begin = useLatestRequestCoordinator()
  stateRef.current = state
  resultRef.current = result
  const { scope } = state
  const { query } = state.scopes[scope]
  const paramsKey = JSON.stringify({ scope, ...query, ...source })
  const key = JSON.stringify([accessScope, paramsKey, revision])

  const remember = useCallback((next = stateRef.current, push = false) => {
    const snapshot = {
      ...next,
      scopes: Object.fromEntries(
        Object.entries(next.scopes).map(([name, slot]) => [
          name,
          { ...slot, scrollTop: positions.current[name] || 0 },
        ])
      ),
    }
    window.history[push ? 'pushState' : 'replaceState'](
      { ...window.history.state, [MOBILE_TRACKING_HISTORY_KEY]: snapshot },
      ''
    )
  }, [])

  const updateQuery = (changes) => {
    restoreScroll.current = false
    positions.current[scope] = 0
    scrollContainerRef.current?.scrollTo({ top: 0 })
    setState((current) => ({
      ...current,
      scopes: {
        ...current.scopes,
        [scope]: {
          query: normalizeMobileTrackingQuery({
            ...current.scopes[scope].query,
            ...changes,
          }),
          scrollTop: 0,
          loadedCount: MOBILE_TRACKING_PAGE_SIZE,
        },
      },
    }))
  }

  const load = useCallback(
    async ({ append = false, showRefreshFeedback = false } = {}) => {
      const current = resultRef.current?.key === key ? resultRef.current : null
      if (
        append &&
        (appendPending.current ||
          !current ||
          current.nextOffset >= current.total)
      )
        { return }
      const request = begin('mobile-tracking')
      appendPending.current = append
      setLoading(true)
      try {
        const params = JSON.parse(paramsKey)
        const target = append
          ? 0
          : stateRef.current.scopes[params.scope].loadedCount
        let items = append ? current.items : []
        let offset = append ? current.nextOffset : 0
        let total = current?.total || 0
        let statusCounts = null
        do {
          const page = await listWorkflowTracking(
            { ...params, limit: MOBILE_TRACKING_PAGE_SIZE, offset },
            { signal: request.signal }
          )
          if (!request.isCurrent()) return
          items = mergeMobileTrackingItems(items, page.items)
          offset += page.items.length
          total = page.total
          statusCounts = resolveBusinessStatusCounts(page)
        } while (!append && offset < target && offset < total)
        setResult({
          key,
          items,
          nextOffset: offset,
          total,
          statusCounts,
          updatedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        })
        if (showRefreshFeedback)
          { message.success({
            key: 'mobile-tracking-refresh',
            content: '任务进度已刷新',
          }) }
        setState((value) => ({
          ...value,
          scopes: {
            ...value.scopes,
            [params.scope]: {
              ...value.scopes[params.scope],
              loadedCount: Math.max(MOBILE_TRACKING_PAGE_SIZE, offset),
            },
          },
        }))
      } catch (error) {
        if (request.isCurrent()) {
          const feedback = getActionErrorMessage(
            error,
            '任务进度加载失败，请重试'
          )
          setResult(
            append
              ? { ...current, appendError: feedback }
              : current?.items.length
                ? { ...current, refreshError: feedback }
                : { key, error: feedback, items: [], total: 0, nextOffset: 0 }
          )
        }
      } finally {
        if (request.isCurrent()) {
          appendPending.current = false
          setLoading(false)
          request.finish()
        }
      }
    },
    [begin, key, paramsKey]
  )

  useEffect(() => {
    load()
    return () => {
      const request = begin('mobile-tracking')
      request.finish()
    }
  }, [begin, load])
  useEffect(() => {
    remember(state)
  }, [remember, state])
  useEffect(() => {
    const restore = () => {
      const next = readMobileTrackingState(
        window.history.state,
        accessScope,
        source
      )
      positions.current = Object.fromEntries(
        Object.entries(next.scopes).map(([name, slot]) => [
          name,
          slot.scrollTop,
        ])
      )
      restoreScroll.current = true
      setFiltersOpen(false)
      setState(next)
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [accessScope, source])
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1)
    window.addEventListener(WORKFLOW_TASKS_CHANGED, refresh)
    return () => window.removeEventListener(WORKFLOW_TASKS_CHANGED, refresh)
  }, [])
  useEffect(() => {
    const scroll = scrollContainerRef.current
    const saveScroll = () => {
      if (restoreScroll.current) return
      positions.current[stateRef.current.scope] = scroll?.scrollTop || 0
      remember()
    }
    scroll?.addEventListener('scroll', saveScroll, { passive: true })
    return () => scroll?.removeEventListener('scroll', saveScroll)
  }, [remember, scrollContainerRef])
  const current = result?.key === key ? result : null
  const loadFeedback = usePageLoadFeedback({
    error: current?.error || current?.refreshError || current?.appendError,
    retry: () =>
      load({
        append: Boolean(
          current?.appendError && !current?.error && !current?.refreshError
        ),
      }),
    enabled: !state.selection,
  })
  const restoreCardFocus = useCallback(() => {
    if (!focusAfterClose.current || stateRef.current.selection) return
    const card = scrollContainerRef.current?.querySelector(
      `[data-mobile-tracking-entry="${returnEntry.current}"] .erp-task-card__open`
    )
    if (!card) return
    card.focus({ preventScroll: true })
    focusAfterClose.current = false
  }, [scrollContainerRef])
  useEffect(() => {
    restoreCardFocus()
  }, [current, restoreCardFocus])
  useEffect(() => {
    if (!current || current.error || !restoreScroll.current) return
    scrollContainerRef.current?.scrollTo({ top: positions.current[scope] || 0 })
    restoreScroll.current = false
  }, [current, scope, scrollContainerRef])
  useEffect(() => {
    if (
      !current ||
      current.error ||
      current.refreshError ||
      current.appendError ||
      loading ||
      current.nextOffset >= current.total
    )
      { return undefined }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) load({ append: true })
      },
      { root: scrollContainerRef.current, rootMargin: '160px' }
    )
    if (sentinel.current) observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [current, load, loading, scrollContainerRef])

  const select = (entry) => {
    if (entry) returnEntry.current = `${entry.kind}:${entry.id}`
    if (!entry && stateRef.current.detailEntry) {
      window.history.back()
      return
    }
    const next = {
      ...stateRef.current,
      selection: entry ? { kind: entry.kind, id: entry.id } : null,
      detailEntry: Boolean(entry),
    }
    remember(next, Boolean(entry) && !stateRef.current.selection)
    setState(next)
  }
  const changeScope = (nextScope) => {
    if (nextScope === scope) return
    setFiltersOpen(false)
    restoreScroll.current = true
    setState({
      ...stateRef.current,
      scope: nextScope,
      selection: null,
      detailEntry: false,
    })
  }
  const resetFilters = () => updateQuery({ owner_role_key: '', attention: '' })
  const filterSummary = [
    ['owner_role_key', '当前岗位', TRACKING_ROLE_OPTIONS],
    ['attention', '关注事项', TRACKING_ATTENTION_OPTIONS],
  ]
    .filter(([field]) => query[field])
    .map(([key, label, options]) => `${label}：${options.find(({ value }) => value === query[key])?.label}`)
  const filterCount = filterSummary.length

  return (
    <section className="mobile-workflow-tracking" aria-label="流程跟踪">
      <div className="mobile-workflow-tracking-controls">
        {source ? (
          <>
            <strong>当前单据的流转记录</strong>
            <Button type="link" onClick={onClearSource}>
              清除单据范围
            </Button>
          </>
        ) : null}
        <div className="mobile-workflow-tracking-search erp-mobile-search-row">
          <TrackingSearch
            key={scope}
            value={query.keyword}
            onSearch={(keyword) => updateQuery({ keyword })}
          />
          <MobileFilterPopover
            contextLabel="流程"
            title="流转筛选"
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
            count={filterCount}
            summary={filterSummary}
            triggerRef={filterTriggerRef}
            onReset={resetFilters}
          >
            {!source ? (
              <fieldset role="presentation">
                <legend>跟踪范围</legend>
                <MobileFilterChoices
                  label="跟踪范围"
                  value={scope}
                  options={TRACKING_SCOPE_OPTIONS}
                  onChange={changeScope}
                />
              </fieldset>
            ) : null}
            <fieldset role="presentation">
              <legend>当前岗位</legend>
              <MobileFilterChoices
                label="当前岗位"
                value={query.owner_role_key}
                disabled={query.status === 'completed'}
                options={TRACKING_ROLE_OPTIONS}
                onChange={(owner_role_key) => updateQuery({ owner_role_key })}
              />
            </fieldset>
            <fieldset role="presentation">
              <legend>关注事项</legend>
              <MobileFilterChoices
                label="关注事项"
                value={query.attention}
                disabled={query.status === 'completed'}
                options={TRACKING_ATTENTION_OPTIONS}
                onChange={(attention) => updateQuery({ attention })}
              />
            </fieldset>
          </MobileFilterPopover>

        </div>
        {!source && scope !== 'visible' ? (
          <p
            className="mobile-workflow-tracking-count"
            aria-label="当前跟踪范围"
          >
            {
              TRACKING_SCOPE_OPTIONS.find((option) => option.value === scope)
                ?.label
            }
          </p>
        ) : null}
        <HorizontalScroll className="mobile-workflow-tracking-status">
          <BusinessStatusFilter
            removable
            aria-label="流转状态"
            allLabel="全部状态"
            value={query.status}
            options={TRACKING_STATUS_OPTIONS}
            counts={
              current?.error || current?.refreshError
                ? null
                : current?.statusCounts
            }
            loading={!current || (loading && !appendPending.current)}
            onChange={(status) => updateQuery({ status })}
          />
        </HorizontalScroll>
        <MobileScrollEdge scrollContainerRef={scrollContainerRef} />
      </div>
      <MobileTaskPullRefresh
        key={paramsKey}
        scrollContainerRef={scrollContainerRef}
        enabled={!filtersOpen && !state.selection}
        busy={loading}
        onRefresh={load}
        lastUpdated={current?.updatedAt}
      />
      {loadFeedback.visible && (current.error || current.refreshError) && (
        <Alert
          type="error"
          showIcon
          message={current.error || current.refreshError}
          action={
            <Button
              loading={loading || loadFeedback.retrying}
              onClick={loadFeedback.retry}
            >
              重新读取
            </Button>
          }
        />
      )}
      {!current ? (
        <Spin tip="正在读取任务进度">
          <div className="erp-workflow-tracking-loading" />
        </Spin>
      ) : current.error ? null : (
        <>
          <div className="mobile-workflow-tracking-list">
            {current.items.map((entry) => (
              <WorkflowTaskCard
                key={`${entry.kind}:${entry.id}`}
                compact
                className="mobile-workflow-tracking-card"
                label={`流程跟踪：${trackingTitle(entry)}`}
                data-mobile-tracking-entry={`${entry.kind}:${entry.id}`}
                onOpen={() => select(entry)}
              >
                <div className="mobile-workflow-tracking-heading">
                  <strong>{trackingTitle(entry)}</strong>
                  <Tag color={trackingStatusColor(entry)}>
                    {trackingStatus(entry)}
                  </Tag>
                </div>
                {entry.display_context ? (
                  <WorkflowTaskIdentity
                    task={entry}
                    keyword={query.keyword}
                    compact
                    copyable={false}
                    showStyleNo
                    source={<WorkflowTaskSource task={entry} copyable={false} showUnavailable={false} />}
                  />
                ) : <span className="erp-task-identity erp-task-identity--compact"><WorkflowTaskAssociation task={entry} emptyLabel="关联内容未提供" source={<WorkflowTaskSource task={entry} copyable={false} />} /></span>}
                <div className="erp-task-card__footer mobile-workflow-tracking-footer">
                  <div className="mobile-workflow-tracking-owner">
                    {entry.current_tasks.length ? (
                      <WorkflowResponsibilities
                        items={entry.current_tasks.map(
                          trackingResponsibilityParts
                        )}
                      />
                    ) : (
                      trackingHandoff(entry)
                    )}
                  </div>
                  <div className="mobile-workflow-tracking-origin">
                    <WorkflowInitiator summary={entry} />
                    <span>{formatWorkflowTaskEventTime(entry.started_at)}</span>
                  </div>
                </div>
              </WorkflowTaskCard>
            ))}
          </div>
          {!current.items.length && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                Object.values(query).some(Boolean)
                  ? '当前筛选下没有匹配记录'
                  : source
                    ? '当前单据暂无可见流转记录'
                    : scope === 'started'
                      ? '暂无你发起的流程或跟进任务'
                      : scope === 'participated'
                        ? '暂无你处理过的流程或跟进任务'
                        : '暂无可查看的流程或跟进任务'
              }
            />
          )}
          <div ref={sentinel} className="mobile-workflow-tracking-more">
            {current.items.length > 0 && (
              <div className="mobile-workflow-tracking-count" role="status">
                {current.nextOffset < current.total
                  ? `已显示 ${current.items.length} / 共 ${current.total} 条`
                  : `已显示全部 ${current.total} 条`}
              </div>
            )}
            {current.appendError ? (
              loadFeedback.visible && !current.refreshError ? (
                <>
                  <p role="alert">{current.appendError}，已加载记录仍保留。</p>
                  <Button
                    loading={loading || loadFeedback.retrying}
                    onClick={loadFeedback.retry}
                  >
                    重新读取更多
                  </Button>
                </>
              ) : null
            ) : loading ? (
              <Spin size="small" />
            ) : current.nextOffset < current.total ? (
              <Button onClick={() => load({ append: true })}>加载更多</Button>
            ) : null}
          </div>
        </>
      )}
      <WorkflowTrackingDrawer
        trackingRef={state.selection}
        onClose={() => select(null)}
        onOpenTask={(task) => {
          remember(stateRef.current)
          onOpenTask(task.id)
        }}
        refreshKey={revision}
        onAfterClose={() => {
          focusAfterClose.current = true
          // 抽屉先恢复其默认焦点，再回到本次流转记录的卡片。
          requestAnimationFrame(restoreCardFocus)
        }}
      />
    </section>
  )
}
