import assert from 'node:assert/strict'
import test from 'node:test'

import { dashboardHealthModules } from '../config/dashboardModules.mjs'
import { buildDashboardModuleRows } from './dashboardStats.mjs'

function findRow(rows, key) {
  return rows.find((row) => row.key === key)
}

test('dashboardStats: 对象族健康行按后端 projection keys 聚合', () => {
  const rows = buildDashboardModuleRows(dashboardHealthModules, [
    { module_key: 'customers', total: 2 },
    { module_key: 'suppliers', total: 3 },
    {
      module_key: 'sales-orders',
      total: 5,
      status_counts: { material_preparing: 2, blocked: 1 },
    },
    { module_key: 'accessories-purchase', total: 7 },
    {
      module_key: 'inbound',
      total: 11,
      status_counts: { warehouse_processing: 4 },
    },
    { module_key: 'unknown-module', total: 999 },
  ])

  assert.equal(findRow(rows, 'partner-master')?.count, 5)
  assert.deepEqual(findRow(rows, 'partner-master')?.sourceKeys, [
    'customers',
    'suppliers',
  ])
  assert.equal(findRow(rows, 'purchase-inbound')?.count, 18)
  assert.equal(
    findRow(rows, 'purchase-inbound')?.statusGroupCounts.warehouse,
    4
  )
  assert.equal(findRow(rows, 'sales-orders')?.statusGroupCounts.material, 2)
  assert.equal(findRow(rows, 'sales-orders')?.statusGroupCounts.blocked, 1)
})
