import React from 'react'
import { Alert, Button, Spin, Tag } from 'antd'
import { workflowTaskRecordedResult } from '../../utils/workflowTaskReceipt.mjs'
import { getWorkflowTaskStatusMeta } from '../../utils/workflowTaskBoard.mjs'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import './workflowTaskReceipt.css'

function ReceiptItems({ items, count, title }) {
  return items.length ? (
    <div className="workflow-task-receipt__items">
      <h3>{title} · {items.length}{count > items.length ? ` / ${count}` : ''} 项</h3>
      <ul>{items.map((item, index) => <li key={`${item.label}:${index}`}><span>{item.label}</span><strong>{item.quantity}{item.unit ? ` ${item.unit}` : ''}</strong></li>)}</ul>
    </div>
  ) : null
}

export default function WorkflowTaskReceipt({ task: sourceTask, events = [], state = 'ready', receipt = null, sourceReadback }) {
  const task = sourceTask || {}
  const result = receipt ? null : workflowTaskRecordedResult(task, events)
  const status = getWorkflowTaskStatusMeta(task)
  const title = receipt?.actionTitle || result?.label
  const reason = receipt?.reason || result?.reason
  const taskReadPending = receipt?.taskReadState && receipt.taskReadState !== 'ready'
  const actorLabel = receipt?.actorLabel || result?.actorLabel
  const timeLabel = receipt?.timeLabel || result?.timeLabel
  const fields = Array.isArray(receipt?.fields) ? receipt.fields : []
  const items = Array.isArray(receipt?.items) ? receipt.items : []
  return (
    <section className="workflow-task-info-card workflow-task-receipt" aria-label="办理结果" data-testid="workflow-task-action-receipt">
      <div className="workflow-task-receipt__heading"><h2>{title || (state === 'loading' ? '正在读取办理结果' : '尚无办理结果')}</h2><Tag color={taskReadPending ? 'default' : status.color}>{taskReadPending ? '任务状态待确认' : receipt?.statusLabel || status.label}</Tag></div>
      <p className="workflow-task-receipt__source">{getWorkflowTaskDisplayName(task)}</p>
      {state === 'loading' && !receipt ? <Spin size="small" /> : state === 'error' && !receipt ? <Alert type="warning" message="办理结果暂时无法读取" /> : null}
      {(receipt || result) ? (
        <dl>
          {actorLabel ? <div><dt>办理人</dt><dd>{actorLabel}</dd></div> : null}
          {timeLabel ? <div><dt>办理时间</dt><dd>{timeLabel}</dd></div> : null}
          {receipt?.recordNo ? <div><dt>业务单号</dt><dd>{receipt.recordNo}</dd></div> : null}
          {receipt?.successMessage && receipt.successMessage !== title ? <div><dt>办理结果</dt><dd>{receipt.successMessage}</dd></div> : null}
          {reason ? <div><dt>{receipt?.reasonLabel || '办理说明'}</dt><dd>{reason}</dd></div> : null}
          {receipt?.additionalReason && receipt.additionalReason !== reason ? <div><dt>补充说明</dt><dd>{receipt.additionalReason}</dd></div> : null}
          {fields.map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}
        </dl>
      ) : state === 'ready' ? <p>尚未记录本任务的办理结果。</p> : null}
      <ReceiptItems title="本次业务明细" items={items} count={receipt?.itemCount} />
      {sourceReadback?.state === 'loading' ? <Spin size="small" /> : sourceReadback?.state === 'error' ? <Alert type="warning" message="来源资料暂时无法读取" action={<Button onClick={sourceReadback.retry}>重新读取</Button>} /> : null}
      {sourceReadback?.summary ? (
        <section className="workflow-task-receipt__source-details" aria-label="来源业务当前资料">
          <h3>来源业务当前资料</h3>
          <dl>
            {sourceReadback.summary.recordNo ? <div><dt>业务单号</dt><dd>{sourceReadback.summary.recordNo}</dd></div> : null}
            {sourceReadback.summary.fields.map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}
          </dl>
          <ReceiptItems title="业务明细" items={sourceReadback.summary.items} count={sourceReadback.summary.itemCount} />
        </section>
      ) : null}
      {taskReadPending ? <Alert type="warning" message="业务结果已保存，任务状态尚未确认。请返回办理重新读取任务，暂不重复提交业务。" /> : null}
    </section>
  )
}
