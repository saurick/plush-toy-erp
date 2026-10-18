import assert from 'node:assert/strict'
import test from 'node:test'
import { PERMISSION_RELATIONSHIP_VIEW_MODE } from './devPermissionRelationshipGraph.mjs'
import {
  PERMISSION_NAVIGATION_STATE,
  buildPermissionRelationshipNavigationModel,
} from './devPermissionNavigation.mjs'
import { yoyoosunMenuConfig } from '../../../../config/customers/yoyoosun/menuConfig.mjs'

const guidedMenuConfig = { desktopMenu: { presentation: 'role_guided' } }
const groupItems = (model, key) =>
  model.sections.find((section) => section.key === key)?.items || []
const otherSections = (model) =>
  model.sections.filter((section) => !['work', 'primary'].includes(section.key))

const navigationSections = [
  {
    key: 'dashboards',
    title: '看板中心',
    items: [
      {
        key: 'global-dashboard',
        sidebarArea: 'work',
        label: '工作台',
        path: '/erp/dashboard',
      },
    ],
  },
  {
    key: 'sales',
    title: '销售管理',
    items: [
      {
        key: 'customers',
        label: '客户档案',
        path: '/erp/master/partners/customers',
      },
      {
        key: 'sales-orders',
        label: '销售订单',
        path: '/erp/sales/project-orders/sales-orders',
      },
      {
        key: 'shipments',
        label: '出货单',
        path: '/erp/warehouse/shipments',
      },
    ],
  },
  {
    key: 'warehouse',
    title: '库存管理',
    items: [
      {
        key: 'inventory',
        label: '库存台账',
        path: '/erp/warehouse/inventory',
      },
    ],
  },
  {
    key: 'finance',
    title: '财务业务',
    items: [
      {
        key: 'receivables',
        label: '应收管理',
        path: '/erp/finance/receivables',
      },
      {
        key: 'reconciliation',
        label: '财务对账',
        path: '/erp/finance/reconciliation',
      },
    ],
  },
  {
    key: 'help',
    title: '使用帮助',
    items: [
      {
        key: 'help-center',
        sidebarArea: 'system',
        label: '帮助中心',
        path: '/erp/help-center',
        access: 'authenticated',
      },
    ],
  },
]

const roles = [
  {
    role_key: 'sales',
    name: '业务',
    disabled: false,
    navigation_mode: 'recommended',
    primary_menu_paths: [],
    secondary_menu_paths: [],
  },
  {
    role_key: 'finance',
    name: '财务',
    disabled: false,
    navigation_mode: 'custom',
    primary_menu_paths: ['/erp/finance/receivables'],
    secondary_menu_paths: ['/erp/finance/reconciliation'],
  },
]

const accessByRoleKey = {
  sales: {
    role_key: 'sales',
    is_final: true,
    pages: [
      { path: '/erp/dashboard', effective: true },
      { path: '/erp/master/partners/customers', effective: true },
      { path: '/erp/sales/project-orders/sales-orders', effective: true },
      { path: '/erp/warehouse/shipments', effective: true },
      { path: '/erp/warehouse/inventory', effective: true },
      { path: '/erp/finance/receivables', effective: false },
    ],
  },
  finance: {
    role_key: 'finance',
    is_final: true,
    pages: [
      { path: '/erp/dashboard', effective: true },
      { path: '/erp/finance/receivables', effective: true },
      { path: '/erp/finance/reconciliation', effective: true },
      { path: '/erp/warehouse/shipments', effective: true },
    ],
  },
}

