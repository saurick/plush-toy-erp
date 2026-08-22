import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PERMISSION_RELATIONSHIP_ALL_MODULES,
  PERMISSION_RELATIONSHIP_VIEW_MODE,
  buildPermissionRelationshipModel,
  buildPermissionRelationshipModuleOptions,
  buildPermissionRelationshipTargetOptions,
  getPermissionRelationshipRoleKeys,
} from './devPermissionRelationshipGraph.mjs'

const accounts = [
  {
    id: 11,
    username: 'sales01',
    display_name: '小林',
    phone: '13800000000',
    account_status: 'active',
    roles: [{ role_key: 'sales', name: '业务员' }],
  },
  {
    id: 12,
    username: 'sales02',
    display_name: '小周',
    phone: '13900000000',
    account_status: 'suspended',
    roles: [{ role_key: 'sales', name: '业务员' }],
  },
  {
    id: 20,
    username: 'warehouse01',
    display_name: '小吴',
    phone: '13700000000',
    account_status: 'suspended',
    roles: [
      { role_key: 'sales', name: '业务员' },
      { role_key: 'warehouse', name: '仓管员' },
    ],
  },
  {
    id: 1,
    username: 'root-admin',
    display_name: '系统管理员',
    phone: '13600000000',
    is_super_admin: true,
    account_status: 'active',
    roles: [],
  },
]

const roles = [
  {
    role_key: 'sales',
    name: '业务员',
    disabled: false,
    permissions: ['sales.order.read', 'sales.order.confirm'],
    data_scopes: [
      {
        resource_type: 'warehouse',
        mode: 'ASSIGNED',
        resource_ids: [8],
      },
    ],
  },
  {
    role_key: 'warehouse',
    name: '仓管员',
    disabled: false,
    permissions: ['warehouse.inventory.read'],
    data_scopes: [
      {
        resource_type: 'warehouse',
        mode: 'ALL',
        resource_ids: [],
      },
    ],
  },
]

const permissions = [
  {
    permission_key: 'sales.order.read',
    name: '查看销售订单',
    module: 'sales',
    module_name: '销售管理',
    usage: {
      pages: [
        {
          key: 'sales-orders',
          name: '销售订单',
          control_name: '查看订单列表',
        },
      ],
    },
  },
  {
    permission_key: 'sales.order.confirm',
    name: '确认报价 "A" <内部>|',
    module: 'sales',
    module_name: '销售管理',
    usage: {
      pages: [
        {
          key: 'sales-orders',
          name: '销售订单',
          control_name: '确认订单',
        },
      ],
    },
  },
  {
    permission_key: 'warehouse.inventory.read',
    name: '查看库存',
    module: 'warehouse',
    module_name: '仓储',
    usage: {
      pages: [
        {
          key: 'inventory',
          name: '库存查询',
          control_name: '查看库存',
        },
      ],
    },
  },
]

const accessByRoleKey = {
  sales: {
    role_key: 'sales',
    role_name: '业务员',
    source: 'active_customer_config_revision',
    is_final: true,
    permissions: [
      {
        permission_key: 'sales.order.read',
        effective: true,
        reasons: [],
      },
      {
        permission_key: 'sales.order.confirm',
        effective: false,
        reasons: [{ label: '当前客户未启用确认能力' }],
      },
    ],
    pages: [
      {
        key: 'sales-orders',
        label: '销售订单',
        effective: true,
        reasons: [],
      },
    ],
  },
  warehouse: {
    role_key: 'warehouse',
    role_name: '仓管员',
    source: 'active_customer_config_revision',
    is_final: true,
    permissions: [
      {
        permission_key: 'warehouse.inventory.read',
        effective: true,
        reasons: [],
      },
    ],
    pages: [
      {
        key: 'inventory',
        label: '库存查询',
        effective: true,
        reasons: [],
      },
    ],
  },
}

const approvalSettings = {
  items: [
    {
      approval_key: 'sales_order_review',
      label: '销售订单审批',
      configured: true,
      enabled: true,
      effective_role_keys: ['sales'],
      members: [
        {
          role_key: 'sales',
          user_id: 0,
          enabled: true,
        },
      ],
      blocked_reasons: [],
    },
  ],
}

