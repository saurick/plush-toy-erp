import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeTaskDiscoveryFilters, taskDiscoveryRequest, taskStagePath, workflowTaskDiscoveryCatalog } from './workflowTaskDiscovery.mjs'
import { buildMobileRoleTaskQuery, mobileTaskQueryScope } from './mobileTaskQueries.mjs'
import { buildWorkflowTaskBoardRequest, readWorkflowTaskBoardFiltersFromSearch, writeWorkflowTaskBoardFiltersToSearch } from './workflowTaskBoard.mjs'
import { businessTaskSource, followupSource, operationalFactTaskContext } from './workflowFollowup.mjs'

test('通用分类不进入请求，电脑保留办理人而手机清除隐藏人员条件', () => {
  const old = { moduleKey: 'quality', chainKey: 'fulfillment', stageKey: 'cutting_quality', assignee: '12' }
  assert.deepEqual(normalizeTaskDiscoveryFilters(old), { assignee: '12' })
  const mobile = buildMobileRoleTaskQuery({ roleKey: 'quality', viewKey: 'todo', ...old })
  assert.deepEqual(mobile, { view_key: 'todo', role_key: 'quality', limit: 50 })
  assert.equal(mobileTaskQueryScope('scope', old), mobileTaskQueryScope('scope', {}))
  assert.deepEqual(taskDiscoveryRequest(old), { assignee: '12' })
})

test('桌面明确环节来源保留并可清除，撤下的分类不进入请求或链接', () => {
  const filters = readWorkflowTaskBoardFiltersFromSearch('?stage_key=cutting_quality&module_key=quality&chain_key=fulfillment&assignee=12&q=订单甲')
  const request = buildWorkflowTaskBoardRequest(filters)
  assert.equal(request.stage_key, 'cutting_quality')
  assert.equal(request.module_key, undefined)
  assert.equal(request.chain_key, undefined)
  assert.equal(request.assignee, '12')
  const restored = writeWorkflowTaskBoardFiltersToSearch('?module_key=quality&chain_key=fulfillment', filters)
  assert.equal(restored.get('stage_key'), 'cutting_quality')
  assert.equal(restored.has('module_key'), false)
  assert.equal(restored.has('chain_key'), false)
  const cleared = writeWorkflowTaskBoardFiltersToSearch(restored, { ...filters, stageKey: '' })
  assert.equal(cleared.has('stage_key'), false)
  assert.equal(cleared.get('assignee'), '12')
  assert.match(taskStagePath(filters.stageKey), /订单履约.*裁片.*检验/u)
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
