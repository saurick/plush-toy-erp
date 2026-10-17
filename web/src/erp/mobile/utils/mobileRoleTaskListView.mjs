import { buildMobileTaskListForRole } from '../../utils/mobileTaskView.mjs'
import {
  MOBILE_ROLE_TASK_VIEW_KEYS,
  resolveMobileRoleTaskViewState,
} from '../../utils/mobileTaskQueries.mjs'
import {
  MOBILE_TASK_FILTER_KEYS,
  TERMINAL_TASK_STATUS_KEYS,
  isTaskAlerted,
  isTaskBlockedProgress,
  isTaskDueSoon,
  isTaskHighPriority,
  isTaskOverdue,
  isTaskReadyProgress,
} from './mobileRoleTaskModel.mjs'

const TASK_FILTERS = {
  [MOBILE_TASK_FILTER_KEYS.ALERT]: isTaskAlerted,
  [MOBILE_TASK_FILTER_KEYS.OVERDUE]: isTaskOverdue,
  [MOBILE_TASK_FILTER_KEYS.DUE_SOON]: isTaskDueSoon,
  [MOBILE_TASK_FILTER_KEYS.HIGH_PRIORITY]: isTaskHighPriority,
  [MOBILE_TASK_FILTER_KEYS.BLOCKED]: isTaskBlockedProgress,
  [MOBILE_TASK_FILTER_KEYS.BLOCKED_OR_HIGH_PRIORITY]: (task) =>
    isTaskBlockedProgress(task) || isTaskHighPriority(task),
  [MOBILE_TASK_FILTER_KEYS.READY]: isTaskReadyProgress,
}

export function buildMobileRoleTaskLists({ slots, roleKey }) {
  const project = (key) =>
    buildMobileTaskListForRole(slots[key].items, roleKey, {
      nowMs: slots[key].server_time * 1000,
      preserveServerOrder: key !== MOBILE_ROLE_TASK_VIEW_KEYS.HISTORY,
    })
  const activeTasks = project(MOBILE_ROLE_TASK_VIEW_KEYS.TODO).filter(
    (task) => !TERMINAL_TASK_STATUS_KEYS.has(task.task_status_key)
  )
  const doneTasks = project(MOBILE_ROLE_TASK_VIEW_KEYS.HISTORY).filter((task) =>
    TERMINAL_TASK_STATUS_KEYS.has(task.task_status_key)
  )
  const riskTasks = project(MOBILE_ROLE_TASK_VIEW_KEYS.RISK)
  const approvalTasks = project(MOBILE_ROLE_TASK_VIEW_KEYS.APPROVAL)
  const overdueTasks = riskTasks.filter(isTaskOverdue)
  return { activeTasks, doneTasks, riskTasks, approvalTasks, overdueTasks }
}

export function buildMobileRoleTaskListView({
  lists,
  viewKey,
  filterKey,
  selectedTaskID,
  countSummary,
  canViewApprovalInbox,
  isAdminReview,
}) {
  const activeTaskViewState = resolveMobileRoleTaskViewState({
    viewKey,
    todoTasks: lists.activeTasks,
    historyTasks: lists.doneTasks,
    riskTasks: lists.riskTasks,
    approvalTasks: lists.approvalTasks,
    selectedTaskID,
  })
  const predicate = Object.hasOwn(TASK_FILTERS, filterKey)
    ? TASK_FILTERS[filterKey]
    : null
  const filteredTasks = predicate
    ? activeTaskViewState.tasks.filter(predicate)
    : activeTaskViewState.tasks
  const authoritativeTaskCounts = countSummary?.counts || null
  const riskScope = countSummary?.risk_scope || 'role'
  const filterItems = [
    {
      key: MOBILE_TASK_FILTER_KEYS.ALL,
      label: '全部',
      count: authoritativeTaskCounts?.todo ?? null,
    },
    ...(canViewApprovalInbox
      ? [
          {
            key: MOBILE_TASK_FILTER_KEYS.APPROVAL,
            label: '审批',
            ariaLabel: isAdminReview ? '待审批' : '待我审批',
            count: authoritativeTaskCounts?.approval ?? null,
          },
        ]
      : []),
    {
      key: MOBILE_TASK_FILTER_KEYS.RISK,
      label: riskScope === 'supervised' ? '跨岗风险' : '风险',
      count: authoritativeTaskCounts?.risk ?? null,
    },
    {
      key: MOBILE_TASK_FILTER_KEYS.OVERDUE,
      label: '超时',
      count: authoritativeTaskCounts?.overdue ?? null,
    },
  ]
  return {
    ...lists,
    activeTaskViewState,
    filteredTasks,
    filterItems,
    authoritativeTaskCounts,
    riskScope,
  }
}