test('explicit role-guided presentation shows complete recommended navigation', () => {
  const model = buildPermissionRelationshipNavigationModel({
    viewMode: PERMISSION_RELATIONSHIP_VIEW_MODE.ROLE,
    targetKey: 'sales',
    roles,
    accessByRoleKey,
    navigationSections,
    customerMenuConfig: guidedMenuConfig,
  })

  assert.equal(model.state, PERMISSION_NAVIGATION_STATE.READY)
  assert.equal(model.modeLabel, '系统推荐')
  assert.equal(model.contextLabel, '业务')
  assert.equal(model.effectivePageCount, 5)
  assert.deepEqual(
    groupItems(model, 'work').map((item) => item.label),
    ['工作台']
  )
  assert.deepEqual(
    groupItems(model, 'primary').map((item) => item.label),
    ['基础资料', '销售管理', '出货管理']
  )
  assert.deepEqual(
    otherSections(model).map((section) => [
      section.title,
      section.items.map((item) => item.label),
    ]),
    [
      ['业务模块', ['库存管理']],
      ['系统与帮助', ['帮助中心']],
    ]
  )
  assert.equal(model.totalItemCount, 6)
})

test('role menu projection preserves a saved custom layout and appends remaining effective pages', () => {
  const customSalesRole = {
    ...roles[0],
    navigation_mode: 'custom',
    primary_menu_paths: [
      '/erp/warehouse/inventory',
      '/erp/sales/project-orders/sales-orders',
    ],
    secondary_menu_paths: [
      '/erp/master/partners/customers',
      '/erp/warehouse/shipments',
    ],
  }
  const model = buildPermissionRelationshipNavigationModel({
    viewMode: PERMISSION_RELATIONSHIP_VIEW_MODE.ROLE,
    targetKey: 'sales',
    roles: [customSalesRole],
    accessByRoleKey,
    navigationSections,
    customerMenuConfig: guidedMenuConfig,
  })

  assert.equal(model.modeLabel, '自定义布局')
  assert.deepEqual(
    groupItems(model, 'primary').map((item) => item.label),
    ['库存管理', '销售管理']
  )
  assert.deepEqual(
    otherSections(model).flatMap((section) =>
      section.items.map((item) => item.label)
    ),
    ['基础资料', '出货管理', '帮助中心']
  )
})

test('employee menu projection merges multiple active roles once', () => {
  const model = buildPermissionRelationshipNavigationModel({
    customerMenuConfig: guidedMenuConfig,
    viewMode: PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT,
    targetKey: '20',
    accounts: [
      {
        id: 20,
        username: 'warehouse01',
        display_name: '小吴',
        account_status: 'active',
        roles: [
          { role_key: 'sales', name: '业务' },
          { role_key: 'finance', name: '财务' },
        ],
      },
    ],
    roles,
    accessByRoleKey,
    navigationSections,
  })

  assert.equal(model.state, PERMISSION_NAVIGATION_STATE.READY)
  assert.equal(model.contextLabel, '小吴（warehouse01）')
  assert.equal(model.modeLabel, '多岗位合并（2）')
  assert.match(model.notice, /合并参考/u)
  assert.equal(model.effectivePageCount, 7)
  assert.deepEqual(
    groupItems(model, 'primary').map((item) => item.label),
    ['基础资料', '财务管理', '销售管理', '出货管理', '库存管理']
  )
  assert.equal(
    groupItems(model, 'primary').filter((item) => item.label === '出货管理')
      .length,
    1
  )
  assert.deepEqual(
    model.sections.at(-1).items.map((item) => item.label),
    ['帮助中心']
  )
})

test('menu projection fails closed for partial access instead of showing a partial sidebar', () => {
  const model = buildPermissionRelationshipNavigationModel({
    viewMode: PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT,
    targetKey: '21',
    accounts: [
      {
        id: 21,
        username: 'sales01',
        display_name: '小陈',
        account_status: 'active',
        roles: [
          { role_key: 'sales', name: '业务' },
          { role_key: 'finance', name: '财务' },
        ],
      },
    ],
    roles,
    accessByRoleKey: {
      ...accessByRoleKey,
      finance: { ...accessByRoleKey.finance, is_final: false },
    },
    navigationSections,
  })

  assert.equal(model.state, PERMISSION_NAVIGATION_STATE.UNAVAILABLE)
  assert.match(model.message, /财务的最终页面结果尚未完整读取/u)
  assert.equal(model.totalItemCount, 0)
})

