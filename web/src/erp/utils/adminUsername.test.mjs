import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ADMIN_USERNAME_MAX_LENGTH,
  ADMIN_USERNAME_MIN_LENGTH,
  ADMIN_USERNAME_RULE_TEXT,
  getAdminUsernameValidationMessage,
} from './adminUsername.mjs'

test('admin username accepts letters numbers and underscores', () => {
  for (const username of [
    'abc',
    '001',
    '___',
    'sales01',
    'demo_admin',
    'UAT_Sales_01',
  ]) {
    assert.equal(getAdminUsernameValidationMessage(username), '')
  }
  assert.equal(getAdminUsernameValidationMessage(' demo_admin '), '')
  assert.equal(
    getAdminUsernameValidationMessage('a'.repeat(ADMIN_USERNAME_MIN_LENGTH)),
    ''
  )
  assert.equal(
    getAdminUsernameValidationMessage('a'.repeat(ADMIN_USERNAME_MAX_LENGTH)),
    ''
  )
  assert.equal(
    ADMIN_USERNAME_RULE_TEXT,
    '只允许英文字母、数字和下划线，长度为 3 到 64 个字符'
  )
})

test('admin username rejects empty non-ASCII and punctuation', () => {
  assert.equal(getAdminUsernameValidationMessage(''), '请输入员工账号')
  for (const username of ['a', 'ab', ' ab ']) {
    assert.equal(
      getAdminUsernameValidationMessage(username),
      '员工账号至少需要 3 个字符'
    )
  }
  for (const username of [
    '销售01',
    'sales-01',
    'sales.01',
    'sales 01',
    'sales@01',
  ]) {
    assert.equal(
      getAdminUsernameValidationMessage(username),
      '员工账号只能包含英文字母、数字和下划线'
    )
  }
  assert.equal(
    getAdminUsernameValidationMessage(
      'a'.repeat(ADMIN_USERNAME_MAX_LENGTH + 1)
    ),
    '员工账号不能超过 64 个字符'
  )
})
