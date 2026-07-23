import { Buffer } from 'node:buffer'

import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'
import { getNavigationSections } from '../../src/erp/config/seedData.mjs'
import { createMockAdminSessionToken } from '../mockAdminSessionToken.mjs'

import { installFactRpcMocks } from './factRpcMocks.mjs'
import { installMasterDataRpcMocks } from './masterDataRpcMocks.mjs'
import { installOrderRpcMocks } from './orderRpcMocks.mjs'
import { installSystemRpcMocks } from './systemRpcMocks.mjs'
import { installAttachmentRpcMocks } from './attachmentRpcMocks.mjs'
import { styleRpcResult, unsupportedRpcMethod } from './rpcMockResult.mjs'

const mockPdfBuffer = Buffer.from(
  '%PDF-1.4\n%plush-style-l1\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n',
  'utf8'
)

const mockMenuPermissionRequirements = Object.freeze({
  'global-dashboard': ['erp.workbench.read'],
  'task-board': ['workflow.task.read'],
  'business-dashboard': ['erp.business_dashboard.read'],
  customers: ['customer.read'],
  'sales-orders': ['sales_order.read'],
  'sales-returns': ['sales_return.read'],
  'material-bom': ['bom.read'],
  'production-orders': ['production.wip.read'],
  inventory: ['warehouse.inventory.read'],
  'shipping-release': [
    'warehouse.outbound.read',
    'finance.receivable.read',
    'sales_order.read',
  ],
  reconciliation: ['finance.reconciliation.read'],
  payables: ['finance.payable.read'],
  receivables: ['finance.receivable.read'],
  invoices: ['finance.invoice.read'],
  'finance-payments': ['finance.payment.read'],
})

const mockPermissionModuleNames = Object.freeze({
  system: '系统管理',
  customer_config: '客户配置',
  process_runtime: '异常流程恢复',
  erp: '工作台与通用工具',
  field: '敏感字段',
  masterdata: '基础资料',
  bom: '物料清单（BOM）',
  sales_order: '销售订单',
  workflow: '任务协同',
  warehouse: '仓储',
  sales_return: '客户退货',
  finance: '财务',
  production: '生产执行',
  mobile: '手机待办',
})

const mockControlPlanePermissionModules = new Set([
  'system',
  'customer_config',
  'process_runtime',
])

const mockPermissionUsageMenuKeys = Object.freeze({
  'finance.receivable.confirm': ['receivables'],
  'finance.receivable.read': ['receivables', 'shipping-release'],
  'sales_order.read': ['sales-orders', 'shipping-release'],
})

const mockPermissionUsageControlTypes = Object.freeze({
  'finance.receivable.read': {
    receivables: 'page',
    'shipping-release': 'section',
  },
  'sales_order.read': {
    'sales-orders': 'page',
    'shipping-release': 'section',
  },
})

function buildWorkflowMockEffectiveSession(session, adminProfile) {
  if (!session || typeof session !== 'object') return null
  const roles = Array.isArray(session.roles)
    ? session.roles
    : Array.isArray(adminProfile?.roles)
      ? adminProfile.roles
          .map((role) => String(role?.role_key || role?.key || '').trim())
          .filter(Boolean)
      : []
  return {
    ...session,
    roles,
  }
}

function resolveDelayFromReferer(request, paramName) {
  const referer = String(request.headers().referer || '').trim()
  if (!referer) {
    return 0
  }

  try {
    const raw = new URL(referer).searchParams.get(paramName)
    const delayMs = Number(raw)
    return Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 0
  } catch {
    return 0
  }
}

