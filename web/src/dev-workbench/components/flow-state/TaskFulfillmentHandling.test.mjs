import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../../common/consts/workflowTaskDiscovery.generated.mjs'
import { DEV_FLOW_STATE_CATALOG as businessCatalog } from '../../config/devFlowStateCatalog.mjs'

test('all stages switch normal work and handling without duplicating entries or losing task access', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Guide } = await import('./TaskFulfillmentGuide.jsx')
  let navigation
  function Probe() {
    navigation = { location: useLocation(), navigate: useNavigate() }
    return h(Guide)
  }
  await harness.render(h(MemoryRouter, { initialEntries: ['/__dev/status-flows?view=chain&chain=all&flow_role=warehouse'], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Probe)))
  const root = harness.container
  const params = () => new URLSearchParams(navigation.location.search)
  assert.equal(root.querySelectorAll('button[aria-label$="环节问题处理"]').length, 0)
  assert.equal(root.querySelector('button[aria-label="异常情况"]'), null, '总图不再常驻重复的目录按钮')
  for (const [index, step] of catalog.fulfillment_flow.entries()) {
    await harness.act(() => root.querySelector(`.erp-dev-chain__stage-main[aria-label="${index + 1} ${step.label}"]`).click())
    assert.equal(params().has('flow_handling'), false)
    assert.equal(root.querySelector('[data-stage-handling]'), null)
    const mode = root.querySelector('[aria-label="环节办理方式"]')
    for (const key of step.stages) assert(root.querySelector(`a[href="/erp/task-board?stage_key=${key}"]`), `${step.stage}/normal/${key}`)
    await harness.act(() => mode.querySelectorAll('input')[1].click())
    assert.equal(root.querySelector('[aria-label="环节办理方式"]'), mode, '切换保留同一个导航条')
    assert.equal(root.querySelector('.erp-dev-fulfillment-guide__subflow'), null, '问题处理不叠加正常子流程')
    assert.equal(root.querySelector('[data-stage-normal]'), null)
    assert.equal(params().get('flow_stage'), step.stage)
    assert.equal(params().get('flow_handling'), '1')
    assert.equal(params().get('flow_role'), 'warehouse')
    const handling = root.querySelector(`[data-stage-handling="${step.stage}"]`)
    assert(handling.textContent.includes(step.handling.issues))
    assert.equal(mode.querySelectorAll('.ant-segmented-item-label')[1].textContent, '异常处理')
    assert(handling.textContent.includes(step.handling.action))
    assert(handling.textContent.includes(step.handling.resume))
    for (const key of step.handling.task_stages) assert(root.querySelector(`a[href="/erp/task-board?stage_key=${key}"]`), `${step.stage}/${key}`)
    assert.equal(root.querySelectorAll('[data-chain-stage]').length, 17)
  }
  await harness.act(() => root.querySelector('button[aria-label="15 查货与包装"]').click())
  assert.equal(params().has('flow_handling'), false)
  assert.equal(root.querySelector('[data-stage-handling]'), null)
  assert.equal(root.querySelector('[aria-label="环节办理方式"] input').checked, true)
  await harness.act(() => navigation.navigate(-1))
  assert.equal(params().get('flow_handling'), '1')
  assert(root.querySelector('[data-stage-handling="financial_settlement"] dd'))
})

