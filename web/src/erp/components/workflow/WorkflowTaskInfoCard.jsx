import React from 'react'
import { DownOutlined } from '@ant-design/icons'
import WorkflowTaskIdentity from './WorkflowTaskIdentity.jsx'
import WorkflowTaskTiming from './WorkflowTaskTiming.jsx'
import './workflowTaskInfoCard.css'

export default function WorkflowTaskInfoCard({ task, title, status, source, summary, resources, events = [], businessInfo, className = '', titleClassName = '' }) {
  return (
    <>
      <section className={`workflow-task-info-card ${className}`} aria-label="任务信息">
        <div className="workflow-task-info-card__heading"><h2 className={titleClassName}>{title}</h2>{status}</div>
        <div className="workflow-task-info-card__identity"><WorkflowTaskIdentity task={task} source={source} detailView /></div>
        {summary}
        <details key={task.id} className="workflow-task-info-card__details">
          <summary><span>任务信息</span><DownOutlined aria-hidden="true" /></summary>
          {task.discovery?.path ? <dl className="workflow-task-info-card__classification"><dt>分类路径</dt><dd>{task.discovery.path}</dd></dl> : null}
          <WorkflowTaskTiming task={task} events={events} detail includeKeys={['arrived', 'blocked', 'ended']} />
        </details>
        {resources ? <div className="workflow-task-info-card__actions">{resources}</div> : null}
      </section>
      <section className="workflow-task-info-card workflow-task-info-card--business" aria-label="业务信息">
        {businessInfo}
      </section>
    </>
  )
}
