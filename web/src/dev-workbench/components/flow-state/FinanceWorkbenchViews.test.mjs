import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { DEV_FLOW_STATE_CATALOG as catalog } from '../../config/devFlowStateCatalog.mjs'

const initialURL =
  '/__dev/business-topics?flow_topic=finance_relations'
const button = (root, label) =>
  [...root.querySelectorAll('button')].find(
    (item) => item.textContent === label
  )

async function mountRelationships(t, initialEntry = initialURL) {
  const harness = await createReactTestHarness(t)
  const { default: View } = await import('./FinanceRelationshipsView.jsx')
  const state = {}
  function Page() {
    state.location = useLocation()
    state.navigation = useNavigationType()
    return h(View, { catalog })
  }
  await harness.render(
    h(
      MemoryRouter,
      {
        initialEntries: [
          {
            pathname: initialEntry.split('?')[0],
            search: `?${initialEntry.split('?')[1]}`,
            state: { readingContext: 'preserved' },
          },
        ],
        future: { v7_startTransition: true, v7_relativeSplatPath: true },
      },
      h(Page)
    )
  )
  await harness.flush()
  return { harness, state }
}

test('十二个财务步骤就近解释，点击与关闭均保留总览和当前 URL', async (t) => {
  const { harness, state } = await mountRelationships(t)
  const root = harness.container
  const overview = root.querySelector('[data-finance-overview]')
  const lanes = [...overview.querySelectorAll('[data-finance-lane]')]
  assert.deepEqual(
    lanes.map((lane) => lane.getAttribute('aria-label')),
    ['销售与出货', '采购与仓库', '委外与生产']
  )
  assert.deepEqual(
    lanes.map((lane) =>
      [...lane.querySelectorAll('button strong')].map(
        (node) => node.textContent
      )
    ),
    [
      ['销售订单', '真实出货', '应收／发票', '收款与核销'],
      ['采购订单', '质检与入库', '采购应付', '付款与核销'],
      ['委外合同', '回货／工序验收', '委外应付', '付款与抵扣'],
    ]
  )
  const { location } = state
  for (const node of overview.querySelectorAll('[data-finance-lane] button')) {
    await harness.act(() => node.click())
    await harness.flush()
    const note = document.getElementById(
      `finance-note-${node.dataset.financeNode}`
    )
    assert(note.querySelector('p').textContent.length > 15)
    assert(note.textContent.includes('关联岗位：'))
    assert.equal(node.getAttribute('aria-expanded'), 'true')
    assert.equal(root.querySelector('[data-finance-overview]'), overview)
    assert.equal(state.location, location)
    await harness.act(() =>
      note.querySelector('[aria-label="关闭步骤说明"]').click()
    )
    assert.equal(node.getAttribute('aria-expanded'), 'false')
    assert.equal(document.activeElement, node)
  }
  assert.equal(
    overview.querySelectorAll('[aria-label="财务专题"] button').length,
    3
  )
  assert(!root.textContent.includes('应付阶段'))
  assert(!root.textContent.includes('返回关联概览'))
})

test('专题与规则在同一侧栏查看，情景选择只替换 URL 状态且总览保持挂载', async (t) => {
  const { harness, state } = await mountRelationships(t)
  const overview = harness.container.querySelector('[data-finance-overview]')
  await harness.act(() => button(overview, '采购退货与数量差额').click())
  await harness.flush()
  const drawer = document.querySelector('.erp-dev-finance-drawer')
  assert(drawer.textContent.includes('应付阶段'))
  assert.equal(state.navigation, 'REPLACE')
  assert.deepEqual(state.location.state, { readingContext: 'preserved' })
  assert.equal(
    harness.container.querySelector('[data-finance-overview]'),
    overview
  )
  await harness.act(() => drawer.querySelector('input[value="draft"]').click())
  await harness.act(() =>
    drawer.querySelector('[data-finance-node="purchase-2"]').click()
  )
  assert(drawer.textContent.includes('先取消冻结来源的草稿'))
  assert.equal(
    new URLSearchParams(state.location.search).get('finance_step'),
    '2'
  )
  const tabs = drawer.querySelector('[role="tablist"]')
  await harness.act(() => button(drawer, '查看采购差额规则').click())
  assert.equal(drawer.querySelector('[role="tablist"]'), tabs)
  assert(drawer.querySelector('[data-finance-rules]'))
  assert.equal(drawer.querySelectorAll('a[href]').length, 0)
  assert.equal(state.location.pathname, '/__dev/business-topics')
  assert.equal(new URLSearchParams(state.location.search).has('view'), false)
  await harness.act(() => button(drawer, '关闭').click())
  assert.equal(
    new URLSearchParams(state.location.search).get('finance_topic'),
    null
  )
  assert.equal(
    new URLSearchParams(state.location.search).get('finance_stage'),
    'draft'
  )
  assert.equal(state.navigation, 'REPLACE')
  assert.equal(
    harness.container.querySelector('[data-finance-overview]'),
    overview
  )
})

