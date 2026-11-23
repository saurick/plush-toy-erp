import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { registerMermaidTestRenderer } from '../../../../scripts/test/mermaidRuntime.mjs'
import { DEV_FLOW_STATE_CATALOG as catalog } from '../../config/devFlowStateCatalog.mjs'

registerMermaidTestRenderer()

const initialURL =
  '/__dev/status-flows?flow_tab=finance'
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
  const lanes = ['sales', 'purchase', 'outsourcing']
  assert.deepEqual(
    lanes.map((key) =>
      [...overview.querySelectorAll(`[data-finance-lane="${key}"]`)].map(
        (node) => node.getAttribute('aria-label')
      )
    ),
    [
      ['销售订单', '真实出货', '应收／发票', '收款与核销'],
      ['采购订单', '质检与入库', '采购应付', '付款与核销'],
      ['委外合同', '回货／工序验收', '委外应付', '付款与抵扣'],
    ]
  )
  const { location } = state
  for (const node of overview.querySelectorAll('[data-finance-node]')) {
    await harness.act(() => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true })))
    await harness.flush()
    const note = document.getElementById(
      `finance-note-${node.dataset.financeNode}`
    )
    assert(note.querySelector('p').textContent.length > 15)
    assert(note.textContent.includes('关联岗位：'))
    assert.equal(node.getAttribute('aria-expanded'), 'true')
    assert(root.querySelector('[data-finance-overview]') === overview)
    assert(state.location === location)
    await harness.act(() =>
      note.querySelector('[aria-label="关闭步骤说明"]').click()
    )
    assert.equal(node.getAttribute('aria-expanded'), 'false')
    assert(document.activeElement === node)
  }
  const nav = root.querySelector('[role="tablist"][aria-label="财务关联视图"]')
  const tabs = [...nav.querySelectorAll('[role="tab"]')]
  assert.deepEqual(
    tabs.map((tab) => tab.textContent),
    ['总览', '采购差额', '月结对账', '审批凭据']
  )
  assert.equal(root.querySelectorAll('[data-business-flow]').length, 1)
  assert(!root.querySelector('[data-finance-topic]'))
  assert(!root.querySelector('[data-finance-detail]'))
  const titles = ['业务怎样连接财务', '采购退货与数量差额', '月结与期间对账', '审批、权限与凭据']
  for (const [index, tab] of tabs.entries()) {
    await harness.act(() => tab.click())
    await harness.flush()
    const panel = document.getElementById(tab.getAttribute('aria-controls'))
    assert.equal(tab.getAttribute('aria-selected'), 'true')
    assert.equal(panel.hidden, false)
    assert.equal(panel.querySelector('h2').textContent, titles[index])
    assert.equal(root.querySelectorAll('[data-business-flow]').length, 1)
    assert(!root.querySelector('[data-finance-detail]'))
    assert(root.querySelector('[role="tablist"]') === nav)
  }
})

