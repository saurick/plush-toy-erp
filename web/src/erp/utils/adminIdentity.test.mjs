import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findAdminsWithDisplayName,
  formatAdminAccountLabel,
  formatAdminIdentity,
  getAdminDisplayName,
} from './adminIdentity.mjs'

test('管理员姓名优先于账号，完整身份保留账号用于重名核对', () => {
  const admin = { display_name: ' 张三 ', username: 'sales01' }
  assert.equal(getAdminDisplayName(admin), '张三')
  assert.equal(formatAdminIdentity(admin), '张三（sales01）')
  assert.equal(formatAdminIdentity(admin, { includeUsername: false }), '张三')
  assert.equal(formatAdminAccountLabel(admin), '账号：sales01')
})

test('存量账号缺少姓名时回退账号，不伪造人员姓名', () => {
  assert.equal(
    getAdminDisplayName({ username: 'legacy-admin' }),
    'legacy-admin'
  )
  assert.equal(
    formatAdminIdentity({ username: 'legacy-admin' }),
    'legacy-admin'
  )
  assert.equal(
    formatAdminIdentity({}, { fallback: '未记录人员' }),
    '未记录人员'
  )
})

test('同名核对允许真实同名，并排除正在修改的账号', () => {
  const admins = [
    { id: 1, display_name: '张三', username: 'sales01' },
    { id: 2, display_name: ' 张三 ', username: 'warehouse01' },
    { id: 3, display_name: '李四', username: 'finance01' },
    { id: 4, username: '张三' },
  ]

  assert.deepEqual(
    findAdminsWithDisplayName(admins, '张三').map((admin) => admin.id),
    [1, 2]
  )
  assert.deepEqual(
    findAdminsWithDisplayName(admins, '张三', { excludeAdminID: 2 }).map(
      (admin) => admin.id
    ),
    [1]
  )
})

test('同名核对忽略大小写和全角差异，但不把空姓名或账号回退当姓名', () => {
  const admins = [
    { id: 1, display_name: 'Sales A', username: 'sales_a' },
    { id: 2, display_name: 'ＳＡＬＥＳ Ａ', username: 'sales_full_width' },
    { id: 3, display_name: '', username: 'sales a' },
  ]

  assert.deepEqual(
    findAdminsWithDisplayName(admins, ' sales a ').map((admin) => admin.id),
    [1, 2]
  )
  assert.deepEqual(findAdminsWithDisplayName(admins, '   '), [])
})
