import assert from 'node:assert/strict'
import test from 'node:test'

import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import {
  buildApprovalRoleOptions,
  draftItemFromEditor,
  draftSignature,
  editorValuesForApproval,
  memberLabel,
  normalizeDraftItems,
  roleOptionsForStrategy,
  usersForApprovalRole,
} from './approvalResponsibilityModel.mjs'

const activeSalesAdmin = {
  id: 7,
  display_name: '销售员',
  account_status: 'active',
  roles: [{ role_key: 'sales' }],
}

test('approval responsibility model initializes only configurable items', () => {
  const items = normalizeDraftItems([
    {
      approval_key: 'sales_order',
      configurable: true,
      configured: false,
      enabled: false,
      members: [],
    },
    {
      approval_key: 'payment',
      configurable: false,
      configured: true,
      enabled: true,
      members: [],
    },
  ])
  assert.deepEqual(
    items.map((item) => item.approval_key),
    ['sales_order', 'purchase_order', 'shipment_finance']
  )
  assert.equal(items[0].enabled, true)
  assert.equal(items[0].members[0].role_key, 'sales')
  assert.equal(
    items.some((item) => item.approval_key === 'payment'),
    false
  )
})

test('approval role and user choices fail closed on permissions and duplicates', () => {
  const roleOptions = buildApprovalRoleOptions({
    admins: [activeSalesAdmin],
    currentAdmin: { id: 8, roles: [] },
    draftItems: [],
    roles: [
      {
        role_key: 'sales',
        permissions: [PermissionCode.WORKFLOW_TASK_APPROVE],
      },
      { role_key: 'purchase', permissions: [] },
    ],
  })
  assert.equal(
    roleOptions.find((option) => option.value === 'sales').eligible,
    true
  )
  assert.equal(
    roleOptions.find((option) => option.value === 'purchase').reason,
    '未开启审批功能'
  )

  const editorValues = {
    primary_role: 'sales',
    primary_mode: 'role',
    backup_mode: 'role',
  }
  assert.equal(
    roleOptionsForStrategy({
      roleOptions,
      editorValues,
      strategyKey: 'backup',
    }).find((option) => option.value === 'sales').disabled,
    true
  )
  assert.equal(
    usersForApprovalRole({
      admins: [activeSalesAdmin],
      currentAdmin: { id: 8 },
      editorValues: {
        primary_role: 'sales',
        primary_mode: 'user',
        primary_user: 7,
      },
      roleKey: 'sales',
      selectedUserID: 7,
      strategyKey: 'backup',
    })[0].reason,
    '已用于主办责任'
  )
})

test('approval editor produces one canonical draft and rejects repeated responsibility', () => {
  const initial = normalizeDraftItems([])
  const values = editorValuesForApproval('sales_order', initial)
  const draft = draftItemFromEditor('sales_order', values)
  assert.equal(draft.enabled, true)
  assert.equal(draft.members[0].role_key, 'sales')
  assert.equal(
    draftSignature([
      { approval_key: 'sales_order', configured: false, ...draft },
    ]),
    draftSignature([
      {
        approval_key: 'sales_order',
        configured: true,
        ...draft,
        members: [...draft.members].reverse(),
      },
    ])
  )

  assert.throws(
    () =>
      draftItemFromEditor('sales_order', {
        ...values,
        backup_role: 'sales',
        backup_mode: 'role',
      }),
    /不能重复承担多个责任层级/u
  )
})

test('approval responsibility labels do not disguise a missing assigned employee as a role pool', () => {
  assert.equal(
    memberLabel(
      {
        role_key: 'sales',
        user_id: 99,
        strategy: 'primary',
      },
      new Map()
    ),
    '主办 · 业务 · 人员信息待核对'
  )
  assert.equal(
    memberLabel(
      {
        role_key: 'sales',
        user_id: 0,
        strategy: 'primary',
      },
      new Map()
    ),
    '主办 · 业务'
  )
})
