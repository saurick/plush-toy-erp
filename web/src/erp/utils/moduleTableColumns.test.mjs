import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyModuleColumnOrder,
  buildModuleColumnOrder,
  moveModuleColumnOrder,
  repositionModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from './moduleTableColumns.mjs'

const columns = [
  { label: '编码', key: 'code' },
  { label: '客户', key: 'customerName' },
  { label: '金额', key: 'amount' },
]

test('moduleTableColumns: 会生成稳定列顺序 key', () => {
  assert.deepEqual(buildModuleColumnOrder(columns), [
    'code',
    'customerName',
    'amount',
  ])
})

test('moduleTableColumns: 会过滤非法和重复列 key', () => {
  assert.deepEqual(
    sanitizeModuleColumnOrder(['amount', 'unknown', 'amount', 'code'], columns),
    ['amount', 'code']
  )
})

test('moduleTableColumns: 会按用户顺序重排列，并把新增列补到末尾', () => {
  assert.deepEqual(applyModuleColumnOrder(columns, ['amount', 'code']), [
    columns[2],
    columns[0],
    columns[1],
  ])
})

test('moduleTableColumns: 支持列顺序上移和下移', () => {
  assert.deepEqual(
    moveModuleColumnOrder(
      ['code', 'customerName', 'amount'],
      columns,
      'amount',
      -1
    ),
    ['code', 'amount', 'customerName']
  )
  assert.deepEqual(
    moveModuleColumnOrder(
      ['code', 'customerName', 'amount'],
      columns,
      'code',
      -1
    ),
    ['code', 'customerName', 'amount']
  )
})

test('moduleTableColumns: 支持把列移动到指定位置', () => {
  assert.deepEqual(
    repositionModuleColumnOrder(
      ['code', 'customerName', 'amount'],
      columns,
      'amount',
      0
    ),
    ['amount', 'code', 'customerName']
  )
  assert.deepEqual(
    repositionModuleColumnOrder(
      ['code', 'customerName', 'amount'],
      columns,
      'code',
      2
    ),
    ['customerName', 'amount', 'code']
  )
})
