import assert from 'node:assert/strict'
import test from 'node:test'

import { RpcErrorCode } from '../../common/consts/errorCodes.js'
import {
  attachEffectiveSessionToAdminProfile,
  attachUnavailableEffectiveSessionToAdminProfile,
  applyEffectiveFieldPolicyFlags,
  buildEffectiveSessionDiagnosticSummary,
  effectiveSessionAllowsAction,
  effectiveSessionAllowsPage,
  filterColumnsByEffectiveFieldPolicy,
  filterNavigationSectionsByAdminProfile,
  getEffectiveFieldPolicy,
  getEffectivePrintTemplateDefaults,
  getAdminProfileSyncErrorAction,
  hasEffectiveSessionAction,
  resolveDefaultFieldPolicySurface,
  resolveEffectiveSessionCustomerKey,
  resolveEffectiveSessionPageAccess,
  shouldRedirectFromCurrentNavigation,
} from './adminProfileSync.mjs'

test('adminProfileSync: 当前管理员会话不可用时要求重新登录', () => {
  for (const code of [
    RpcErrorCode.HTTP_UNAUTHORIZED,
    RpcErrorCode.ADMIN_REQUIRED,
    RpcErrorCode.ADMIN_DISABLED,
    RpcErrorCode.ADMIN_NOT_FOUND,
    RpcErrorCode.AUTH_CURRENT_USER_FAILED,
  ]) {
    assert.equal(getAdminProfileSyncErrorAction({ code }), 'reauth')
  }
})

test('adminProfileSync: 有缓存 profile 时后台同步失败不打扰用户', () => {
  assert.equal(
    getAdminProfileSyncErrorAction(
      { code: RpcErrorCode.INTERNAL },
      { hasCachedProfile: true }
    ),
    'keep_cached'
  )
  assert.equal(
    getAdminProfileSyncErrorAction(
      { isNetworkError: true },
      { hasCachedProfile: true }
    ),
    'keep_cached'
  )
})

test('adminProfileSync: 没有缓存 profile 时普通失败最多提示一次', () => {
  assert.equal(
    getAdminProfileSyncErrorAction(
      { code: RpcErrorCode.INTERNAL },
      { hasCachedProfile: false, alreadyNotified: false }
    ),
    'notify'
  )
  assert.equal(
    getAdminProfileSyncErrorAction(
      { code: RpcErrorCode.INTERNAL },
      { hasCachedProfile: false, alreadyNotified: true }
    ),
    'silent'
  )
})

test('adminProfileSync: effective session 作为当前 profile 投影，不覆盖 RBAC 基础字段', () => {
  const profile = {
    id: 1,
    username: 'admin',
    permissions: ['system.user.read'],
    menus: [{ key: 'global-dashboard', path: '/erp/dashboard' }],
  }
  const next = attachEffectiveSessionToAdminProfile(profile, {
    configRevision: '2026.06.28.1',
    configHash: 'hash',
    customer: { key: 'yoyoosun', name: '永绅' },
    modules: { sales_orders: 'enabled' },
    roles: ['admin'],
    pages: ['global-dashboard'],
    actions: ['customer_config.read'],
    workPools: ['admin'],
    fieldPolicies: { 'sales_order.form': { cost_price: { visible: false } } },
    printTemplateDefaults: {
      templates: [
        {
          template_key: 'material-purchase-contract',
          party_defaults: {
            buyerCompany: '永绅',
          },
          supplier_defaults_allowed: false,
        },
      ],
    },
    source: 'active_customer_config_revision',
  })

  assert.deepEqual(next.permissions, ['system.user.read'])
  assert.deepEqual(next.menus, [
    { key: 'global-dashboard', path: '/erp/dashboard' },
  ])
  assert.equal(next.effective_session.config_revision, '2026.06.28.1')
  assert.equal(next.effective_session.customer.name, '永绅')
  assert.deepEqual(next.effective_session.work_pools, ['admin'])
  assert.equal(effectiveSessionAllowsPage(next, 'global-dashboard'), true)
  assert.equal(effectiveSessionAllowsPage(next, 'permission-center'), false)
  assert.equal(hasEffectiveSessionAction(next, 'customer_config.read'), true)
  assert.equal(
    hasEffectiveSessionAction(next, 'customer_config.publish'),
    false
  )
  assert.equal(effectiveSessionAllowsAction(next, 'customer_config.read'), true)
  assert.equal(
    effectiveSessionAllowsAction(next, 'customer_config.publish'),
    false
  )
  assert.deepEqual(
    getEffectiveFieldPolicy(next, 'sales_order.form', 'cost_price'),
    { visible: false }
  )
  assert.deepEqual(
    getEffectivePrintTemplateDefaults(next, 'material-purchase-contract'),
    {
      templates: [
        {
          template_key: 'material-purchase-contract',
          party_defaults: {
            buyerCompany: '永绅',
          },
          supplier_defaults_allowed: false,
        },
      ],
    }
  )
})

