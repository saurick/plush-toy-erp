import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../../common/consts/workflowTaskDiscovery.generated.mjs'
import { DEV_FLOW_STATE_CATALOG as businessCatalog } from '../../config/devFlowStateCatalog.mjs'

test('every stage retains its issues, handling rules, continuation conditions and relevant task links', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Guide } = await import('./TaskFulfillmentGuide.jsx')
  let navigate
  function Probe() { navigate = useNavigate(); return h(Guide) }
  await harness.render(h(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Probe)))
  const root = harness.container
  const navigateTo = (url) => harness.act(() => navigate(url))
  for (const step of catalog.fulfillment_flow) {
    await navigateTo(`/__dev/status-flows?view=chain&chain=all&flow_stage=${step.stage}&flow_handling=1`)
    const rules = root.querySelector('[data-stage-handling]')
    for (const text of [step.handling.issues, step.handling.action, step.handling.resume]) assert(rules.textContent.includes(text), `${step.stage}: ${text}`)
    for (const key of [...step.stages, ...step.handling.task_stages]) assert(root.querySelector(`a[href="/erp/task-board?stage_key=${key}"]`), key)
    assert.equal(root.querySelector('button[aria-label="异常情况"]'), null)
  }
  await navigateTo('/__dev/status-flows?view=chain&chain=all&flow_stage=cutting_quality')
  const step = catalog.fulfillment_flow.find((item) => item.stage === 'cutting_quality')
  assert(root.querySelector('[data-stage-normal]').textContent.includes(step.result))
  assert(root.querySelector('[data-stage-normal]').textContent.includes(step.subflow.summary))
  assert.equal(root.querySelectorAll('.erp-dev-fulfillment-guide__subflow [role="combobox"]').length, 0)
  assert(root.querySelector('.erp-dev-fulfillment-guide__transitions').textContent.includes('不合格'))
})

test('business and exception directories use the same panel, keep global origin unset and cover every stage', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Guide } = await import('./TaskFulfillmentGuide.jsx')
  const { default: Topics } = await import('./BusinessChainTopics.jsx')
  let location
  function Probe() { location = useLocation(); return h(Guide, { businessChains: businessCatalog.businessChains, renderTopics: ({ onSelectTopic, selectedTopicKey }) => h(Topics, { catalog: businessCatalog, onSelectChain: onSelectTopic, selectedTopicKey }) }) }
  await harness.render(h(MemoryRouter, { initialEntries: ['/__dev/status-flows?view=chain&chain=all&flow_tab=topics'], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Probe)))
  const root = harness.container
  const panel = root.querySelector('[aria-label="流程详情"]')
  const tabs = root.querySelector('[aria-label="查阅目录"]')
  await harness.act(() => root.querySelector('[data-overview-chain] ').click())
  assert(new URLSearchParams(location.search).get('flow_topic'))
  assert(root.querySelector('.erp-dev-fulfillment-guide__topic-nodes'))
  await harness.act(() => tabs.querySelectorAll('input')[1].click())
  assert.equal(root.querySelector('[aria-label="查阅目录"]'), tabs)
  assert.equal(root.querySelectorAll('[data-exception-entry]').length, catalog.exception_guides.length)
  const covered = new Set(catalog.exception_guides.flatMap((guide) => catalog.fulfillment_flow.filter((step) => step.handling.guides.includes(guide.key)).map((step) => step.stage)))
  root.querySelectorAll('[data-handling-entry]').forEach((node) => covered.add(node.dataset.handlingEntry))
  assert.equal(covered.size, 17)
  await harness.act(() => root.querySelector('[data-exception-entry="production_quality"] button').click())
  assert.equal(new URLSearchParams(location.search).has('flow_exception_origin'), false)
  assert.equal(new URLSearchParams(location.search).has('flow_stage'), false)
  assert.equal(root.querySelector('[data-exception-handling]'), null)
  assert.equal(root.querySelector('[aria-label="流程详情"]'), panel)
  assert.equal(root.querySelector('.ant-drawer-open'), null)
  await harness.act(() => root.querySelector('[data-handling-entry="packaging"] button').click())
  assert(root.querySelector('[data-stage-handling="packaging"]'))
  assert.equal(new URLSearchParams(location.search).get('flow_tab'), 'exceptions')
})
