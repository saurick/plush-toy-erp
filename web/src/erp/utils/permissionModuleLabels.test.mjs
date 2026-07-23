import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getPermissionModuleTitle,
  UNCLASSIFIED_PERMISSION_MODULE_TITLE,
} from './permissionModuleLabels.mjs'

test('permissionModuleLabels: 展示后端给出的岗位语言分类名', () => {
  assert.equal(getPermissionModuleTitle('工作台与通用工具'), '工作台与通用工具')
  assert.equal(getPermissionModuleTitle('物料清单（BOM）'), '物料清单（BOM）')
  assert.equal(getPermissionModuleTitle('客户退货'), '客户退货')
  assert.equal(getPermissionModuleTitle('生产执行'), '生产执行')
})

test('permissionModuleLabels: 缺失或技术模块名合并为一个未分类分组', () => {
  assert.equal(getPermissionModuleTitle(''), UNCLASSIFIED_PERMISSION_MODULE_TITLE)
  assert.equal(
    getPermissionModuleTitle('custom_module'),
    UNCLASSIFIED_PERMISSION_MODULE_TITLE
  )
  assert.equal(
    getPermissionModuleTitle('unknown.future.module'),
    UNCLASSIFIED_PERMISSION_MODULE_TITLE
  )
})
