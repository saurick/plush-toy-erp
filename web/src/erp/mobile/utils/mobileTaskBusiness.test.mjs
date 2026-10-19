import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canOpenMobileTaskBusiness,
  resolveMobileTaskBusinessEntry,
  selectMobileRelatedBusinessTask,
  mobileTaskRelatedCommands,
  taskScopedSearchParams,
} from './mobileTaskBusiness.mjs'
import { workflowTaskSourceForEntryPath } from '../../utils/dashboardTaskDisplay.mjs'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'

const task = {
  id: 31,
task_group: 'handoff_receipt_inbound',
task_code: 'source-handoff-receipt-inbound-91',
  source_type: 'purchase_receipt',
source_id: 91,
  payload: {
    source_task_contract: 'workflow.source-task/v1',
source_task_producer: 'fulfillment.source',
    source_record_id: 91,
source_task_intent_hash: 'a'.repeat(64),
    entry_path: '/erp/warehouse/inbound?receipt_id=91',
  },
}
const allowed = { applicable: true, resolved: true, allowed: true }
const profile = { id: 12, menus: ['/erp/warehouse/inbound'] }

test('a mobile business workspace requires both the authoritative source and menu access', () => {
  assert.equal(canOpenMobileTaskBusiness(task, profile, allowed), true)
  for (const access of [{}, { ...allowed, resolved: false }, { ...allowed, allowed: false }, { ...allowed, applicable: false }]) {
    assert.equal(canOpenMobileTaskBusiness(task, profile, access), false)
    assert.equal(canOpenMobileTaskBusiness(task, { is_super_admin: true }, access), false)
  }
  assert.equal(canOpenMobileTaskBusiness(task, { menus: ['/erp/task-board'] }, allowed), false)
})

test('tampered source anchors and keyword-only tasks cannot select a business form', () => {
  for (const invalid of [
    { ...task, task_code: 'another-task' },
    { ...task, source_id: 92 },
    { ...task, payload: { ...task.payload, source_task_intent_hash: '' } },
    { ...task, payload: { ...task.payload, entry_path: '/erp/warehouse/inbound?receipt_id=92' } },
    { id: 31, source_type: 'inbound', source_id: 91, source_no: 'PR-91' },
  ]) assert.equal(resolveMobileTaskBusinessEntry(invalid), '')
})

test('task form query changes preserve the verified source and selected lot', () => {
  const receipt = new URLSearchParams('receipt_id=91')
  assert.equal(taskScopedSearchParams(receipt, 'receipt_id=92&view=txns').toString(), 'receipt_id=91&view=txns')
  assert.equal(taskScopedSearchParams(receipt, '').get('receipt_id'), '91')
  const inventory = taskScopedSearchParams(new URLSearchParams('lot_id=7&warehouse_id=8'), 'lot_id=9&warehouse_id=10&view=txns')
  assert.equal(inventory.get('lot_id'), '7')
  assert.equal(inventory.get('warehouse_id'), '8')
  assert.equal(inventory.get('view'), 'txns')
})

test('a source follow-up opens its exact record without broad keyword matching', () => {
  const followup = { id: 32, task_group: 'business_followup', source_type: 'purchase_order', source_id: 92 }
  assert.equal(resolveMobileTaskBusinessEntry(followup), '/erp/purchase/accessories?purchase_order_id=92')
  assert.equal(resolveMobileTaskBusinessEntry({ ...followup, source_type: 'purchase_return' }), '')
  assert.equal(resolveMobileTaskBusinessEntry({ ...followup, source_id: 0 }), '')
})

test('related forms require their own menu and mutation capability and cannot substitute a task or source', () => {
  const user = { menus: ['/erp/warehouse/inventory'], permissions: [PermissionCode.WAREHOUSE_ADJUSTMENT_CREATE], effective_session: { actions: [PermissionCode.WAREHOUSE_ADJUSTMENT_CREATE] } }
  assert.equal(mobileTaskRelatedCommands(task, user, allowed).length, 1)
  assert.deepEqual(mobileTaskRelatedCommands(task, { menus: user.menus, permissions: [] }, allowed), [])
  assert.deepEqual(mobileTaskRelatedCommands(task, { menus: [], permissions: user.permissions }, allowed), [])
  assert.deepEqual(mobileTaskRelatedCommands(task, user, { ...allowed, allowed: false }), [])
  assert.deepEqual(mobileTaskRelatedCommands(task, { ...user, effective_session: { actions: [] } }, allowed), [])
})

test('related source identity comes from exact record keys and child facts retain their own identity', () => {
  assert.deepEqual(workflowTaskSourceForEntryPath('/erp/production/quality-inspections?quality_inspection_id=71&link_keyword=other'), { source_type: 'quality_inspection', source_id: 71 })
  assert.deepEqual(workflowTaskSourceForEntryPath('/erp/purchase/processing-contracts?outsourcing_order_id=8&outsourcing_fact_id=91'), { source_type: 'outsourcing_fact', source_id: 91 })
  assert.equal(workflowTaskSourceForEntryPath('/erp/production/quality-inspections?link_keyword=QI-71'), null)
  assert.equal(workflowTaskSourceForEntryPath('/erp/production/quality-inspections?quality_inspection_id=9007199254740993'), null)
})

test('related task selection rejects incomplete or substituted sources and never guesses between ambiguous tasks', () => {
  const source = { source_type: 'quality_inspection', source_id: 71 }
  const target = { ...task,
id: 41,
version: 1,
source_type: source.source_type,
source_id: source.source_id,
task_group: 'handoff_outsourcing_quality',
task_code: 'source-handoff-outsourcing-quality-71',
owner_role_key: 'quality',
task_status_key: 'ready',
    payload: { ...task.payload, source_record_id: 71, entry_path: '/erp/production/quality-inspections?quality_inspection_id=71' } }
  assert.equal(selectMobileRelatedBusinessTask({ tasks: [target], total: 1 }, source, 'quality'), target)
  assert.equal(selectMobileRelatedBusinessTask({ tasks: [], total: 0 }, source, 'quality'), null)
  assert.equal(selectMobileRelatedBusinessTask({ tasks: [target, { ...target, id: 42 }], total: 2 }, source, 'quality'), null)
  assert.throws(() => selectMobileRelatedBusinessTask({ tasks: [target], total: 2 }, source, 'quality'))
  assert.throws(() => selectMobileRelatedBusinessTask({ tasks: [{ ...target, source_id: 72 }], total: 1 }, source, 'quality'))
})
