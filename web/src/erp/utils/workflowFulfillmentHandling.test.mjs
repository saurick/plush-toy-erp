import assert from 'node:assert/strict'
import test from 'node:test'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { fulfillmentHandling } from './workflowFulfillment.mjs'

test('all 17 business stages explain issues, existing actions and conditions for continuing', () => {
  assert.equal(catalog.fulfillment_flow.length, 17)
  const before = JSON.stringify(catalog)
  for (const step of catalog.fulfillment_flow) {
    const handling = fulfillmentHandling(step)
    assert.deepEqual(Object.keys(step.handling).sort(), ['action', 'guides', 'issues', 'resume', 'task_stages'])
    for (const key of ['issues', 'action', 'resume']) assert(handling[key].trim(), `${step.stage}/${key}`)
    assert(handling.taskLinks.length, `${step.stage} needs a task entry`)
    assert.equal(new Set(handling.taskLinks.map((link) => link.href)).size, handling.taskLinks.length)
    for (const key of step.handling.task_stages) assert(handling.taskLinks.some((link) => link.key === key))
    for (const guide of catalog.exception_guides.filter((item) => item.entry_stages.includes(step.stage))) {
      assert(handling.guides.includes(guide), `${step.stage} lost ${guide.key}`)
    }
  }
  assert.equal(JSON.stringify(catalog), before)
})

test('handling exposes the actual exception and follow-through tasks rather than only normal tasks', () => {
  const links = (key) => fulfillmentHandling(catalog.fulfillment_flow.find((step) => step.stage === key)).taskLinks.map((link) => link.key)
  assert(links('incoming_quality').includes('incoming_exception'))
  assert(links('cutting_quality').includes('cutting_decision'))
  assert(links('shell_quality').includes('sewing_decision'))
  assert(links('finished_quality').includes('handwork_decision'))
  assert(links('finished_inbound').includes('production_fact'))
  for (const key of ['receivable_registration', 'payable_registration', 'reconciliation', 'payment']) assert(links('financial_settlement').includes(key))
  assert.match(fulfillmentHandling(catalog.fulfillment_flow.find((step) => step.stage === 'cutting_return')).action, /整批回货/u)
  assert.match(fulfillmentHandling(catalog.fulfillment_flow.find((step) => step.stage === 'packaging')).resume, /实际包装/u)
  assert.match(fulfillmentHandling(catalog.fulfillment_flow.find((step) => step.stage === 'shipment')).resume, /显式确认实际发货/u)
})

test('invalid task references and fabricated main-chain exception connections fail closed', () => {
  const step = catalog.fulfillment_flow[0]
  assert.throws(() => fulfillmentHandling({ ...step, handling: null }), /Missing fulfillment handling/u)
  assert.throws(() => fulfillmentHandling({ ...step, handling: { ...step.handling, task_stages: ['missing'] } }), /Invalid handling tasks/u)
  for (const guide of ['missing', 'production_quality']) {
    assert.throws(() => fulfillmentHandling({ ...step, handling: { ...step.handling, guides: [guide] } }), /Invalid handling guide/u)
  }
  const issue = fulfillmentHandling(catalog.fulfillment_flow.find((item) => item.stage === 'cutting_issue'))
  assert.deepEqual(issue.guides.map((guide) => guide.key), ['over_issue'])
  assert.deepEqual(issue.guides[0].entry_stages, [], 'related independent work does not acquire a made-up main-chain origin')
})
