import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Spin, Tag } from 'antd'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import Pagination from '@/common/components/pagination/AppPagination'
import Select from '@/common/components/select/AppSelect'
import SearchInput from '@/common/components/SearchInput'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { getWorkflowTaskBoard } from '../../api/workflowApi.mjs'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator.js'
import { formatWorkflowTaskSource, resolveWorkflowTaskSourceEntryPath } from '../../utils/dashboardTaskDisplay.mjs'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import { getWorkflowTaskOwnerRoleLabel, getWorkflowTaskReasonMeta, getWorkflowTaskStatusRiskTags } from '../../utils/workflowTaskBoard.mjs'
import { formatWorkflowTaskEventTime } from '../../utils/workflowTaskEventPresentation.mjs'
import WorkflowTaskReason from '../workflow/WorkflowTaskReason.jsx'
import WorkflowTrackingDrawer from '../workflow/WorkflowTrackingDrawer.jsx'
import './roleProgressPanel.css'

const categories = [
  { key: 'exception', label: '受阻与异常' },
  { key: 'due', label: '临期与超时' },
  { key: 'unassigned', label: '无人接手' },
  { key: 'actionable', label: '待跟进' },
  { key: 'finished', label: '处理结果' },
]
const previewSize = 4
const pageSize = 20
const defaultView = Object.freeze({ role: '', keyword: '', lane: '', page: 1 })

function byCategory(value) {
  return categories.find(({ key }) => key === value)
}

function RoleProgressItem({ task, assignees, snapshotAt, onInspect }) {
  const title = getWorkflowTaskDisplayName(task)
  const source = formatWorkflowTaskSource(task)
  const tags = getWorkflowTaskStatusRiskTags(task, snapshotAt * 1000)
  const role = getWorkflowTaskOwnerRoleLabel(task)
  const assignee = task.assignee_id
    ? assignees.find(({ id }) => id === task.assignee_id)?.name || '已指定办理人'
    : '未指定办理人'
  const completed = task.completed_at || task.finished_at
  const time = completed || task.due_at
  const reason = getWorkflowTaskReasonMeta(task)
  return (
    <li className="erp-role-progress-item">
      <button type="button" className="erp-role-progress-item-button" onClick={() => onInspect(task)} aria-haspopup="dialog">
        <span className="erp-role-progress-item-top">
          <strong>{title}</strong>
          <span>{tags.map(({ key, color, label }) => <Tag key={key} color={color}>{label}</Tag>)}</span>
        </span>
        <span className="erp-role-progress-item-context">
          <span>{source}</span>
          <span>{role} · {assignee}</span>
          {time ? <span>{completed ? '办结 ' : '到期 '}{formatWorkflowTaskEventTime(time)}</span> : null}
        </span>
        <WorkflowTaskReason meta={reason} />
      </button>
    </li>
  )
}

