import { act, createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('payment direction switches clear the previous party and isolate customer and supplier labels with the same id', async (t) => {
  const originalError = console.error
  const errors = t.mock.method(console, 'error', (...args) => originalError(...args))
  const nativeAbortController = globalThis.AbortController
  const ui = await businessFormHarness(t, {
    rpc(method) {
      assert.equal(method, 'get_process_submission_route')
      return { data: { route: { owner_role_key: 'finance', condition: { mode: 'all' } } } }
    },
  })
  globalThis.AbortController = nativeAbortController
  const [{ createMemoryRouter, RouterProvider }, { FinancePaymentEditor }, { default: useCreation }] = await Promise.all([
    import('react-router-dom'),
    import('./FinancePaymentEditor.jsx'),
    import('./useFinancePaymentCreation.mjs'),
  ])
  const customers = [{ id: 1, name: '测试客户' }]
  const suppliers = [{ id: 1, name: '测试供应商' }]
  let controls
  function Payment() {
    controls = useCreation({ customers, suppliers })
    return createElement(FinancePaymentEditor, { ...controls, loading: false, referenceLoading: false })
  }
  const router = createMemoryRouter([{ path: '*', element: createElement(Payment) }], {
    future: { v7_relativeSplatPath: true },
  })
  t.after(() => router.dispose())
  await ui.render(createElement(RouterProvider, { router, future: { v7_startTransition: true } }))
  await act(async () => controls.openPayment())
  await ui.select('客户', '测试客户')
  assert.equal(controls.paymentForm.getFieldValue('counterparty_id'), 1)

  for (const [direction, label, name] of [
    ['付款', '供应商', '测试供应商'],
    ['收款', '客户', '测试客户'],
  ]) {
    await ui.select('收付款方向', direction)
    const values = controls.paymentForm.getFieldsValue(true)
    assert.equal(values.counterparty_id, undefined)
    assert.equal(values.source_type, undefined)
    assert.equal(values.source_id, undefined)
    assert.equal(values.currency, undefined)
    assert.equal(ui.field(label).closest('.ant-select-selector').querySelector('.ant-select-selection-item'), null)
    await ui.select(label, name)
    assert.equal(controls.paymentForm.getFieldValue('counterparty_id'), 1)
    assert.equal(ui.field(label).closest('.ant-select-selector').querySelector('.ant-select-selection-item').textContent, name)
  }
  assert.equal(errors.mock.callCount(), 0, 'customer and supplier labels must not share a cached selection')
})
