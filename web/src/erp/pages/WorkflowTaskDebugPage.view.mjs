import { explainMobileTaskQueryPlan } from '../utils/mobileTaskQueries.mjs'
import {
  buildMobileTaskView,
  explainMobileTaskVisibility,
} from '../utils/mobileTaskView.mjs'
import {
  isCriticalPathWorkflowTask,
  isEscalatedWorkflowTask,
  isTerminalWorkflowTask,
  isUrgedWorkflowTask,
} from '../utils/workflowDashboardStats.mjs'
import { isRoleKeyMatch, normalizeRoleKey } from '../utils/roleKeys.mjs'

export const WORKFLOW_TASK_DEBUG_PATH = '/erp/qa/workflow-task-debug'
export const WORKFLOW_TASK_DEBUG_DOC_PATH = '/erp/docs/workflow-task-debug'

export const WORKFLOW_TASK_DEBUG_ROLE_OPTIONS = Object.freeze([
  { key: 'boss', label: '老板 / 管理层' },
  { key: 'business', label: '业务' },
  { key: 'purchasing', label: '采购' },
  { key: 'production', label: '生产经理' },
  { key: 'warehouse', label: '仓库' },
  { key: 'finance', label: '财务' },
  { key: 'pmc', label: 'PMC' },
  { key: 'quality', label: '品质' },
])

export const WORKFLOW_TASK_DEBUG_FILTER_DEFAULTS = Object.freeze({
  keyword: '',
  source_type: '',
  source_no: '',
  task_group: '',
  task_status_key: '',
  business_status_key: '',
  owner_role_key: '',
  assignee_id: '',
  priority: '',
  alert_level: '',
  blocked: 'any',
  overdue: 'any',
  critical_path: 'any',
  urged: 'any',
  escalated: 'any',
  terminal: 'any',
})

export const WORKFLOW_TASK_BINDING_ROWS = Object.freeze([
  {
    key: 'business-record',
    object: '业务单据',
    field: 'source_type + source_id + source_no',
    table: 'business_records',
    note: '表示任务来自哪张业务单据或哪条业务来源。',
  },
  {
    key: 'business-state',
    object: '业务状态',
    field: 'business_status_key',
    table: 'workflow_business_states',
    note: '表示业务主线推进到哪个状态。',
  },
  {
    key: 'workflow-task',
    object: '协同任务',
    field: 'task_group + task_status_key',
    table: 'workflow_tasks',
    note: '表示协同层要做什么、当前处理进度是什么。',
  },
  {
    key: 'role-pool',
    object: '角色池',
    field: 'owner_role_key',
    table: 'workflow_tasks',
    note: '决定任务进入哪个角色池；menu_permissions 只管菜单可见。',
  },
  {
    key: 'assignee',
    object: '具体处理人',
    field: 'assignee_id',
    table: 'workflow_tasks',
    note: '可选字段，不是每个任务都有具体处理人。',
  },
  {
    key: 'events',
    object: '事件留痕',
    field: 'workflow_task_events',
    table: 'workflow_task_events',
    note: '记录状态变化、催办、升级、阻塞原因等事件。',
  },
])

function toText(value) {
  return String(value ?? '').trim()
}

function toNumber(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return number
}

function payloadOf(task = {}) {
  return task.payload && typeof task.payload === 'object' ? task.payload : {}
}

function matchesText(value, query) {
  if (!query) return true
  return String(value || '')
    .toLowerCase()
    .includes(query)
}

function matchesBooleanFilter(value, filterValue) {
  if (filterValue === 'yes') return Boolean(value)
  if (filterValue === 'no') return !value
  return true
}

function latestTimestamp(task = {}) {
  return Number(task.updated_at || task.created_at || 0)
}

function eventPayloadOf(event = {}) {
  return event.payload && typeof event.payload === 'object' ? event.payload : {}
}

export function formatWorkflowTaskDebugTime(value) {
  const unix = Number(value)
  if (!Number.isFinite(unix) || unix <= 0) return '-'
  return new Date(unix * 1000).toLocaleString('zh-Hans-CN', {
    hour12: false,
  })
}

export function normalizeWorkflowTaskDebugRow(task = {}, options = {}) {
  const taskView = buildMobileTaskView(task, options)
  const payload = payloadOf(taskView)
  return {
    ...taskView,
    key: `workflow-task:${taskView.id || taskView.task_code || taskView.task_name}`,
    assignee_id: taskView.assignee_id || '',
    blocked_reason: taskView.blocked_reason || payload.blocked_reason || '',
    is_blocked:
      taskView.task_status_key === 'blocked' ||
      Boolean(taskView.blocked_reason),
    is_overdue: taskView.due_status === 'overdue',
    is_critical_path: isCriticalPathWorkflowTask(taskView),
    is_urged: isUrgedWorkflowTask(taskView),
    is_escalated: isEscalatedWorkflowTask(taskView),
    is_terminal: isTerminalWorkflowTask(taskView),
  }
}

export function buildWorkflowTaskDebugRows(tasks = [], options = {}) {
  return (Array.isArray(tasks) ? tasks : [])
    .map((task) => normalizeWorkflowTaskDebugRow(task, options))
    .sort((left, right) => latestTimestamp(right) - latestTimestamp(left))
}

