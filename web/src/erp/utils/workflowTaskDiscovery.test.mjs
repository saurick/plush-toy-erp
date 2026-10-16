import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeTaskDiscoveryFilters, taskDiscoveryRequest, taskStagePath, workflowTaskDiscoveryCatalog } from './workflowTaskDiscovery.mjs'
import { buildMobileRoleTaskQuery, mobileTaskQueryScope } from './mobileTaskQueries.mjs'
import { buildWorkflowTaskBoardRequest, readWorkflowTaskBoardFiltersFromSearch, writeWorkflowTaskBoardFiltersToSearch } from './workflowTaskBoard.mjs'
import { taskSavedViewsKey, normalizeTaskSavedViews } from './workflowTaskSavedViews.mjs'
import { businessTaskSource, followupSource, operationalFactTaskContext } from './workflowFollowup.mjs'

test('desktop, mobile, URL restore and saved views retain the same discovery scope', () => {
  const filters = { moduleKey: 'quality', chainKey: 'fulfillment', stageKey: 'cutting_quality', assignee: '12' }
  const desktop = buildWorkflowTaskBoardRequest(filters)
  const mobile = buildMobileRoleTaskQuery({ roleKey: 'quality', viewKey: 'todo', ...filters })
  for (const [key, value] of Object.entries(taskDiscoveryRequest(filters))) { assert.equal(desktop[key], value); assert.equal(mobile[key], value) }
  const restored = normalizeTaskDiscoveryFilters(readWorkflowTaskBoardFiltersFromSearch(writeWorkflowTaskBoardFiltersToSearch('', filters)))
  assert.deepEqual(restored, filters)
  assert.notEqual(mobileTaskQueryScope('same-account', filters), mobileTaskQueryScope('same-account', { ...filters, stageKey: 'shell_quality' }))
  assert.match(taskStagePath(filters.stageKey), /订单履约.*裁片.*检验/u)
  assert.notEqual(taskSavedViewsKey(1), taskSavedViewsKey(2))
  assert.equal(taskSavedViewsKey(null), '')
  assert.deepEqual(normalizeTaskSavedViews([{ name: '裁片质检', filters: { ...filters, payload: 'must-not-store', stageKey: 'removed' } }])[0].filters, { moduleKey: 'quality', chainKey: 'fulfillment', assignee: '12' })
})

test('related-task readers do not expand followup creation and chain labels have no duplicated identities', () => {
  assert.deepEqual(businessTaskSource('purchase_receipt', { id: 5 }), { source_type: 'purchase_receipt', source_id: 5 })
  assert.equal(followupSource('purchase_receipt', { id: 5 }), null)
  assert.equal(businessTaskSource('unknown', { id: 5 }), null)
  assert.deepEqual(operationalFactTaskContext('finance', { id: 5, source_type: 'SHIPMENT', source_id: 8, source_no: 'SHIP-8' }), { sourceType: 'shipment', record: { id: 8, source_no: 'SHIP-8' } })
  assert.deepEqual(operationalFactTaskContext('finance', { id: 5, source_type: 'MANUAL' }), { sourceType: null, record: null })
  const catalog = workflowTaskDiscoveryCatalog
  assert.equal(new Set(catalog.stages.map((stage) => stage.key)).size, catalog.stages.length)
  assert.equal(new Set(catalog.stages.map((stage) => taskStagePath(stage.key))).size, catalog.stages.length, '环节选项不能同名重复且过滤不同任务')
  const order = catalog.fulfillment_flow.map((step) => step.stage)
  assert.ok(order.indexOf('finished_inbound') < order.indexOf('packaging'))
  assert.ok(order.indexOf('packaging') < order.indexOf('shipment'))
  for (const step of catalog.fulfillment_flow) for (const stage of step.stages) assert.ok(catalog.stages.some((item) => item.key === stage))
  for (const assignee of ['01', '-1', '1.1', '9007199254740992']) assert.deepEqual(normalizeTaskDiscoveryFilters({ assignee }), {})
})
