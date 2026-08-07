export const DEV_FLOW_STATE_TASK_LOOKUP_LIMIT = 50

export const DEV_FLOW_STATE_TASK_RUNTIME_ASSOCIATION = Object.freeze({
  UNKNOWN: 'unknown',
  LINKED: 'linked',
  UNLINKED: 'unlinked',
  INVALID: 'invalid',
})

const MAX_TASK_LOOKUP_LENGTH = 200

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeReference(value) {
  return cleanText(value).toLocaleLowerCase('zh-CN')
}

function invalidLookupResponse() {
  throw new Error('任务查询结果格式无效，请刷新后重试')
}

function normalizeLookupTask(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalidLookupResponse()
  }
  const taskName = cleanText(value.task_name)
  const taskCode = cleanText(value.task_code)
  const sourceNo = cleanText(value.source_no)
  const taskStatusKey = cleanText(value.task_status_key)
  const ownerRoleKey = cleanText(value.owner_role_key)
  if (
    !Number.isSafeInteger(value.id) ||
    value.id <= 0 ||
    !taskName ||
    !taskCode ||
    !taskStatusKey ||
    !ownerRoleKey ||
    (value.source_no != null && typeof value.source_no !== 'string')
  ) {
    invalidLookupResponse()
  }
  return {
    ...value,
    task_name: taskName,
    task_code: taskCode,
    source_no: sourceNo,
    task_status_key: taskStatusKey,
    owner_role_key: ownerRoleKey,
  }
}

function taskReferenceValues(task) {
  return [task.task_name, task.task_code, task.source_no]
    .map(normalizeReference)
    .filter(Boolean)
}

export function parseDevFlowStateTaskIDReference(value) {
  const text = cleanText(value)
  if (!/^\d+$/u.test(text)) return null
  const taskID = Number(text)
  return Number.isSafeInteger(taskID) && taskID > 0 ? taskID : null
}

export function getDevFlowStateTaskRuntimeAssociation(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) {
    return DEV_FLOW_STATE_TASK_RUNTIME_ASSOCIATION.UNKNOWN
  }

  const processInstanceID = task.process_instance_id
  const processNodeInstanceID = task.process_node_instance_id
  const processInstanceMissing =
    processInstanceID == null || processInstanceID === ''
  const processNodeMissing =
    processNodeInstanceID == null || processNodeInstanceID === ''

  if (processInstanceMissing && processNodeMissing) {
    return DEV_FLOW_STATE_TASK_RUNTIME_ASSOCIATION.UNLINKED
  }
  if (
    Number.isSafeInteger(processInstanceID) &&
    processInstanceID > 0 &&
    Number.isSafeInteger(processNodeInstanceID) &&
    processNodeInstanceID > 0
  ) {
    return DEV_FLOW_STATE_TASK_RUNTIME_ASSOCIATION.LINKED
  }
  return DEV_FLOW_STATE_TASK_RUNTIME_ASSOCIATION.INVALID
}

export function isDevFlowStateTaskUnlinkedRuntimeError(error) {
  return cleanText(error?.message) === '当前任务未关联正式流程'
}

export function buildDevFlowStateTaskLookupQuery(value) {
  const keyword = cleanText(value)
  if (!keyword) {
    throw new TypeError('请输入任务名称、任务编号、来源单号或 task_id')
  }
  if (Array.from(keyword).length > MAX_TASK_LOOKUP_LENGTH) {
    throw new TypeError('任务查询内容不能超过 200 个字符')
  }
  return {
    keyword,
    limit: DEV_FLOW_STATE_TASK_LOOKUP_LIMIT,
    offset: 0,
  }
}

export function resolveDevFlowStateTaskLookupPage(data, reference) {
  const query = buildDevFlowStateTaskLookupQuery(reference)
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    !Array.isArray(data.tasks) ||
    !Number.isSafeInteger(data.total) ||
    data.total < 0 ||
    !Number.isSafeInteger(data.limit) ||
    data.limit !== query.limit ||
    !Number.isSafeInteger(data.offset) ||
    data.offset !== query.offset ||
    data.tasks.length > data.limit ||
    data.total < data.tasks.length
  ) {
    invalidLookupResponse()
  }

  const tasks = data.tasks.map(normalizeLookupTask)
  if (new Set(tasks.map((task) => task.id)).size !== tasks.length) {
    invalidLookupResponse()
  }

  const normalizedReference = normalizeReference(reference)
  const visibleMatches = tasks.filter((task) =>
    taskReferenceValues(task).some((value) =>
      value.includes(normalizedReference)
    )
  )
  const exactMatches = visibleMatches.filter((task) =>
    taskReferenceValues(task).some((value) => value === normalizedReference)
  )
  const candidates = exactMatches.length > 0 ? exactMatches : visibleMatches
  const complete = tasks.length === data.total
  let autoSelectedTask = null
  if (complete && exactMatches.length === 1) {
    const [exactTask] = exactMatches
    autoSelectedTask = exactTask
  } else if (complete && exactMatches.length === 0 && candidates.length === 1) {
    const [candidate] = candidates
    autoSelectedTask = candidate
  }

  return {
    autoSelectedTask,
    candidates,
    complete,
    loadedCount: tasks.length,
    serverMatchCount: data.total,
  }
}
