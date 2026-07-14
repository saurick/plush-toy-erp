// src/mocks/jsonRpcMockServer.js

import {
  requireWorkflowTaskMutationParams,
  workflowTaskMutationSignature,
} from '../erp/utils/workflowTaskMutation.mjs'
import { requireWorkflowTaskExplainParams } from '../erp/utils/workflowTaskActionAccess.mjs'
import { requireWorkflowTaskCreateParams } from '../erp/utils/workflowTaskCreateContract.mjs'
import {
  workflowMockActionDecision,
  workflowMockCanAccessTaskForCapability,
  workflowMockCanCreateTask,
  workflowMockCanViewTask,
  workflowMockPermissionAllowed,
} from './workflowTaskMockAuthorization.mjs'
import { buildWorkflowTaskBoardMock } from './workflowTaskBoardMock.mjs'
import { buildWorkflowRoleTaskPageMock } from './workflowRoleTaskMock.mjs'

let originalFetch = null
let mockWorkflowTaskID = 1
const mockWorkflowTasks = []
const mockWorkflowBusinessStates = []
const mockWorkflowMutationReceipts = new Map()

function emptyWorkflowTaskUrgeFields() {
  return {
    urge_count: 0,
    last_urged_at: null,
    last_urged_by: null,
    last_urged_by_role_key: null,
    escalated_at: null,
    escalate_target_role_key: null,
  }
}
const mockProductionOrder = {
  id: 71,
  order_no: 'MO-MOCK-20260713',
  status: 'DRAFT',
  version: 1,
  planned_start_at: nowUnix() + 86_400,
  planned_end_at: nowUnix() + 604_800,
  note: '生产计划演示草稿',
  close_reason: null,
  cancel_reason: null,
  created_by: 1,
  released_by: null,
  closed_by: null,
  cancelled_by: null,
  released_at: null,
  closed_at: null,
  cancelled_at: null,
  created_at: nowUnix(),
  updated_at: nowUnix(),
}
const mockProductionOrderItems = [
  {
    id: 7101,
    production_order_id: 71,
    line_no: 1,
    product_id: 301,
    product_sku_id: 401,
    unit_id: 501,
    planned_quantity: '20.0000',
    sales_order_item_id: 601,
    bom_header_id: 701,
    product_code_snapshot: 'PROD-MOCK',
    product_name_snapshot: '演示产品',
    sku_code_snapshot: 'SKU-MOCK',
    unit_name_snapshot: '只',
    bom_version_snapshot: 'BOM-MOCK-V1',
    note: null,
    created_at: nowUnix(),
    updated_at: nowUnix(),
  },
]
const mockBusinessDashboardProjectionModuleKeys = [
  'customers',
  'suppliers',
  'products',
  'sales-orders',
  'material-bom',
  'accessories-purchase',
  'processing-contracts',
  'inbound',
  'inventory',
  'shipping-release',
  'outbound',
  'production-scheduling',
  'production-progress',
  'production-exceptions',
  'quality-inspections',
  'reconciliation',
  'payables',
  'receivables',
  'invoices',
]

const mockPermissions = [
  { permission_key: 'system.user.read', name: '查看管理员', module: 'system' },
  {
    permission_key: 'system.user.create',
    name: '创建管理员',
    module: 'system',
  },
  {
    permission_key: 'system.user.update',
    name: '更新管理员',
    module: 'system',
  },
  {
    permission_key: 'system.user.disable',
    name: '启停管理员',
    module: 'system',
  },
  { permission_key: 'system.role.read', name: '查看角色', module: 'system' },
  {
    permission_key: 'system.role.permission.manage',
    name: '管理角色权限',
    module: 'system',
  },
  { permission_key: 'erp.dashboard.read', name: '查看任务看板', module: 'erp' },
  {
    permission_key: 'workflow.task.read',
    name: '查看协同任务',
    module: 'workflow',
  },
  {
    permission_key: 'workflow.task.create',
    name: '创建协同任务',
    module: 'workflow',
  },
  {
    permission_key: 'workflow.task.update',
    name: '更新协同任务',
    module: 'workflow',
  },
  {
    permission_key: 'workflow.task.complete',
    name: '完成协同任务',
    module: 'workflow',
  },
  {
    permission_key: 'workflow.task.reject',
    name: '退回协同任务',
    module: 'workflow',
  },
  {
    permission_key: 'workflow.task.approve',
    name: '审批协同任务',
    module: 'workflow',
  },
  {
    permission_key: 'mobile.sales.access',
    name: '进入业务岗位任务端',
    module: 'mobile',
  },
  { permission_key: 'pmc.plan.read', name: '查看生产计划', module: 'pmc' },
  { permission_key: 'pmc.plan.create', name: '新建生产计划', module: 'pmc' },
  { permission_key: 'pmc.plan.update', name: '更新生产计划', module: 'pmc' },
  {
    permission_key: 'mobile.purchase.access',
    name: '进入采购岗位任务端',
    module: 'mobile',
  },
  {
    permission_key: 'debug.business_chain.run',
    name: '执行业务链路调试',
    module: 'debug',
  },
  {
    permission_key: 'debug.business.clear',
    name: '清空业务数据',
    module: 'debug',
  },
]

const mockRoles = [
  {
    role_key: 'admin',
    name: '系统管理员',
    permissions: mockPermissions
      .map((item) => item.permission_key)
      .filter((key) => key.startsWith('system.')),
  },
  {
    role_key: 'sales',
    name: '业务',
    permissions: [
      'erp.dashboard.read',
      'workflow.task.read',
      'mobile.sales.access',
    ],
  },
  {
    role_key: 'purchase',
    name: '采购',
    permissions: [
      'erp.dashboard.read',
      'workflow.task.read',
      'mobile.purchase.access',
    ],
  },
  {
    role_key: 'engineering',
    name: '工程',
    permissions: [
      'erp.dashboard.read',
      'workflow.task.read',
      'workflow.task.complete',
      'mobile.engineering.access',
    ],
  },
]

const mockMenus = [
  {
    key: 'global-dashboard',
    label: '任务看板',
    path: '/erp/dashboard',
    required_any: ['erp.dashboard.read'],
    required_all: [],
  },
  {
    key: 'production-orders',
    label: '生产订单',
    path: '/erp/production/orders',
    required_any: ['pmc.plan.read'],
    required_all: [],
  },
  {
    key: 'permission-center',
    label: '权限管理',
    path: '/erp/system/permissions',
    required_any: ['system.user.read', 'system.role.read'],
    required_all: [],
  },
]

