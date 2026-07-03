import assert from 'node:assert/strict'
import test from 'node:test'

import { getRoleDisplayName } from './roleKeys.mjs'

test('roleKeys: 未知角色默认不把 role key 暴露为用户可见文案', () => {
  assert.equal(getRoleDisplayName('warehouse'), '仓库')
  assert.equal(getRoleDisplayName('unknown_role_key'), '已配置角色')
  assert.equal(getRoleDisplayName('unknown_role_key', '责任岗位'), '责任岗位')
  assert.equal(getRoleDisplayName(''), '')
})
