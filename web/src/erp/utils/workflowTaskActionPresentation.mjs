import { isWorkflowApprovalTask } from './workflowTaskActionContract.mjs'
import { WORKFLOW_TASK_COLLABORATION_ACTIONS } from './workflowTaskActionFlow.mjs'

export const TASK_ACTION_META = Object.freeze({
  complete: {
    title: '完成任务',
    buttonLabel: '确认完成',
    successMessage: '任务已处理完成',
    requireReason: false,
  },
  block: {
    title: WORKFLOW_TASK_COLLABORATION_ACTIONS.block.label,
    buttonLabel: '标记受阻',
    successMessage: '阻塞原因已记录',
    requireReason: true,
  },
  reject: {
    title: '退回协同任务',
    buttonLabel: '提交退回',
    successMessage: '退回原因已记录',
    requireReason: true,
  },
  resume: {
    title: WORKFLOW_TASK_COLLABORATION_ACTIONS.resume.label,
    buttonLabel: '确认恢复待处理',
    successMessage: '任务已解除阻塞',
    requireReason: true,
  },
  urge: {
    title: WORKFLOW_TASK_COLLABORATION_ACTIONS.urge.label,
    buttonLabel: '提交催办',
    successMessage: '催办已记录',
    requireReason: true,
  },
  assign: {
    title: WORKFLOW_TASK_COLLABORATION_ACTIONS.assign.label,
    buttonLabel: '确认转交',
    successMessage: '任务已转交',
    requireReason: true,
  },
})

export function getWorkflowTaskActionMeta(task = {}, actionMode = '') {
  const base = TASK_ACTION_META[actionMode]
  if (!base) return null

  if (task?.task_group === 'business_followup' && actionMode === 'complete') {
    return { ...base, title: '完成跟进任务', requireReason: true }
  }
  if (task?.task_group === 'order_review' && !isWorkflowApprovalTask(task) && ['complete', 'reject'].includes(actionMode)) {
    return { ...base, title: actionMode === 'complete' ? '完成订单评审' : '评审退回' }
  }
  const processLinked = Number(task?.process_instance_id || 0) > 0
  if (!isWorkflowApprovalTask(task)) {
    if (!processLinked) return base
    if (actionMode === 'complete') {
      return {
        ...base,
        successMessage: '任务已处理完成，系统已按结果自动流转',
      }
    }
    if (actionMode === 'reject') {
      return {
        ...base,
        successMessage: '任务已退回，系统已按结果自动流转',
      }
    }
    return base
  }
  if (actionMode === 'complete') {
    return {
      ...base,
      title: '审批通过',
      buttonLabel: '确认通过',
      successMessage: processLinked
        ? '审批已通过，系统已按结果自动流转'
        : '审批已通过',
      requireReason: true,
    }
  }
  if (actionMode === 'reject') {
    return {
      ...base,
      title: '审批退回',
      buttonLabel: '确认退回',
      successMessage: processLinked
        ? '审批已退回，系统已按结果自动流转'
        : '审批已退回',
    }
  }
  return base
}