const mockSuperAdminProfile = {
  id: 1,
  user_id: 1,
  username: 'mock-admin',
  phone: '13800138000',
  is_super_admin: true,
  disabled: false,
  roles: [{ role_key: 'sales', name: '业务' }],
  permissions: mockPermissions.map((item) => item.permission_key),
  effective_session: {
    customer: { key: 'mock-customer' },
    config_revision: 'mock-workflow-revision',
    config_hash: 'mock-workflow-hash',
    roles: ['sales'],
    actions: [
      'workflow.task.read',
      'workflow.task.create',
      'workflow.task.update',
      'workflow.task.complete',
      'workflow.task.reject',
      'workflow.task.approve',
      'pmc.plan.read',
      'pmc.plan.create',
      'pmc.plan.update',
    ],
    workflow_visible_owner_role_keys_by_capability: {
      'workflow.task.read': ['sales'],
      'workflow.task.create': ['sales'],
      'workflow.task.update': ['sales'],
      'workflow.task.complete': ['sales'],
      'workflow.task.reject': ['sales'],
      'workflow.task.approve': ['sales'],
    },
  },
  menus: mockMenus,
  erp_preferences: { column_orders: {} },
}

const mockTaskStates = [
  { key: 'ready', label: '可执行', summary: '前置条件已满足。' },
  { key: 'blocked', label: '阻塞', summary: '被缺料、缺资料或异常卡住。' },
  { key: 'done', label: '已完成', summary: '完成条件已达到。' },
  { key: 'rejected', label: '已退回', summary: '需要回退处理。' },
]

const mockBusinessStates = [
  {
    key: 'project_pending',
    label: '立项待确认',
    summary: '客户、编号、交期正在收口。',
  },
  {
    key: 'project_approved',
    label: '立项已放行',
    summary: '允许进入采购和生产准备。',
  },
  {
    key: 'engineering_preparing',
    label: '资料准备中',
    summary: 'BOM 和资料正在补齐。',
  },
  {
    key: 'material_preparing',
    label: '齐套准备中',
    summary: '主料、辅包材或委外仍在确认。',
  },
  { key: 'production_ready', label: '待排产', summary: '等待 PMC 排单。' },
  {
    key: 'production_processing',
    label: '生产中',
    summary: '已进入生产执行。',
  },
  { key: 'qc_pending', label: '待检验', summary: '等待检验确认。' },
  { key: 'iqc_pending', label: 'IQC 待检', summary: '等待品质做来料检验。' },
  {
    key: 'qc_failed',
    label: '质检不合格',
    summary: '等待责任角色处理退货、返工、补做或让步接收。',
  },
  {
    key: 'warehouse_processing',
    label: '待入库 / 待出货',
    summary: '仓库正在处理。',
  },
  {
    key: 'shipping_released',
    label: '已放行待出库',
    summary: '等待仓库出库。',
  },
  {
    key: 'warehouse_inbound_pending',
    label: '待确认入库',
    summary: '等待仓库确认入库数量、库位和经手人。',
  },
  {
    key: 'inbound_done',
    label: '入库协同已完成',
    summary: '实际库存以入库单过账结果为准。',
  },
  {
    key: 'shipment_pending',
    label: '待出货',
    summary: '等待出货准备、装箱、唛头和出库确认。',
  },
  {
    key: 'shipped',
    label: '出货协同已完成',
    summary: '实际出货数量和库存扣减以出货单为准。',
  },
  { key: 'reconciling', label: '对账中', summary: '费用正在核对。' },
  {
    key: 'settled',
    label: '结算协同已完成',
    summary: '实际应收应付和收付款以业务财务记录为准。',
  },
  { key: 'blocked', label: '业务阻塞', summary: '主链被异常卡住。' },
  { key: 'cancelled', label: '业务取消', summary: '业务已取消。' },
  { key: 'closed', label: '业务归档', summary: '业务已归档。' },
]

// 构造一个 JSON-RPC 成功响应
function makeJsonRpcSuccess(id, payload = {}) {
  return {
    jsonrpc: '2.0',
    id,
    result: {
      code: 0,
      message: 'OK',
      ...payload, // 比如 { ping: {...} } / { login: {...} }
    },
    error: '',
  }
}

function makeBizResult(payload = {}) {
  return {
    code: 0,
    message: 'OK',
    data: payload,
  }
}

function nowUnix() {
  return Math.floor(Date.now() / 1000)
}

function seedMockMobileWorkflowTasks() {
  if (mockWorkflowTasks.length > 0) return

  const now = nowUnix()
  const roles = [
    'boss',
    'sales',
    'purchase',
    'warehouse',
    'quality',
    'finance',
    'pmc',
    'production',
    'engineering',
  ]
  const roleLabels = {
    boss: '老板',
    sales: '业务',
    purchase: '采购',
    warehouse: '仓库',
    quality: '品质',
    finance: '财务',
    pmc: 'PMC',
    production: '生产',
    engineering: '工程',
  }
  const sourceTypes = {
    boss: 'project-orders',
    sales: 'project-orders',
    purchase: 'accessories-purchase',
    warehouse: 'inbound',
    quality: 'quality-inspections',
    finance: 'payables',
    pmc: 'production-progress',
    production: 'production-progress',
    engineering: 'material-bom',
  }
  const taskCount = 24

  roles.forEach((roleKey) => {
    const roleLabel = roleLabels[roleKey] || roleKey
    const sourceType = sourceTypes[roleKey] || 'project-orders'
    for (let index = 0; index < taskCount; index += 1) {
      const number = String(index + 1).padStart(2, '0')
      const sourceIDBase = roles.indexOf(roleKey) * 1000 + index
      mockWorkflowTasks.push(
        {
          id: mockWorkflowTaskID++,
          task_code: `MOCK-MOBILE-${roleKey.toUpperCase()}-TODO-${number}`,
          task_group: 'mock_mobile_list',
          task_name: `${roleLabel}待办长列表样本 ${number}`,
          source_type: sourceType,
          source_id: 10_000 + sourceIDBase,
          source_no: `MOCK-${roleKey.toUpperCase()}-TODO-${number}`,
          business_status_key: 'project_pending',
          task_status_key: 'ready',
          owner_role_key: roleKey,
          assignee_id: null,
          priority: 1,
          blocked_reason: '',
          due_at: now + (index + 2) * 86_400,
          completed_at: null,
          version: 1,
          payload: {
            customer_name: `${roleLabel}长列表客户 ${number}`,
            debug_mobile_list: true,
            notification_type: 'debug_notice',
          },
          created_by: 1,
          updated_by: 1,
          created_at: now - index * 60,
          updated_at: now - index * 60,
        },
        {
          id: mockWorkflowTaskID++,
          task_code: `MOCK-MOBILE-${roleKey.toUpperCase()}-WARN-${number}`,
          task_group: 'mock_mobile_warning',
          task_name: `${roleLabel}预警长列表样本 ${number}`,
          source_type: sourceType,
          source_id: 20_000 + sourceIDBase,
          source_no: `MOCK-${roleKey.toUpperCase()}-WARN-${number}`,
          business_status_key: 'blocked',
          task_status_key: 'blocked',
          owner_role_key: roleKey,
          assignee_id: null,
          priority: 3,
          blocked_reason: `${roleLabel}预警样本阻塞原因 ${number}`,
          due_at: now - (index + 1) * 86_400,
          completed_at: null,
          version: 1,
          payload: {
            alert_type: 'debug_warning',
            critical_path: true,
            customer_name: `${roleLabel}预警客户 ${number}`,
            debug_mobile_list: true,
            notification_type: 'debug_notice',
          },
          created_by: 1,
          updated_by: 1,
          created_at: now - (index + 100) * 60,
          updated_at: now - (index + 100) * 60,
        },
        {
          id: mockWorkflowTaskID++,
          task_code: `MOCK-MOBILE-${roleKey.toUpperCase()}-DONE-${number}`,
          task_group: 'mock_mobile_done',
          task_name: `${roleLabel}已办长列表样本 ${number}`,
          source_type: sourceType,
          source_id: 30_000 + sourceIDBase,
          source_no: `MOCK-${roleKey.toUpperCase()}-DONE-${number}`,
          business_status_key: 'project_approved',
          task_status_key: 'done',
          owner_role_key: roleKey,
          assignee_id: null,
          priority: 1,
          blocked_reason: '',
          due_at: now - (index + 2) * 86_400,
          completed_at: now - (index + 1) * 86_400,
          version: 1,
          payload: {
            customer_name: `${roleLabel}已办客户 ${number}`,
            debug_mobile_list: true,
          },
          created_by: 1,
          updated_by: 1,
          created_at: now - (index + 200) * 60,
          updated_at: now - (index + 200) * 60,
        }
      )
    }
  })
}

