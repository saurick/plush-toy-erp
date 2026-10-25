import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../../common/consts/workflowTaskDiscovery.generated.mjs'
import { DEV_FLOW_STATE_CATALOG as businessCatalog } from '../../config/devFlowStateCatalog.mjs'

test('所有环节保留办理规则和受阻处理，有子流程时优先显示图', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Guide } = await import('./TaskFulfillmentGuide.jsx')
  let navigate
  function Probe() { navigate = useNavigate(); return h(Guide) }
  await harness.render(h(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Probe)))
  const root = harness.container
  for (const step of catalog.fulfillment_flow) {
    const navigateToStage = navigate
    await harness.act(() => navigateToStage(`/__dev/status-flows?flow_stage=${step.stage}`))
    const rules = root.querySelector('[data-stage-handling]')
    for (const text of [step.handling.issues, step.handling.action, step.handling.resume]) assert(rules.textContent.includes(text))
    assert(!rules.closest('details').open, '一般受阻说明按需展开，不冒充独立异常流程')
    if (step.subflow) assert(root.querySelector('.erp-dev-fulfillment-guide__subflow [data-business-flow]'))
    for (const key of step.stages) assert(root.querySelector(`a[href="/erp/task-board?stage_key=${key}"]`))
  }
})

test('业务专题选定后直接呈现同源交互图，没有文字节点中转页', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Topics } = await import('./BusinessChainTopics.jsx')
  const chain = businessCatalog.businessChains.find((item) => item.key === 'delivery_to_settlement')
  await harness.render(h(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Topics, { catalog: businessCatalog, selectedTopicKey: chain.key, onSelectChain: () => {} })))
  const root = harness.container
  assert(root.querySelector('[data-topic-diagram="delivery_to_settlement"] [data-business-flow]'))
  assert(root.querySelector('[aria-label="选择业务专题"]'))
  assert.equal(root.querySelector('.erp-dev-fulfillment-guide__topic-nodes'), null)
})
