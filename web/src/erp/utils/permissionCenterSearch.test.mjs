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
    menus: [{ path: '/erp/warehouse/inbound', label: '入库通知/检验/入库' }],
  },
  {
    id: 3,
    username: 'finance-user',
    phone: '13800000003',
    is_super_admin: false,
    disabled: true,
    roles: [{ role_key: 'finance', name: '财务' }],
    permissions: [{ permission_key: 'finance.payable.read', name: '查看应付' }],
    menus: [{ path: '/erp/finance/payables', label: '待付款/应付提醒' }],
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
      title: '采购/仓储',
      items: [
        { key: '/erp/purchase/accessories', label: '辅材/包材采购' },
        { key: '/erp/warehouse/inbound', label: '仓库入库' },
      ],
    },
    {
      title: '财务环节',
      items: [{ key: '/erp/finance/payables', label: '应付登记' }],
    },
  ]

  assert.deepEqual(filterPermissionGroups(groups, '入库'), [
    {
      title: '采购/仓储',
      items: [{ key: '/erp/warehouse/inbound', label: '仓库入库' }],
    },
  ])

  assert.deepEqual(filterPermissionGroups(groups, '财务'), [groups[1]])
})
