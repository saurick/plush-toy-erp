import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Alert, Button, Spin } from 'antd'
import { ArrowDownOutlined, ArrowRightOutlined, ArrowUpOutlined, SortAscendingOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import { BusinessOperationPanel, SearchInput, SelectFilter } from '../business-list/BusinessListLayout.jsx'
import { DateRangeFilter } from '../business-list/BusinessDateInputs.jsx'
import { clearTrackingFilters, readTrackingFilters, writeTrackingFilters, readTrackingPagination, writeTrackingPagination, TRACKING_STATUS_OPTIONS, TRACKING_ROLE_OPTIONS, TRACKING_SOURCE_OPTIONS } from '../../utils/workflowTrackingFilters.mjs'
import { listWorkflowTracking } from '../../api/workflowApi.mjs'
import { formatWorkflowTaskEventTime } from '../../utils/workflowTaskEventPresentation.mjs'
import { WORKFLOW_TASKS_CHANGED } from '../../utils/workflowTaskChanges.mjs'
import { openWorkflowTaskRow } from '../../utils/workflowTaskEntry.mjs'
import { getWorkflowTaskIdentityPresentation } from '../../utils/workflowTaskIdentity.mjs'
import BusinessStatusFilter from '../business-list/BusinessStatusFilter.jsx'
import { resolveBusinessStatusCounts } from '../../utils/businessStatusCounts.mjs'
import WorkflowTrackingDrawer, { WorkflowTrackingDetailPane } from './WorkflowTrackingDrawer.jsx'
import { trackingEntryLabel, WorkflowTrackingProgress } from './WorkflowTrackingListItem.jsx'
import { WorkflowTaskSource } from './WorkflowTaskCopy.jsx'
import { WorkflowTrackingAttentionFilter, WorkflowTrackingScopeFilter } from './WorkflowTrackingQuickFilters.jsx'
import WorkflowTaskPagination from './WorkflowTaskPagination.jsx'
import { isWorkflowTrackingKind } from '../../utils/workflowTracking.mjs'
import './workflowTracking.css'

const SPLIT_MIN_WIDTH = 840
const entryKey = (entry) => entry ? `${entry.kind}:${entry.id}` : ''

function clearTrackingSelection(params) {
  params.delete('track_kind')
  params.delete('track_id')
  return params
}

export default function WorkflowTrackingPanel({ scope, recordType = 'flow', sessionKey, refreshKey, onOpenTask, onScopeChange, taskHandlingOpen = false, toolbarContainer = null }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [result, setResult] = useState(null)
  const [reload, setReload] = useState(0)
  const [split, setSplit] = useState(false)
  const panelRef = useRef(null)
  const listRef = useRef(null)
  const paneID = useId()
  const pageScrollScope = useRef(null)
  const returnEntry = useRef('')
  const drawerOpen = useRef(false)
  const followups = recordType === 'task'
  const filterScope = followups ? `task_${scope}` : scope
  const recordLabel = followups ? '跟进记录' : '流程记录'
  const keyword = searchParams.get(`track_search_${filterScope}`) || ''
  const sourceType = searchParams.get('track_source_type') || ''
  const sourceID = Number(searchParams.get('track_source_id'))
  const source = sourceType && Number.isSafeInteger(sourceID) && sourceID > 0
    ? { source_type: sourceType, source_id: sourceID } : {}
  const filters = readTrackingFilters(searchParams, filterScope)
  const sortKey = `track_sort_${filterScope}`
  const requestedSort = searchParams.get(sortKey)
  const direction = ['asc', 'desc'].includes(requestedSort) ? requestedSort : ''
  const { page: pageNumber, pageSize } = readTrackingPagination(searchParams, filterScope)
  const changeFilters = (changes) => {
    pageScrollScope.current = filterScope
    setSearchParams((current) => clearTrackingSelection(writeTrackingFilters(current, filterScope, changes)), { replace: true })
  }
  const changePage = (number, size) => {
    if (number === pageNumber && size === pageSize) return
    pageScrollScope.current = filterScope
    setSearchParams((current) => clearTrackingSelection(writeTrackingPagination(current, filterScope, number, size)), { replace: true })
  }
  const changeSort = () => {
    pageScrollScope.current = filterScope
    setSearchParams((current) => {
      const next = clearTrackingSelection(writeTrackingPagination(current, filterScope, 1, pageSize))
      if (direction === 'desc') next.delete(sortKey)
      else next.set(sortKey, direction === 'asc' ? 'desc' : 'asc')
      return next
    }, { replace: true })
  }
  const hasFilters = Boolean(keyword || Object.values(filters).some(Boolean))
  const completed = filters.status === 'completed'
  const filtersKey = JSON.stringify({ scope, record_type: recordType, keyword, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)), ...source, limit: pageSize })
  const listKey = JSON.stringify([filtersKey, sessionKey])
  const paramsKey = JSON.stringify({ ...JSON.parse(filtersKey), ...(direction ? { sort_direction: direction } : {}), offset: (pageNumber - 1) * pageSize })
  const key = JSON.stringify([paramsKey, sessionKey, refreshKey, reload])
  const search = {
    resetKey: filterScope,
    value: keyword,
    onSearch: (value) => changeFilters({ search: value }),
  }
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return undefined
    const measure = () => setSplit(panel.clientWidth >= SPLIT_MIN_WIDTH)
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(panel)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const refresh = () => setReload((value) => value + 1)
    window.addEventListener(WORKFLOW_TASKS_CHANGED, refresh)
    return () => window.removeEventListener(WORKFLOW_TASKS_CHANGED, refresh)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    listWorkflowTracking(JSON.parse(paramsKey), { signal: controller.signal }).then(
      (page) => { if (!controller.signal.aborted) setResult({ key, listKey, paramsKey, page, total: page.total }) },
      () => { if (!controller.signal.aborted) setResult((previous) => ({ key, listKey, error: true, total: previous?.listKey === listKey ? previous.total : 0 })) }
    )
    return () => controller.abort()
  }, [key, listKey, paramsKey])
  const current = result?.key === key ? result : null
  const page = result?.listKey === listKey && result.paramsKey === paramsKey ? result.page : undefined
  const total = result?.listKey === listKey ? result.total : 0
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const outOfRange = Boolean(current?.page && pageNumber > lastPage)
  useEffect(() => {
    if (outOfRange) setSearchParams((params) => writeTrackingPagination(params, filterScope, lastPage, pageSize), { replace: true })
  }, [outOfRange, lastPage, pageSize, filterScope, setSearchParams])
  useLayoutEffect(() => {
    if (!page || outOfRange) return
    if (pageScrollScope.current === filterScope) {
      if (split && listRef.current) listRef.current.scrollTop = 0
      else listRef.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
    }
    pageScrollScope.current = null
  }, [page, outOfRange, filterScope, split])
  const select = (entry) => {
    const next = new URLSearchParams(searchParams)
    if (entry) { next.set('track_kind', entry.kind); next.set('track_id', String(entry.id)) }
    else clearTrackingSelection(next)
    setSearchParams(next, { replace: true })
  }
  const selectedKind = searchParams.get('track_kind')
  const selectedID = Number(searchParams.get('track_id'))
  const selected = isWorkflowTrackingKind(selectedKind) && Number.isSafeInteger(selectedID) && selectedID > 0
    ? { kind: selectedKind, id: selectedID } : null
  const preview = selected || (split && !outOfRange ? page?.items[0] : null)
  const selectedKey = entryKey(preview)
  if (preview) returnEntry.current = selectedKey
  drawerOpen.current = Boolean(!split && selected) || taskHandlingOpen
  const restoreEntryFocus = () => {
    // Ant Design restores the most recent drawer trigger. After a round trip
    // through handling, that trigger can be hidden; return to the original row.
    queueMicrotask(() => {
      if (drawerOpen.current) return
      const entry = panelRef.current?.querySelector(`[data-tracking-entry="${returnEntry.current}"]`)
      const target = entry || toolbarContainer?.querySelector('input') || panelRef.current?.querySelector('input')
      target?.focus({ preventScroll: true })
    })
  }
  const openTask = onOpenTask ? (task) => {
    if (!selected && preview) select(preview)
    onOpenTask(task)
  } : undefined
  const loading = !current || outOfRange
  const emptyText = hasFilters || source.source_id ? '当前筛选下没有匹配记录' : `暂无${scope === 'started' ? '你发起的' : scope === 'participated' ? '你参与的' : '可查看的'}${recordLabel}`
  const controls = (
    <div className="erp-workflow-tracking-controls" data-page-table-toolbar={toolbarContainer ? undefined : true}>
      <BusinessOperationPanel
        compact
        activeFilterCount={[filters.owner_role_key, !source.source_id && filters.source_type, filters.date_from || filters.date_to].filter(Boolean).length}
        onClearFilters={() => {
          pageScrollScope.current = filterScope
          setSearchParams((current) => clearTrackingSelection(clearTrackingFilters(current, filterScope)), { replace: true })
        }}
        filters={(
          <>
            <SearchInput placeholder="搜单号、任务、产品" searchHint="可搜索：单号、任务、产品、款号" aria-label="单号 / 任务 / 产品 / 款号" {...search} />
            <SelectFilter aria-label="当前岗位" value={filters.owner_role_key} disabled={completed} options={TRACKING_ROLE_OPTIONS} onChange={(owner_role_key) => changeFilters({ owner_role_key })} />
            {!source.source_id ? <SelectFilter aria-label="单据类型" value={filters.source_type} options={TRACKING_SOURCE_OPTIONS} onChange={(source_type) => changeFilters({ source_type })} /> : null}
            <DateRangeFilter
              options={[{ value: 'started_at', label: '发起时间' }]}
              value="started_at"
              startValue={filters.date_from}
              endValue={filters.date_to}
              onRangeChange={(date_from, date_to) => changeFilters({ date_from, date_to })}
            />
          </>
        )}
        actions={source.source_id ? (
          <Button onClick={() => {
            const next = clearTrackingSelection(new URLSearchParams(searchParams))
            next.delete('track_source_type')
            next.delete('track_source_id')
            for (const view of ['started', 'participated', 'visible', 'task_started', 'task_participated', 'task_visible']) next.delete(`track_page_${view}`)
            pageScrollScope.current = filterScope
            setSearchParams(next)
          }}
          >
            清除单据范围
          </Button>
        ) : null}
      />
      <div className="erp-workflow-tracking-filter-row" role="group" aria-label="快捷筛选">
        {onScopeChange ? <WorkflowTrackingScopeFilter value={scope} onChange={onScopeChange} /> : null}
        <WorkflowTrackingAttentionFilter value={filters.attention} disabled={completed} onChange={(attention) => changeFilters({ attention })} />
        <BusinessStatusFilter aria-label="流转状态" allLabel="全部状态" value={filters.status} options={TRACKING_STATUS_OPTIONS} counts={resolveBusinessStatusCounts(page)} loading={!current} onChange={(status) => changeFilters({ status })} />
      </div>
    </div>
  )
  return (
    <div ref={panelRef} className="erp-workflow-tracking-panel" data-layout={split ? 'split' : 'list'}>
      {toolbarContainer ? createPortal(controls, toolbarContainer) : controls}
      <div className="erp-workflow-tracking-layout">
        <section className="erp-workflow-tracking-list" aria-label={recordLabel} aria-busy={loading}>
          <div className="erp-workflow-tracking-list-header">
            <strong>{recordLabel}</strong>
            <Button type="text" size="small" onClick={changeSort} icon={direction === 'asc' ? <ArrowUpOutlined /> : direction === 'desc' ? <ArrowDownOutlined /> : <SortAscendingOutlined />} aria-label={`发起时间排序${direction === 'asc' ? '，从早到晚' : direction === 'desc' ? '，从晚到早' : ''}`}>
              发起时间
            </Button>
          </div>
          <div className="erp-workflow-tracking-list-body" ref={listRef}>
            {current?.error ? <Alert type="error" showIcon message="任务进度加载失败" action={<Button onClick={() => setReload((value) => value + 1)}>重新读取</Button>} /> : !page || outOfRange ? (
              <Spin tip="正在读取流转记录"><div className="erp-workflow-tracking-loading" /></Spin>
            ) : page.items.length ? (
              <ul className="erp-workflow-tracking-entries">
                {page.items.map((entry) => {
                  const identity = entryKey(entry)
                  const active = identity === selectedKey
                  const { first, compactCountLabel } = getWorkflowTaskIdentityPresentation(entry, keyword)
                  const subject = first?.name || first?.code
                  return (
                    <li key={identity} className="erp-workflow-tracking-entry" data-selected={active || undefined}>
                      <div className="erp-workflow-tracking-entry-row" role="presentation" onClick={(event) => openWorkflowTaskRow(event, () => select(entry))}>
                        <div className="erp-workflow-tracking-entry-content">
                          <strong className="erp-workflow-tracking-document"><WorkflowTaskSource task={entry} showUnavailable={false} /></strong>
                          {subject ? <span className="erp-workflow-tracking-subject">{subject}{compactCountLabel ? ` · ${compactCountLabel}` : ''}</span> : null}
                          <div className="erp-workflow-tracking-entry-meta">
                            <WorkflowTrackingProgress entry={entry} />
                            <span className="erp-workflow-tracking-started-at">{formatWorkflowTaskEventTime(entry.started_at).replace(/:\d{2}$/u, '')}</span>
                          </div>
                        </div>
                        <Button
                          type="text"
                          icon={<ArrowRightOutlined />}
                          data-task-entry
                          data-tracking-entry={identity}
                          aria-current={active || undefined}
                          aria-controls={split ? paneID : undefined}
                          aria-haspopup={split ? undefined : 'dialog'}
                          aria-label={trackingEntryLabel(entry)}
                          title="查看流程详情"
                          onClick={(event) => {
                            event.stopPropagation()
                            event.currentTarget.focus({ preventScroll: true })
                            select(entry)
                          }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : <Empty description={emptyText} />}
          </div>
          <WorkflowTaskPagination
            total={total}
            current={outOfRange ? lastPage : pageNumber}
            pageSize={pageSize}
            loading={loading}
            error={Boolean(current?.error)}
            onChange={changePage}
            recordLabel="流转记录"
            unit="条"
          />
        </section>
        {split ? (
          <WorkflowTrackingDetailPane
            paneID={paneID}
            trackingRef={preview}
            onOpenTask={openTask}
            refreshKey={key}
            suspended={taskHandlingOpen}
            overview={<Empty description={loading ? '正在读取流转记录' : '暂无可预览的流程'} />}
          />
        ) : (
          <WorkflowTrackingDrawer
            trackingRef={selected}
            open={Boolean(selected && !taskHandlingOpen)}
            suspended={taskHandlingOpen}
            onClose={() => select(null)}
            onOpenTask={openTask}
            onAfterClose={restoreEntryFocus}
            refreshKey={key}
          />
        )}
      </div>
    </div>
  )
}
