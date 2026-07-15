import assert from 'node:assert/strict'
import test from 'node:test'

import { getPermissionModuleTitle } from './permissionModuleLabels.mjs'

test('permissionModuleLabels: 内置权限模块只显示岗位可理解的中文名称', () => {
  assert.equal(getPermissionModuleTitle('business'), '业务看板')
  assert.equal(getPermissionModuleTitle('debug'), '其他功能')
  assert.equal(getPermissionModuleTitle('masterdata'), '基础资料')
  assert.equal(getPermissionModuleTitle('mobile'), '手机待办')
  assert.equal(getPermissionModuleTitle('outsourcing'), '委外')
  assert.equal(getPermissionModuleTitle('shipment'), '出货')
  assert.equal(getPermissionModuleTitle('system'), '系统管理')
  assert.doesNotMatch(getPermissionModuleTitle('workflow'), /\(|workflow/u)
})

test('permissionModuleLabels: 空模块归入其他，未知模块不展示 raw key', () => {
  assert.equal(getPermissionModuleTitle(''), '其他功能')
  assert.equal(getPermissionModuleTitle('custom_module'), '其他功能')
  assert.equal(getPermissionModuleTitle('unknown.future.module'), '其他功能')
})
