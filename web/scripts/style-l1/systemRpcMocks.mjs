import { setTimeout as delay } from 'node:timers/promises'
import { styleRpcResult, unsupportedRpcMethod } from './rpcMockResult.mjs'

const STYLE_L1_RELEASE_VERSION = 'yoyoosun-20260810-20c96d38-amd64'
const STYLE_L1_GIT_SHA = '20c96d3819429361a35d2551b63b211f055de37e'

export async function installSystemRpcMocks(page, context) {
  const {
    adminProfile,
    bossRole,
    salesRole,
    purchaseRole,
    financeRole,
    pmcRole,
    adminRole,
    mockMenus,
    mockPermissions,
    mockPdfBuffer,
    resolveDelayFromReferer,
    createMockAdminToken,
    nowUnix,
    legalNoticeAcknowledged = true,
  } = context
  const availableRoles = [
    bossRole,
    salesRole,
    purchaseRole,
    financeRole,
    pmcRole,
    adminRole,
  ].filter(Boolean)
  const roleByKey = new Map(availableRoles.map((role) => [role.role_key, role]))
  const roleForParams = (params = {}) =>
    roleByKey.get(String(params?.role_key || '').trim()) || salesRole
  const legalNoticeAcknowledgements = new Map()
  const legalNoticeReceipt = (params = {}) => {
    const noticeVersion = String(params.notice_version || '').trim()
    const contentFingerprint = String(params.content_fingerprint || '').trim()
    return {
      noticeVersion,
      contentFingerprint,
      key: `${adminProfile.id}:${noticeVersion}:${contentFingerprint}`,
    }
  }
  const legalNoticeStatusData = (receipt, acknowledgedAt = 0) => ({
    notice_version: receipt.noticeVersion,
    content_fingerprint: receipt.contentFingerprint,
    acknowledged: acknowledgedAt > 0,
    acknowledged_at: acknowledgedAt,
  })

  await page.route('**/rpc/system', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method } = body
    const data =
      method === 'version'
        ? {
            version: STYLE_L1_RELEASE_VERSION,
            release_version: STYLE_L1_RELEASE_VERSION,
            git_sha: STYLE_L1_GIT_SHA,
            git_sha_short: STYLE_L1_GIT_SHA.slice(0, 8),
            formal: true,
          }
        : method === 'ping'
          ? { pong: 'pong' }
          : unsupportedRpcMethod('system', method)
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

  const assistantAdmin = {
    id: 2,
    username: 'assistant-admin',
    display_name: '业务助理',
    phone: '13900139000',
    is_super_admin: false,
    disabled: false,
    account_status: 'active',
    revoked_at: 0,
    status_reason: '',
    roles: [salesRole],
    permissions: salesRole.permissions,
    menus: mockMenus.filter((item) => item.path === '/erp/dashboard'),
  }
  const purchaseAdmin = {
    id: 3,
    username: 'purchase-employee',
    display_name: '采购专员',
    phone: '13900139001',
    is_super_admin: false,
    disabled: false,
    account_status: 'active',
    revoked_at: 0,
    status_reason: '',
    roles: [purchaseRole],
    permissions: purchaseRole.permissions,
    menus: [],
  }
  const pmcAdmin = {
    id: 7,
    username: 'pmc-employee',
    display_name: 'PMC 专员',
    phone: '13900139005',
    is_super_admin: false,
    disabled: false,
    account_status: 'active',
    revoked_at: 0,
    status_reason: '',
    roles: [pmcRole],
    permissions: pmcRole.permissions,
    menus: [],
  }
  const multiRoleAdmin = {
    id: 4,
    username: 'multi-role-employee',
    display_name: '综合跟单',
    phone: '13900139002',
    is_super_admin: false,
    disabled: false,
    account_status: 'active',
    revoked_at: 0,
    status_reason: '',
    roles: [salesRole, financeRole],
    permissions: Array.from(
      new Set([...salesRole.permissions, ...financeRole.permissions])
    ),
    menus: [],
  }
  const suspendedAdmin = {
    id: 5,
    username: 'suspended-finance',
    display_name: '离岗财务',
    phone: '13900139003',
    is_super_admin: false,
    disabled: true,
    account_status: 'suspended',
    revoked_at: 0,
    status_reason: '临时离岗',
    roles: [financeRole],
    permissions: financeRole.permissions,
    menus: [],
  }
  const revokedAdmin = {
    id: 6,
    username: 'revoked-sales',
    display_name: '离职业务员',
    phone: '13900139004',
    is_super_admin: false,
    disabled: true,
    account_status: 'revoked',
    revoked_at: nowUnix() - 86_400,
    status_reason: '已离职',
    roles: [salesRole],
    permissions: salesRole.permissions,
    menus: [],
  }

  await page.route('**/rpc/admin', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body

    let data = {}
    switch (method) {
      case 'me':
        data = adminProfile
        break
      case 'list':
        data = {
          admins: [
            adminProfile,
            { ...assistantAdmin },
            purchaseAdmin,
            pmcAdmin,
            multiRoleAdmin,
            suspendedAdmin,
            revokedAdmin,
          ],
        }
        break
      case 'create':
      case 'set_roles':
      case 'set_profile':
      case 'set_disabled':
      case 'reset_password':
        if (method === 'set_roles') {
          assistantAdmin.roles = Array.isArray(params.role_keys)
            ? params.role_keys.map((roleKey) => ({
                role_key: roleKey,
                name: roleKey,
              }))
            : assistantAdmin.roles
        }
        if (method === 'create') {
          assistantAdmin.display_name = String(params.display_name || '').trim()
          assistantAdmin.username = String(params.username || '').trim()
          assistantAdmin.phone = String(params.phone || '').trim()
        }
        if (method === 'set_profile') {
          assistantAdmin.display_name = String(params.display_name || '').trim()
          assistantAdmin.phone = String(params.phone || '').trim()
        }
        if (method === 'set_disabled') {
          assistantAdmin.disabled = Boolean(params.disabled)
          assistantAdmin.account_status = assistantAdmin.disabled
            ? 'suspended'
            : 'active'
          assistantAdmin.status_reason = String(params.reason || '').trim()
        }
        data = {
          admin: { ...assistantAdmin },
        }
        break
      case 'revoke':
        assistantAdmin.disabled = true
        assistantAdmin.account_status = 'revoked'
        assistantAdmin.revoked_at = nowUnix()
        assistantAdmin.status_reason = String(params.reason || '').trim()
        data = {
          admin: { ...assistantAdmin },
          released_task_count: 1,
        }
        break
      case 'set_role_settings': {
        const role = roleForParams(params)
        role.version += 1
        role.permissions = Array.isArray(params.permission_keys)
          ? params.permission_keys
          : role.permissions
        role.data_scopes = Array.isArray(params.data_scopes)
          ? params.data_scopes
          : role.data_scopes
        role.navigation_mode =
          params.navigation_mode === 'custom' ? 'custom' : 'recommended'
        role.primary_menu_paths =
          role.navigation_mode === 'custom' &&
          Array.isArray(params.primary_menu_paths)
            ? params.primary_menu_paths
            : []
        role.secondary_menu_paths =
          role.navigation_mode === 'custom' &&
          Array.isArray(params.secondary_menu_paths)
            ? params.secondary_menu_paths
            : []
        data = { role: { ...role } }
        break
      }
      case 'set_erp_column_order': {
        const moduleKey = String(params?.module_key || '').trim()
        const order = Array.isArray(params?.order)
          ? params.order
              .map((item) => String(item || '').trim())
              .filter(Boolean)
          : []
        if (moduleKey) {
          if (order.length === 0) {
            delete adminProfile.erp_preferences.column_orders[moduleKey]
          } else {
            adminProfile.erp_preferences.column_orders[moduleKey] = order
          }
        }
        data = {
          erp_preferences: {
            column_orders: {
              ...adminProfile.erp_preferences.column_orders,
            },
          },
        }
        break
      }
      case 'rbac_options':
      case 'menu_options':
        data = {
          roles: availableRoles,
          permissions: mockPermissions,
          menus: mockMenus,
          role_options: availableRoles,
          permission_options: mockPermissions,
          menu_options: mockMenus,
          warehouse_scope_options: [
            { id: 1, code: 'RAW', name: '原料仓', is_active: true },
            { id: 2, code: 'FG', name: '成品仓', is_active: true },
          ],
        }
        break
      case 'effective_role_access': {
        const role = roleForParams(params)
        const permissionKeys = Array.isArray(params.permission_keys)
          ? params.permission_keys
              .map((permissionKey) => String(permissionKey || '').trim())
              .filter(Boolean)
          : role.permissions
        const selectedPermissionKeys = new Set(permissionKeys)
        data = {
          effective_access: {
            role_key: role.role_key,
            role_name: role.name,
            role_version: Number(role.version || 1),
            source: 'active_customer_config_revision',
            is_final: true,
            is_preview: Array.isArray(params.permission_keys),
            config_revision: 'style-l1-active-revision',
            config_hash: 'style-l1-active-config-hash',
            config_hash_version: 1,
            product_version: 'style-l1-product',
            permissions: permissionKeys.map((permissionKey) => {
              const permission = mockPermissions.find(
                (item) => item.permission_key === permissionKey
              )
              return {
                permission_key: permissionKey,
                class: permission?.permission_class || 'business',
                rbac_granted: true,
                effective: true,
                reasons: [],
              }
            }),
            pages: mockMenus.map((menu) => {
              const requiredAny = Array.isArray(menu.required_any)
                ? menu.required_any
                : []
              const requiredAll = Array.isArray(menu.required_all)
                ? menu.required_all
                : []
              const anySatisfied =
                requiredAny.length === 0 ||
                requiredAny.some((permissionKey) =>
                  selectedPermissionKeys.has(permissionKey)
                )
              const allSatisfied = requiredAll.every((permissionKey) =>
                selectedPermissionKeys.has(permissionKey)
              )
              const granted = anySatisfied && allSatisfied
              return {
                key: menu.key,
                label: menu.label,
                path: menu.path,
                required_any: requiredAny,
                required_all: requiredAll,
                missing_any: anySatisfied
                  ? []
                  : requiredAny.filter(
                      (permissionKey) =>
                        !selectedPermissionKeys.has(permissionKey)
                    ),
                missing_all: requiredAll.filter(
                  (permissionKey) => !selectedPermissionKeys.has(permissionKey)
                ),
                rbac_granted: granted,
                effective: granted,
                reasons: granted ? [] : [{ label: '岗位基础权限未授予' }],
              }
            }),
          },
        }
        break
      }
      case 'legal_notice_status': {
        const receipt = legalNoticeReceipt(params)
        if (
          legalNoticeAcknowledged === true &&
          !legalNoticeAcknowledgements.has(receipt.key)
        ) {
          legalNoticeAcknowledgements.set(receipt.key, nowUnix())
        }
        data = legalNoticeStatusData(
          receipt,
          legalNoticeAcknowledgements.get(receipt.key) || 0
        )
        break
      }
      case 'acknowledge_legal_notice': {
        const receipt = legalNoticeReceipt(params)
        if (!legalNoticeAcknowledgements.has(receipt.key)) {
          legalNoticeAcknowledgements.set(receipt.key, nowUnix())
        }
        data = legalNoticeStatusData(
          receipt,
          legalNoticeAcknowledgements.get(receipt.key)
        )
        break
      }
      case 'audit_logs':
        data = {
          total: 2,
          events: [
            {
              id: 101,
              source: 'admin_manage',
              event_key: 'admin_user.roles.set',
              created_at: nowUnix() - 300,
              actor_key: 'style-l1-admin',
              target_key: 'assistant-admin',
              target_type: '员工账号',
              payload: {
                actor: { id: 1, username: 'style-l1-admin' },
                target: {
                  id: 2,
                  key: 'assistant-admin',
                  type: 'admin_user',
                },
                before: { role_keys: ['sales'] },
                after: { role_keys: ['sales', 'warehouse'] },
              },
            },
            {
              id: 102,
              source: 'server_bootstrap',
              event_key: 'admin_bootstrap.blocked',
              created_at: nowUnix() - 180,
              payload: {
                actor: { id: 0, username: 'server' },
                target: { type: 'bootstrap' },
                reason: '生产环境缺少显式初始化确认',
              },
            },
          ],
        }
        break
      default:
        data = unsupportedRpcMethod('admin', method)
        break
    }

    const responseDelayMs =
      method === 'me'
        ? resolveDelayFromReferer(route.request(), '__style_l1_admin_me_delay')
        : method === 'list'
          ? resolveDelayFromReferer(
              route.request(),
              '__style_l1_admin_list_delay'
            )
          : method === 'effective_role_access' &&
              Array.isArray(params.permission_keys)
            ? resolveDelayFromReferer(
                route.request(),
                '__style_l1_permission_draft_delay'
              )
            : 0

    if (responseDelayMs > 0) {
      await delay(responseDelayMs)
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

  await page.route('**/rpc/auth', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method } = body

    if (method === 'capabilities') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: {
            code: 0,
            message: 'OK',
            data: {
              sms_login: {
                enabled: true,
                mode: 'mock',
                mock_delivery: true,
                disabled_reason: '',
              },
            },
          },
        }),
      })
      return
    }

    if (method === 'logout') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: {
            code: 0,
            message: 'OK',
          },
        }),
      })
      return
    }

    if (method === 'send_sms_code') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: {
            code: 0,
            message: 'OK',
            data: {
              mock_delivery: true,
              mock_code: '123456',
              resend_after: Math.floor(Date.now() / 1000) + 60,
            },
          },
        }),
      })
      return
    }

    if (method === 'admin_login') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: {
            code: 0,
            message: 'OK',
            data: {
              ...adminProfile,
              access_token: createMockAdminToken(),
              token_type: 'Bearer',
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            },
          },
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
        result: styleRpcResult(unsupportedRpcMethod('auth', method)),
      }),
    })
  })

  await page.route('**/rpc/debug', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method } = body

    if (method !== 'capabilities') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: styleRpcResult(unsupportedRpcMethod('debug', method)),
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
          code: 0,
          message: 'OK',
          data: {
            environment: 'style-l1',
            seedEnabled: false,
            seedAllowed: false,
            seedDisabledReason: '样式回归环境不执行生成调试数据',
            cleanupEnabled: false,
            cleanupAllowed: false,
            cleanupDisabledReason: '样式回归环境不执行清理调试数据',
            cleanupScope: 'debug_run',
            cleanupOnlyDebugData: true,
            requiresDebugRunId: true,
            destructiveRemoteDenied: true,
          },
        },
      }),
    })
  })

  await page.route('**/templates/render-pdf', async (route) => {
    const headers = route.request().headers()
    const authorization = String(headers.authorization || '')
    const payload = route.request().postDataJSON() || {}

    if (!authorization.startsWith('Bearer ')) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 40101,
          message: '需要管理员权限',
        }),
      })
      return
    }

    if (
      !payload ||
      typeof payload.html !== 'string' ||
      !payload.html.includes('<!doctype html>') ||
      typeof payload.template_key !== 'string' ||
      Object.hasOwn(payload, 'base_url') ||
      Object.hasOwn(payload, 'customer_key')
    ) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 40053,
          message: '模板渲染请求不合法',
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      headers: {
        'Content-Disposition': `inline; filename="${payload.file_name || 'style-l1.pdf'}"`,
        'Cache-Control': 'no-store',
      },
      body: mockPdfBuffer,
    })
  })
}
