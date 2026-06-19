import { Buffer } from 'node:buffer'

import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'
import { getNavigationSections } from '../../src/erp/config/seedData.mjs'

import { installFactRpcMocks } from './factRpcMocks.mjs'
import { installMasterDataRpcMocks } from './masterDataRpcMocks.mjs'
import { installOrderRpcMocks } from './orderRpcMocks.mjs'
import { installSystemRpcMocks } from './systemRpcMocks.mjs'

const mockPdfBuffer = Buffer.from(
  '%PDF-1.4\n%plush-style-l1\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n',
  'utf8'
)

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
  { baseURL = '', adminProfileOverride = null } = {}
) {
  const nowUnix = () => Math.floor(Date.now() / 1000)
  const mockMenus = getNavigationSections()
    .flatMap((section) => section.items || [])
    .map((item) => ({
      key: item.key || item.path,
      label: item.label,
      path: item.path,
      required_permissions: item.required_permissions || [],
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
    { permission_key: 'system.role.read', name: '查看角色', module: 'system' },
    {
      permission_key: 'system.permission.read',
      name: '查看权限',
      module: 'system',
    },
    {
      permission_key: 'system.permission.manage',
      name: '管理角色权限',
      module: 'system',
    },
    { permission_key: 'erp.dashboard.read', name: '查看看板', module: 'erp' },
    {
      permission_key: 'workflow.task.read',
      name: '查看协同任务',
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
      permission_key: 'workflow.task.approve',
      name: '审批协同任务',
      module: 'workflow',
    },
    {
      permission_key: 'workflow.task.reject',
      name: '驳回协同任务',
      module: 'workflow',
    },
    {
      permission_key: 'mobile.sales.access',
      name: '进入业务岗位任务端',
      module: 'mobile',
    },
  ]
  const allPermissionKeys = mockPermissions.map((item) => item.permission_key)
  const salesRole = {
    role_key: 'sales',
    name: '业务',
    description: '销售 / 业务跟进',
    builtin: true,
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
    description: '系统账号、角色和权限管理',
    builtin: true,
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
    salesRole,
    adminRole,
    mockMenus,
    mockPermissions,
    nowUnix,
    baseURL,
    mockPdfBuffer,
    resolveDelayFromReferer,
    createMockAdminToken,
  }

  await installSystemRpcMocks(page, mockContext)
  await installMasterDataRpcMocks(page, mockContext)
  await installOrderRpcMocks(page, mockContext)
  await installFactRpcMocks(page, mockContext)
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
      await route.fallback()
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
  const header = encodeBase64URL({ alg: 'none', typ: 'JWT' })
  const payload = encodeBase64URL({
    uid: 1,
    uname: 'style-l1-admin',
    role: 1,
    exp: Math.floor(Date.now() / 1000) + 3600,
  })
  return `${header}.${payload}.stylel1`
}

function encodeBase64URL(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}
