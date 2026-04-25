import { dashboardModules } from '../config/dashboardModules.mjs'
import { buildModuleTableQuery } from './linkedNavigation.mjs'

const TASK_SOURCE_TITLE_MAP = new Map(
  dashboardModules.map((moduleItem) => [moduleItem.key, moduleItem.title])
)
const TASK_SOURCE_PATH_MAP = new Map(
  dashboardModules.map((moduleItem) => [moduleItem.key, moduleItem.path])
)
const TASK_LINK_MATCH_FIELDS = Object.freeze(['document_no', 'source_no'])

export function formatWorkflowTaskSource(task = {}) {
  if (task.source_no) {
    return task.source_no
  }

  const sourceType = String(task.source_type || '').trim()
  const sourceTitle = TASK_SOURCE_TITLE_MAP.get(sourceType)
  if (sourceTitle && task.source_id) {
    return `${sourceTitle} 第 ${task.source_id} 条`
  }
  if (sourceTitle) {
    return sourceTitle
  }
  if (task.source_id) {
    return `业务单据第 ${task.source_id} 条`
  }
  return '未关联业务单据'
}

export function formatWorkflowAlertSource(alert = {}) {
  return formatWorkflowTaskSource({
    source_no: alert.source_no,
    source_type: alert.source_type,
    source_id: alert.task?.source_id,
  })
}

function appendQuery(path, query) {
  if (!path || !query) {
    return path
  }
  return `${path}${path.includes('?') ? '&' : '?'}${query}`
}

function payloadOf(task = {}) {
  return task.payload && typeof task.payload === 'object' ? task.payload : {}
}

export function resolveWorkflowTaskEntryPath(task = {}) {
  const payload = payloadOf(task)
  const entryPath = String(payload.entry_path || '').trim()
  const sourceType = String(task.source_type || '').trim()
  const path = entryPath.startsWith('/erp/')
    ? entryPath
    : TASK_SOURCE_PATH_MAP.get(sourceType) || ''

  if (!path) {
    return ''
  }

  const query = buildModuleTableQuery({
    keyword: task.source_no,
    sourceKey: 'task-dashboard',
    matchFields: TASK_LINK_MATCH_FIELDS,
  })
  return appendQuery(path, query)
}

export function resolveWorkflowAlertEntryPath(alert = {}) {
  return resolveWorkflowTaskEntryPath({
    ...(alert.task || {}),
    source_no: alert.source_no || alert.task?.source_no,
    source_type: alert.source_type || alert.task?.source_type,
  })
}
