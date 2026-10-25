import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { DEV_FLOW_STATE_CATALOG as catalog } from '../../config/devFlowStateCatalog.mjs'

const router = (body) => h(MemoryRouter, {
  future: { v7_startTransition: true, v7_relativeSplatPath: true },
}, body)

test('专题详情逐条保留关联条件和岗位，点选关联对象不执行业务动作', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Details } = await import('./BusinessTopicDetails.jsx')
  const topic = catalog.businessChains.find((item) => item.key === 'sales_to_production')
  const node = topic.nodes.find((item) => item.key === 'effective_bom')
  const selected = []
  const explored = []
  await harness.render(router(h(Details, {
    topic,
    node,
    onSelect: (key) => selected.push(key),
    onExploreChain: (...args) => explored.push(args),
  })))
  const relations = topic.edges.filter((edge) => edge.from === node.key || edge.to === node.key)
  assert.equal(harness.container.querySelectorAll('[data-topic-relation]').length, relations.length)
  for (const edge of relations) {
    const text = harness.container.querySelector(`[data-topic-relation="${edge.key}"]`).textContent
    assert(text.includes(edge.label))
    assert(text.includes(edge.condition))
  }
  assert.match(harness.container.textContent, /老板.*财务/u)
  const material = [...harness.container.querySelectorAll('button')]
    .find((button) => button.textContent === '工程用料审核')
  await harness.act(() => material.click())
  assert.deepEqual(selected, ['material_request'])
  assert.deepEqual(explored, [])
  const rules = [...harness.container.querySelectorAll('button')]
    .find((button) => button.textContent === '查看规则')
  await harness.act(() => rules.click())
  assert.deepEqual(explored, [['sales_to_production', 'effective_bom']])
})

test('拒绝与报废终点仅展示真实关联，不拼接正常出货或生产结果', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Details } = await import('./BusinessTopicDetails.jsx')
  for (const [chainKey, nodeKey] of [
    ['delivery_to_settlement', 'shipment_rejected'],
    ['production_exception', 'scrapped_wip'],
  ]) {
    const topic = catalog.businessChains.find((item) => item.key === chainKey)
    const node = topic.nodes.find((item) => item.key === nodeKey)
    await harness.render(router(h(Details, { topic, node, onSelect: () => {} })))
    assert.match(harness.container.textContent, /终止|结束/u)
    assert(!harness.container.textContent.includes('交接至'))
    const expected = topic.edges.filter((edge) => edge.to === nodeKey).map((edge) => edge.key)
    assert.deepEqual([...harness.container.querySelectorAll('[data-topic-relation]')]
      .map((item) => item.dataset.topicRelation), expected)
  }
})

test('数据与验证入口使用本专题登记场景，实测报告绑定同一稳定链标识', async (t) => {
  const harness = await createReactTestHarness(t)
  const { BusinessTopicVerification } = await import('./BusinessTopicDetails.jsx')
  const topic = catalog.businessChains.find((item) => item.key === 'finance_payment_and_reversal')
  await harness.render(router(h(BusinessTopicVerification, { topic })))
  assert.equal(harness.container.querySelector('details').open, false)
  const rows = [...harness.container.querySelectorAll('tbody tr')]
  assert.equal(rows.length, topic.acceptanceScenarios.length)
  rows.forEach((row, index) => {
    assert.equal(row.querySelector('th').textContent, topic.acceptanceScenarios[index].label)
  })
  assert.match(harness.container.textContent, /规则测试/u)
  assert.match(harness.container.textContent, /浏览器验证/u)
  const links = [...harness.container.querySelectorAll('a')].map((link) => link.getAttribute('href'))
  assert.deepEqual(links, [
    '/__dev/data-preparation', '/__dev/testing',
    '/__dev/business-chain-audit?chain=finance_payment_and_reversal',
  ])
  assert.match(harness.container.textContent, /登记范围.*实际执行结果/u)
})

test('图中与相邻详情选取对象共用 URL，查看规则保留专题和具体对象', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Guide } = await import('./TaskFulfillmentGuide.jsx')
  const { default: Topics } = await import('./BusinessChainTopics.jsx')
  let location
  const explored = []
  function Page() {
    location = useLocation()
    return h(Guide, { renderTopics: ({ selectedTopicKey, onSelectTopic }) => h(Topics, {
      catalog,
      selectedTopicKey,
      onSelectChain: onSelectTopic,
      onExploreChain: (...args) => explored.push(args),
    }) })
  }
  await harness.render(h(MemoryRouter, {
    initialEntries: ['/__dev/status-flows?view=chain&chain=all&flow_tab=topics'],
    future: { v7_startTransition: true, v7_relativeSplatPath: true },
  }, h(Page)))
  const root = harness.container
  await harness.act(() => root.querySelector('[data-graph-node="effective_bom"]').click())
  await harness.flush()
  assert.equal(new URLSearchParams(location.search).get('flow_topic_node'), 'effective_bom')
  assert.match(root.querySelector('aside').textContent, /老板.*财务/u)
  const material = [...root.querySelectorAll('aside button')]
    .find((button) => button.textContent === '工程用料审核')
  await harness.act(() => material.click())
  await harness.flush()
  const params = new URLSearchParams(location.search)
  assert.equal(params.get('chain'), 'all')
  assert.equal(params.get('flow_tab'), 'topics')
  assert.equal(params.get('flow_topic'), 'sales_to_production')
  assert.equal(params.get('flow_topic_node'), 'material_request')
  assert(root.querySelector('[data-graph-node="material_request"][aria-pressed="true"]'))
  const rules = [...root.querySelectorAll('aside button')]
    .find((button) => button.textContent === '查看规则')
  await harness.act(() => rules.click())
  assert.deepEqual(explored, [['sales_to_production', 'material_request']])
  const map = [...root.querySelectorAll('button')]
    .find((button) => button.textContent === '系统衔接图')
  await harness.act(() => map.click())
  await harness.flush()
  assert(root.querySelector('[data-business-chain-system]'))
  const back = [...root.querySelectorAll('button')]
    .find((button) => button.textContent.startsWith('返回'))
  await harness.act(() => back.click())
  await harness.flush()
  assert.equal(new URLSearchParams(location.search).get('flow_topic_node'), 'material_request')
  assert.equal(document.activeElement.textContent, '系统衔接图')
})
