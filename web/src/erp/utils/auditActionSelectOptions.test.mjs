import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAuditActionSelectOptions } from './auditActionSelectOptions.mjs'

const actionMetaMap = {
  'admin_user.create': { label: '创建员工账号' },
  'role.permissions.set': { label: '岗位功能变更' },
  'customer_config.activate': { label: '启用客户业务设置' },
  'admin_bootstrap.completed': { label: '系统准备完成' },
  'workflow_task.break_glass': { label: '紧急代办授权' },
}

test('audit action select follows the stable source taxonomy with exact coverage', () => {
  const options = buildAuditActionSelectOptions(actionMetaMap)

  assert.deepEqual(
    options.map((option) => option.label),
    ['全部操作', '系统管理', '客户业务设置', '系统准备', '紧急任务处理']
  )
  assert.deepEqual(
    options
      .slice(1)
      .flatMap((group) => group.options.map((option) => option.value)),
    Object.keys(actionMetaMap)
  )
})

test('audit action select rejects an action outside the source taxonomy', () => {
  assert.throws(
    () =>
      buildAuditActionSelectOptions({
        'unknown.action': { label: '未分类操作' },
      }),
    /missing a group/u
  )
})
