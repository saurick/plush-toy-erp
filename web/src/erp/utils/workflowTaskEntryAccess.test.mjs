import assert from 'node:assert/strict'
import test from 'node:test'
import { canOpenWorkflowTaskEntry } from './workflowTaskEntryAccess.mjs'

const allowedSourceAccess = Object.freeze({
  applicable: true,
  resolved: true,
  allowed: true,
})

test('workflow task entry access requires a registered menu path', () => {
  assert.equal(canOpenWorkflowTaskEntry({}, ''), false)
  assert.equal(
    canOpenWorkflowTaskEntry(
      { is_super_admin: true },
      '/erp/not-a-registered-page?source_id=1',
      allowedSourceAccess
    ),
    false
  )
})

test('super admin can open a registered workflow task entry', () => {
  assert.equal(
    canOpenWorkflowTaskEntry(
      { is_super_admin: true },
      '/erp/warehouse/shipments?shipment_id=12',
      allowedSourceAccess
    ),
    true
  )
})

test('source linkage and backend source access are mandatory even for super admin', () => {
  const profile = { is_super_admin: true }
  const entryPath = '/erp/warehouse/shipments?shipment_id=12'

  assert.equal(canOpenWorkflowTaskEntry(profile, entryPath), false)
  assert.equal(
    canOpenWorkflowTaskEntry(profile, entryPath, {
      applicable: false,
      resolved: true,
      allowed: true,
    }),
    false
  )
  assert.equal(
    canOpenWorkflowTaskEntry(profile, entryPath, {
      applicable: true,
      resolved: true,
      allowed: false,
    }),
    false
  )
})

test('normal admin entry access follows the effective menu projection', () => {
  const entryPath = '/erp/warehouse/shipments?shipment_id=12#details'

  assert.equal(
    canOpenWorkflowTaskEntry(
      { menus: ['/erp/dashboard', '/erp/warehouse/shipments'] },
      entryPath,
      allowedSourceAccess
    ),
    true
  )
  assert.equal(
    canOpenWorkflowTaskEntry(
      { menus: [{ path: '/erp/warehouse/shipments' }] },
      entryPath,
      allowedSourceAccess
    ),
    true
  )
  assert.equal(
    canOpenWorkflowTaskEntry(
      { menus: ['/erp/dashboard', '/erp/task-board'] },
      entryPath,
      allowedSourceAccess
    ),
    false
  )
})
