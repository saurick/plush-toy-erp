import { setTimeout as delay } from 'node:timers/promises'

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
  } = context

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
            {
              id: 2,
              username: 'assistant-admin',
              phone: '13900139000',
              is_super_admin: false,
              disabled: false,
              roles: [salesRole],
              permissions: salesRole.permissions,
              menus: mockMenus.filter((item) => item.path === '/erp/dashboard'),
            },
          ],
        }
        break
      case 'create':
      case 'set_roles':
      case 'set_disabled':
      case 'reset_password':
        data = {
          admin: {
            id: Number(params.id || 2),
            username: params.username || 'assistant-admin',
            phone: params.phone || '13900139000',
            is_super_admin: false,
            disabled: Boolean(params.disabled),
            roles: Array.isArray(params.role_keys)
              ? params.role_keys.map((roleKey) => ({
                  role_key: roleKey,
                  name: roleKey,
                }))
              : [salesRole],
            permissions: salesRole.permissions,
            menus: mockMenus.filter((item) => item.path === '/erp/dashboard'),
          },
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
      default:
        data = {}
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
        result: {
          code: 0,
          message: 'OK',
          data,
        },
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

    await route.fallback()
  })

  await page.route('**/rpc/debug', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id' } = body

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
      String(payload.base_url || '').trim() !== baseURL
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
