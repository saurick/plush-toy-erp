import { WorkflowTaskSource } from '../../components/workflow/WorkflowTaskCopy.jsx'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import { getTaskSeverityView, resolveMobileTaskStatusLabel, resolveTaskSourceLabel } from '../utils/mobileRoleTaskModel.mjs'

export default function MobileTaskContextCard({ task, status, children }) {
  if (!task) return <section className="workflow-task-info-card"><h2>任务信息暂不可用</h2>{children}</section>
  return (
    <section className="workflow-task-info-card" aria-label="当前办理任务">
      <div className="workflow-task-info-card__heading"><h2>{getWorkflowTaskDisplayName(task)}</h2><span className={`mobile-task-flow-status ${getTaskSeverityView(task).badgeClass}`}>{status || resolveMobileTaskStatusLabel(task)}</span></div>
      <WorkflowTaskSource task={task} label={resolveTaskSourceLabel(task)} copyable={false} />
      {children}
    </section>
  )
}
