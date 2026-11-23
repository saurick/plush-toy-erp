import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBusinessFlowMermaid } from '../../common/components/diagram/mermaidGraph.mjs'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { buildFulfillmentSubflow } from './devFulfillmentSubflow.mjs'
import { buildFulfillmentOverview, getFulfillmentStageContext, getFulfillmentSupplement, selectFulfillmentSubstep, selectFulfillmentException } from './devFulfillmentPresentation.mjs'

const steps = catalog.fulfillment_flow
const step = (key) => steps.find((item) => item.stage === key)

test('the role overview retains exactly the 17 source stages and their original positions', () => {
  const groups = buildFulfillmentOverview(steps)
  const entries = groups.flatMap((group) => [...group.stages, ...group.branches])
  assert.equal(entries.length, 17)
  assert.equal(new Set(entries.map((entry) => entry.step.stage)).size, 17)
  assert.deepEqual(entries.map((entry) => entry.step.stage).sort(), steps.map((item) => item.stage).sort())
  for (const entry of entries) {
    assert.equal(entry.step, steps[entry.number - 1])
    assert(entry.label)
  }
  assert.deepEqual(groups.flatMap((group) => group.branches).map((entry) => entry.number), [2, 4])
  assert(groups.flatMap((group) => group.branches).every((entry) => entry.step.branch))
})

test('conditional cash flows remain attached to order and contract contexts', () => {
  const context = getFulfillmentStageContext(steps, 'sewing_execute')
  assert.equal(context.previous.stage, 'cutting_quality')
  assert.equal(context.next.stage, 'shell_quality')
  assert.deepEqual(context.related.map((item) => item.step.stage), ['supplier_advance'])
  for (const key of ['customer_advance', 'supplier_advance']) {
    const branch = getFulfillmentStageContext(steps, key)
    assert.equal(branch.previous, null)
    assert.equal(branch.next, null)
    assert(branch.related.length > 1, key)
  }
  assert(getFulfillmentStageContext(steps, 'shipment').related.some((item) => item.step.stage === 'customer_advance'))
})

test('role focus selects concrete actions while preserving the selected stage and source responsibilities', () => {
  const flow = buildFulfillmentSubflow(step('sewing_execute'))
  assert.equal(selectFulfillmentSubstep(flow, null, 'warehouse').key, 'issue')
  assert.equal(selectFulfillmentSubstep(flow, null, 'production').key, 'route')
  assert.equal(selectFulfillmentSubstep(flow, null, 'finance').key, 'contract')
  assert.equal(selectFulfillmentSubstep(flow, 'return', 'production').key, 'return')
  assert.equal(selectFulfillmentSubstep(flow, null, 'engineering').key, 'route')
  assert.deepEqual(flow.nodes.find((node) => node.key === 'route').role_keys, ['production'])
  const diagram = buildBusinessFlowMermaid(flow, { role: 'warehouse' })
  assert.match(diagram.chart, /flowchart LR/u)
  assert.deepEqual(diagram.nodes.filter((node) => node.data['role-match']).map((node) => node.key), ['issue', 'return'])
  assert.deepEqual(diagram.nodes.map((node) => node.label), flow.nodes.map((node) => node.label))
})

test('supplementary instructions retain uncovered source text without repeating node instructions', () => {
  const issue = step('cutting_issue')
  const supplementaryIssue = getFulfillmentSupplement(issue)
  assert.deepEqual(supplementaryIssue.handoffs, [])
  assert.deepEqual(supplementaryIssue.approvals, [])
  const sales = step('sales_order')
  const supplementarySales = getFulfillmentSupplement(sales)
  assert.deepEqual(supplementarySales.handoffs, [sales.handoffs[2]], 'the uncovered parallel preparation condition remains available')
  for (const source of steps) {
    const extra = getFulfillmentSupplement(source)
    const references = new Set(source.subflow?.nodes.flatMap((node) => node.detail_refs) || [])
    source.handoffs?.forEach((text, index) => assert.equal(extra.handoffs.includes(text), !references.has(`handoff:${index}`)))
    source.approvals?.forEach((approval, index) => assert.equal(extra.approvals.includes(approval), !references.has(`approval:${index}`)))
  }
  const selected = buildFulfillmentSubflow(issue).nodes.find((node) => node.key === 'issue')
  assert.deepEqual(selected.details.map((detail) => detail.reference), ['handoff:2', 'result'])
  assert.equal(selected.details.find((detail) => detail.reference === 'handoff:2').text, issue.handoffs[2])
})

test('registered plans preserve their continuations and use the default origin only when unique', () => {
  for (const guide of catalog.exception_guides) {
    const defaultOrigin = guide.entry_stages.length === 1 ? guide.entry_stages[0] : undefined
    const empty = selectFulfillmentException({ guideKey: guide.key })
    assert.equal(empty.plan?.key || null, guide.plans.length === 1 ? guide.plans[0].key : null)
    assert.equal(empty.origin?.stage, defaultOrigin)
    for (const plan of guide.plans) {
      for (const originStage of [...guide.entry_stages, undefined]) {
        const expectedOrigin = originStage || defaultOrigin
        const selection = selectFulfillmentException({ guideKey: guide.key, planKey: plan.key, originStage })
        assert.equal(selection.plan, plan)
        assert(selection.steps.length)
        assert.equal(selection.origin?.stage, expectedOrigin)
        assert.equal(selection.graph.origin?.stage, expectedOrigin)
        assert.equal(selection.reentryStage?.stage, plan.continuation.reentry?.stage)
        if (plan.continuation.kind === 'stop') assert.equal(selection.returnStage, null)
        if (!expectedOrigin && ['origin', 'next'].includes(plan.continuation.target)) assert.equal(selection.returnStage, null)
      }
    }
  }
  assert.equal(selectFulfillmentException({ guideKey: 'production_quality', planKey: 'original_rework', originStage: 'shell_quality' }).returnStage.stage, 'shell_quality')
  assert.equal(selectFulfillmentException({ guideKey: 'production_quality', planKey: 'concession', originStage: 'cutting_quality' }).returnStage.stage, 'sewing_execute')
  assert(selectFulfillmentException({ guideKey: 'production_quality', originStage: 'sales_order' }).invalid)
  assert(selectFulfillmentException({ guideKey: 'purchase_rejection', planKey: 'scrap' }).invalid)
})
