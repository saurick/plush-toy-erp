import assert from 'node:assert/strict'
import test from 'node:test'

import { getPermissionModuleTitle } from './permissionModuleLabels.mjs'

test('permissionModuleLabels: 内置权限模块只显示岗位可理解的中文名称', () => {
  assert.equal(getPermissionModuleTitle('business'), '业务看板')
  assert.equal(getPermissionModuleTitle('debug'), '调试能力')
  assert.equal(getPermissionModuleTitle('masterdata'), '主数据')
  assert.equal(getPermissionModuleTitle('mobile'), '岗位任务端')
  assert.equal(getPermissionModuleTitle('outsourcing'), '委外')
  assert.equal(getPermissionModuleTitle('shipment'), '出货')
  assert.equal(getPermissionModuleTitle('system'), '系统管理')
  assert.doesNotMatch(getPermissionModuleTitle('workflow'), /\(|workflow/u)
})

test('permissionModuleLabels: 空模块归入其他，未知模块不展示 raw key', () => {
  assert.equal(getPermissionModuleTitle(''), '其他')
  assert.equal(getPermissionModuleTitle('custom_module'), '未登记权限模块')
  assert.equal(
    getPermissionModuleTitle('unknown.future.module'),
    '未登记权限模块'
  )
})
