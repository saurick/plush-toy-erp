import React from 'react'
import { WorkflowTaskStatus } from '../../../common/consts/statuses.generated.mjs'
import './workflowFollowupDetails.css'

export default function WorkflowFollowupDetails({ task }) {
  if (task?.task_group !== 'business_followup') return null
  const description = String(task.payload?.description || '').trim()
  const feedback = task.task_status_key === WorkflowTaskStatus.DONE ? String(task.payload?.feedback || '').trim() : ''
  return (
    <div className="erp-workflow-followup-details">
      {description ? <div><strong>任务要求</strong><p>{description}</p></div> : null}
      {feedback ? <div><strong>处理结果</strong><p>{feedback}</p></div> : null}
    </div>
  )
}
