// src/mocks/jsonRpcMockServer.js

let originalFetch = null
let mockWorkflowTaskID = 1
let mockWorkflowBusinessStateID = 1
const mockWorkflowTasks = []
const mockWorkflowBusinessStates = []
const mockBusinessRecords = [
  {
    id: 9001,
    module_key: 'products',
    document_no: 'ARCH-PROD-001',
    title: 'Archive 样品小熊',
    product_no: 'SKU-ARCH-001',
    product_name: 'Archive 样品小熊',
    customer_name: 'Archive 客户',
    quantity: 1,
    unit: '只',
    amount: 0,
    business_status_key: 'closed',
    owner_role_key: 'business',
    payload: { archive_fixture: true },
    items: [],
    created_at: 1714000000,
    updated_at: 1714000000,
  },
  {
    id: 9002,
    module_key: 'material-bom',
    document_no: 'ARCH-BOM-001',
    title: 'Archive 小熊 BOM',
    product_name: 'Archive 样品小熊',
    material_name: 'PP 棉',
    quantity: 3,
    unit: 'kg',
    amount: 37.5,
    business_status_key: 'closed',
    owner_role_key: 'pmc',
    payload: { archive_fixture: true },
    items: [
      {
        id: 1,
        name: 'PP 棉',
        quantity: 3,
        unit: 'kg',
        amount: 37.5,
        payload: { archive_fixture: true },
      },
    ],
    created_at: 1714000100,
    updated_at: 1714000100,
  },
  {
    id: 9003,
    module_key: 'accessories-purchase',
    document_no: 'ARCH-PUR-001',
    title: 'Archive 辅料采购',
    supplier_name: 'Archive 供应商',
    material_name: 'PP 棉',
    purchase_date: '2026-04-28',
    return_date: '2026-04-30',
    quantity: 3,
    unit: 'kg',
    amount: 37.5,
    business_status_key: 'closed',
    owner_role_key: 'purchase',
    payload: {
      archive_fixture: true,
      purchase_date: '2026-04-28',
      return_date: '2026-04-30',
    },
    items: [
      {
        id: 1,
        name: 'PP 棉',
        quantity: 3,
        unit: 'kg',
        unit_price: 12.5,
        amount: 37.5,
        payload: { archive_fixture: true },
      },
    ],
    created_at: 1714000200,
    updated_at: 1714000200,
  },
  {
    id: 9004,
    module_key: 'processing-contracts',
    document_no: 'ARCH-PC-001',
    title: 'Archive 委外加工',
    supplier_name: 'Archive 加工商',
    product_name: 'Archive 样品小熊',
    quantity: 100,
    unit: '只',
    amount: 1200,
    business_status_key: 'closed',
    owner_role_key: 'production',
    payload: { archive_fixture: true },
    items: [],
    created_at: 1714000300,
    updated_at: 1714000300,
  },
  {
    id: 9005,
    module_key: 'shipping-release',
    document_no: 'ARCH-OUT-001',
    title: 'Archive 出货放行',
    source_no: 'SO-ARCH-001',
    customer_name: 'Archive 客户',
    product_name: 'Archive 样品小熊',
    quantity: 60,
    unit: '箱',
    amount: 3600,
    business_status_key: 'shipping_released',
    owner_role_key: 'warehouse',
    payload: { archive_fixture: true, shipment_release_result: 'done' },
    items: [],
    created_at: 1714000400,
    updated_at: 1714000400,
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
    permission_key: 'system.permission.manage',
    name: '管理角色权限',
    module: 'system',
  },
  { permission_key: 'erp.dashboard.read', name: '查看任务看板', module: 'erp' },
  {
    permission_key: 'business.record.read',
    name: '查看业务记录',
    module: 'business',
  },
  {
    permission_key: 'workflow.task.read',
    name: '查看协同任务',
    module: 'workflow',
  },
  {
    permission_key: 'mobile.sales.access',
    name: '进入业务岗位任务端',
    module: 'mobile',
  },
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
      'business.record.read',
      'workflow.task.read',
      'mobile.sales.access',
    ],
  },
  {
    role_key: 'purchase',
    name: '采购',
    permissions: [
      'erp.dashboard.read',
      'business.record.read',
      'workflow.task.read',
      'mobile.purchase.access',
    ],
  },
]

