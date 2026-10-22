import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../../common/consts/workflowTaskDiscovery.generated.mjs'

test('external exception entries stay separate from main buttons and preserve independent sources', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: TaskFulfillmentGuide } = await import('./TaskFulfillmentGuide.jsx')
  let navigation
  function Probe() {
    navigation = { location: useLocation() }
    return h(TaskFulfillmentGuide)
  }
  await harness.render(h(MemoryRouter, {
    initialEntries: ['/__dev/status-flows?view=chain&chain=all'],
    future: { v7_startTransition: true, v7_relativeSplatPath: true },
  }, h(Probe)))
  const root = harness.container
  for (const [index, step] of catalog.fulfillment_flow.entries()) {
    const stage = root.querySelector(`[data-chain-stage="${step.stage}"]`)
    const main = stage.querySelector('[data-stage-card]')
    const entry = stage.querySelector('[data-stage-exception]')
    assert.equal(main.tagName, 'BUTTON')
    assert.equal(main.querySelector('button'), null)
    assert.equal(Boolean(entry), Boolean(step.handling.guides.length), 'entries follow the handling catalog, including independently handled issues')
    if (entry) {
      assert.equal(main.contains(entry), false)
      assert.equal(entry.getAttribute('aria-label'), `查看第${index + 1}环节异常分支`)
      assert(entry.textContent.includes('查看异常'))
    }
    if (step.branch) assert(main.textContent.includes('按约定'))
  }
  const independent = root.querySelector('[data-stage-exception="cutting_issue"]')
  await harness.act(() => { independent.focus(); independent.click() })
  assert.equal(new URLSearchParams(navigation.location.search).get('flow_exception'), 'over_issue')
  assert.equal(new URLSearchParams(navigation.location.search).has('flow_exception_origin'), false)
  assert.equal(root.querySelectorAll('[data-chain-stage][data-origin]').length, 0)
  assert.equal(root.querySelectorAll('[data-chain-wire="exception-out"]').length, 0)
  await harness.act(() => root.querySelector('button[aria-label="收起异常分支"]').click())
  await harness.flush()
  assert.equal(harness.runtimeWindow.document.activeElement, independent, 'closing the independent issue returns focus to its external opener')
  const incoming = root.querySelector('[data-stage-exception="incoming_quality"]')
  await harness.act(() => incoming.click())
  assert.equal(new URLSearchParams(navigation.location.search).get('flow_exception_origin'), 'incoming_quality')
  assert.equal(root.querySelector('[data-stage-mode]'), null, 'opening an exception does not open the normal stage detail')
  await harness.act(() => root.querySelector('[data-chain-stage="incoming_quality"] [data-stage-card]').click())
  assert.equal(new URLSearchParams(navigation.location.search).has('flow_exception'), false)
  assert(root.querySelector('[data-stage-mode="normal"]'), 'the main button opens normal work and clears the exception selection')
})

test('refresh restores an explicitly selected exception step across role boundaries', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: TaskFulfillmentGuide } = await import('./TaskFulfillmentGuide.jsx')
  let navigation
  function Probe() {
    navigation = { location: useLocation(), navigate: useNavigate() }
    return h(TaskFulfillmentGuide)
  }
  const renderAt = (entry, key) => harness.render(h(MemoryRouter, {
    key,
    initialEntries: [entry],
    future: { v7_startTransition: true, v7_relativeSplatPath: true },
  }, h(Probe)))
  const initialURL = '/__dev/status-flows?view=chain&chain=all&flow_role=purchase&flow_stage=incoming_quality&flow_exception=purchase_rejection&flow_exception_origin=incoming_quality&flow_decision=replacement&flow_exception_step=arrival'
  await renderAt(initialURL, 'initial')
  const root = harness.container
  const selected = () => root.querySelector('[data-selected-exception-node]')?.dataset.selectedExceptionNode
  const params = () => new URLSearchParams(navigation.location.search)
  assert.equal(selected(), 'arrival', 'the URL selection takes priority over the purchase role default')
  assert.equal(params().get('flow_role'), 'purchase')
  assert.equal(root.querySelector('button[aria-pressed="true"] > strong')?.textContent, '仓库登记新到货')
  assert.equal(root.querySelector('button[aria-pressed="true"]').parentElement.dataset.roleMatch, 'false', 'role emphasis does not restrict which step can be restored')

  const reinspect = [...root.querySelectorAll('[data-exception-handling] button')].find((button) => button.querySelector('strong')?.textContent === 'IQC 重新检验')
  assert(reinspect)
  await harness.act(() => reinspect.click())
  await harness.flush()
  assert.equal(selected(), 'reinspect')
  assert.equal(params().get('flow_exception_step'), 'reinspect')
  await harness.act(() => navigation.navigate(-1))
  assert.equal(selected(), 'arrival', 'browser history restores the previous explicit choice')
  await harness.act(() => navigation.navigate(1))
  assert.equal(selected(), 'reinspect')

  const savedURL = navigation.location.pathname + navigation.location.search
  await renderAt(savedURL, 'reload')
  await harness.flush()
  assert.equal(selected(), 'reinspect', 'a fresh component mount restores the saved choice without a role-change reset')
  assert.equal(navigation.location.pathname + navigation.location.search, savedURL)
  assert.equal(params().get('flow_role'), 'purchase')
  assert.equal(params().get('flow_decision'), 'replacement')
  assert.equal(params().get('flow_exception_origin'), 'incoming_quality')
  assert.equal(root.querySelectorAll('[data-chain-stage]').length, 17)
})