test('adminProfileSync: effective session customer key 不 fallback 到种子客户', () => {
  assert.equal(
    resolveEffectiveSessionCustomerKey({ customerKey: ' demo ' }),
    'demo'
  )
  assert.equal(resolveEffectiveSessionCustomerKey({ customerKey: '' }), '')
  assert.equal(resolveEffectiveSessionCustomerKey({}), '')
  assert.equal(resolveEffectiveSessionCustomerKey(null), '')
})

test('adminProfileSync: 打印默认值只从 effective session 投影读取', () => {
  const adminProfile = {
    effective_session: {
      print_template_defaults: {
        templates: [
          {
            template_key: 'material-purchase-contract',
            party_defaults: {
              buyerCompany: '客户配置买方公司',
              supplierName: '不应透出',
            },
            supplier_defaults_allowed: false,
          },
          {
            template_key: 'processing-contract',
            party_defaults: {
              buyerCompany: '加工合同买方',
            },
            supplier_defaults_allowed: true,
          },
        ],
      },
    },
  }

  assert.deepEqual(
    getEffectivePrintTemplateDefaults(
      adminProfile,
      'material-purchase-contract'
    ),
    {
      templates: [
        {
          template_key: 'material-purchase-contract',
          party_defaults: {
            buyerCompany: '客户配置买方公司',
          },
          supplier_defaults_allowed: false,
        },
      ],
    }
  )
  assert.deepEqual(
    getEffectivePrintTemplateDefaults(adminProfile, 'processing-contract'),
    {}
  )
})

test('adminProfileSync: 生成脱敏 effective session 诊断摘要', () => {
  const profile = attachEffectiveSessionToAdminProfile(
    {
      id: 1,
      username: 'admin',
      is_super_admin: false,
      permissions: ['sales_order.create'],
      menus: [{ key: 'global-dashboard', path: '/erp/dashboard' }],
    },
    {
      configRevision: 'yoyoosun-customer-package-v1',
      configHash: 'hash-must-not-leak',
      customer: { key: 'yoyoosun', name: '永绅' },
      modules: { sales_orders: 'enabled', shipments: 'disabled' },
      roles: ['sales'],
      pages: ['global-dashboard', 'sales-orders'],
      actions: ['sales_order.create', 'workflow.task.read'],
      workPools: ['sales_order_acceptance'],
      fieldPolicies: {
        'sales_orders.default': {
          source_no: { visible: true },
          internal_note: { visible: false },
        },
      },
      source: 'active_customer_config_revision',
    }
  )

  const summary = buildEffectiveSessionDiagnosticSummary({
    adminProfile: profile,
    allowedMenuPaths: ['/erp/dashboard'],
    visibleSections: [
      {
        title: '看板',
        items: [{ key: 'global-dashboard', path: '/erp/dashboard' }],
      },
    ],
    isLocalDev: false,
  })

  assert.deepEqual(summary, {
    source: 'active_customer_config_revision',
    customerKey: 'yoyoosun',
    configRevision: 'yoyoosun-customer-package-v1',
    projectionMode: 'formal_effective_session_projection',
    isSuperAdmin: false,
    isLocalDev: false,
    counts: {
      rbacMenuPaths: 1,
      visibleMenuItems: 1,
      pages: 2,
      actions: 2,
      roles: 1,
      workPools: 1,
      modules: 2,
      fieldPolicySurfaces: 1,
      fieldPolicyFields: 2,
      hiddenFieldPolicies: 1,
    },
    blockers: [],
  })
  assert.equal(JSON.stringify(summary).includes('hash-must-not-leak'), false)
  assert.equal(JSON.stringify(summary).includes('sales_order.create'), false)
})

