import { getBusinessPaginationParams } from './businessPagination.mjs'

function normalizedPositiveInteger(value, fallback = 1) {
  return Number.isSafeInteger(Number(value)) && Number(value) > 0
    ? Number(value)
    : fallback
}

function invalidWorkflowBusinessTaskPage() {
  return Object.assign(new Error('任务列表暂时无法显示，请刷新后重试'), {
    isInvalidResponse: true,
  })
}

export function buildWorkflowBusinessTaskQuery({
  taskGroup,
  keyword = '',
  status = '',
  ownerRoleKey = '',
  dueFrom,
  dueTo,
  pagination = {},
} = {}) {
  const normalizedTaskGroup = String(taskGroup || '').trim()
  if (!normalizedTaskGroup) {
    throw new TypeError('任务分组不能为空')
  }
  const { limit, offset } = getBusinessPaginationParams(pagination)
  const query = {
    task_group: normalizedTaskGroup,
    limit,
    offset,
  }
  const normalizedKeyword = String(keyword || '').trim()
  const normalizedStatus = String(status || '').trim()
  const normalizedOwnerRoleKey = String(ownerRoleKey || '').trim()
  if (normalizedKeyword) query.keyword = normalizedKeyword
  if (normalizedStatus) query.task_status_key = normalizedStatus
  if (normalizedOwnerRoleKey) query.owner_role_key = normalizedOwnerRoleKey
  if (Number.isSafeInteger(dueFrom) && dueFrom > 0) query.due_from = dueFrom
  if (Number.isSafeInteger(dueTo) && dueTo > 0) query.due_to = dueTo
  return query
}

export function requireWorkflowBusinessTaskPage(
  data,
  { taskGroup, limit, offset } = {}
) {
  const expectedTaskGroup = String(taskGroup || '').trim()
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    !Array.isArray(data.tasks) ||
    !Number.isSafeInteger(data.total) ||
    data.total < 0 ||
    !Number.isSafeInteger(data.limit) ||
    data.limit !== limit ||
    !Number.isSafeInteger(data.offset) ||
    data.offset !== offset ||
    data.tasks.length > data.limit ||
    data.tasks.some(
      (task) =>
        !task ||
        typeof task !== 'object' ||
        Array.isArray(task) ||
        !Number.isSafeInteger(task.id) ||
        task.id <= 0 ||
        !Number.isSafeInteger(task.version) ||
        task.version <= 0 ||
        String(task.task_group || '').trim() !== expectedTaskGroup
    )
  ) {
    throw invalidWorkflowBusinessTaskPage()
  }
  return { tasks: data.tasks, total: data.total }
}

export function reconcileWorkflowBusinessTaskPage({
  tasks = [],
  total = 0,
  pagination = {},
  selectedTaskKeys = [],
} = {}) {
  const pageSize = normalizedPositiveInteger(pagination.pageSize, 20)
  const current = normalizedPositiveInteger(pagination.current, 1)
  const normalizedTotal =
    Number.isSafeInteger(total) && total >= 0 ? total : 0
  const lastPage = Math.max(Math.ceil(normalizedTotal / pageSize), 1)
  if (current > lastPage) {
    return {
      current: lastPage,
      shouldRetreat: true,
      tasks: [],
      selectedTaskKeys: [],
    }
  }

  const normalizedTasks = Array.isArray(tasks) ? tasks : []
  const visibleTaskIDs = new Set(normalizedTasks.map((task) => task.id))
  return {
    current,
    shouldRetreat: false,
    tasks: normalizedTasks,
    selectedTaskKeys: selectedTaskKeys.filter((key) =>
      visibleTaskIDs.has(key)
    ),
  }
}

export function buildWorkflowBusinessTaskStats({ total = 0, pageCount = 0 }) {
  return [
    { key: 'total', label: '筛选结果', value: total },
    { key: 'page', label: '本页任务', value: pageCount },
  ]
}
