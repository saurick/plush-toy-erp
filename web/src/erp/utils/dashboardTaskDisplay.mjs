import { businessModuleDefinitions } from '../config/businessModules.mjs'
import { dashboardModules } from '../config/dashboardModules.mjs'
import { V1_ROUTE_PATHS } from './masterDataOrderView.mjs'
import { routeWithQuery } from './routeQuery.mjs'
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
  ['production-orders', '生产订单'],
  ['production-scheduling', '生产排程'],
  ['production-progress', '生产记录'],
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
const WORKFLOW_INBOX_SOURCE_TYPES = new Set([
  'production-scheduling',
  'production-exceptions',
  'shipping-release',
])
const ACTIVE_TASK_ENTRY_PATHS = new Set([
  '/erp/business-dashboard',
  ...FORMAL_V1_TASK_ENTRY_MODULES.map((moduleItem) => moduleItem.path),
  ...dashboardModules.map((moduleItem) => moduleItem.path),
])
const DIRECT_TASK_SOURCE_TARGETS = new Map([
  ['project-orders', [V1_ROUTE_PATHS.salesOrders, 'sales_order_id']],
  ['sales-orders', [V1_ROUTE_PATHS.salesOrders, 'sales_order_id']],
  ['sales_order', [V1_ROUTE_PATHS.salesOrders, 'sales_order_id']],
  [
    'accessories-purchase',
    [V1_ROUTE_PATHS.purchaseOrders, 'purchase_order_id'],
  ],
  ['purchase-order', [V1_ROUTE_PATHS.purchaseOrders, 'purchase_order_id']],
  ['purchase_order', [V1_ROUTE_PATHS.purchaseOrders, 'purchase_order_id']],
  ['inbound', [V1_ROUTE_PATHS.purchaseReceipts, 'receipt_id']],
  ['purchase-receipt', [V1_ROUTE_PATHS.purchaseReceipts, 'receipt_id']],
  ['purchase_receipt', [V1_ROUTE_PATHS.purchaseReceipts, 'receipt_id']],
  [
    'processing-contracts',
    [V1_ROUTE_PATHS.processingContracts, 'outsourcing_order_id'],
  ],
  [
    'outsourcing-order',
    [V1_ROUTE_PATHS.processingContracts, 'outsourcing_order_id'],
  ],
  [
    'outsourcing_order',
    [V1_ROUTE_PATHS.processingContracts, 'outsourcing_order_id'],
  ],
  [
    'production-orders',
    [V1_ROUTE_PATHS.productionOrders, 'production_order_id'],
  ],
  [
    'production-order',
    [V1_ROUTE_PATHS.productionOrders, 'production_order_id'],
  ],
  [
    'production_order',
    [V1_ROUTE_PATHS.productionOrders, 'production_order_id'],
  ],
  ['production-progress', [V1_ROUTE_PATHS.productionProgress, 'fact_id']],
  ['production-fact', [V1_ROUTE_PATHS.productionProgress, 'fact_id']],
  ['production_fact', [V1_ROUTE_PATHS.productionProgress, 'fact_id']],
  [
    'quality-inspections',
    [V1_ROUTE_PATHS.qualityInspections, 'quality_inspection_id'],
  ],
  [
    'quality-inspection',
    [V1_ROUTE_PATHS.qualityInspections, 'quality_inspection_id'],
  ],
  [
    'quality_inspection',
    [V1_ROUTE_PATHS.qualityInspections, 'quality_inspection_id'],
  ],
  ['shipments', [V1_ROUTE_PATHS.shipments, 'shipment_id']],
  ['shipment', [V1_ROUTE_PATHS.shipments, 'shipment_id']],
])
const SOURCE_TASK_CONTRACT = 'workflow.source-task/v1'
const SOURCE_TASK_INTENT_HASH_PATTERN = /^[0-9a-f]{64}$/
const STANDALONE_SOURCE_TASK_CONTRACTS = new Map([
  [
    'production_scheduling',
    Object.freeze({
      taskGroup: 'production_scheduling',
      sourceType: 'production-orders',
      producer: 'production_order.release',
      taskCodePrefix: 'source-production-scheduling-',
      ownerRoleKey: 'pmc',
      payloadSourceIDKey: 'production_order_id',
    }),
  ],
  [
    'production_exception',
    Object.freeze({
      taskGroup: 'production_exception',
      sourceType: 'production-progress',
      producer: 'production_rework.post',
      taskCodePrefix: 'source-production-exception-',
      ownerRoleKey: 'production',
      payloadSourceIDKey: 'production_fact_id',
    }),
  ],
  [
    'shipment_release',
    Object.freeze({
      taskGroup: 'shipment_release',
      sourceType: 'shipments',
      producer: 'shipment.submit_release',
      taskCodePrefix: 'source-shipment-release-',
      ownerRoleKey: 'warehouse',
      payloadSourceIDKey: 'shipment_id',
    }),
  ],
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
  if (
    task?.payload?.simulated_only === true ||
    String(task.source_type || '') === 'simulated-manual-acceptance-task-batch'
  ) {
    return '模拟任务批次'
  }
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

function standaloneSourceTaskContract(task = {}) {
  const taskGroup = String(task.task_group || '')
    .trim()
    .toLowerCase()
  return STANDALONE_SOURCE_TASK_CONTRACTS.get(taskGroup) || null
}

function isTrustedStandaloneSourceTask(task = {}) {
  const contract = standaloneSourceTaskContract(task)
  if (!contract) return false
  const payload = payloadOf(task)
  const sourceID = task.source_id
  return Boolean(
    Number.isSafeInteger(sourceID) &&
      sourceID > 0 &&
      task.task_group === contract.taskGroup &&
      task.task_code === `${contract.taskCodePrefix}${sourceID}` &&
      task.owner_role_key === contract.ownerRoleKey &&
      task.source_type === contract.sourceType &&
      payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      payload.source_task_contract === SOURCE_TASK_CONTRACT &&
      payload.source_task_producer === contract.producer &&
      payload[contract.payloadSourceIDKey] === sourceID &&
      typeof payload.source_task_intent_hash === 'string' &&
      SOURCE_TASK_INTENT_HASH_PATTERN.test(payload.source_task_intent_hash)
  )
}

export function resolveWorkflowTaskSourceEntryPath(task = {}) {
  const sourceTaskContract = standaloneSourceTaskContract(task)
  const standaloneSourceTrusted = isTrustedStandaloneSourceTask(task)
  if (sourceTaskContract && !standaloneSourceTrusted) {
    return ''
  }
  const processInstanceID = Number(task.process_instance_id || 0)
  const processSourceTrusted =
    Number.isSafeInteger(processInstanceID) && processInstanceID > 0
  if (!processSourceTrusted && !standaloneSourceTrusted) {
    return ''
  }
  const sourceType = String(task.source_type || '')
    .trim()
    .toLowerCase()
  const sourceID = Number(task.source_id || 0)
  const target = DIRECT_TASK_SOURCE_TARGETS.get(sourceType)
  if (!target || !Number.isSafeInteger(sourceID) || sourceID <= 0) {
    return ''
  }
  const [path, queryKey] = target
  return routeWithQuery(path, {
    [queryKey]: sourceID,
    link_source: 'task-dashboard',
  })
}

export function resolveWorkflowTaskEntryPath(task = {}) {
  const sourceTaskContract = standaloneSourceTaskContract(task)
  if (sourceTaskContract && !isTrustedStandaloneSourceTask(task)) {
    return ''
  }
  const sourceEntryPath = resolveWorkflowTaskSourceEntryPath(task)
  if (sourceEntryPath) {
    return sourceEntryPath
  }
  const payload = payloadOf(task)
  const entryPath = String(payload.entry_path || '').trim()
  const sourceType = String(task.source_type || '')
    .trim()
    .toLowerCase()
  if (WORKFLOW_INBOX_SOURCE_TYPES.has(sourceType)) {
    return ''
  }
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
