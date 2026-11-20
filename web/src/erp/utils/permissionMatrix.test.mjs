import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPermissionMatrixRows,
  isSensitivePermission,
} from './permissionMatrix.mjs'

const permissions = [
  {
    key: 'bom.activate',
    label: '激活 BOM 版本',
    resource: 'version',
    action: 'activate',
  },
  {
    key: 'bom.create',
    label: '创建 BOM 版本',
    resource: 'version',
    action: 'create',
  },
  { key: 'bom.read', label: '查看 BOM', resource: 'version', action: 'read' },
  {
    key: 'bom.update',
    label: '维护 BOM 草稿',
    resource: 'version',
    action: 'update',
  },
]

test('matrix keeps one control per permission and groups by API resource', () => {
  const rows = buildPermissionMatrixRows(permissions)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].label, 'BOM')
  assert.deepEqual(
    rows[0].cells.other.map((item) => item.key),
    ['bom.activate']
  )
  assert.deepEqual(
    Object.values(rows[0].cells)
      .flat()
      .map((item) => item.key)
      .sort(),
    permissions.map((item) => item.key).sort()
  )
})

test('search keeps the original object title and does not invent missing actions', () => {
  const [row] = buildPermissionMatrixRows([permissions[0]], permissions)
  assert.equal(row.label, 'BOM')
  assert.deepEqual(row.cells.read, [])
  assert.ok(row.availableColumns.includes('read'))
  assert.equal(row.cells.other[0], permissions[0])
})

test('distinct approval permissions stay independently selectable and sensitive', () => {
  const items = [
    {
      key: 'engineering.material.boss_approve',
      label: '审核工程用料',
      resource: 'material',
      action: 'boss_approve',
    },
    {
      key: 'engineering.material.finance_approve',
      label: '审核批准工程采购',
      resource: 'material',
      action: 'finance_approve',
    },
  ]
  const [row] = buildPermissionMatrixRows(items)
  assert.deepEqual(row.cells.other, items)
  assert.ok(items.every(isSensitivePermission))
  assert.ok(isSensitivePermission({ action: 'reverse' }))
  assert.ok(!isSensitivePermission({ action: 'read' }))
})

test('missing resource metadata never merges unrelated permissions or drops an action', () => {
  const items = [
    { key: 'one', label: '查看资料', action: 'read' },
    { key: 'two', label: '查看资料', action: 'read' },
    {
      key: 'three',
      label: '调整专有操作',
      resource: 'new_object',
      action: 'special',
    },
  ]
  const rows = buildPermissionMatrixRows(items)
  assert.equal(rows.length, 3)
  assert.deepEqual(rows[2].cells.other, [items[2]])
})
