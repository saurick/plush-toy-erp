import assert from 'node:assert/strict'
import test from 'node:test'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { buildFulfillmentSubflow, buildSubflowMermaid } from './devFulfillmentSubflow.mjs'
import { buildFulfillmentExceptionDirectory, buildFulfillmentOverview, getFulfillmentStageContext, getFulfillmentSupplement, selectFulfillmentSubstep } from './devFulfillmentPresentation.mjs'

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
  const diagram = buildSubflowMermaid(flow, { role: 'warehouse', compact: true, direction: 'LR' })
  assert.match(diagram.chart, /flowchart LR/u)
  assert.match(diagram.chart, /class N3 fulfillmentRoleMatch/u)
  assert.match(diagram.chart, /class N4 fulfillmentRoleMatch/u)
  assert.doesNotMatch(diagram.chart, /class N0 /u)
  assert.deepEqual(diagram.nodes.map((node) => node.label), flow.nodes.map((node) => node.label))
})

test('the exception directory exposes sources without a main-flow entry and never invents stage bindings', () => {
  const directory = buildFulfillmentExceptionDirectory(catalog.exception_guides, 'warehouse', 'cutting_issue')
  assert.equal(directory.length, catalog.exception_guides.length)
  assert(directory.some((item) => item.guide.key === 'over_issue' && item.roleMatch))
  assert(directory.some((item) => item.guide.key === 'outsourcing_rejection'))
  assert(directory.some((item) => item.guide.key === 'posted_purchase'))
  assert(directory.every((item) => !item.related), 'unregistered stage associations stay unknown')
  for (const item of directory) assert.equal(item.guide, catalog.exception_guides.find((guide) => guide.key === item.guide.key))
  const related = buildFulfillmentExceptionDirectory(catalog.exception_guides, 'engineering', 'incoming_quality')
  assert.equal(related[0].guide.key, 'purchase_rejection')
  assert(related[0].related)
  assert(related.every((item) => !item.roleMatch), 'unknown approval assignments must not create fixed role duties')
  assert.equal(related.length, catalog.exception_guides.length, 'a role with no fixed duties can still inspect every exception')
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