test('super administrator menu is not fabricated from ordinary role settings', () => {
  const model = buildPermissionRelationshipNavigationModel({
    viewMode: PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT,
    targetKey: '1',
    accounts: [
      {
        id: 1,
        username: 'root-admin',
        display_name: '系统管理员',
        account_status: 'active',
        is_super_admin: true,
        roles: [],
      },
    ],
    roles,
    accessByRoleKey,
    navigationSections,
  })

  assert.equal(model.state, PERMISSION_NAVIGATION_STATE.UNAVAILABLE)
  assert.equal(model.contextLabel, '系统管理员（root-admin）')
  assert.equal(model.modeLabel, '系统保留账号')
  assert.match(model.message, /不推导可能失真的完整菜单/u)
})

test('inactive account has no usable menu even if its roles are still granted', () => {
  const model = buildPermissionRelationshipNavigationModel({
    viewMode: 'account',
    targetKey: '2',
    accounts: [{ id: 2, account_status: 'suspended', roles }],
    roles,
    accessByRoleKey,
    navigationSections,
  })
  assert.equal(model.state, PERMISSION_NAVIGATION_STATE.BLOCKED)
  assert.equal(model.effectivePageCount, 0)
  assert.equal(model.totalItemCount, 0)
})

test('disabled role cannot contribute menus or block an enabled peer with a non-final explanation', () => {
  const model = buildPermissionRelationshipNavigationModel({
    viewMode: 'account',
    targetKey: '2',
    accounts: [{ id: 2, account_status: 'active', roles }],
    roles: [roles[0], { ...roles[1], disabled: true }],
    accessByRoleKey: {
      ...accessByRoleKey,
      finance: { ...accessByRoleKey.finance, is_final: false },
    },
    navigationSections,
  })
  assert.equal(model.state, PERMISSION_NAVIGATION_STATE.READY)
  assert.equal(model.effectivePageCount, 5)
  assert.ok(
    !model.sections
      .flatMap((section) => section.items)
      .some((item) => item.label === '财务管理')
  )
})

test('a role version mismatch prevents a saved layout from being paired with stale access', () => {
  const model = buildPermissionRelationshipNavigationModel({
    targetKey: 'sales',
    roles: [{ ...roles[0], version: 2 }],
    accessByRoleKey: { sales: { ...accessByRoleKey.sales, role_version: 1 } },
    navigationSections,
  })
  assert.equal(model.state, PERMISSION_NAVIGATION_STATE.UNAVAILABLE)
  assert.equal(model.totalItemCount, 0)
})

test('default sectioned presentation ignores saved role layout and uses current sidebar groups', () => {
  const model = buildPermissionRelationshipNavigationModel({
    targetKey: 'sales',
    roles: [
      {
        ...roles[0],
        navigation_mode: 'custom',
        primary_menu_paths: ['/erp/warehouse/inventory'],
      },
    ],
    accessByRoleKey,
    navigationSections,
    customerMenuConfig: null,
  })

  assert.equal(model.mode, 'sectioned')
  assert.equal(model.modeLabel, '按业务模块')
  assert.deepEqual(
    model.sections.map((section) => [
      section.title,
      section.items.map((item) => item.label),
    ]),
    [
      ['工作中心', ['工作台']],
      ['业务模块', ['基础资料', '销售管理', '出货管理', '库存管理']],
      ['系统与帮助', ['帮助中心']],
    ]
  )
  assert.equal(model.effectivePageCount, 5)
  assert.equal(model.totalItemCount, 6)
  for (const section of model.sections) {
    assert.deepEqual(
      section.items.map((item) => item.order),
      section.items.map((_, index) => index + 1)
    )
  }
})

test('sectioned employee projection merges authorized modules without restoring common-work groups', () => {
  const model = buildPermissionRelationshipNavigationModel({
    viewMode: 'account',
    targetKey: '20',
    accounts: [{ id: 20, account_status: 'active', roles }],
    roles,
    accessByRoleKey,
    navigationSections,
    customerMenuConfig: null,
  })

  assert.equal(model.state, PERMISSION_NAVIGATION_STATE.READY)
  assert.equal(model.projectionOnly, true)
  assert.equal(model.mode, 'sectioned')
  assert.deepEqual(
    groupItems(model, 'business').map((item) => item.label),
    ['基础资料', '销售管理', '出货管理', '库存管理', '财务管理']
  )
  assert.equal(
    model.sections.some((section) => section.title === '常用工作'),
    false
  )
  assert.equal(model.effectivePageCount, 7)
  assert.equal(model.totalItemCount, 7)
})

