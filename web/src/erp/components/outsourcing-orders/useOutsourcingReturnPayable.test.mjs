import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('stage payable shares the source form and sends only the selected contract', async (t) => {
  const calls = []
  const ui = await businessFormHarness(t, { rpc: async (method, params) => {
    calls.push({ method, params })
    return { code: 0, data: { finance_fact: { id: 81, fact_type: 'PAYABLE', status: 'DRAFT', fact_no: params.fact_no, source_type: 'OUTSOURCING_ORDER', source_id: params.outsourcing_order_id, idempotency_key: params.idempotency_key } } }
  } })
  const { useOutsourcingReturnPayable } = await import('./useOutsourcingReturnPayable.mjs')
  const { default: Modal } = await import('../finance/FinanceBusinessSourceModal.jsx')
  let actions
  function Harness() {
    actions = useOutsourcingReturnPayable({ canCreatePayable: true, canCreateStagePayable: true, activeCustomerKey: 'demo', setReturnRecordsOpen() {}, setReturnRecordsOrder() {}, setRelatedReturnFacts() {} })
    return createElement(Modal, { action: actions.financeSourceAction, source: actions.financeSourceFact, open: Boolean(actions.financeSourceFact), initialValues: actions.financeSourceInitialValues, loading: actions.financeSourceLoading, onCancel: actions.closeOutsourcingReturnPayable, onSubmit: actions.submitOutsourcingReturnPayable })
  }
  await ui.render(createElement(Harness))
  await act(async () => actions.openOutsourcingOrderPayable({ id: 17, outsourcing_order_no: 'OC-17', lifecycle_status: 'confirmed', supplier_snapshot: { name: '模拟加工厂' } }))
  assert.match(document.body.textContent, /从工序委外合同生成应付/u)
  assert.equal(ui.field('业务编号').value, 'AP-OC-17')
  await ui.click(ui.button('生成应付草稿'))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'create_payable_from_outsourcing_order')
  assert.equal(calls[0].params.outsourcing_order_id, 17)
  assert.equal(calls[0].params.outsourcing_fact_id, undefined)
  assert.equal(calls[0].params.occurred_at, undefined)
  assert.equal(actions.financeSourceFact, null)
})
