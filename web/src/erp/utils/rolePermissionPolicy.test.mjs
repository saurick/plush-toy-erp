import assert from 'node:assert/strict'
import test from 'node:test'
import {
  readRolePermissionPolicy,
  constrainRolePermissionSelection,
} from './rolePermissionPolicy.mjs'

const role = {
  role_key: 'warehouse',
  permissions: ['warehouse.inbound.confirm'],
  permission_policy: {
    template_key: 'warehouse',
    registered: true,
    default_permissions: ['warehouse.inbound.confirm'],
    assignable_permissions: [
      'warehouse.inbound.confirm',
      'erp.print_template.read',
      'finance.payment.post',
    ],
  },
}

test('administrators can remove defaults, add business permissions and clear a role without restoring defaults', () => {
  assert.deepEqual(constrainRolePermissionSelection(role, []), [])
  assert.deepEqual(
    constrainRolePermissionSelection(role, [
      'erp.print_template.read',
      'finance.payment.post',
      'finance.payment.post',
      'system.role.permission.manage',
    ]),
    ['erp.print_template.read', 'finance.payment.post']
  )
  assert.deepEqual(role.permissions, ['warehouse.inbound.confirm'])
  const customized = { ...role, permissions: ['finance.payment.post'] }
  assert.deepEqual(readRolePermissionPolicy(customized).outside, [])
  assert.deepEqual(readRolePermissionPolicy(customized).defaults, ['warehouse.inbound.confirm'])
})

test('non-delegable grants remain visible for repair; incomplete or mismatched policy stays read-only', () => {
  const drift = { ...role, permissions: ['system.role.permission.manage'] }
  assert.deepEqual(readRolePermissionPolicy(drift).outside, ['system.role.permission.manage'])
  for (const policy of [
    null,
    {},
    { ...role.permission_policy, template_key: 'finance' },
    { ...role.permission_policy, default_permissions: undefined },
    { ...role.permission_policy, assignable_permissions: [] },
  ]) {
    const unknown = { ...role, permission_policy: policy }
    assert.equal(readRolePermissionPolicy(unknown).registered, false)
    assert.deepEqual(constrainRolePermissionSelection(unknown, []), role.permissions)
  }
})
