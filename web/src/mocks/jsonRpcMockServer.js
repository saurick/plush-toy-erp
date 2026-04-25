// src/mocks/jsonRpcMockServer.js

let originalFetch = null
let mockWorkflowTaskID = 1
let mockWorkflowBusinessStateID = 1
let mockBusinessRecordID = 1
let mockBusinessRecordItemID = 1
const mockWorkflowTasks = []
const mockWorkflowBusinessStates = []
const mockBusinessRecords = []

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

function buildBusinessDashboardStats() {
  const moduleStats = new Map()
  mockBusinessRecords.forEach((record) => {
    if (record.deleted_at) {
      return
    }
    const moduleKey = String(record.module_key || '').trim()
    const statusKey = String(record.business_status_key || '').trim()
    if (!moduleKey || !statusKey) {
      return
    }
    const stats = moduleStats.get(moduleKey) || {
      module_key: moduleKey,
      total: 0,
      status_counts: {},
    }
    stats.total += 1
    stats.status_counts[statusKey] =
      Number(stats.status_counts[statusKey] || 0) + 1
    moduleStats.set(moduleKey, stats)
  })
  return Array.from(moduleStats.values())
}

function makeBusinessRecord(params, existing = {}) {
  const now = nowUnix()
  const items = Array.isArray(params.items)
    ? params.items.map((item, index) => ({
        id: item.id || mockBusinessRecordItemID++,
        record_id: existing.id || mockBusinessRecordID,
        module_key:
          params.module_key || existing.module_key || 'project-orders',
        line_no: Number(item.line_no || index + 1),
        item_name: item.item_name || '',
        material_name: item.material_name || '',
        spec: item.spec || '',
        unit: item.unit || '',
        quantity: item.quantity ?? null,
        unit_price: item.unit_price ?? null,
        amount: item.amount ?? null,
        supplier_name: item.supplier_name || '',
        warehouse_location: item.warehouse_location || '',
        payload: item.payload || {},
        created_at: existing.created_at || now,
        updated_at: now,
      }))
    : existing.items || []
  return {
    id: existing.id || mockBusinessRecordID++,
    module_key: params.module_key || existing.module_key || 'project-orders',
    document_no:
      params.document_no ||
      existing.document_no ||
      `BR${String(mockBusinessRecordID).padStart(6, '0')}`,
    title: params.title || existing.title || '模拟业务记录',
    business_status_key:
      params.business_status_key ||
      existing.business_status_key ||
      'project_pending',
    owner_role_key:
      params.owner_role_key || existing.owner_role_key || 'merchandiser',
    source_no: params.source_no || '',
    customer_name: params.customer_name || '',
    supplier_name: params.supplier_name || '',
    style_no: params.style_no || '',
    product_no: params.product_no || '',
    product_name: params.product_name || '',
    material_name: params.material_name || '',
    warehouse_location: params.warehouse_location || '',
    quantity: params.quantity ?? null,
    unit: params.unit || '',
    amount: params.amount ?? null,
    document_date: params.document_date || '',
    due_date: params.due_date || '',
    payload: params.payload || {},
    items,
    row_version: Number(existing.row_version || 0) + 1,
    created_by: existing.created_by || 1,
    updated_by: 1,
    created_at: existing.created_at || now,
    updated_at: now,
    deleted_at: existing.deleted_at || null,
    deleted_by: existing.deleted_by || null,
    delete_reason: existing.delete_reason || '',
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
      if (method === 'login') {
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
            user_id: 1,
            username: params.username || 'mock-admin',
            phone: '13800138000',
            access_token: 'mock-admin-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            token_type: 'Bearer',
            admin_level: 0,
            menu_permissions: [
              '/erp/dashboard',
              '/erp/flows/overview',
              '/erp/source-readiness',
              '/erp/print-center',
              '/erp/help-center',
              '/erp/docs/system-init',
              '/erp/docs/operation-playbook',
              '/erp/docs/field-truth',
              '/erp/docs/data-model',
              '/erp/docs/import-mapping',
              '/erp/docs/mobile-roles',
              '/erp/docs/print-templates',
              '/erp/changes/current',
              '/erp/system/permissions',
            ],
            mobile_role_permissions: [
              'boss',
              'merchandiser',
              'purchasing',
              'production',
              'warehouse',
              'finance',
              'pmc',
              'quality',
            ],
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
            user_id: 1,
            username: 'mock-admin',
            phone: params.phone || '13800138000',
            access_token: 'mock-admin-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            token_type: 'Bearer',
            admin_level: 0,
            menu_permissions: ['/erp/dashboard'],
            mobile_role_permissions: params.mobile_role_key
              ? [params.mobile_role_key]
              : [],
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
          result: makeBizResult({
            id: 1,
            username: 'mock-admin',
            phone: '13800138000',
            level: 0,
            disabled: false,
            menu_permissions: [
              '/erp/dashboard',
              '/erp/flows/overview',
              '/erp/source-readiness',
              '/erp/print-center',
              '/erp/help-center',
              '/erp/docs/system-init',
              '/erp/docs/operation-playbook',
              '/erp/docs/field-truth',
              '/erp/docs/data-model',
              '/erp/docs/import-mapping',
              '/erp/docs/mobile-roles',
              '/erp/docs/print-templates',
              '/erp/changes/current',
              '/erp/system/permissions',
            ],
            mobile_role_permissions: [
              'boss',
              'merchandiser',
              'purchasing',
              'production',
              'warehouse',
              'finance',
              'pmc',
              'quality',
            ],
          }),
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
                level: 0,
                disabled: false,
                menu_permissions: [],
                mobile_role_permissions: [],
              },
            ],
          }),
          error: '',
        }
      } else if (
        method === 'create' ||
        method === 'set_permissions' ||
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
              level: Number(params.level || 1),
              disabled: Boolean(params.disabled),
              menu_permissions: Array.isArray(params.menu_permissions)
                ? params.menu_permissions
                : [],
              mobile_role_permissions: Array.isArray(
                params.mobile_role_permissions
              )
                ? params.mobile_role_permissions
                : [],
            },
          }),
          error: '',
        }
      } else if (method === 'menu_options') {
        responseBody = {
          jsonrpc: '2.0',
          id,
          result: makeBizResult({
            menu_options: [
              { key: '/erp/dashboard', label: '全局驾驶舱' },
              { key: '/erp/system/permissions', label: '权限管理' },
            ],
            mobile_role_options: [
              { key: 'purchasing', label: '采购移动端' },
              { key: 'warehouse', label: '仓库移动端' },
            ],
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
            modules: buildBusinessDashboardStats(),
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
      } else if (method === 'create_record') {
        const record = makeBusinessRecord(params)
        mockBusinessRecords.unshift(record)
        responseBody = {
          jsonrpc: '2.0',
          id,
          result: makeBizResult({ record }),
          error: '',
        }
      } else if (method === 'update_record') {
        const record = mockBusinessRecords.find(
          (item) => Number(item.id) === Number(params.id)
        )
        if (!record) {
          responseBody = makeJsonRpcBizError(id, 40010, '业务记录不存在')
        } else {
          Object.assign(record, makeBusinessRecord(params, record))
          responseBody = {
            jsonrpc: '2.0',
            id,
            result: makeBizResult({ record }),
            error: '',
          }
        }
      } else if (method === 'delete_records') {
        const ids = Array.isArray(params.ids) ? params.ids.map(Number) : []
        let affected = 0
        mockBusinessRecords.forEach((record) => {
          if (ids.includes(Number(record.id)) && !record.deleted_at) {
            record.deleted_at = nowUnix()
            record.deleted_by = 1
            record.delete_reason = params.delete_reason || '业务页删除'
            affected += 1
          }
        })
        responseBody = {
          jsonrpc: '2.0',
          id,
          result: makeBizResult({ affected }),
          error: '',
        }
      } else if (method === 'restore_record') {
        const record = mockBusinessRecords.find(
          (item) => Number(item.id) === Number(params.id)
        )
        if (!record) {
          responseBody = makeJsonRpcBizError(id, 40010, '业务记录不存在')
        } else {
          record.deleted_at = null
          record.deleted_by = null
          record.delete_reason = ''
          record.updated_at = nowUnix()
          responseBody = {
            jsonrpc: '2.0',
            id,
            result: makeBizResult({ record }),
            error: '',
          }
        }
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
          owner_role_key: params.owner_role_key || 'merchandiser',
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
          owner_role_key: params.owner_role_key || 'merchandiser',
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