test('adminProfileSync: 诊断摘要区分 super admin 看全和 sync failure 空投影', () => {
  const syncFailed = attachUnavailableEffectiveSessionToAdminProfile({
    id: 1,
    username: 'admin',
    menus: [{ key: 'global-dashboard', path: '/erp/dashboard' }],
  })

  assert.deepEqual(
    buildEffectiveSessionDiagnosticSummary({
      adminProfile: syncFailed,
      allowedMenuPaths: ['/erp/dashboard'],
      visibleSections: [],
      isLocalDev: true,
    }),
    {
      source: 'effective_session_sync_failed',
      customerKey: '',
      configRevision: '',
      projectionMode: 'local_dev_sync_failed_diagnostic',
      isSuperAdmin: false,
      isLocalDev: true,
      counts: {
        rbacMenuPaths: 1,
        visibleMenuItems: 0,
        pages: 0,
        actions: 0,
        roles: 0,
        workPools: 0,
        modules: 0,
        fieldPolicySurfaces: 0,
        fieldPolicyFields: 0,
        hiddenFieldPolicies: 0,
      },
      blockers: [
        'effective_session_sync_failed',
        'effective_session_pages_empty',
        'no_visible_menu_items',
      ],
    }
  )

  const superAdminSummary = buildEffectiveSessionDiagnosticSummary({
    adminProfile: syncFailed,
    allowedMenuPaths: [],
    visibleSections: [],
    isSuperAdmin: true,
    isLocalDev: false,
  })
  assert.equal(superAdminSummary.projectionMode, 'super_admin_product_core')
  assert.equal(
    superAdminSummary.blockers.includes('no_visible_menu_items'),
    false
  )
})

test('adminProfileSync: effective session 同步失败时正式普通账号不按 RBAC 放开页面', () => {
  const profile = {
    id: 1,
    username: 'admin',
    menus: [
      { key: 'global-dashboard', path: '/erp/dashboard' },
      { key: 'permission-center', path: '/erp/system/permissions' },
    ],
  }
  const unavailable = attachUnavailableEffectiveSessionToAdminProfile(profile)

  assert.equal(
    unavailable.effective_session.source,
    'effective_session_sync_failed'
  )
  assert.deepEqual(unavailable.effective_session.pages, [])
  assert.equal(
    effectiveSessionAllowsPage(unavailable, 'global-dashboard'),
    false
  )
  assert.equal(
    effectiveSessionAllowsAction(unavailable, 'sales_order.create'),
    false
  )
  assert.deepEqual(
    filterNavigationSectionsByAdminProfile({
      navigationSections: [
        {
          title: '主路径',
          items: [
            { key: 'global-dashboard', path: '/erp/dashboard' },
            { key: 'permission-center', path: '/erp/system/permissions' },
          ],
        },
      ],
      adminProfile: unavailable,
      allowedMenuPaths: ['/erp/dashboard', '/erp/system/permissions'],
      isLocalDev: false,
    }),
    []
  )
  assert.equal(
    shouldRedirectFromCurrentNavigation({
      adminProfile: unavailable,
      allowedMenuPaths: ['/erp/dashboard'],
      isLocalDev: false,
      currentMenuPath: '/erp/dashboard',
      currentPageKey: 'global-dashboard',
    }),
    true
  )
})

