import assert from 'node:assert/strict'
import test from 'node:test'
import { auditSources, getAuditActionOptions } from './auditActionFilters.mjs'

test('each audit action belongs to exactly one source and can be cleared independently', () => {
  assert.deepEqual(getAuditActionOptions(''), [])
  const values = []
  for (const source of Object.keys(auditSources)) {
    const [all, ...options] = getAuditActionOptions(source)
    assert.deepEqual(all, { value: '', label: '全部操作' })
    assert.ok(options.length > 0)
    for (const option of options) {
      assert.ok(option.value && option.label)
      values.push(option.value)
    }
  }
  assert.equal(new Set(values).size, values.length)
})

test('workflow offers process initiation, reassignment and emergency authorization', () => {
  assert.deepEqual(
    new Set(getAuditActionOptions('workflow').slice(1).map(({ value }) => value)),
    new Set(['process_instance_created', 'workflow_task.reassign', 'workflow_task.break_glass'])
  )
  assert.ok(auditSources.workflow.actions.process_instance_created.byEventType)
  assert.ok(auditSources.admin_manage.actions.legal_notice_acknowledgement.byEventType)
})
