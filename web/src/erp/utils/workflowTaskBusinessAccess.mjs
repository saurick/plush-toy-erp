import { isTerminalWorkflowTask } from './workflowTaskLifecycle.mjs'
import { hasActionPermission } from './masterDataOrderView.mjs'
import { ProcessNodeStatus, ProcessNodeType, ProcessStatus, WorkflowTaskStatus } from '../../common/consts/statuses.generated.mjs'

export function canHandleWorkflowTaskBusiness(task, profile, access, processContext) {
  if (!task || !profile || profile.disabled || access?.source !== 'backend' || !access.sourceAccess?.allowed) return false
  if (task.assignee_id && Number(task.assignee_id) !== Number(profile.id)) return false
  if (isTerminalWorkflowTask(task)) {
    // A completed handoff may leave an explicit fact command awaiting execution.
    if (task.task_status_key !== WorkflowTaskStatus.DONE || !task.process_instance_id ||
      processContext?.process_instance?.id !== task.process_instance_id ||
      processContext.process_instance.status !== ProcessStatus.ACTIVE ||
      processContext.source?.type !== task.source_type || processContext.source?.id !== task.source_id ||
      processContext.linked_node?.id !== task.process_node_instance_id ||
      processContext.linked_node?.status !== ProcessNodeStatus.COMPLETED) return false
    const responsible = Object.values(access.byAction || {}).some((item) => item.ownerRoleMatched || item.workPoolEntitlementScopeMatched)
    return responsible && processContext.current_nodes?.some((node) =>
      node.process_instance_id === task.process_instance_id && node.node_type === ProcessNodeType.DOMAIN_COMMAND &&
      node.status === ProcessNodeStatus.ACTIVE && node.owner_pool_key &&
      node.owner_pool_key === (task.owner_pool_key || task.owner_role_key) &&
      Boolean(node.required_capability_key) && hasActionPermission(profile, node.required_capability_key)
    ) === true
  }
  return Object.values(access.byAction || {}).some((item) => ['complete', 'block', 'reject', 'resume'].includes(item.actionMode) && (item.allowed || item.ownerRoleMatched || item.workPoolEntitlementScopeMatched))
}
