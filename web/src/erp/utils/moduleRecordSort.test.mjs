import assert from 'node:assert/strict'
import test from 'node:test'

import { sortModuleRecords } from './moduleRecordSort.mjs'

test('moduleRecordSort: 默认按最新创建时间倒序', () => {
  const input = [
    { id: 1, created_at: 1700000000 },
    { id: 3, created_at: 1700000002 },
    { id: 2, created_at: 1700000001 },
  ]

  const sorted = sortModuleRecords(input)

  assert.deepEqual(
    sorted.map((item) => item.id),
    [3, 2, 1]
  )
})

test('moduleRecordSort: 支持按最早创建时间正序', () => {
  const input = [
    { id: 3, created_at: 1700000002 },
    { id: 1, created_at: 1700000000 },
    { id: 2, created_at: 1700000001 },
  ]

  const sorted = sortModuleRecords(input, 'asc')

  assert.deepEqual(
    sorted.map((item) => item.id),
    [1, 2, 3]
  )
})

test('moduleRecordSort: created_at 相同时按 id 保持稳定顺序', () => {
  const input = [
    { id: 2, created_at: 1700000000 },
    { id: 3, created_at: 1700000000 },
    { id: 1, created_at: 1700000000 },
  ]

  assert.deepEqual(
    sortModuleRecords(input, 'desc').map((item) => item.id),
    [3, 2, 1]
  )
  assert.deepEqual(
    sortModuleRecords(input, 'asc').map((item) => item.id),
    [1, 2, 3]
  )
})

test('moduleRecordSort: 客户名称按英文字母升序或降序排列', () => {
  const input = [
    { id: 1, created_at: 1700000000, customer_name: 'Beta Trading' },
    { id: 2, created_at: 1700000001, customer_name: 'alpha toys' },
    { id: 3, created_at: 1700000002, customer_name: 'Zeta Plush' },
  ]

  assert.deepEqual(
    sortModuleRecords(input, {
      dataIndex: 'customer_name',
      order: 'asc',
    }).map((item) => item.customer_name),
    ['alpha toys', 'Beta Trading', 'Zeta Plush']
  )
  assert.deepEqual(
    sortModuleRecords(input, {
      dataIndex: 'customer_name',
      order: 'desc',
    }).map((item) => item.customer_name),
    ['Zeta Plush', 'Beta Trading', 'alpha toys']
  )
})

test('moduleRecordSort: 数字字段按数值排序且空值排最后', () => {
  const input = [
    { id: 1, created_at: 1700000000, amount: '10' },
    { id: 2, created_at: 1700000001, amount: '' },
    { id: 3, created_at: 1700000002, amount: '2' },
  ]

  assert.deepEqual(
    sortModuleRecords(input, {
      dataIndex: 'amount',
      order: 'asc',
    }).map((item) => item.id),
    [3, 1, 2]
  )
  assert.deepEqual(
    sortModuleRecords(input, {
      dataIndex: 'amount',
      order: 'desc',
    }).map((item) => item.id),
    [1, 3, 2]
  )
})

test('moduleRecordSort: 支持 payload 路径和明细行数排序', () => {
  const input = [
    {
      id: 1,
      created_at: 1700000000,
      payload: { supplier_short_name: 'Sun' },
      items: [{ id: 1 }, { id: 2 }],
    },
    {
      id: 2,
      created_at: 1700000001,
      payload: { supplier_short_name: 'moon' },
      items: [{ id: 3 }],
    },
    {
      id: 3,
      created_at: 1700000002,
      payload: { supplier_short_name: 'Apple' },
      items: [],
    },
  ]

  assert.deepEqual(
    sortModuleRecords(input, {
      dataIndex: 'payload.supplier_short_name',
      order: 'asc',
    }).map((item) => item.id),
    [3, 2, 1]
  )
  assert.deepEqual(
    sortModuleRecords(input, {
      dataIndex: 'items',
      order: 'desc',
    }).map((item) => item.id),
    [1, 2, 3]
  )
})

test('moduleRecordSort: 非数组输入返回空数组', () => {
  assert.deepEqual(sortModuleRecords(null), [])
  assert.deepEqual(sortModuleRecords(undefined), [])
})
