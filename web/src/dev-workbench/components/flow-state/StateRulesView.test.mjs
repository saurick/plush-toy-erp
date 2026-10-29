import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { DEV_FLOW_STATE_CATALOG as catalog } from '../../config/devFlowStateCatalog.mjs'

test('条件过账保留正常路径计数，流程结束在图和详情保持中性', async (t) => {
  const harness = await createReactTestHarness(t)
  const { StateRulesView } = await import('./StateRulesView.jsx')
  const production = catalog.flows.find((item) => item.key === 'fact.production')
  await harness.render(h(StateRulesView, { catalog, flow: production, state: null, onSelectState: () => {} }))
  const standard = [...harness.container.querySelectorAll('[aria-label="状态转换筛选"] button')].find((item) => /正常推进\s*1/u.test(item.textContent))
  assert(Boolean(standard))
  await harness.act(() => standard.click())
  assert.deepEqual([...harness.container.querySelectorAll('[data-graph-node]')].map((node) => node.getAttribute('data-graph-node')), ['DRAFT', 'POSTED'])
  assert(harness.container.textContent.includes('过账'))
  const runtime = catalog.flows.find((item) => item.key === 'process.instance')
  await harness.render(h(StateRulesView, { catalog, flow: runtime, state: runtime.states.find((item) => item.key === 'completed'), onSelectState: () => {} }))
  assert(harness.container.textContent.includes('已结束'))
  assert(harness.container.textContent.includes('补偿结束'))
  assert(harness.container.textContent.includes('结束不代表成功'))
  assert.equal(harness.container.querySelectorAll('[data-path-group="outcome"]').length, 2)
})

test('状态选择保留完整流转图并只展示适用的办理规则，清空后恢复对象规则', async (t) => {
  const harness = await createReactTestHarness(t)
  const { StateRulesView } = await import('./StateRulesView.jsx')
  const flow = catalog.flows.find((flow) => flow.key === 'source.sales_order')
  const selected = []
  const render = (key) => harness.render(h(StateRulesView, {
    catalog, flow, state: flow.states.find((state) => state.key === key),
    onSelectState: (key) => selected.push(key),
  }))
  await render('active')
  assert.equal(harness.container.querySelectorAll('[data-graph-node]').length, flow.states.length)
  assert(harness.container.textContent.includes('正常关单或短结'))
  await harness.act(() => harness.container.querySelector('[data-graph-node="active"]').click())
  assert.deepEqual(selected, [null])
  await render('canceled')
  assert(harness.container.querySelector('.erp-dev-flow-selected-state').textContent.includes('终态'))
  assert.equal(harness.container.querySelector('[data-action-rules]'), null)
  await render(null)
  assert(harness.container.textContent.includes('正常关单或短结'))
})

test('红冲与核销按两条记录的引用关系展示，不产生状态转换控件', async (t) => {
  const harness = await createReactTestHarness(t)
  const { StateRulesView } = await import('./StateRulesView.jsx')
  for (const key of ['fact.finance_credit_note', 'fact.finance_allocation']) {
    const flow = catalog.flows.find((flow) => flow.key === key)
    await harness.render(h(StateRulesView, { catalog, flow, state: null, onSelectState: () => {} }))
    assert.equal(harness.container.querySelector('[data-record-reference]')?.getAttribute('data-record-reference'), 'true')
    assert.equal(harness.container.querySelectorAll('[data-graph-node]').length, 2)
    assert.equal(harness.container.querySelector('.erp-dev-flow-transition-toolbar'), null)
    assert.equal(harness.container.querySelectorAll('[data-transition-key]').length, 0)
    assert.equal(harness.container.querySelectorAll('[data-source-reference]').length, 0)
    assert(harness.container.textContent.includes('引用原记录'))
    assert(harness.container.textContent.includes('不修改原行状态'))
    assert.equal(flow.transitions.length, 0)
  }
})

test('规则阅读保留办理条件，不附源码清单或未治理的折叠入口', async (t) => {
  const harness = await createReactTestHarness(t)
  const { StateRulesView } = await import('./StateRulesView.jsx')
  const flows = [
    ...catalog.flows.filter((flow) => ['source.production_order', 'source.sales_order', 'fact.finance_credit_note'].includes(flow.key)),
    catalog.flows.find((flow) => flow.lifecycleRules.length > 0),
  ]
  for (const flow of flows) {
    await harness.render(h(StateRulesView, { catalog, flow, state: null, onSelectState: () => {} }))
    assert.equal(harness.container.querySelectorAll('[data-source-reference]').length, 0, flow.label)
    assert.equal(harness.container.textContent.includes('查看规则依据'), false, flow.label)
    assert.equal(harness.container.querySelectorAll('details:not(.erp-dev-disclosure)').length, 0, flow.label)
    for (const path of flow.sourceRefs) {
      assert.equal(harness.container.textContent.includes(path.split('/').at(-1)), false, path)
    }
    const rule = flow.actionRules[0] || flow.lifecycleRules[0]
    if (rule) {
      for (const field of ['condition', 'blocked', 'effect', 'recovery']) {
        assert(harness.container.textContent.includes(rule[field]), `${flow.label}: ${field}`)
      }
    }
  }
})
