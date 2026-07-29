import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildRoleGuidedNavigation,
  buildRoleGuidedNavigationPreview,
  buildRoleGuidedSecondarySections,
  normalizeRoleNavigationSettings,
  reconcileRoleNavigationPaths,
} from './roleGuidedNavigation.mjs'

const sections = [
  {
    title: '日常',
    items: [
      { key: 'dashboard', path: '/erp/dashboard' },
      { key: 'task-board', path: '/erp/task-board' },
      { key: 'business-dashboard', path: '/erp/business-dashboard' },
      { key: 'customers', path: '/erp/master/partners/customers' },
      { key: 'sales-orders', path: '/erp/sales/project-orders/sales-orders' },
      { key: 'shipments', path: '/erp/warehouse/shipments' },
      { key: 'inventory', path: '/erp/warehouse/inventory' },
    ],
  },
  {
    title: '帮助',
    items: [
      {
        key: 'help-center',
        path: '/erp/help-center',
        access: 'authenticated',
      },
    ],
  },
]

test('roleGuidedNavigation: 看板统一前置，常用只保留三个业务且帮助进入更多功能', () => {
  const result = buildRoleGuidedNavigation({
    visibleSections: sections,
    adminProfile: { roles: [{ role_key: 'sales' }] },
  })

  assert.deepEqual(
    result.dashboardItems.map((item) => item.path),
    ['/erp/dashboard', '/erp/task-board', '/erp/business-dashboard']
  )
  assert.deepEqual(
    result.primaryItems.map((item) => item.path),
    [
      '/erp/master/partners/customers',
      '/erp/sales/project-orders/sales-orders',
      '/erp/warehouse/shipments',
    ]
  )
  assert.deepEqual(
    result.secondarySections.flatMap((section) =>
      section.items.map((item) => item.path)
    ),
    ['/erp/warehouse/inventory', '/erp/help-center']
  )
})

test('roleGuidedNavigation: 财务系统推荐将应收、应付、发票和对账列为常用', () => {
  const result = buildRoleGuidedNavigation({
    visibleSections: [
      {
        title: '财务管理',
        items: [
          { key: 'reconciliation', path: '/erp/finance/reconciliation' },
          { key: 'receivables', path: '/erp/finance/receivables' },
          { key: 'payables', path: '/erp/finance/payables' },
          { key: 'invoices', path: '/erp/finance/invoices' },
        ],
      },
      ...sections.slice(1),
    ],
    adminProfile: { roles: [{ role_key: 'finance' }] },
  })

  assert.deepEqual(
    result.primaryItems.map((item) => item.path),
    [
      '/erp/finance/receivables',
      '/erp/finance/payables',
      '/erp/finance/invoices',
      '/erp/finance/reconciliation',
    ]
  )
  assert.deepEqual(
    result.secondarySections.flatMap((section) =>
      section.items.map((item) => item.path)
    ),
    ['/erp/help-center']
  )
})

test('roleGuidedNavigation: 岗位自定义顺序只消费已授权页面且不会被推荐项补满', () => {
  const result = buildRoleGuidedNavigation({
    visibleSections: sections,
    adminProfile: {
      roles: [
        {
          role_key: 'sales',
          navigation_mode: 'custom',
          primary_menu_paths: [
            '/erp/warehouse/inventory',
            '/erp/sales/project-orders/sales-orders',
            '/erp/not-authorized',
          ],
        },
      ],
    },
  })

  assert.deepEqual(
    result.primaryItems.map((item) => item.path),
    ['/erp/warehouse/inventory', '/erp/sales/project-orders/sales-orders']
  )
  assert.equal(
    result.secondarySections.some((section) =>
      section.items.some(
        (item) => item.path === '/erp/master/partners/customers'
      )
    ),
    true
  )
})

test('roleGuidedNavigation: 自定义常用全部失效时不擅自恢复推荐且页面仍留在更多', () => {
  const result = buildRoleGuidedNavigation({
    visibleSections: sections,
    adminProfile: {
      roles: [
        {
          role_key: 'sales',
          navigation_mode: 'custom',
          primary_menu_paths: ['/erp/not-authorized'],
        },
      ],
    },
  })

  assert.deepEqual(
    result.primaryItems.map((item) => item.path),
    []
  )
  assert.deepEqual(
    result.secondaryItems.map((item) => item.path),
    [
      '/erp/master/partners/customers',
      '/erp/sales/project-orders/sales-orders',
      '/erp/warehouse/shipments',
      '/erp/warehouse/inventory',
      '/erp/help-center',
    ]
  )
})

