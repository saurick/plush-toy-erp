import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findAdminsWithDisplayName,
  formatAdminAccountLabel,
  formatAdminIdentity,
  getAdminDisplayName,
  getAdminAccountName,
  getAdminAvatar,
  getAdminRoleNames,
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

test('账号入口以姓名或中文缺值提示展示，不从英文账号猜姓名与身份', () => {
  assert.equal(getAdminAccountName({ display_name: ' 张三 ', username: 'sales01' }), '张三')
  assert.equal(getAdminAccountName({ display_name: 'Émile', username: 'sales01' }), 'Émile')
  assert.equal(getAdminAccountName({ username: 'admin' }), '姓名待补录')
  assert.equal(getAdminAccountName({ username: 'admin', is_super_admin: 'true' }), '姓名待补录')
  assert.equal(getAdminAccountName({ username: 'admin', is_super_admin: true }), '超级管理员')
  assert.equal(getAdminAccountName({ display_name: '王宁', is_super_admin: true }), '王宁')
  assert.equal(getAdminAccountName(null), '姓名待补录')
})

test('默认头像使用姓名末两汉字，缺少汉字姓名时显示中文身份，不使用英文账号缩写', () => {
  assert.equal(getAdminAvatar({ display_name: '王小明' }).text, '小明')
  assert.equal(getAdminAvatar({ display_name: '张三' }).text, '张三')
  assert.equal(getAdminAvatar({ display_name: '李' }).text, '李')
  assert.equal(getAdminAvatar({ display_name: '王小明 Alice' }).text, '小明')
  assert.equal(getAdminAvatar({ username: 'admin' }).text, '用户')
  assert.equal(getAdminAvatar({ username: 'admin', is_super_admin: true }).text, '管理')
  assert.equal(getAdminAvatar({ display_name: ' Émile ' }).text, '用户')
  assert.equal(getAdminAvatar({ display_name: '𠮷野' }).text, '𠮷野')
  assert.equal(getAdminAvatar({ username: '王小明' }).text, '用户')
  assert.equal(getAdminAvatar({ username: '👩🏽‍💻a' }).text, '用户')
  assert.equal(getAdminAvatar(null).text, '用户')
})

test('头像颜色固定在账号 ID，改名、岗位和主题变化均不影响；同名账号可以区分', () => {
  const account = { id: 41, username: 'warehouse01', display_name: '张三' }
  const { tone } = getAdminAvatar(account)
  assert.equal(getAdminAvatar({ ...account, id: '41' }).tone, tone)
  assert.equal(getAdminAvatar({ ...account, username: 'renamed', display_name: '李四', roles: [], erp_preferences: { appearance: { accent: 'purple' } } }).tone, tone)
  assert.notEqual(getAdminAvatar({ ...account, id: 42 }).tone, tone)
  assert.equal(getAdminAvatar({ username: 'warehouse01' }).tone, getAdminAvatar({ username: 'warehouse01', display_name: '李四' }).tone)
})

test('所属岗位只读账号分配，保留自定义名称与全部岗位，不取查看范围或可进入岗位', () => {
  assert.deepEqual(getAdminRoleNames({
    roles: [
      { role_key: 'warehouse', name: '成品仓库主管' },
      { role_key: 'purchase', name: '采购' },
      { role_key: 'engineering', name: '工程' },
      { role_key: 'warehouse', name: '成品仓库主管' },
      { role_key: 'finance', name: '财务', disabled: true },
    ],
    is_super_admin: true,
    effective_session: { roles: ['boss', 'sales', 'finance'] },
    activeRoleKey: 'all',
  }), ['成品仓库主管', '采购', '工程'])
  assert.deepEqual(getAdminRoleNames({ is_super_admin: true, roles: [] }), [])
  assert.deepEqual(getAdminRoleNames(null), [])
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