const mockMenus = [
  {
    key: 'global-dashboard',
    label: '任务看板',
    path: '/erp/dashboard',
    required_permissions: ['erp.dashboard.read'],
  },
  {
    key: 'permission-center',
    label: '权限管理',
    path: '/erp/system/permissions',
    required_permissions: ['system.user.read', 'system.role.read'],
  },
]

const mockSuperAdminProfile = {
  id: 1,
  user_id: 1,
  username: 'mock-admin',
  phone: '13800138000',
  is_super_admin: true,
  disabled: false,
  roles: [],
  permissions: mockPermissions.map((item) => item.permission_key),
  menus: mockMenus,
  erp_preferences: { column_orders: {} },
}

const mockTaskStates = [
  { key: 'pending', label: '待开始', summary: '任务已创建，等待前置条件。' },
  { key: 'ready', label: '可执行', summary: '前置条件已满足。' },
  { key: 'processing', label: '处理中', summary: '任务正在推进。' },
  { key: 'blocked', label: '阻塞', summary: '被缺料、缺资料或异常卡住。' },
  { key: 'done', label: '已完成', summary: '完成条件已达到。' },
  { key: 'rejected', label: '已退回', summary: '需要回退处理。' },
  { key: 'cancelled', label: '已取消', summary: '任务已取消。' },
  { key: 'closed', label: '已关闭', summary: '任务已归档。' },
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
  { key: 'shipped', label: '已出货', summary: '出库事实已形成。' },
  { key: 'reconciling', label: '对账中', summary: '费用正在核对。' },
  { key: 'settled', label: '已结算', summary: '结算已闭环。' },
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
          started_at: null,
          completed_at: null,
          closed_at: null,
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
          started_at: null,
          completed_at: null,
          closed_at: null,
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
          started_at: now - (index + 2) * 86_400,
          completed_at: now - (index + 1) * 86_400,
          closed_at: null,
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

function normalizeMockDateFilterValue(value) {
  if (value === null || value === undefined || value === '') {
    return ''
  }
  const text = String(value).trim()
  if (/^\d+$/.test(text)) {
    const date = new Date(Number(text) * 1000)
    if (Number.isNaN(date.getTime())) return ''
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(date.getDate()).padStart(2, '0')}`
  }
  const matched = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (matched) {
    return `${matched[1]}-${String(Number(matched[2])).padStart(
      2,
      '0'
    )}-${String(Number(matched[3])).padStart(2, '0')}`
  }
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(date.getDate()).padStart(2, '0')}`
}

function normalizeMockStringList(values) {
  const source = Array.isArray(values) ? values : [values]
  const seen = new Set()
  return source
    .flatMap((value) =>
      String(value ?? '')
        .split(',')
        .map((item) => item.trim())
    )
    .filter((value) => {
      if (!value || seen.has(value)) {
        return false
      }
      seen.add(value)
      return true
    })
}

function matchBusinessRecordFilter(item, params) {
  const keyword = String(params.keyword || '')
    .trim()
    .toLowerCase()
  const businessStatusKeys = normalizeMockStringList(
    params.business_status_keys
  )
  const dateFilterKey = String(params.date_filter_key || '').trim()
  const dateRangeStart = normalizeMockDateFilterValue(params.date_range_start)
  const dateRangeEnd = normalizeMockDateFilterValue(params.date_range_end)
  const recordDateValue = normalizeMockDateFilterValue(item?.[dateFilterKey])
  const startMatched = dateRangeStart
    ? Boolean(recordDateValue) && recordDateValue >= dateRangeStart
    : true
  const endMatched = dateRangeEnd
    ? Boolean(recordDateValue) && recordDateValue <= dateRangeEnd
    : true
  const keywordMatched =
    !keyword ||
    [
      item.document_no,
      item.title,
      item.source_no,
      item.customer_name,
      item.supplier_name,
      item.style_no,
      item.product_no,
      item.product_name,
      item.material_name,
      item.warehouse_location,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword))

  return (
    (!params.module_key || item.module_key === params.module_key) &&
    (businessStatusKeys.length > 0
      ? businessStatusKeys.includes(item.business_status_key)
      : !params.business_status_key ||
        item.business_status_key === params.business_status_key) &&
    (!params.owner_role_key || item.owner_role_key === params.owner_role_key) &&
    (params.deleted_only
      ? Boolean(item.deleted_at)
      : params.include_deleted || !item.deleted_at) &&
    startMatched &&
    endMatched &&
    keywordMatched
  )
}