test('adminProfileSync: sync failure 下普通本地开发可诊断，super admin 可看产品核心入口', () => {
  const profile = {
    id: 1,
    username: 'admin',
    menus: [
      { key: 'global-dashboard', path: '/erp/dashboard' },
      { key: 'permission-center', path: '/erp/system/permissions' },
    ],
  }
  const unavailable = attachUnavailableEffectiveSessionToAdminProfile(profile)
  const navigationSections = [
    {
      title: '主路径',
      items: [
        { key: 'global-dashboard', path: '/erp/dashboard' },
        { key: 'permission-center', path: '/erp/system/permissions' },
      ],
    },
  ]

  assert.deepEqual(
    resolveEffectiveSessionPageAccess(unavailable, 'global-dashboard', {
      isLocalDev: true,
    }),
    { allowed: true, reason: 'local_dev_sync_failed_diagnostic' }
  )
  assert.deepEqual(
    resolveEffectiveSessionPageAccess(unavailable, 'global-dashboard', {
      isSuperAdmin: true,
      isLocalDev: false,
    }),
    { allowed: true, reason: 'super_admin_product_core' }
  )
  assert.deepEqual(
    filterNavigationSectionsByAdminProfile({
      navigationSections,
      adminProfile: unavailable,
      allowedMenuPaths: ['/erp/dashboard', '/erp/system/permissions'],
      isLocalDev: true,
    }),
    []
  )
  assert.deepEqual(
    filterNavigationSectionsByAdminProfile({
      navigationSections,
      adminProfile: unavailable,
      allowedMenuPaths: [],
      isSuperAdmin: true,
      isLocalDev: false,
    }),
    navigationSections
  )
  assert.equal(
    shouldRedirectFromCurrentNavigation({
      adminProfile: unavailable,
      allowedMenuPaths: ['/erp/system/permissions'],
      isLocalDev: true,
      currentMenuPath: '/erp/system/permissions',
      currentPageKey: 'permission-center',
    }),
    false
  )
  assert.equal(
    effectiveSessionAllowsAction(unavailable, 'sales_order.create'),
    false
  )
  assert.equal(
    hasEffectiveSessionAction(unavailable, 'workflow.task.complete'),
    false
  )
})

test('adminProfileSync: super admin 可审阅全部前端业务动作，普通账号仍按投影收窄', () => {
  const syncFailedProfile = attachUnavailableEffectiveSessionToAdminProfile({
    id: 1,
    username: 'admin',
    is_super_admin: true,
    permissions: ['sales_order.create', 'workflow.task.complete'],
    menus: [
      { key: 'global-dashboard', path: '/erp/dashboard' },
      { key: 'permission-center', path: '/erp/system/permissions' },
    ],
  })
  const activeProfile = attachEffectiveSessionToAdminProfile(
    {
      id: 2,
      username: 'super',
      is_super_admin: true,
      permissions: ['sales_order.create', 'workflow.task.complete'],
      menus: [],
    },
    {
      pages: ['global-dashboard'],
      actions: ['workflow.task.read'],
      fieldPolicies: {},
      workPools: [],
      source: 'active_customer_config_revision',
    }
  )

  assert.deepEqual(
    resolveEffectiveSessionPageAccess(syncFailedProfile, 'global-dashboard', {
      isLocalDev: true,
    }),
    { allowed: true, reason: 'local_dev_sync_failed_diagnostic' }
  )
  assert.deepEqual(
    resolveEffectiveSessionPageAccess(syncFailedProfile, 'global-dashboard', {
      isSuperAdmin: true,
      isLocalDev: false,
    }),
    { allowed: true, reason: 'super_admin_product_core' }
  )
  assert.equal(
    effectiveSessionAllowsAction(syncFailedProfile, 'sales_order.create'),
    true
  )
  assert.equal(
    effectiveSessionAllowsAction(syncFailedProfile, 'workflow.task.complete'),
    true
  )
  assert.equal(
    effectiveSessionAllowsAction(activeProfile, 'workflow.task.read'),
    true
  )
  assert.equal(
    effectiveSessionAllowsAction(activeProfile, 'workflow.task.complete'),
    true
  )
  assert.equal(
    effectiveSessionAllowsAction(activeProfile, 'sales_order.create'),
    true
  )
  assert.equal(
    effectiveSessionAllowsAction(
      { is_super_admin: true },
      'unknown.future.action'
    ),
    false
  )
  assert.equal(
    effectiveSessionAllowsAction(
      {
        permissions: ['sales_order.create', 'workflow.task.complete'],
        effective_session: {
          source: 'active_customer_config_revision',
          actions: ['workflow.task.read'],
        },
      },
      'sales_order.create'
    ),
    false
  )
})

