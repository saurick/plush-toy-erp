import assert from 'node:assert/strict'
import test from 'node:test'

import { hasMobileRolePermission } from './mobileRolePermissions.mjs'

test('mobileRolePermissions: 超级管理员拥有全部移动端角色权限', () => {
  assert.equal(
    hasMobileRolePermission({ level: 0, mobile_role_permissions: [] }, 'boss'),
    true
  )
})

test('mobileRolePermissions: 缺失管理员等级不会被误判成超级管理员', () => {
  assert.equal(
    hasMobileRolePermission(
      { level: null, mobile_role_permissions: [] },
      'boss'
    ),
    false
  )
})
