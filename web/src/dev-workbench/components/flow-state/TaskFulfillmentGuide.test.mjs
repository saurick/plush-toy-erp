import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../../common/consts/workflowTaskDiscovery.generated.mjs'

async function mount(t, url = '/__dev/status-flows?view=chain&chain=all') {
  const harness = await createReactTestHarness(t)
  const { default: Guide } = await import('./TaskFulfillmentGuide.jsx')
  const navigation = {}
  function Probe() { Object.assign(navigation, { location: useLocation(), navigate: useNavigate() }); return h(Guide) }
  const render = async (entry, key) => harness.render(h(MemoryRouter, { key, initialEntries: [entry], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Probe)))
  await render(url, 'initial')
  const root = harness.container
  const click = async (selector) => { const el = root.querySelector(selector); assert(el, selector); await harness.act(() => { el.focus(); el.click() }); await harness.flush() }
  return { harness, root, navigation, render, click, params: () => new URLSearchParams(navigation.location.search) }
}

test('all 17 stages have separate exception targets and the detail panel and mode switch stay in place', async (t) => {
  const { root, click, params, harness } = await mount(t)
  const panel = root.querySelector('[aria-label="流程详情"]')
  const map = root.querySelector('[data-fulfillment-chain]')
  for (const [index, step] of catalog.fulfillment_flow.entries()) {
    const main = root.querySelector(`[data-chain-stage="${step.stage}"] [data-stage-card]`)
    const entry = root.querySelector(`[data-stage-exception="${step.stage}"]`)
    assert(entry && !main.contains(entry))
    assert.equal(entry.getAttribute('aria-label'), `查看第${index + 1}环节异常`)
    await click(`[data-chain-stage="${step.stage}"] [data-stage-card]`)
    const mode = root.querySelector('[aria-label="环节办理方式"]')
    await harness.act(() => mode.querySelectorAll('input')[1].click())
    assert.equal(root.querySelector('[aria-label="环节办理方式"]'), mode)
    assert.equal(root.querySelector('[aria-label="流程详情"]'), panel)
    assert.equal(root.querySelector('[data-fulfillment-chain]'), map)
    assert.equal(root.querySelectorAll('[data-chain-stage]').length, 17)
    assert.equal(params().get('flow_stage'), step.stage)
    assert(root.querySelector(`[data-stage-handling="${step.stage}"]`))
    assert.equal(root.querySelector('[data-stage-normal]'), null)
  }
})

test('multiple sources and plans need an explicit choice; single independent plan preserves stage context without fabricating an origin', async (t) => {
  const { root, click, params, harness } = await mount(t)
  await click('[data-stage-exception="incoming_quality"]')
  assert.equal(params().has('flow_exception'), false)
  const types = root.querySelector('[aria-label="异常类型"]')
  assert.equal(types.querySelectorAll('button').length, 2)
  await harness.act(() => types.querySelector('button').click())
  assert.equal(params().get('flow_exception'), 'purchase_rejection')
  assert.equal(params().get('flow_exception_origin'), 'incoming_quality')
  assert.equal(params().has('flow_decision'), false)
  assert.equal(root.querySelector('[data-exception-handling]'), null)
  await click('[aria-label="处理方式"] button')
  assert(root.querySelector('[data-exception-handling]'))
  await click('[aria-label="处理方式"] button[aria-pressed="true"]')
  assert.equal(params().has('flow_decision'), false)
  assert.equal(params().has('flow_exception_step'), false)
  assert.equal(root.querySelector('[data-exception-handling]'), null)
  await click('[data-stage-exception="cutting_issue"]')
  assert.equal(params().get('flow_exception'), 'over_issue')
  assert.equal(params().get('flow_stage'), 'cutting_issue')
  assert.equal(params().has('flow_exception_origin'), false)
  assert.equal(root.querySelectorAll('[data-exception-handling]').length, 1)
  await click('button[aria-label="收起详情"]')
  assert.equal(params().has('flow_exception'), false)
  assert.equal(harness.runtimeWindow.document.activeElement, root.querySelector('[data-stage-exception="cutting_issue"]'))
})

test('cross-stage browsing retains a plan and an explicit step through role changes, history and reload', async (t) => {
  const { root, click, params, harness, render, navigation } = await mount(t, '/__dev/status-flows?view=chain&chain=all&flow_role=purchase&flow_exception=production_quality&flow_exception_origin=cutting_quality&flow_decision=original_rework&flow_exception_step=reinspect')
  assert.equal(root.querySelector('[data-selected-exception-node]').dataset.selectedExceptionNode, 'reinspect')
  const targets = root.querySelectorAll('.erp-dev-fulfillment-guide__involved button')
  await harness.act(() => targets[1].click())
  assert.equal(params().get('flow_exception_origin'), 'shell_quality')
  assert.equal(params().get('flow_decision'), 'original_rework')
  assert.equal(params().get('flow_exception_step'), 'reinspect')
  const saved = navigation.location.pathname + navigation.location.search
  await render(saved, 'reload')
  assert.equal(root.querySelector('[data-selected-exception-node]').dataset.selectedExceptionNode, 'reinspect')
  await click('[data-exception-handling] button')
  await harness.act(() => navigation.navigate(-1))
  assert.equal(root.querySelector('[data-selected-exception-node]').dataset.selectedExceptionNode, 'reinspect')
  const remake = [...root.querySelectorAll('[aria-label="处理方式"] button')].find((button) => button.textContent === '补料重做')
  await harness.act(() => remake.click())
  assert.equal(params().get('flow_decision'), 'remake')
  assert.equal(params().has('flow_exception_step'), false)
  assert(root.querySelector('.erp-dev-chain__reentry-note').textContent.includes('新批'))
  assert.equal(root.querySelectorAll('[data-chain-stage]').length, 17)
})

test('invalid source links fail explicitly and an unavailable step resolves within its selected plan', async (t) => {
  const { root, navigation, harness } = await mount(t, '/__dev/status-flows?flow_exception=production_quality&flow_exception_origin=sales_order')
  assert(root.querySelector('[role="alert"]').textContent.includes('不适用'))
  assert.equal(root.querySelector('[data-exception-handling]'), null)
  await harness.act(() => navigation.navigate('/__dev/status-flows?flow_role=purchase&flow_exception=purchase_rejection&flow_decision=return_to_vendor&flow_exception_step=arrival'))
  assert.equal(root.querySelector('[data-selected-exception-node]').dataset.selectedExceptionNode, 'arrange')
  assert.equal(root.querySelectorAll('.erp-dev-chain__handling-steps button').length, 3)
})
