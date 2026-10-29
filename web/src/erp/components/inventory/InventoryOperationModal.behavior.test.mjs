import { createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  businessFormHarness,
  deferredFormRequest,
} from '../../../../scripts/test/businessFormHarness.mjs'

async function setup(t, { precision = 0 } = {}) {
  const ui = await businessFormHarness(t, {
    rpc(method) {
      assert.equal(method, 'list_units')
      return { data: { units: [{ id: 2, name: '件', code: 'PCS', precision }], total: 1, limit: 200, offset: 0 } }
    },
  })
  const { default: Modal } = await import('./InventoryOperationModal.jsx')
  const submissions = []
  const props = {
    open: true,
    operationType: 'CYCLE_COUNT',
    sourceRecord: { subject_type: 'PRODUCT', subject_id: 7, warehouse_id: 3, unit_id: 2, quantity: '10' },
    sourceLabels: { subject: '测试成品', warehouse: '成品仓', unit: '件' },
    onSubmit: async (values) => submissions.push(values),
  }
  return { ...ui, props, submissions, render: () => ui.render(createElement(Modal, props)) }
}

test('inventory count validates unit precision and allows an explicit zero count', async (t) => {
  const ui = await setup(t)
  await ui.render()
  await ui.fill('作业单号', 'COUNT-7')
  await ui.fill('业务原因', '月末核对')
  await ui.fill('实盘数量', '1.5')
  await ui.click(ui.button('提交盘点复核'))
  // Validation state settles before Ant Design's debounced field feedback.
  await t.waitFor(async () => {
    await ui.flush()
    assert.match(
      ui.field('实盘数量').closest('.ant-form-item').textContent,
      /当前单位只允许整数数量/u
    )
  })
  assert.equal(ui.submissions.length, 0)
  await ui.fill('实盘数量', '0')
  await ui.click(ui.button('提交盘点复核'))
  await t.waitFor(() => assert.equal(ui.submissions.length, 1))
  assert.equal(ui.submissions[0].items[0].counted_quantity, '0')
  assert.equal(ui.submissions[0].reason, '月末核对')
  assert.equal(ui.submissions[0].items[0].subject_id, undefined)
  assert.equal(ui.submissions[0].items[0].warehouse_id, undefined)
})

test('inventory submission suppresses duplicate clicks and preserves the draft after a failed save', async (t) => {
  const ui = await setup(t)
  const request = deferredFormRequest()
  let attempts = 0
  let cancellations = 0
  let failed = false
  ui.props.onCancel = () => { cancellations += 1 }
  ui.props.onSubmit = async (values) => {
    attempts += 1
    if (attempts === 1) {
      try { await request.promise } catch { failed = true }
      return
    }
    ui.submissions.push(values)
  }
  await ui.render()
  await ui.fill('作业单号', 'COUNT-RETRY')
  await ui.fill('业务原因', '复核数量')
  await ui.fill('实盘数量', '9')
  const submit = ui.button('提交盘点复核')
  await ui.click(submit)
  await ui.click(submit)
  await ui.click(ui.button('取消'))
  assert.equal(attempts, 1)
  assert.equal(cancellations, 0)
  request.reject(new Error('simulated save failure'))
  await ui.flush()
  assert.equal(failed, true)
  assert.equal(ui.field('实盘数量').value, '9')
  assert.equal(ui.field('业务原因').value, '复核数量')
  await ui.click(submit)
  assert.equal(attempts, 2)
  assert.equal(ui.submissions[0].items[0].counted_quantity, '9')
})

test('inventory source changes and reopening clear quantities belonging to the previous source', async (t) => {
  const ui = await setup(t)
  await ui.render()
  await ui.fill('作业单号', 'COUNT-OLD')
  await ui.fill('业务原因', '旧来源原因')
  await ui.fill('实盘数量', '8')
  ui.props.sourceRecord = { ...ui.props.sourceRecord, subject_id: 9, quantity: '20' }
  ui.props.sourceLabels = { ...ui.props.sourceLabels, subject: '另一成品' }
  await ui.render()
  assert.equal(ui.field('实盘数量').value, '')
  assert.equal(ui.field('业务原因').value, '')
  assert.match(document.body.textContent, /另一成品/u)
  await ui.fill('实盘数量', '18')
  ui.props.open = false
  await ui.render()
  ui.props.open = true
  await ui.render()
  assert.equal(ui.field('实盘数量').value, '')
  assert.equal(ui.submissions.length, 0)
})

test('multi-line counts preserve each source and allow zero difference without dropping a line', async (t) => {
  const ui = await setup(t)
  ui.props.sourceRecords = [ui.props.sourceRecord, { ...ui.props.sourceRecord, subject_id: 8, quantity: '5' }]
  await ui.render()
  await ui.fill('作业单号', 'COUNT-MULTI')
  await ui.fill('业务原因', '两行盘点')
  const fields = Array.from(document.querySelectorAll('input[id$="_counted_quantity"]'))
  assert.equal(fields.length, 2)
  await ui.fill(fields[0], '10')
  await ui.fill(fields[1], '3')
  await ui.click(ui.button('提交盘点复核'))
  await t.waitFor(() => assert.equal(ui.submissions.length, 1))
  assert.deepEqual(ui.submissions[0].items.map((row) => row.counted_quantity), ['10', '3'])
})
