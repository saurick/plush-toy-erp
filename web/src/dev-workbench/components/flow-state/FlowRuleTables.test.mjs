import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { DEV_FLOW_STATE_CATALOG as catalog } from '../../config/devFlowStateCatalog.mjs'

test('质检纠正只在原判定状态展示，并保留新旧记录与受阻边界', async (t) => {
  const harness = await createReactTestHarness(t)
  const { FlowActionRules } = await import('./FlowRuleTables.jsx')
  const flow = catalog.flows.find((item) => item.key === 'fact.quality_inspection')
  await harness.render(h(FlowActionRules, { flow, stateKey: 'PASSED' }))
  for (const text of ['纠正原判定并重新检验', '不把原记录改回待检', '生产在制批次检验不适用', '采购行已入库']) {
    assert(harness.container.textContent.includes(text))
  }
  await harness.render(h(FlowActionRules, { flow, stateKey: 'SUBMITTED' }))
  assert.equal(Boolean(harness.container.querySelector('[data-action-rules]')), false)
})

async function choose(harness, label, value) {
  const input = harness.container.querySelector(`input[role="combobox"][aria-label="${label}"]`)
  await harness.act(() => input.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await harness.flush()
  const option = [...document.querySelectorAll('.ant-select-item-option')].find((node) => node.textContent === value)
  assert(option, value)
  await harness.act(() => option.click())
}

test('逐个办理动作保留条件、阻断、结果与恢复，选中状态后清除不适用动作', async (t) => {
  const harness = await createReactTestHarness(t)
  const { FlowActionRules } = await import('./FlowRuleTables.jsx')
  const flow = catalog.flows.find((item) => item.key === 'fact.shipment')
  await harness.render(h(FlowActionRules, { flow }))
  for (const rule of flow.actionRules) {
    await choose(harness, '办理动作', rule.label)
    for (const field of ['condition', 'blocked', 'effect', 'recovery']) {
      assert(harness.container.textContent.includes(rule[field]))
    }
  }
  await harness.render(h(FlowActionRules, { flow, stateKey: 'SHIPPED' }))
  assert(harness.container.textContent.includes('取消草稿或冲正已出货'))
  assert(!harness.container.textContent.includes('确认实际出货'))
  assert.equal(harness.container.querySelector('[data-source-reference]'), null)
})

test('五类主数据的启停与历史限制仍可逐项核对', async (t) => {
  const harness = await createReactTestHarness(t)
  const { MasterLifecycleRules } = await import('./FlowRuleTables.jsx')
  const flow = catalog.flows.find((item) => item.lifecycleRules.length)
  await harness.render(h(MasterLifecycleRules, { flow }))
  for (const rule of flow.lifecycleRules) {
    await choose(harness, '主数据对象', rule.label)
    for (const field of ['condition', 'blocked', 'effect', 'recovery']) {
      assert(harness.container.textContent.includes(rule[field]))
    }
  }
})

test('明确清空办理动作时保留选择入口，并隐藏上一动作的条件与结果', async (t) => {
  const harness = await createReactTestHarness(t)
  const { FlowActionRules } = await import('./FlowRuleTables.jsx')
  const flow = catalog.flows.find((item) => item.key === 'fact.shipment')
  await harness.render(h(FlowActionRules, { flow, selectedKey: 'cancel', onSelect: () => {} }))
  assert(harness.container.textContent.includes(flow.actionRules.find((rule) => rule.key === 'cancel').condition))
  await harness.render(h(FlowActionRules, { flow, selectedKey: '', onSelect: () => {} }))
  assert(harness.container.querySelector('input[aria-label="办理动作"]'))
  assert(harness.container.textContent.includes('选择办理动作'))
  assert.equal(harness.container.querySelector('.erp-dev-flow-rule-detail'), null)
})
