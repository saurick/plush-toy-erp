import React from 'react'
import { Button, Tag } from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import FilterChip from '@/common/components/navigation/FilterChip'
import { WorkflowTaskStatus } from '@/common/consts/statuses.generated.mjs'
import { BusinessDataTable } from '../business-list/BusinessListLayout.jsx'
import {
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskStatusMeta,
} from '../../utils/workflowTaskBoard.mjs'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import WorkflowExceptionPhotos from './WorkflowExceptionPhotos.jsx'

const dispositions = {
  SCRAP: '报废',
  WIP_CONCESSION: '在制让步',
  OVER_ISSUE: '超领',
  REWORK_ORIGINAL: '原厂返工',
  REWORK_SWITCH: '换厂返工',
  REMAKE: '补料重做',
  RETURN_TO_VENDOR: '退回厂商',
  REPLACE: '换货',
  REWORK: '返工复检',
}
const phases = [
  { value: 'pending_plan', label: '待定方案', tone: 'warning' },
  { value: 'executing', label: '执行与复检中', tone: 'info' },
  { value: 'closed', label: '已处理完', tone: 'success' },
]
const states = {
  open: { label: phases[0].label, color: 'warning' },
  executing: { label: phases[1].label, color: 'processing' },
  closed: { label: phases[2].label, color: 'success' },
  corrected: { label: '检验更正后合格', color: 'success' },
}
const percentFormatter = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 })

export function pendingExceptionTasks(item) {
  return item.tasks.filter((task) => [WorkflowTaskStatus.READY, WorkflowTaskStatus.BLOCKED].includes(task.task_status_key))
}

export const exceptionDisposition = (item) =>
  dispositions[item.disposition] || (item.state === 'open' && !item.disposition ? '待业务确定方案' : '—')
export const exceptionReason = (item) => item.reason || '具体不合格项见检验记录'
export const exceptionTime = (item) => item.occurred_at?.slice(0, 16).replace('T', ' ') || '—'
export const exceptionOrderNumbers = (item) => item.orders.map((order) => order.number).join('、') || '无可见订单关联'

export function WorkflowExceptionStatusTag({ value }) {
  const state = states[value]
  return <Tag color={state?.color}>{state?.label || '—'}</Tag>
}

export function workflowExceptionStateOptions(data, compact = false) {
  const total = data ? data.open + data.closed : '—'
  const summary = [
    { label: '全部异常', value: '', count: total },
    { label: '未处理完', value: 'open', count: data?.open ?? '—' },
  ]
  return compact
    ? [...summary, phases[2], phases[0], phases[1]].map((option) => ({
      ...option,
      count: option.count ?? data?.[option.value] ?? '—',
    }))
    : summary
}

