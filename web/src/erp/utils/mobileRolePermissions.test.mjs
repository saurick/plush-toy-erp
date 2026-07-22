import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getAllowedMobileRoleKeys,
  hasMobileRolePermission,
} from './mobileRolePermissions.mjs'

test('mobileRolePermissions: 超级管理员不自动获得业务岗位任务端入口', () => {
  assert.equal(
    hasMobileRolePermission(
      {
        is_super_admin: true,
        permissions: ['mobile.boss.access'],
        roles: [{ role_key: 'admin' }],
      },
      'boss'
    ),
    false
  )
  assert.equal(
    hasMobileRolePermission(
      {
        is_super_admin: true,
        permissions: ['mobile.boss.access'],
        roles: [{ role_key: 'admin' }, { role_key: 'boss' }],
      },
      'boss'
    ),
    true
  )
})

test('mobileRolePermissions: 缺失超级管理员标识不会被误判成超级管理员', () => {
  assert.equal(
    hasMobileRolePermission({ is_super_admin: false, permissions: [] }, 'boss'),
    false
  )
})

test('mobileRolePermissions: 岗位任务端入口只由权限码控制', () => {
  assert.equal(
    hasMobileRolePermission(
      { permissions: ['mobile.purchase.access'], roles: [] },
      'purchase'
    ),
    true
  )
  assert.equal(
    hasMobileRolePermission(
      { permissions: [], roles: [{ role_key: 'warehouse' }] },
      'warehouse'
    ),
    false
  )
})

test('mobileRolePermissions: 九个岗位任务端角色入口使用独立权限码', () => {
  const cases = [
    ['boss', 'mobile.boss.access'],
    ['sales', 'mobile.sales.access'],
    ['purchase', 'mobile.purchase.access'],
    ['production', 'mobile.production.access'],
    ['warehouse', 'mobile.warehouse.access'],
    ['quality', 'mobile.quality.access'],
    ['finance', 'mobile.finance.access'],
    ['pmc', 'mobile.pmc.access'],
    ['engineering', 'mobile.engineering.access'],
  ]

  for (const [roleKey, permissionKey] of cases) {
    assert.equal(
      hasMobileRolePermission({ permissions: [permissionKey] }, roleKey),
      true
    )
  }

  assert.equal(
    hasMobileRolePermission(
      { permissions: ['mobile.finance.access'] },
      'warehouse'
    ),
    false
  )
})

test('mobileRolePermissions: 未知岗位任务端角色不默认放行', () => {
  assert.equal(
    hasMobileRolePermission({ permissions: ['mobile.unknown.access'] }, 'foo'),
    false
  )
})

test('mobileRolePermissions: 可按权限筛出允许进入的岗位角色', () => {
  assert.deepEqual(
    getAllowedMobileRoleKeys(
      { permissions: ['mobile.quality.access', 'mobile.warehouse.access'] },
      ['boss', 'quality', 'warehouse']
    ),
    ['quality', 'warehouse']
  )
})
