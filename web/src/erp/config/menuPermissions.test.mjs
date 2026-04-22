import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ERP_MENU_PERMISSION_OPTIONS,
  PERMISSION_CENTER_PATH,
  defaultMenuPermissions,
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

test('menuPermissions: 默认权限不包含权限管理', () => {
  assert(!defaultMenuPermissions().includes(PERMISSION_CENTER_PATH))
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