export function filterWorkflowTaskDebugRows(rows = [], filters = {}) {
  const mergedFilters = {
    ...WORKFLOW_TASK_DEBUG_FILTER_DEFAULTS,
    ...(filters || {}),
  }
  const keyword = toText(mergedFilters.keyword).toLowerCase()
  const priority = toText(mergedFilters.priority)
  const assigneeID = toText(mergedFilters.assignee_id)

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const keywordMatched =
      !keyword ||
      [
        row.source_no,
        row.task_name,
        row.task_group,
        row.source_type,
        row.task_code,
      ].some((value) => matchesText(value, keyword))

    if (!keywordMatched) return false
    if (
      mergedFilters.source_type &&
      !matchesText(
        row.source_type,
        toText(mergedFilters.source_type).toLowerCase()
      )
    ) {
      return false
    }
    if (
      mergedFilters.source_no &&
      !matchesText(row.source_no, toText(mergedFilters.source_no).toLowerCase())
    ) {
      return false
    }
    if (
      mergedFilters.task_group &&
      !matchesText(
        row.task_group,
        toText(mergedFilters.task_group).toLowerCase()
      )
    ) {
      return false
    }
    if (
      mergedFilters.task_status_key &&
      row.task_status_key !== mergedFilters.task_status_key
    ) {
      return false
    }
    if (
      mergedFilters.business_status_key &&
      row.business_status_key !== mergedFilters.business_status_key
    ) {
      return false
    }
    if (
      mergedFilters.owner_role_key &&
      !isRoleKeyMatch(row.owner_role_key, mergedFilters.owner_role_key)
    ) {
      return false
    }
    if (assigneeID && String(row.assignee_id || '') !== assigneeID) return false
    if (priority && String(row.priority || 0) !== priority) return false
    if (
      mergedFilters.alert_level &&
      row.alert_level !== mergedFilters.alert_level
    ) {
      return false
    }

    return (
      matchesBooleanFilter(row.is_blocked, mergedFilters.blocked) &&
      matchesBooleanFilter(row.is_overdue, mergedFilters.overdue) &&
      matchesBooleanFilter(row.is_critical_path, mergedFilters.critical_path) &&
      matchesBooleanFilter(row.is_urged, mergedFilters.urged) &&
      matchesBooleanFilter(row.is_escalated, mergedFilters.escalated) &&
      matchesBooleanFilter(row.is_terminal, mergedFilters.terminal)
    )
  })
}

export function buildWorkflowTaskDebugSummary(rows = [], filteredRows = rows) {
  const allRows = Array.isArray(rows) ? rows : []
  const visibleRows = Array.isArray(filteredRows) ? filteredRows : []
  return {
    total: allRows.length,
    filtered: visibleRows.length,
    blocked: visibleRows.filter((row) => row.is_blocked).length,
    overdue: visibleRows.filter((row) => row.is_overdue).length,
    criticalPath: visibleRows.filter((row) => row.is_critical_path).length,
    urged: visibleRows.filter((row) => row.is_urged).length,
    escalated: visibleRows.filter((row) => row.is_escalated).length,
    terminal: visibleRows.filter((row) => row.is_terminal).length,
  }
}

export function normalizeWorkflowTaskEventRows(task = {}) {
  const rawEvents =
    task.events || task.workflow_task_events || task.payload?.events || []

  return (Array.isArray(rawEvents) ? rawEvents : [])
    .map((event, index) => {
      const payload = eventPayloadOf(event)
      return {
        key: `workflow-task-event:${event.id || index}`,
        id: event.id || '',
        created_at: Number(event.created_at || 0),
        from_status_key: toText(event.from_status_key),
        to_status_key: toText(event.to_status_key),
        actor_role_key: toText(event.actor_role_key),
        reason: toText(event.reason),
        action: toText(payload.action || event.event_type),
        note: toText(payload.note),
        payload,
      }
    })
    .sort((left, right) => left.created_at - right.created_at)
}

export function buildWorkflowTaskVisibilityDiagnostics(
  rows = [],
  { roleKey = '', sourceNo = '', taskGroup = '', nowMs } = {}
) {
  const queryPlan = explainMobileTaskQueryPlan(roleKey)
  const normalizedQueryRoleKey = normalizeRoleKey(queryPlan.role_key)
  const sourceNoQuery = toText(sourceNo).toLowerCase()
  const taskGroupQuery = toText(taskGroup).toLowerCase()
  const candidates = (Array.isArray(rows) ? rows : []).filter((row) => {
    if (sourceNoQuery && !matchesText(row.source_no, sourceNoQuery)) {
      return false
    }
    if (taskGroupQuery && !matchesText(row.task_group, taskGroupQuery)) {
      return false
    }
    return true
  })

  const diagnostics = candidates.map((row) => {
    const explanation = explainMobileTaskVisibility(row, roleKey, { nowMs })
    const loadedByQueryPlan =
      queryPlan.strategy === 'full_list' ||
      isRoleKeyMatch(row.owner_role_key, normalizedQueryRoleKey)
    const queryReason = loadedByQueryPlan
      ? '任务会被当前 mobileTaskQueries 查询计划加载。'
      : '任务不会被当前 owner_role_key 直查加载，需要确认角色是否应全量加载或 owner_role_key 是否写错。'
    return {
      key: `visibility:${queryPlan.role_key || 'unknown'}:${row.id || row.task_code}`,
      task: row,
      loaded_by_query_plan: loadedByQueryPlan,
      query_reason: queryReason,
      ...explanation,
    }
  })

  return {
    queryPlan,
    rows: diagnostics,
    empty_reason:
      diagnostics.length === 0
        ? '任务没有被 listWorkflowTasks({ limit: 200 }) 加载到，或 source_no / task_group 诊断筛选未命中。'
        : '',
  }
}

export function buildWorkflowTaskDebugView(
  tasks = [],
  filters = {},
  options = {}
) {
  const rows = buildWorkflowTaskDebugRows(tasks, options)
  const filteredRows = filterWorkflowTaskDebugRows(rows, filters)
  return {
    rows,
    filteredRows,
    summary: buildWorkflowTaskDebugSummary(rows, filteredRows),
  }
}
