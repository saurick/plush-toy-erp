import assert from 'node:assert/strict'
import test from 'node:test'
import { getAuditChanges, summarizeChange } from './auditLogChanges.mjs'

test('audit changes: detail and export retain every changed business field', () => {
  const payload = {
    before: {
      display_name: '原姓名',
      phone: '13812345678',
      disabled: false,
      is_super_admin: false,
      role_keys: ['sales'],
      version: 1,
    },
    after: {
      display_name: '新姓名',
      phone: '13912345678',
      disabled: true,
      is_super_admin: true,
      role_keys: ['sales', 'warehouse'],
      version: 2,
    },
  }
  const changes = getAuditChanges(payload)
  assert.equal(changes.length, 6)
  assert.match(summarizeChange(payload), /岗位信息/u)
  assert.match(summarizeChange(payload, { limit: 2 }), /另有 4 项变化/u)
  assert.deepEqual(changes[0], {
    key: 'display_name',
    label: '员工姓名',
    before: '原姓名',
    after: '新姓名',
  })
  assert.equal(changes[4].after, '业务、仓库')
})

test('audit changes: ignores unchanged fields and retains explicit clears', () => {
  const changes = getAuditChanges({
    before: { display_name: '员工', phone: '13812345678' },
    after: { display_name: '员工', phone: '' },
  })
  assert.equal(changes.length, 1)
  assert.equal(changes[0].before, '138****5678')
  assert.equal(changes[0].after, '-')
})

test('audit changes: never exposes secrets, raw payload or private technical fields', () => {
  const changes = getAuditChanges({
    before: { password: 'old-secret', token: 'old-token', actor_id: 1 },
    after: {
      password: 'new-secret',
      token: 'new-token',
      actor_id: 2,
      password_reset: true,
    },
  })
  assert.deepEqual(changes, [
    { key: 'password_reset', label: '密码', before: '-', after: '已重置' },
  ])
  assert.doesNotMatch(
    summarizeChange({
      after: { phone: '13812345678', permission_keys: ['system.secret'] },
    }),
    /13812345678|system.secret/u
  )
  assert.equal(summarizeChange({}), '本次操作已记录')
})