export function WorkflowExceptionStatusOverview({ data, state, onSelect }) {
  const total = data ? data.open + data.closed : 0
  return (
    <section className="workflow-exceptions__overview" aria-label="异常状态分布">
      <div className="workflow-exceptions__overview-header">
        <h3>异常状态分布</h3>
        <div className="workflow-exceptions__states" role="group" aria-label="异常范围">
          {workflowExceptionStateOptions(data).map(({ label, value, count }) => (
            <FilterChip key={value} count={count} selected={state === value} removable={Boolean(value)} onClick={() => onSelect(value)}>{label}</FilterChip>
          ))}
        </div>
      </div>
      <div className="workflow-exceptions__phase-grid" role="group" aria-label="按异常状态筛选">
        {phases.map(({ value, label, tone }) => {
          const count = data?.[value]
          const ratio = total > 0 ? count / total : 0
          return (
            <button key={value} className="workflow-exceptions__phase" type="button" data-tone={tone} aria-pressed={state === value} onClick={() => onSelect(value)}>
              <span className="workflow-exceptions__phase-label">
                <strong>{label}</strong>
                <span><b>{count ?? '—'}</b> 条{total > 0 ? <small aria-label={`占当前查询 ${total} 条异常的 ${percentFormatter.format(ratio)}`}>{percentFormatter.format(ratio)}</small> : null}</span>
              </span>
              <span className="workflow-exceptions__phase-track" aria-hidden="true"><span style={{ width: `${ratio * 100}%` }} /></span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

const subline = (value) => <span className="workflow-exceptions__subline">{value}</span>

function CurrentExceptionWork({ item }) {
  const tasks = pendingExceptionTasks(item)
  const task = tasks[0]
  if (!task) return subline(['closed', 'corrected'].includes(item.state) ? '—' : '无可见待办')
  const status = getWorkflowTaskStatusMeta(task)
  return (
    <>
      {getWorkflowTaskDisplayName(task)}
      {subline([
        getWorkflowTaskOwnerRoleLabel(task),
        task.discovery?.assignee_name || '未指定办理人',
        status.label,
        tasks.length > 1 ? `另有 ${tasks.length - 1} 项` : '',
      ].filter(Boolean).join(' · '))}
    </>
  )
}

export function WorkflowExceptionTable({ items, selectedKey, detailID, onSelect, tableHeader, pagination }) {
  const columns = [
    {
      title: '异常单号 / 原因',
      key: 'exception',
      width: '28%',
      render: (_, item) => (
        <>
          <Button type="link" className="workflow-exceptions__record-link" data-exception-record={item.key} aria-expanded={selectedKey === item.key} aria-controls={selectedKey === item.key ? detailID : undefined} onClick={() => onSelect(item.key)}>{item.number}</Button>
          {subline(exceptionReason(item))}
        </>
      ),
    },
    { title: '订单 / 批次', key: 'order', width: '16%', render: (_, item) => <>{exceptionOrderNumbers(item)}{item.batch_no ? subline(item.batch_no) : null}</> },
    { title: '处理状态', key: 'state', width: '16%', render: (_, item) => <><WorkflowExceptionStatusTag value={item.state} />{subline(exceptionDisposition(item))}</> },
    { title: '当前待办', key: 'task', width: '26%', render: (_, item) => <CurrentExceptionWork item={item} /> },
    { title: '发生时间', key: 'time', width: '14%', render: (_, item) => <time>{exceptionTime(item)}</time> },
  ]
  return (
    <div className="workflow-exceptions__list">
      <BusinessDataTable
        rowKey="key"
        columns={columns}
        dataSource={items}
        tableHeader={tableHeader}
        rowClassName={(item) => item.key === selectedKey ? 'workflow-exceptions__row--selected' : ''}
        scroll={{ x: 640 }}
        pagination={pagination}
        emptyDescription="当前条件下没有可跟踪的异常"
      />
    </div>
  )
}

export function WorkflowExceptionDetails({ item, id, onClose, renderTask }) {
  const heading = React.useRef(null)
  React.useLayoutEffect(() => { heading.current?.focus() }, [])
  const pending = pendingExceptionTasks(item)
  return (
    <aside id={id} className="workflow-exceptions__record" aria-labelledby={`${id}-heading`}>
      <header className="workflow-exceptions__record-header">
        <h3 id={`${id}-heading`} ref={heading} tabIndex={-1}>异常详情</h3>
        <Button type="text" icon={<CloseOutlined />} aria-label="关闭异常详情" onClick={onClose} />
      </header>
      <div className="workflow-exceptions__record-content">
        <div className="workflow-exceptions__heading">
          <strong>{item.number}</strong>
          <WorkflowExceptionStatusTag value={item.state} />
        </div>
        {pending.length ? (
          <section className="workflow-exceptions__current" aria-label="当前待办">
            <h4>当前待办</h4>
            {pending.slice(0, 2).map((task) => renderTask(task, false))}
            {pending.length > 2 ? subline('其余待办可在关联任务中查看') : null}
          </section>
        ) : null}
        <section aria-label="异常信息">
          <h4 className="workflow-exceptions__section-title">异常信息</h4>
          <dl className="workflow-exceptions__facts">
            <div><dt>关联订单</dt><dd>{exceptionOrderNumbers(item)}</dd></div>
            <div><dt>关联批次</dt><dd>{item.batch_no || '—'}</dd></div>
            <div><dt>发生时间</dt><dd>{exceptionTime(item)}</dd></div>
            <div><dt>处置方案</dt><dd>{exceptionDisposition(item)}</dd></div>
            <div className="workflow-exceptions__reason"><dt>异常原因</dt><dd>{exceptionReason(item)}</dd></div>
          </dl>
        </section>
        <WorkflowExceptionPhotos sources={item.quality_photo_sources} />
        {item.task_ids.length ? (
          <section aria-label="关联任务">
            <h4 className="workflow-exceptions__section-title">全部关联任务 <small>{item.task_ids.length} 项</small></h4>
            {item.tasks.map((task) => renderTask(task))}
            {item.task_ids.length > item.tasks.length ? <p>当前列出前 {item.tasks.length} 项，可从关联任务进入完整处理链继续查看。</p> : null}
          </section>
        ) : null}
      </div>
    </aside>
  )
}
