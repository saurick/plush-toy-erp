import React from 'react'
import { WorkflowTaskStatus } from '../../../common/consts/statuses.generated.mjs'
import './workflowProcessStageTrack.css'

const TASK_TONES = {
  [WorkflowTaskStatus.READY]: 'active',
  [WorkflowTaskStatus.BLOCKED]: 'blocked',
  [WorkflowTaskStatus.DONE]: 'completed',
  [WorkflowTaskStatus.REJECTED]: 'rejected',
  [WorkflowTaskStatus.WITHDRAWN]: 'withdrawn',
}
const MARKERS = { active: '●', blocked: '!', completed: '✓', rejected: '↩', withdrawn: '−', neutral: '○' }

export default function WorkflowProgressMarker({ status, tone = TASK_TONES[status] || 'neutral', children }) {
  return <span className={`workflow-business-chain__marker workflow-process-stage__item--${tone}`} aria-hidden="true"><span className="workflow-process-stage__marker">{children ?? MARKERS[tone]}</span></span>
}
