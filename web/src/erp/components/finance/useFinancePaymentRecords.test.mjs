import { act, createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('收付款筛选传到服务端，失败时不保留上一筛选的金额与行', async (t) => {
  let fail = false
  const queries = []
  const ui = await businessFormHarness(t, { rpc(method, params) {
    if (method === 'list_finance_payments') {
      queries.push(params)
      if (fail) throw new Error('读取失败')
      return { data: { payments: [{ id: 1 }], total: 1, totals: [{ currency: 'USD', amount: '25', status: 'POSTED', direction: 'RECEIPT', count: 1 }] } }
    }
    return { data: { credit_notes: [], customers: [], suppliers: [], total: 0, limit: 200, offset: 0 } }
  } })
  const [{ MemoryRouter }, { default: useRecords }, { default: useLatestRequestCoordinator }] = await Promise.all([import('react-router-dom'), import('./useFinancePaymentRecords.mjs'), import('../../hooks/useLatestRequestCoordinator.js')])
  let controls
  const setActiveTab = () => {}
  function Records() {
    controls = useRecords({ beginLatestRequest: useLatestRequestCoordinator(), setActiveTab })
    return null
  }
  await ui.render(createElement(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(Records)))
  await act(async () => controls.setPaymentFilters({ currency: 'USD', kind: 'ADVANCE', party: 'CUSTOMER:3', dateFrom: '2026-09-01', dateTo: '2026-09-30' }))
  assert.equal(controls.paymentTotals[0].amount, '25')
  const query = queries.at(-1)
  assert.deepEqual([query.currency, query.kind, query.counterparty_type, query.counterparty_id, query.date_from, query.date_to, query.include_totals], ['USD', 'ADVANCE', 'CUSTOMER', 3, '2026-09-01', '2026-09-30', true])
  fail = true
  await act(async () => controls.setPaymentFilters({ currency: 'CNY' }))
  assert.deepEqual(controls.paymentTotals, [])
  assert.deepEqual(controls.payments, [])
  assert.equal(controls.paymentTotal, 0)
})

test('收付款重读失败保留对象与恢复提示，重试成功后回到最新记录', async (t) => {
  let fail = true
  const reads = []
  const ui = await businessFormHarness(t, {
    rpc(method, params) {
      if (method === 'get_finance_payment') {
        reads.push(params.id)
        if (fail) throw new Error('读取失败')
        return { data: { payment: { id: params.id, payment_no: 'PAY-RETRY', status: 'POSTED', version: 2 } } }
      }
      assert(['list_finance_payments', 'list_finance_credit_notes', 'list_customers', 'list_suppliers'].includes(method), method)
      return { data: { payments: [], credit_notes: [], customers: [], suppliers: [], total: 0, limit: 200, offset: 0 } }
    },
  })
  const [{ MemoryRouter }, { default: useRecords }, { default: useLatestRequestCoordinator }] = await Promise.all([
    import('react-router-dom'), import('./useFinancePaymentRecords.mjs'), import('../../hooks/useLatestRequestCoordinator.js'),
  ])
  let controls
  const setActiveTab = () => {}
  function Records() {
    const beginLatestRequest = useLatestRequestCoordinator()
    controls = useRecords({ beginLatestRequest, setActiveTab })
    return null
  }
  await ui.render(createElement(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(Records)))
  await act(async () => controls.rememberPayment({ id: 17, status: 'APPROVED', version: 1 }))
  await act(async () => assert.equal(await controls.recoverPayment(17, true), null))
  assert.equal(controls.currentPayment.id, 17)
  assert.equal(controls.currentPayment.status, 'APPROVED')
  assert.equal(controls.paymentRecovery.id, 17)
  assert(controls.paymentRecovery.message)
  fail = false
  await act(async () => controls.recoverPayment(17, true))
  assert.equal(controls.paymentRecovery, null)
  assert.equal(controls.currentPayment.status, 'POSTED')
  assert.equal(controls.currentPayment.version, 2)
  assert.deepEqual(reads, [17, 17])
})
