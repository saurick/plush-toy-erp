import WorkflowTaskInfoCard from '../../components/workflow/WorkflowTaskInfoCard.jsx'
import WorkflowTaskCurrentSummary from '../../components/workflow/WorkflowTaskCurrentSummary.jsx'
import { WorkflowTaskSource } from '../../components/workflow/WorkflowTaskCopy.jsx'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import { getMobileRoleLabel, getTaskSeverityView, resolveMobileTaskStatusLabel, resolveTaskSourceLabel, resolveTaskReason, resolveTaskReasonLabel } from '../utils/mobileRoleTaskModel.mjs'

export function mobileTaskAssigneeLabel(task) {
  return task?.assignee_id ? task.discovery?.assignee_name || '已指定处理人' : '由岗位人员处理'
}

export default function MobileTaskContextCard({ task, status, children }) {
  if (!task) return <section className="workflow-task-info-card"><h2>任务信息暂不可用</h2>{children}</section>
  return (
    <WorkflowTaskInfoCard
      task={task}
      title={getWorkflowTaskDisplayName(task)}
      status={<span className={`mobile-task-flow-status ${getTaskSeverityView(task).badgeClass}`}>{status || resolveMobileTaskStatusLabel(task)}</span>}
      source={<WorkflowTaskSource task={task} label={resolveTaskSourceLabel(task)} />}
      showDetails={false}
      summary={<WorkflowTaskCurrentSummary appearance="facts" task={task} roleLabel={getMobileRoleLabel(task.owner_role_key)} assigneeLabel={mobileTaskAssigneeLabel(task)} reason={resolveTaskReason(task)} reasonLabel={resolveTaskReasonLabel(task)} />}
      businessInfo={children}
    />
  )
}