function sortBusinessRecords(records, sortOrder = 'desc') {
  const normalizedOrder = sortOrder === 'asc' ? 'asc' : 'desc'
  return [...records].sort((left, right) => {
    const leftCreatedAt = Number(left?.created_at || 0)
    const rightCreatedAt = Number(right?.created_at || 0)
    if (leftCreatedAt !== rightCreatedAt) {
      return normalizedOrder === 'asc'
        ? leftCreatedAt - rightCreatedAt
        : rightCreatedAt - leftCreatedAt
    }
    const leftID = Number(left?.id || 0)
    const rightID = Number(right?.id || 0)
    return normalizedOrder === 'asc' ? leftID - rightID : rightID - leftID
  })
}

function buildBusinessDashboardProjectionStats() {
  return mockBusinessDashboardProjectionModuleKeys.map((moduleKey) => ({
    module_key: moduleKey,
    total: 0,
    status_counts: {},
  }))
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
    } catch (e) {
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
        // 模拟一个简单登录规则：username === 'error' 时返回业务错误
        if (params.username === 'error') {
          responseBody = makeJsonRpcBizError(id, 401, 'invalid username')
        } else {
          responseBody = makeJsonRpcSuccess(id, {
            login: {
              userId: 'mock-user-001',
              nickname: params.username || 'mock-nickname',
            },
          })
        }
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
      } else if (method === 'sms_login') {
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
      } else if (method === 'logout') {
        responseBody = makeJsonRpcSuccess(id, {
          logout: {
            success: true,
          },
        })
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
        method === 'reset_password'
      ) {
        responseBody = {
          jsonrpc: '2.0',
          id,
          result: makeBizResult({
            admin: {
              id: Number(params.id || 2),
              username: params.username || 'mock-created-admin',
              phone: params.phone || '',
              is_super_admin: false,
              disabled: Boolean(params.disabled),
              roles: mockRoles.filter((role) =>
                (params.role_keys || []).includes(role.role_key)
              ),
              permissions: [],
              menus: [],
            },
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
      if (method === 'list') {
        responseBody = {
          jsonrpc: '2.0',
          id,
          result: makeBizResult({
            users: [
              {
                id: 8,
                username: 'mock-worker',
                disabled: false,
                created_at: nowUnix(),
                last_login_at: nowUnix(),
              },
            ],
            total: 1,
          }),
          error: '',
        }
      } else if (method === 'set_disabled' || method === 'reset_password') {
        responseBody = {
          jsonrpc: '2.0',
          id,
          result: makeBizResult({
            success: true,
            user_id: Number(params.user_id || 8),
            disabled: Boolean(params.disabled),
          }),
          error: '',
        }
      } else {
        responseBody = makeJsonRpcBizError(
          id,
          400,
          `unknown user method: ${method}`
        )
      }
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
      } else if (method === 'list_records') {
        const records = sortBusinessRecords(
          mockBusinessRecords.filter((item) =>
            matchBusinessRecordFilter(item, params)
          ),
          params.sort_order
        )
        responseBody = {
          jsonrpc: '2.0',
          id,
          result: makeBizResult({
            records,
            total: records.length,
            limit: Number(params.limit || 50),
            offset: Number(params.offset || 0),
          }),
          error: '',
        }
      } else if (
        [
          'create_record',
          'update_record',
          'delete_records',
          'restore_record',
        ].includes(method)
      ) {
        responseBody = makeJsonRpcBizError(
          id,
          400,
          'business_records 已归档为只读，请使用对应领域入口'
        )
      } else {
        responseBody = makeJsonRpcBizError(
          id,
          400,
          `unknown business method: ${method}`
        )
      }
    } else if (domain === 'workflow') {
      if (method === 'metadata') {
        responseBody = {
          jsonrpc: '2.0',
          id,
          result: makeBizResult({
            task_states: mockTaskStates,
            business_states: mockBusinessStates,
            planning_phases: [],
          }),
          error: '',
        }
      } else if (method === 'list_tasks') {
        const tasks = mockWorkflowTasks.filter((item) =>
          matchWorkflowFilter(item, params)
        )
        responseBody = {
          jsonrpc: '2.0',
          id,
          result: makeBizResult({
            tasks,
            total: tasks.length,
            limit: Number(params.limit || 50),
            offset: Number(params.offset || 0),
          }),
          error: '',
        }
      } else if (method === 'create_task') {
        const task = {
          id: mockWorkflowTaskID++,
          task_code: params.task_code || `mock-task-${Date.now()}`,
          task_group: params.task_group || 'mock',
          task_name: params.task_name || '模拟任务',
          source_type: params.source_type || 'mock',
          source_id: Number(params.source_id || Date.now()),
          source_no: params.source_no || '',
          business_status_key: params.business_status_key || '',
          task_status_key: params.task_status_key || 'pending',
          owner_role_key: params.owner_role_key || 'sales',
          assignee_id: null,
          priority: Number(params.priority || 0),
          blocked_reason: params.blocked_reason || '',
          due_at: null,
          started_at: null,
          completed_at: null,
          closed_at: null,
          payload: params.payload || {},
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
      } else if (method === 'update_task_status') {
        const task = mockWorkflowTasks.find(
          (item) => Number(item.id) === Number(params.id)
        )
        if (!task) {
          responseBody = makeJsonRpcBizError(id, 40010, '任务不存在')
        } else {
          task.task_status_key = params.task_status_key || task.task_status_key
          task.business_status_key =
            params.business_status_key || task.business_status_key
          task.updated_at = nowUnix()
          task.payload = params.payload || task.payload || {}
          if (params.reason) task.blocked_reason = params.reason
          if (task.task_status_key === 'processing' && !task.started_at) {
            task.started_at = nowUnix()
          }
          if (task.task_status_key === 'done') task.completed_at = nowUnix()
          responseBody = {
            jsonrpc: '2.0',
            id,
            result: makeBizResult({ task }),
            error: '',
          }
        }
      } else if (method === 'list_business_states') {
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
      } else if (method === 'upsert_business_state') {
        let businessState = mockWorkflowBusinessStates.find(
          (item) =>
            item.source_type === params.source_type &&
            Number(item.source_id) === Number(params.source_id)
        )
        const nextBusinessState = {
          id: businessState?.id || mockWorkflowBusinessStateID++,
          source_type: params.source_type || 'mock',
          source_id: Number(params.source_id || Date.now()),
          source_no: params.source_no || '',
          order_id: params.order_id || null,
          batch_id: params.batch_id || null,
          business_status_key: params.business_status_key || 'project_pending',
          owner_role_key: params.owner_role_key || 'sales',
          blocked_reason: params.blocked_reason || '',
          status_changed_at: nowUnix(),
          payload: params.payload || {},
          created_at: businessState?.created_at || nowUnix(),
          updated_at: nowUnix(),
        }
        if (businessState) {
          Object.assign(businessState, nextBusinessState)
        } else {
          businessState = nextBusinessState
          mockWorkflowBusinessStates.unshift(businessState)
        }
        responseBody = {
          jsonrpc: '2.0',
          id,
          result: makeBizResult({ business_state: businessState }),
          error: '',
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
