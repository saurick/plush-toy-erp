import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { DEV_FLOW_STATE_CATALOG as catalog } from '../../config/devFlowStateCatalog.mjs'

test('专题默认选择、主动清空和刷新恢复使用同一 URL 真源', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Guide } = await import('./TaskFulfillmentGuide.jsx')
  const { default: Topics } = await import('./BusinessChainTopics.jsx')
  let location
  function Page() {
    location = useLocation()
    return h(Guide, { renderTopics: ({ selectedTopicKey, onSelectTopic }) => h(Topics, {
      catalog, selectedTopicKey, onSelectChain: onSelectTopic,
    }) })
  }
  const render = (entry, key) => harness.render(h(MemoryRouter, {
    key,
    initialEntries: [entry],
    future: { v7_startTransition: true, v7_relativeSplatPath: true },
  }, h(Page)))
  await render('/__dev/status-flows?view=chain&chain=all&flow_tab=topics', 'initial')
  const root = harness.container
  assert(root.querySelector('[data-topic-diagram]'))
  assert.equal(new URLSearchParams(location.search).has('flow_topic'), false)
  assert.equal(root.querySelector('[aria-label="流程详情"]'), null)
  const clear = root.querySelector('[data-business-chain-topics] .ant-select-clear')
  await harness.act(() => clear.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await harness.flush()
  assert.equal(new URLSearchParams(location.search).get('flow_topic'), '')
  assert.equal(root.querySelector('[data-topic-diagram]'), null)
  assert(root.textContent.includes('请选择业务专题'))
  await render(location.pathname + location.search, 'reload')
  assert.equal(root.querySelector('[data-topic-diagram]'), null)
  assert(root.textContent.includes('请选择业务专题'))
  const input = root.querySelector('input[aria-label="选择业务专题"]')
  await harness.act(() => input.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await harness.flush()
  const option = [...document.querySelectorAll('.ant-select-item-option')]
    .find((item) => item.textContent === '成品出货到应收建立')
  assert(option)
  await harness.act(() => option.click())
  await harness.flush()
  assert.equal(new URLSearchParams(location.search).get('flow_topic'), 'delivery_to_settlement')
  assert(root.querySelector('[data-topic-diagram="delivery_to_settlement"]'))
  assert.equal(root.querySelector('.erp-dev-fulfillment-guide__focus > strong').textContent, '出货单')
})

test('没有可用专题与主动清空分别显示空态', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Topics } = await import('./BusinessChainTopics.jsx')
  const emptyCatalog = { ...catalog, businessChainOverview: { ...catalog.businessChainOverview, lanes: [] } }
  const render = (currentCatalog, key) => harness.render(h(MemoryRouter, {
    key, future: { v7_startTransition: true, v7_relativeSplatPath: true },
  }, h(Topics, { catalog: currentCatalog, selectedTopicKey: '', onSelectChain: () => {} })))
  await render(catalog, 'cleared')
  assert(harness.container.textContent.includes('请选择业务专题'))
  assert(!harness.container.textContent.includes('该岗位暂无关联专题'))
  await render(emptyCatalog, 'unavailable')
  assert(harness.container.textContent.includes('该岗位暂无关联专题'))
  assert(!harness.container.textContent.includes('请选择业务专题'))
  assert.equal(harness.container.querySelector('[data-topic-diagram]'), null)
})
