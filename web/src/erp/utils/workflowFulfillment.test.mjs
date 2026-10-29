import assert from 'node:assert/strict'
import test from 'node:test'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { ROLE_DISPLAY_NAMES } from './roleKeys.mjs'
import { fulfillmentExceptionPath, fulfillmentRoleOptions, fulfillmentStepMatchesRole, fulfillmentTaskLinks, normalizeFulfillmentRole, selectFulfillmentExceptionGuide } from './workflowFulfillment.mjs'
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
  assert.match(first.approvals[1].condition, /自动送审.*老板.*另一位财务/u)
  assert.match(catalog.fulfillment_flow.find((step) => step.stage === 'purchasing').approvals[0].condition, /不重复审批/u)
  const shipment = catalog.fulfillment_flow.find((step) => step.stage === 'shipment')
  assert.deepEqual(shipment.role_keys, ['sales', 'finance'])
  assert.match(shipment.approvals[0].passed, /不算已经发货/u)
})

test('异常按来源提供岗位路径和独立方案，不复用生产审批到首次来料', () => {
  assert.equal(catalog.exception_guides.length, 6)
  for (const guide of catalog.exception_guides) {
    assert(DEV_FLOW_STATE_CATALOG.businessChains.some((chain) => chain.key === guide.business_chain))
    assert(guide.source_refs.length > 0)
    for (const stage of guide.entry_stages) assert(catalog.fulfillment_flow.some((step) => step.stage === stage))
    assert.equal(fulfillmentTaskLinks(guide).length, guide.stages.length)
    const linkLabels = fulfillmentTaskLinks(guide).map((link) => link.pathLabel)
    assert.equal(new Set(linkLabels).size, linkLabels.length, '相同名称的异常任务须带所属环节')
    for (const plan of guide.plans) {
      const { steps } = fulfillmentExceptionPath(guide, plan.key)
      assert.equal(new Set(steps.map((step) => step.key)).size, steps.length)
      for (const step of steps) {
        assert(step.role && step.result)
        for (const role of step.role_keys) assert(Object.hasOwn(ROLE_DISPLAY_NAMES, role))
      }
      assert(plan.closure && plan.recovery)
    }
  }
  const purchase = selectFulfillmentExceptionGuide('purchase_rejection', 'purchase')
  assert.equal(purchase.approval, undefined)
  assert.deepEqual(purchase.plans.map((plan) => plan.key), ['return_to_vendor', 'replacement'])
  assert.deepEqual(fulfillmentExceptionPath(purchase, 'replacement').steps.map((step) => step.key), ['inspect', 'arrange', 'arrival', 'reinspect', 'inbound'])
  assert.match(purchase.plans[1].closure, /不表示新货已入库/u)
  assert.match(purchase.plans[1].steps[0].result, /此时不生成新收货或待检记录/u)
  assert.match(purchase.plans[1].steps[1].result, /仓库填写实点数量并确认/u)
  assert.equal(selectFulfillmentExceptionGuide('missing', 'finance').key, 'posted_purchase')
  assert.equal(selectFulfillmentExceptionGuide('production_quality', 'purchase').key, 'production_quality', '明确来源不因换岗位而漂移')
})

test('报废、让步、返工和重做保留不同的执行与闭环条件', () => {
  const guide = selectFulfillmentExceptionGuide('production_quality', 'sales')
  const scrap = fulfillmentExceptionPath(guide, 'scrap')
  assert.deepEqual(scrap.steps.map((step) => step.key), ['inspect', 'propose', 'approval', 'execute'])
  assert.match(scrap.plan.closure, /终止流转.*不再安排本批回货、复检或恢复生产/u)
  assert.match(scrap.plan.closure, /交付缺口/u)
  const remake = fulfillmentExceptionPath(guide, 'remake')
  assert(remake.steps.some((step) => step.key === 'issue'))
  assert.match(remake.steps.find((step) => step.key === 'execute').result, /冻结用料.*新的裁片/u)
  const rework = fulfillmentExceptionPath(guide, 'original_rework')
  assert(rework.steps.some((step) => step.key === 'reinspect'))
  assert(!rework.steps.some((step) => step.key === 'issue'))
  assert(!fulfillmentExceptionPath(guide, 'concession').steps.some((step) => step.key === 'reinspect'))
  assert.match(guide.approval.rejected, /本次审批结束/u)
  const allowance = fulfillmentExceptionPath(selectFulfillmentExceptionGuide('over_issue', 'production'), 'allowance')
  assert.deepEqual(allowance.steps.map((step) => step.key), ['request', 'approval', 'issue'])
  assert.match(allowance.plan.closure, /审批通过不等于已经发料/u)
})
