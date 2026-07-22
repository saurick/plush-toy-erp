import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildRoleGuidedNavigation,
  buildRoleGuidedNavigationPreview,
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

test('roleGuidedNavigation: 财务常用入口优先应付、应收和发票，对账归入更多功能', () => {
  const result = buildRoleGuidedNavigation({
    visibleSections: [
      {
        title: '财务管理',
        items: [
          { key: 'reconciliation', path: '/erp/finance/reconciliation' },
          { key: 'payables', path: '/erp/finance/payables' },
          { key: 'receivables', path: '/erp/finance/receivables' },
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
      '/erp/finance/payables',
      '/erp/finance/receivables',
      '/erp/finance/invoices',
    ]
  )
  assert.deepEqual(
    result.secondarySections.flatMap((section) =>
      section.items.map((item) => item.path)
    ),
    ['/erp/finance/reconciliation', '/erp/help-center']
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
          { key: 'payables', path: '/erp/finance/payables' },
          { key: 'receivables', path: '/erp/finance/receivables' },
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
      '/erp/finance/payables',
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
