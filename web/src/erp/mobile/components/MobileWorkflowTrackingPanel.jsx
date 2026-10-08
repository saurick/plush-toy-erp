import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Empty, Select, Spin, Tag } from 'antd'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import MobileSearchInput from '@/common/components/navigation/MobileSearchInput'
import FilterChip from '@/common/components/navigation/FilterChip'
import useLiveSearch from '@/common/hooks/useLiveSearch'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { message } from '@/common/utils/antdApp'
import { listWorkflowTracking } from '../../api/workflowApi.mjs'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator'
import WorkflowTaskCard from '../../components/workflow/WorkflowTaskCard.jsx'
import WorkflowTaskIdentity from '../../components/workflow/WorkflowTaskIdentity.jsx'
import { WorkflowTaskSource } from '../../components/workflow/WorkflowTaskCopy.jsx'
import WorkflowResponsibilities from '../../components/workflow/WorkflowResponsibilities.jsx'
import WorkflowInitiator from '../../components/workflow/WorkflowInitiator.jsx'
import WorkflowTrackingDrawer from '../../components/workflow/WorkflowTrackingDrawer.jsx'
import { trackingTitle, trackingStatus, trackingStatusColor, trackingHandoff, trackingResponsibilityParts } from '../../utils/workflowTracking.mjs'
import { TRACKING_STATUS_OPTIONS, TRACKING_ROLE_OPTIONS, TRACKING_ATTENTION_OPTIONS, TRACKING_SOURCE_OPTIONS } from '../../utils/workflowTrackingFilters.mjs'
import { formatWorkflowTaskEventTime } from '../../utils/workflowTaskEventPresentation.mjs'
import { WORKFLOW_TASKS_CHANGED } from '../../utils/workflowTaskChanges.mjs'
import { MOBILE_TRACKING_SCOPES, MOBILE_TRACKING_PAGE_SIZE, MOBILE_TRACKING_HISTORY_KEY, readMobileTrackingState, normalizeMobileTrackingQuery, mergeMobileTrackingItems } from '../utils/mobileWorkflowTracking.mjs'
import MobileFilterPopover from './MobileFilterPopover.jsx'
import MobileTaskPullRefresh from './MobileTaskPullRefresh.jsx'
import '../mobileWorkflowTracking.css'

function TrackingSearch({ value, onSearch }) {
  const search = useLiveSearch({ value, onSearch })
  return <MobileSearchInput aria-label="搜索流转记录" placeholder="单号/任务/产品/款号" maxLength={100} value={search.value} onChange={search.onChange} onCompositionStart={search.onCompositionStart} onCompositionEnd={search.onCompositionEnd} onPressEnter={search.onPressEnter} clearVisible={Boolean(search.value)} onClear={() => search.onChange({ currentTarget: { value: '' } })} />
}