seedMockMobileWorkflowTasks()

function matchWorkflowFilter(item, params) {
  return (
    (!params.source_type || item.source_type === params.source_type) &&
    (!params.source_id ||
      Number(item.source_id) === Number(params.source_id)) &&
    (!params.owner_role_key || item.owner_role_key === params.owner_role_key) &&
    (!params.task_status_key ||
      item.task_status_key === params.task_status_key) &&
    (!params.business_status_key ||
      item.business_status_key === params.business_status_key)
  )
}

function upsertMockWorkflowBusinessProjection(
  task,
  businessStatusKey,
  blockedReason = ''
) {
  const existingIndex = mockWorkflowBusinessStates.findIndex(
    (item) =>
      item.source_type === task.source_type &&
      Number(item.source_id) === Number(task.source_id)
  )
  const existing =
    existingIndex >= 0 ? mockWorkflowBusinessStates[existingIndex] : null
  const changedAt = nowUnix()
  const projection = {
    id: existing?.id || task.id,
    source_type: task.source_type,
    source_id: task.source_id,
    source_no: task.source_no || null,
    order_id: existing?.order_id || null,
    batch_id: existing?.batch_id || null,
    business_status_key: businessStatusKey,
    owner_role_key: task.owner_role_key || null,
    blocked_reason: blockedReason || null,
    status_changed_at: changedAt,
    payload: existing?.payload || {},
    created_at: existing?.created_at || changedAt,
    updated_at: changedAt,
  }
  task.business_status_key = businessStatusKey
  if (existingIndex >= 0) {
    mockWorkflowBusinessStates[existingIndex] = projection
  } else {
    mockWorkflowBusinessStates.push(projection)
  }
  return projection
}

function buildBusinessDashboardProjectionStats() {
  return mockBusinessDashboardProjectionModuleKeys.map((moduleKey) => ({
    module_key: moduleKey,
    total: 0,
    status_counts: {},
  }))
}

function isMockTerminalWorkflowTask(task = {}) {
  return ['done', 'rejected'].includes(String(task.task_status_key || '').trim())
}

const mockProductionOrderParamKeys = {
  list_production_orders: new Set([
    'keyword',
    'status',
    'date_field',
    'date_from',
    'date_to',
    'sort_by',
    'sort_direction',
    'limit',
    'offset',
  ]),
  get_production_order: new Set(['production_order_id']),
  create_production_order: new Set([
    'order_no',
    'planned_start_at',
    'planned_end_at',
    'note',
    'items',
    'idempotency_key',
  ]),
  save_production_order: new Set([
    'production_order_id',
    'expected_version',
    'order_no',
    'planned_start_at',
    'planned_end_at',
    'note',
    'items',
    'idempotency_key',
  ]),
  release_production_order: new Set([
    'production_order_id',
    'expected_version',
    'idempotency_key',
  ]),
  close_production_order: new Set([
    'production_order_id',
    'expected_version',
    'reason',
    'idempotency_key',
  ]),
  cancel_production_order: new Set([
    'production_order_id',
    'expected_version',
    'reason',
    'idempotency_key',
  ]),
  list_production_order_reference_options: new Set([
    'reference_type',
    'keyword',
    'product_id',
    'product_sku_id',
    'unit_id',
    'selected_ids',
    'limit',
    'offset',
  ]),
}

function mockProductionOrderParamsValid(method, params) {
  const allowed = mockProductionOrderParamKeys[method]
  const allowedKeys = Boolean(
    allowed &&
      params &&
      typeof params === 'object' &&
      !Array.isArray(params) &&
      Object.keys(params).every((key) => allowed.has(key))
  )
  if (!allowedKeys) return false
  const positive = (value) => Number.isSafeInteger(value) && value > 0
  const keyValid =
    typeof params.idempotency_key === 'string' &&
    params.idempotency_key === params.idempotency_key.trim() &&
    params.idempotency_key.length > 0 &&
    params.idempotency_key.length <= 128
  if (method === 'get_production_order') {
    return positive(params.production_order_id)
  }
  if (method === 'create_production_order') {
    return (
      keyValid &&
      typeof params.order_no === 'string' &&
      params.order_no.trim() === params.order_no &&
      params.order_no.length > 0 &&
      Array.isArray(params.items) &&
      params.items.length > 0
    )
  }
  if (method === 'save_production_order') {
    return (
      keyValid &&
      positive(params.production_order_id) &&
      positive(params.expected_version) &&
      typeof params.order_no === 'string' &&
      params.order_no.trim() === params.order_no &&
      params.order_no.length > 0 &&
      Array.isArray(params.items) &&
      params.items.length > 0
    )
  }
  if (
    [
      'release_production_order',
      'close_production_order',
      'cancel_production_order',
    ].includes(method)
  ) {
    if (
      !keyValid ||
      !positive(params.production_order_id) ||
      !positive(params.expected_version)
    ) {
      return false
    }
    return (
      method !== 'cancel_production_order' ||
      (typeof params.reason === 'string' && params.reason.trim().length > 0)
    )
  }
  if (method === 'list_production_order_reference_options') {
    return [
      'product',
      'product_sku',
      'unit',
      'sales_order_item',
      'active_bom',
    ].includes(params.reference_type)
  }
  return method === 'list_production_orders'
}

