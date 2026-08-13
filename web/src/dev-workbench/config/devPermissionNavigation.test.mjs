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
        label: '岗位使用帮助',
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
    ['客户档案', '销售订单', '出货单']
  )
  assert.deepEqual(
    model.secondarySections.map((section) => [
      section.title,
      section.items.map((item) => item.label),
    ]),
    [
      ['库存管理', ['库存台账']],
      ['使用帮助', ['岗位使用帮助']],
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
    ['库存台账', '销售订单']
  )
  assert.deepEqual(
    model.secondarySections.flatMap((section) =>
      section.items.map((item) => item.label)
    ),
    ['客户档案', '出货单', '岗位使用帮助']
  )
})

test('employee menu projection merges multiple roles once and marks an inactive account', () => {
  const model = buildPermissionRelationshipNavigationModel({
    viewMode: PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT,
    targetKey: '20',
    accounts: [
      {
        id: 20,
        username: '小吴',
        account_status: 'suspended',
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

  assert.equal(model.state, PERMISSION_NAVIGATION_STATE.BLOCKED)
  assert.equal(model.modeLabel, '多岗位合并（2）')
  assert.match(model.notice, /临时停用/u)
  assert.equal(model.effectivePageCount, 7)
  assert.deepEqual(
    model.primaryItems.map((item) => item.label),
    ['客户档案', '应收管理', '销售订单', '出货单', '库存台账']
  )
  assert.equal(
    model.primaryItems.filter((item) => item.label === '出货单').length,
    1
  )
  assert.deepEqual(
    model.secondarySections.at(-1).items.map((item) => item.label),
    ['岗位使用帮助']
  )
})

test('menu projection fails closed for partial access instead of showing a partial sidebar', () => {
  const model = buildPermissionRelationshipNavigationModel({
    viewMode: PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT,
    targetKey: '21',
    accounts: [
      {
        id: 21,
        username: '小陈',
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
        username: '系统管理员',
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
  assert.equal(model.modeLabel, '系统保留账号')
  assert.match(model.message, /不推导可能失真的完整菜单/u)
})