test('adminProfileSync: 没有 effective session 时普通账号不回退旧 RBAC 动作', () => {
  const profile = { permissions: ['sales_order.create'] }
  assert.deepEqual(
    resolveEffectiveSessionPageAccess(profile, 'global-dashboard', {
      isLocalDev: false,
    }),
    { allowed: false, reason: 'effective_session_pages_missing' }
  )
  assert.equal(
    effectiveSessionAllowsAction(profile, 'sales_order.create'),
    false
  )
  assert.equal(
    effectiveSessionAllowsAction(
      { is_super_admin: true, permissions: ['sales_order.create'] },
      'sales_order.create'
    ),
    true
  )
  assert.deepEqual(
    filterColumnsByEffectiveFieldPolicy(
      [{ dataIndex: 'order_no' }, { dataIndex: 'customer_order_no' }],
      profile,
      'sales_orders.default'
    ),
    [{ dataIndex: 'order_no' }, { dataIndex: 'customer_order_no' }]
  )
})

test('adminProfileSync: field policy 收窄列表列但不改写列定义真源', () => {
  const adminProfile = {
    effective_session: {
      field_policies: {
        'sales_orders.default': {
          source_no: { visible: false },
          expected_ship_date: { visible: true },
        },
      },
    },
  }
  const columns = [
    { dataIndex: 'order_no' },
    { dataIndex: 'customer_order_no', effectiveFieldKey: 'source_no' },
    {
      dataIndex: 'planned_delivery_date',
      effectiveFieldKey: 'expected_ship_date',
    },
  ]

  assert.deepEqual(
    filterColumnsByEffectiveFieldPolicy(
      columns,
      adminProfile,
      'sales_orders.default'
    ),
    [columns[0], columns[2]]
  )
})

test('adminProfileSync: super admin 不受 field policy 隐藏列收窄', () => {
  const adminProfile = {
    is_super_admin: true,
    effective_session: {
      field_policies: {
        'sales_orders.default': {
          source_no: { visible: false },
        },
      },
    },
  }
  const columns = [
    { dataIndex: 'order_no' },
    { dataIndex: 'customer_order_no', effectiveFieldKey: 'source_no' },
  ]

  assert.deepEqual(
    filterColumnsByEffectiveFieldPolicy(
      columns,
      adminProfile,
      'sales_orders.default'
    ),
    columns
  )
})

test('adminProfileSync: master data field policy 可映射客户和供应商页面已有列', () => {
  const adminProfile = {
    effective_session: {
      field_policies: {
        'customers.default': {
          customer_code: { visible: false },
          display_name: { visible: true },
          tax_no: { visible: false },
        },
        'suppliers.default': {
          supplier_code: { visible: true },
          supplier_type: { visible: false },
        },
      },
    },
  }

  const customerColumns = [
    { dataIndex: 'code', effectiveFieldKey: 'customer_code' },
    { dataIndex: 'name' },
    { dataIndex: 'short_name', effectiveFieldKey: 'display_name' },
    { dataIndex: 'tax_no', effectiveFieldKey: 'tax_no' },
  ]
  const supplierColumns = [
    { dataIndex: 'code', effectiveFieldKey: 'supplier_code' },
    { dataIndex: 'supplier_type', effectiveFieldKey: 'supplier_type' },
    { dataIndex: 'tax_no' },
  ]

  assert.deepEqual(
    filterColumnsByEffectiveFieldPolicy(
      customerColumns,
      adminProfile,
      'customers.default'
    ).map((column) => column.dataIndex),
    ['name', 'short_name']
  )
  assert.deepEqual(
    filterColumnsByEffectiveFieldPolicy(
      supplierColumns,
      adminProfile,
      'suppliers.default'
    ).map((column) => column.dataIndex),
    ['code', 'tax_no']
  )
})

