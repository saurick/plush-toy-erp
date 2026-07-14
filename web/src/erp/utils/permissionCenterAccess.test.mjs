import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildAssignableRoleOptions,
  filterAssignableBusinessPermissions,
  getAdminControlTargetBlockReason,
  getPermissionCenterRoleVersion,
  getRoleAssignmentBlockReason,
  getRolePermissionReadOnlyReason,
  getRoleTypeLabel,
  isSameAdminAccount,
  normalizePermissionUsage,
} from './permissionCenterAccess.mjs'

const roles = [
  {
    role_key: 'admin',
    name: '系统管理员',
    role_type: 'system',
    assignable: false,
    assignable_by_current_admin: true,
    permissions_editable: false,
    permissions_editable_by_current_admin: false,
    version: 3,
  },
  {
    role_key: 'sales',
    name: '业务员',
    role_type: 'business_default',
    assignable: true,
    assignable_by_current_admin: true,
    permissions_editable: true,
    permissions_editable_by_current_admin: true,
    version: 4,
  },
  {
    role_key: 'debug_operator',
    name: '调试操作员',
    role_type: 'system',
    assignable: true,
    assignable_by_current_admin: false,
    permissions_editable: false,
    permissions_editable_by_current_admin: false,
    non_production_only: true,
    version: 2,
  },
  {
    role_key: 'quality_custom',
    name: '品质复核',
    role_type: 'custom',
    assignable: true,
    assignable_by_current_admin: true,
    permissions_editable: true,
    permissions_editable_by_current_admin: true,
    version: 1,
  },
  {
    role_key: 'trial_helper',
    name: '试用协助',
    role_type: 'business_default',
    assignable: true,
    assignable_by_current_admin: true,
    permissions_editable: true,
    permissions_editable_by_current_admin: true,
    non_production_only: true,
    version: 1,
  },
]

test('permissionCenterAccess: 角色候选只消费后端针对当前账号的可分配结论', () => {
  assert.deepEqual(buildAssignableRoleOptions(roles), [
    { label: '系统管理员', value: 'admin' },
    { label: '业务员', value: 'sales' },
    { label: '品质复核', value: 'quality_custom' },
    { label: '试用协助', value: 'trial_helper' },
  ])
  assert.deepEqual(buildAssignableRoleOptions(roles, { isProduction: true }), [
    { label: '系统管理员', value: 'admin' },
    { label: '业务员', value: 'sales' },
    { label: '品质复核', value: 'quality_custom' },
    { label: '试用协助', value: 'trial_helper' },
  ])
  assert.deepEqual(
    buildAssignableRoleOptions([
      {
        role_key: 'system_without_metadata',
        role_type: 'system',
        assignable: true,
      },
      {
        role_key: 'business_without_metadata',
        role_type: 'business_default',
        assignable: true,
      },
      {
        role_key: 'custom_without_metadata',
        role_type: 'custom',
        assignable: true,
      },
    ]),
    []
  )
})

test('permissionCenterAccess: 权限候选只保留后端明确可分配的业务权限', () => {
  const permissions = [
    {
      permission_key: 'purchase.order.read',
      class: 'business',
      assignable: true,
    },
    {
      permission_key: 'system.user.read',
      class: 'control_plane',
      assignable: false,
    },
    {
      permission_key: 'debug.seed',
      class: 'debug',
      assignable: false,
      non_production_only: true,
    },
    {
      permission_key: 'workflow.task.read',
      class: 'business',
    },
    {
      permission_key: 'trial.preview.read',
      permission_class: 'business',
      assignable: true,
      non_production_only: true,
    },
  ]

  assert.deepEqual(filterAssignableBusinessPermissions(permissions), [
    permissions[0],
    permissions[4],
  ])
  assert.deepEqual(
    filterAssignableBusinessPermissions(permissions, { isProduction: true }),
    [permissions[0]]
  )
})

test('permissionCenterAccess: 系统角色和不完整角色保持只读', () => {
  assert.equal(getRoleTypeLabel(roles[0]), '产品系统角色')
  assert.match(getRolePermissionReadOnlyReason(roles[0]), /系统统一维护/u)
  assert.equal(getRolePermissionReadOnlyReason(roles[1]), '')
  assert.match(
    getRolePermissionReadOnlyReason({
      role_key: 'purchase',
      role_type: 'business_default',
      assignable: true,
      permissions_editable: true,
      permissions_editable_by_current_admin: true,
    }),
    /未完整加载/u
  )
  assert.match(
    getRolePermissionReadOnlyReason({
      role_key: 'missing_edit_metadata',
      role_type: 'custom',
      permissions_editable: true,
      version: 1,
    }),
    /只能查看/u
  )
  assert.equal(getPermissionCenterRoleVersion({ version: 4 }), 4)
  assert.equal(getPermissionCenterRoleVersion({ version: 0 }), 0)
})

test('permissionCenterAccess: 普通管理员不能修改自己正在使用的业务角色', () => {
  assert.match(
    getRolePermissionReadOnlyReason(roles[1], {
      currentAdmin: {
        id: 8,
        roles: [{ role_key: 'sales' }],
      },
    }),
    /当前登录账号正在使用/u
  )
  assert.equal(
    getRolePermissionReadOnlyReason(roles[1], {
      currentAdmin: {
        id: 1,
        is_super_admin: true,
        roles: [{ role_key: 'sales' }],
      },
    }),
    ''
  )
})