test('roleGuidedNavigation: 单岗位自定义常用与更多都保持保存顺序并将帮助置底', () => {
  const result = buildRoleGuidedNavigation({
    visibleSections: sections,
    adminProfile: {
      effective_session: { roles: ['sales'] },
      roles: [
        {
          role_key: 'sales',
          navigation_mode: 'custom',
          primary_menu_paths: ['/erp/warehouse/inventory'],
          secondary_menu_paths: [
            '/erp/warehouse/shipments',
            '/erp/master/partners/customers',
            '/erp/sales/project-orders/sales-orders',
          ],
        },
      ],
    },
  })

  assert.deepEqual(
    result.primaryItems.map((item) => item.path),
    ['/erp/warehouse/inventory']
  )
  assert.deepEqual(
    result.secondaryItems.map((item) => item.path),
    [
      '/erp/warehouse/shipments',
      '/erp/master/partners/customers',
      '/erp/sales/project-orders/sales-orders',
      '/erp/help-center',
    ]
  )
})

test('roleGuidedNavigation: 双列表标准化拒绝跨组重复并把新增有效页追加到更多', () => {
  assert.equal(
    normalizeRoleNavigationSettings({
      navigation_mode: 'custom',
      primary_menu_paths: ['/erp/warehouse/inventory'],
      secondary_menu_paths: ['/erp/warehouse/inventory'],
    }).mode,
    'recommended'
  )
  assert.deepEqual(
    reconcileRoleNavigationPaths({
      effectivePaths: [
        '/erp/warehouse/inventory',
        '/erp/warehouse/shipments',
        '/erp/master/partners/customers',
      ],
      primaryMenuPaths: ['/erp/warehouse/inventory'],
      secondaryMenuPaths: ['/erp/warehouse/shipments'],
    }),
    {
      primaryMenuPaths: ['/erp/warehouse/inventory'],
      secondaryMenuPaths: [
        '/erp/warehouse/shipments',
        '/erp/master/partners/customers',
      ],
    }
  )
})

test('roleGuidedNavigation: 老板优先项全是看板时仍补足三个电脑端常用业务', () => {
  const result = buildRoleGuidedNavigation({
    visibleSections: [
      {
        title: '看板中心',
        items: [
          { key: 'dashboard', path: '/erp/dashboard' },
          { key: 'task-board', path: '/erp/task-board' },
          { key: 'business-dashboard', path: '/erp/business-dashboard' },
        ],
      },
      {
        title: '业务管理',
        items: [
          {
            key: 'sales-orders',
            path: '/erp/sales/project-orders/sales-orders',
          },
          { key: 'purchase', path: '/erp/purchase/accessories' },
          {
            key: 'outsourcing',
            path: '/erp/purchase/processing-contracts',
          },
          {
            key: 'production-exceptions',
            path: '/erp/production/exceptions',
          },
        ],
      },
    ],
    adminProfile: { roles: [{ role_key: 'boss' }] },
  })

  assert.deepEqual(
    result.dashboardItems.map((item) => item.path),
    ['/erp/dashboard', '/erp/task-board', '/erp/business-dashboard']
  )
  assert.deepEqual(
    result.primaryItems.map((item) => item.path),
    [
      '/erp/sales/project-orders/sales-orders',
      '/erp/purchase/accessories',
      '/erp/purchase/processing-contracts',
    ]
  )
  assert.equal(result.secondaryItemCount, 1)
})

test('roleGuidedNavigation: 多岗位按岗位轮流选择常用业务且不让单一岗位占满', () => {
  const result = buildRoleGuidedNavigation({
    visibleSections: [
      ...sections,
      {
        title: '采购财务',
        items: [
          { key: 'suppliers', path: '/erp/master/partners/suppliers' },
          { key: 'purchase', path: '/erp/purchase/accessories' },
          { key: 'inbound', path: '/erp/warehouse/inbound' },
          { key: 'receivables', path: '/erp/finance/receivables' },
          { key: 'payables', path: '/erp/finance/payables' },
        ],
      },
    ],
    adminProfile: {
      effective_session: { roles: ['purchase', 'finance'] },
    },
    primaryLimit: 3,
  })

  assert.deepEqual(
    result.dashboardItems.map((item) => item.path),
    ['/erp/dashboard', '/erp/task-board', '/erp/business-dashboard']
  )
  assert.deepEqual(
    result.primaryItems.map((item) => item.path),
    [
      '/erp/master/partners/suppliers',
      '/erp/finance/receivables',
      '/erp/purchase/accessories',
    ]
  )
  assert.equal(
    new Set(result.primaryItems.map((item) => item.path)).size,
    result.primaryItems.length
  )
  assert.equal(
    result.secondarySections.some((section) =>
      section.items.some((item) => item.path === '/erp/help-center')
    ),
    true
  )
})

