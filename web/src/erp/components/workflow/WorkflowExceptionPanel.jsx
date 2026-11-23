import React from 'react'
import { createPortal } from 'react-dom'
import {
  Alert,
  Button,
  Spin,
} from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import Pagination from '@/common/components/pagination/AppPagination'
import { WorkflowTaskStatus } from '@/common/consts/statuses.generated.mjs'
import FilterChip from '@/common/components/navigation/FilterChip'
import MobileSearchInput from '@/common/components/navigation/MobileSearchInput'
import HorizontalScroll from '@/common/components/scroll/HorizontalScroll'
import SearchInput from '@/common/components/SearchInput'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { message } from '@/common/utils/antdApp'
import {
  getWorkflowTask,
  listWorkflowExceptions,
} from '../../api/workflowApi.mjs'
import {
  normalizeTaskDiscoveryFilters,
  taskDiscoveryRequest,
} from '../../utils/workflowTaskDiscovery.mjs'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import {
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskStatusMeta,
} from '../../utils/workflowTaskBoard.mjs'
import WorkflowTaskDiscoveryFilters from './WorkflowTaskDiscoveryFilters.jsx'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator'
import useWorkflowTaskAssignees from '../../hooks/useWorkflowTaskAssignees'
import MobileScrollEdge from '../../mobile/components/MobileScrollEdge.jsx'
import { usePageLoadFeedback } from '../PageLoadFeedback.jsx'
import {
  exceptionDisposition,
  exceptionOrderNumbers,
  exceptionReason,
  exceptionTime,
  pendingExceptionTasks,
  WorkflowExceptionDetails,
  WorkflowExceptionStatusOverview,
  WorkflowExceptionStatusTag,
  WorkflowExceptionTable,
  workflowExceptionStateOptions,
} from './WorkflowExceptionBoard.jsx'
import WorkflowExceptionPhotos from './WorkflowExceptionPhotos.jsx'
import './workflowExceptions.css'