test('permissionCenterAccess: 角色分配与权限编辑分别服从后端 metadata', () => {
  const editableButNotAssignable = {
    role_key: 'quality_custom',
    name: '品质复核',
    role_type: 'custom',
    assignable_by_current_admin: false,
    permissions_editable_by_current_admin: true,
    version: 2,
  }
  assert.deepEqual(buildAssignableRoleOptions([editableButNotAssignable]), [])
  assert.equal(
    getRolePermissionReadOnlyReason(editableButNotAssignable),
    ''
  )

  const assignableButReadOnly = {
    ...editableButNotAssignable,
    assignable_by_current_admin: true,
    permissions_editable_by_current_admin: false,
    permissions_edit_blocked_reason: '当前账号不能维护该角色权限',
  }
  assert.deepEqual(buildAssignableRoleOptions([assignableButReadOnly]), [
    { label: '品质复核', value: 'quality_custom' },
  ])
  assert.equal(
    getRolePermissionReadOnlyReason(assignableButReadOnly),
    '当前账号不能维护该角色权限'
  )
})

test('permissionCenterAccess: 当前账号和产品系统角色账号不能分配岗位角色', () => {
  const currentAdmin = { id: 8, username: 'current' }
  const nonSuperRoles = roles.map((role) =>
    role.role_key === 'admin'
      ? { ...role, assignable_by_current_admin: false }
      : role
  )
  assert.equal(isSameAdminAccount(currentAdmin, { id: '8' }), true)
  assert.match(
    getRoleAssignmentBlockReason({
      currentAdmin,
      targetAdmin: { id: 8, username: 'current', account_status: 'active' },
      roles: nonSuperRoles,
    }),
    /当前登录账号/u
  )
  assert.match(
    getRoleAssignmentBlockReason({
      currentAdmin,
      targetAdmin: {
        id: 9,
        account_status: 'active',
        roles: [{ role_key: 'admin' }],
      },
      roles: nonSuperRoles,
    }),
    /受保护或不可分配/u
  )
  assert.equal(
    getRoleAssignmentBlockReason({
      currentAdmin: { id: 1, is_super_admin: true },
      targetAdmin: {
        id: 9,
        account_status: 'active',
        roles: [{ role_key: 'admin' }],
      },
      roles,
    }),
    ''
  )
  assert.match(
    getRoleAssignmentBlockReason({
      currentAdmin,
      targetAdmin: {
        id: 11,
        account_status: 'active',
        roles: [{ role_key: 'missing_role' }],
      },
      roles,
    }),
    /受保护或不可分配/u
  )
  assert.equal(
    getRoleAssignmentBlockReason({
      currentAdmin,
      targetAdmin: {
        id: 10,
        account_status: 'active',
        roles: [{ role_key: 'sales' }],
      },
      roles,
    }),
    ''
  )
})

test('permissionCenterAccess: 系统角色可按 metadata 分配但系统账号维护仍由超级管理员保护', () => {
  const systemTarget = {
    id: 9,
    account_status: 'active',
    roles: [{ role_key: 'admin' }],
  }
  assert.deepEqual(buildAssignableRoleOptions(roles)[0], {
    label: '系统管理员',
    value: 'admin',
  })
  assert.match(
    getAdminControlTargetBlockReason({
      currentAdmin: { id: 8 },
      targetAdmin: systemTarget,
      roles,
    }),
    /只有超级管理员/u
  )
  assert.equal(
    getAdminControlTargetBlockReason({
      currentAdmin: { id: 1, is_super_admin: true },
      targetAdmin: systemTarget,
      roles,
    }),
    ''
  )
  assert.equal(
    getAdminControlTargetBlockReason({
      currentAdmin: { id: 8 },
      targetAdmin: {
        id: 10,
        account_status: 'active',
        roles: [{ role_key: 'sales' }],
      },
      roles,
    }),
    ''
  )
  assert.match(
    getAdminControlTargetBlockReason({
      currentAdmin: { id: 8 },
      targetAdmin: {
        id: 11,
        account_status: 'active',
        roles: [{ role_key: 'missing' }],
      },
      roles,
    }),
    /资料尚未完整加载/u
  )
})

test('permissionCenterAccess: 精确权限使用映射保留业务层级并隔离技术详情', () => {
  const usage = normalizePermissionUsage({
    pages: [
      {
        key: 'purchase-orders',
        name: '采购订单',
        path: '/erp/purchase/orders',
        section_key: 'order-actions',
        section_name: '订单操作',
        control_key: 'confirm-order',
        control_name: '确认下单',
        control_type: 'button',
        effect: '显示并允许确认',
        backend_methods: [{ domain: 'purchase_order', method: 'confirm' }],
        required_all: ['purchase.order.confirm'],
        conditions: ['仅草稿状态可操作'],
      },
    ],
    backend_only: false,
  })

  assert.deepEqual(usage.pages[0], {
    pageLabel: '采购订单',
    sectionLabel: '订单操作',
    actionLabel: '确认下单',
    restrictions: ['仅草稿状态可操作'],
  })
  assert.deepEqual(usage.restrictions, ['仅草稿状态可操作'])
  assert.equal(usage.defaultActionLabel, '确认下单')
  assert.equal(usage.outcome, '显示并允许确认')
  assert.equal('pagePath' in usage.pages[0], false)
  assert.equal('backendMethods' in usage, false)
  assert.equal('requiredAll' in usage, false)
})

test('permissionCenterAccess: 非合同权限映射字段不会进入当前投影', () => {
  const usage = normalizePermissionUsage({
    menus: [{ key: 'customers', label: '客户档案', path: '/erp/customers' }],
    control_type: '页面入口和内容',
    condition: '仍受当前客户配置限制',
  })

  assert.deepEqual(usage.pages, [])
  assert.equal(usage.defaultActionLabel, '')
  assert.equal(usage.outcome, '')
  assert.deepEqual(usage.restrictions, [])
})
