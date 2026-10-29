import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

const fact = (id) => ({
  id,
  fact_no: `AR-${id}`,
  fact_type: 'RECEIVABLE',
  status: 'POSTED',
  amount: '100',
  outstanding_amount: '70',
  currency: 'CNY',
})
const ok = (rpc, data) =>
  new Response(
    JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: { code: 0, data } })
  )

test('财务搜索在提交后查询，重复提交可刷新，清空同时恢复列表和取消选中', async (t) => {
  const harness = await createReactTestHarness(t)
  const [{ default: View }, { Simulate }] = await Promise.all([
    import('./FinanceTraceView.jsx'), import('react-dom/test-utils'),
  ])
  const keywords = []
  const selections = []
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const rpc = JSON.parse(options.body)
    assert.equal(rpc.method, 'list_finance_facts')
    keywords.push(rpc.params.keyword)
    return ok(rpc, { finance_facts: [], total: 0 })
  })
  await harness.render(h(View, {
    factID: null, onSelectFact: (id) => selections.push(id), onOpenRules: () => {},
  }))
  await harness.flush()
  const input = harness.container.querySelector('input[aria-label="查询财务记录"]')
  const initialReads = keywords.length
  await harness.act(() => { input.value = '  AR-9  '; Simulate.change(input) })
  assert.equal(keywords.length, initialReads)
  const submit = () => harness.act(() => harness.container.querySelector('.erp-search-submit').click())
  await submit()
  await harness.flush()
  assert.equal(keywords.at(-1), 'AR-9')
  assert.deepEqual(selections, [null])
  const firstReads = keywords.length
  await submit()
  await harness.flush()
  assert.equal(keywords.length, firstReads + 1)
  assert.equal(keywords.at(-1), 'AR-9')
  assert.deepEqual(selections, [null, null])
  await harness.act(() => harness.container.querySelector('[aria-label="清除搜索"]').click())
  await harness.flush()
  assert.equal(keywords.at(-1), '')
  assert.deepEqual(selections, [null, null, null])
})

test('财务关联分页读取，局部失败不掩盖其他结果，退款只在选中原款后查询', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: View } = await import('./FinanceTraceView.jsx')
  const requests = []
  let failCredits = true
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const rpc = JSON.parse(options.body)
    requests.push(rpc)
    if (rpc.method === 'list_finance_facts')
      return ok(rpc, { finance_facts: [fact(9)], total: 1 })
    if (rpc.method === 'get_finance_fact')
      return ok(rpc, { finance_fact: fact(9) })
    if (rpc.method === 'list_finance_credit_notes') {
      if (failCredits) throw new Error('offline')
      return ok(rpc, { credit_notes: [], total: 0 })
    }
    if (
      rpc.method === 'list_finance_payments' &&
      rpc.params.refund_of_payment_id
    )
      return ok(rpc, { payments: [], total: 0 })
    if (rpc.method === 'list_finance_payments')
      return ok(rpc, {
        payments: [
          {
            id: 2,
            payment_no: 'PAY-2',
            amount: '30',
            currency: 'CNY',
            direction: 'RECEIPT',
            status: 'POSTED',
            available_amount: '0',
            allocations: [
              {
                id: 3,
                finance_fact_id: 9,
                amount: '30',
                currency: 'CNY',
                status: 'POSTED',
              },
            ],
          },
        ],
        total: 21,
      })
    throw new Error(`Unexpected read: ${rpc.method}`)
  })
  await harness.render(
    h(View, { factID: 9, onSelectFact: () => {}, onOpenRules: () => {} })
  )
  await harness.flush()
  const root = harness.container
  assert(root.textContent.includes('AR-9'))
  assert(root.textContent.includes('PAY-2'))
  assert(root.textContent.includes('此部分未能读取'))
  assert(!root.textContent.includes('未登记账款调整'))
  assert(!requests.some((rpc) => rpc.params.refund_of_payment_id))
  const click = async (text) => {
    const button = [...root.querySelectorAll('button')].find(
      (node) => node.textContent.trim() === text
    )
    assert(button, text)
    await harness.act(() => button.click())
    await harness.flush()
  }
  await click('查看退款')
  assert(
    requests.some(
      (rpc) => rpc.params.refund_of_payment_id === 2 && rpc.params.limit === 20
    )
  )
  assert(root.textContent.includes('未登记关联退款'))
  failCredits = false
  await click('重新读取')
  assert(root.textContent.includes('未登记账款调整'))
  const next = root.querySelector('.ant-pagination-next button')
  assert(next)
  await harness.act(() => next.click())
  await harness.flush()
  assert(
    requests.some(
      (rpc) =>
        rpc.params.finance_fact_id === 9 &&
        rpc.params.offset === 20 &&
        rpc.params.limit === 20
    )
  )
  assert(requests.every((rpc) => /^(list|get)_/.test(rpc.method)))
})

test('切换账款与卸载会中止旧读取，迟到数据不能覆盖新账款', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: View } = await import('./FinanceTraceView.jsx')
  let finishOld
  let oldSignal
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const rpc = JSON.parse(options.body)
    if (rpc.method === 'list_finance_facts')
      return ok(rpc, { finance_facts: [], total: 0 })
    if (rpc.method === 'get_finance_fact' && rpc.params.id === 9) {
      oldSignal = options.signal
      return new Promise((resolve) => {
        finishOld = () => resolve(ok(rpc, { finance_fact: fact(9) }))
      })
    }
    if (rpc.method === 'get_finance_fact')
      return ok(rpc, { finance_fact: fact(10) })
    return ok(
      rpc,
      rpc.method === 'list_finance_payments'
        ? { payments: [], total: 0 }
        : { credit_notes: [], total: 0 }
    )
  })
  const render = (id) =>
    harness.render(
      h(View, { factID: id, onSelectFact: () => {}, onOpenRules: () => {} })
    )
  await render(9)
  await render(10)
  await harness.flush()
  assert(oldSignal.aborted)
  await harness.act(async () => finishOld())
  await harness.flush()
  assert(harness.container.textContent.includes('AR-10'))
  assert(!harness.container.textContent.includes('AR-9'))
  await harness.render(h('div', null, '已离开'))
  assert.equal(harness.container.textContent, '已离开')
})
