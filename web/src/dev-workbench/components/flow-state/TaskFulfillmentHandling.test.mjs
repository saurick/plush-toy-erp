import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { registerMermaidTestRenderer } from '../../../../scripts/test/mermaidRuntime.mjs'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../../common/consts/workflowTaskDiscovery.generated.mjs'
import { DEV_FLOW_STATE_CATALOG as businessCatalog } from '../../config/devFlowStateCatalog.mjs'

registerMermaidTestRenderer()

test('所有环节保留办理规则和受阻处理，关联岗位路径只读显示', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Guide } = await import('./TaskFulfillmentGuide.jsx')
  let navigate
  function Probe() { navigate = useNavigate(); return h(Guide, { businessCatalog }) }
  await harness.render(h(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Probe)))
  const root = harness.container
  for (const step of catalog.fulfillment_flow) {
    const navigateToStage = navigate
    await harness.act(() => navigateToStage(`/__dev/status-flows?flow_stage=${step.stage}`))
    const rules = root.querySelector('[data-stage-handling]')
    for (const text of [step.handling.issues, step.handling.action, step.handling.resume]) assert(rules.textContent.includes(text))
    assert(!rules.closest('details').open, '一般受阻说明按需展开，不冒充独立异常流程')
    if (step.subflow) assert(root.querySelector('.erp-dev-fulfillment-guide__subflow [data-business-flow]'))
    const relatedStages = step.handling.task_stages.filter((key) => !step.stages.includes(key))
    assert.deepEqual(
      [...rules.querySelectorAll('.erp-dev-fulfillment-guide__links > span')].map((node) => node.textContent),
      relatedStages.map((key) => {
        const stage = catalog.stages.find((item) => item.key === key)
        return [stage.group, stage.label].filter(Boolean).join(' · ')
      })
    )
    assert(!rules.querySelector('a[href^="/erp/"]'))
    const chainLink = [...root.querySelectorAll('a')].find((link) => link.textContent === '在流程探索中查看链路')
    assert.equal(chainLink?.getAttribute('href'), `/__dev/flow-explorer?chain=${step.business_chain}`)
  }
})

test('异常详情直达正式链路，财务关联概览使用独立页签', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Guide } = await import('./TaskFulfillmentGuide.jsx')
  const exception = catalog.exception_guides.find((guide) => guide.key === 'production_quality')
  const render = (search) => harness.render(h(MemoryRouter, {
    key: search,
    initialEntries: [`/__dev/status-flows?${search}`],
    future: { v7_startTransition: true, v7_relativeSplatPath: true },
  }, h(Guide, { businessCatalog })))
  await render(`flow_tab=exceptions&flow_exception=${exception.key}`)
  const root = harness.container
  assert(!root.querySelector('[data-relation-filters]'))
  const relationDisclosure = [...root.querySelectorAll('summary')].find((summary) => summary.textContent === '关联动作与规则')
  assert(relationDisclosure && !relationDisclosure.parentElement.open)
  const chainLink = [...root.querySelectorAll('a')].find((link) => link.textContent === '在流程探索中查看链路')
  assert.equal(chainLink?.getAttribute('href'), `/__dev/flow-explorer?chain=${exception.business_chain}`)
  await render('flow_tab=finance&flow_role=purchase')
  await harness.flush()
  assert.deepEqual([...root.querySelectorAll('[aria-label="流程视图"] [role="tab"]')].map((node) => node.textContent),
    ['订单全流程', '异常处理', '财务关联概览'])
  assert.ok(root.querySelector('[data-finance-relationships]'))
  assert(!root.querySelector('[data-relation-filters]'))
  assert.equal(root.querySelectorAll('[data-finance-overview] [data-finance-node]').length, 12)
  assert(!root.querySelector('[data-finance-overview] [data-role-match]'))
})