test('深链接打开侧栏，当前步骤与月结示例均可在保留总览时读取', async (t) => {
  const { harness, state } = await mountRelationships(
    t,
    `${initialURL}&finance_topic=payments&finance_step=3`
  )
  let drawer = document.querySelector('.erp-dev-finance-drawer')
  assert.equal(
    drawer
      .querySelector('[data-finance-node="payments-3"]')
      .getAttribute('aria-pressed'),
    'true'
  )
  assert(drawer.textContent.includes('恢复余额，不产生实际资金流'))
  await harness.act(() => button(drawer, '关闭').click())
  await harness.act(() => button(harness.container, '月结与期间对账').click())
  drawer = document.querySelector('.erp-dev-finance-drawer')
  await harness.act(() =>
    button(drawer, '月结到期日中国自然月月末 ＋ 约定天数').click()
  )
  assert(
    drawer
      .querySelector('[data-finance-rules]')
      .textContent.includes('2026-11-30')
  )
  assert(harness.container.querySelector('[data-finance-overview]'))
  assert.equal(state.location.pathname, '/__dev/business-topics')
  assert.equal(new URLSearchParams(state.location.search).has('view'), false)
})

test('真实账款在所选行下展开，关闭侧栏取消未完成的只读请求', async (t) => {
  const requests = []
  let pendingSignal
  const { harness, state } = await mountRelationships(t)
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const rpc = JSON.parse(options.body)
    requests.push(rpc.method)
    if (rpc.method === 'get_finance_fact') {
      pendingSignal = options.signal
      return new Promise(() => {})
    }
    assert.equal(rpc.method, 'list_finance_facts')
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: rpc.id,
        result: {
          code: 0,
          data: {
            finance_facts: [
              {
                id: 9,
                fact_no: 'AR-9',
                fact_type: 'RECEIVABLE',
                status: 'POSTED',
                amount: '100',
                outstanding_amount: '70',
                currency: 'CNY',
              },
            ],
            total: 1,
          },
        },
      })
    )
  })
  await harness.act(() => button(harness.container, '审批、权限与凭据').click())
  const drawer = document.querySelector('.erp-dev-finance-drawer')
  assert.deepEqual(requests, [])
  await harness.act(() => button(drawer, '真实记录').click())
  await harness.flush()
  const rowButton = button(drawer, 'AR-9')
  await harness.act(() => {
    rowButton.focus()
    rowButton.click()
  })
  await harness.flush()
  const detail = drawer.querySelector('[data-finance-selected-record]')
  assert.equal(
    detail.closest('tr').previousElementSibling,
    rowButton.closest('tr')
  )
  assert.equal(document.activeElement, rowButton)
  assert.deepEqual(requests, ['list_finance_facts', 'get_finance_fact'])
  assert.equal(state.location.pathname, '/__dev/business-topics')
  assert.equal(new URLSearchParams(state.location.search).has('view'), false)
  await harness.act(() => button(drawer, '关闭').click())
  await harness.flush()
  assert.equal(pendingSignal.aborted, true)
  assert.equal(document.querySelector('[data-finance-trace]'), null)
})

test('财务口径保留业务规则与月结示例，移除测试引用', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Rules } = await import('./FinanceRulesView.jsx')
  const selected = []
  const render = (key) =>
    harness.render(
      h(
        MemoryRouter,
        { future: { v7_startTransition: true, v7_relativeSplatPath: true } },
        h(Rules, {
          ruleKey: key,
          onSelectRule: (value) => selected.push(value),
        })
      )
    )
  await render('terms')
  assert(harness.container.textContent.includes('2026-11-30'))
  assert(harness.container.textContent.includes('到期时间以服务端冻结记录为准'))
  const select = harness.container.querySelector(
    '[role="combobox"][aria-label="财务口径类型"]'
  )
  await harness.act(() =>
    select.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
  )
  await harness.flush()
  const option = [...document.querySelectorAll('.ant-select-item-option')].find(
    (node) => node.textContent === '责任与凭据'
  )
  await harness.act(() => option.click())
  assert.deepEqual(selected, ['permissions'])
  await render('permissions')
  const { FINANCE_RULES } = await import('../../config/devFinanceWorkbench.mjs')
  for (const rule of FINANCE_RULES) {
    await render(rule.key)
    for (const [label, value] of rule.facts) {
      assert(harness.container.textContent.includes(label))
      assert(harness.container.textContent.includes(value))
    }
    assert.equal(harness.container.querySelector('[data-source-reference]'), null)
    assert(!/Test[A-Z]|规则依据与验证/u.test(harness.container.textContent))
  }
  await render('')
  assert(harness.container.textContent.includes('请选择财务口径'))
  assert(!harness.container.querySelector('.erp-workbench-facts'))
})
