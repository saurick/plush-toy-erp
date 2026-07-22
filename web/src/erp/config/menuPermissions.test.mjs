import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  ERP_MOBILE_ROLE_PERMISSION_OPTIONS,
  ERP_MENU_PERMISSION_GROUPS,
  ERP_MENU_PERMISSION_OPTIONS,
  ERP_PERMISSION_PRESETS,
  PERMISSION_CENTER_PATH,
  SYSTEM_AUDIT_LOGS_PATH,
  defaultMenuPermissions,
  getMobileRolePermissionLabel,
  getPermissionLabel,
  normalizeMobileRolePermissions,
  normalizeMenuPermissions,
  resolveMenuPermissionKey,
} from './menuPermissions.mjs'

const repoRoot = path.resolve(import.meta.dirname, '../../../..')

function readRepoFile(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

test('menuPermissions: 包含权限管理和审计日志入口', () => {
  assert(
    ERP_MENU_PERMISSION_OPTIONS.some(
      (item) => item.key === PERMISSION_CENTER_PATH
    )
  )
  assert(
    ERP_MENU_PERMISSION_OPTIONS.some(
      (item) => item.key === SYSTEM_AUDIT_LOGS_PATH
    )
  )
})

test('menuPermissions: 权限分组顺序跟随当前桌面菜单顺序', () => {
  assert.deepEqual(
    ERP_MENU_PERMISSION_GROUPS.map((section) => section.title),
    [
      '看板中心',
      '基础资料',
      '销售管理',
      '产品工程',
      '采购管理',
      '质检管理',
      '库存管理',
      '委外管理',
      '生产管理',
      '出货管理',
      '财务管理',
      '运营工具',
      '系统管理',
    ]
  )
  assert.deepEqual(
    ERP_MENU_PERMISSION_GROUPS.find(
      (section) => section.title === '看板中心'
    )?.items.map((item) => item.key),
    ['/erp/dashboard', '/erp/task-board', '/erp/business-dashboard']
  )
  assert.deepEqual(
    ERP_MENU_PERMISSION_GROUPS.find(
      (section) => section.title === '运营工具'
    )?.items.map((item) => item.key),
    ['/erp/print-center']
  )
  assert.deepEqual(
    ERP_MENU_PERMISSION_GROUPS.find(
      (section) => section.title === '系统管理'
    )?.items.map((item) => item.key),
    [PERMISSION_CENTER_PATH, SYSTEM_AUDIT_LOGS_PATH]
  )
})

test('menuPermissions: 默认权限不包含系统设置入口', () => {
  assert(!defaultMenuPermissions().includes(PERMISSION_CENTER_PATH))
  assert(!defaultMenuPermissions().includes(SYSTEM_AUDIT_LOGS_PATH))
})

test('menuPermissions: 手机待办岗位权限只保留有效岗位并保持顺序', () => {
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

test('menuPermissions: 未知菜单和岗位权限标签不透出 raw key', () => {
  assert.equal(getPermissionLabel('/erp/unknown/raw-path'), '菜单权限')
  assert.equal(getMobileRolePermissionLabel('unknown_role_key'), '岗位入口')
  assert.equal(getPermissionLabel(''), '')
  assert.equal(getMobileRolePermissionLabel(''), '')
  assert.doesNotMatch(getPermissionLabel('/erp/unknown/raw-path'), /unknown/u)
  assert.doesNotMatch(
    getMobileRolePermissionLabel('unknown_role_key'),
    /unknown_role_key/u
  )
})

test('menuPermissions: 只保留正式权限并拒绝已取消的旧入口', () => {
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

test('menuPermissions: 旧业务记录重叠入口不再兼容到正式 V1', () => {
  assert.deepEqual(
    normalizeMenuPermissions([
      '/erp/master/partners',
      '/erp/sales/project-orders',
    ]),
    []
  )
  assert.equal(resolveMenuPermissionKey('/erp/master/partners'), '')
  assert.equal(resolveMenuPermissionKey('/erp/sales/project-orders'), '')
  assert.equal(
    resolveMenuPermissionKey('/erp/master/partners/customers'),
    '/erp/master/partners/customers'
  )
  assert.equal(
    resolveMenuPermissionKey('/erp/master/partners/suppliers'),
    '/erp/master/partners/suppliers'
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

test('menuPermissions: 岗位帮助不新增业务权限，旧文档和验收路径不再映射', () => {
  assert.equal(resolveMenuPermissionKey('/erp/mobile-workbenches'), '')
  assert.equal(resolveMenuPermissionKey('/erp/help-center'), '')
  assert.equal(resolveMenuPermissionKey('/erp/docs/mobile-roles'), '')
  assert.equal(resolveMenuPermissionKey('/erp/qa/reports'), '')
})

test('menuPermissions: 基础资料与正式业务入口纳入角色预设', () => {
  const permissionKeys = ERP_MENU_PERMISSION_OPTIONS.map((item) => item.key)
  assert(permissionKeys.includes('/erp/master/partners/customers'))
  assert(permissionKeys.includes('/erp/master/partners/suppliers'))
  assert(permissionKeys.includes('/erp/master/products'))
  assert(permissionKeys.includes('/erp/master/materials'))
  assert(!permissionKeys.includes('/erp/master/partners'))
  assert(!permissionKeys.includes('/erp/sales/project-orders'))
  assert(permissionKeys.includes('/erp/sales/project-orders/sales-orders'))
  assert(permissionKeys.includes('/erp/purchase/material-bom'))
  assert(permissionKeys.includes('/erp/purchase/accessories'))
  assert(permissionKeys.includes('/erp/warehouse/inbound'))
  assert(permissionKeys.includes('/erp/warehouse/inventory'))
  assert(permissionKeys.includes('/erp/warehouse/shipments'))
  assert(permissionKeys.includes('/erp/production/quality-inspections'))
  assert(permissionKeys.includes('/erp/finance/receivables'))

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
        preset.permissions.includes('/erp/master/materials'),
        `expected ${preset.key} to include materials`
      )
    }
  )
  const salesPreset = ERP_PERMISSION_PRESETS.find(
    (preset) => preset.key === 'sales'
  )
  assert(
    salesPreset.permissions.includes('/erp/sales/project-orders/sales-orders')
  )
  assert(salesPreset.permissions.includes('/erp/warehouse/shipments'))
})

test('menuPermissions: 前端角色预设覆盖工程和系统管理员', () => {
  const presetKeys = ERP_PERMISSION_PRESETS.map((preset) => preset.key)
  assert(presetKeys.includes('engineering'))
  assert(presetKeys.includes('admin'))

  const engineeringPreset = ERP_PERMISSION_PRESETS.find(
    (preset) => preset.key === 'engineering'
  )
  assert.match(engineeringPreset.description, /工程手机待办/u)
  assert.doesNotMatch(engineeringPreset.description, /岗位任务端/u)
  assert.deepEqual(engineeringPreset.mobileRolePermissions, ['engineering'])
  assert(engineeringPreset.permissions.includes('/erp/task-board'))
  assert(engineeringPreset.permissions.includes('/erp/business-dashboard'))
  assert(engineeringPreset.permissions.includes('/erp/master/products'))
  assert(engineeringPreset.permissions.includes('/erp/master/materials'))
  assert(engineeringPreset.permissions.includes('/erp/purchase/material-bom'))
  assert(engineeringPreset.permissions.includes('/erp/engineering/processes'))
  assert(!engineeringPreset.permissions.includes(PERMISSION_CENTER_PATH))

  const adminPreset = ERP_PERMISSION_PRESETS.find(
    (preset) => preset.key === 'admin'
  )
  assert.deepEqual(adminPreset.mobileRolePermissions, [])
  assert.deepEqual(adminPreset.permissions, [
    PERMISSION_CENTER_PATH,
    SYSTEM_AUDIT_LOGS_PATH,
  ])
})

test('menuPermissions: 当前权限项不包含通用帮助、前端文档或开发验收路径', () => {
  const permissionKeys = ERP_MENU_PERMISSION_OPTIONS.map((item) => item.key)

  assert(permissionKeys.includes('/erp/task-board'))
  assert(!permissionKeys.includes('/erp/operations/exceptions'))
  assert(permissionKeys.includes('/erp/production/quality-inspections'))
  assert(permissionKeys.includes('/erp/finance/receivables'))
  assert(permissionKeys.includes('/erp/finance/invoices'))
  assert(!permissionKeys.includes('/erp/operations/facts'))
  assert(!permissionKeys.some((key) => key.startsWith('/erp/docs/')))
  assert(!permissionKeys.some((key) => key.startsWith('/erp/qa/')))
  assert(!permissionKeys.includes('/erp/help-center'))
})

test('menuPermissions: 旧入口不保留路由重定向', () => {
  const routerSource = readRepoFile('web/src/erp/router.jsx')
  const retiredRouteTokens = [
    'path="/login"',
    'path="/admin-accounts"',
    'path="/admin-users"',
    'path="/admin-menu"',
    'path="/admin-guide"',
    'path="/dashboard"',
    'path="operations/facts"',
    'path="operations/exceptions"',
    'path="flows/overview"',
    'path="mobile-workbenches"',
    'path="roles/:roleKey"',
    'path="source-readiness"',
    'path="docs/*"',
    'path="qa/*"',
    'path="changes/current"',
  ]

  for (const pathToken of retiredRouteTokens) {
    assert.equal(
      routerSource.includes(pathToken),
      false,
      `router must not keep retired route ${pathToken}`
    )
  }
})

test('menuPermissions: 岗位帮助恢复为单一已登录路由且不恢复旧文档路由', () => {
  const routerSource = readRepoFile('web/src/erp/router.jsx')
  assert.match(
    routerSource,
    /const HelpCenterPage = lazyRoute\(\(\) =>[\s\S]*HelpCenterPage\.jsx/u
  )
  assert.match(
    routerSource,
    /<Route path="help-center" element=\{<HelpCenterPage \/>\} \/>/u
  )
  assert.equal(routerSource.includes('path="docs/*"'), false)
  assert.equal(routerSource.includes('path="qa/*"'), false)
})
