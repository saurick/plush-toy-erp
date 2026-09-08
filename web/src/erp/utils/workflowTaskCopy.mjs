import { getWorkflowTaskIdentity } from './workflowTaskIdentity.mjs'
import {
  formatWorkflowTaskSource,
  getWorkflowTaskSourceNo,
} from './dashboardTaskDisplay.mjs'
import {
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskReasonMeta,
  getWorkflowTaskStatusMeta,
} from './workflowTaskBoard.mjs'
import { formatWorkflowTaskTime } from './workflowTaskTiming.mjs'
import { isTerminalWorkflowTask } from './workflowTaskLifecycle.mjs'

const text = (value) => (typeof value === 'string' ? value.trim() : '')

export function formatWorkflowProductCopy(items = []) {
  return items
    .map((item) => {
      const material = item.kind === 'material'
      return [
        text(item.name) && `${material ? '物料' : '产品'}：${text(item.name)}`,
        material
          ? text(item.supplierItemNo) &&
            `款号：${text(item.supplierItemNo)}`
          : text(item.code) && `产品编号：${text(item.code)}`,
        material && text(item.code) ? `系统物料编号：${text(item.code)}` : '',
        !material && text(item.styleNo) && item.styleNo !== item.code
          ? `内部款号：${text(item.styleNo)}`
          : '',
        text(item.orderNo) && `关联订单：${text(item.orderNo)}`,
      ]
        .filter(Boolean)
        .join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
}

export function formatWorkflowTaskCopy(task = {}, { assigneeLabel = '' } = {}) {
  const identity = getWorkflowTaskIdentity(task)
  const reason = getWorkflowTaskReasonMeta(task)
  const arrived = formatWorkflowTaskTime(task.created_at, { exact: true })
  const due = formatWorkflowTaskTime(task.due_at, { exact: true })
  const ended = isTerminalWorkflowTask(task)
    ? formatWorkflowTaskTime(task.completed_at, { exact: true })
    : ''
  const role = task.owner_role_key ? getWorkflowTaskOwnerRoleLabel(task) : ''
  const responsibility = [role, text(assigneeLabel)].filter(Boolean).join(' · ')
  return [
    text(task.task_name) && `任务：${text(task.task_name)}`,
    identity.available ? formatWorkflowProductCopy(identity.items) : '',
    getWorkflowTaskSourceNo(task) &&
      `关联单据：${formatWorkflowTaskSource(task)}`,
    task.task_status_key && `状态：${getWorkflowTaskStatusMeta(task).label}`,
    reason.value && `${reason.label}：${reason.value}`,
    responsibility && `负责：${responsibility}`,
    arrived && `进入本岗：${arrived}`,
    due && `处理截止：${due}`,
    ended && `结束时间：${ended}`,
  ]
    .filter(Boolean)
    .join('\n')
}