test('adminProfileSync: planned runtime field policy aliases can hide current business columns', () => {
  const adminProfile = {
    effective_session: {
      field_policies: {
        'purchase_orders.default': {
          supplier_snapshot: { visible: false },
        },
        'outsourcing_orders.default': {
          processor_snapshot: { visible: false },
          expected_return_date: { visible: false },
        },
        'shipments.default': {
          sales_order_no: { visible: false },
        },
        'quality_inspections.default': {
          source_no: { visible: false },
        },
      },
    },
  }
  const cases = [
    {
      moduleKey: 'accessories-purchase',
      surface: 'purchase_orders.default',
      column: {
        dataIndex: 'supplier_id',
        effectiveFieldKey: 'supplier_snapshot',
      },
    },
    {
      moduleKey: 'processing-contracts',
      surface: 'outsourcing_orders.default',
      column: {
        dataIndex: 'supplier_id',
        effectiveFieldKey: 'processor_snapshot',
      },
    },
    {
      moduleKey: 'processing-contracts',
      surface: 'outsourcing_orders.default',
      column: {
        dataIndex: 'expected_return_date',
        effectiveFieldKey: 'expected_return_date',
      },
    },
    {
      moduleKey: 'shipments',
      surface: 'shipments.default',
      column: {
        dataIndex: 'sales_order_id',
        effectiveFieldKey: 'sales_order_no',
      },
    },
    {
      moduleKey: 'quality-inspections',
      surface: 'quality_inspections.default',
      column: {
        dataIndex: 'purchase_receipt_id',
        effectiveFieldKey: 'source_no',
      },
    },
  ]

  for (const item of cases) {
    assert.equal(resolveDefaultFieldPolicySurface(item.moduleKey), item.surface)
    const columns = [{ dataIndex: 'always_visible' }, item.column]
    applyEffectiveFieldPolicyFlags({
      adminProfile,
      moduleKey: item.moduleKey,
      columns,
    })
    assert.equal(columns[0].hiddenByEffectiveFieldPolicy, undefined)
    assert.equal(columns[1].hiddenByEffectiveFieldPolicy, true)
  }
})

test('adminProfileSync: 正式普通账号菜单按 RBAC 与 effective session 取交集', () => {
  const navigationSections = [
    {
      title: '主路径',
      items: [
        { key: 'global-dashboard', path: '/erp/dashboard' },
        { key: 'permission-center', path: '/erp/system/permissions' },
      ],
    },
    {
      title: '业务',
      items: [{ key: 'sales-orders', path: '/erp/sales/orders' }],
    },
  ]
  const adminProfile = {
    effective_session: {
      pages: ['global-dashboard', 'sales-orders'],
    },
  }

  assert.deepEqual(
    filterNavigationSectionsByAdminProfile({
      navigationSections,
      adminProfile,
      allowedMenuPaths: ['/erp/dashboard', '/erp/system/permissions'],
      isSuperAdmin: false,
      isLocalDev: false,
    }),
    [
      {
        title: '主路径',
        items: [{ key: 'global-dashboard', path: '/erp/dashboard' }],
      },
    ]
  )

  assert.deepEqual(
    filterNavigationSectionsByAdminProfile({
      navigationSections,
      adminProfile,
      allowedMenuPaths: [],
      isSuperAdmin: true,
      isLocalDev: false,
    }),
    [
      {
        title: '主路径',
        items: [
          { key: 'global-dashboard', path: '/erp/dashboard' },
          { key: 'permission-center', path: '/erp/system/permissions' },
        ],
      },
      {
        title: '业务',
        items: [{ key: 'sales-orders', path: '/erp/sales/orders' }],
      },
    ]
  )
})