export async function installAdminRpcMocks(
  page,
  {
    baseURL = '',
    adminProfileOverride = null,
    effectiveSessionOverride = null,
    workflowTaskFixtures = [],
  } = {}
) {
  const nowUnix = () => Math.floor(Date.now() / 1000)
  const mockMenus = getNavigationSections()
    .flatMap((section) => section.items || [])
    .map((item) => ({
      key: item.key || item.path,
      label: item.label,
      path: item.path,
      required_any:
        mockMenuPermissionRequirements[item.key || item.path] ||
        item.required_any ||
        ['style.mock.unassigned'],
      required_all: item.required_all || [],
    }))
    .filter((item) => item.path)
  const mockPermissions = [
    {
      permission_key: 'system.user.read',
      name: '查看管理员',
      module: 'system',
    },
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
    {
      permission_key: 'system.user.revoke',
      name: '注销管理员账号',
      module: 'system',
    },
    { permission_key: 'system.role.read', name: '查看角色', module: 'system' },
    {
      permission_key: 'system.permission.read',
      name: '查看权限',
      module: 'system',
    },
    {
      permission_key: 'system.role.permission.manage',
      name: '管理角色权限',
      module: 'system',
    },
    {
      permission_key: 'customer_config.read',
      name: '查看客户配置',
      module: 'customer_config',
    },
    {
      permission_key: 'process_runtime.recover',
      name: '恢复异常流程运行实例',
      module: 'process_runtime',
    },
    {
      permission_key: 'field.party_private.read',
      name: '查看往来单位隐私字段',
      module: 'field',
    },
    {
      permission_key: 'field.sales_commercial.read',
      name: '查看销售商业字段',
      module: 'field',
    },
    {
      permission_key: 'field.procurement_commercial.read',
      name: '查看采购商业字段',
      module: 'field',
    },
    {
      permission_key: 'field.finance_settlement.read',
      name: '查看财务结算字段',
      module: 'field',
    },
    {
      permission_key: 'erp.workbench.read',
      name: '查看岗位工作台',
      module: 'erp',
    },
    {
      permission_key: 'erp.business_dashboard.read',
      name: '查看业务看板',
      module: 'erp',
    },
    {
      permission_key: 'workflow.task.read',
      name: '查看任务',
      module: 'workflow',
    },
    {
      permission_key: 'workflow.task.create',
      name: '创建任务',
      module: 'workflow',
    },
    {
      permission_key: 'workflow.task.update',
      name: '更新任务',
      module: 'workflow',
    },
    {
      permission_key: 'workflow.task.complete',
      name: '完成任务',
      module: 'workflow',
    },
    {
      permission_key: 'workflow.task.approve',
      name: '审批任务',
      module: 'workflow',
    },
    {
      permission_key: 'workflow.task.reject',
      name: '退回任务',
      module: 'workflow',
    },
    {
      permission_key: 'mobile.sales.access',
      name: '进入岗位任务页面',
      module: 'mobile',
    },
    {
      permission_key: 'customer.read',
      name: '查看客户档案',
      module: 'masterdata',
    },
    {
      permission_key: 'sales_order.read',
      name: '查看销售订单',
      module: 'sales_order',
    },
    {
      permission_key: 'sales_return.read',
      name: '查看客户退货',
      module: 'sales_return',
    },
    {
      permission_key: 'bom.read',
      name: '查看 BOM',
      module: 'bom',
    },
    {
      permission_key: 'production.wip.read',
      name: '查看生产工序流转',
      module: 'production',
    },
    {
      permission_key: 'warehouse.inventory.read',
      name: '查看库存',
      module: 'warehouse',
    },
    {
      permission_key: 'finance.credit_note.create',
      name: '创建财务红冲',
      module: 'finance',
    },
    {
      permission_key: 'finance.credit_note.reverse',
      name: '撤销财务红冲',
      module: 'finance',
    },
    {
      permission_key: 'finance.invoice.confirm',
      name: '确认发票',
      module: 'finance',
    },
    {
      permission_key: 'finance.invoice.read',
      name: '查看发票',
      module: 'finance',
    },
    {
      permission_key: 'finance.payable.confirm',
      name: '确认应付',
      module: 'finance',
    },
    {
      permission_key: 'finance.payable.read',
      name: '查看应付',
      module: 'finance',
    },
    {
      permission_key: 'finance.payment.create',
      name: '登记收付款',
      module: 'finance',
    },
    {
      permission_key: 'finance.payment.post',
      name: '确认并核销收付款',
      module: 'finance',
    },
    {
      permission_key: 'finance.payment.read',
      name: '查看收付款',
      module: 'finance',
    },
    {
      permission_key: 'finance.payment.reverse',
      name: '冲销收付款',
      module: 'finance',
    },
    {
      permission_key: 'finance.receivable.confirm',
      name: '确认应收',
      module: 'finance',
    },
    {
      permission_key: 'finance.receivable.read',
      name: '查看应收',
      module: 'finance',
    },
    {
      permission_key: 'finance.reconciliation.confirm',
      name: '处理对账',
      module: 'finance',
    },
    {
      permission_key: 'finance.reconciliation.read',
      name: '查看对账',
      module: 'finance',
    },
    {
      permission_key: 'finance.report.read',
      name: '查看财务报表',
      module: 'finance',
    },
  ].map((item) => {
    const parts = item.permission_key.split('.')
    const action = parts.at(-1)
    const readKey = [...parts.slice(0, -1), 'read'].join('.')
    const configuredMenuKeys =
      mockPermissionUsageMenuKeys[item.permission_key] || null
    const menus = (configuredMenuKeys
      ? configuredMenuKeys
          .map((menuKey) => mockMenus.find((menu) => menu.key === menuKey))
          .filter(Boolean)
      : mockMenus.filter((menu) =>
          [...(menu.required_any || []), ...(menu.required_all || [])].some(
            (key) => key === item.permission_key || key === readKey
          )
        )
    )
      .map(({ key, label, path, required_any, required_all }) => ({
        key,
        label,
        path,
        required_any,
        required_all,
      }))
    const isControlPlane = mockControlPlanePermissionModules.has(item.module)
    const conditions = [
      isControlPlane
        ? '仍受超级管理员保护、禁止自我停用或注销等安全规则限制'
        : item.module === 'mobile'
          ? '进入后仍只显示当前岗位或指定给本人的任务'
          : '仍受客户模块状态、业务状态和任务归属限制',
    ]
    return {
      ...item,
      module_name: mockPermissionModuleNames[item.module] || '',
      action,
      resource: parts.slice(0, -1).join('.'),
      permission_class: isControlPlane ? 'control_plane' : 'business',
      assignable: !isControlPlane,
      usage: {
        pages: menus.map((menu) => ({
          key: menu.key,
          name: menu.label,
          path: menu.path,
          section_key: '',
          section_name: '',
          control_key: `${menu.key}-${item.permission_key}`,
          control_name: item.name,
          control_type:
            mockPermissionUsageControlTypes[item.permission_key]?.[menu.key] ||
            (action === 'read' || action === 'access'
              ? 'page'
              : action === 'create'
                ? 'form'
                : 'button'),
          effect: '显示并允许执行',
          backend_methods: [],
          required_any: menu.required_any,
          required_all: menu.required_all,
          conditions,
        })),
        backend_only: menus.length === 0,
        backend_methods: [],
        required_any: [item.permission_key],
        required_all: [],
        conditions,
      },
    }
  })
  const allPermissionKeys = mockPermissions.map((item) => item.permission_key)
  const salesRole = {
    role_key: 'sales',
    name: '业务',
    description: '销售 / 业务跟进',
    builtin: true,
    role_type: 'business_default',
    version: 1,
    assignable_by_current_admin: true,
    permissions_editable_by_current_admin: true,
    disabled: false,
    sort_order: 20,
    navigation_mode: 'recommended',
    primary_menu_paths: [],
    permissions: [
      'erp.workbench.read',
      'field.party_private.read',
      'field.sales_commercial.read',
      'workflow.task.read',
      'mobile.sales.access',
      'customer.read',
      'sales_order.read',
      'warehouse.inventory.read',
    ],
    data_scopes: [
      { resource_type: 'warehouse', mode: 'ALL', resource_ids: [] },
    ],
  }
  const financeRole = {
    role_key: 'finance',
    name: '财务',
    description: '应收、应付、发票、对账、收付款和财务报表',
    builtin: true,
    role_type: 'business_default',
    version: 1,
    assignable_by_current_admin: true,
    permissions_editable_by_current_admin: true,
    disabled: false,
    sort_order: 60,
    navigation_mode: 'recommended',
    primary_menu_paths: [],
    permissions: [
      'finance.receivable.confirm',
      'finance.reconciliation.confirm',
      'finance.reconciliation.read',
    ],
    data_scopes: [
      { resource_type: 'warehouse', mode: 'ALL', resource_ids: [] },
    ],
  }
  const adminRole = {
    role_key: 'admin',
    name: '系统管理员',
    description: '员工账号、岗位和功能权限管理',
    builtin: true,
    role_type: 'system',
    version: 1,
    assignable_by_current_admin: false,
    permissions_editable_by_current_admin: false,
    disabled: false,
    sort_order: 80,
    navigation_mode: 'recommended',
    primary_menu_paths: [],
    permissions: allPermissionKeys.filter((key) => key.startsWith('system.')),
  }
  const defaultAdminProfile = {
    id: 1,
    username: 'style-l1-admin',
    phone: '13800138000',
    is_super_admin: true,
    disabled: false,
    roles: [
      { role_key: 'boss', name: '老板' },
      { role_key: 'sales', name: '业务' },
      { role_key: 'purchase', name: '采购' },
      { role_key: 'production', name: '生产' },
      { role_key: 'warehouse', name: '仓库' },
      { role_key: 'finance', name: '财务' },
      { role_key: 'pmc', name: 'PMC' },
      { role_key: 'quality', name: '品质' },
    ],
    permissions: allPermissionKeys,
    menus: mockMenus,
    erp_preferences: {
      column_orders: {},
    },
  }
  const profileOverride =
    adminProfileOverride && typeof adminProfileOverride === 'object'
      ? adminProfileOverride
      : {}
  const hasProfileOverride = (key) =>
    Object.prototype.hasOwnProperty.call(profileOverride, key)
  const adminProfile = {
    ...defaultAdminProfile,
    ...profileOverride,
    roles: hasProfileOverride('roles')
      ? profileOverride.roles
      : defaultAdminProfile.roles,
    permissions: hasProfileOverride('permissions')
      ? profileOverride.permissions
      : defaultAdminProfile.permissions,
    menus: hasProfileOverride('menus')
      ? profileOverride.menus
      : defaultAdminProfile.menus,
    erp_preferences: hasProfileOverride('erp_preferences')
      ? profileOverride.erp_preferences
      : defaultAdminProfile.erp_preferences,
  }
  const mockContext = {
    adminProfile,
    effectiveSession: buildWorkflowMockEffectiveSession(
      effectiveSessionOverride,
      adminProfile
    ),
    salesRole,
    financeRole,
    adminRole,
    mockMenus,
    mockPermissions,
    nowUnix,
    baseURL,
    mockPdfBuffer,
    resolveDelayFromReferer,
    createMockAdminToken,
    workflowTaskFixtures,
  }

  await installSystemRpcMocks(page, mockContext)
  await installMasterDataRpcMocks(page, mockContext)
  await installOrderRpcMocks(page, mockContext)
  await installFactRpcMocks(page, mockContext)
  await installAttachmentRpcMocks(page, mockContext)

  await page.route('**/rpc/customer_config', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    let data
    if (method === 'get_effective_session') {
      data = { session: mockContext.effectiveSession }
    } else if (method === 'start_finished_goods_delivery_process') {
      const shipmentID = Number(params.shipment_id || 0)
      const businessRefNo = String(params.business_ref_no || '').trim()
      const idempotencyKey = String(params.idempotency_key || '').trim()
      if (
        !Number.isSafeInteger(shipmentID) ||
        shipmentID <= 0 ||
        !businessRefNo ||
        !idempotencyKey
      ) {
        data = unsupportedRpcMethod(
          'customer_config',
          'start_finished_goods_delivery_process invalid params'
        )
      } else {
        const processInstanceID = 76_001
        const startedNode = {
          id: 76_002,
          process_instance_id: processInstanceID,
          node_key: 'finished_goods_quality',
          node_type: 'domain_command',
          status: 'active',
          version: 1,
        }
        data = {
          process_instance: {
            id: processInstanceID,
            process_key: 'finished_goods_delivery',
            process_version: 'v1',
            variant_key: 'finished_goods_delivery',
            business_ref_type: 'shipment',
            business_ref_id: shipmentID,
            business_ref_no: businessRefNo,
            status: 'active',
            version: 1,
          },
          started_node: startedNode,
          nodes: [
            startedNode,
            {
              id: 76_003,
              process_instance_id: processInstanceID,
              node_key: 'shipment_finance_approval',
              node_type: 'approval',
              status: 'waiting',
              version: 1,
            },
          ],
          runtime_boundary: {
            runtime_loader_start_only: true,
            executes_domain_command: false,
            writes_shipment_or_finance_fact: false,
            workflow_task_done_posts_fact: false,
          },
        }
      }
    } else {
      data = unsupportedRpcMethod('customer_config', method)
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: styleRpcResult(data),
      }),
    })
  })
}

export async function installAdminAuthExpiredRpcMocks(page) {
  await page.route('**/rpc/**', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id' } = body

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          code: RpcErrorCode.AUTH_REQUIRED,
          message: '未登录',
          data: {},
        },
      }),
    })
  })
}

export async function installAdminDisabledRpcMocks(page) {
  await page.route('**/rpc/admin', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method } = body

    if (method !== 'me') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: styleRpcResult(unsupportedRpcMethod('admin', method)),
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          code: RpcErrorCode.ADMIN_DISABLED,
          message: '管理员已禁用',
          data: {},
        },
      }),
    })
  })
}

export function createMockAdminToken() {
  return createMockAdminSessionToken({
    userID: 1,
    sessionKey: 'style-l1-admin-session',
  })
}