test('handling restores from its URL and the directory offers all stages without changing exception origins', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Guide } = await import('./TaskFulfillmentGuide.jsx')
  const { default: Topics } = await import('./BusinessChainTopics.jsx')
  let navigation
  function Probe() {
    navigation = { location: useLocation(), navigate: useNavigate() }
    return h(Guide, { renderTopics: (onOpenExceptionDirectory) => h(Topics, { catalog: businessCatalog, onOpenExceptionDirectory }) })
  }
  await harness.render(h(MemoryRouter, { initialEntries: ['/__dev/status-flows?view=chain&chain=all&flow_role=warehouse&flow_stage=cutting_issue&flow_handling=1'], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Probe)))
  const root = harness.container
  const params = () => new URLSearchParams(navigation.location.search)
  const clickText = async (text) => {
    const button = [...document.querySelectorAll('button')].find((node) => node.textContent === text)
    assert(button, text)
    await harness.act(() => button.click())
    await harness.flush()
  }
  assert(root.querySelector('[data-stage-handling="cutting_issue"] dd'))
  await harness.act(() => root.querySelector('button[aria-label="查看生产超领材料处理路径"]').click())
  assert.equal(params().get('flow_exception'), 'over_issue')
  assert.equal(params().has('flow_exception_origin'), false)
  assert.equal(root.querySelectorAll('[data-origin]').length, 0)
  await harness.act(() => root.querySelector('button[aria-label="收起异常分支"]').click())
  await harness.flush()
  assert.equal(document.activeElement.getAttribute('aria-label'), '查看生产超领材料处理路径', '返回后恢复重新挂载的处理入口焦点')
  assert.equal(params().get('flow_stage'), 'cutting_issue')
  assert.equal(params().get('flow_handling'), '1')
  await clickText('按业务查阅')
  assert.equal(params().get('flow_tab'), 'topics')
  await clickText('异常目录')
  await harness.flush()
  assert.equal(document.querySelectorAll('[data-handling-entry]').length, 17, '从业务目录进入默认查阅全部异常')
  assert.equal(document.querySelectorAll('[data-exception-entry]').length, catalog.exception_guides.length)
  const directoryScope = document.querySelector('[aria-label="异常查看范围"]')
  await harness.act(() => directoryScope.querySelectorAll('input')[0].click())
  assert.equal(document.querySelectorAll('[data-handling-entry]').length, 1)
  assert.equal(document.querySelectorAll('[data-exception-entry]').length, 1)
  assert(document.querySelector('[data-exception-entry="over_issue"]'))
  await harness.act(() => directoryScope.querySelectorAll('input')[1].click())
  assert.equal(document.querySelector('[aria-label="异常查看范围"]'), directoryScope, '范围切换保留同一个导航条')
  assert.equal(document.querySelectorAll('[data-handling-entry]').length, 17)
  assert.equal(document.querySelectorAll('[data-exception-entry]').length, catalog.exception_guides.length)
  await harness.act(() => document.querySelector('[data-handling-entry="packaging"] button').click())
  assert.equal(params().get('flow_stage'), 'packaging')
  assert.equal(params().get('flow_handling'), '1')
  assert(root.querySelector('[data-stage-handling="packaging"] dd'))
  assert.equal(params().has('flow_tab'), false, '从目录选择环节返回主链处理说明')
  await clickText('按业务查阅')
  await clickText('异常目录')
  await harness.flush()
  assert.equal(document.querySelectorAll('[data-handling-entry]').length, 17, '重新打开完整目录')
  await harness.act(() => document.querySelector('[aria-label="异常查看范围"] input').click())
  assert.equal(document.querySelectorAll('[data-handling-entry]').length, 1)
  assert.equal(document.querySelectorAll('[data-exception-entry]').length, 0, '无专项处置的环节仍保留通用处理')
  await harness.act(() => document.querySelector('.erp-dev-exception-directory .ant-drawer-close').click())
  await clickText('返回完整流程')
  await clickText('收起环节')
  await clickText('按业务查阅')
  await clickText('异常目录')
  await harness.flush()
  assert.equal(document.querySelectorAll('[data-handling-entry]').length, 17, '没有所选环节时提供完整目录')
  assert.equal(document.querySelectorAll('[data-exception-entry]').length, catalog.exception_guides.length)
  for (const step of catalog.fulfillment_flow) {
    assert(document.querySelector(`[data-handling-entry="${step.stage}"]`).textContent.includes(step.handling.issues), `${step.stage} 的异常摘要直接可见`)
  }
  assert.equal(params().has('flow_stage'), false)
  assert.equal(params().has('flow_handling'), false)
  const directoryEntry = document.querySelector('[data-exception-entry="over_issue"] button')
  await harness.act(() => { directoryEntry.focus(); directoryEntry.click() })
  assert.equal(params().get('flow_tab'), 'topics')
  assert.equal(params().get('flow_role'), 'warehouse')
  assert.equal(params().has('flow_exception_origin'), false)
  await clickText('返回业务目录')
  assert(root.querySelector('[data-business-chain-topics]'))
  assert.equal(document.activeElement.getAttribute('aria-label'), '异常目录', '收起路径后回到业务目录入口')
  await harness.act(() => navigation.navigate(navigation.location.pathname + navigation.location.search))
  assert(root.querySelector('[data-business-chain-topics]'), '地址恢复业务目录与岗位')
})

test('compact handling keeps full rules, one path entry and complete normal-stage notes', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Guide } = await import('./TaskFulfillmentGuide.jsx')
  let navigation
  function Probe() {
    navigation = { location: useLocation(), navigate: useNavigate() }
    return h(Guide)
  }
  await harness.render(h(MemoryRouter, { initialEntries: ['/__dev/status-flows?view=chain&chain=all&flow_stage=incoming_quality&flow_handling=1'], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Probe)))
  const root = harness.container
  const input = catalog.fulfillment_flow.find((step) => step.stage === 'incoming_quality')
  const rules = root.querySelector('[data-stage-handling]')
  for (const text of [input.handling.issues, input.handling.action, input.handling.resume]) assert(rules.textContent.includes(text))
  assert.equal(rules.querySelectorAll('button').length, 1)
  assert(root.querySelector('button[aria-label="选择异常处理路径"]'))
  await harness.act(() => navigation.navigate('/__dev/status-flows?view=chain&chain=all&flow_stage=cutting_quality'))
  const normal = root.querySelector('[data-stage-mode="normal"]')
  assert.equal(normal.querySelectorAll('.erp-dev-fulfillment-guide__substep-relation').length, 0)
  const notes = normal.querySelector('.erp-dev-fulfillment-guide__instructions')
  assert.equal(notes.querySelector('summary').textContent, '环节说明')
  const quality = catalog.fulfillment_flow.find((step) => step.stage === 'cutting_quality')
  assert(notes.textContent.includes(quality.subflow.summary))
  assert(notes.textContent.includes(quality.result))
  assert(normal.querySelector('[aria-label="相关任务"] a[href="/erp/task-board?stage_key=cutting_quality"]'))
})
