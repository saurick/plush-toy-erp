import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Spin, Tag } from 'antd'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import Pagination from '@/common/components/pagination/AppPagination'
import Select from '@/common/components/select/AppSelect'
import SearchInput from '@/common/components/SearchInput'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { getWorkflowTaskBoard } from '../../api/workflowApi.mjs'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator.js'
import {
  formatWorkflowTaskSource,
  resolveWorkflowTaskSourceEntryPath,
  workflowTaskSourceForEntryPath,
} from '../../utils/dashboardTaskDisplay.mjs'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import {
  TASK_BOARD_ROLE_OPTIONS,
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskReasonMeta,
  getWorkflowTaskStatusRiskTags,
} from '../../utils/workflowTaskBoard.mjs'
import { formatWorkflowTaskEventTime } from '../../utils/workflowTaskEventPresentation.mjs'
import FilterChip from '@/common/components/navigation/FilterChip'
import Table from '@/common/components/table/AppTable'
import { openWorkflowTaskRow } from '../../utils/workflowTaskEntry.mjs'
import WorkflowTaskReason from './WorkflowTaskReason.jsx'
import WorkflowTrackingDrawer from './WorkflowTrackingDrawer.jsx'
import { isWorkflowTrackingKind, trackingRefForWorkflowTask } from '../../utils/workflowTracking.mjs'
import { documentTaskAccess, progressBoardAccess } from '../../utils/progressBoardAccess.mjs'
import { canOpenRelatedDocumentPath } from '../../utils/relatedDocumentNavigation.mjs'
import useBusinessNavigate from '../../hooks/useBusinessNavigate.js'
import { useSalesDeliveryWorkspace } from '../sales-orders/useSalesDeliveryWorkspace.js'
import SalesDeliveryWorkspace from '../sales-orders/SalesDeliveryWorkspace.jsx'
import BusinessProgressDrawer from '../business-visualizations/BusinessProgressDrawer.jsx'
import './documentTaskPanel.css'

const categories = [
  ['open', '待跟进'],
  ['exception', '受阻与异常'],
  ['unassigned', '无人接手'],
  ['due', '临期与超时'],
  ['finished', '处理结果'],
]
const pageSize = 20
const defaultView = Object.freeze({})
const dateLabel = (value) => (value ? formatWorkflowTaskEventTime(value) : '—')

function useProgressPage(profile, query) {
  const begin = useLatestRequestCoordinator()
  const [result, setResult] = useState(null)
  const load = useCallback(async () => {
    const request = begin('progress')
    if (!query) {
      request.finish()
      return false
    }
    setResult({ profile, query })
    try {
      const data = await getWorkflowTaskBoard(query, { signal: request.signal })
      if (!request.isCurrent()) return false
      setResult({ profile, query, data })
      return true
    } catch (error) {
      if (request.isCurrent()) {
        setResult({ profile, query, error: getActionErrorMessage(error, '读取单据任务') })
      }
      return false
    } finally {
      request.finish()
    }
  }, [begin, profile, query])
  useEffect(() => {
    load()
    return () => begin('progress').finish()
  }, [begin, load])
  return [result?.profile === profile && result.query === query ? result : null, load]
}

function owner(task, data) {
  const person = task.assignee_id
    ? data.assignees.find(({ id }) => id === task.assignee_id)?.name || '已指定办理人'
    : '未指定办理人'
  return `${getWorkflowTaskOwnerRoleLabel(task)} · ${person}`
}

function statusTags(task, snapshot) {
  return getWorkflowTaskStatusRiskTags(task, snapshot * 1000).map(({ key, color, label }) => (
    <Tag key={key} color={color}>
      {label}
    </Tag>
  ))
}

function ProgressTasks({ result, retry, inspect, page, onPage, finished }) {
  if (result?.error) {
    return <Alert type="error" message={result.error} action={<Button onClick={retry}>重试</Button>} />
  }
  if (!result?.data) return <Spin aria-label="读取关联事项" />
  const { data } = result
  const columns = [
    {
      title: '事项',
      key: 'title',
      render: (_, { task }) => (
        <Button type="link" size="small" data-task-entry onClick={() => inspect(task)}>
          {getWorkflowTaskDisplayName(task)}
        </Button>
      ),
    },
    { title: '状态', key: 'status', render: (_, { task }) => statusTags(task, data.snapshot_at) },
    { title: '责任岗位 / 经办人', key: 'owner', render: (_, { task }) => owner(task, data) },
    { title: finished ? '办结时间' : '截止时间', key: 'date', render: (_, row) => dateLabel(row.date) },
    {
      title: '跟进说明',
      key: 'reason',
      render: (_, { task }) => <WorkflowTaskReason meta={getWorkflowTaskReasonMeta(task)} />,
    },
  ]
  return (
    <>
      <Table
        size="small"
        bordered
        pagination={false}
        scroll={{ x: 720 }}
        rowKey={(row) => row.task.id}
        columns={columns}
        dataSource={data.rows}
        onRow={(row) => ({ onClick: (event) => openWorkflowTaskRow(event, () => inspect(row.task)) })}
      />
      {data.total > pageSize && (
        <Pagination simple current={page} pageSize={pageSize} total={data.total} onChange={onPage} />
      )}
    </>
  )
}

