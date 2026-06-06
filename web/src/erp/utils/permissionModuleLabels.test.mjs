import assert from 'node:assert/strict'
import test from 'node:test'

import { getPermissionModuleTitle } from './permissionModuleLabels.mjs'

test('permissionModuleLabels: 内置权限模块显示中文并保留英文 key', () => {
  assert.equal(getPermissionModuleTitle('business'), '业务记录 (business)')
  assert.equal(getPermissionModuleTitle('debug'), '调试能力 (debug)')
  assert.equal(getPermissionModuleTitle('masterdata'), '主数据 (masterdata)')
  assert.equal(getPermissionModuleTitle('mobile'), '岗位任务端 (mobile)')
})

test('permissionModuleLabels: 空模块归入其他，未知模块保留原 key', () => {
  assert.equal(getPermissionModuleTitle(''), '其他 (other)')
  assert.equal(getPermissionModuleTitle('custom_module'), 'custom_module')
})
