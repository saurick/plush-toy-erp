import assert from 'node:assert/strict'
import test from 'node:test'
import { canOpenWorkflowTaskEntry } from './workflowTaskEntryAccess.mjs'

test('workflow task entry access requires a registered menu path', () => {
  assert.equal(canOpenWorkflowTaskEntry({}, ''), false)
  assert.equal(
    canOpenWorkflowTaskEntry(
      { is_super_admin: true },
      '/erp/not-a-registered-page?source_id=1'
    ),
    false
  )
})

test('super admin can open a registered workflow task entry', () => {
  assert.equal(
    canOpenWorkflowTaskEntry(
      { is_super_admin: true },
      '/erp/warehouse/shipments?shipment_id=12'
    ),
    true
  )
})

test('normal admin entry access follows the effective menu projection', () => {
  const entryPath = '/erp/warehouse/shipments?shipment_id=12#details'

  assert.equal(
    canOpenWorkflowTaskEntry(
      { menus: ['/erp/dashboard', '/erp/warehouse/shipments'] },
      entryPath
    ),
    true
  )
  assert.equal(
    canOpenWorkflowTaskEntry(
      { menus: [{ path: '/erp/warehouse/shipments' }] },
      entryPath
    ),
    true
  )
  assert.equal(
    canOpenWorkflowTaskEntry(
      { menus: ['/erp/dashboard', '/erp/task-board'] },
      entryPath
    ),
    false
  )
})
