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
    roles: [],
    permissions: [],
    menus: [],
  },
  {
    id: 2,
    username: 'warehouse-user',
    phone: '13800000002',
    is_super_admin: false,
    disabled: false,
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
    roles: [{ role_key: 'finance', name: '财务' }],
    permissions: [{ permission_key: 'finance.payable.read', name: '查看应付' }],
    menus: [{ path: '/erp/print-center', label: '模板打印中心' }],
  },
]

test('permissionCenterSearch: 管理员搜索覆盖账号、手机号、角色、权限和菜单', () => {
  assert.deepEqual(
    filterAdminRecords(admins, { keyword: 'warehouse' }).map((item) => item.id),
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
})

test('permissionCenterSearch: 管理员状态筛选区分启用、禁用和超级管理员', () => {
  assert.deepEqual(
    filterAdminRecords(admins, {
      status: ADMIN_STATUS_FILTERS.ENABLED,
    }).map((item) => item.id),
    [1, 2]
  )
  assert.deepEqual(
    filterAdminRecords(admins, {
      status: ADMIN_STATUS_FILTERS.DISABLED,
    }).map((item) => item.id),
    [3]
  )
  assert.deepEqual(
    filterAdminRecords(admins, {
      status: ADMIN_STATUS_FILTERS.SUPER,
    }).map((item) => item.id),
    [1]
  )
})

test('permissionCenterSearch: 权限搜索保留分组层级并支持按分组名展开', () => {
  const groups = [
    {
      title: '基础资料',
      items: [
        { key: '/erp/master/partners/customers', label: '客户档案' },
        { key: '/erp/master/partners/suppliers', label: '供应商档案' },
      ],
    },
    {
      title: '销售链路',
      items: [
        { key: '/erp/sales/project-orders/sales-orders', label: '销售订单' },
      ],
    },
  ]

  assert.deepEqual(filterPermissionGroups(groups, '供应'), [
    {
      title: '基础资料',
      items: [{ key: '/erp/master/partners/suppliers', label: '供应商档案' }],
    },
  ])

  assert.deepEqual(filterPermissionGroups(groups, '销售'), [groups[1]])
})
