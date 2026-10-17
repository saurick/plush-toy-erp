import React from 'react'
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
        {resources ? <div className="workflow-task-info-card__actions">{resources}</div> : null}
      </section>
      <section className="workflow-task-info-card workflow-task-info-card--business" aria-label="业务信息">
        <h3>业务信息</h3>
        <WorkflowTaskTiming task={task} events={events} detail includeKeys={['arrived', 'blocked', 'ended']} />
        {businessInfo}
      </section>
    </>
  )
}
