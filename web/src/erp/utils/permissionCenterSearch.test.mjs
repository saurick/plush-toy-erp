import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ADMIN_STATUS_FILTERS,
  filterAdminRecords,
  filterPermissionGroups,
} from './permissionCenterSearch.mjs'

const admins = [
  {
    id: 1,
    username: 'root-admin',
    is_super_admin: true,
    disabled: false,
    account_status: 'active',
    roles: [],
    permissions: [],
    menus: [],
  },
  {
    id: 4,
    username: 'former-user',
    is_super_admin: false,
    disabled: true,
    account_status: 'revoked',
    roles: [{ role_key: 'sales', name: '业务' }],
    permissions: [],
    menus: [],
  },
  {
    id: 2,
    username: 'warehouse-user',
    phone: '13800000002',
    is_super_admin: false,
    disabled: false,
    account_status: 'active',
    roles: [{ role_key: 'warehouse', name: '仓库' }],
    permissions: [
      { permission_key: 'warehouse.inbound.read', name: '查看入库' },
    ],
    menus: [{ path: '/erp/business-dashboard', label: '业务看板' }],
  },
  {
    id: 3,
    username: 'finance-user',
    phone: '13800000003',
    is_super_admin: false,
    disabled: true,
    account_status: 'suspended',
    roles: [{ role_key: 'finance', name: '财务' }],
    permissions: [{ permission_key: 'finance.payable.read', name: '查看应付' }],
    menus: [{ path: '/erp/print-center', label: '模板打印中心' }],
  },
]

test('permissionCenterSearch: 管理员搜索只匹配用户可见账号、手机号、角色和菜单名称', () => {
  assert.deepEqual(
    filterAdminRecords(admins, { keyword: 'warehouse-user' }).map(
      (item) => item.id
    ),
    [2]
  )
  assert.deepEqual(
    filterAdminRecords(admins, { keyword: '13800000003' }).map(
      (item) => item.id
    ),
    [3]
  )
  assert.deepEqual(
    filterAdminRecords(admins, { keyword: '全部权限' }).map((item) => item.id),
    [1]
  )
  assert.deepEqual(
    filterAdminRecords(admins, { keyword: '财务' }).map((item) => item.id),
    [3]
  )
  assert.deepEqual(
    filterAdminRecords(admins, { keyword: 'warehouse.inbound.read' }),
    []
  )
  assert.deepEqual(
    filterAdminRecords(admins, { keyword: '/erp/business-dashboard' }),
    []
  )
  assert.deepEqual(filterAdminRecords(admins, { keyword: '查看入库' }), [])
})

test('permissionCenterSearch: 管理员状态筛选只按 account_status 三态判断', () => {
  assert.deepEqual(
    filterAdminRecords(admins, {
      status: ADMIN_STATUS_FILTERS.ACTIVE,
    }).map((item) => item.id),
    [1, 2]
  )
  assert.deepEqual(
    filterAdminRecords(admins, {
      status: ADMIN_STATUS_FILTERS.SUSPENDED,
    }).map((item) => item.id),
    [3]
  )
  assert.deepEqual(
    filterAdminRecords(admins, {
      status: ADMIN_STATUS_FILTERS.REVOKED,
    }).map((item) => item.id),
    [4]
  )
  assert.deepEqual(
    filterAdminRecords(admins, {
      status: ADMIN_STATUS_FILTERS.SUPER,
    }).map((item) => item.id),
    [1]
  )
  assert.deepEqual(
    filterAdminRecords(
      [{ id: 5, is_super_admin: false, disabled: false }],
      { status: ADMIN_STATUS_FILTERS.ACTIVE }
    ),
    [],
    '缺少 account_status 时不得用 disabled 猜测账号仍为启用'
  )
})

test('permissionCenterSearch: 权限搜索保留分组层级并支持按分组名展开', () => {
  const groups = [
    {
      title: '基础资料',
      items: [
        {
          key: 'customer.read',
          label: '客户档案',
          description: '查看客户资料',
        },
        {
          key: 'supplier.read',
          label: '供应商档案',
          description: '查看供应商资料',
        },
      ],
    },
    {
      title: '销售链路',
      items: [
        {
          key: 'sales.order.read',
          label: '销售订单',
          usage: {
            pages: [
              {
                pageLabel: '销售订单',
                sectionLabel: '订单列表',
                actionLabel: '查看订单',
                restrictions: ['仅显示当前客户已启用模块'],
              },
            ],
          },
        },
      ],
    },
  ]

  assert.deepEqual(filterPermissionGroups(groups, '供应'), [
    {
      title: '基础资料',
      items: [
        {
          key: 'supplier.read',
          label: '供应商档案',
          description: '查看供应商资料',
        },
      ],
    },
  ])

  assert.deepEqual(filterPermissionGroups(groups, '销售'), [groups[1]])
  assert.deepEqual(filterPermissionGroups(groups, '订单列表'), [groups[1]])
  assert.deepEqual(filterPermissionGroups(groups, 'sales.order.read'), [])
})
