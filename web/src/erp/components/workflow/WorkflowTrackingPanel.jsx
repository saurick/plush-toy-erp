import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Alert, Button, Tag } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import Table from '@/common/components/table/AppTable'
import useLiveSearch from '@/common/hooks/useLiveSearch'
import { BusinessOperationPanel, SearchInput, SelectFilter, DateRangeFilter } from '../business-list/BusinessListLayout.jsx'
import { clearTrackingFilters, readTrackingFilters, writeTrackingFilters, readTrackingPagination, writeTrackingPagination, TRACKING_STATUS_OPTIONS, TRACKING_ROLE_OPTIONS, TRACKING_ATTENTION_OPTIONS, TRACKING_SOURCE_OPTIONS } from '../../utils/workflowTrackingFilters.mjs'
import { listWorkflowTracking } from '../../api/workflowApi.mjs'
import { formatWorkflowTaskEventTime } from '../../utils/workflowTaskEventPresentation.mjs'
import { trackingHandoff, trackingResponsibilityParts, trackingStatus, trackingStatusColor, trackingTitle } from '../../utils/workflowTracking.mjs'
import { WORKFLOW_TASKS_CHANGED } from '../../utils/workflowTaskChanges.mjs'
import { openWorkflowTaskRow } from '../../utils/workflowTaskEntry.mjs'
import { getWorkflowTaskSourceNo } from '../../utils/dashboardTaskDisplay.mjs'
import WorkflowTrackingDrawer from './WorkflowTrackingDrawer.jsx'
import WorkflowResponsibilities from './WorkflowResponsibilities.jsx'
import WorkflowInitiator from './WorkflowInitiator.jsx'
import WorkflowTaskIdentity from './WorkflowTaskIdentity.jsx'
import WorkflowTaskPagination from './WorkflowTaskPagination.jsx'
import { WorkflowTaskSource } from './WorkflowTaskCopy.jsx'
import './workflowTracking.css'

