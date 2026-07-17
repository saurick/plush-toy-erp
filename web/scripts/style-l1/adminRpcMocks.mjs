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
    workflowSourceTaskProducerFixtures = [],
  } = {}
) {
  const nowUnix = () => Math.floor(Date.now() / 1000)
  const mockMenus = getNavigationSections()
    .flatMap((section) => section.items || [])
    .map((item) => ({
      key: item.key || item.path,
      label: item.label,
      path: item.path,
      required_any: item.required_any || [],
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
    { permission_key: 'erp.dashboard.read', name: '查看看板', module: 'erp' },
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
  ].map((item) => {
    const parts = item.permission_key.split('.')
    const action = parts.at(-1)
    const readKey = [...parts.slice(0, -1), 'read'].join('.')
    const menus = mockMenus
      .filter((menu) =>
        [...(menu.required_any || []), ...(menu.required_all || [])].some(
          (key) => key === item.permission_key || key === readKey
        )
      )
      .map(({ key, label, path }) => ({ key, label, path }))
    const conditions = [
      item.module === 'system'
        ? '仍受超级管理员保护、禁止自我停用或注销等安全规则限制'
        : item.module === 'mobile'
          ? '进入后仍只显示当前岗位或指定给本人的任务'
          : '仍受客户模块状态、业务状态和任务归属限制',
    ]
    return {
      ...item,
      permission_class: item.module === 'system' ? 'control_plane' : 'business',
      assignable: item.module !== 'system',
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
            action === 'read' || action === 'access'
              ? 'page'
              : action === 'create'
                ? 'form'
                : 'button',
          effect: '显示并允许执行',
          backend_methods: [],
          required_any: [item.permission_key],
          required_all: [],
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
    permissions: [
      'erp.dashboard.read',
      'workflow.task.read',
      'mobile.sales.access',
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
    adminRole,
    mockMenus,
    mockPermissions,
    nowUnix,
    baseURL,
    mockPdfBuffer,
    resolveDelayFromReferer,
    createMockAdminToken,
    workflowTaskFixtures,
    workflowSourceTaskProducerFixtures,
  }

  await installSystemRpcMocks(page, mockContext)
  await installMasterDataRpcMocks(page, mockContext)
  await installOrderRpcMocks(page, mockContext)
  await installFactRpcMocks(page, mockContext)
  await installAttachmentRpcMocks(page, mockContext)

  await page.route('**/rpc/customer_config', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method } = body
    const data =
      method === 'get_effective_session'
        ? { session: mockContext.effectiveSession }
        : unsupportedRpcMethod('customer_config', method)

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
