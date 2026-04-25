import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ERP_MOBILE_ROLE_PERMISSION_OPTIONS,
  ERP_MENU_PERMISSION_GROUPS,
  ERP_MENU_PERMISSION_OPTIONS,
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

test('menuPermissions: 权限分组顺序跟随桌面菜单顺序', () => {
  assert.deepEqual(
    ERP_MENU_PERMISSION_GROUPS.map((section) => section.title),
    [
      '看板中心',
      '销售链路',
      '采购/仓储',
      '生产环节',
      '财务环节',
      '单据模板',
      '系统管理',
      '帮助中心',
      '高级文档',
      '开发与验收',
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

test('menuPermissions: 移动端角色权限只保留有效角色并保持端口顺序', () => {
  assert(
    ERP_MOBILE_ROLE_PERMISSION_OPTIONS.some((item) => item.key === 'purchasing')
  )
  assert.deepEqual(
    normalizeMobileRolePermissions([
      'quality',
      'invalid',
      'purchasing',
      'quality',
    ]),
    ['purchasing', 'quality']
  )
})

test('menuPermissions: 只保留有效权限并保持菜单顺序', () => {
  assert.deepEqual(
    normalizeMenuPermissions([
      '/erp/source-readiness',
      '/invalid',
      '/erp/dashboard',
      '/erp/source-readiness',
    ]),
    ['/erp/dashboard', '/erp/docs/field-linkage-guide']
  )
})

test('menuPermissions: 打印预览子路由按打印中心权限归属', () => {
  assert.equal(
    resolveMenuPermissionKey('/erp/print-center/processing-contract'),
    '/erp/print-center'
  )
})

test('menuPermissions: 旧帮助路径统一映射到帮助中心四个入口', () => {
  assert.equal(
    resolveMenuPermissionKey('/erp/mobile-workbenches'),
    '/erp/docs/operation-guide'
  )
  assert.equal(
    resolveMenuPermissionKey('/erp/docs/mobile-roles'),
    '/erp/docs/mobile-role-guide'
  )
  assert.equal(
    resolveMenuPermissionKey('/erp/docs/field-truth'),
    '/erp/docs/field-linkage-guide'
  )
  assert.equal(
    resolveMenuPermissionKey('/erp/docs/print-templates'),
    '/erp/docs/print-snapshot-guide'
  )
})

test('menuPermissions: 包含角色权限 / 页面 / 单据矩阵入口', () => {
  assert(
    ERP_MENU_PERMISSION_OPTIONS.some(
      (item) => item.key === '/erp/docs/role-page-document-matrix'
    )
  )
})

test('menuPermissions: 包含任务 / 单据映射表入口', () => {
  assert(
    ERP_MENU_PERMISSION_OPTIONS.some(
      (item) => item.key === '/erp/docs/task-document-mapping'
    )
  )
})

test('menuPermissions: 包含任务 / 业务状态字典与 schema 草案入口', () => {
  assert(
    ERP_MENU_PERMISSION_OPTIONS.some(
      (item) => item.key === '/erp/docs/workflow-status-guide'
    )
  )
  assert(
    ERP_MENU_PERMISSION_OPTIONS.some(
      (item) => item.key === '/erp/docs/workflow-schema-draft'
    )
  )
})

test('menuPermissions: 包含开发与验收分组入口', () => {
  assert(
    ERP_MENU_PERMISSION_OPTIONS.some(
      (item) => item.key === '/erp/qa/acceptance-overview'
    )
  )
  assert(
    ERP_MENU_PERMISSION_OPTIONS.some(
      (item) => item.key === '/erp/qa/field-linkage-coverage'
    )
  )
  assert(
    ERP_MENU_PERMISSION_OPTIONS.some(
      (item) => item.key === '/erp/qa/business-chain-debug'
    )
  )
  assert(
    ERP_MENU_PERMISSION_OPTIONS.some(
      (item) => item.key === '/erp/qa/run-records'
    )
  )
  assert(defaultMenuPermissions().includes('/erp/qa/acceptance-overview'))
})

test('menuPermissions: 不包含待确认的报价单入口', () => {
  assert(
    !ERP_MENU_PERMISSION_OPTIONS.some(
      (item) => item.key === '/erp/sales/quotations'
    )
  )
})

test('menuPermissions: 新增品质、应收和发票模块权限存在', () => {
  const permissionKeys = ERP_MENU_PERMISSION_OPTIONS.map((item) => item.key)

  assert(permissionKeys.includes('/erp/production/quality-inspections'))
  assert(permissionKeys.includes('/erp/finance/receivables'))
  assert(permissionKeys.includes('/erp/finance/invoices'))
})

test('menuPermissions: 新增 v1 帮助文档入口存在', () => {
  const permissionKeys = ERP_MENU_PERMISSION_OPTIONS.map((item) => item.key)

  assert(permissionKeys.includes('/erp/docs/task-flow-v1'))
  assert(permissionKeys.includes('/erp/docs/role-permission-matrix-v1'))
  assert(permissionKeys.includes('/erp/docs/notification-alert-v1'))
  assert(permissionKeys.includes('/erp/docs/finance-v1'))
  assert(permissionKeys.includes('/erp/docs/warehouse-quality-v1'))
  assert(permissionKeys.includes('/erp/docs/log-trace-audit-v1'))
})
