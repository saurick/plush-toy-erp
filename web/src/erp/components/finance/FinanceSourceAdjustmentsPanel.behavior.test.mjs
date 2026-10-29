import { createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'
import { createSourceBusinessActionAttemptStore } from '../../utils/sourceBusinessAction.mjs'

test('采购差额响应丢失后关闭重开仍只能重试原内容，成功后刷新待办', async (t) => {
  const writes = []
  let done = false
  const ui = await businessFormHarness(t, { rpc(method, params) {
    if (method === 'list_finance_source_adjustments') return { data: { adjustments: done ? [] : [{ source_type: 'PURCHASE_RETURN', source_id: 7, source_no: 'RET-SIM', finance_fact_no: 'AP-SIM', counterparty_name: '模拟供应商', balance_direction: 'DECREASE', amount: '10', outstanding_amount: '50', currency: 'CNY' }], total: done ? 0 : 1 } }
    assert.equal(method, 'create_finance_source_adjustment')
    writes.push(params)
    if (writes.length === 1) throw Object.assign(new Error('response lost'), { isNetworkError: true })
    done = true
    return { data: { credit_note: { id: 9 } } }
  } })
  const { default: Panel } = await import('./FinanceSourceAdjustmentsPanel.jsx')
  const { MemoryRouter } = await import('react-router-dom')
  const attemptsRef = { current: createSourceBusinessActionAttemptStore() }
  await ui.render(createElement(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(Panel, { customerKey: 'demo', canCreate: true, attemptsRef })))
  await ui.click(ui.button('确认差额'))
  await ui.fill('调整原因', '已核对采购退货')
  await ui.click(ui.button('确认调整'))
  assert.equal(writes.length, 1)
  assert.equal(ui.field('调整原因').disabled, true)
  await ui.click(ui.button('取消'))
  await ui.click(ui.button('确认差额'))
  assert.equal(ui.field('调整原因').value, '已核对采购退货')
  assert.equal(ui.field('调整原因').disabled, true)
  await ui.click(ui.button('确认调整'))
  assert.equal(writes.length, 2)
  assert.deepEqual(writes[1], writes[0])
  assert.equal(ui.button('确认差额'), undefined)
  assert.equal(attemptsRef.current.peek('finance-source-adjustment:PURCHASE_RETURN:7'), null)
})
