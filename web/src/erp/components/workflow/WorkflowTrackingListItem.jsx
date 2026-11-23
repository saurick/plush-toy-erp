import React from 'react'
import { Tag } from 'antd'
import { ProcessStatus, WorkflowTaskStatus } from '@/common/consts/statuses.generated.mjs'
import { getWorkflowTaskSourceNo } from '../../utils/dashboardTaskDisplay.mjs'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import { getWorkflowTaskEventStatusLabel } from '../../utils/workflowTaskEventPresentation.mjs'
import { getWorkflowResponsibilityParts } from '../../utils/workflowTaskLabels.mjs'
import { isFlowTracking, trackingHandoff, trackingResponsibilityParts, trackingStatus, trackingStatusColor, trackingTitle } from '../../utils/workflowTracking.mjs'
import WorkflowResponsibilities from './WorkflowResponsibilities.jsx'
import { WorkflowTaskSource } from './WorkflowTaskCopy.jsx'
import { WorkflowTaskAssociation } from './WorkflowTaskIdentity.jsx'

export function trackingEntryLabel(entry) {
  return `流程跟踪：${[getWorkflowTaskSourceNo(entry), trackingTitle(entry)].filter(Boolean).join(' · ')}`
}

export function WorkflowTrackingDocument({ entry, keyword, copyable = true }) {
  const sourceHeading = (
    <strong className="erp-workflow-tracking-document">
      <WorkflowTaskSource task={entry} copyable={copyable} showUnavailable={false} />
    </strong>
  )
  return (
    <div className="erp-task-identity erp-task-identity--compact">
      <WorkflowTaskAssociation
        task={entry}
        keyword={keyword}
        heading={sourceHeading}
        emptyLabel={entry.display_context ? undefined : '关联内容未提供'}
        copyable={copyable}
        showStyleNo
      />
    </div>
  )
}

function WorkflowTrackingCurrentTask({ task }) {
  const blocked = task.status === WorkflowTaskStatus.BLOCKED
  const responsibility = blocked
    ? getWorkflowResponsibilityParts({ roleKey: task.owner_role_key, assigneeName: task.assignee_name })
    : trackingResponsibilityParts(task)
  return (
    <div className="erp-workflow-tracking-progress-line">
      <strong>{getWorkflowTaskDisplayName(task)}</strong>
      <WorkflowResponsibilities items={[responsibility]} />
      {blocked ? <Tag color="error">{getWorkflowTaskEventStatusLabel(task.status)}</Tag> : null}
    </div>
  )
}

export function WorkflowTrackingProgress({ entry }) {
  const tasks = entry.current_tasks
  const processBlocked = isFlowTracking(entry) && entry.status === ProcessStatus.BLOCKED &&
    !tasks.some((task) => task.status === WorkflowTaskStatus.BLOCKED)
  return (
    <div className="erp-workflow-tracking-progress">
      {tasks.length ? (
        <>
          {tasks.map((task) => <WorkflowTrackingCurrentTask key={task.task_id} task={task} />)}
          {processBlocked ? <Tag color={trackingStatusColor(entry)}>{trackingStatus(entry)}</Tag> : null}
        </>
      ) : (
        <div className="erp-workflow-tracking-progress-line">
          <strong>{trackingTitle(entry)}</strong>
          <Tag color={trackingStatusColor(entry)}>{trackingHandoff(entry)}</Tag>
        </div>
      )}
    </div>
  )
}
