import assert from 'node:assert/strict'
import test from 'node:test'

import { getRoleDisplayName } from './roleKeys.mjs'

test('roleKeys: 未知岗位默认不把 role key 暴露为用户可见文案', () => {
  assert.equal(getRoleDisplayName('warehouse'), '仓库')
  assert.equal(getRoleDisplayName('unknown_role_key'), '已配置岗位')
  assert.equal(getRoleDisplayName('unknown_role_key', '负责岗位'), '负责岗位')
  assert.equal(getRoleDisplayName(''), '')
})