export default function WorkflowExceptionPanel({
  profile,
  roleKey = '',
  onOpenTask,
  compact = false,
  refreshKey = 0,
  initialQuery = {},
  onQueryChange,
  scrollContainerRef,
  renderRefreshControl,
  trackingRef,
  toolbarContainer = null,
}) {
  const [filters, setFilters] = React.useState(() => compact ? {} : normalizeTaskDiscoveryFilters(initialQuery.filters))
  const assignees = useWorkflowTaskAssignees(profile, roleKey, !compact)
  const [keyword, setKeyword] = React.useState(initialQuery.keyword || '')
  const [state, setState] = React.useState(initialQuery.state || '')
  const [view, setView] = React.useState(initialQuery.view || '')
  const [selectedKey, setSelectedKey] = React.useState(initialQuery.selectedKey || '')
  const detailID = React.useId()
  const desktop = !compact && !trackingRef
  const [listPosition, setListPosition] = React.useState(initialQuery.listPosition || null)
  const [page, setPage] = React.useState(initialQuery.page || 1)
  const [loadedCount, setLoadedCount] = React.useState(initialQuery.loadedCount || 20)
  const [loading, setLoading] = React.useState(false)
  const [result, setResult] = React.useState(null)
  const [opening, setOpening] = React.useState(null)
  const [actionError, setActionError] = React.useState('')
  const taskRead = React.useRef(null)
  const resultRef = React.useRef(null)
  const loadedCountRef = React.useRef(loadedCount)
  const appendPending = React.useRef(false)
  const sentinel = React.useRef(null)
  const panelRef = React.useRef(null)
  const restoreScroll = React.useRef(initialQuery.scrollTop || 0)
  const restoreFocus = React.useRef(null)
  const begin = useLatestRequestCoordinator()
  resultRef.current = result
  loadedCountRef.current = loadedCount
  const access = `${profile?.id}:${JSON.stringify(profile?.effective_session || profile?.permissions || [])}`
  const queryScope = {
    ...(compact ? {} : taskDiscoveryRequest(filters)),
    ...(roleKey ? { owner_role_key: roleKey } : {}),
    ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
    ...(trackingRef ? { tracking_kind: trackingRef.kind, tracking_id: trackingRef.id } : {}),
  }
  const summaryKey = `${access}:${JSON.stringify(queryScope)}`
  const request = JSON.stringify({
    ...queryScope,
    ...(state ? { state } : {}),
    ...(view ? { view } : {}),
    limit: 20,
    offset: compact ? 0 : (page - 1) * 20,
  })
  const key = `${access}:${request}`
  const listField = view === 'tasks' ? 'tasks' : view === 'orders' ? 'orders' : 'items'
  React.useEffect(() => {
    onQueryChange?.({ ...(compact ? {} : { filters, selectedKey }), keyword, state, view, page, loadedCount, listPosition })
  }, [compact, filters, keyword, state, view, selectedKey, page, loadedCount, listPosition, onQueryChange])
  React.useEffect(() => () => taskRead.current?.abort(), [key, refreshKey, selectedKey])
  const load = React.useCallback(async ({ append = false, showRefreshFeedback = false } = {}) => {
    const previous = resultRef.current?.key === key ? resultRef.current : null
    if (append && (appendPending.current || !previous?.hasMore)) return
    const read = begin('exceptions')
    appendPending.current = append
    setLoading(true)
    setActionError('')
    try {
      const params = JSON.parse(request)
      let offset = append ? previous.nextOffset : params.offset
      let rows = append ? previous.data[listField] : []
      let data
      let hasMore
      do {
        data = await listWorkflowExceptions({ ...params, offset }, { signal: read.signal })
        if (!read.isCurrent()) return
        const batch = data[listField]
        rows = [...new Map([...rows, ...batch].map((item) => [item.key || item.id, item])).values()]
        offset += batch.length
        hasMore = batch.length > 0 && offset < data.view_total
      } while (compact && !append && hasMore && offset < loadedCountRef.current)
      setResult({
        key,
        summaryKey,
        data: { ...data, [listField]: rows },
        nextOffset: offset,
        hasMore,
        updatedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      })
      if (compact) setLoadedCount(Math.max(20, offset))
      if (showRefreshFeedback) message.success({ key: 'mobile-exceptions-refresh', content: '异常跟踪已刷新' })
    } catch (error) {
      if (!read.isCurrent()) return
      const feedback = getActionErrorMessage(error, append ? '读取更多异常跟踪信息' : '读取异常跟踪信息')
      setResult(previous?.data
        ? { ...previous, appendError: append ? feedback : '', refreshError: append ? previous.refreshError : feedback }
        : { key, error: feedback })
    } finally {
      if (read.isCurrent()) {
        appendPending.current = false
        setLoading(false)
        read.finish()
      }
    }
  }, [begin, compact, key, listField, request, summaryKey])
  React.useEffect(() => {
    load()
    return () => { const read = begin('exceptions'); read.finish() }
  }, [begin, load, refreshKey])
  const current = result?.key === key ? result : null
  const summaryData = result?.summaryKey === summaryKey ? result.data : undefined
  const selected = desktop && !view ? current?.data?.items.find((item) => item.key === selectedKey) : null
  const activeOpening = opening?.key === key && opening?.selectedKey === selectedKey
  const loadFeedback = usePageLoadFeedback({
    error: current?.error || current?.refreshError || current?.appendError,
    retry: () => load({ append: Boolean(current?.appendError && !current?.error && !current?.refreshError) }),
  })
  const scrollContainer = () => scrollContainerRef?.current || panelRef.current?.closest('.erp-admin-content')
  React.useLayoutEffect(() => {
    if (current?.data && restoreScroll.current !== null) {
      const container = scrollContainerRef?.current || panelRef.current?.closest('.erp-admin-content')
      if (container) container.scrollTop = restoreScroll.current
      restoreScroll.current = null
      if (restoreFocus.current) {
        panelRef.current?.querySelector(restoreFocus.current)?.focus({ preventScroll: true })
        restoreFocus.current = null
      }
    }
  }, [current, scrollContainerRef])
  React.useEffect(() => {
    if (!compact || !scrollContainerRef?.current || !sentinel.current || !current?.hasMore || current.appendError || current.refreshError || loading) return undefined
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) load({ append: true })
    }, { root: scrollContainerRef.current, rootMargin: '0px 0px 180px 0px' })
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [compact, current, load, loading, scrollContainerRef])
  const resetPosition = () => {
    restoreScroll.current = null
    setPage(1)
    setLoadedCount(20)
    setSelectedKey('')
    scrollContainer()?.scrollTo?.({ top: 0 })
  }
  const selectState = (next) => {
    setState(state === next ? '' : next)
    resetPosition()
  }
  const openRelated = (next) => {
    setListPosition({ page, loadedCount, scrollTop: scrollContainer()?.scrollTop || 0 })
    setView(next)
    setPage(1)
    setLoadedCount(20)
    restoreScroll.current = 0
    restoreFocus.current = '.workflow-exceptions__detail-heading'
  }
  const returnToExceptions = () => {
    restoreFocus.current = `[data-exception-related="${view}"]`
    restoreScroll.current = listPosition?.scrollTop || 0
    setPage(listPosition?.page || 1)
    setLoadedCount(listPosition?.loadedCount || 20)
    setView('')
  }
  const search = { value: keyword, onSearch: (value) => { setKeyword(value); resetPosition() } }
  const openTask = async (id) => {
    if (taskRead.current && !taskRead.current.signal.aborted) return
    const controller = new AbortController()
    taskRead.current = controller
    setOpening({ id, key, selectedKey })
    setActionError('')
    try {
      const task = await getWorkflowTask(id, { signal: controller.signal })
      if (!controller.signal.aborted) onOpenTask?.(task)
    } catch (error) {
      if (!controller.signal.aborted) {
        setActionError(getActionErrorMessage(error, '打开异常关联任务'))
      }
    } finally {
      if (taskRead.current === controller) taskRead.current = null
      if (!controller.signal.aborted) setOpening(null)
    }
  }
  const renderTask = (task, showPath = true) => (
    <div key={task.id} className="workflow-exceptions__task">
      {onOpenTask ? (
        <Button
          type="link"
          loading={activeOpening && opening?.id === task.id}
          onClick={() => openTask(task.id)}
        >
          {getWorkflowTaskDisplayName(task)}
        </Button>
      ) : <strong>{getWorkflowTaskDisplayName(task)}</strong>}
      <span>
        {getWorkflowTaskOwnerRoleLabel(task)} ·{' '}
        {task.discovery?.assignee_name ? `${task.discovery.assignee_name} · ` : [WorkflowTaskStatus.READY, WorkflowTaskStatus.BLOCKED].includes(task.task_status_key) ? '未指定办理人 · ' : ''}
        {getWorkflowTaskStatusMeta(task).label}
      </span>
      {showPath && task.discovery?.path ? <small>{task.discovery.path}</small> : null}
    </div>
  )
  const filterControls = (
    <WorkflowTaskDiscoveryFilters
      labelPlacement={toolbarContainer ? 'inline' : 'stacked'}
      profile={profile}
      roleKey={roleKey}
      value={filters}
      people={assignees.people}
      peopleError={assignees.error}
      onRetryPeople={assignees.reload}
      onChange={(next) => {
        setFilters(next)
        resetPosition()
      }}
    />
  )
  const selectRecord = (next) => {
    setActionError('')
    setSelectedKey((previous) => previous === next ? '' : next)
  }
  const closeRecord = () => {
    setSelectedKey('')
    const recordButtons = panelRef.current?.querySelectorAll('[data-exception-record]')
    if (recordButtons) {
      Array.from(recordButtons).find((button) => button.dataset.exceptionRecord === selectedKey)?.focus()
    }
  }
  const changePage = (next) => {
    if (!view) setSelectedKey('')
    setPage(next)
    scrollContainer()?.scrollTo?.({ top: 0 })
  }
  const pagination = {
    current: page,
    pageSize: 20,
    total: current?.data?.view_total ?? 0,
    showSizeChanger: false,
    onChange: changePage,
    hideOnSinglePage: true,
  }
  const stateFilters = (
    <HorizontalScroll className="workflow-exceptions__states" role="group" aria-label="异常处理状态">
      {workflowExceptionStateOptions(current?.data, true).map((option) => <FilterChip key={option.value} count={option.count} selected={state === option.value} removable={Boolean(option.value)} onClick={() => selectState(option.value)}>{option.label}</FilterChip>)}
    </HorizontalScroll>
  )
  const controls = (
    <div className="workflow-exceptions__controls" hidden={Boolean(view)}>
      {!compact && filterControls}
      <div className="workflow-exceptions__query erp-mobile-search-row">
        {compact ? <MobileSearchInput
          aria-label="搜索异常单号、订单、批次或原因"
          placeholder="单号/原因"
          searchHint="可搜索：异常单号、订单、批次、原因"
          {...search}
        /> : <SearchInput
          {...search}
          aria-label="搜索异常单号、订单、批次或原因"
          placeholder="搜异常单或原因"
          searchHint="可搜索：异常单号、订单、批次、原因"
          maxLength={100}
          allowClear
        />}
      </div>
      {compact && stateFilters}
      {compact && <MobileScrollEdge scrollContainerRef={scrollContainerRef} />}
    </div>
  )
  const relatedLinks = (
    <div className="workflow-exceptions__summary" aria-label="异常关联入口">
      <div className="workflow-exceptions__related-links">
        {[
          ['tasks', '关联待办', 'pending_tasks'],
          ['orders', '关联订单', 'affected_orders'],
        ].map(([value, label, count]) => (
          <Button type="link" key={value} data-exception-related={value} disabled={!current?.data} onClick={() => openRelated(value)}>
            {label} <strong>{current?.data?.[count] ?? '—'}</strong><RightOutlined aria-hidden />
          </Button>
        ))}
      </div>
    </div>
  )
  return (
    <section ref={panelRef} className={`workflow-exceptions${compact ? ' workflow-exceptions--mobile erp-mobile-controls' : ' workflow-exceptions--board'}${desktop && view ? ' workflow-exceptions--related' : ''}`} aria-label="异常跟踪" aria-busy={loading}>
      {view ? (
        <header className="workflow-exceptions__detail-header">
          <Button icon={<LeftOutlined aria-hidden />} onClick={returnToExceptions}>返回异常跟踪</Button>
          <h3 className="workflow-exceptions__detail-heading" tabIndex={-1}>
            {view === 'tasks' ? '关联待办' : '关联订单'}
            {current?.data ? <span> {current.data.view_total} 项</span> : null}
          </h3>
        </header>
        ) : null}
      {!trackingRef && (toolbarContainer ? createPortal(controls, toolbarContainer) : !view && controls)}
      {desktop && !view ? <WorkflowExceptionStatusOverview data={summaryData} state={state} onSelect={selectState} /> : null}
      {!desktop && !trackingRef && !view ? relatedLinks : null}
      {renderRefreshControl?.({ key, onRefresh: load, busy: loading, enabled: !activeOpening, lastUpdated: current?.updatedAt })}
      {actionError ? (
        <Alert type="error" showIcon message={actionError} />
        ) : null}
      {loadFeedback.visible && (current.error || current.refreshError) ? <Alert type="error" showIcon message={current.error || current.refreshError} description={current.refreshError ? '已保留上次结果。' : undefined} action={<Button loading={loading || loadFeedback.retrying} onClick={loadFeedback.retry}>重试</Button>} /> : null}
      {!current ? (
        <Spin tip="正在读取异常跟踪信息">
          <div className="workflow-exceptions__loading" />
        </Spin>
        ) : current.error ? null : (
          <>
            {view === 'tasks' ? (
              current.data.tasks.length ? (
                current.data.tasks.map((task) => renderTask(task))
              ) : (
                <Empty
                  description="当前条件下没有待处理关联任务"
                />
              )
            ) : view === 'orders' ? (
              current.data.orders.length ? (
                current.data.orders.map((order) => (
                  <article className="workflow-exceptions__item" key={order.id}>
                    <strong>{order.number}</strong>
                  </article>
                ))
              ) : (
                <Empty
                  description="当前条件下没有可见的关联订单"
                />
              )
            ) : desktop ? (
              <div className={`workflow-exceptions__workspace${selected ? ' workflow-exceptions__workspace--split' : ''}`}>
                <WorkflowExceptionTable items={current.data.items} selectedKey={selected?.key} detailID={detailID} onSelect={selectRecord} tableHeader={relatedLinks} pagination={pagination} />
                {selected ? <WorkflowExceptionDetails key={selected.key} id={detailID} item={selected} renderTask={renderTask} onClose={closeRecord} /> : null}
              </div>
            ) : current.data.items.length ? (
              current.data.items.map((item) => {
                const pending = pendingExceptionTasks(item)
                return (
                  <article className="workflow-exceptions__item" key={item.key}>
                    <div className="workflow-exceptions__heading">
                      <strong>{item.number}</strong>
                      <WorkflowExceptionStatusTag value={item.state} />
                    </div>
                    <p>
                      {exceptionOrderNumbers(item)}
                      {item.batch_no ? ` · ${item.batch_no}` : ''}
                    </p>
                    <p>{exceptionReason(item)}</p>
                    <p>
                      处置：{exceptionDisposition(item)} ·
                      发生于 {exceptionTime(item)}
                    </p>
                    {item.task_ids.length ? (
                      <>
                        {pending.length ? (
                          <div className="workflow-exceptions__pending">
                            <span>当前待办</span>
                            {pending.slice(0, 2).map((task) => renderTask(task, false))}
                          </div>
                        ) : null}
                        {item.task_ids.length > Math.min(pending.length, 2) ? (
                          <details className="workflow-exceptions__tasks">
                            <summary>全部关联任务 {item.task_ids.length} 项{pending.length > 2 ? `（另有${item.task_ids.length > item.tasks.length ? '至少' : ''} ${pending.length - 2} 项待办）` : ''}</summary>
                            {item.tasks.map((task) => renderTask(task))}
                            {item.task_ids.length > item.tasks.length ? (
                              <p>
                                当前列出前 {item.tasks.length}{' '}
                                项，可从关联任务进入完整处理链继续查看。
                              </p>
                            ) : null}
                          </details>
                        ) : null}
                      </>
                    ) : null}
                    <WorkflowExceptionPhotos sources={item.quality_photo_sources} />
                  </article>
                )
              })
            ) : (
              <Empty
                description={trackingRef ? '本流程暂无可见异常' : '当前条件下没有可跟踪的异常'}
              />
            )}
            {compact ? (
              <div ref={sentinel} className="workflow-exceptions__more">
                {current.data[listField].length ? <span role="status">{current.hasMore ? `已显示 ${current.data[listField].length} / 共 ${current.data.view_total} 条` : `已显示全部 ${current.data.view_total} 条`}</span> : null}
                {current.appendError ? loadFeedback.visible && !current.refreshError ? <><p role="alert">{current.appendError}，已加载记录仍保留。</p><Button loading={loading || loadFeedback.retrying} onClick={loadFeedback.retry}>重新读取更多</Button></> : null : loading ? <Spin size="small" /> : current.hasMore ? <Button onClick={() => load({ append: true })}>加载更多</Button> : null}
              </div>
            ) : (!desktop || view) ? <Pagination {...pagination} /> : null}
          </>
        )}
    </section>
  )
}
