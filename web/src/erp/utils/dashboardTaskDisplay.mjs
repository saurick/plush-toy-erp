import { workflowTaskPayload } from './workflowTaskPayload.mjs'
import { fulfillmentTaskEntryPath, isFulfillmentTask } from './fulfillmentTask.mjs'
import { businessModuleDefinitions, getBusinessDocumentTitle } from '../config/businessModules.mjs'
import { dashboardModules } from '../config/dashboardModules.mjs'
import { BUSINESS_ROUTE_PATHS } from './masterDataOrderView.mjs'
import { routeWithQuery } from './routeQuery.mjs'
import { engineeringMaterialTaskEntryPath } from './engineeringMaterialTask.mjs'
import {
  isInternalWorkflowDocumentRef,
  resolveReadableWorkflowSourceNo,
} from './workflowDocumentRefs.mjs'

const FORMAL_TASK_ENTRY_MODULES = businessModuleDefinitions.filter(
  (moduleItem) => moduleItem.pageKind === 'formal'
)
const TASK_SOURCE_PATH_MAP = new Map([
  ...FORMAL_TASK_ENTRY_MODULES.map((moduleItem) => [
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
  ...FORMAL_TASK_ENTRY_MODULES.map((moduleItem) => moduleItem.path),
  ...dashboardModules.map((moduleItem) => moduleItem.path),
])
const DIRECT_TASK_SOURCE_TARGETS = new Map([
  ['project-orders', [BUSINESS_ROUTE_PATHS.salesOrders, 'sales_order_id']],
  ['sales-orders', [BUSINESS_ROUTE_PATHS.salesOrders, 'sales_order_id']],
  ['sales_order', [BUSINESS_ROUTE_PATHS.salesOrders, 'sales_order_id']],
  [
    'accessories-purchase',
    [BUSINESS_ROUTE_PATHS.purchaseOrders, 'purchase_order_id'],
  ],
  ['purchase-order', [BUSINESS_ROUTE_PATHS.purchaseOrders, 'purchase_order_id']],
  ['purchase_order', [BUSINESS_ROUTE_PATHS.purchaseOrders, 'purchase_order_id']],
  ['inbound', [BUSINESS_ROUTE_PATHS.purchaseReceipts, 'receipt_id']],
  ['purchase-receipt', [BUSINESS_ROUTE_PATHS.purchaseReceipts, 'receipt_id']],
  ['purchase_receipt', [BUSINESS_ROUTE_PATHS.purchaseReceipts, 'receipt_id']],
  ['inventory_operation', [BUSINESS_ROUTE_PATHS.inventory, 'inventory_operation_id']],
  [
    'processing-contracts',
    [BUSINESS_ROUTE_PATHS.processingContracts, 'outsourcing_order_id'],
  ],
  [
    'outsourcing-order',
    [BUSINESS_ROUTE_PATHS.processingContracts, 'outsourcing_order_id'],
  ],
  [
    'outsourcing_order',
    [BUSINESS_ROUTE_PATHS.processingContracts, 'outsourcing_order_id'],
  ],
  [
    'production-orders',
    [BUSINESS_ROUTE_PATHS.productionOrders, 'production_order_id'],
  ],
  [
    'production-order',
    [BUSINESS_ROUTE_PATHS.productionOrders, 'production_order_id'],
  ],
  [
    'production_order',
    [BUSINESS_ROUTE_PATHS.productionOrders, 'production_order_id'],
  ],
  ['production-progress', [BUSINESS_ROUTE_PATHS.productionProgress, 'fact_id']],
  ['production-fact', [BUSINESS_ROUTE_PATHS.productionProgress, 'fact_id']],
  ['production_fact', [BUSINESS_ROUTE_PATHS.productionProgress, 'fact_id']],
  [
    'production_exception_decision',
    [
      TASK_SOURCE_PATH_MAP.get('production-exceptions'),
      'production_exception_id',
    ],
  ],
  [
    'quality-inspections',
    [BUSINESS_ROUTE_PATHS.qualityInspections, 'quality_inspection_id'],
  ],
  [
    'quality-inspection',
    [BUSINESS_ROUTE_PATHS.qualityInspections, 'quality_inspection_id'],
  ],
  [
    'quality_inspection',
    [BUSINESS_ROUTE_PATHS.qualityInspections, 'quality_inspection_id'],
  ],
  ['shipments', [BUSINESS_ROUTE_PATHS.shipments, 'shipment_id']],
  ['shipment', [BUSINESS_ROUTE_PATHS.shipments, 'shipment_id']],
  ['finance_payment', [BUSINESS_ROUTE_PATHS.financePayments, 'finance_payment_id']],
])
const SOURCE_TASK_CONTRACT = 'workflow.source-task/v1'

export function workflowTaskSourceForEntryPath(entryPath) {
  if (typeof entryPath !== 'string' || !entryPath.startsWith('/erp/')) return null
  const url = new URL(entryPath, 'https://erp.invalid')
  const positiveID = (key) => {
    const value = url.searchParams.get(key)
    const id = /^[1-9][0-9]*$/u.test(value || '') ? Number(value) : 0
    return Number.isSafeInteger(id) && id > 0 ? id : null
  }
  for (const [path, key, type] of [
    [BUSINESS_ROUTE_PATHS.processingContracts, 'outsourcing_fact_id', 'outsourcing_fact'],
    [BUSINESS_ROUTE_PATHS.productionOrders, 'wip_batch_id', 'production_wip_batch'],
  ]) {
    const id = url.pathname === path ? positiveID(key) : null
    if (id) return { source_type: type, source_id: id }
  }
  const sourceTypes = { receipt_id: 'purchase_receipt', fact_id: 'production_fact', production_exception_id: 'production_exception_decision' }
  for (const [path, key] of DIRECT_TASK_SOURCE_TARGETS.values()) {
    const id = url.pathname === path ? positiveID(key) : null
    if (id) return { source_type: sourceTypes[key] || key.slice(0, -3), source_id: id }
  }
  return null
}
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
])

