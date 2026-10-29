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
  assert(!harness.container.textContent.includes('查看规则'))
  assert.deepEqual(explored, [])
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

test('数据与验证保留本专题登记场景和证据边界，不重复提供跨页入口', async (t) => {
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
  assert.equal(harness.container.querySelectorAll('a').length, 0)
  assert.match(harness.container.textContent, /登记范围.*实际执行结果/u)
})

test('图中与相邻详情选取对象共用 URL，当前专题和对象不会被额外跳转替换', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Topics } = await import('./BusinessTopicsView.jsx')
  let location
  const explored = []
  function Page() {
    location = useLocation()
    return h(Topics, {
      catalog,
      actions: [],
      onOpenView: (_, patch) => explored.push([patch.chain, patch.node]),
    })
  }
  await harness.render(h(MemoryRouter, {
    initialEntries: ['/__dev/business-topics'],
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
  assert.equal(location.pathname, '/__dev/business-topics')
  assert.equal(params.has('flow_tab'), false)
  assert.equal(params.get('flow_topic'), 'sales_to_production')
  assert.equal(params.get('flow_topic_node'), 'material_request')
  assert(root.querySelector('[data-graph-node="material_request"][aria-pressed="true"]'))
  assert(!root.querySelector('aside').textContent.includes('查看规则'))
  assert.deepEqual(explored, [])
  const map = [...root.querySelectorAll('button')]
    .find((button) => button.textContent === '系统衔接图')
  await harness.act(() => map.click())
  await harness.flush()
  assert(root.querySelector('[data-business-chain-system]'))
  assert.equal([...root.querySelectorAll('button')].filter((button) => button.textContent === '查看此专题').length, 0)
  await harness.act(() => root.querySelector('[data-business-chain-system] [data-graph-node][aria-pressed="false"]').click())
  await harness.flush()
  assert.equal([...root.querySelectorAll('button')].filter((button) => button.textContent === '查看此专题').length, 1)
  const back = [...root.querySelectorAll('button')]
    .find((button) => button.textContent.startsWith('返回'))
  await harness.act(() => back.click())
  await harness.flush()
  assert.equal(new URLSearchParams(location.search).get('flow_topic_node'), 'material_request')
  assert.equal(document.activeElement.textContent, '系统衔接图')
})

test('规则正文在所属交接下展开，收起和选择其他对象都不替换关联目录', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Details } = await import('./BusinessTopicDetails.jsx')
  const topic = catalog.businessChains.find((item) => item.key === 'purchase_to_inventory')
  const node = topic.nodes.find((item) => item.key === 'purchase_order')
  const step = topic.steps.find((item) => item.fromNodeKey === node.key && item.verificationRuleIds.length)
  const requested = []
  const selected = []
  const props = { topic, node, onSelect: (key) => selected.push(key), onInspectStep: (key) => requested.push(key) }
  await harness.render(h(Details, props))
  const trigger = harness.container.querySelector(`[data-topic-relation="${step.key}"] [aria-expanded]`)
  await harness.act(() => trigger.click())
  assert.deepEqual(requested, [step.key])
  await harness.render(h(Details, { ...props, selectedStepKey: step.key, stepDetails: h('p', { 'data-rule-body': true }, '完整规则与验证结果') }))
  const expanded = harness.container.querySelector(`[data-topic-relation="${step.key}"]`)
  assert.equal(Boolean(expanded.querySelector('[data-rule-body]')), true)
  assert.equal(harness.container.querySelector('[aria-expanded="true"]') === trigger, true)
  await harness.act(() => trigger.click())
  assert.deepEqual(requested, [step.key, null])
  const peer = expanded.querySelector('.erp-dev-chain-topics__relation-heading button')
  await harness.act(() => peer.click())
  assert.equal(selected.length, 1)
})
