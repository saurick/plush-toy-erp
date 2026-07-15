import { setTimeout as delay } from 'node:timers/promises'
import { styleRpcResult, unsupportedRpcMethod } from './rpcMockResult.mjs'

export async function installSystemRpcMocks(page, context) {
  const {
    adminProfile,
    salesRole,
    adminRole,
    mockMenus,
    mockPermissions,
    baseURL,
    mockPdfBuffer,
    resolveDelayFromReferer,
    createMockAdminToken,
    nowUnix,
  } = context

  const assistantAdmin = {
    id: 2,
    username: 'assistant-admin',
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
          admins: [adminProfile, { ...assistantAdmin }],
        }
        break
      case 'create':
      case 'set_roles':
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
      case 'set_role_permissions':
        data = {
          role: {
            ...salesRole,
            role_key: params.role_key || salesRole.role_key,
            permissions: Array.isArray(params.permission_keys)
              ? params.permission_keys
              : salesRole.permissions,
          },
        }
        break
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
          roles: [salesRole, adminRole],
          permissions: mockPermissions,
          menus: mockMenus,
          role_options: [salesRole, adminRole],
          permission_options: mockPermissions,
          menu_options: mockMenus,
        }
        break
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
