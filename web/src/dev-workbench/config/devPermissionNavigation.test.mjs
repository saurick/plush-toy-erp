import assert from 'node:assert/strict'
import test from 'node:test'
import { PERMISSION_RELATIONSHIP_VIEW_MODE } from './devPermissionRelationshipGraph.mjs'
import {
  PERMISSION_NAVIGATION_STATE,
  buildPermissionRelationshipNavigationModel,
} from './devPermissionNavigation.mjs'

const navigationSections = [
  {
    key: 'dashboards',
    title: '看板中心',
    items: [
      {
        key: 'global-dashboard',
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

test('role menu projection shows complete recommended navigation without inventing entries', () => {
  const model = buildPermissionRelationshipNavigationModel({
    viewMode: PERMISSION_RELATIONSHIP_VIEW_MODE.ROLE,
    targetKey: 'sales',
    roles,
    accessByRoleKey,
    navigationSections,
  })

  assert.equal(model.state, PERMISSION_NAVIGATION_STATE.READY)
  assert.equal(model.modeLabel, '系统推荐')
  assert.equal(model.contextLabel, '业务')
  assert.equal(model.effectivePageCount, 5)
  assert.deepEqual(
    model.dashboardItems.map((item) => item.label),
    ['工作台']
  )
  assert.deepEqual(
    model.primaryItems.map((item) => item.label),
    ['基础资料', '销售管理', '出货管理']
  )
  assert.deepEqual(
    model.secondarySections.map((section) => [
      section.title,
      section.items.map((item) => item.label),
    ]),
    [
      ['业务模块', ['库存管理']],
      ['工具与查询', ['帮助中心']],
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
  })

  assert.equal(model.modeLabel, '自定义布局')
  assert.deepEqual(
    model.primaryItems.map((item) => item.label),
    ['库存管理', '销售管理']
  )
  assert.deepEqual(
    model.secondarySections.flatMap((section) =>
      section.items.map((item) => item.label)
    ),
    ['基础资料', '出货管理', '帮助中心']
  )
})

test('employee menu projection merges multiple active roles once', () => {
  const model = buildPermissionRelationshipNavigationModel({
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
    model.primaryItems.map((item) => item.label),
    ['基础资料', '财务管理', '销售管理', '出货管理', '库存管理']
  )
  assert.equal(
    model.primaryItems.filter((item) => item.label === '出货管理').length,
    1
  )
  assert.deepEqual(
    model.secondarySections.at(-1).items.map((item) => item.label),
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
  const model = buildPermissionRelationshipNavigationModel({ viewMode: 'account',
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
  const model = buildPermissionRelationshipNavigationModel({ viewMode: 'account',
targetKey: '2',
    accounts: [{ id: 2, account_status: 'active', roles }],
    roles: [roles[0], { ...roles[1], disabled: true }],
    accessByRoleKey: { ...accessByRoleKey, finance: { ...accessByRoleKey.finance, is_final: false } },
navigationSections,
  })
  assert.equal(model.state, PERMISSION_NAVIGATION_STATE.READY)
  assert.equal(model.effectivePageCount, 5)
  assert.ok(!model.primaryItems.some((item) => item.label === '财务管理'))
})

test('a role version mismatch prevents a saved layout from being paired with stale access', () => {
  const model = buildPermissionRelationshipNavigationModel({ targetKey: 'sales',
    roles: [{ ...roles[0], version: 2 }],
accessByRoleKey: { sales: { ...accessByRoleKey.sales, role_version: 1 } },
navigationSections,
  })
  assert.equal(model.state, PERMISSION_NAVIGATION_STATE.UNAVAILABLE)
  assert.equal(model.totalItemCount, 0)
})