test('roleGuidedNavigation: 未知岗位使用安全回退且不丢失其他页面', () => {
  const result = buildRoleGuidedNavigation({
    visibleSections: sections,
    adminProfile: { roles: [{ role_key: 'customer-special-role' }] },
    primaryLimit: 3,
  })

  assert.deepEqual(
    result.dashboardItems.map((item) => item.path),
    ['/erp/dashboard', '/erp/task-board', '/erp/business-dashboard']
  )
  assert.deepEqual(
    result.primaryItems.map((item) => item.path),
    [
      '/erp/master/partners/customers',
      '/erp/sales/project-orders/sales-orders',
      '/erp/warehouse/shipments',
    ]
  )
  assert.equal(result.secondaryItemCount, 2)
})

test('roleGuidedNavigation: 权限中心预览只使用最终可进入页面并将岗位帮助放入更多功能', () => {
  const result = buildRoleGuidedNavigationPreview({
    navigationSections: sections,
    effectiveAccess: {
      pages: [
        { path: '/erp/dashboard', effective: true },
        { path: '/erp/task-board', effective: true },
        { path: '/erp/business-dashboard', effective: false },
        { path: '/erp/master/partners/customers', effective: true },
        {
          path: '/erp/sales/project-orders/sales-orders',
          effective: false,
        },
        { path: '/erp/warehouse/shipments', effective: true },
        { path: '/erp/warehouse/inventory', effective: true },
      ],
    },
    roleKey: 'sales',
  })

  assert.deepEqual(
    result.dashboardItems.map((item) => item.path),
    ['/erp/dashboard', '/erp/task-board']
  )
  assert.deepEqual(
    result.primaryItems.map((item) => item.path),
    [
      '/erp/master/partners/customers',
      '/erp/warehouse/shipments',
      '/erp/warehouse/inventory',
    ]
  )
  assert.deepEqual(
    result.secondarySections.flatMap((section) =>
      section.items.map((item) => item.path)
    ),
    ['/erp/help-center']
  )
})

test('roleGuidedNavigation: 权限中心预览使用尚未保存的自定义顺序但不越权', () => {
  const result = buildRoleGuidedNavigationPreview({
    navigationSections: sections,
    effectiveAccess: {
      pages: [
        { path: '/erp/dashboard', effective: true },
        { path: '/erp/task-board', effective: true },
        { path: '/erp/master/partners/customers', effective: true },
        {
          path: '/erp/sales/project-orders/sales-orders',
          effective: true,
        },
        { path: '/erp/warehouse/inventory', effective: false },
      ],
    },
    roleKey: 'sales',
    navigationMode: 'custom',
    primaryMenuPaths: [
      '/erp/warehouse/inventory',
      '/erp/sales/project-orders/sales-orders',
      '/erp/master/partners/customers',
    ],
  })

  assert.deepEqual(
    result.primaryItems.map((item) => item.path),
    ['/erp/sales/project-orders/sales-orders', '/erp/master/partners/customers']
  )
  assert.equal(
    result.primaryItems.some(
      (item) => item.path === '/erp/warehouse/inventory'
    ),
    false
  )
})