export default function WorkflowTrackingPanel({ scope, sessionKey, refreshKey, onOpenTask, taskHandlingOpen = false }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [result, setResult] = useState(null)
  const [reload, setReload] = useState(0)
  const panelRef = useRef(null)
  const pageScrollPending = useRef(false)
  const returnEntry = useRef('')
  const drawerOpen = useRef(false)
  const keyword = searchParams.get(`track_search_${scope}`) || ''
  const sourceType = searchParams.get('track_source_type') || ''
  const sourceID = Number(searchParams.get('track_source_id'))
  const source = sourceType && Number.isSafeInteger(sourceID) && sourceID > 0
    ? { source_type: sourceType, source_id: sourceID } : {}
  const filters = readTrackingFilters(searchParams, scope)
  const { page: pageNumber, pageSize } = readTrackingPagination(searchParams, scope)
  const changeFilters = (changes) => setSearchParams((current) => writeTrackingFilters(current, scope, changes), { replace: true })
  const changePage = (number, size) => {
    if (number === pageNumber && size === pageSize) return
    pageScrollPending.current = true
    setSearchParams((current) => writeTrackingPagination(current, scope, number, size), { replace: true })
  }
  const hasFilters = Boolean(keyword || Object.values(filters).some(Boolean))
  const filtersKey = JSON.stringify({ scope, keyword, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)), ...source, limit: pageSize })
  const listKey = JSON.stringify([filtersKey, sessionKey])
  const paramsKey = JSON.stringify({ ...JSON.parse(filtersKey), offset: (pageNumber - 1) * pageSize })
  const key = JSON.stringify([paramsKey, sessionKey, refreshKey, reload])
  const search = useLiveSearch({
    value: keyword,
    onSearch: (value) => changeFilters({ search: value }),
  })
  useEffect(() => {
    const refresh = () => setReload((value) => value + 1)
    window.addEventListener(WORKFLOW_TASKS_CHANGED, refresh)
    return () => window.removeEventListener(WORKFLOW_TASKS_CHANGED, refresh)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    listWorkflowTracking(JSON.parse(paramsKey), { signal: controller.signal }).then(
      (page) => { if (!controller.signal.aborted) setResult({ key, listKey, page, total: page.total }) },
      () => { if (!controller.signal.aborted) setResult((previous) => ({ key, listKey, error: true, total: previous?.listKey === listKey ? previous.total : 0 })) }
    )
    return () => controller.abort()
  }, [key, listKey, paramsKey])
  const current = result?.key === key ? result : null
  const page = current?.page
  const total = result?.listKey === listKey ? result.total : 0
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const outOfRange = Boolean(page && pageNumber > lastPage)
  useEffect(() => {
    if (outOfRange) setSearchParams((params) => writeTrackingPagination(params, scope, lastPage, pageSize), { replace: true })
  }, [outOfRange, lastPage, pageSize, scope, setSearchParams])
  useLayoutEffect(() => {
    if (!page || outOfRange || !pageScrollPending.current) return
    panelRef.current?.querySelector('.ant-table-wrapper')?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
    pageScrollPending.current = false
  }, [page, outOfRange])
  const select = (entry) => {
    const next = new URLSearchParams(searchParams)
    if (entry) { next.set('track_kind', entry.kind); next.set('track_id', String(entry.id)) }
    else { next.delete('track_kind'); next.delete('track_id') }
    setSearchParams(next, { replace: true })
  }
  const selectedKind = searchParams.get('track_kind')
  const selectedID = Number(searchParams.get('track_id'))
  const selected = ['task', 'process'].includes(selectedKind) && Number.isSafeInteger(selectedID) && selectedID > 0
    ? { kind: selectedKind, id: selectedID } : null
  if (selected) returnEntry.current = `${selected.kind}:${selected.id}`
  drawerOpen.current = Boolean(selected) || taskHandlingOpen
  const restoreEntryFocus = () => {
    // Ant Design restores the most recent drawer trigger. After a round trip
    // through handling, that trigger can be hidden; return to the original row.
    queueMicrotask(() => {
      if (drawerOpen.current) return
      const entry = panelRef.current?.querySelector(`[data-tracking-entry="${returnEntry.current}"]`)
      const target = entry || panelRef.current?.querySelector('input')
      target?.focus({ preventScroll: true })
    })
  }
  const columns = [
    {
      title: '事项 / 来源单号',
      key: 'title',
      render: (_, entry) => (
        <div className="erp-workflow-tracking-title">
          <strong>{trackingTitle(entry)}</strong>
          <WorkflowTaskSource task={entry} label={getWorkflowTaskSourceNo(entry)} />
        </div>
      ),
    },
    { title: '关联产品 / 物料',
key: 'identity',
width: 320,
render: (_, entry) => entry.display_context
      ? <WorkflowTaskIdentity task={entry} compact showStyleNo /> : '—' },
    { title: '当前状态', key: 'status', width: 130, render: (_, entry) => <Tag color={trackingStatusColor(entry)}>{trackingStatus(entry)}</Tag> },
    { title: '当前去向 / 办理人', key: 'owner', render: (_, entry) => entry.current_tasks.length ? <WorkflowResponsibilities items={entry.current_tasks.map(trackingResponsibilityParts)} /> : trackingHandoff(entry) },
    { title: '发起人', key: 'initiator', width: 150, render: (_, entry) => <WorkflowInitiator summary={entry} /> },
    { title: '发起时间', dataIndex: 'started_at', width: 185, render: formatWorkflowTaskEventTime },
    { title: '',
key: 'open',
width: 52,
render: (_, entry) => (
  <Button
    type="text"
    icon={<ArrowRightOutlined />}
    data-task-entry
    data-tracking-entry={`${entry.kind}:${entry.id}`}
    aria-haspopup="dialog"
    aria-label={`查看${trackingTitle(entry)}流转进度`}
    title="查看流转进度"
    onClick={(event) => {
          event.stopPropagation()
          event.currentTarget.focus({ preventScroll: true })
          select(entry)
        }}
  />
    ) },
  ]
  return (
    <div ref={panelRef} className="erp-workflow-tracking-panel">
      <div className="erp-workflow-tracking-controls">
        <BusinessOperationPanel
          compact
          clearFiltersDisabled={!hasFilters}
          onClearFilters={() => setSearchParams((current) => clearTrackingFilters(current, scope), { replace: true })}
          filters={(
            <>
              <SearchInput placeholder="单号 / 任务 / 产品 / 款号" value={search.value} onChange={search.onChange} onCompositionStart={search.onCompositionStart} onCompositionEnd={search.onCompositionEnd} onPressEnter={search.onPressEnter} />
              <SelectFilter aria-label="流转状态" value={filters.status} options={TRACKING_STATUS_OPTIONS} onChange={(status) => changeFilters({ status })} />
              <SelectFilter aria-label="当前岗位" value={filters.owner_role_key} options={TRACKING_ROLE_OPTIONS} onChange={(owner_role_key) => changeFilters({ owner_role_key })} />
              {!source.source_id ? <SelectFilter aria-label="单据类型" value={filters.source_type} options={TRACKING_SOURCE_OPTIONS} onChange={(source_type) => changeFilters({ source_type })} /> : null}
              <SelectFilter aria-label="关注事项" value={filters.attention} options={TRACKING_ATTENTION_OPTIONS} onChange={(attention) => changeFilters({ attention })} />
              <DateRangeFilter options={[{ value: 'started_at', label: '发起时间' }]} value="started_at" startValue={filters.date_from} endValue={filters.date_to} onStartChange={(date_from) => changeFilters({ date_from })} onEndChange={(date_to) => changeFilters({ date_to })} />
            </>
          )}
          actions={source.source_id ? <Button onClick={() => { const next = new URLSearchParams(searchParams); next.delete('track_source_type'); next.delete('track_source_id'); for (const view of ['started', 'participated', 'visible']) next.delete(`track_page_${view}`); setSearchParams(next) }}>清除单据范围</Button> : null}
        />
      </div>
      {current?.error ? <Alert type="error" showIcon message="任务进度加载失败" action={<Button onClick={() => setReload((value) => value + 1)}>重新读取</Button>} /> : (
        <Table
          rowKey={(entry) => `${entry.kind}:${entry.id}`}
          columns={columns}
          dataSource={page?.items || []}
          loading={!current || outOfRange}
          pagination={false}
          scroll={{ x: 1200 }}
          rowClassName="erp-task-table-row"
          onRow={(entry) => ({ onClick: (event) => openWorkflowTaskRow(event, () => select(entry)) })}
          locale={{ emptyText: hasFilters || source.source_id ? '当前筛选下没有匹配记录' : scope === 'started' ? '暂无你发起的流程或跟进任务' : scope === 'participated' ? '暂无你处理过的流程或跟进任务' : '暂无可查看的流程或跟进任务' }}
        />
      )}
      <WorkflowTaskPagination
        total={total}
        current={outOfRange ? lastPage : pageNumber}
        pageSize={pageSize}
        loading={!current || outOfRange}
        error={Boolean(current?.error)}
        onChange={changePage}
        recordLabel="流转记录"
        unit="条"
      />
      <WorkflowTrackingDrawer
        trackingRef={taskHandlingOpen ? null : selected}
        onClose={() => select(null)}
        onOpenTask={onOpenTask}
        onAfterClose={restoreEntryFocus}
        refreshKey={key}
      />
    </div>
  )
}
