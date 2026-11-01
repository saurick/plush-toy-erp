import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWorkflowTaskFlowEventItems } from './workflowTaskFlowEventPresentation.mjs'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'

test('flow records retain their own task label and approval semantics', () => {
  const current = {
    id: 41,
    task_name: '财务用料审核',
    task_group: 'engineering_material_finance_review',
    owner_role_key: 'finance',
    required_capability_key:
      PermissionCode.ENGINEERING_MATERIAL_FINANCE_APPROVE,
  }
  const ordinary = {
    id: 42,
    task_name: '补齐报价资料',
    task_group: 'engineering_data',
    owner_role_key: 'engineering',
  }
  const items = buildWorkflowTaskFlowEventItems({
    task: current,
    events: [
      {
        id: 8,
        task_id: 41,
        event_type: 'status_changed',
        to_status_key: 'done',
        task: current,
        actor_display_name: '财务演示人员',
        actor_role_key: 'finance',
      },
      {
        id: 7,
        task_id: 42,
        event_type: 'status_changed',
        to_status_key: 'done',
        task: ordinary,
        actor_display_name: '工程演示人员',
        actor_role_key: 'engineering',
      },
    ],
  })
  assert.equal(items[0].sourceLabel, '本任务')
  assert.equal(items[0].taskName, '财务用料审核')
  assert.equal(items[1].sourceLabel, '补齐报价资料')
  assert.equal(items[1].label, '任务已完成')
  assert.equal(items[1].actorName, '工程演示人员')
  assert.notEqual(items[0].label, items[1].label)
})

test('current-task records preserve the same role and historical missing fields', () => {
  const items = buildWorkflowTaskFlowEventItems({
    task: { id: 41, task_name: '核对资料', task_group: 'generic' },
    scope: 'task',
    events: [{ id: 7, event_type: 'created' }],
  })
  assert.equal(items[0].sourceLabel, '本任务')
  assert.equal(items[0].timeLabel, '时间未记录')
  assert.equal(items[0].reason, '')
})
