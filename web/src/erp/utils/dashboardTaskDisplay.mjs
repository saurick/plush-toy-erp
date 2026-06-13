import { dashboardModules } from '../config/dashboardModules.mjs'

const TASK_SOURCE_TITLE_MAP = new Map([
  ...dashboardModules.map((moduleItem) => [moduleItem.key, moduleItem.title]),
  ['project-orders', '销售订单'],
  ['material-bom', '工程资料协同'],
  ['accessories-purchase', '采购协同'],
  ['processing-contracts', '委外协同'],
  ['inbound', '入库协同'],
  ['inventory', '库存协同'],
  ['shipping-release', '出货放行协同'],
  ['outbound', '出库协同'],
  ['production-scheduling', '生产排程协同'],
  ['production-progress', '生产进度协同'],
  ['production-exceptions', '生产异常协同'],
  ['quality-inspections', '品质检验协同'],
  ['reconciliation', '财务对账协同'],
  ['payables', '应付协同'],
  ['receivables', '应收开票协同'],
  ['invoices', '发票协同'],
])
const TASK_SOURCE_PATH_MAP = new Map(
  dashboardModules.map((moduleItem) => [moduleItem.key, moduleItem.path])
)
const TASK_LINK_MATCH_FIELDS = Object.freeze(['document_no', 'source_no'])
const BUSINESS_DASHBOARD_PATH = '/erp/business-dashboard'
const ACTIVE_TASK_ENTRY_PATHS = new Set([
  '/erp/business-dashboard',
  '/erp/master/partners/customers',
  '/erp/master/partners/suppliers',
  '/erp/sales/project-orders/sales-orders',
])

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
      : BUSINESS_DASHBOARD_PATH

  const query = buildDashboardTaskQuery({
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
