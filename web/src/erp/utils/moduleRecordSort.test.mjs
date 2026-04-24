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

test('moduleRecordSort: 非数组输入返回空数组', () => {
  assert.deepEqual(sortModuleRecords(null), [])
  assert.deepEqual(sortModuleRecords(undefined), [])
})
