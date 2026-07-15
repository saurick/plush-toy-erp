import { businessModuleDefinitions } from '../config/businessModules.mjs'
import { dashboardModules } from '../config/dashboardModules.mjs'
import {
  isInternalWorkflowDocumentRef,
  resolveReadableWorkflowSourceNo,
} from './workflowDocumentRefs.mjs'

const TASK_SOURCE_TITLE_MAP = new Map([
  ...dashboardModules.map((moduleItem) => [moduleItem.key, moduleItem.title]),
  ['project-orders', '销售订单'],
  ['material-bom', '工程资料'],
  ['accessories-purchase', '采购订单'],
  ['processing-contracts', '委外订单'],
  ['inbound', '入库任务'],
  ['inventory', '库存任务'],
  ['shipping-release', '出货放行'],
  ['outbound', '出库任务'],
  ['production-scheduling', '生产排程'],
  ['production-progress', '生产进度'],
  ['production-exceptions', '生产异常'],
  ['quality-inspections', '质量检验'],
  ['reconciliation', '财务对账'],
  ['payables', '应付处理'],
  ['receivables', '应收与开票'],
  ['invoices', '发票处理'],
  ['shipments', '出货单'],
])
const FORMAL_V1_TASK_ENTRY_MODULES = businessModuleDefinitions.filter(
  (moduleItem) => moduleItem.pageKind === 'formal-v1'
)
const TASK_SOURCE_PATH_MAP = new Map([
  ...FORMAL_V1_TASK_ENTRY_MODULES.map((moduleItem) => [
    moduleItem.key,
    moduleItem.path,
  ]),
  ...dashboardModules.map((moduleItem) => [moduleItem.key, moduleItem.path]),
])
const TASK_LINK_MATCH_FIELDS = Object.freeze(['document_no', 'source_no'])
const ACTIVE_TASK_ENTRY_PATHS = new Set([
  '/erp/business-dashboard',
  ...FORMAL_V1_TASK_ENTRY_MODULES.map((moduleItem) => moduleItem.path),
  ...dashboardModules.map((moduleItem) => moduleItem.path),
])

export function getWorkflowTaskSourceTypeLabel(
  sourceType,
  fallback = '业务来源'
) {
  const normalizedSourceType = String(sourceType || '').trim()
  if (!normalizedSourceType) {
    return fallback
  }
  return TASK_SOURCE_TITLE_MAP.get(normalizedSourceType) || fallback
}

export function formatWorkflowTaskSource(task = {}) {
  const sourceNo = resolveReadableWorkflowSourceNo(task, ['source_no'])
  if (sourceNo) {
    return sourceNo
  }

  const sourceType = String(task.source_type || '').trim()
  const sourceTitle = getWorkflowTaskSourceTypeLabel(sourceType, '')
  const hasLinkedSource = Boolean(
    task.source_id || isInternalWorkflowDocumentRef(task.source_no, task)
  )
  if (sourceTitle && hasLinkedSource) {
    return `${sourceTitle} / 已关联业务来源`
  }
  if (sourceTitle) {
    return sourceTitle
  }
  if (hasLinkedSource) {
    return '已关联业务来源'
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

function buildDashboardTaskQuery({ keyword, sourceKey, matchFields } = {}) {
  const params = new URLSearchParams()
  const normalizedKeyword = String(keyword ?? '').trim()
  if (normalizedKeyword) {
    params.set('link_keyword', normalizedKeyword)
  }

  const normalizedSourceKey = String(sourceKey ?? '').trim()
  if (normalizedSourceKey) {
    params.set('link_source', normalizedSourceKey)
  }

  const normalizedMatchFields = Array.isArray(matchFields)
    ? matchFields.map((item) => String(item ?? '').trim()).filter(Boolean)
    : []
  if (normalizedMatchFields.length > 0) {
    params.set('link_fields', normalizedMatchFields.join(','))
  }

  return params.toString()
}

function payloadOf(task = {}) {
  return task.payload && typeof task.payload === 'object' ? task.payload : {}
}

export function resolveWorkflowTaskEntryPath(task = {}) {
  const payload = payloadOf(task)
  const entryPath = String(payload.entry_path || '').trim()
  const sourceType = String(task.source_type || '').trim()
  const sourcePath = TASK_SOURCE_PATH_MAP.get(sourceType) || ''
  const path = ACTIVE_TASK_ENTRY_PATHS.has(entryPath)
    ? entryPath
    : ACTIVE_TASK_ENTRY_PATHS.has(sourcePath)
      ? sourcePath
      : ''
  if (!path) {
    return ''
  }

  const linkKeyword = resolveReadableWorkflowSourceNo(task, [
    'source_no',
    'document_no',
  ])
  const query = buildDashboardTaskQuery({
    keyword: linkKeyword,
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
