import React from 'react'
import { DownOutlined } from '@ant-design/icons'
import WorkflowTaskIdentity from './WorkflowTaskIdentity.jsx'
import WorkflowTaskTiming from './WorkflowTaskTiming.jsx'
import WorkflowTaskClassification from './WorkflowTaskClassification.jsx'
import { TaskCopyField } from './WorkflowTaskCopy.jsx'
import './workflowTaskInfoCard.css'

export default function WorkflowTaskInfoCard({ task, title, status, source, summary, resources, events = [], businessInfo, showDetails = true, className = '', titleClassName = '' }) {
  const taskNumber = typeof task?.task_no === 'string' ? task.task_no.trim() : ''
  return (
    <>
      <section className={`workflow-task-info-card ${className}`} aria-label="任务信息">
        <div className="workflow-task-info-card__heading"><h2 className={titleClassName}>{title}</h2>{status ? <span className="workflow-task-info-card__badges">{status}</span> : null}</div>
        <div className="workflow-task-info-card__identity"><WorkflowTaskIdentity task={task} source={source} detailView /></div>
        {summary}
        {showDetails ? (
          <details key={task.id} className="workflow-task-info-card__details">
            <summary><span>任务信息</span><DownOutlined aria-hidden="true" /></summary>
            <dl className="workflow-task-info-card__number">
              <dt>任务编号</dt>
              <dd><TaskCopyField value={taskNumber} label="任务编号">{taskNumber || '未记录'}</TaskCopyField></dd>
            </dl>
            <WorkflowTaskClassification task={task} />
            <WorkflowTaskTiming task={task} events={events} detail includeKeys={['arrived', 'blocked', 'ended']} />
          </details>
        ) : null}
        {resources ? <div className="workflow-task-info-card__actions">{resources}</div> : null}
      </section>
      {businessInfo ? (
        <section className="workflow-task-info-card workflow-task-info-card--business" aria-label="业务信息">
          {businessInfo}
        </section>
      ) : null}
    </>
  )
}