test('roleGuidedNavigation: 更多功能固定按业务场景分组且保留原始配置成员合同', () => {
  const groupedSections = [
    {
      key: 'master',
      title: '基础资料',
      items: [
        {
          key: 'customers',
          path: '/erp/master/partners/customers',
        },
        {
          key: 'suppliers',
          path: '/erp/master/partners/suppliers',
        },
      ],
    },
    {
      key: 'sales',
      title: '销售管理',
      items: [
        {
          key: 'sales-orders',
          path: '/erp/sales/project-orders/sales-orders',
        },
      ],
    },
    {
      key: 'quality',
      title: '质检管理',
      items: [
        {
          key: 'quality-inspections',
          path: '/erp/quality/inspections',
        },
      ],
    },
    {
      key: 'warehouse',
      title: '库存管理',
      items: [
        {
          key: 'inventory',
          path: '/erp/warehouse/inventory',
        },
      ],
    },
    {
      key: 'shipment',
      title: '出货管理',
      items: [
        {
          key: 'shipping-release',
          path: '/erp/warehouse/shipping-release',
        },
        {
          key: 'shipments',
          path: '/erp/warehouse/shipments',
        },
      ],
    },
    {
      title: '运营工具',
      items: [
        {
          key: 'print-center',
          path: '/erp/print-center',
        },
      ],
    },
    {
      key: 'help',
      title: '使用帮助',
      items: [
        {
          key: 'help-center',
          path: '/erp/help-center',
          access: 'authenticated',
        },
      ],
    },
  ]
  const configuredSecondaryPaths = [
    '/erp/warehouse/shipments',
    '/erp/sales/project-orders/sales-orders',
    '/erp/quality/inspections',
    '/erp/master/partners/suppliers',
    '/erp/warehouse/inventory',
    '/erp/warehouse/shipping-release',
    '/erp/print-center',
  ]
  const result = buildRoleGuidedNavigation({
    visibleSections: groupedSections,
    adminProfile: {
      effective_session: { roles: ['sales'] },
      roles: [
        {
          role_key: 'sales',
          navigation_mode: 'custom',
          primary_menu_paths: ['/erp/master/partners/customers'],
          secondary_menu_paths: configuredSecondaryPaths,
        },
      ],
    },
  })

  assert.deepEqual(
    result.secondaryItems.map((item) => item.path),
    [...configuredSecondaryPaths, '/erp/help-center'],
    '成员合同继续保留已保存路径顺序，展示分组不得改写权限配置'
  )
  assert.deepEqual(
    result.secondarySections.map((section) => section.title),
    ['资料与单据', '品质与库存', '出货处理', '工具与帮助']
  )
  assert.deepEqual(
    result.secondarySections.map((section) =>
      section.items.map((item) => item.path)
    ),
    [
      [
        '/erp/sales/project-orders/sales-orders',
        '/erp/master/partners/suppliers',
      ],
      ['/erp/quality/inspections', '/erp/warehouse/inventory'],
      ['/erp/warehouse/shipments', '/erp/warehouse/shipping-release'],
      ['/erp/print-center', '/erp/help-center'],
    ]
  )
  const groupedPaths = result.secondarySections.flatMap((section) =>
    section.items.map((item) => item.path)
  )
  assert.equal(groupedPaths.length, result.secondaryItemCount)
  assert.equal(new Set(groupedPaths).size, result.secondaryItemCount)
  assert.equal(groupedPaths.at(-1), '/erp/help-center')
})

test('roleGuidedNavigation: 权限调整后页面进入对应更多分组且空分组消失', () => {
  const navigationSections = [
    {
      key: 'master',
      title: '基础资料',
      items: [
        { key: 'customers', path: '/erp/master/partners/customers' },
        { key: 'suppliers', path: '/erp/master/partners/suppliers' },
      ],
    },
    {
      key: 'quality',
      title: '质检管理',
      items: [
        {
          key: 'quality-inspections',
          path: '/erp/quality/inspections',
        },
      ],
    },
    {
      key: 'help',
      title: '使用帮助',
      items: [
        {
          key: 'help-center',
          path: '/erp/help-center',
          access: 'authenticated',
        },
      ],
    },
  ]
  const result = buildRoleGuidedNavigation({
    visibleSections: navigationSections,
    adminProfile: {
      effective_session: { roles: ['quality'] },
      roles: [
        {
          role_key: 'quality',
          navigation_mode: 'custom',
          primary_menu_paths: ['/erp/quality/inspections'],
          secondary_menu_paths: [
            '/erp/master/partners/suppliers',
            '/erp/master/partners/customers',
          ],
        },
      ],
    },
  })

  assert.deepEqual(
    result.secondarySections.map((section) => section.title),
    ['资料与单据', '工具与帮助']
  )
  assert.deepEqual(
    result.secondarySections[0].items.map((item) => item.path),
    ['/erp/master/partners/suppliers', '/erp/master/partners/customers'],
    '同一业务分组继续保持权限中心保存的组内顺序'
  )
  assert.equal(
    result.secondarySections.some((section) => section.title === '品质管理'),
    false
  )
})

test('roleGuidedNavigation: 客户扩展分组保留且工具帮助始终收尾', () => {
  const grouped = buildRoleGuidedSecondarySections([
    {
      key: 'customer-extension',
      path: '/erp/customer-extension',
      navigationSectionKey: 'customer-extension',
      navigationSectionTitle: '客户扩展',
    },
    {
      key: 'print-center',
      path: '/erp/print-center',
      navigationSectionTitle: '运营工具',
    },
    {
      key: 'help-center',
      path: '/erp/help-center',
      navigationSectionTitle: '使用帮助',
    },
  ])

  assert.deepEqual(
    grouped.map((section) => section.title),
    ['客户扩展', '工具与帮助']
  )
  assert.deepEqual(
    grouped.at(-1).items.map((item) => item.path),
    ['/erp/print-center', '/erp/help-center']
  )
})
