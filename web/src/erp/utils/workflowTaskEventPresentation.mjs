import { getRoleDisplayName } from './roleKeys.mjs'

const TASK_STATUS_LABELS = Object.freeze({
  ready: '待处理',
  blocked: '已阻塞',
  done: '已完成',
  rejected: '已退回',
})

const EVENT_PRESENTATIONS = Object.freeze({
  created: {
    categoryLabel: '进度',
    label: '任务已创建',
    approvalLabel: '审批已发起',
    tone: 'info',
  },
  payload_refreshed: {
    categoryLabel: '进度',
    label: '任务信息已更新',
    tone: 'neutral',
  },
  urge_task: {
    categoryLabel: '责任流转',
    label: '已催办任务',
    tone: 'warning',
  },
  urge_role: {
    categoryLabel: '责任流转',
    label: '已催办负责岗位',
    tone: 'warning',
  },
  urge_assignee: {
    categoryLabel: '责任流转',
    label: '已催办指定处理人',
    tone: 'warning',
  },
  escalate_to_pmc: {
    categoryLabel: '责任流转',
    label: '已升级至 PMC',
    tone: 'warning',
  },
  escalate_to_boss: {
    categoryLabel: '责任流转',
    label: '已升级至老板',
    tone: 'warning',
  },
  reassigned: {
    categoryLabel: '责任流转',
    label: '已转交处理人',
    tone: 'info',
  },
  unassigned: {
    categoryLabel: '责任流转',
    label: '已退回负责岗位共同待办',
    tone: 'info',
  },
})

function normalizedText(value) {
  return String(value ?? '').trim()
}

function positiveInteger(value) {
  const normalized = Number(value)
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : 0
}

function eventDate(value) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    if (numeric <= 0) return null
    const milliseconds = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric
    const date = new Date(milliseconds)
    return Number.isNaN(date.getTime()) ? null : date
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatWorkflowTaskEventTime(value) {
  const date = eventDate(value)
  if (!date) return '时间未记录'
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export function getWorkflowTaskEventStatusLabel(statusKey) {
  return TASK_STATUS_LABELS[normalizedText(statusKey)] || ''
}

function statusChangedPresentation(event, approvalTask) {
  const fromStatusKey = normalizedText(event?.from_status_key)
  const toStatusKey = normalizedText(event?.to_status_key)
  if (toStatusKey === 'done') {
    return {
      categoryLabel: '进度',
      label: approvalTask ? '审批已通过' : '任务已完成',
      tone: 'success',
    }
  }
  if (toStatusKey === 'blocked') {
    return {
      categoryLabel: '异常',
      label: '任务已阻塞',
      tone: 'danger',
    }
  }
  if (toStatusKey === 'rejected') {
    return {
      categoryLabel: '异常',
      label: approvalTask ? '审批已退回' : '任务已退回',
      tone: 'danger',
    }
  }
  if (toStatusKey === 'ready') {
    return {
      categoryLabel: fromStatusKey === 'blocked' ? '恢复' : '进度',
      label:
        fromStatusKey === 'blocked' ? '任务已恢复待处理' : '任务转为待处理',
      tone: 'info',
    }
  }
  return {
    categoryLabel: '进度',
    label: '任务状态已更新',
    tone: 'neutral',
  }
}

function eventPresentation(event, approvalTask) {
  const eventType = normalizedText(event?.event_type)
  if (eventType === 'status_changed') {
    return statusChangedPresentation(event, approvalTask)
  }
  const presentation = EVENT_PRESENTATIONS[eventType]
  if (!presentation) {
    return {
      categoryLabel: '记录',
      label: '任务记录已更新',
      tone: 'neutral',
    }
  }
  return {
    categoryLabel: presentation.categoryLabel,
    label:
      approvalTask && presentation.approvalLabel
        ? presentation.approvalLabel
        : presentation.label,
    tone: presentation.tone,
  }
}

function eventTransitionLabel(event) {
  const fromLabel = getWorkflowTaskEventStatusLabel(event?.from_status_key)
  const toLabel = getWorkflowTaskEventStatusLabel(event?.to_status_key)
  if (fromLabel && toLabel && fromLabel !== toLabel) {
    return `${fromLabel} → ${toLabel}`
  }
  return toLabel || fromLabel
}

export function presentWorkflowTaskEvent(
  event = {},
  { approvalTask = false, index = 0 } = {}
) {
  const presentation = eventPresentation(event, approvalTask)
  const taskVersion = positiveInteger(event.task_version)
  return {
    key:
      positiveInteger(event.id) ||
      `${normalizedText(event.event_type) || 'event'}-${index}`,
    ...presentation,
    actorLabel: getRoleDisplayName(event.actor_role_key, '系统'),
    actorRoleKey: normalizedText(event.actor_role_key),
    reason: normalizedText(event.reason),
    timeLabel: formatWorkflowTaskEventTime(event.created_at),
    transitionLabel: eventTransitionLabel(event),
    versionLabel: taskVersion ? `版本 ${taskVersion}` : '',
  }
}

export function buildWorkflowTaskResponsibilityItems(task = {}) {
  const items = [
    {
      key: 'owner-role',
      label: '当前负责岗位',
      value: getRoleDisplayName(task.owner_role_key, '负责岗位待确认'),
    },
    {
      key: 'assignee',
      label: '当前承接方式',
      value: positiveInteger(task.assignee_id)
        ? '已指定处理人'
        : '岗位共同待办',
    },
    {
      key: 'status',
      label: '当前任务状态',
      value:
        getWorkflowTaskEventStatusLabel(task.task_status_key) || '状态待确认',
    },
  ]

  const urgeCount = positiveInteger(task.urge_count)
  if (urgeCount) {
    const lastUrgedAt = formatWorkflowTaskEventTime(task.last_urged_at)
    items.push({
      key: 'urge',
      label: '催办情况',
      value: `已催办 ${urgeCount} 次${
        lastUrgedAt === '时间未记录' ? '' : ` · 最近 ${lastUrgedAt}`
      }`,
    })
  }

  const escalationRoleKey = normalizedText(task.escalate_target_role_key)
  if (escalationRoleKey) {
    const escalatedAt = formatWorkflowTaskEventTime(task.escalated_at)
    items.push({
      key: 'escalation',
      label: '当前升级责任',
      value: `${getRoleDisplayName(escalationRoleKey, '升级岗位')}${
        escalatedAt === '时间未记录' ? '' : ` · ${escalatedAt}`
      }`,
    })
  }

  const currentReason = normalizedText(task.blocked_reason)
  if (currentReason) {
    items.push({
      key: 'current-reason',
      label:
        normalizedText(task.task_status_key) === 'rejected'
          ? '当前退回原因'
          : '当前阻塞原因',
      value: currentReason,
    })
  }
  return items
}

export function buildWorkflowTaskEventTrailModel({
  approvalTask = false,
  events = [],
  task = {},
} = {}) {
  const normalizedEvents = Array.isArray(events) ? events.filter(Boolean) : []
  return {
    items: normalizedEvents.map((event, index) =>
      presentWorkflowTaskEvent(event, { approvalTask, index })
    ),
    responsibilityItems: buildWorkflowTaskResponsibilityItems(task),
    summaryLabel: normalizedEvents.length
      ? `最近 ${normalizedEvents.length} 条`
      : '暂无事件',
  }
}
