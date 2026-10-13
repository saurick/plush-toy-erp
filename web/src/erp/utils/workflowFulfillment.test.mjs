import assert from 'node:assert/strict'
import test from 'node:test'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { ROLE_DISPLAY_NAMES } from './roleKeys.mjs'
import { fulfillmentRoleOptions, fulfillmentStepMatchesRole, fulfillmentTaskLinks, normalizeFulfillmentRole } from './workflowFulfillment.mjs'
import { DEV_FLOW_STATE_CATALOG } from '../../dev-workbench/config/devFlowStateCatalog.mjs'
import { readWorkflowTaskBoardFiltersFromSearch } from './workflowTaskBoard.mjs'

test('岗位只投影同一流程，所有岗位和专题引用必须来自现有目录', () => {
  assert.equal(normalizeFulfillmentRole('unknown'), 'all')
  assert.equal(normalizeFulfillmentRole('warehouse'), 'warehouse')
  for (const step of catalog.fulfillment_flow) {
    assert.ok(step.role_keys.length)
    for (const role of step.role_keys) assert.ok(Object.hasOwn(ROLE_DISPLAY_NAMES, role))
    assert.ok(DEV_FLOW_STATE_CATALOG.businessChains.some((chain) => chain.key === step.business_chain))
    assert.equal(fulfillmentStepMatchesRole(step, 'all'), true)
  }
  for (const option of fulfillmentRoleOptions) assert.ok(catalog.fulfillment_flow.some((step) => fulfillmentStepMatchesRole(step, option.value)))
  const warehouse = catalog.fulfillment_flow.filter((step) => fulfillmentStepMatchesRole(step, 'warehouse')).map((step) => step.stage)
  for (const stage of ['purchase_count', 'incoming_quality', 'cutting_issue', 'cutting_return', 'finished_inbound', 'packaging']) assert.ok(warehouse.includes(stage))
  assert.ok(!warehouse.includes('shell_quality'))
})

test('合并环节为每一种任务提供有效查询入口，避免只查到第一类任务', () => {
  for (const step of catalog.fulfillment_flow) {
    const links = fulfillmentTaskLinks(step)
    assert.equal(links.length, step.stages.length)
    assert.equal(new Set(links.map((link) => link.key)).size, links.length)
    for (const link of links) assert.equal(readWorkflowTaskBoardFiltersFromSearch(link.href.split('?')[1]).stageKey, link.key)
  }
  const first = catalog.fulfillment_flow[0]
  assert.ok(fulfillmentTaskLinks(first).some((link) => link.key === 'engineering'))
  assert.ok(fulfillmentTaskLinks(first).some((link) => link.key === 'engineering_data'))
  assert.equal(first.approvals.length, 2)
  assert.match(first.approvals[1].condition, /工程.*老板.*财务/u)
  assert.match(catalog.fulfillment_flow.find((step) => step.stage === 'purchasing').approvals[0].condition, /不重复审批/u)
  const shipment = catalog.fulfillment_flow.find((step) => step.stage === 'shipment')
  assert.deepEqual(shipment.role_keys, ['sales', 'finance'])
  assert.match(shipment.approvals[0].passed, /不算已经发货/u)
  assert.match(catalog.exception_approval.passed, /执行.*复检/u)
})
