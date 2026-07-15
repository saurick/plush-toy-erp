import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DASHBOARD_TRUTH_KINDS,
  dashboardHealthModules,
} from '../config/dashboardModules.mjs'
import { ERP_MENU_PERMISSION_OPTIONS } from '../config/menuPermissions.mjs'
import {
  buildDashboardModuleRows,
  buildDashboardSummary,
  normalizeDashboardModuleStats,
} from './dashboardStats.mjs'

function configuredSources() {
  return dashboardHealthModules.flatMap((moduleItem) => moduleItem.sources)
}

function availableStats(overrides = {}) {
  return configuredSources().map((source, index) => ({
    module_key: source.key,
    available: true,
    total: index + 1,
    ...(overrides[source.key] || {}),
  }))
}

function findRow(rows, key) {
  return rows.find((row) => row.key === key)
}

function findSource(rows, key) {
  return rows.flatMap((row) => row.sources).find((source) => source.key === key)
}

test('dashboardStats: 保留大数和真实零，并给每个对象独立入口而不跨口径合计', () => {
  const rows = buildDashboardModuleRows(
    dashboardHealthModules,
    availableStats({
      customers: { total: 1_234_567 },
      suppliers: { total: 33 },
      'production-exceptions': { total: 0 },
    })
  )

  assert.equal(Object.hasOwn(findRow(rows, 'partner-master'), 'count'), false)
  assert.deepEqual(findSource(rows, 'customers'), {
    key: 'customers',
    label: '客户',
    path: '/erp/master/partners/customers',
    truthKind: DASHBOARD_TRUTH_KINDS.MASTER_DATA,
    available: true,
    total: 1_234_567,
  })
  assert.deepEqual(findSource(rows, 'production-exceptions'), {
    key: 'production-exceptions',
    label: '生产异常',
    path: '/erp/production/exceptions',
    truthKind: DASHBOARD_TRUTH_KINDS.COLLABORATION,
    available: true,
    total: 0,
  })
})

test('dashboardStats: 缺少对象或服务端标记不可用时不伪装成零', () => {
  const withoutSuppliers = availableStats().filter(
    (item) => item.module_key !== 'suppliers'
  )
  const rows = buildDashboardModuleRows(dashboardHealthModules, [
    ...withoutSuppliers,
    { module_key: 'invoices', available: false, total: 0 },
  ])

  assert.equal(findSource(rows, 'suppliers')?.available, false)
  assert.equal(findSource(rows, 'suppliers')?.total, null)
  assert.equal(findSource(rows, 'invoices')?.available, false)
  assert.equal(findSource(rows, 'invoices')?.total, null)
  assert.equal(Object.hasOwn(findRow(rows, 'finance-facts'), 'count'), false)
})

test('dashboardStats: 顶部三项只按各自口径求和，协同对象不混入', () => {
  const stats = configuredSources().map((source) => ({
    module_key: source.key,
    available: true,
    total: 1,
  }))
  const summary = buildDashboardSummary(
    buildDashboardModuleRows(dashboardHealthModules, stats)
  )

  assert.deepEqual(summary[DASHBOARD_TRUTH_KINDS.MASTER_DATA], {
    available: true,
    total: 4,
  })
  assert.deepEqual(summary[DASHBOARD_TRUTH_KINDS.SOURCE_DOCUMENT], {
    available: true,
    total: 4,
  })
  assert.deepEqual(summary[DASHBOARD_TRUTH_KINDS.BUSINESS_FACT], {
    available: true,
    total: 9,
  })
  assert.equal(
    Object.hasOwn(summary, DASHBOARD_TRUTH_KINDS.COLLABORATION),
    false
  )
})

test('dashboardStats: ready 全库矩阵固定为 191/135/0，协同 40 不混入', () => {
  const totals = {
    customers: 60,
    suppliers: 60,
    products: 24,
    'material-bom': 47,
    'sales-orders': 45,
    'accessories-purchase': 45,
    'processing-contracts': 45,
    'production-scheduling': 20,
    'production-exceptions': 20,
  }
  const rows = buildDashboardModuleRows(
    dashboardHealthModules,
    configuredSources().map((source) => ({
      module_key: source.key,
      available: true,
      total: totals[source.key] || 0,
    }))
  )
  const summary = buildDashboardSummary(rows)
  const collaborationTotal = rows
    .flatMap((row) => row.sources)
    .filter(
      (source) => source.truthKind === DASHBOARD_TRUTH_KINDS.COLLABORATION
    )
    .reduce((sum, source) => sum + source.total, 0)

  assert.deepEqual(summary[DASHBOARD_TRUTH_KINDS.MASTER_DATA], {
    available: true,
    total: 191,
  })
  assert.deepEqual(summary[DASHBOARD_TRUTH_KINDS.SOURCE_DOCUMENT], {
    available: true,
    total: 135,
  })
  assert.deepEqual(summary[DASHBOARD_TRUTH_KINDS.BUSINESS_FACT], {
    available: true,
    total: 0,
  })
  assert.equal(collaborationTotal, 40)
})

test('dashboardStats: 任一必需对象不可用时只关闭对应顶部口径', () => {
  const rows = buildDashboardModuleRows(
    dashboardHealthModules,
    availableStats({ invoices: { available: false, total: 0 } })
  )
  const summary = buildDashboardSummary(rows)

  assert.equal(summary[DASHBOARD_TRUTH_KINDS.MASTER_DATA].available, true)
  assert.equal(summary[DASHBOARD_TRUTH_KINDS.SOURCE_DOCUMENT].available, true)
  assert.deepEqual(summary[DASHBOARD_TRUTH_KINDS.BUSINESS_FACT], {
    available: false,
    total: null,
  })
})

test('dashboardStats: 只有 available=true 且总数有效时才可展示', () => {
  assert.deepEqual(
    normalizeDashboardModuleStats({
      module_key: 'customers',
      available: true,
      total: 0,
    }),
    { moduleKey: 'customers', available: true, total: 0 }
  )
  assert.deepEqual(
    normalizeDashboardModuleStats({
      module_key: 'customers',
      available: true,
      total: -1,
    }),
    { moduleKey: 'customers', available: false, total: null }
  )
  assert.deepEqual(
    normalizeDashboardModuleStats({
      module_key: 'customers',
      available: false,
      total: 12,
    }),
    { moduleKey: 'customers', available: false, total: null }
  )
})

test('dashboardStats: 每个对象入口都来自正式菜单路径，由统一路由守卫继续鉴权', () => {
  const registeredMenuPaths = new Set(
    ERP_MENU_PERMISSION_OPTIONS.map((item) => item.key)
  )

  for (const source of configuredSources()) {
    assert.equal(
      registeredMenuPaths.has(source.path),
      true,
      `${source.label} 使用了未登记的页面路径 ${source.path}`
    )
  }
})
