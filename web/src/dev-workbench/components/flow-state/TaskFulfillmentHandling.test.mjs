import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../../common/consts/workflowTaskDiscovery.generated.mjs'

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
  assert(root.querySelector('button[aria-label="异常情况"]'), '总图有明确的异常入口')
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
    assert(handling.textContent.includes('异常情况'))
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
  let navigation
  function Probe() {
    navigation = { location: useLocation(), navigate: useNavigate() }
    return h(Guide)
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
  await clickText('生产超领材料')
  assert.equal(params().get('flow_exception'), 'over_issue')
  assert.equal(params().has('flow_exception_origin'), false)
  assert.equal(root.querySelectorAll('[data-origin]').length, 0)
  await harness.act(() => root.querySelector('button[aria-label="收起异常分支"]').click())
  assert.equal(params().get('flow_stage'), 'cutting_issue')
  assert.equal(params().get('flow_handling'), '1')
  await harness.act(() => root.querySelector('button[aria-label="异常情况"]').click())
  await harness.flush()
  assert.equal(document.querySelectorAll('[data-handling-entry]').length, 1)
  assert.equal(document.querySelectorAll('[data-exception-entry]').length, 1)
  assert(document.querySelector('[data-exception-entry="over_issue"]'))
  await clickText('查看全部环节与异常分支')
  assert.equal(document.querySelectorAll('[data-handling-entry]').length, 17)
  assert.equal(document.querySelectorAll('[data-exception-entry]').length, catalog.exception_guides.length)
  await harness.act(() => document.querySelector('[data-handling-entry="packaging"] button').click())
  assert.equal(params().get('flow_stage'), 'packaging')
  assert.equal(params().get('flow_handling'), '1')
  assert(root.querySelector('[data-stage-handling="packaging"] dd'))
  await harness.act(() => root.querySelector('button[aria-label="异常情况"]').click())
  await harness.flush()
  assert.equal(document.querySelectorAll('[data-handling-entry]').length, 1, '重新打开恢复当前环节范围')
  assert.equal(document.querySelectorAll('[data-exception-entry]').length, 0, '无专项处置的环节仍保留通用处理')
  await harness.act(() => document.querySelector('.erp-dev-exception-directory .ant-drawer-close').click())
  await clickText('收起环节')
  await harness.act(() => root.querySelector('button[aria-label="异常情况"]').click())
  await harness.flush()
  assert.equal(document.querySelectorAll('[data-handling-entry]').length, 17, '没有所选环节时提供完整目录')
  assert.equal(document.querySelectorAll('[data-exception-entry]').length, catalog.exception_guides.length)
  for (const step of catalog.fulfillment_flow) {
    assert(document.querySelector(`[data-handling-entry="${step.stage}"]`).textContent.includes(step.handling.issues), `${step.stage} 的异常摘要直接可见`)
  }
  assert.equal(params().has('flow_stage'), false)
  assert.equal(params().has('flow_handling'), false)
})