test('role view connects accounts, role, final permissions, pages, scope and approvals', () => {
  const model = buildPermissionRelationshipModel({
    viewMode: PERMISSION_RELATIONSHIP_VIEW_MODE.ROLE,
    targetKey: 'sales',
    moduleKey: 'sales',
    accounts,
    roles,
    permissions,
    warehouseOptions: [{ id: 8, name: '成品仓' }],
    accessByRoleKey,
    approvalSettings,
  })

  assert.deepEqual(model.summary, {
    accounts: 3,
    roles: 1,
    permissions: 2,
    effectivePermissions: 1,
    blockedPermissions: 1,
    pages: 1,
    approvals: 1,
  })
  assert.match(
    model.chart,
    /关联账号（3）：小林（sales01）、小周（sales02）、小吴（warehouse01）｜可用 1/u
  )
  assert.match(model.chart, /岗位：业务员/u)
  assert.match(model.chart, /功能：查看销售订单｜最终可用/u)
  assert.match(model.chart, /功能：确认报价 ”A” ＜内部＞｜｜当前受限/u)
  assert.match(model.chart, /页面：销售订单｜可进入/u)
  assert.match(model.chart, /数据范围：指定仓库：成品仓/u)
  assert.match(model.chart, /审批责任：销售订单审批｜已配置/u)
  assert.ok(
    model.rows.some(
      (row) =>
        row.target === '确认报价 "A" <内部>|' &&
        row.result === '当前客户未启用确认能力'
    )
  )
  assert.ok(
    model.rows.some(
      (row) =>
        row.source === '小周（sales02）' && row.result === '账号状态阻断使用'
    )
  )
  const visibleOutput = JSON.stringify(model)
  assert.doesNotMatch(visibleOutput, /sales\.order\.(read|confirm)/u)
  assert.doesNotMatch(visibleOutput, /13[6789]00000000/u)
})

test('account view preserves multiple role paths and marks an inactive account as blocked', () => {
  const model = buildPermissionRelationshipModel({
    viewMode: PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT,
    targetKey: '20',
    moduleKey: PERMISSION_RELATIONSHIP_ALL_MODULES,
    accounts,
    roles,
    permissions,
    warehouseOptions: [{ id: 8, name: '成品仓' }],
    accessByRoleKey,
    approvalSettings,
  })

  assert.equal(model.summary.accounts, 1)
  assert.equal(model.summary.roles, 2)
  assert.equal(model.summary.effectivePermissions, 2)
  assert.equal(model.summary.blockedPermissions, 1)
  assert.match(model.chart, /账号：小吴（warehouse01）｜临时停用/u)
  assert.match(model.chart, /岗位：业务员/u)
  assert.match(model.chart, /岗位：仓管员/u)
  assert.match(model.chart, /功能汇总：1 个模块｜可用 1 \/ 已选 2/u)
  assert.match(model.chart, /功能汇总：1 个模块｜可用 1 \/ 已选 1/u)
  assert.ok(
    model.rows.some((row) => row.target === '销售管理') &&
      model.rows.some((row) => row.target === '仓储')
  )
  assert.ok(
    model.warnings.some((warning) => warning.includes('登录和实际使用'))
  )
})

test('account view does not inherit another employee named approval responsibility', () => {
  const namedApprovalSettings = {
    items: [
      {
        approval_key: 'sales_order_review',
        label: '销售订单审批',
        configured: true,
        enabled: true,
        effective_role_keys: ['sales'],
        members: [
          {
            role_key: 'sales',
            user_id: 11,
            enabled: true,
          },
        ],
        blocked_reasons: [],
      },
    ],
  }
  const assigned = buildPermissionRelationshipModel({
    viewMode: PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT,
    targetKey: '11',
    accounts,
    roles,
    permissions,
    accessByRoleKey,
    approvalSettings: namedApprovalSettings,
  })
  const unassigned = buildPermissionRelationshipModel({
    viewMode: PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT,
    targetKey: '20',
    accounts,
    roles,
    permissions,
    accessByRoleKey,
    approvalSettings: namedApprovalSettings,
  })

  assert.equal(assigned.summary.approvals, 1)
  assert.match(assigned.chart, /审批责任：销售订单审批｜已配置/u)
  assert.equal(unassigned.summary.approvals, 0)
  assert.doesNotMatch(unassigned.chart, /审批责任：销售订单审批/u)
})

test('super administrator is rendered as a protected system path, not a fabricated role', () => {
  const model = buildPermissionRelationshipModel({
    viewMode: PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT,
    targetKey: '1',
    accounts,
    roles,
    permissions,
    accessByRoleKey,
  })

  assert.equal(model.summary.accounts, 1)
  assert.equal(model.summary.roles, 0)
  assert.match(model.chart, /账号：系统管理员（root-admin）｜始终启用/u)
  assert.match(model.chart, /系统保留：全部权限｜不由岗位汇总/u)
  assert.doesNotMatch(model.chart, /岗位：超级管理员/u)
  assert.ok(model.warnings.some((warning) => warning.includes('系统保留账号')))
})

test('target and module helpers keep stable human-readable choices', () => {
  assert.deepEqual(
    getPermissionRelationshipRoleKeys({
      viewMode: PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT,
      targetKey: '20',
      accounts,
    }),
    ['sales', 'warehouse']
  )
  assert.deepEqual(
    buildPermissionRelationshipModuleOptions(permissions).map(
      (option) => option.label
    ),
    ['全部功能模块', '仓储', '销售管理']
  )
  assert.deepEqual(
    buildPermissionRelationshipTargetOptions({
      viewMode: PERMISSION_RELATIONSHIP_VIEW_MODE.ROLE,
      roles,
    }).map((option) => option.label),
    ['仓管员', '业务员']
  )
  assert.ok(
    buildPermissionRelationshipTargetOptions({
      viewMode: PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT,
      accounts,
    }).some(
      (option) => option.label === '系统管理员（root-admin） · 超级管理员'
    )
  )
})