function mockProductionReferenceOption(referenceType) {
  const values = {
    product: [301, 'PROD-MOCK · 演示产品'],
    product_sku: [401, 'SKU-MOCK · 深棕 / 35cm'],
    unit: [501, 'PCS · 只'],
    sales_order_item: [601, 'SO-MOCK / 第 1 行 · PROD-MOCK'],
    active_bom: [701, 'BOM-MOCK-V1 · 当前生效'],
  }
  const value = values[referenceType]
  if (!value) return null
  return {
    value: value[0],
    label: value[1],
    selectable: true,
    product_value: referenceType === 'unit' ? null : 301,
    sku_value: ['product_sku', 'sales_order_item'].includes(referenceType)
      ? 401
      : null,
    unit_value: referenceType === 'active_bom' ? null : 501,
  }
}

function mockWorkflowMutationOperation(method = '') {
  if (method === 'complete_task_action') return 'complete'
  if (method === 'block_task_action') return 'block'
  if (method === 'reject_task_action') return 'reject'
  if (method === 'resume_task_action') return 'resume'
  if (method === 'urge_task') return 'urge'
  return ''
}

function cloneMockWorkflowMutationResult(task) {
  return JSON.parse(JSON.stringify(task))
}

function resolveMockWorkflowMutationReceipt(task, operation, params) {
  const receiptKey = `${task.id}:${params.idempotency_key}`
  const intent = workflowTaskMutationSignature(operation, params)
  const receipt = mockWorkflowMutationReceipts.get(receiptKey)
  if (!receipt) return { intent, receiptKey }
  if (receipt.intent !== intent) {
    return {
      error: {
        code: 40920,
        message: '重复请求内容与首次提交不一致，请刷新后重试',
      },
    }
  }
  return { task: cloneMockWorkflowMutationResult(receipt.task) }
}

function resolveMockWorkflowMutationRequest(method, params = {}) {
  const operation = mockWorkflowMutationOperation(method)
  let mutationParams
  try {
    mutationParams = requireWorkflowTaskMutationParams(operation, params, {
      requireIdempotencyKey: true,
    })
  } catch (error) {
    return {
      error: {
        code: 40010,
        message: error?.message || '页面已更新，请刷新后重新操作',
      },
    }
  }
  const task = mockWorkflowTasks.find(
    (item) => item.id === mutationParams.task_id
  )
  if (!task) {
    return { error: { code: 40010, message: '任务不存在' } }
  }
  if (!Number.isSafeInteger(task.version) || task.version <= 0) {
    return {
      error: { code: 40010, message: '任务版本信息无效，请刷新后重试' },
    }
  }
  const receipt = resolveMockWorkflowMutationReceipt(
    task,
    operation,
    mutationParams
  )
  if (receipt.error) return { error: receipt.error }
  return { mutationParams, operation, receipt, task }
}

function resolveMockWorkflowReadRequest(
  params = {},
  { allowActionKey = false } = {}
) {
  let requestParams
  try {
    requestParams = requireWorkflowTaskExplainParams(params, {
      allowActionKey,
    })
  } catch (error) {
    return {
      error: { code: 40010, message: error?.message || '任务查询参数无效' },
    }
  }
  const task = mockWorkflowTasks.find(
    (item) => item.id === requestParams.taskID
  )
  if (!task) return { error: { code: 40010, message: '任务不存在' } }
  return { ...requestParams, task }
}

function saveMockWorkflowMutationReceipt(receipt, task) {
  mockWorkflowMutationReceipts.set(receipt.receiptKey, {
    intent: receipt.intent,
    task: cloneMockWorkflowMutationResult(task),
  })
}

function buildMockWorkflowActionExplain(task, actionKey = 'complete') {
  const decision = workflowMockActionDecision({
    actionKey,
    adminProfile: mockSuperAdminProfile,
    effectiveSession: mockSuperAdminProfile.effective_session,
    task,
  })
  return {
    task_id: task?.id || 0,
    action_key: decision.actionKey,
    status_key: decision.statusKey,
    required_permission: decision.requiredPermission,
    allowed: decision.allowed,
    owner_role_key: decision.ownerRoleKey,
    owner_role_matched: decision.ownerRoleMatched,
    assigned_to_current_admin: decision.assignedToCurrentAdmin,
    actor_role_key: decision.assignedToCurrentAdmin
      ? decision.ownerRoleKey
      : decision.ownerRoleMatched
        ? decision.ownerRoleKey
        : mockSuperAdminProfile.is_super_admin === true &&
            decision.actionKey === 'urge'
          ? 'admin'
          : '',
    reason_code: decision.reasonCode,
    reason: decision.reason,
  }
}

// 构造一个 JSON-RPC 业务错误响应（code != 0）
function makeJsonRpcBizError(id, code, message) {
  return {
    jsonrpc: '2.0',
    id,
    result: {
      code,
      message,
    },
    error: '',
  }
}

/**
 * 启用浏览器端 JSON-RPC mock server
 * 拦截 /rpc/** 的请求
 */
