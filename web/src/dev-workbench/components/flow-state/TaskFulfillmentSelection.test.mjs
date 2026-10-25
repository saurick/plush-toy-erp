import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

async function setup(t, initialURL) {
  const harness = await createReactTestHarness(t)
  const { default: Guide } = await import('./TaskFulfillmentGuide.jsx')
  let location
  function Probe() { location = useLocation(); return h(Guide) }
  await harness.render(h(MemoryRouter, { initialEntries: [initialURL], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Probe)))
  const root = harness.container
  const picker = (name) => root.querySelector(`[role="combobox"][aria-label="${name}"]`).closest('.ant-select')
  const clear = async (name) => {
    await harness.act(() => picker(name).querySelector('.ant-select-clear').dispatchEvent(new harness.runtimeWindow.MouseEvent('mousedown', { bubbles: true })))
    await harness.flush()
  }
  return { root, picker, clear, params: () => new URLSearchParams(location.search) }
}

test('清空方案清理其节点并回到可点选的方案图', async (t) => {
  const ui = await setup(t, '/__dev/status-flows?flow_exception=purchase_rejection&flow_exception_origin=incoming_quality&flow_decision=replacement&flow_exception_step=arrival')
  await ui.clear('处理方案')
  assert.equal(ui.params().has('flow_decision'), false)
  assert.equal(ui.params().has('flow_exception_step'), false)
  assert.equal(ui.params().get('flow_exception_origin'), 'incoming_quality')
  assert.equal(ui.root.querySelector('[data-exception-handling]'), null)
  assert(ui.root.querySelector('[data-exception-guide] [data-business-flow]'))
})

test('清空岗位及来源保留方案和明确步骤，不默认另一个来源', async (t) => {
  const ui = await setup(t, '/__dev/status-flows?flow_role=purchase&flow_exception=production_quality&flow_exception_origin=shell_quality&flow_decision=original_rework&flow_exception_step=reinspect')
  await ui.clear('关注岗位')
  assert.equal(ui.picker('关注岗位').querySelector('.ant-select-selection-placeholder').textContent, '选择关注岗位')
  assert.equal(ui.params().has('flow_role'), false)
  assert.equal(ui.params().get('flow_decision'), 'original_rework')
  assert.equal(ui.params().get('flow_exception_step'), 'reinspect')
  await ui.clear('发生环节')
  assert.equal(ui.picker('发生环节').querySelector('.ant-select-selection-placeholder').textContent, '选择发生环节')
  assert.equal(ui.params().has('flow_exception_origin'), false)
  assert.equal(ui.params().has('flow_stage'), false)
  assert.equal(ui.params().get('flow_decision'), 'original_rework')
  assert.equal(ui.root.querySelector('[data-selected-exception-node]').dataset.selectedExceptionNode, 'reinspect')
})

test('清空异常来源保留原流程的返回位置和子步骤', async (t) => {
  const ui = await setup(t, '/__dev/status-flows?flow_stage=supplier_advance&flow_substep=actual&flow_exception=finance_settlement&flow_exception_origin=supplier_advance')
  await ui.clear('发生环节')
  assert.equal(ui.params().has('flow_exception_origin'), false)
  assert.equal(ui.params().get('flow_stage'), 'supplier_advance')
  assert.equal(ui.params().get('flow_substep'), 'actual')
  assert(ui.root.querySelector('[aria-label="返回 4 · 采购 / 委外首付"]'))
})