test('采购页签保存情景，收起说明后继续显示采购图', async (t) => {
  const { harness, state } = await mountRelationships(t)
  const root = harness.container
  await harness.act(() => button(root, '采购差额').click())
  const purchase = root.querySelector('[data-finance-topic="purchase"]')
  const graph = purchase.querySelector('[data-business-flow]')
  const stage = [...purchase.querySelectorAll('[aria-label="应付阶段"] label')]
    .find((option) => option.textContent === '草稿')
  const sourceChoices = [...purchase.querySelectorAll('[aria-label="来源变化"] label')]
  assert.deepEqual(sourceChoices.map((option) => option.textContent), ['采购退货', '数量调增', '移库或批次修正'])
  await harness.act(() => stage.click())
  await harness.act(() => sourceChoices[2].click())
  await harness.flush()
  assert(!root.querySelector('[data-finance-detail]'))
  assert.match(purchase.querySelector('[data-purchase-scenario-result]').textContent, /草稿 ＋ 移库或批次修正.*先取消应付草稿/)
  assert.equal(purchase.querySelector('[data-finance-node="purchase-1"]').getAttribute('aria-label'), '取消应付草稿')
  await harness.act(() =>
    purchase.querySelector('[data-finance-node="purchase-2"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  )
  await harness.flush()
  const detail = purchase.querySelector('[data-finance-detail="purchase"]')
  assert.equal(state.navigation, 'REPLACE')
  assert.deepEqual(state.location.state, { readingContext: 'preserved' })
  assert(!root.querySelector('[data-finance-overview]'))
  assert(detail.textContent.includes('过账库存修正'))
  assert(detail.textContent.includes('仓库通过采购入库调整修正库存位置或批次'))
  assert.equal(
    new URLSearchParams(state.location.search).get('finance_step'),
    '2'
  )
  const tabs = detail.querySelector('[role="tablist"]')
  await harness.act(() => button(detail, '查看采购差额规则').click())
  assert(detail.querySelector('[role="tablist"]') === tabs)
  assert(purchase.querySelector('[data-business-flow]') === graph)
  assert(detail.querySelector('[data-finance-rules]'))
  assert.equal(detail.querySelectorAll('a[href]').length, 0)
  assert.equal(state.location.pathname, '/__dev/status-flows')
  assert.equal(new URLSearchParams(state.location.search).has('view'), false)
  await harness.act(() => button(purchase, '收起说明与记录').click())
  assert.equal(
    new URLSearchParams(state.location.search).get('finance_topic'),
    'purchase'
  )
  assert.equal(new URLSearchParams(state.location.search).get('finance_step'), null)
  assert.equal(
    new URLSearchParams(state.location.search).get('finance_stage'),
    'draft'
  )
  assert.equal(state.navigation, 'REPLACE')
  assert.equal(purchase.querySelector('[data-finance-node="purchase-2"]').getAttribute('aria-pressed'), 'false')
  assert(purchase.querySelector('[data-business-flow]') === graph)
  await harness.act(() => button(root, '总览').click())
  await harness.act(() => button(root, '采购差额').click())
  assert.equal(root.querySelector('[aria-label="应付阶段"] label:has(input:checked)').textContent, '草稿')
  assert.equal(root.querySelector('[aria-label="来源变化"] label:has(input:checked)').textContent, '移库或批次修正')
  assert(!root.querySelector('[data-finance-detail]'))
})

test('专题深链接定位页内步骤，月结到期日与期间对账分别打开对应口径', async (t) => {
  const { harness, state } = await mountRelationships(
    t,
    `${initialURL}&finance_topic=payments&finance_step=3`
  )
  const root = harness.container
  const payments = root.querySelector('[data-finance-topic="payments"]')
  assert.equal(
    payments
      .querySelector('[data-finance-node="payments-3"]')
      .getAttribute('aria-pressed'),
    'true'
  )
  assert(payments.textContent.includes('恢复余额，不产生实际资金流'))
  await harness.act(() => button(payments, '收起说明与记录').click())
  assert(!root.querySelector('[data-finance-topic="payments"]'))
  assert(root.querySelector('[data-finance-overview]'))
  await harness.act(() => button(root, '月结对账').click())
  const terms = root.querySelector('[data-finance-topic="terms"]')
  await harness.act(() => button(terms, '查看说明与记录').click())
  await harness.act(() => button(terms, '查看月结到期日规则').click())
  assert(
    terms
      .querySelector('[data-finance-rules]')
      .textContent.includes('2026-11-30')
  )
  await harness.act(() =>
    terms.querySelector('[data-finance-node="terms-3"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  )
  await harness.act(() => button(terms, '查看期间对账规则').click())
  assert(terms.querySelector('[data-finance-rules]').textContent.includes('往来净余额'))
  assert(!root.querySelector('[data-finance-overview]'))
  assert.equal(state.location.pathname, '/__dev/status-flows')
  assert.equal(new URLSearchParams(state.location.search).has('view'), false)
})

test('真实账款在所选行下展开，切换财务页签取消未完成的只读请求', async (t) => {
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
  await harness.act(() => button(harness.container, '审批凭据').click())
  const permissions = harness.container.querySelector('[data-finance-topic="permissions"]')
  await harness.act(() => button(permissions, '查看说明与记录').click())
  assert.deepEqual(requests, [])
  await harness.act(() => button(permissions, '真实记录').click())
  await harness.flush()
  const rowButton = button(permissions, 'AR-9')
  await harness.act(() => {
    rowButton.focus()
    rowButton.click()
  })
  await harness.flush()
  const detail = permissions.querySelector('[data-finance-selected-record]')
  assert(detail.closest('tr').previousElementSibling === rowButton.closest('tr'))
  assert(document.activeElement === rowButton)
  assert.deepEqual(requests, ['list_finance_facts', 'get_finance_fact'])
  assert.equal(state.location.pathname, '/__dev/status-flows')
  assert.equal(new URLSearchParams(state.location.search).has('view'), false)
  await harness.act(() => button(harness.container, '总览').click())
  await harness.flush()
  assert.equal(pendingSignal.aborted, true)
  assert(!document.querySelector('[data-finance-trace]'))
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
