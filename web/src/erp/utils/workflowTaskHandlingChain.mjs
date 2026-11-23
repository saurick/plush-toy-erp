import { MaterialRequestStatus, SalesOrderStatus, WorkflowTaskStatus } from '../../common/consts/statuses.generated.mjs'
import {
  getEngineeringMaterialTaskContext,
  ENGINEERING_MATERIAL_STATUS,
} from './engineeringMaterialTask.mjs'
import { getWorkflowTaskDisplayName } from './processRuntimePresentation.mjs'
import { formatWorkflowTaskEventTime } from './workflowTaskEventPresentation.mjs'
import {
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskStatusMeta,
} from './workflowTaskBoard.mjs'

export function buildCurrentTaskStageModel(task) {
  const status = task.task_status_key
  return {
    processLabel: '当前任务',
    summaryLabel: '当前任务',
    handoffKind: 'task',
    handoffLabel: '当前仅有本任务记录，尚无可核对的跨岗处理链。',
    items: [
      {
        key: String(task.id),
        label: getWorkflowTaskDisplayName(task),
        statusLabel: [
          getWorkflowTaskOwnerRoleLabel(task),
          getWorkflowTaskStatusMeta(task).label,
        ]
          .filter(Boolean)
          .join(' · '),
        tone:
          status === WorkflowTaskStatus.DONE
            ? 'completed'
            : status === WorkflowTaskStatus.BLOCKED
              ? 'blocked'
              : [WorkflowTaskStatus.REJECTED, WorkflowTaskStatus.WITHDRAWN].includes(status)
                ? 'rejected'
                : 'active',
        current: [WorkflowTaskStatus.READY, WorkflowTaskStatus.BLOCKED].includes(status),
        linked: true,
      },
    ],
  }
}

// 只投影本次提交的审核证据；重提产生新源单，不能拼接成同一轮审批。
export function buildEngineeringMaterialStageModel(task, request) {
  const source = getEngineeringMaterialTaskContext(task)
  if (
    !source ||
    Number(request?.id) !== source.requestID ||
    Number(request?.sales_order_id) !== source.orderID ||
    !Object.hasOwn(ENGINEERING_MATERIAL_STATUS, request.status) ||
    request.status === 'PREVIEW'
  ) {
    return null
  }
  const revisionTask = task.task_group === 'engineering_material_revision' ? task : null
  return buildEngineeringMaterialReviewStageModel(request, { task, revisionTask })
}

export function buildEngineeringMaterialReviewStageModel(request, { task, revisionTask, currentTask } = {}) {
  const tracking = currentTask !== undefined
  const time = (value) => Number.isSafeInteger(value) && value > 0
    ? value
    : typeof value === 'string' ? Date.parse(value) / 1000 || null : null
  const hasTime = (value) =>
    Number.isFinite(time(value))
  const bossApproved = hasTime(request.boss_reviewed_at)
  const financeApproved = hasTime(request.finance_reviewed_at)
  const rejected = request.status === MaterialRequestStatus.REJECTED
  if (
    !hasTime(request.submitted_at) ||
    !request.order_status ||
    (request.status === MaterialRequestStatus.SUBMITTED && bossApproved) ||
    (request.status !== MaterialRequestStatus.APPROVED && financeApproved) ||
    ([MaterialRequestStatus.BOSS_APPROVED, MaterialRequestStatus.APPROVED].includes(request.status) && !bossApproved) ||
    (request.status === MaterialRequestStatus.APPROVED && !financeApproved) ||
    (rejected && !hasTime(request.rejected_at))
  ) {
    return null
  }

  const items = []
  const append = (key, label, statusLabel, tone, at, note, current = false, actor = '') =>
    items.push({
      key,
      label,
      statusLabel,
      tone,
      current,
      completedAt: !current && hasTime(at) ? time(at) : null,
      startedAtLabel: current && hasTime(at) ? formatWorkflowTaskEventTime(at) : '',
      completedAtLabel: !current && hasTime(at) ? formatWorkflowTaskEventTime(at) : '',
      linked: task?.task_group === `engineering_material_${key}`,
      actor,
      reason: note || '',
      detail: [hasTime(at) ? formatWorkflowTaskEventTime(at) : '', note]
        .filter(Boolean)
        .join(' · '),
    })
  append('submit', '自动生成用料汇总', '已提交', 'completed', request.submitted_at, '', false, request.submitted_by_name)
  if (bossApproved) {
    append(
      'boss_review',
      '老板审核',
      '已通过',
      'completed',
      request.boss_reviewed_at,
      request.boss_review_note,
false,
request.boss_reviewed_by_name
    )
  }
  if (financeApproved) {
    append(
      'finance_review',
      '财务审核',
      '已批准采购',
      'completed',
      request.finance_reviewed_at,
      request.finance_review_note,
false,
request.finance_reviewed_by_name
    )
  }
  if (rejected) {
    append(
      bossApproved ? 'finance_review' : 'boss_review',
      bossApproved ? '财务审核' : '老板审核',
      '已退回',
      'rejected',
      request.rejected_at,
      request.review_note,
false,
request.rejected_by_name
    )
  }

  const orderClosed = request.order_status && request.order_status !== SalesOrderStatus.ACTIVE
  if (!orderClosed && (!tracking || currentTask) && [MaterialRequestStatus.SUBMITTED, MaterialRequestStatus.BOSS_APPROVED].includes(request.status)) {
    const finance = request.status === MaterialRequestStatus.BOSS_APPROVED
    const blocked = currentTask?.task_status_key === WorkflowTaskStatus.BLOCKED
    append(
      finance ? 'finance_review' : 'boss_review',
      finance ? '财务审核' : '老板审核',
      blocked ? '受阻' : tracking ? '待审批' : '待处理',
      blocked ? 'blocked' : 'active',
      currentTask?.created_at ?? null,
      null,
      true
    )
  }
  if (revisionTask) {
    const own = buildCurrentTaskStageModel(revisionTask).items[0]
    items.push({
      ...own,
      key: 'revision',
      linked: Boolean(task),
      label: '工程修改用料',
      actor: revisionTask.actor,
      reason: revisionTask.reason,
      startedAtLabel: revisionTask.created_at ? formatWorkflowTaskEventTime(revisionTask.created_at) : '',
      completedAtLabel: revisionTask.completed_at ? formatWorkflowTaskEventTime(revisionTask.completed_at) : '',
      detail: revisionTask.completed_at
        ? formatWorkflowTaskEventTime(revisionTask.completed_at)
        : '',
    })
  }
  if (
    orderClosed &&
    task?.task_status_key === WorkflowTaskStatus.WITHDRAWN &&
    !items.some((item) => item.linked)
  ) {
    items.push(buildCurrentTaskStageModel(task).items[0])
  }
  return {
    processLabel: '本次用料审批',
    summaryLabel: ENGINEERING_MATERIAL_STATUS[request.status],
    handoffKind: 'source',
    handoffLabel: orderClosed
      ? '订单已结束，未完成的审批已停止。'
      : revisionTask?.task_status_key === WorkflowTaskStatus.DONE
        ? '本轮已退回；资料保存后已自动重新送审，后续审批记录在新的用料汇总中。'
        : rejected
          ? '本轮已退回工程修改。'
          : request.status === MaterialRequestStatus.APPROVED
            ? '本次用料已批准采购。'
            : request.status === MaterialRequestStatus.BOSS_APPROVED
              ? '老板已通过，当前由财务审核。'
              : '用料已自动送审，当前由老板审核。',
    items,
  }
}
