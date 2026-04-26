import assert from 'node:assert/strict'
import test from 'node:test'

import { hasMobileRolePermission } from './mobileRolePermissions.mjs'

test('mobileRolePermissions: 超级管理员拥有全部移动端角色权限', () => {
  assert.equal(
    hasMobileRolePermission({ is_super_admin: true, permissions: [] }, 'boss'),
    true
  )
})

test('mobileRolePermissions: 缺失超级管理员标识不会被误判成超级管理员', () => {
  assert.equal(
    hasMobileRolePermission({ is_super_admin: false, permissions: [] }, 'boss'),
    false
  )
})

test('mobileRolePermissions: 移动端入口由权限码或角色控制', () => {
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
    true
  )
})
