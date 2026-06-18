import { Buffer } from 'node:buffer'
import { setTimeout as delay } from 'node:timers/promises'

import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'
import { getNavigationSections } from '../../src/erp/config/seedData.mjs'

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

export async function installAdminRpcMocks(page, { baseURL = '' } = {}) {
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
  const adminProfile = {
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

  await page.route('**/rpc/masterdata', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const customer = {
      id: 1,
      code: 'CUS-STYLE-L1',
      name: '暗色客户',
      short_name: '暗色',
      tax_no: 'TAX-STYLE-L1',
      note: '',
      is_active: true,
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const supplier = {
      id: 1,
      code: 'SUP-STYLE-L1',
      name: '样式供应商',
      short_name: '样式供',
      supplier_type: '加工厂',
      tax_no: '',
      note: '',
      is_active: true,
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const contact = {
      id: 1,
      owner_type: params.owner_type || 'CUSTOMER',
      owner_id: Number(params.owner_id || 1),
      name: '样式联系人',
      mobile: '13800138000',
      phone: '',
      email: '',
      title: '业务',
      is_primary: true,
      is_active: true,
      note: '',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const productSKU = {
      id: 1,
      product_id: 1,
      sku_code: 'SKU-STYLE-L1',
      sku_name: '样式产品 SKU',
      barcode: '690000000001',
      customer_sku: 'CUS-SKU-STYLE',
      color: '米白',
      color_no: 'C01',
      size: 'M',
      packaging_version: '基础包装',
      default_unit_id: 1,
      is_active: true,
      note: '',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const product = {
      id: 1,
      code: 'PROD-STYLE-L1',
      name: '样式产品',
      style_no: 'BEAR-STYLE',
      customer_style_no: 'CUS-BEAR-STYLE',
      default_unit_id: 1,
      is_active: true,
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const material = {
      id: 1,
      code: 'MAT-STYLE-L1',
      name: '样式材料',
      category: '面料',
      spec: '短毛绒 300g',
      color: '米白',
      default_unit_id: 1,
      is_active: true,
      note: '',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const process = {
      id: 1,
      code: 'PROC-STYLE-L1',
      name: '车缝',
      category: '委外车缝',
      outsourcing_enabled: true,
      inhouse_enabled: true,
      quality_required: true,
      sort_order: 10,
      is_active: true,
      note: '',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const processes = [
      {
        ...process,
        id: 11,
        code: 'PROC-CHECKING-L1',
        name: '查货',
        category: '查货',
        quality_required: true,
        sort_order: 10,
      },
      {
        ...process,
        id: 12,
        code: 'PROC-HANDWORK-L1',
        name: '手工',
        category: '手工',
        quality_required: false,
        sort_order: 20,
      },
      {
        ...process,
        id: 1,
        code: 'PROC-SEWING-L1',
        name: '车缝',
        category: '车缝',
        quality_required: false,
        sort_order: 30,
      },
      {
        ...process,
        id: 13,
        code: 'PROC-PACKAGING-L1',
        name: '包装',
        category: '包装',
        quality_required: false,
        sort_order: 40,
      },
    ]
    const unit = {
      id: 1,
      code: 'PCS',
      name: '只',
      precision: 0,
      is_active: true,
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const warehouse = {
      id: 1,
      code: 'WH-STYLE-L1',
      name: '样式仓库',
      warehouse_type: 'RAW_MATERIAL',
      is_active: true,
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const materials = Array.from({ length: 6 }, (_, index) => ({
      ...material,
      id: index + 1,
      code: index === 0 ? material.code : `MAT-STYLE-L${index + 1}`,
      name: index === 0 ? material.name : `样式材料 ${index + 1}`,
      spec: index === 0 ? material.spec : `短毛绒 ${300 + index * 20}g`,
    }))

    let data = {}
    switch (method) {
      case 'list_customers':
        data = { customers: [customer], total: 1, limit: 100, offset: 0 }
        break
      case 'list_suppliers':
        data = { suppliers: [supplier], total: 1, limit: 100, offset: 0 }
        break
      case 'list_contacts_by_owner':
        data = { contacts: [contact], total: 1, limit: 100, offset: 0 }
        break
      case 'list_products':
        data = { products: [product], total: 1, limit: 100, offset: 0 }
        break
      case 'list_product_skus':
        data = { product_skus: [productSKU], total: 1, limit: 100, offset: 0 }
        break
      case 'list_processes':
        data = {
          processes,
          total: processes.length,
          limit: 100,
          offset: 0,
        }
        break
      case 'list_materials':
        data = {
          materials,
          total: materials.length,
          limit: 100,
          offset: 0,
        }
        break
      case 'list_units':
        data = { units: [unit], total: 1, limit: 100, offset: 0 }
        break
      case 'list_warehouses':
        data = {
          warehouses: [warehouse],
          total: 1,
          limit: 100,
          offset: 0,
        }
        break
      case 'create_customer':
      case 'update_customer':
      case 'set_customer_active':
      case 'get_customer':
        data = { customer: { ...customer, ...params } }
        break
      case 'create_supplier':
      case 'update_supplier':
      case 'set_supplier_active':
      case 'get_supplier':
        data = { supplier: { ...supplier, ...params } }
        break
      case 'create_contact':
      case 'update_contact':
      case 'set_primary_contact':
      case 'disable_contact':
        data = { contact: { ...contact, ...params } }
        break
      case 'create_product_sku':
      case 'update_product_sku':
      case 'set_product_sku_active':
      case 'get_product_sku':
        data = { product_sku: { ...productSKU, ...params } }
        break
      case 'create_material':
      case 'update_material':
      case 'set_material_active':
      case 'get_material':
        data = { material: { ...material, ...params } }
        break
      default:
        data = {}
        break
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

  await page.route('**/rpc/sales_order', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const salesOrder = {
      id: 1,
      order_no: 'SO-STYLE-L1',
      customer_id: 1,
      customer_snapshot: { id: 1, code: 'CUS-STYLE-L1', name: '暗色客户' },
      customer_order_no: 'PO-STYLE-L1',
      title: '样式销售订单',
      order_date: nowUnix(),
      expected_ship_date: nowUnix() + 86_400,
      lifecycle_status: 'draft',
      note: '',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const salesOrderItem = {
      id: 1,
      sales_order_id: 1,
      line_no: 1,
      product_id: 1,
      product_snapshot: { id: 1, code: 'PROD-STYLE-L1', name: '样式产品' },
      ordered_quantity: '10',
      unit_id: 1,
      unit_snapshot: { id: 1, code: 'PCS', name: '只' },
      unit_price: '12.50',
      amount: '125.00',
      line_status: 'open',
      note: '',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }

    let data = {}
    switch (method) {
      case 'list_sales_orders':
        data = { sales_orders: [salesOrder], total: 1, limit: 100, offset: 0 }
        break
      case 'list_sales_order_items':
        data = {
          sales_order_items: [salesOrderItem],
          total: 1,
          limit: 100,
          offset: 0,
        }
        break
      case 'create_sales_order':
      case 'update_sales_order':
      case 'get_sales_order':
      case 'submit_sales_order':
      case 'activate_sales_order':
      case 'close_sales_order':
      case 'cancel_sales_order':
        data = { sales_order: { ...salesOrder, ...params } }
        break
      case 'add_sales_order_item':
      case 'update_sales_order_item':
      case 'remove_sales_order_item':
        data = { sales_order_item: { ...salesOrderItem, ...params } }
        break
      default:
        data = {}
        break
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

  await page.route('**/rpc/purchase_order', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const purchaseOrder = {
      id: 1,
      purchase_order_no: 'PO-STYLE-L1',
      supplier_id: 1,
      supplier_snapshot: { id: 1, code: 'SUP-STYLE-L1', name: '样式供应商' },
      supplier_purchase_order_no: 'SUP-PO-STYLE',
      purchase_date: nowUnix(),
      expected_arrival_date: nowUnix() + 86_400 * 7,
      lifecycle_status: 'draft',
      note: '',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const purchaseOrderItem = {
      id: 1,
      purchase_order_id: 1,
      line_no: 1,
      material_id: 1,
      material_code_snapshot: 'MAT-STYLE-L1',
      material_name_snapshot: '样式材料',
      purchased_quantity: '20',
      unit_id: 1,
      unit_price: '3.50',
      amount: '70.00',
      expected_arrival_date: nowUnix() + 86_400 * 7,
      line_status: 'open',
      note: '',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }

    let data = {}
    switch (method) {
      case 'list_purchase_orders':
        data = {
          purchase_orders: [purchaseOrder],
          total: 1,
          limit: 100,
          offset: 0,
        }
        break
      case 'list_purchase_order_items':
        data = {
          purchase_order_items: [purchaseOrderItem],
          total: 1,
          limit: 100,
          offset: 0,
        }
        break
      case 'save_purchase_order_with_items':
        data = {
          purchase_order: { ...purchaseOrder, ...params },
          purchase_order_items: [purchaseOrderItem],
        }
        break
      case 'create_purchase_order':
      case 'update_purchase_order':
      case 'get_purchase_order':
      case 'submit_purchase_order':
      case 'approve_purchase_order':
      case 'close_purchase_order':
      case 'cancel_purchase_order':
        data = { purchase_order: { ...purchaseOrder, ...params } }
        break
      case 'add_purchase_order_item':
      case 'update_purchase_order_item':
      case 'remove_purchase_order_item':
        data = { purchase_order_item: { ...purchaseOrderItem, ...params } }
        break
      default:
        data = {}
        break
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

  await page.route('**/rpc/outsourcing_order', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const outsourcingOrder = {
      id: 1,
      outsourcing_order_no: 'SIM-OUTSOURCE-CONTRACT-L1',
      supplier_id: 1,
      supplier_snapshot: {
        id: 1,
        code: 'SUP-OUT-L1',
        short_name: '样式加工厂',
        name: '样式加工厂',
      },
      source_order_no: 'SO-STYLE-L1',
      source_sales_order_id: 1,
      order_date: nowUnix(),
      expected_return_date: nowUnix() + 86_400 * 7,
      lifecycle_status: 'draft',
      note: '样式加工合同',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const outsourcingOrderItem = {
      id: 1,
      outsourcing_order_id: 1,
      line_no: 1,
      product_id: 1,
      process_id: 1,
      unit_id: 1,
      product_no_snapshot: 'PROD-STYLE-L1',
      product_name_snapshot: '样式产品',
      process_name_snapshot: '车缝',
      process_category_snapshot: '委外车缝',
      unit_name_snapshot: '只',
      outsourcing_quantity: '20',
      unit_price: '1.80',
      amount: '36.00',
      expected_return_date: nowUnix() + 86_400 * 7,
      line_status: 'open',
      note: '样式加工明细',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }

    let data = {}
    switch (method) {
      case 'list_outsourcing_orders':
        data = {
          outsourcing_orders: [outsourcingOrder],
          total: 1,
          limit: 100,
          offset: 0,
        }
        break
      case 'list_outsourcing_order_items':
        data = {
          outsourcing_order_items: [outsourcingOrderItem],
          total: 1,
          limit: 100,
          offset: 0,
        }
        break
      case 'save_outsourcing_order_with_items':
        data = {
          outsourcing_order: { ...outsourcingOrder, ...params },
          outsourcing_order_items: [outsourcingOrderItem],
        }
        break
      case 'get_outsourcing_order':
        data = { outsourcing_order: { ...outsourcingOrder, ...params } }
        break
      case 'submit_outsourcing_order':
        data = {
          outsourcing_order: {
            ...outsourcingOrder,
            ...params,
            lifecycle_status: 'submitted',
          },
        }
        break
      case 'confirm_outsourcing_order':
        data = {
          outsourcing_order: {
            ...outsourcingOrder,
            ...params,
            lifecycle_status: 'confirmed',
          },
        }
        break
      case 'close_outsourcing_order':
        data = {
          outsourcing_order: {
            ...outsourcingOrder,
            ...params,
            lifecycle_status: 'closed',
          },
        }
        break
      case 'cancel_outsourcing_order':
        data = {
          outsourcing_order: {
            ...outsourcingOrder,
            ...params,
            lifecycle_status: 'canceled',
          },
        }
        break
      default:
        data = {}
        break
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

  await page.route('**/rpc/bom', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const bomVersion = {
      id: 1,
      product_id: 1,
      version: 'BOM-STYLE-L1',
      status: 'ACTIVE',
      effective_from: nowUnix(),
      effective_to: null,
      note: '样式回归 BOM',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const bomDraft = {
      ...bomVersion,
      id: 2,
      version: params.version || 'BOM-STYLE-DRAFT',
      status: 'DRAFT',
      note: params.note || '',
    }
    const bomItem = {
      id: 1,
      bom_header_id: 1,
      material_id: 1,
      quantity: '2.5000',
      unit_id: 1,
      loss_rate: '0.0300',
      position: '面料',
      note: '主料',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }

    let data = {}
    switch (method) {
      case 'list_bom_versions':
        data = {
          bom_versions: [bomVersion, bomDraft],
          total: 2,
          limit: 100,
          offset: 0,
        }
        break
      case 'get_bom_version':
        data = { bom_version: bomVersion, bom_items: [bomItem] }
        break
      case 'create_bom_draft':
      case 'update_bom_draft':
      case 'copy_bom_version':
        data = { bom_version: { ...bomDraft, ...params }, bom_items: [bomItem] }
        break
      case 'add_bom_item':
      case 'update_bom_item':
        data = { bom_item: { ...bomItem, ...params } }
        break
      case 'delete_bom_item':
        data = {}
        break
      case 'activate_bom_version':
        data = {
          bom_version: { ...bomDraft, status: 'ACTIVE' },
          bom_items: [bomItem],
        }
        break
      case 'archive_bom_version':
        data = { bom_version: { ...bomVersion, status: 'ARCHIVED' } }
        break
      default:
        data = {}
        break
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

  await page.route('**/rpc/operational_fact', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const shipmentItem = {
      id: 1,
      shipment_id: 1,
      sales_order_item_id: 1,
      product_id: 1,
      warehouse_id: 1,
      unit_id: 1,
      lot_id: 1,
      quantity: '10',
      note: '样式出货明细',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const shipment = {
      id: 1,
      shipment_no: 'SHIP-STYLE-L1',
      status: 'DRAFT',
      sales_order_id: 1,
      customer_id: 1,
      customer_snapshot: '暗色客户',
      planned_ship_at: nowUnix() + 86_400,
      shipped_at: null,
      note: '样式回归出货单',
      items: [shipmentItem],
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const productionFact = {
      id: 1,
      fact_no: 'PROD-FACT-L1',
      fact_type: 'FINISHED_GOODS_RECEIPT',
      status: 'DRAFT',
      subject_type: 'PRODUCT',
      subject_id: 1,
      warehouse_id: 1,
      unit_id: 1,
      lot_id: 1,
      quantity: '6',
      source_type: 'PRODUCTION_PROGRESS',
      source_id: 1,
      source_line_id: null,
      idempotency_key: 'PROD-FACT-L1',
      occurred_at: nowUnix(),
      note: '样式生产事实',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const outsourcingFact = {
      id: 1,
      fact_no: 'OUTSOURCE-FACT-L1',
      fact_type: 'RETURN_RECEIPT',
      status: 'DRAFT',
      subject_type: 'MATERIAL',
      subject_id: 1,
      warehouse_id: 1,
      unit_id: 1,
      lot_id: 1,
      quantity: '8',
      supplier_id: 1,
      supplier_name: '样式供应商',
      source_type: 'OUTSOURCING_ORDER',
      source_id: 1,
      source_line_id: null,
      idempotency_key: 'OUTSOURCE-FACT-L1',
      occurred_at: nowUnix(),
      note: '样式委外事实',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const stockReservation = {
      id: 1,
      reservation_no: 'RSV-STYLE-L1',
      status: 'ACTIVE',
      sales_order_id: 1,
      sales_order_item_id: 1,
      product_id: 1,
      warehouse_id: 1,
      unit_id: 1,
      lot_id: 1,
      quantity: '4',
      idempotency_key: 'RSV-STYLE-L1',
      reserved_at: nowUnix(),
      note: '样式库存预留',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const financeFactType = String(params.fact_type || 'RECEIVABLE')
      .trim()
      .toUpperCase()
    const financeFactNoByType = {
      RECEIVABLE: 'AR-STYLE-L1',
      PAYABLE: 'AP-STYLE-L1',
      INVOICE: 'INV-STYLE-L1',
      RECONCILIATION: 'REC-STYLE-L1',
      PAYMENT: 'PAY-STYLE-L1',
    }
    const financeFact = {
      id: 1,
      fact_no: financeFactNoByType[financeFactType] || 'FIN-STYLE-L1',
      fact_type: financeFactType,
      status: 'POSTED',
      counterparty_type:
        financeFactType === 'PAYABLE'
          ? 'SUPPLIER'
          : financeFactType === 'RECONCILIATION'
            ? 'OTHER'
            : 'CUSTOMER',
      counterparty_id: 1,
      amount: '1200',
      currency: 'CNY',
      source_type: financeFactType === 'PAYABLE' ? 'PURCHASE' : 'SHIPMENT',
      source_id: 1,
      source_line_id: null,
      idempotency_key: financeFactNoByType[financeFactType] || 'FIN-STYLE-L1',
      occurred_at: nowUnix(),
      note: '样式财务事实',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }

    let data = {}
    switch (method) {
      case 'list_production_facts':
        data = {
          production_facts: [productionFact],
          total: 1,
          limit: 100,
          offset: 0,
        }
        break
      case 'create_production_fact':
        data = {
          production_fact: { ...productionFact, id: 2, ...params },
        }
        break
      case 'post_production_fact':
        data = {
          production_fact: { ...productionFact, status: 'POSTED' },
        }
        break
      case 'cancel_production_fact':
        data = {
          production_fact: { ...productionFact, status: 'CANCELLED' },
        }
        break
      case 'list_outsourcing_facts':
        data = {
          outsourcing_facts: [outsourcingFact],
          total: 1,
          limit: 100,
          offset: 0,
        }
        break
      case 'create_outsourcing_fact':
        data = {
          outsourcing_fact: { ...outsourcingFact, id: 2, ...params },
        }
        break
      case 'post_outsourcing_fact':
        data = {
          outsourcing_fact: { ...outsourcingFact, status: 'POSTED' },
        }
        break
      case 'cancel_outsourcing_fact':
        data = {
          outsourcing_fact: { ...outsourcingFact, status: 'CANCELLED' },
        }
        break
      case 'list_shipments':
        data = { shipments: [shipment], total: 1, limit: 100, offset: 0 }
        break
      case 'create_shipment':
        data = { shipment: { ...shipment, id: 2, ...params, items: [] } }
        break
      case 'add_shipment_item':
        data = { shipment_item: { ...shipmentItem, ...params } }
        break
      case 'ship_shipment':
        data = { shipment: { ...shipment, status: 'SHIPPED' } }
        break
      case 'cancel_shipment':
        data = { shipment: { ...shipment, status: 'CANCELLED' } }
        break
      case 'list_stock_reservations':
        data = {
          stock_reservations: [stockReservation],
          total: 1,
          limit: 100,
          offset: 0,
        }
        break
      case 'create_stock_reservation':
        data = {
          stock_reservation: { ...stockReservation, id: 2, ...params },
        }
        break
      case 'release_stock_reservation':
        data = {
          stock_reservation: { ...stockReservation, status: 'RELEASED' },
        }
        break
      case 'consume_stock_reservation':
        data = {
          stock_reservation: { ...stockReservation, status: 'CONSUMED' },
        }
        break
      case 'list_finance_facts':
        data = { finance_facts: [financeFact], total: 1, limit: 100, offset: 0 }
        break
      case 'create_finance_fact':
        data = { finance_fact: { ...financeFact, id: 2, ...params } }
        break
      case 'post_finance_fact':
        data = { finance_fact: { ...financeFact, status: 'POSTED' } }
        break
      case 'settle_finance_fact':
        data = { finance_fact: { ...financeFact, status: 'SETTLED' } }
        break
      case 'cancel_finance_fact':
        data = { finance_fact: { ...financeFact, status: 'CANCELLED' } }
        break
      default:
        data = {}
        break
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

  const purchaseReceiptItem = {
    id: 602,
    purchase_receipt_id: 601,
    source_line_no: '入库行 1',
    material_id: 1,
    material_name_snapshot: '样式材料',
    warehouse_id: 1,
    warehouse_name: '样式仓库',
    unit_id: 1,
    quantity: '20',
    lot_id: 401,
    lot_no: 'INV-LOT-001',
    unit_price: '3.50',
    amount: '70.00',
    note: '样式入库明细',
    created_at: nowUnix(),
    updated_at: nowUnix(),
  }
  let nextPurchaseReceiptId = 700
  let nextPurchaseReceiptItemId = 800
  const purchaseReceipts = [
    {
      id: 601,
      receipt_no: 'PR-STYLE-L1',
      supplier_name: '样式供应商',
      warehouse_id: 1,
      received_at: nowUnix(),
      status: 'POSTED',
      note: '样式采购入库',
      items: [purchaseReceiptItem],
      created_at: nowUnix(),
      updated_at: nowUnix(),
    },
    {
      id: 603,
      receipt_no: 'PR-STYLE-L1-DRAFT',
      supplier_name: '样式草稿供应商',
      warehouse_id: 1,
      received_at: nowUnix(),
      status: 'DRAFT',
      note: '样式草稿采购入库',
      items: [
        {
          ...purchaseReceiptItem,
          id: 604,
          purchase_receipt_id: 603,
          source_line_no: '草稿入库行 1',
          quantity: '12',
          amount: '42.00',
          note: '样式草稿入库明细',
        },
      ],
      created_at: nowUnix(),
      updated_at: nowUnix(),
    },
    {
      id: 605,
      receipt_no: 'PR-STYLE-L1-CANCELLED',
      supplier_name: '样式取消供应商',
      warehouse_id: 1,
      received_at: nowUnix(),
      status: 'CANCELLED',
      note: '样式取消采购入库',
      items: [],
      created_at: nowUnix(),
      updated_at: nowUnix(),
    },
  ]

  await page.route('**/rpc/purchase', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body

    const filteredPurchaseReceipts = () => {
      const status = String(params.status || '').trim()
      const keyword = String(params.keyword || '')
        .trim()
        .toLowerCase()
      return purchaseReceipts.filter((receipt) => {
        if (status && receipt.status !== status) return false
        if (!keyword) return true
        return [receipt.receipt_no, receipt.supplier_name]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword))
      })
    }

    let data = {}
    switch (method) {
      case 'list_purchase_receipts':
        {
          const rows = filteredPurchaseReceipts()
          const offset = Number(params.offset || 0)
          const limit = Number(params.limit || rows.length || 100)
          data = {
            purchase_receipts: rows.slice(offset, offset + limit),
            total: rows.length,
            limit,
            offset,
          }
        }
        break
      case 'create_purchase_receipt_with_items':
        {
          const receiptId = nextPurchaseReceiptId
          nextPurchaseReceiptId += 1
          const receipt = {
            ...purchaseReceipts[0],
            ...params,
            id: receiptId,
            status: 'DRAFT',
            items: Array.isArray(params.items)
              ? params.items.map((item) => {
                  const itemId = nextPurchaseReceiptItemId
                  nextPurchaseReceiptItemId += 1
                  return {
                    ...purchaseReceiptItem,
                    ...item,
                    id: itemId,
                    purchase_receipt_id: receiptId,
                  }
                })
              : [],
            created_at: nowUnix(),
            updated_at: nowUnix(),
          }
          purchaseReceipts.unshift(receipt)
          data = { purchase_receipt: receipt }
        }
        break
      case 'create_purchase_receipt_draft':
        data = {
          purchase_receipt: {
            ...purchaseReceipts[0],
            ...params,
            id: nextPurchaseReceiptId,
            status: 'DRAFT',
            items: [],
          },
        }
        nextPurchaseReceiptId += 1
        break
      case 'post_purchase_receipt':
        {
          const receipt = purchaseReceipts.find(
            (item) => Number(item.id) === Number(params.id)
          )
          if (receipt) receipt.status = 'POSTED'
          data = {
            purchase_receipt: receipt || { ...purchaseReceipts[0], ...params },
          }
        }
        break
      case 'cancel_purchase_receipt':
        {
          const receipt = purchaseReceipts.find(
            (item) => Number(item.id) === Number(params.id)
          )
          if (receipt) receipt.status = 'CANCELLED'
          data = {
            purchase_receipt: receipt || { ...purchaseReceipts[0], ...params },
          }
        }
        break
      case 'get_purchase_receipt':
        data = {
          purchase_receipt:
            purchaseReceipts.find(
              (item) => Number(item.id) === Number(params.id)
            ) || purchaseReceipts[0],
        }
        break
      case 'add_purchase_receipt_item':
        {
          const receipt = purchaseReceipts.find(
            (item) =>
              Number(item.id) ===
              Number(params.receipt_id || params.purchase_receipt_id)
          )
          const item = {
            ...purchaseReceiptItem,
            ...params,
            purchase_receipt_id: Number(
              params.receipt_id || params.purchase_receipt_id
            ),
            id: nextPurchaseReceiptItemId,
            created_at: nowUnix(),
            updated_at: nowUnix(),
          }
          nextPurchaseReceiptItemId += 1
          if (receipt) {
            receipt.items = [...(receipt.items || []), item]
            receipt.updated_at = nowUnix()
          }
          data = { purchase_receipt_item: item }
        }
        break
      default:
        data = {}
        break
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

  await page.route('**/rpc/quality', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const qualityInspection = {
      id: 701,
      inspection_no: 'QI-STYLE-L1',
      purchase_receipt_id: 601,
      purchase_receipt_item_id: 602,
      inventory_lot_id: 401,
      material_id: 1,
      warehouse_id: 1,
      status: 'SUBMITTED',
      result: '',
      original_lot_status: 'HOLD',
      inspected_at: 0,
      inspector_id: null,
      decision_note: '等待品质判定',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }

    let data = {}
    switch (method) {
      case 'list_quality_inspections':
        data = {
          quality_inspections: [qualityInspection],
          total: 1,
          limit: 100,
          offset: 0,
        }
        break
      case 'create_quality_inspection_draft':
        data = {
          quality_inspection: {
            ...qualityInspection,
            ...params,
            id: 702,
            status: 'DRAFT',
            result: '',
          },
        }
        break
      case 'submit_quality_inspection':
      case 'pass_quality_inspection':
      case 'reject_quality_inspection':
      case 'cancel_quality_inspection':
      case 'get_quality_inspection':
        data = { quality_inspection: { ...qualityInspection, ...params } }
        break
      default:
        data = {}
        break
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

  await page.route('**/rpc/inventory', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method } = body
    const inventoryBalance = {
      id: 301,
      subject_type: 'PRODUCT',
      subject_id: 1,
      warehouse_id: 1,
      lot_id: 401,
      unit_id: 1,
      quantity: '12.5',
      active_reserved_quantity: '4',
      available_quantity: '8.5',
      updated_at: nowUnix(),
    }
    const inventoryLot = {
      id: 401,
      subject_type: 'MATERIAL',
      subject_id: 1,
      lot_no: 'INV-LOT-001',
      supplier_lot_no: 'SUP-LOT-001',
      color_no: 'C01',
      dye_lot_no: 'DYE-01',
      production_lot_no: '',
      status: 'HOLD',
      received_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const inventoryTxn = {
      id: 501,
      txn_type: 'REVERSAL',
      direction: -1,
      subject_type: 'MATERIAL',
      subject_id: 1,
      warehouse_id: 1,
      lot_id: 401,
      quantity: '1.5',
      unit_id: 1,
      source_type: 'MANUAL_SEED',
      source_id: 9001,
      source_line_id: 9002,
      reversal_of_txn_id: 500,
      idempotency_key: 'INV-TXN-001',
      note: 'ledger seed',
      occurred_at: nowUnix(),
      created_at: nowUnix(),
    }

    let data = {}
    switch (method) {
      case 'list_inventory_balances':
      case 'listInventoryBalances':
        data = {
          inventory_balances: [inventoryBalance],
          total: 1,
          limit: 100,
          offset: 0,
        }
        break
      case 'list_inventory_lots':
      case 'listInventoryLots':
        data = {
          inventory_lots: [inventoryLot],
          total: 1,
          limit: 100,
          offset: 0,
        }
        break
      case 'list_inventory_txns':
      case 'listInventoryTxns':
        data = {
          inventory_txns: [inventoryTxn],
          total: 1,
          limit: 100,
          offset: 0,
        }
        break
      default:
        data = {}
        break
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

  const workflowTasks = []
  const workflowBusinessStates = []
  let workflowTaskID = 1
  let workflowBusinessStateID = 1
  await page.route('**/rpc/business', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method } = body

    let data = {}
    switch (method) {
      case 'dashboard_stats':
        data = { modules: [] }
        break
      default:
        data = {}
        break
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

  await page.route('**/rpc/workflow', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body

    let data = {}
    switch (method) {
      case 'list_business_states':
        data = {
          business_states: workflowBusinessStates.filter(
            (item) =>
              !params.source_type || item.source_type === params.source_type
          ),
          total: workflowBusinessStates.length,
          limit: Number(params.limit || 50),
          offset: Number(params.offset || 0),
        }
        break
      case 'upsert_business_state': {
        const existing = workflowBusinessStates.find(
          (item) =>
            item.source_type === params.source_type &&
            Number(item.source_id) === Number(params.source_id)
        )
        const businessState = {
          id: existing?.id || workflowBusinessStateID++,
          source_type: params.source_type,
          source_id: Number(params.source_id || Date.now()),
          source_no: params.source_no || '',
          business_status_key: params.business_status_key || 'project_pending',
          owner_role_key: params.owner_role_key || 'business',
          blocked_reason: params.blocked_reason || '',
          payload: params.payload || {},
          status_changed_at: nowUnix(),
          created_at: existing?.created_at || nowUnix(),
          updated_at: nowUnix(),
        }
        if (existing) {
          Object.assign(existing, businessState)
        } else {
          workflowBusinessStates.unshift(businessState)
        }
        data = { business_state: existing || businessState }
        break
      }
      case 'list_tasks': {
        const tasks = workflowTasks.filter(
          (item) =>
            (!params.source_type || item.source_type === params.source_type) &&
            (!params.source_id ||
              Number(item.source_id) === Number(params.source_id))
        )
        data = {
          tasks,
          total: tasks.length,
          limit: Number(params.limit || 50),
          offset: Number(params.offset || 0),
        }
        break
      }
      case 'create_task': {
        const task = {
          id: workflowTaskID++,
          task_code: params.task_code || `style-l1-task-${Date.now()}`,
          task_group: params.task_group || 'project-orders',
          task_name: params.task_name || '订单/款式立项 跟进',
          source_type: params.source_type || 'project-orders',
          source_id: Number(params.source_id || Date.now()),
          source_no: params.source_no || '',
          business_status_key: params.business_status_key || 'project_pending',
          task_status_key: params.task_status_key || 'ready',
          owner_role_key: params.owner_role_key || 'business',
          assignee_id: params.assignee_id || '',
          priority: Number(params.priority || 0),
          due_at: params.due_at || null,
          blocked_reason: params.blocked_reason || '',
          payload: params.payload || {},
          created_at: nowUnix(),
          updated_at: nowUnix(),
        }
        workflowTasks.unshift(task)
        data = { task }
        break
      }
      case 'update_task_status': {
        const task = workflowTasks.find(
          (item) => Number(item.id) === Number(params.id)
        )
        if (task) {
          task.task_status_key = params.task_status_key || task.task_status_key
          task.business_status_key =
            params.business_status_key || task.business_status_key
          task.blocked_reason = params.reason || task.blocked_reason
          task.updated_at = nowUnix()
        }
        data = { task }
        break
      }
      default:
        data = {}
        break
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
