import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { WORKFLOW_TASK_BUSINESS_ACTIONS, workflowTaskBusinessContract, workflowTaskBusinessActionAllowed } from './workflowTaskBusinessContract.mjs'

test('every source handoff has an explicit task action projection', () => {
  const source = readFileSync(new URL('./fulfillmentTask.mjs', import.meta.url), 'utf8')
  const entries = source.match(/const SOURCE_TYPES = Object\.freeze\(\{([\s\S]*?)\}\)/u)[1]
  const groups = [...entries.matchAll(/^\s+([a-z_]+):/gmu)].map((match) => `handoff_${match[1]}`)
  assert.ok(groups.length > 20)
  for (const group of groups) assert.ok(WORKFLOW_TASK_BUSINESS_ACTIONS[group]?.length, group)
})

test('task projections contain only the current operation and never grant permission', () => {
  assert.deepEqual(workflowTaskBusinessContract({ task_group: 'engineering_data', source_type: 'sales_order', source_id: 1 }).actionKeys, ['engineering'])
  const arrival = workflowTaskBusinessContract({ task_group: 'handoff_purchase_arrival', source_type: 'purchase_order', source_id: 7 })
  assert.deepEqual(arrival.actionKeys, ['generate-inbound'])
  assert.equal(workflowTaskBusinessActionAllowed(arrival, 'purchase-edit'), false)
  assert.equal(workflowTaskBusinessActionAllowed(arrival, 'lifecycle-cancel'), false)
  const inbound = workflowTaskBusinessContract({ task_group: 'handoff_receipt_inbound', source_type: 'purchase_receipt', source_id: 8 })
  assert.deepEqual(inbound.actionKeys, ['post'])
  assert.equal(workflowTaskBusinessActionAllowed(inbound, 'cancel'), false)
  for (const is_super_admin of [false, true]) {
    assert.deepEqual(workflowTaskBusinessContract({ task_group: 'handoff_shipment_execute', source_type: 'shipment', source_id: 9, is_super_admin }).actionKeys, ['shipment-edit', 'shipment-release', 'shipment-ship'])
  }
})

test('coordination and review tasks use task decisions rather than source document editing', () => {
  for (const task of [{ task_group: 'business_followup', source_type: 'purchase_order' }, { task_group: 'order_review', source_type: 'sales_order' }]) {
    assert.equal(workflowTaskBusinessContract(task).containedBusiness, false)
  }
  assert.equal(workflowTaskBusinessContract({ source_type: 'unknown' }).actionKeys.length, 0)
})