export default function RoleProgressPanel({
  active,
  adminProfile,
  roles,
  state = defaultView,
  onStateChange,
  onOpenTask,
  allowGlobal = false,
  onOpenSource,
  canOpenSource,
  onOpenDelivery,
  suspendDetails = false,
  registerRefresh,
  mobile = false,
}) {
  const scopes = allowGlobal ? [...roles, { value: 'all', label: '全局跟进' }] : roles
  const role = scopes.find(({ value }) => value === state.role) || scopes[0]
  const roleKey = role?.value || ''
  const lane = byCategory(state.lane)
  const keyword = state.keyword || ''
  const page = Number.isSafeInteger(state.page) && state.page > 0 ? state.page : 1
  const key = JSON.stringify([roleKey, lane?.key, page, keyword])
  const [result, setResult] = useState(null)
  const begin = useLatestRequestCoordinator()
  const load = useCallback(async () => {
    const request = begin('role-progress')
    if (!active || !roleKey || !adminProfile?.id) {
      request.finish()
      return false
    }
    setResult({ profile: adminProfile, key, loading: true })
    try {
      const scope = { ...(roleKey === 'all' ? {} : { owner_role_key: roleKey }), keyword }
      const unassignedActive = lane?.key === 'unassigned'
      const options = { signal: request.signal }
      const [data, unassigned] = await Promise.all([
        getWorkflowTaskBoard({
          ...scope,
          ...(lane ? { lane_key: unassignedActive ? 'all' : lane.key } : {}),
          limit: unassignedActive ? 1 : lane ? pageSize : previewSize,
          offset: lane && !unassignedActive ? (page - 1) * pageSize : 0,
        }, options),
        getWorkflowTaskBoard({
          ...scope,
          assignee: 'unassigned',
          status: 'open',
          lane_key: 'all',
          limit: unassignedActive ? pageSize : lane ? 1 : previewSize,
          offset: unassignedActive ? (page - 1) * pageSize : 0,
        }, options),
      ])
      if (!request.isCurrent()) return false
      const unassignedLane = { ...unassigned.lanes[0], key: 'unassigned' }
      setResult({
        profile: adminProfile,
key,
        data: {
          ...data,
          counts: { ...data.counts, unassigned: unassignedLane.total },
          lanes: [...data.lanes, unassignedLane],
        },
      })
      return true
    } catch (error) {
      if (request.isCurrent()) setResult({ profile: adminProfile, key, error: getActionErrorMessage(error, '读取岗位进度') })
      return false
    } finally {
      request.finish()
    }
  }, [active, adminProfile, begin, key, keyword, lane, page, roleKey])
  useEffect(() => {
    load()
    return () => begin('role-progress').finish()
  }, [begin, load])
  useEffect(() => active ? registerRefresh?.(load) : undefined, [active, load, registerRefresh])
  const current = result?.profile === adminProfile && result?.key === key ? result : null
  const data = current?.data
  const total = data?.lanes.find(({ key }) => key === lane?.key)?.total
  useEffect(() => {
    if (active && lane && total !== undefined && page > Math.max(1, Math.ceil(total / pageSize))) {
      onStateChange({ page: Math.max(1, Math.ceil(total / pageSize)) })
    }
  }, [active, lane, onStateChange, page, total])
  if (!active || !role) return null
  const displayed = lane ? [lane] : categories.filter(({ key }) => key !== 'finished')
  const inspect = (task) => onStateChange({ selected: {
    adminID: adminProfile.id,
    roleKey,
    kind: task.process_instance_id ? 'process' : 'task',
    id: task.process_instance_id || task.id,
    taskID: task.id,
    sourcePath: task.display_context?.available === false ? '' : resolveWorkflowTaskSourceEntryPath(task),
    salesOrderID: task.source_type === 'sales_order' && task.display_context?.available !== false ? task.source_id : null,
  } })
  const { selected } = state
  const selectedRef = selected?.adminID === adminProfile.id && selected?.roleKey === roleKey &&
    ['process', 'task'].includes(selected.kind) && Number.isSafeInteger(selected.id) && selected.id > 0
    ? selected
    : null
  const sourceAction = selectedRef?.salesOrderID && onOpenDelivery
    ? <Button onClick={() => onOpenDelivery(selectedRef.salesOrderID)}>查看交付进度</Button>
    : selectedRef?.sourcePath && onOpenSource && canOpenSource?.(selectedRef.sourcePath)
      ? <Button onClick={() => onOpenSource(selectedRef.sourcePath)}>查看来源进度</Button>
      : null
  return (
    <section className="erp-role-progress" aria-label="本岗进度" aria-busy={Boolean(current?.loading)}>
      <div className="erp-role-progress-toolbar">
        {scopes.length > 1 ? (
          <Select
            aria-label="选择进度岗位"
            options={scopes}
            value={roleKey}
            onChange={(next) => onStateChange({ role: next, lane: '', page: 1, keyword: '', selected: null })}
          />
        ) : <strong>{roleKey === 'all' ? role.label : `${role.label}进度`}</strong>}
        <SearchInput
          aria-label="搜索岗位进度"
          placeholder="搜事项、单号"
          value={keyword}
          onSearch={(next) => onStateChange({ keyword: next, page: 1 })}
        />
        {mobile && <Button onClick={load}>刷新</Button>}
      </div>
      <div className="erp-role-progress-filters" role="group" aria-label="岗位跟进分类">
        <Button aria-pressed={!lane} onClick={() => onStateChange({ lane: '', page: 1 })}>概览</Button>
        {categories.map(({ key, label }) => (
          <Button key={key} aria-pressed={lane?.key === key} onClick={() => onStateChange({ lane: key, page: 1 })}>
            {label}{data ? ` ${data.counts[key]}` : ''}
          </Button>
        ))}
      </div>
      {current?.error
        ? <Alert type="error" message={current.error} showIcon action={<Button onClick={load}>重试</Button>} />
        : !data ? <div className="erp-role-progress-loading"><Spin /> 正在读取岗位进度</div>
          : displayed.map(({ key, label }) => {
            const records = data.lanes.find((item) => item.key === key)
            return (
              <section className="erp-role-progress-group" key={key} aria-label={label}>
                {!lane && <h3>{label}</h3>}
                {records?.tasks.length ? (
                  <ul className="erp-role-progress-items">
                    {records.tasks.map((task) => (
                      <RoleProgressItem key={task.id} task={task} assignees={data.assignees || []} snapshotAt={data.snapshot_at} onInspect={inspect} />
                    ))}
                  </ul>
                ) : <Empty description="暂无事项" />}
                {!lane && records?.total > previewSize && (
                  <Button type="link" onClick={() => onStateChange({ lane: key, page: 1 })}>查看全部{label}</Button>
                )}
              </section>
            )
          })}
      {lane && total > pageSize && (
        <Pagination current={page} pageSize={pageSize} total={total} simple={mobile} onChange={(next) => onStateChange({ page: next })} />
      )}
      <WorkflowTrackingDrawer
        trackingRef={suspendDetails ? null : selectedRef}
        onClose={() => onStateChange({ selected: null })}
        onOpenTask={onOpenTask}
        preferredTaskID={selectedRef?.taskID}
        sourceAction={sourceAction}
        showNextStep
      />
    </section>
  )
}
