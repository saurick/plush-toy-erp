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
    required_permissions: ['warehouse.inbound.confirm'],
    optional_permissions: ['erp.print_template.read'],
  },
}

test('role selection retains duties and rejects unrelated functions', () => {
  assert.deepEqual(constrainRolePermissionSelection(role, []), [
    'warehouse.inbound.confirm',
  ])
  assert.deepEqual(
    constrainRolePermissionSelection(role, [
      'erp.print_template.read',
      'finance.payment.post',
    ]),
    ['warehouse.inbound.confirm', 'erp.print_template.read']
  )
  assert.deepEqual(role.permissions, ['warehouse.inbound.confirm'])
})

test('saved drift remains visible until explicitly repaired; incomplete or mismatched policy is read-only', () => {
  const drift = { ...role, permissions: ['finance.payment.post'] }
  assert.deepEqual(readRolePermissionPolicy(drift).missing, [
    'warehouse.inbound.confirm',
  ])
  assert.deepEqual(readRolePermissionPolicy(drift).outside, [
    'finance.payment.post',
  ])
  for (const policy of [
    null,
    {},
    { ...role.permission_policy, template_key: 'finance' },
    { ...role.permission_policy, required_permissions: undefined },
  ]) {
    const unknown = { ...role, permission_policy: policy }
    assert.equal(readRolePermissionPolicy(unknown).registered, false)
    assert.deepEqual(
      constrainRolePermissionSelection(unknown, []),
      role.permissions
    )
  }
})