export default function DocumentTaskPanel({
  active,
  adminProfile,
  mobileRole,
  state = defaultView,
  onStateChange,
  onOpenTask,
  suspendDetails = false,
  registerRefresh,
  mobile = false,
}) {
  const { roles, supervise: allowGlobal } = documentTaskAccess(adminProfile, mobileRole)
  const businessAccess = progressBoardAccess(adminProfile, mobileRole)
  const delivery = useSalesDeliveryWorkspace(adminProfile, active && businessAccess.sales)
  const [productionID, setProductionID] = useState(null)
  const showBusinessDetail = (view, id) => {
    if (mobile) {
      window.history.pushState(
        { ...window.history.state, documentTaskBusiness: { view, id, adminID: adminProfile.id, role: mobileRole } },
        ''
      )
    }
    if (view === 'orders') delivery.openProgress(id)
    else setProductionID(id)
  }
  const onOpenDelivery = delivery.enabled ? (id) => showBusinessDetail('orders', id) : undefined
  const onOpenProduction = businessAccess.production
    ? (id) => showBusinessDetail('production', id)
    : undefined
  const closeBusinessDetail = () => {
    if (mobile && window.history.state?.documentTaskBusiness?.adminID === adminProfile.id) {
      window.history.back()
    } else {
      delivery.close()
      setProductionID(null)
    }
  }
  const { openProgress, close: closeDelivery } = delivery
  useEffect(() => {
    if (!mobile || !active) return undefined
    const restore = () => {
      const saved = window.history.state?.documentTaskBusiness
      const inScope = saved?.adminID === adminProfile.id && saved.role === mobileRole
      if (inScope && saved.view === 'orders' && businessAccess.sales) {
        openProgress(saved.id)
      } else closeDelivery()
      setProductionID(
        inScope && saved.view === 'production' && businessAccess.production
          ? saved.id
          : null
      )
    }
    restore()
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [
    active,
    adminProfile.id,
    businessAccess.production,
    businessAccess.sales,
    closeDelivery,
    mobile,
    mobileRole,
    openProgress,
  ])
  const onOpenSource = useBusinessNavigate()
  const canOpenSource = (path) =>
    !mobile &&
    canOpenRelatedDocumentPath({
      path,
      adminProfile,
      allowedMenuPaths: adminProfile?.menus?.map((item) => item.path),
    })
  const global = { value: 'all', label: '全部可见岗位' }
  const scopes = allowGlobal
    ? [
        ...roles,
        global,
        ...TASK_BOARD_ROLE_OPTIONS.filter((option) => !roles.some((r) => r.value === option.value)),
      ]
    : roles
  const role =
    scopes.find((option) => option.value === state.role) || (allowGlobal && !mobile ? global : scopes[0])
  const roleKey = role?.value || ''
  const category = categories.some(([k]) => k === state.lane) ? state.lane : 'open'
  const keyword = state.keyword || ''
  const page = state.page || 1
  const sort = state.sort || 'smart'
  const { document } = state
  const anchor =
    document && document.adminID === adminProfile?.id && document.roleKey === roleKey ? document.id : 0
  const overviewRef = useRef(null)
  const backRef = useRef(null)
  const returnPosition = useRef(null)
  const detailPage = state.detailPage || 1
  const query = useMemo(
    () =>
      active && roleKey && adminProfile?.id
        ? {
            ...(roleKey === 'all' ? {} : { owner_role_key: roleKey }),
            progress_view: category,
            keyword,
            sort,
            limit: pageSize,
            offset: (page - 1) * pageSize,
          }
        : null,
    [active, adminProfile?.id, category, keyword, page, roleKey, sort]
  )
  const [result, load] = useProgressPage(adminProfile, suspendDetails ? null : query)
  const data = result?.data
  const detailQuery = useMemo(
    () =>
      anchor && query ? { ...query, progress_anchor: anchor, offset: (detailPage - 1) * pageSize } : null,
    [anchor, detailPage, query]
  )
  const [detail, loadDetail] = useProgressPage(adminProfile, suspendDetails ? null : detailQuery)
  const refresh = anchor ? loadDetail : load
  useEffect(() => (active ? registerRefresh?.(refresh) : undefined), [active, refresh, registerRefresh])
  useLayoutEffect(() => {
    if (!active || !returnPosition.current) return
    if (anchor) {
      backRef.current?.focus()
      return
    }
    const { id, positions } = returnPosition.current
    const target = overviewRef.current?.querySelector(`[data-progress-document="${id}"]`)
    target?.focus({ preventScroll: true })
    for (const { node, top, left } of positions) {
      if (node.isConnected) node.scrollTo(left, top)
    }
    returnPosition.current = null
  }, [active, anchor])
  useEffect(() => {
    if (data && page > Math.max(1, Math.ceil(data.total / pageSize))) {
      onStateChange({ page: Math.max(1, Math.ceil(data.total / pageSize)) })
    }
    if (detail?.data && detailPage > Math.max(1, Math.ceil(detail.data.total / pageSize))) {
      onStateChange({ detailPage: Math.max(1, Math.ceil(detail.data.total / pageSize)) })
    }
  }, [data, detail, detailPage, onStateChange, page])
  if (!active || !role) return null
  const inspect = (task) =>
    onStateChange({
      selected: {
        adminID: adminProfile.id,
        roleKey,
        ...trackingRefForWorkflowTask(task),
        taskID: task.id,
        sourcePath:
          task.display_context?.available === false ? '' : resolveWorkflowTaskSourceEntryPath(task),
        salesOrderID:
          task.source_type === 'sales_order' && task.display_context?.available !== false
            ? task.source_id
            : null,
      },
    })
  const { selected } = state
  const selectedRef =
    selected?.adminID === adminProfile.id &&
    selected?.roleKey === roleKey &&
    isWorkflowTrackingKind(selected.kind) &&
    Number.isSafeInteger(selected.id) &&
    selected.id > 0
      ? selected
      : null
  const sourceAction =
    selectedRef?.salesOrderID && onOpenDelivery ? (
      <Button onClick={() => onOpenDelivery(selectedRef.salesOrderID)}>查看交付进度</Button>
    ) : selectedRef?.sourcePath && onOpenSource && canOpenSource?.(selectedRef.sourcePath) ? (
      <Button onClick={() => onOpenSource(selectedRef.sourcePath)}>查看来源进度</Button>
    ) : null
  const reset = (change) =>
    onStateChange({ page: 1, document: null, detailPage: 1, selected: null, ...change })
  const openDocument = (task) => {
    const positions = []
    let node = overviewRef.current?.querySelector(`[data-progress-document="${task.id}"]`)
    while (node) {
      if (node.scrollTop || node.scrollLeft) {
        positions.push({ node, top: node.scrollTop, left: node.scrollLeft })
      }
      node = node.parentElement
    }
    returnPosition.current = { id: task.id, positions }
    onStateChange({ document: { id: task.id, adminID: adminProfile.id, roleKey }, detailPage: 1 })
  }
  const backToOverview = () => {
    if (!returnPosition.current) returnPosition.current = { id: anchor, positions: [] }
    onStateChange({ document: null, detailPage: 1, selected: null })
  }
  const finished = category === 'finished'
  const openGroupSource = (task) => {
    if (task.display_context?.available === false) return null
    const path = resolveWorkflowTaskSourceEntryPath(task)
    const source =
      task.source_type === 'sales_order' && task.source_id > 0
        ? { source_type: task.source_type, source_id: task.source_id }
        : workflowTaskSourceForEntryPath(path)
    if (source?.source_type === 'sales_order' && onOpenDelivery) {
      return (
        <Button type="link" onClick={() => onOpenDelivery(source.source_id)}>
          查看订单交付
        </Button>
      )
    }
    if (source?.source_type === 'production_order' && onOpenProduction) {
      return (
        <Button type="link" onClick={() => onOpenProduction(source.source_id)}>
          查看生产执行
        </Button>
      )
    }
    return path && onOpenSource && canOpenSource?.(path) ? (
      <Button type="link" onClick={() => onOpenSource(path)}>
        查看来源单据
      </Button>
    ) : null
  }
  const documentTask = detail?.data?.rows[0]?.task || data?.rows.find((row) => row.task.id === anchor)?.task
  const columns = [
    {
      title: '来源单据',
      key: 'source',
      width: mobile ? 168 : undefined,
      sorter: true,
      sortOrder: sort === 'source_asc' ? 'ascend' : sort === 'source_desc' ? 'descend' : null,
      render: (_, { task }) => (
        <Button
          type="link"
          size="small"
          className="erp-document-tasks-document"
          data-task-entry
          data-progress-document={task.id}
          onClick={() => openDocument(task)}
        >
          {task.source_id ? formatWorkflowTaskSource(task) : '独立事项'}
        </Button>
      ),
    },
    { title: '当前关注', key: 'name', render: (_, { task }) => getWorkflowTaskDisplayName(task) },
    { title: '优先事项责任人', key: 'owner', render: (_, { task }) => owner(task, data) },
    {
      title: finished ? '最近办结' : '最早截止',
      key: 'date',
      sorter: true,
      sortOrder: sort === 'time_asc' ? 'ascend' : sort === 'time_desc' ? 'descend' : null,
      render: (_, row) => dateLabel(row.date),
    },
    { title: '状态', key: 'status', render: (_, { task }) => statusTags(task, data.snapshot_at) },
    { title: '事项数', dataIndex: 'task_count', align: 'right', width: 68 },
  ]
  return (
    <section className="erp-document-tasks" aria-label="按单据查看任务">
      <div ref={overviewRef} className="erp-document-tasks-overview" hidden={Boolean(anchor)}>
        <div className="erp-document-tasks-toolbar">
          <div className="erp-document-tasks-filters" role="group" aria-label="单据任务分类">
            {categories.map(([key, label]) => (
              <FilterChip
                key={key}
                selected={category === key}
                count={data?.counts[key] ?? '—'}
                onClick={() => reset({ lane: key })}
              >
                {label}
              </FilterChip>
            ))}
          </div>
          <SearchInput
            aria-label="搜索单据任务"
            placeholder="搜事项、单号、经办人"
            value={keyword}
            onSearch={(next) => reset({ keyword: next })}
          />
          {scopes.length > 1 ? (
            <Select
              aria-label="筛选责任岗位"
              options={scopes}
              allowClear={false /* 不可清空：按单据查询必须选定责任岗位或全部可见岗位。 */}
              value={roleKey}
              onChange={(next) => reset({ role: next, lane: 'open', keyword: '' })}
            />
          ) : (
            <span>{role.label}</span>
          )}
          {mobile && <Button onClick={load}>刷新</Button>}
        </div>
        {result?.error ? (
          <Alert
            type="error"
            message={result.error}
            showIcon
            action={<Button onClick={load}>重试</Button>}
          />
        ) : (
          <div className="erp-document-tasks-results">
            <Table
              size="small"
              bordered
              loading={!data}
              pagination={false}
              tableLayout="fixed"
              scroll={{ x: 790 }}
              rowKey={(row) => row.task.id}
              columns={columns}
              dataSource={data?.rows || []}
              locale={{ emptyText: <Empty description="当前条件下没有跟进事项" /> }}
              onChange={(_, __, sorter) =>
                reset({
                  sort: sorter.order
                    ? (sorter.columnKey === 'source' ? 'source_' : 'time_') +
                      (sorter.order === 'ascend' ? 'asc' : 'desc')
                    : 'smart',
                })
              }
              onRow={(row) => ({
                onClick: (event) => openWorkflowTaskRow(event, () => openDocument(row.task)),
              })}
            />
            {data?.total > 0 && (
              <div className="erp-document-tasks-pagination">
                {data.total <= pageSize ? (
                  <span>共 {data.total} 组</span>
                ) : (
                  <Pagination
                    showTotal={(total, range) => `第 ${range[0]}–${range[1]} 组 / 共 ${total} 组`}
                    current={page}
                    pageSize={pageSize}
                    total={data.total}
                    simple={mobile}
                    showSizeChanger={false}
                    onChange={(value) => reset({ page: value })}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {anchor > 0 && (
        <section className="erp-document-tasks-doc" aria-label="单据事项">
          <div className="erp-document-tasks-toolbar">
            <Button ref={backRef} onClick={backToOverview}>
              返回单据列表
            </Button>
            <strong>{documentTask ? formatWorkflowTaskSource(documentTask) : '单据事项'}</strong>
            <span>
              {role.label} · {categories.find(([key]) => key === category)[1]}
              {detail?.data ? ` · ${detail.data.total} 项` : ''}
            </span>
            {documentTask && openGroupSource(documentTask)}
            {mobile && <Button onClick={loadDetail}>刷新</Button>}
          </div>
          <div className="erp-document-tasks-results">
            <ProgressTasks
              result={detail}
              retry={loadDetail}
              inspect={inspect}
              finished={finished}
              page={detailPage}
              onPage={(value) => onStateChange({ detailPage: value })}
            />
          </div>
        </section>
      )}
      <SalesDeliveryWorkspace workspace={delivery} mobile={mobile} onMobileClose={closeBusinessDetail} />
      {productionID && businessAccess.production && (
        <BusinessProgressDrawer
          mobile={mobile}
          selection={{ id: productionID, view: 'production', profile: adminProfile }}
          adminProfile={adminProfile}
          onClose={closeBusinessDetail}
        />
      )}
      <WorkflowTrackingDrawer
        trackingRef={suspendDetails || delivery.frame || productionID ? null : selectedRef}
        onClose={() => onStateChange({ selected: null })}
        onOpenTask={onOpenTask}
        preferredTaskID={selectedRef?.taskID}
        sourceAction={sourceAction}
        showNextStep
      />
    </section>
  )
}
