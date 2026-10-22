import { WorkflowTaskStatus } from '../../common/consts/statuses.generated.mjs'
import { getWorkflowTaskIdentity } from './workflowTaskIdentity.mjs'
import { formatWorkflowTaskSource } from './dashboardTaskDisplay.mjs'
import {
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskReasonMeta,
  getWorkflowTaskStatusMeta,
} from './workflowTaskBoard.mjs'
import { getWorkflowTaskTiming } from './workflowTaskTiming.mjs'
import { getWorkflowTaskAssigneeLabel } from './workflowTaskEventPresentation.mjs'
import { getWorkflowTaskDisplayName } from './processRuntimePresentation.mjs'

const text = (value) => (typeof value === 'string' ? value.trim() : '')

export function formatWorkflowProductCopy(items = []) {
  return items
    .map((item) => {
      const material = item.kind === 'material'
      return [
        `${material ? '物料' : '产品'}：${text(item.name) || '名称未填写'}`,
        material
          ? `款号：${text(item.supplierItemNo) || '未填写'}`
          : `产品编号：${text(item.code) || '未填写'}`,
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
  if (!task || !Object.keys(task).length) return ''
  const identity = getWorkflowTaskIdentity(task)
  const reason = getWorkflowTaskReasonMeta(task)
  const timing = getWorkflowTaskTiming(task, { detail: true, showDueRisk: false })
  const role = task.owner_role_key ? getWorkflowTaskOwnerRoleLabel(task) : ''
  const responsibility = [role || '负责岗位未提供', text(assigneeLabel) || getWorkflowTaskAssigneeLabel(task)].join(' · ')
  return [
    `任务：${getWorkflowTaskDisplayName(task)}`,
    identity.available && identity.items.length ? formatWorkflowProductCopy(identity.items) : `关联内容：${identity.available ? '未关联产品／物料' : '关联内容不可用'}`,
    `关联单据：${formatWorkflowTaskSource(task)}`,
    task.task_group === 'business_followup' && text(task.payload?.description) && `任务要求：${text(task.payload.description)}`,
    task.task_group === 'business_followup' && task.task_status_key === WorkflowTaskStatus.DONE && text(task.payload?.feedback) && `处理结果：${text(task.payload.feedback)}`,
    task.task_status_key && `状态：${getWorkflowTaskStatusMeta(task).label}`,
    reason.value && `${reason.label}：${reason.value}`,
    responsibility && `负责：${responsibility}`,
    ...timing.map((row) => `${row.label}：${row.value}`),
  ]
    .filter(Boolean)
    .join('\n')
}
