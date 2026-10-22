import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../../common/consts/workflowTaskDiscovery.generated.mjs'

async function setup(t, initialURL, props = {}) {
  const harness = await createReactTestHarness(t)
  const { default: Guide } = await import('./TaskFulfillmentGuide.jsx')
  let location
  function Probe() {
    location = useLocation()
    return h(Guide, props)
  }
  const renderAt = (url, key) => harness.render(h(MemoryRouter, {
    key,
    initialEntries: [url],
    future: { v7_startTransition: true, v7_relativeSplatPath: true },
  }, h(Probe)))
  await renderAt(initialURL, 'initial')
  const root = harness.container
  const click = async (node) => {
    assert(node, 'interactive control remains available')
    await harness.act(() => node.click())
    await harness.flush()
  }
  const button = (group, name) => [...root.querySelectorAll(`[role="group"][aria-label="${group}"] button`)].find((node) => node.textContent.replace(/\s/g, '') === name)
  const picker = (name) => root.querySelector(`[role="combobox"][aria-label="${name}"]`).closest('.ant-select')
  const clear = async (name) => {
    await harness.act(() => picker(name).querySelector('.ant-select-clear').dispatchEvent(new harness.runtimeWindow.MouseEvent('mousedown', { bubbles: true })))
    await harness.flush()
  }
  return { harness, root, click, button, picker, clear, renderAt, params: () => new URLSearchParams(location.search), url: () => location.pathname + location.search }
}

test('详情方案与异常类型可取消，依赖值清空后刷新不会自动选回', async (t) => {
  const ui = await setup(t, '/__dev/status-flows?view=chain&chain=all&flow_stage=incoming_quality&flow_handling=1&flow_exception=purchase_rejection&flow_exception_origin=incoming_quality&flow_decision=return_to_vendor&flow_exception_step=arrange')
  const { root, button, click, params } = ui
  assert.equal(button('处理方式', '退厂').getAttribute('aria-pressed'), 'true')
  await click(button('处理方式', '退厂'))
  assert.equal(params().has('flow_decision'), false)
  assert.equal(params().has('flow_exception_step'), false)
  assert.equal(params().get('flow_exception'), 'purchase_rejection')
  assert.equal(root.querySelector('[data-exception-handling]'), null)
  assert.equal(button('处理方式', '退厂').getAttribute('aria-pressed'), 'false')
  await ui.renderAt(ui.url(), 'plan-cleared-reload')
  assert.equal(root.querySelector('[data-exception-handling]'), null)
  await click(button('处理方式', '供应商补换'))
  assert.equal(params().get('flow_decision'), 'replacement')
  assert(root.querySelector('[data-exception-handling]'))
  await click(button('异常类型', '首次来料不合格'))
  for (const key of ['flow_exception', 'flow_exception_origin', 'flow_decision', 'flow_exception_step']) assert.equal(params().has(key), false, key)
  assert.equal(params().get('flow_stage'), 'incoming_quality')
  assert.equal(params().get('flow_handling'), '1')
  assert.equal(root.querySelector('[data-exception-guide]'), null)
  assert.equal(button('异常类型', '首次来料不合格').getAttribute('aria-pressed'), 'false')
  assert.equal(root.querySelector('[role="group"][aria-label="异常类型"] > span').textContent, '异常类型')
  await ui.renderAt(ui.url(), 'type-cleared-reload')
  assert.equal(root.querySelector('[data-exception-guide]'), null)
  await click(button('异常类型', '首次来料不合格'))
  assert.equal(params().get('flow_exception'), 'purchase_rejection')
  assert.equal(params().has('flow_decision'), false)
  assert.equal(root.querySelector('[data-exception-handling]'), null)
  await click(button('处理方式', '退厂'))
  assert.equal(params().get('flow_decision'), 'return_to_vendor')
})

test('异常目录筛选显示用途，清空恢复完整目录且没有全部伪选项', async (t) => {
  const ui = await setup(t, '/__dev/status-flows?view=chain&chain=all&flow_tab=exceptions', { renderTopics: () => h('p', null, '业务目录') })
  const { root, picker, harness } = ui
  assert.equal(root.querySelectorAll('[data-exception-entry]').length, catalog.exception_guides.length)
  assert.equal(picker('筛选异常环节').querySelector('.ant-select-selection-placeholder').textContent, '选择异常环节')
  await harness.act(() => picker('筛选异常环节').querySelector('.ant-select-selector').dispatchEvent(new harness.runtimeWindow.MouseEvent('mousedown', { bubbles: true })))
  await harness.flush()
  const options = [...document.querySelectorAll('.ant-select-item-option')]
  assert.equal(options.length, catalog.fulfillment_flow.length)
  assert.equal(options.some((node) => node.textContent.includes('全部')), false)
  await ui.click(options.find((node) => node.textContent.includes('来料检验与入库')))
  assert.equal(picker('筛选异常环节').querySelector('.app-select__label').textContent, '异常环节')
  assert.equal(root.querySelectorAll('[data-exception-entry]').length, 2)
  await ui.clear('筛选异常环节')
  assert.equal(picker('筛选异常环节').querySelector('.ant-select-selection-placeholder').textContent, '选择异常环节')
  assert.equal(root.querySelectorAll('[data-exception-entry]').length, catalog.exception_guides.length)
})

test('清空关注岗位只取消岗位条件，保留已选方案和明确步骤', async (t) => {
  const ui = await setup(t, '/__dev/status-flows?view=chain&chain=all&flow_role=purchase&flow_stage=incoming_quality&flow_handling=1&flow_exception=purchase_rejection&flow_exception_origin=incoming_quality&flow_decision=replacement&flow_exception_step=arrival')
  await ui.clear('关注岗位')
  assert.equal(ui.params().has('flow_role'), false)
  assert.equal(ui.params().get('flow_decision'), 'replacement')
  assert.equal(ui.params().get('flow_exception_step'), 'arrival')
  assert.equal(ui.root.querySelector('[data-selected-exception-node]').dataset.selectedExceptionNode, 'arrival')
  assert.equal(ui.picker('关注岗位').querySelector('.ant-select-selection-placeholder').textContent, '选择关注岗位')
})
