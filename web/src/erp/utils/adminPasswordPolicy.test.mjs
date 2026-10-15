import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ADMIN_PASSWORD_MAX_BYTES,
  ADMIN_PASSWORD_MAX_CHARACTERS,
  ADMIN_PASSWORD_MIN_CHARACTERS,
  getAdminPasswordPolicyError,
} from './adminPasswordPolicy.mjs'

test('adminPasswordPolicy: 与后端 8 到 20 位和 bcrypt 字节上限一致', () => {
  assert.equal(ADMIN_PASSWORD_MIN_CHARACTERS, 8)
  assert.equal(ADMIN_PASSWORD_MAX_CHARACTERS, 20)
  assert.equal(ADMIN_PASSWORD_MAX_BYTES, 72)
  assert.match(getAdminPasswordPolicyError('1234567'), /8 到 20 位/u)
  assert.equal(getAdminPasswordPolicyError('12345678'), '')
  assert.equal(getAdminPasswordPolicyError('毛绒玩具权限管理安全密码'), '')
  assert.equal(
    getAdminPasswordPolicyError('毛'.repeat(25)),
    '密码应为 8 到 20 位'
  )
  assert.equal(getAdminPasswordPolicyError('🧸'.repeat(8)), '')
})