test('route-only pages remain in access counts but never create sidebar entries or default targets', () => {
  const productionNavigation = [
    {
      title: '生产管理',
      items: [
        {
          key: 'production-exceptions',
          label: '异常处理',
          path: '/erp/production/exceptions',
          sidebarVisible: false,
        },
        {
          key: 'production-progress',
          label: '生产记录',
          path: '/erp/production/progress',
        },
      ],
    },
  ]
  for (const customerMenuConfig of [null, guidedMenuConfig]) {
    const input = {
      targetKey: 'sales',
      roles,
      customerMenuConfig,
      navigationSections: productionNavigation,
      accessByRoleKey: {
        sales: {
          role_key: 'sales',
          is_final: true,
          pages: [
            { path: '/erp/production/exceptions', effective: true },
            { path: '/erp/production/progress', effective: true },
          ],
        },
      },
    }
    const model = buildPermissionRelationshipNavigationModel(input)
    assert.equal(model.effectivePageCount, 2)
    assert.equal(model.totalItemCount, 1)
    assert.deepEqual(
      model.sections.flatMap((section) =>
        section.items.map((item) => item.path)
      ),
      ['/erp/production/progress']
    )
    const hiddenOnly = buildPermissionRelationshipNavigationModel({
      ...input,
      navigationSections: [
        {
          ...productionNavigation[0],
          items: productionNavigation[0].items.slice(0, 1),
        },
      ],
    })
    assert.equal(hiddenOnly.totalItemCount, 0)
  }
})

test('current customer configuration projects four sidebar areas and keeps page counts distinct', () => {
  const paths = [
    '/erp/dashboard',
    '/erp/task-board',
    '/erp/master/partners/customers',
    '/erp/master/partners/suppliers',
    '/erp/master/products',
    '/erp/sales/project-orders/sales-orders',
    '/erp/production/quality-inspections',
    '/erp/warehouse/inventory',
    '/erp/production/orders',
    '/erp/production/exceptions',
    '/erp/warehouse/shipments',
    '/erp/print-center',
  ]
  const input = {
    targetKey: 'sales',
    roles,
    customerMenuConfig: yoyoosunMenuConfig,
    accessByRoleKey: {
      sales: {
        role_key: 'sales',
        is_final: true,
        pages: paths.map((path) => ({ path, effective: true })),
      },
    },
  }
  const model = buildPermissionRelationshipNavigationModel(input)
  assert.equal(model.mode, 'sectioned')
  assert.equal(model.modeLabel, '按业务模块')
  assert.deepEqual(
    model.sections.map((section) => section.title),
    ['工作中心', '业务模块', '工具与查询', '系统与帮助']
  )
  assert.deepEqual(
    groupItems(model, 'business').map((item) => item.label),
    ['基础资料', '销售管理', '生产管理', '库存管理', '质检管理', '出货管理']
  )
  assert.equal(model.effectivePageCount, 12)
  assert.equal(model.totalItemCount, 11)
  assert.deepEqual(
    groupItems(model, 'tools').map((item) => item.label),
    ['模板打印中心', '历史记录中心']
  )

  const hiddenSales = buildPermissionRelationshipNavigationModel({
    ...input,
    customerMenuConfig: {
      ...yoyoosunMenuConfig,
      desktopMenu: {
        ...yoyoosunMenuConfig.desktopMenu,
        hiddenItemKeys: ['sales-orders'],
      },
    },
  })
  assert.equal(
    groupItems(hiddenSales, 'business').some(
      (item) => item.label === '销售管理'
    ),
    false
  )
  assert.equal(hiddenSales.effectivePageCount, 12)
  assert.equal(hiddenSales.totalItemCount, 10)
})