export default function MobileWorkflowTrackingPanel({ accessScope, scrollContainerRef, onOpenTask }) {
  const [state, setState] = useState(() => readMobileTrackingState(window.history.state, accessScope))
  const [result, setResult] = useState(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(false)
  const stateRef = useRef(state)
  const resultRef = useRef(result)
  const appendPending = useRef(false)
  const sentinel = useRef(null)
  const restoreScroll = useRef(true)
  const returnEntry = useRef(state.selection ? `${state.selection.kind}:${state.selection.id}` : '')
  const focusAfterClose = useRef(false)
  const positions = useRef(Object.fromEntries(Object.entries(state.scopes).map(([name, slot]) => [name, slot.scrollTop])))
  const begin = useLatestRequestCoordinator()
  stateRef.current = state
  resultRef.current = result
  const { scope } = state
  const { query } = state.scopes[scope]
  const paramsKey = JSON.stringify({ scope, ...query })
  const key = JSON.stringify([accessScope, paramsKey, revision])

  const remember = useCallback((next = stateRef.current, push = false) => {
    const snapshot = { ...next, scopes: Object.fromEntries(Object.entries(next.scopes).map(([name, slot]) => [name, { ...slot, scrollTop: positions.current[name] || 0 }])) }
    window.history[push ? 'pushState' : 'replaceState']({ ...window.history.state, [MOBILE_TRACKING_HISTORY_KEY]: snapshot }, '')
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
          query: normalizeMobileTrackingQuery({ ...current.scopes[scope].query, ...changes }),
          scrollTop: 0,
          loadedCount: MOBILE_TRACKING_PAGE_SIZE,
        },
      },
    }))
  }

  const load = useCallback(async ({ append = false, showRefreshFeedback = false } = {}) => {
    const current = resultRef.current?.key === key ? resultRef.current : null
    if (append && (appendPending.current || !current || current.nextOffset >= current.total)) return
    const request = begin('mobile-tracking')
    appendPending.current = append
    setLoading(true)
    try {
      const params = JSON.parse(paramsKey)
      const target = append ? 0 : stateRef.current.scopes[params.scope].loadedCount
      let items = append ? current.items : []
      let offset = append ? current.nextOffset : 0
      let total = current?.total || 0
      do {
        const page = await listWorkflowTracking({ ...params, limit: MOBILE_TRACKING_PAGE_SIZE, offset }, { signal: request.signal })
        if (!request.isCurrent()) return
        items = mergeMobileTrackingItems(items, page.items)
        offset += page.items.length
        total = page.total
      } while (!append && offset < target && offset < total)
      setResult({ key, items, nextOffset: offset, total, updatedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }) })
      if (showRefreshFeedback) message.success({ key: 'mobile-tracking-refresh', content: '任务进度已刷新' })
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
        const feedback = getActionErrorMessage(error, '任务进度加载失败，请重试')
        setResult(append ? { ...current, appendError: feedback } : current?.items.length
          ? { ...current, refreshError: feedback }
          : { key, error: feedback, items: [], total: 0, nextOffset: 0 })
        if (showRefreshFeedback) message.error({ key: 'mobile-tracking-refresh', content: feedback })
      }
    } finally {
      if (request.isCurrent()) {
        appendPending.current = false
        setLoading(false)
        request.finish()
      }
    }
  }, [begin, key, paramsKey])

  useEffect(() => {
    load()
    return () => { const request = begin('mobile-tracking'); request.finish() }
  }, [begin, load])
  useEffect(() => {
    remember(state)
  }, [remember, state])
  useEffect(() => {
    const restore = () => {
      const next = readMobileTrackingState(window.history.state, accessScope)
      positions.current = Object.fromEntries(Object.entries(next.scopes).map(([name, slot]) => [name, slot.scrollTop]))
      restoreScroll.current = true
      setFiltersOpen(false)
      setState(next)
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [accessScope])
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
  const restoreCardFocus = useCallback(() => {
    if (!focusAfterClose.current || stateRef.current.selection) return
    const card = scrollContainerRef.current?.querySelector(`[data-mobile-tracking-entry="${returnEntry.current}"] .erp-task-card__open`)
    if (!card) return
    card.focus({ preventScroll: true })
    focusAfterClose.current = false
  }, [scrollContainerRef])
  useEffect(() => { restoreCardFocus() }, [current, restoreCardFocus])
  useEffect(() => {
    if (!current || current.error || !restoreScroll.current) return
    scrollContainerRef.current?.scrollTo({ top: positions.current[scope] || 0 })
    restoreScroll.current = false
  }, [current, scope, scrollContainerRef])
  useEffect(() => {
    if (!current || current.error || current.appendError || loading || current.nextOffset >= current.total) return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) load({ append: true })
    }, { root: scrollContainerRef.current, rootMargin: '160px' })
    if (sentinel.current) observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [current, load, loading, scrollContainerRef])

  const select = (entry) => {
    if (entry) returnEntry.current = `${entry.kind}:${entry.id}`
    if (!entry && stateRef.current.detailEntry) { window.history.back(); return }
    const next = { ...stateRef.current, selection: entry ? { kind: entry.kind, id: entry.id } : null, detailEntry: Boolean(entry) }
    remember(next, Boolean(entry) && !stateRef.current.selection)
    setState(next)
  }
  const changeScope = (nextScope) => {
    if (nextScope === scope) return
    setFiltersOpen(false)
    restoreScroll.current = true
    setState({ ...stateRef.current, scope: nextScope, selection: null, detailEntry: false })
  }
  const filterCount = ['owner_role_key', 'source_type', 'attention'].filter((field) => query[field]).length

  return (
    <>
      <MobileTaskPullRefresh key={paramsKey} scrollContainerRef={scrollContainerRef} enabled={!filtersOpen && !state.selection} busy={loading} onRefresh={load} lastUpdated={current?.updatedAt} />
      <section className="mobile-workflow-tracking" aria-label="流程跟踪">
        <SlidingSegmented block aria-label="跟踪范围" options={MOBILE_TRACKING_SCOPES} value={scope} onChange={changeScope} />
        <div className="mobile-workflow-tracking-search">
          <TrackingSearch key={scope} value={query.keyword} onSearch={(keyword) => updateQuery({ keyword })} />
          <MobileFilterPopover contextLabel="流程" title="流转筛选" open={filtersOpen} onOpenChange={setFiltersOpen} count={filterCount} onReset={() => updateQuery({ owner_role_key: '', source_type: '', attention: '' })}>
            <fieldset><legend>当前岗位</legend><Select aria-label="当前岗位" value={query.owner_role_key} options={TRACKING_ROLE_OPTIONS} onChange={(owner_role_key) => updateQuery({ owner_role_key })} /></fieldset>
            <fieldset><legend>单据类型</legend><Select aria-label="单据类型" value={query.source_type} options={TRACKING_SOURCE_OPTIONS} onChange={(source_type) => updateQuery({ source_type })} /></fieldset>
            <fieldset><legend>关注事项</legend><SlidingSegmented block aria-label="关注事项" value={query.attention} options={TRACKING_ATTENTION_OPTIONS} onChange={(attention) => updateQuery({ attention })} /></fieldset>
          </MobileFilterPopover>
        </div>
        <div className="mobile-workflow-tracking-status">
          {TRACKING_STATUS_OPTIONS.map((option) => <FilterChip key={option.value} selected={query.status === option.value} onClick={() => updateQuery({ status: option.value })}>{option.label}</FilterChip>)}
        </div>
        {current?.refreshError && <Alert type="error" showIcon message={current.refreshError} action={<Button onClick={() => load()}>重新读取</Button>} />}
        {!current ? <Spin tip="正在读取任务进度"><div className="erp-workflow-tracking-loading" /></Spin> : current.error ? <Alert type="error" showIcon message={current.error} action={<Button onClick={() => load()}>重新读取</Button>} /> : (
          <>
            <div className="mobile-workflow-tracking-count" role="status">共 {current.total} 条流转记录</div>
            <div className="mobile-workflow-tracking-list">
              {current.items.map((entry) => (
                <WorkflowTaskCard key={`${entry.kind}:${entry.id}`} className="mobile-workflow-tracking-card" label={`查看${trackingTitle(entry)}流转进度`} data-mobile-tracking-entry={`${entry.kind}:${entry.id}`} onOpen={() => select(entry)}>
                  <div className="mobile-workflow-tracking-heading"><strong>{trackingTitle(entry)}</strong><Tag color={trackingStatusColor(entry)}>{trackingStatus(entry)}</Tag></div>
                  <WorkflowTaskSource task={entry} copyable={false} />
                  {entry.display_context && <WorkflowTaskIdentity task={entry} compact copyable={false} showStyleNo />}
                  <div className="mobile-workflow-tracking-owner">{entry.current_tasks.length ? <WorkflowResponsibilities items={entry.current_tasks.map(trackingResponsibilityParts)} /> : trackingHandoff(entry)}</div>
                  <div className="mobile-workflow-tracking-origin"><WorkflowInitiator summary={entry} /><span>{formatWorkflowTaskEventTime(entry.started_at)}</span></div>
                </WorkflowTaskCard>
            ))}
            </div>
            {!current.items.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={Object.values(query).some(Boolean) ? '当前筛选下没有匹配记录' : scope === 'started' ? '暂无你发起的流程或跟进任务' : '暂无你处理过的流程或跟进任务'} />}
            <div ref={sentinel} className="mobile-workflow-tracking-more">
              {current.appendError ? <><p role="alert">{current.appendError}，已加载记录仍保留。</p><Button onClick={() => load({ append: true })}>重新读取更多</Button></> : loading ? <Spin size="small" /> : current.nextOffset < current.total ? <Button onClick={() => load({ append: true })}>加载更多</Button> : current.items.length ? <span>已显示全部流转记录</span> : null}
            </div>
          </>
      )}
        <WorkflowTrackingDrawer
          trackingRef={state.selection}
          onClose={() => select(null)}
          onOpenTask={(task) => { remember(stateRef.current); onOpenTask(task.id) }}
          refreshKey={revision}
          onAfterClose={() => {
          focusAfterClose.current = true
          // 抽屉先恢复其默认焦点，再回到本次流转记录的卡片。
          requestAnimationFrame(restoreCardFocus)
        }}
        />
      </section>
    </>
  )
}
