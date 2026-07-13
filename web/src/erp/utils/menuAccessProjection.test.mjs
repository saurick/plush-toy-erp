import assert from 'node:assert/strict'
import test from 'node:test'

import { isMenuVisibleForPermissionKeys } from './menuAccessProjection.mjs'

test('菜单投影分别执行 ANY 与 ALL 权限合同', () => {
  const menu = {
    required_any: ['finance.receivable.read', 'finance.payable.read'],
    required_all: ['finance.report.read'],
  }

  assert.equal(
    isMenuVisibleForPermissionKeys(menu, [
      'finance.payable.read',
      'finance.report.read',
    ]),
    true
  )
  assert.equal(
    isMenuVisibleForPermissionKeys(menu, ['finance.payable.read']),
    false
  )
  assert.equal(
    isMenuVisibleForPermissionKeys(menu, ['finance.report.read']),
    false
  )
})

test('旧 required_permissions 仍按 ANY 兼容', () => {
  assert.equal(
    isMenuVisibleForPermissionKeys(
      { required_permissions: ['system.user.read', 'system.role.read'] },
      ['system.role.read']
    ),
    true
  )
})
