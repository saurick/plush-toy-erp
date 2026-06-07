import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ERP_MOBILE_ROLE_PERMISSION_OPTIONS,
  ERP_MENU_PERMISSION_GROUPS,
  ERP_MENU_PERMISSION_OPTIONS,
  ERP_PERMISSION_PRESETS,
  PERMISSION_CENTER_PATH,
  defaultMenuPermissions,
  normalizeMobileRolePermissions,
  normalizeMenuPermissions,
  resolveMenuPermissionKey,
} from './menuPermissions.mjs'

test('menuPermissions: 包含权限管理入口', () => {
  assert(
    ERP_MENU_PERMISSION_OPTIONS.some(
      (item) => item.key === PERMISSION_CENTER_PATH
    )
  )
})

test('menuPermissions: 权限分组顺序跟随当前桌面菜单顺序', () => {
  assert.deepEqual(
    ERP_MENU_PERMISSION_GROUPS.map((section) => section.title),
    [
      '看板中心',
      '基础资料',
      '销售链路',
      '采购/仓储',
      '生产环节',
      '财务环节',
      '单据模板',
      '系统管理',
    ]
  )
  assert.deepEqual(
    ERP_MENU_PERMISSION_GROUPS.find(
      (section) => section.title === '看板中心'
    )?.items.map((item) => item.key),
    ['/erp/dashboard', '/erp/business-dashboard']
  )
})

test('menuPermissions: 默认权限不包含权限管理', () => {
  assert(!defaultMenuPermissions().includes(PERMISSION_CENTER_PATH))
})

test('menuPermissions: 岗位任务端角色权限只保留有效角色并保持端口顺序', () => {
  assert(
    ERP_MOBILE_ROLE_PERMISSION_OPTIONS.some((item) => item.key === 'sales')
  )
  assert.deepEqual(
    normalizeMobileRolePermissions([
      'quality',
      'invalid',
      'sales',
      'purchase',
      'quality',
    ]),
    ['sales', 'purchase', 'quality']
  )
})

test('menuPermissions: 只保留有效权限并把旧文档路径归一到看板', () => {
  assert.deepEqual(
    normalizeMenuPermissions([
      '/erp/source-readiness',
      '/invalid',
      '/erp/dashboard',
      '/erp/docs/operation-guide',
      '/erp/qa/acceptance-overview',
    ]),
    ['/erp/dashboard']
  )
})

test('menuPermissions: 旧业务记录重叠入口归一到正式 V1 入口', () => {
  assert.deepEqual(
    normalizeMenuPermissions([
      '/erp/master/partners',
      '/erp/sales/project-orders',
    ]),
    ['/erp/master/partners/customers', '/erp/sales/project-orders/sales-orders']
  )
  assert.equal(
    resolveMenuPermissionKey('/erp/master/partners/customers'),
    '/erp/master/partners/customers'
  )
  assert.equal(
    resolveMenuPermissionKey('/erp/sales/project-orders/sales-orders/42'),
    '/erp/sales/project-orders/sales-orders'
  )
})

test('menuPermissions: 打印预览子路由按打印中心权限归属', () => {
  assert.equal(
    resolveMenuPermissionKey('/erp/print-center/processing-contract'),
    '/erp/print-center'
  )
})

test('menuPermissions: 旧帮助与文档路径不再生成独立权限项', () => {
  assert.equal(
    resolveMenuPermissionKey('/erp/mobile-workbenches'),
    '/erp/dashboard'
  )
  assert.equal(
    resolveMenuPermissionKey('/erp/docs/mobile-roles'),
    '/erp/dashboard'
  )
  assert.equal(resolveMenuPermissionKey('/erp/qa/reports'), '/erp/dashboard')
})

test('menuPermissions: 基础资料入口纳入业务角色预设', () => {
  const permissionKeys = ERP_MENU_PERMISSION_OPTIONS.map((item) => item.key)
  assert(permissionKeys.includes('/erp/master/partners/customers'))
  assert(permissionKeys.includes('/erp/master/partners/suppliers'))
  assert(permissionKeys.includes('/erp/master/products'))
  assert(!permissionKeys.includes('/erp/master/partners'))
  assert(!permissionKeys.includes('/erp/sales/project-orders'))
  assert(permissionKeys.includes('/erp/sales/project-orders/sales-orders'))

  ERP_PERMISSION_PRESETS.filter((preset) => preset.key !== 'admin').forEach(
    (preset) => {
      assert(
        preset.permissions.includes('/erp/master/partners/customers'),
        `expected ${preset.key} to include customers`
      )
      assert(
        preset.permissions.includes('/erp/master/partners/suppliers'),
        `expected ${preset.key} to include suppliers`
      )
      assert(
        preset.permissions.includes('/erp/master/products'),
        `expected ${preset.key} to include products`
      )
    }
  )
  const salesPreset = ERP_PERMISSION_PRESETS.find(
    (preset) => preset.key === 'sales'
  )
  assert(
    salesPreset.permissions.includes('/erp/sales/project-orders/sales-orders')
  )
})

test('menuPermissions: 当前权限项不包含前端文档或开发验收路径', () => {
  const permissionKeys = ERP_MENU_PERMISSION_OPTIONS.map((item) => item.key)

  assert(permissionKeys.includes('/erp/production/quality-inspections'))
  assert(permissionKeys.includes('/erp/finance/receivables'))
  assert(permissionKeys.includes('/erp/finance/invoices'))
  assert(!permissionKeys.some((key) => key.startsWith('/erp/docs/')))
  assert(!permissionKeys.some((key) => key.startsWith('/erp/qa/')))
  assert(!permissionKeys.includes('/erp/help-center'))
})