export function setupJsonRpcMockServer() {
  if (typeof window === 'undefined') return
  if (originalFetch) return // 已经装过了

  originalFetch = window.fetch.bind(window)

  window.fetch = async (input, init = {}) => {
    let url

    // 兼容 fetch('/rpc/...') 和 fetch(new Request(...))
    if (typeof input === 'string') {
      url = input
    } else if (input && typeof input.url === 'string') {
      url = input.url
    } else {
      return originalFetch(input, init)
    }

    const u = new URL(url, window.location.origin)

    // 只拦截 /rpc/**，其他请求照旧走原 fetch
    if (!u.pathname.startsWith('/rpc')) {
      return originalFetch(input, init)
    }

    // ---------------------------
    // 解析 JSON-RPC body
    // ---------------------------
    let bodyText = ''

    // 我们假设你前端都是用 fetch(url, { body: JSON.stringify(...) }) 调的
    if (init && typeof init.body === 'string') {
      bodyText = init.body
    } else if (input && typeof input.text === 'function') {
      // 兜底：如果用 Request 对象
      bodyText = await input.text()
    }

    let jsonBody = {}
    try {
      jsonBody = bodyText ? JSON.parse(bodyText) : {}
    } catch {
      // body 不是合法 JSON，返回 400
      return new Response(
        JSON.stringify({
          code: 400,
          message: 'Invalid JSON body in mock server',
          metadata: {},
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    const { id = 'mock-id', method, params = {} } = jsonBody
    const pathParts = u.pathname.split('/').filter(Boolean) // ["rpc","system"]
    const domain = pathParts[1] || '' // 第二段作为 url，例如 system / auth

    console.log('[MOCK RPC]', { domain, method, params })

    // ---------------------------
    // 根据 domain + method 分发
    // ---------------------------

    let responseBody

    if (domain === 'system') {
      if (method === 'ping') {
        responseBody = makeJsonRpcSuccess(id, {
          ping: { pong: 'mock-pong' },
        })
      } else if (method === 'version') {
        responseBody = makeJsonRpcSuccess(id, {
          version: { version: 'mock-1.0.0' },
        })
      } else {
        responseBody = makeJsonRpcBizError(
          id,
          400,
          `unknown system method: ${method}`
        )
      }
    } else if (domain === 'auth') {
      if (method === 'capabilities') {
        responseBody = makeJsonRpcSuccess(id, {
          sms_login: {
            enabled: true,
            mode: 'mock',
            mock_delivery: true,
            disabled_reason: '',
          },
        })
      } else if (method === 'login') {
        responseBody = makeJsonRpcBizError(id, 404, 'auth: 未知方法=login')
      } else if (method === 'admin_login') {
        responseBody = {
          jsonrpc: '2.0',
          id,
          result: makeBizResult({
            ...mockSuperAdminProfile,
            access_token: 'mock-admin-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            token_type: 'Bearer',
            username: params.username || mockSuperAdminProfile.username,
          }),
          error: '',
        }
      } else if (method === 'send_sms_code') {
        if ((params.scope || '') !== 'admin') {
          responseBody = makeJsonRpcBizError(id, 400, '普通用户短信登录已停用')
        } else {
          responseBody = {
            jsonrpc: '2.0',
            id,
            result: makeBizResult({
              phone: params.phone || '13800138000',
              expires_at: Math.floor(Date.now() / 1000) + 300,
              resend_after: Math.floor(Date.now() / 1000) + 60,
              mock_delivery: true,
              mock_code: '123456',
            }),
            error: '',
          }
        }
      } else if (method === 'sms_login') {
        if ((params.scope || '') !== 'admin') {
          responseBody = makeJsonRpcBizError(id, 400, '普通用户短信登录已停用')
        } else {
          responseBody = {
            jsonrpc: '2.0',
            id,
            result: makeBizResult({
              ...mockSuperAdminProfile,
              access_token: 'mock-admin-token',
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              token_type: 'Bearer',
              phone: params.phone || mockSuperAdminProfile.phone,
            }),
            error: '',
          }
        }
      } else if (method === 'logout') {
        responseBody = {
          jsonrpc: '2.0',
          id,
          result: makeBizResult({
            logout: {
              success: true,
            },
          }),
          error: '',
        }
      } else {
        responseBody = makeJsonRpcBizError(
          id,
          400,
          `unknown auth method: ${method}`
        )
      }
    } else if (domain === 'admin') {
      if (method === 'me') {
        responseBody = {
          jsonrpc: '2.0',
          id,
          result: makeBizResult(mockSuperAdminProfile),
          error: '',
        }
      } else if (method === 'list') {
        responseBody = {
          jsonrpc: '2.0',
          id,
          result: makeBizResult({
            admins: [
              {
                id: 1,
                username: 'mock-admin',
                phone: '13800138000',
                is_super_admin: true,
                disabled: false,
                roles: [],
                permissions: mockPermissions.map((item) => item.permission_key),
                menus: mockMenus,
              },
            ],
          }),
          error: '',
        }
      } else if (
        method === 'create' ||
        method === 'set_roles' ||
        method === 'set_role_permissions' ||
        method === 'set_phone' ||
        method === 'set_disabled' ||
        method === 'revoke' ||
        method === 'reset_password'
      ) {
        const revoked = method === 'revoke'
        responseBody = {
          jsonrpc: '2.0',
          id,
          result: makeBizResult({
            admin: {
              id: Number(params.id || 2),
              username: params.username || 'mock-created-admin',
              phone: params.phone || '',
              is_super_admin: false,
              disabled: revoked || Boolean(params.disabled),
              account_status: revoked
                ? 'revoked'
                : params.disabled
                  ? 'suspended'
                  : 'active',
              revoked_at: revoked ? Math.floor(Date.now() / 1000) : 0,
              status_reason: String(params.reason || '').trim(),
              roles: mockRoles.filter((role) =>
                (params.role_keys || []).includes(role.role_key)
              ),
              permissions: [],
              menus: [],
            },
            ...(revoked ? { released_task_count: 1 } : {}),
          }),
          error: '',
        }
      } else if (method === 'rbac_options' || method === 'menu_options') {
        responseBody = {
          jsonrpc: '2.0',
          id,
          result: makeBizResult({
            roles: mockRoles,
            permissions: mockPermissions,
            menus: mockMenus,
            role_options: mockRoles,
            permission_options: mockPermissions,
            menu_options: mockMenus,
          }),
          error: '',
        }
      } else {
        responseBody = makeJsonRpcBizError(
          id,
          400,
          `unknown admin method: ${method}`
        )
      }
    } else if (domain === 'user') {
      responseBody = makeJsonRpcBizError(
        id,
        404,
        `unknown jsonrpc url=${domain}`
      )
    } else if (domain === 'business') {
      if (method === 'dashboard_stats') {
        responseBody = {
          jsonrpc: '2.0',
          id,
          result: makeBizResult({
            modules: buildBusinessDashboardProjectionStats(),
          }),
          error: '',
        }
      } else {
        responseBody = makeJsonRpcBizError(
          id,
          400,
          `unknown business method: ${method}`
        )
      }
    } else if (domain === 'production_order') {
      if (!mockProductionOrderParamsValid(method, params)) {
        responseBody = makeJsonRpcBizError(
          id,
          40010,
          '生产订单请求参数不符合当前合同'
        )
      } else if (method === 'list_production_orders') {
        responseBody = {
          jsonrpc: '2.0',
          id,
          result: makeBizResult({
            production_orders: [mockProductionOrder],
            total: 1,
            limit: Number(params.limit || 20),
            offset: Number(params.offset || 0),
          }),
          error: '',
        }
      } else if (method === 'get_production_order') {
        responseBody = {
          jsonrpc: '2.0',
          id,
          result: makeBizResult({
            production_order: mockProductionOrder,
            production_order_items: mockProductionOrderItems,
          }),
          error: '',
        }
      } else if (method === 'list_production_order_reference_options') {
        const option = mockProductionReferenceOption(params.reference_type)
        responseBody = {
          jsonrpc: '2.0',
          id,
          result: makeBizResult({
            reference_type: params.reference_type,
            options: option ? [option] : [],
            total: option ? 1 : 0,
            limit: Number(params.limit || 20),
            offset: Number(params.offset || 0),
          }),
          error: '',
        }
      } else {
        const nextStatus = {
          release_production_order: 'RELEASED',
          close_production_order: 'CLOSED',
          cancel_production_order: 'CANCELLED',
        }[method]
        Object.assign(mockProductionOrder, {
          order_no: params.order_no || mockProductionOrder.order_no,
          planned_start_at:
            params.planned_start_at ?? mockProductionOrder.planned_start_at,
          planned_end_at:
            params.planned_end_at ?? mockProductionOrder.planned_end_at,
          note: params.note ?? mockProductionOrder.note,
          status: nextStatus || mockProductionOrder.status,
          version: mockProductionOrder.version + 1,
          close_reason:
            method === 'close_production_order'
              ? params.reason || null
              : mockProductionOrder.close_reason,
          cancel_reason:
            method === 'cancel_production_order'
              ? params.reason
              : mockProductionOrder.cancel_reason,
          updated_at: nowUnix(),
        })
        responseBody = {
          jsonrpc: '2.0',
          id,
          result: makeBizResult({
            production_order: mockProductionOrder,
            production_order_items: mockProductionOrderItems,
          }),
          error: '',
        }
      }
    } else if (domain === 'workflow') {
      if (method === 'metadata') {
        responseBody = {
          jsonrpc: '2.0',
          id,
          result: makeBizResult({
            task_states: mockTaskStates,
            business_states: mockBusinessStates,
          }),
          error: '',
        }
      } else if (method === 'list_tasks') {
        if (
          !workflowMockPermissionAllowed(
            mockSuperAdminProfile,
            mockSuperAdminProfile.effective_session,
            'workflow.task.read'
          )
        ) {
          responseBody = makeJsonRpcBizError(
            id,
            40010,
            '当前账号缺少查看协同任务权限'
          )
        } else {
          const matchingTasks = mockWorkflowTasks.filter(
            (item) =>
              matchWorkflowFilter(item, params) &&
              workflowMockCanViewTask(
                mockSuperAdminProfile,
                mockSuperAdminProfile.effective_session,
                item
              )
          )
          const limit = Math.min(Math.max(Number(params.limit || 50), 1), 200)
          const offset = Math.max(Number(params.offset || 0), 0)
          const tasks = matchingTasks.slice(offset, offset + limit)
          responseBody = {
            jsonrpc: '2.0',
            id,
            result: makeBizResult({
              tasks,
              total: matchingTasks.length,
              limit,
              offset,
            }),
            error: '',
          }
        }
      } else if (method === 'list_role_tasks') {
        if (
          !workflowMockPermissionAllowed(
            mockSuperAdminProfile,
            mockSuperAdminProfile.effective_session,
            'workflow.task.read'
          )
        ) {
          responseBody = makeJsonRpcBizError(
            id,
            40010,
            '当前账号缺少查看协同任务权限'
          )
        } else {
          try {
            const roleKeys = new Set(
              (mockSuperAdminProfile.roles || []).map((role) => role.role_key)
            )
            responseBody = {
              jsonrpc: '2.0',
              id,
              result: makeBizResult(
                buildWorkflowRoleTaskPageMock({
                  tasks: mockWorkflowTasks,
                  params,
                  snapshotAt: nowUnix(),
                  adminID:
                    mockSuperAdminProfile.is_super_admin === true
                      ? 0
                      : mockSuperAdminProfile.id,
                  crossRoleRiskAllowed:
                    params.view_key === 'risk' &&
                    (mockSuperAdminProfile.is_super_admin === true ||
                      roleKeys.has('pmc') ||
                      roleKeys.has('boss')),
                })
              ),
              error: '',
            }
          } catch (error) {
            responseBody = makeJsonRpcBizError(
              id,
              40010,
              error?.message || '岗位任务查询参数无效'
            )
          }
        }
      } else if (method === 'get_task_board') {
        if (
          !workflowMockPermissionAllowed(
            mockSuperAdminProfile,
            mockSuperAdminProfile.effective_session,
            'workflow.task.read'
          )
        ) {
          responseBody = makeJsonRpcBizError(
            id,
            40010,
            '当前账号缺少查看协同任务权限'
          )
        } else {
          const visibleTasks = mockWorkflowTasks.filter((item) =>
            workflowMockCanViewTask(
              mockSuperAdminProfile,
              mockSuperAdminProfile.effective_session,
              item
            )
          )
          responseBody = {
            jsonrpc: '2.0',
            id,
            result: makeBizResult(
              buildWorkflowTaskBoardMock({
                tasks: visibleTasks,
                params,
                snapshotAt: nowUnix(),
              })
            ),
            error: '',
          }
        }
      } else if (method === 'explain_action_access') {
        const request = resolveMockWorkflowReadRequest(params, {
          allowActionKey: true,
        })
        if (request.error) {
          responseBody = makeJsonRpcBizError(
            id,
            request.error.code,
            request.error.message
          )
        } else if (
          !workflowMockCanViewTask(
            mockSuperAdminProfile,
            mockSuperAdminProfile.effective_session,
            request.task
          )
        ) {
          responseBody = makeJsonRpcBizError(
            id,
            40010,
            '当前账号无权查看该协同任务'
          )
        } else {
          const actions = [
            'complete',
            'block',
            'reject',
            'resume',
            'urge',
          ].map((item) => buildMockWorkflowActionExplain(request.task, item))
          responseBody = {
            jsonrpc: '2.0',
            id,
            result: makeBizResult(
              request.actionKey
                ? {
                    action: buildMockWorkflowActionExplain(
                      request.task,
                      request.actionKey
                    ),
                  }
                : { task_id: request.task.id, actions }
            ),
            error: '',
          }
        }
      } else if (method === 'explain_task_assignment') {
        const request = resolveMockWorkflowReadRequest(params)
        if (request.error) {
          responseBody = makeJsonRpcBizError(
            id,
            request.error.code,
            request.error.message
          )
        } else if (
          !workflowMockCanViewTask(
            mockSuperAdminProfile,
            mockSuperAdminProfile.effective_session,
            request.task
          )
        ) {
          responseBody = makeJsonRpcBizError(
            id,
            40010,
            '当前账号无权查看该协同任务'
          )
        } else {
          const { task } = request
          const decisions = ['complete', 'block', 'reject', 'resume', 'urge'].map(
            (actionKey) =>
              workflowMockActionDecision({
                actionKey,
                adminProfile: mockSuperAdminProfile,
                effectiveSession: mockSuperAdminProfile.effective_session,
                task,
              })
          )
          const assignedToCurrentAdmin = decisions.some(
            (decision) => decision.assignedToCurrentAdmin
          )
          const ownerRoleMatched = decisions.some(
            (decision) => decision.ownerRoleMatched
          )
          const canHandle = decisions
            .filter((decision) => decision.actionKey !== 'urge')
            .some((decision) => decision.allowed)
          const canUrge = decisions.find(
            (decision) => decision.actionKey === 'urge'
          ).allowed
          const terminal = isMockTerminalWorkflowTask(task)
          const reasonCode = terminal
            ? 'terminal_task'
            : assignedToCurrentAdmin
              ? 'assigned_to_current_admin'
              : ownerRoleMatched
                ? 'owner_role_matched'
                : canUrge
                  ? 'can_urge_only'
                  : 'not_assigned_or_owner'
          responseBody = {
            jsonrpc: '2.0',
            id,
            result: makeBizResult({
              assignment: {
                task_id: task.id,
                owner_role_key: task.owner_role_key,
                admin_role_keys: mockSuperAdminProfile.roles.map(
                  (role) => role.role_key
                ),
                visible: true,
                assigned_to_current_admin: assignedToCurrentAdmin,
                owner_role_matched: ownerRoleMatched,
                can_handle: canHandle,
                can_urge: canUrge,
                actor_role_key:
                  assignedToCurrentAdmin || ownerRoleMatched
                    ? task.owner_role_key
                    : canUrge && mockSuperAdminProfile.is_super_admin === true
                      ? 'admin'
                      : '',
                reason_code: reasonCode,
                reason: terminal
                  ? '该任务已结束，只能查看上下文。'
                  : assignedToCurrentAdmin
                    ? '当前账号是该任务的指定处理人。'
                    : ownerRoleMatched
                      ? '当前账号属于该任务责任角色。'
                      : canUrge
                        ? '当前账号可催办该任务，但不能代替责任角色处理。'
                        : '当前账号不是指定处理人，也不属于任务责任角色。',
              },
            }),
            error: '',
          }
        }
      } else if (method === 'create_task') {
        let createParams = null
        try {
          createParams = requireWorkflowTaskCreateParams(params)
        } catch (error) {
          responseBody = makeJsonRpcBizError(
            id,
            40010,
            error?.message || 'create_task 参数无效'
          )
        }
        if (
          !responseBody &&
          !workflowMockCanCreateTask(
            mockSuperAdminProfile,
            mockSuperAdminProfile.effective_session
          )
        ) {
          responseBody = makeJsonRpcBizError(
            id,
            40010,
            '当前账号缺少创建协同任务权限'
          )
        }
        if (!responseBody) {
          const task = {
            id: mockWorkflowTaskID++,
            task_code: createParams.task_code,
            task_group: createParams.task_group,
            task_name: createParams.task_name,
            source_type: createParams.source_type,
            source_id: createParams.source_id,
            source_no: createParams.source_no || '',
            business_status_key: createParams.business_status_key || '',
            task_status_key: createParams.task_status_key,
            owner_role_key: createParams.owner_role_key,
            assignee_id: createParams.assignee_id || null,
            priority: createParams.priority,
            blocked_reason: '',
            ...emptyWorkflowTaskUrgeFields(),
            due_at: createParams.due_at || null,
            completed_at: null,
            version: 1,
            payload: createParams.payload,
            created_by: 1,
            updated_by: 1,
            created_at: nowUnix(),
            updated_at: nowUnix(),
          }
          mockWorkflowTasks.unshift(task)
          responseBody = {
            jsonrpc: '2.0',
            id,
            result: makeBizResult({ task }),
            error: '',
          }
        }
      } else if (method === 'complete_task_action') {
        const request = resolveMockWorkflowMutationRequest(method, params)
        const decision = request.error
          ? null
          : workflowMockActionDecision({
              actionKey: 'complete',
              adminProfile: mockSuperAdminProfile,
              effectiveSession: mockSuperAdminProfile.effective_session,
              task: request.task,
            })
        if (request.error) {
          responseBody = makeJsonRpcBizError(
            id,
            request.error.code,
            request.error.message
          )
        } else if (
          !decision.permissionAllowed ||
          !workflowMockCanAccessTaskForCapability(
            mockSuperAdminProfile,
            mockSuperAdminProfile.effective_session,
            request.task,
            decision.requiredPermission
          )
        ) {
          responseBody = makeJsonRpcBizError(
            id,
            40010,
            '当前账号无权查看或执行该任务动作'
          )
        } else if (request.receipt.task) {
          responseBody = {
            jsonrpc: '2.0',
            id,
            result: makeBizResult({ task: request.receipt.task }),
            error: '',
          }
        } else if (!decision.allowed) {
          responseBody = makeJsonRpcBizError(id, 40010, decision.reason)
        } else if (isMockTerminalWorkflowTask(request.task)) {
          responseBody = makeJsonRpcBizError(
            id,
            40010,
            '任务已结束，不能再次变更状态'
          )
        } else if (
          request.mutationParams.expected_version !== request.task.version
        ) {
          responseBody = makeJsonRpcBizError(
            id,
            40010,
            '任务已被其他人更新，请刷新后重试'
          )
        } else {
          const { mutationParams, receipt, task } = request
          task.task_status_key = 'done'
          task.updated_at = nowUnix()
          task.payload = {
            ...(task.payload || {}),
            ...mutationParams.payload,
          }
          delete task.payload.blocked_reason
          delete task.payload.rejected_reason
          task.completed_at = nowUnix()
          task.version += 1
          saveMockWorkflowMutationReceipt(receipt, task)
          responseBody = {
            jsonrpc: '2.0',
            id,
            result: makeBizResult({ task }),
            error: '',
          }
        }
      } else if (
        method === 'block_task_action' ||
        method === 'reject_task_action' ||
        method === 'resume_task_action'
      ) {
        const request = resolveMockWorkflowMutationRequest(method, params)
        const nextStatusKey =
          method === 'block_task_action'
            ? 'blocked'
            : method === 'reject_task_action'
              ? 'rejected'
              : 'ready'
        const actionKey =
          method === 'block_task_action'
            ? 'block'
            : method === 'reject_task_action'
              ? 'reject'
              : 'resume'
        const decision = request.error
          ? null
          : workflowMockActionDecision({
              actionKey,
              adminProfile: mockSuperAdminProfile,
              effectiveSession: mockSuperAdminProfile.effective_session,
              task: request.task,
            })
        if (request.error) {
          responseBody = makeJsonRpcBizError(
            id,
            request.error.code,
            request.error.message
          )
        } else if (
          !decision.permissionAllowed ||
          !workflowMockCanAccessTaskForCapability(
            mockSuperAdminProfile,
            mockSuperAdminProfile.effective_session,
            request.task,
            decision.requiredPermission
          )
        ) {
          responseBody = makeJsonRpcBizError(
            id,
            40010,
            '当前账号无权查看或执行该任务动作'
          )
        } else if (request.receipt.task) {
          responseBody = {
            jsonrpc: '2.0',
            id,
            result: makeBizResult({ task: request.receipt.task }),
            error: '',
          }
        } else if (!decision.allowed) {
          responseBody = makeJsonRpcBizError(id, 40010, decision.reason)
        } else if (isMockTerminalWorkflowTask(request.task)) {
          responseBody = makeJsonRpcBizError(
            id,
            40010,
            '任务已结束，不能再次变更状态'
          )
        } else if (
          request.mutationParams.expected_version !== request.task.version
        ) {
          responseBody = makeJsonRpcBizError(
            id,
            40010,
            '任务已被其他人更新，请刷新后重试'
          )
        } else {
          const { mutationParams, receipt, task } = request
          task.task_status_key = nextStatusKey
          task.updated_at = nowUnix()
          task.payload = {
            ...(task.payload || {}),
            ...mutationParams.payload,
          }
          if (method === 'block_task_action') {
            task.payload.blocked_reason = mutationParams.reason
            delete task.payload.rejected_reason
            task.blocked_reason = mutationParams.reason
            upsertMockWorkflowBusinessProjection(
              task,
              'blocked',
              mutationParams.reason
            )
          } else if (method === 'reject_task_action') {
            task.payload.rejected_reason = mutationParams.reason
            delete task.payload.blocked_reason
            task.blocked_reason = mutationParams.reason
          } else {
            delete task.payload.blocked_reason
            delete task.payload.rejected_reason
            task.blocked_reason = ''
          }
          task.version += 1
          saveMockWorkflowMutationReceipt(receipt, task)
          responseBody = {
            jsonrpc: '2.0',
            id,
            result: makeBizResult({ task }),
            error: '',
          }
        }
      } else if (method === 'urge_task') {
        const request = resolveMockWorkflowMutationRequest(method, params)
        const decision = request.error
          ? null
          : workflowMockActionDecision({
              actionKey: 'urge',
              adminProfile: mockSuperAdminProfile,
              effectiveSession: mockSuperAdminProfile.effective_session,
              task: request.task,
            })
        if (request.error) {
          responseBody = makeJsonRpcBizError(
            id,
            request.error.code,
            request.error.message
          )
        } else if (
          !decision.permissionAllowed ||
          !workflowMockCanAccessTaskForCapability(
            mockSuperAdminProfile,
            mockSuperAdminProfile.effective_session,
            request.task,
            decision.requiredPermission
          )
        ) {
          responseBody = makeJsonRpcBizError(
            id,
            40010,
            '当前账号无权查看或执行该任务动作'
          )
        } else if (request.receipt.task) {
          responseBody = {
            jsonrpc: '2.0',
            id,
            result: makeBizResult({ task: request.receipt.task }),
            error: '',
          }
        } else if (!decision.allowed) {
          responseBody = makeJsonRpcBizError(id, 40010, decision.reason)
        } else if (isMockTerminalWorkflowTask(request.task)) {
          responseBody = makeJsonRpcBizError(id, 40010, '任务已结束，不能催办')
        } else if (
          request.mutationParams.expected_version !== request.task.version
        ) {
          responseBody = makeJsonRpcBizError(
            id,
            40010,
            '任务已被其他人更新，请刷新后重试'
          )
        } else {
          const { mutationParams, receipt, task } = request
          const urgedAt = nowUnix()
          const urgeCount = Number(task.urge_count || 0) + 1
          const actorRoleKey = decision.ownerRoleMatched
            ? task.owner_role_key
            : 'admin'
          const escalationTarget = mutationParams.action.startsWith(
            'escalate_to_'
          )
            ? mutationParams.action.slice('escalate_to_'.length)
            : ''
          task.urge_count = urgeCount
          task.last_urged_at = urgedAt
          task.last_urged_by = mockSuperAdminProfile.id
          task.last_urged_by_role_key = actorRoleKey
          if (escalationTarget) {
            task.escalated_at = urgedAt
            task.escalate_target_role_key = escalationTarget
          }
          task.payload = {
            ...(task.payload || {}),
            ...mutationParams.payload,
            urged: true,
            urge_count: urgeCount,
            last_urge_at: urgedAt,
            last_urge_action: mutationParams.action,
            last_urge_reason: mutationParams.reason,
            last_urge_actor_role_key: actorRoleKey,
            notification_type: escalationTarget
              ? 'urgent_escalation'
              : 'task_urged',
            alert_type: escalationTarget ? 'urgent_escalation' : 'urged_task',
            ...(escalationTarget
              ? {
                  escalated: true,
                  escalate_target_role_key: escalationTarget,
                }
              : {}),
          }
          task.updated_at = urgedAt
          task.version += 1
          saveMockWorkflowMutationReceipt(receipt, task)
          responseBody = {
            jsonrpc: '2.0',
            id,
            result: makeBizResult({ task }),
            error: '',
          }
        }
      } else if (method === 'list_business_states') {
        if (
          !workflowMockPermissionAllowed(
            mockSuperAdminProfile,
            mockSuperAdminProfile.effective_session,
            'workflow.task.read'
          )
        ) {
          responseBody = makeJsonRpcBizError(
            id,
            40010,
            '当前账号缺少查看协同任务权限'
          )
        } else {
          const businessStates = mockWorkflowBusinessStates.filter((item) =>
            matchWorkflowFilter(item, params)
          )
          responseBody = {
            jsonrpc: '2.0',
            id,
            result: makeBizResult({
              business_states: businessStates,
              total: businessStates.length,
              limit: Number(params.limit || 50),
              offset: Number(params.offset || 0),
            }),
            error: '',
          }
        }
      } else {
        responseBody = makeJsonRpcBizError(
          id,
          400,
          `unknown workflow method: ${method}`
        )
      }
    } else {
      // 未知领域
      responseBody = makeJsonRpcBizError(
        id,
        404,
        `unknown rpc domain: ${domain}`
      )
    }

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  console.info('[MOCK RPC] jsonRpcMockServer installed')
}
