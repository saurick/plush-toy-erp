import React from 'react'
import { CheckCircleOutlined, ExclamationCircleOutlined, RightCircleOutlined } from '@ant-design/icons'
import { WorkflowTaskStatus } from '../../../common/consts/statuses.generated.mjs'
import { isTerminalWorkflowTask } from '../../utils/workflowTaskLifecycle.mjs'
import WorkflowTaskTiming from './WorkflowTaskTiming.jsx'
import './workflowTaskCurrentSummary.css'

export default function WorkflowTaskCurrentSummary({
  task,
  roleLabel,
  assigneeLabel = '',
  events = [],
  reason = '',
  reasonLabel = '当前原因',
  contact,
  guidance = '',
}) {
  const ended = isTerminalWorkflowTask(task)
  const handler = ended && !task.assignee_id ? '' : assigneeLabel
  const Icon = ended ? CheckCircleOutlined : task.task_status_key === WorkflowTaskStatus.BLOCKED ? ExclamationCircleOutlined : RightCircleOutlined
  return (
    <section
      className={`workflow-task-current${task.task_status_key === WorkflowTaskStatus.BLOCKED ? ' workflow-task-current--blocked' : ''}${task.task_status_key === WorkflowTaskStatus.DONE ? ' workflow-task-current--done' : ''}`}
      aria-label={ended ? '本任务处理结果' : '当前任务'}
    >
      <h3><Icon aria-hidden="true" />{ended ? '本任务处理结果' : task.task_status_key === WorkflowTaskStatus.BLOCKED ? '当前卡点' : '当前办理'}</h3>
      <div className="workflow-task-current__responsibility">
        <strong>{roleLabel || '负责岗位待确认'}</strong>
        {handler ? <span>· {handler}</span> : null}
      </div>
      {reason ? <p className="workflow-task-current__reason"><strong>{reasonLabel}：{reason}</strong></p> : null}
      {contact?.text ? (
        <p className="workflow-task-current__contact" data-testid="workflow-task-exception-contact">
          {contact.parts.map((part, index) => part.kind === 'role' ? (
            <strong key={`${part.kind}-${index}`}>{part.text}</strong>
          ) : <React.Fragment key={`${part.kind}-${index}`}>{part.text}</React.Fragment>)}
        </p>
      ) : null}
      {guidance ? <p className="workflow-task-current__guidance">{guidance}</p> : null}
      <WorkflowTaskTiming task={task} detail compact events={events} />
    </section>
  )
}