test('adminProfileSync: active revision 空页面清单不回退 RBAC-only', () => {
  const navigationSections = [
    {
      title: '业务',
      items: [
        { key: 'global-dashboard', path: '/erp/dashboard' },
        { key: 'sales-orders', path: '/erp/sales/orders' },
      ],
    },
  ]
  const adminProfile = {
    effective_session: {
      source: 'active_customer_config_revision',
      pages: [],
    },
  }

  assert.deepEqual(
    filterNavigationSectionsByAdminProfile({
      navigationSections,
      adminProfile,
      allowedMenuPaths: ['/erp/dashboard', '/erp/sales/orders'],
      isSuperAdmin: false,
      isLocalDev: false,
    }),
    []
  )
  assert.equal(
    shouldRedirectFromCurrentNavigation({
      adminProfile,
      allowedMenuPaths: ['/erp/dashboard'],
      isSuperAdmin: false,
      isLocalDev: false,
      currentMenuPath: '/erp/dashboard',
      currentPageKey: 'global-dashboard',
    }),
    true
  )
})

test('adminProfileSync: 模块 disabled 后端投影隐藏业务页时正式账号需要跳转', () => {
  const navigationSections = [
    {
      title: '看板',
      items: [{ key: 'global-dashboard', path: '/erp/dashboard' }],
    },
    {
      title: '业务',
      items: [{ key: 'shipments', path: '/erp/warehouse/shipments' }],
    },
  ]
  const adminProfile = {
    effective_session: {
      source: 'active_customer_config_revision',
      modules: { shipments: 'disabled' },
      pages: ['global-dashboard'],
      actions: ['erp.dashboard.read'],
    },
  }

  assert.deepEqual(
    filterNavigationSectionsByAdminProfile({
      navigationSections,
      adminProfile,
      allowedMenuPaths: ['/erp/dashboard', '/erp/warehouse/shipments'],
      isSuperAdmin: false,
      isLocalDev: false,
    }),
    [
      {
        title: '看板',
        items: [{ key: 'global-dashboard', path: '/erp/dashboard' }],
      },
    ]
  )
  assert.equal(
    shouldRedirectFromCurrentNavigation({
      adminProfile,
      allowedMenuPaths: ['/erp/dashboard', '/erp/warehouse/shipments'],
      isSuperAdmin: false,
      isLocalDev: false,
      currentMenuPath: '/erp/warehouse/shipments',
      currentPageKey: 'shipments',
    }),
    true
  )
  assert.equal(
    shouldRedirectFromCurrentNavigation({
      adminProfile,
      allowedMenuPaths: ['/erp/dashboard', '/erp/warehouse/shipments'],
      isSuperAdmin: false,
      isLocalDev: false,
      currentMenuPath: '/erp/dashboard',
      currentPageKey: 'global-dashboard',
    }),
    false
  )
})

test('adminProfileSync: 正式 super admin 可审阅 active revision 未投出的业务页', () => {
  const navigationSections = [
    {
      title: '系统',
      items: [
        { key: 'permission-center', path: '/erp/system/permissions' },
        { key: 'system-audit-logs', path: '/erp/system/audit-logs' },
      ],
    },
    {
      title: '业务',
      items: [
        { key: 'sales-orders', path: '/erp/sales/orders' },
        { key: 'shipments', path: '/erp/shipments' },
      ],
    },
  ]
  const adminProfile = {
    effective_session: {
      source: 'active_customer_config_revision',
      pages: ['global-dashboard'],
    },
  }

  assert.deepEqual(
    filterNavigationSectionsByAdminProfile({
      navigationSections,
      adminProfile,
      allowedMenuPaths: [],
      isSuperAdmin: true,
      isLocalDev: false,
    }),
    navigationSections
  )
  assert.equal(
    shouldRedirectFromCurrentNavigation({
      adminProfile,
      allowedMenuPaths: [],
      isSuperAdmin: true,
      isLocalDev: false,
      currentMenuPath: '/erp/sales/orders',
      currentPageKey: 'sales-orders',
    }),
    false
  )
})