export function getWorkflowTaskSourceTypeLabel(
  sourceType,
  fallback = '来源待核对'
) {
  return getBusinessDocumentTitle(sourceType, fallback)
}

export function getWorkflowTaskSourceNo(task = {}) {
  if (
    (task.display_context && task.display_context.available !== true)
  ) {
    return ''
  }
  return resolveReadableWorkflowSourceNo(
    {
      ...task,
      source_no: task.display_context
        ? task.display_context.source_no
        : task.source_no,
    },
    ['source_no']
  )
}

export function formatWorkflowTaskSource(task = {}) {
  if (task.display_context && task.display_context.available !== true) {
    return '关联单据已不可用'
  }
  const sourceType = String(task.source_type || '').trim()
  const sourceTitle = getWorkflowTaskSourceTypeLabel(sourceType, '')
  const sourceNo = getWorkflowTaskSourceNo(task)
  if (sourceNo) {
    return `${sourceTitle || '业务单据'} · ${sourceNo}`
  }

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

function standaloneSourceTaskContract(task = {}) {
  const taskGroup = String(task.task_group || '')
    .trim()
    .toLowerCase()
  return STANDALONE_SOURCE_TASK_CONTRACTS.get(taskGroup) || null
}

function isTrustedStandaloneSourceTask(task = {}) {
  const contract = standaloneSourceTaskContract(task)
  if (!contract) return false
  const payload = workflowTaskPayload(task)
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
  if (!task) return ''
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
  const [path, queryKey] = target || []
  if (
    !ACTIVE_TASK_ENTRY_PATHS.has(path) ||
    !queryKey ||
    !Number.isSafeInteger(sourceID) ||
    sourceID <= 0
  ) {
    return ''
  }
  return routeWithQuery(path, {
    [queryKey]: sourceID,
    link_source: 'task-dashboard',
  })
}

export function resolveWorkflowTaskEntryPath(task = {}) {
  if (!task) return ''
  if (isFulfillmentTask(task)) return fulfillmentTaskEntryPath(task)
  const materialEntry = engineeringMaterialTaskEntryPath(task)
  if (materialEntry) return materialEntry
  const sourceTaskContract = standaloneSourceTaskContract(task)
  if (sourceTaskContract && !isTrustedStandaloneSourceTask(task)) {
    return ''
  }
  const sourceEntryPath = resolveWorkflowTaskSourceEntryPath(task)
  if (sourceEntryPath) {
    return sourceEntryPath
  }
  const payload = workflowTaskPayload(task)
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
