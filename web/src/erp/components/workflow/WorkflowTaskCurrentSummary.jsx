import React from 'react'
import { CheckCircleOutlined, ExclamationCircleOutlined, RightCircleOutlined } from '@ant-design/icons'
import { WorkflowTaskStatus } from '../../../common/consts/statuses.generated.mjs'
import { isTerminalWorkflowTask } from '../../utils/workflowTaskLifecycle.mjs'
import { buildWorkflowProcessStageModel } from '../../utils/processRuntimePresentation.mjs'
import WorkflowTaskTiming from './WorkflowTaskTiming.jsx'
import { getWorkflowTaskTiming } from '../../utils/workflowTaskTiming.mjs'
import { getWorkflowTaskAssigneeLabel } from '../../utils/workflowTaskEventPresentation.mjs'
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
  processContext,
  appearance = 'highlight',
}) {
  const ended = isTerminalWorkflowTask(task)
  const stage = !ended && processContext && processContext.linked_node?.id === task.process_node_instance_id
    ? buildWorkflowProcessStageModel(processContext) : null
  const stepNumber = stage ? stage.items.findIndex((item) => item.linked && item.current) + 1 : 0
  const handler = ended && !task.assignee_id
    ? getWorkflowTaskAssigneeLabel(task)
    : assigneeLabel || getWorkflowTaskAssigneeLabel(task)
  const Icon = ended ? CheckCircleOutlined : task.task_status_key === WorkflowTaskStatus.BLOCKED ? ExclamationCircleOutlined : RightCircleOutlined
  if (appearance === 'facts') {
    const deadline = getWorkflowTaskTiming(task, { detail: true, events }).find((row) => row.key === 'due')
    return (
      <section className="workflow-task-current workflow-task-current--facts" aria-label={ended ? '本任务处理结果' : '当前任务'}>
        <dl className="workflow-task-info-facts">
          <div><dt>负责岗位</dt><dd><strong>{roleLabel || '负责岗位待确认'}</strong>{handler ? <span> · {handler}</span> : null}{stepNumber > 0 ? <span className="workflow-task-info-step" aria-label={`当前业务流程第 ${stepNumber} 步`}>业务流程：第<span className="workflow-task-current__step-number">{stepNumber}</span>步</span> : null}</dd></div>
          <div data-task-time="due"><dt>{deadline?.label}</dt><dd data-tone={deadline?.tone}>{deadline?.dateTime ? <time dateTime={deadline.dateTime} title={deadline.title}>{deadline.value}</time> : deadline?.value}</dd></div>
        </dl>
        {reason || contact?.text ? <div className="workflow-task-info-cause"><p><ExclamationCircleOutlined aria-hidden="true" /><strong>{task.task_status_key === WorkflowTaskStatus.BLOCKED ? '阻塞原因' : reasonLabel}：{reason || contact.text}</strong></p>{reason && contact?.text ? <p data-testid="workflow-task-exception-contact">{contact.parts.map((part, index) => part.kind === 'role' ? <strong key={`${part.kind}-${index}`}>{part.text}</strong> : <React.Fragment key={`${part.kind}-${index}`}>{part.text}</React.Fragment>)}</p> : null}</div> : null}
        {guidance ? <p className="workflow-task-current__guidance">{guidance}</p> : null}
      </section>
    )
  }
  return (
    <section
      className={`workflow-task-current${stepNumber > 0 ? ' workflow-task-current--numbered' : ''}${task.task_status_key === WorkflowTaskStatus.BLOCKED ? ' workflow-task-current--blocked' : ''}${task.task_status_key === WorkflowTaskStatus.DONE ? ' workflow-task-current--done' : ''}`}
      aria-label={ended ? '本任务处理结果' : '当前任务'}
    >
      {stepNumber > 0 ? <span className="workflow-task-current__step-number" aria-label={`当前第 ${stepNumber} 步`}>{stepNumber}</span> : null}
      <div className="workflow-task-current__body">
        <h3>{stepNumber > 0 ? null : <Icon aria-hidden="true" />}{ended ? '本任务处理结果' : task.task_status_key === WorkflowTaskStatus.BLOCKED ? '当前卡点' : '当前办理'}</h3>
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
      </div>
    </section>
  )
}