test('an unavailable exception step uses the current plan and role instead of stale selection', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: TaskFulfillmentGuide } = await import('./TaskFulfillmentGuide.jsx')
  const entry = '/__dev/status-flows?view=chain&chain=all&flow_role=purchase&flow_exception=purchase_rejection&flow_decision=return_to_vendor&flow_exception_step=arrival'
  await harness.render(h(MemoryRouter, {
    initialEntries: [entry],
    future: { v7_startTransition: true, v7_relativeSplatPath: true },
  }, h(TaskFulfillmentGuide)))
  assert.equal(harness.container.querySelector('[data-selected-exception-node]')?.dataset.selectedExceptionNode, 'arrange')
  assert.equal(harness.container.querySelector('button[aria-pressed="true"] > strong')?.textContent, '采购登记退厂范围')
  assert.equal(harness.container.querySelectorAll('.erp-dev-chain__handling-steps button').length, 3)
})

test('the main chain stays present across exception selection, schemes, role changes and restored links', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: TaskFulfillmentGuide } = await import('./TaskFulfillmentGuide.jsx')
  let navigation
  function Probe() {
    navigation = { location: useLocation(), navigate: useNavigate() }
    return h(TaskFulfillmentGuide)
  }
  await harness.render(h(MemoryRouter, {
    initialEntries: ['/__dev/status-flows?view=chain&chain=all&flow_role=warehouse&flow_stage=cutting_quality&flow_exception=production_quality&flow_exception_origin=shell_quality&flow_decision=remake&flow_exception_step=issue'],
    future: { v7_startTransition: true, v7_relativeSplatPath: true },
  }, h(Probe)))
  const root = harness.container
  const params = () => new URLSearchParams(navigation.location.search)
  const click = async (selector) => {
    const target = root.querySelector(selector)
    assert(target, selector)
    await harness.act(async () => target.click())
    await harness.flush()
  }
  const select = async (label, text) => {
    const input = root.querySelector(`input[aria-label="${label}"]`)
    assert(input, label)
    const selector = input.closest('.ant-select').querySelector('.ant-select-selector')
    await harness.act(async () => selector.dispatchEvent(new harness.runtimeWindow.MouseEvent('mousedown', { bubbles: true })))
    const option = [...document.querySelectorAll('[role="option"]')].find((node) => node.textContent === text)
    assert(option, `option ${text}`)
    await harness.act(async () => option.click())
    await harness.flush()
  }

  assert.equal(root.querySelectorAll('[data-chain-stage]').length, 17)
  assert(root.querySelector('[data-chain-stage="shell_quality"][data-origin]'))
  assert(root.querySelector('[data-chain-stage="cutting_issue"][data-reentry]'))
  assert(root.querySelector('[data-selected-exception-node="issue"]'))
  assert.equal(root.querySelectorAll('.erp-dev-fulfillment-guide__exception-position').length, 0)

  await click('button[aria-label="查看第14环节异常分支"]')
  assert.equal(params().get('flow_stage'), 'cutting_quality', 'the URL keeps navigation context separate from the exception source')
  assert.equal(params().get('flow_exception_origin'), 'finished_quality')
  assert.equal(params().get('flow_decision'), 'remake')
  assert(root.querySelector('[data-selected-exception-node="issue"]'))

  await select('异常处理方案', '报废放弃')
  assert.equal(params().get('flow_decision'), 'scrap')
  assert.equal(params().get('flow_exception_step'), 'execute', 'the new plan owns the selected step')
  assert(root.querySelector('[data-selected-exception-node="execute"]'))
  assert.equal(root.querySelectorAll('[data-chain-stage][data-return]').length, 0)
  assert.equal(root.querySelectorAll('[data-chain-stage][data-reentry]').length, 0)
  assert.equal(root.querySelectorAll('[data-chain-stage]').length, 17)

  await select('关注岗位', '品质')
  assert.equal(params().get('flow_exception_origin'), 'finished_quality')
  assert.equal(params().get('flow_decision'), 'scrap')
  assert(root.querySelector('[data-selected-exception-node="inspect"]'))
  assert.equal(root.querySelectorAll('[data-chain-stage][data-role-match="true"]').length, 4)

  await harness.act(() => navigation.navigate('/__dev/status-flows?view=chain&chain=all&flow_role=quality&flow_exception=production_quality&flow_exception_origin=finished_quality&flow_decision=scrap&flow_exception_step=inspect'))
  assert(root.querySelector('[data-selected-exception-node="inspect"]'), 'a direct URL restores the open branch and step')
  await click('button[aria-label="收起异常分支"]')
  assert.equal(params().has('flow_exception'), false)
  assert.equal(root.querySelectorAll('[data-chain-stage]').length, 17)
  assert.equal(root.querySelectorAll('[data-exception-handling]').length, 0)

  const independent = [...root.querySelectorAll('.erp-dev-chain__independent button')].find((button) => button.textContent.includes('生产超领材料'))
  await harness.act(async () => independent.click())
  assert.equal(params().get('flow_exception'), 'over_issue')
  assert.equal(root.querySelectorAll('[data-origin]').length, 0)
  assert.equal(root.querySelectorAll('[data-chain-stage]').length, 17)

  await harness.act(() => navigation.navigate('/__dev/status-flows?view=chain&chain=all&flow_exception=production_quality&flow_exception_origin=sales_order'))
  assert(root.querySelector('[role="alert"]'))
  assert.equal(root.querySelectorAll('[data-origin]').length, 0)
  assert.equal(root.querySelectorAll('[data-chain-stage]').length, 17)
})