test('adminProfileSync: 本地开发可按 RBAC 查看客户配置隐藏页用于诊断', () => {
  const navigationSections = [
    {
      title: '主路径',
      items: [
        { key: 'global-dashboard', path: '/erp/dashboard' },
        { key: 'permission-center', path: '/erp/system/permissions' },
      ],
    },
  ]
  const adminProfile = {
    effective_session: {
      source: 'active_customer_config_revision',
      pages: ['global-dashboard'],
    },
  }

  assert.deepEqual(
    resolveEffectiveSessionPageAccess(adminProfile, 'permission-center', {
      isLocalDev: true,
    }),
    { allowed: true, reason: 'local_dev_customer_config_diagnostic' }
  )
  assert.deepEqual(
    filterNavigationSectionsByAdminProfile({
      navigationSections,
      adminProfile,
      allowedMenuPaths: ['/erp/dashboard', '/erp/system/permissions'],
      isLocalDev: true,
    }),
    [
      {
        title: '主路径',
        items: [{ key: 'global-dashboard', path: '/erp/dashboard' }],
      },
    ]
  )
  assert.equal(
    shouldRedirectFromCurrentNavigation({
      adminProfile,
      allowedMenuPaths: ['/erp/dashboard', '/erp/system/permissions'],
      isLocalDev: true,
      currentMenuPath: '/erp/system/permissions',
      currentPageKey: 'permission-center',
    }),
    false
  )
})

test('adminProfileSync: 当前页面被 effective session 隐藏时需要跳转', () => {
  const adminProfile = {
    effective_session: {
      pages: ['global-dashboard'],
    },
  }

  assert.equal(
    shouldRedirectFromCurrentNavigation({
      profileLoading: true,
      adminProfile,
      allowedMenuPaths: ['/erp/system/permissions'],
      currentMenuPath: '/erp/system/permissions',
      currentPageKey: 'permission-center',
    }),
    false
  )
  assert.equal(
    shouldRedirectFromCurrentNavigation({
      adminProfile,
      allowedMenuPaths: ['/erp/system/permissions'],
      isLocalDev: false,
      currentMenuPath: '/erp/system/permissions',
      currentPageKey: 'permission-center',
    }),
    true
  )
  assert.equal(
    shouldRedirectFromCurrentNavigation({
      adminProfile,
      allowedMenuPaths: [],
      isSuperAdmin: true,
      isLocalDev: false,
      currentMenuPath: '/erp/system/permissions',
      currentPageKey: 'permission-center',
    }),
    false
  )
  assert.equal(
    shouldRedirectFromCurrentNavigation({
      adminProfile,
      allowedMenuPaths: ['/erp/dashboard'],
      currentMenuPath: '/erp/dashboard',
      currentPageKey: 'global-dashboard',
    }),
    false
  )
})

test('adminProfileSync: 未登记路由 fallback 不授予菜单或页面访问', () => {
  const adminProfile = {
    effective_session: {
      source: 'active_customer_config_revision',
      pages: ['global-dashboard'],
    },
  }

  assert.equal(
    shouldRedirectFromCurrentNavigation({
      adminProfile,
      allowedMenuPaths: ['/erp/dashboard'],
      isLocalDev: false,
      currentMenuPath: '',
      currentPageKey: '',
      currentNavigationMatched: false,
    }),
    true
  )
  assert.equal(
    shouldRedirectFromCurrentNavigation({
      adminProfile,
      allowedMenuPaths: [],
      isSuperAdmin: true,
      isLocalDev: false,
      currentMenuPath: '',
      currentPageKey: '',
      currentNavigationMatched: false,
    }),
    true
  )
  assert.equal(
    shouldRedirectFromCurrentNavigation({
      profileLoading: true,
      adminProfile,
      allowedMenuPaths: ['/erp/dashboard'],
      currentMenuPath: '',
      currentPageKey: '',
      currentNavigationMatched: false,
    }),
    false
  )
})
