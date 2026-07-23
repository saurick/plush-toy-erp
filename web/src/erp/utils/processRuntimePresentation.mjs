const PROCESS_STATUS_LABELS = Object.freeze({
  active: '办理中',
  blocked: '流程受阻',
  completed: '已结束',
})

const PROCESS_LABELS = Object.freeze({
  sales_order_acceptance: '销售订单受理',
  material_supply: '采购供料',
  finished_goods_delivery: '成品交付',
})

const NODE_STATUS_LABELS = Object.freeze({
  waiting: '等待中',
  active: '办理中',
  blocked: '受阻',
  completed: '已完成',
})

const NODE_LABELS = Object.freeze({
  submit_sales_order: '提交销售订单',
  order_approval: '订单审批',
  activate_sales_order: '销售订单生效',
  engineering_data: '工程资料',
  order_review: '订单复核',
  purchase_order_approval: '采购订单审批',
  approve_purchase_order: '采购订单审批',
  purchase_receipt_source: '采购收货来源',
  incoming_qc: '来料质检',
  warehouse_inbound: '仓库入库',
  finished_goods_quality: '成品质检',
  shipment_finance_approval: '出货财务审批',
  shipment_finance_release: '财务放行',
  shipment_execution: '执行出货',
  receivable_lead: '应收跟进',
  end: '流程结束',
})

const PROCESS_STATUS_KEYS = new Set(Object.keys(PROCESS_STATUS_LABELS))
const PROCESS_KEYS = new Set(Object.keys(PROCESS_LABELS))
const NODE_STATUS_KEYS = new Set(Object.keys(NODE_STATUS_LABELS))
const NODE_TYPE_KEYS = new Set([
  'human_task',
  'approval',
  'domain_command',
  'wait_event',
  'end',
])

function invalidProcessContext() {
  throw new Error('流程位置暂时无法确认，请刷新后重试')
}

export function isDisplayOnlyWorkflowTask(task = {}) {
  return Boolean(
    task?.payload?.simulated_only === true ||
      String(task?.source_type || '') ===
        'simulated-manual-acceptance-task-batch'
  )
}

export function requireWorkflowProcessContext(value) {
  const instance = value?.process_instance
  const source = value?.source
  const nodes = value?.nodes
  const currentNodes = value?.current_nodes
  const completedNodes = value?.completed_nodes
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !source ||
    typeof source.type !== 'string' ||
    !source.type.trim() ||
    !Number.isSafeInteger(source.id) ||
    source.id <= 0 ||
    (source.no != null && typeof source.no !== 'string') ||
    !instance ||
    !Number.isSafeInteger(instance.id) ||
    instance.id <= 0 ||
    !PROCESS_KEYS.has(instance.process_key) ||
    typeof instance.process_version !== 'string' ||
    !instance.process_version.trim() ||
    !PROCESS_STATUS_KEYS.has(instance.status) ||
    !Number.isSafeInteger(instance.started_at) ||
    instance.started_at <= 0 ||
    !Array.isArray(nodes) ||
    !Array.isArray(currentNodes) ||
    !Array.isArray(completedNodes)
  ) {
    invalidProcessContext()
  }
  const validateNode = (node) =>
    node &&
    typeof node === 'object' &&
    !Array.isArray(node) &&
    Number.isSafeInteger(node.id) &&
    node.id > 0 &&
    node.process_instance_id === instance.id &&
    typeof node.node_key === 'string' &&
    node.node_key.trim() &&
    NODE_TYPE_KEYS.has(node.node_type) &&
    Number.isSafeInteger(node.attempt) &&
    node.attempt > 0 &&
    NODE_STATUS_KEYS.has(node.status)
  if (!nodes.every(validateNode)) {
    invalidProcessContext()
  }
  const nodeIDs = new Set(nodes.map((node) => node.id))
  if (
    nodeIDs.size !== nodes.length ||
    !currentNodes.every(
      (node) =>
        validateNode(node) &&
        nodeIDs.has(node.id) &&
        ['active', 'blocked'].includes(node.status)
    ) ||
    !completedNodes.every(
      (node) =>
        validateNode(node) &&
        nodeIDs.has(node.id) &&
        node.status === 'completed'
    )
  ) {
    invalidProcessContext()
  }
  return value
}

export function getProcessLabel(instance = {}) {
  return PROCESS_LABELS[instance.process_key] || '业务流程'
}

export function getProcessNodeLabel(node = {}) {
  return NODE_LABELS[node.node_key] || '流程步骤'
}

export function getProcessNodeStatusLabel(node = {}) {
  if (node.outcome === 'rejected') return '已退回'
  return NODE_STATUS_LABELS[node.status] || '状态待确认'
}

export function getProcessStatusLabel(instance = {}) {
  return PROCESS_STATUS_LABELS[instance.status] || '状态待确认'
}

export function formatProcessStartedAt(value) {
  if (!Number.isSafeInteger(value) || value <= 0) return '-'
  return new Date(value * 1000).toLocaleString('zh-CN', { hour12: false })
}
