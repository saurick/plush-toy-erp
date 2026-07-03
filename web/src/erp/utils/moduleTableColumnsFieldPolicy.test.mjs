import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyModuleColumnOrder,
  buildModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from './moduleTableColumns.mjs'

const columns = [
  { title: '单号', dataIndex: 'order_no' },
  { title: '来源单号', dataIndex: 'source_no', hiddenByEffectiveFieldPolicy: true },
  { title: '交期', dataIndex: 'expected_ship_date' },
]

test('moduleTableColumns: field policy hidden columns are excluded from order', () => {
  assert.deepEqual(buildModuleColumnOrder(columns), [
    'order_no',
    'expected_ship_date',
  ])
  assert.deepEqual(
    sanitizeModuleColumnOrder(['source_no', 'expected_ship_date', 'order_no'], columns),
    ['expected_ship_date', 'order_no']
  )
})

test('moduleTableColumns: field policy hidden columns do not return as remaining columns', () => {
  assert.deepEqual(applyModuleColumnOrder(columns, ['expected_ship_date']), [
    columns[2],
    columns[0],
  ])
})
