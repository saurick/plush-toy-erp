import { act, createElement, useState } from 'react'
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
  const { createMemoryRouter, RouterProvider } = await import('react-router-dom')
  const submissions = []
  const props = {
    open: true,
    operationType: 'CYCLE_COUNT',
    sourceRecord: { subject_type: 'PRODUCT', subject_id: 7, warehouse_id: 3, unit_id: 2, quantity: '10' },
    sourceLabels: { subject: '测试成品', warehouse: '成品仓', unit: '件' },
    onSubmit: async (values) => submissions.push(values),
  }
  let updateProps
  function EditorRoute() {
    const [current, setCurrent] = useState({ ...props })
    updateProps = setCurrent
    return createElement(Modal, {
      ...current,
      onSubmit: async (values) => {
        setCurrent((value) => ({ ...value, loading: true }))
        try { return await props.onSubmit(values) } finally {
          setCurrent((value) => ({ ...value, loading: false }))
        }
      },
    })
  }
  const router = createMemoryRouter([{ path: '*', element: createElement(EditorRoute) }])
  t.after(() => router.dispose())
  let mounted = false
  const render = async () => {
    if (mounted) await act(async () => updateProps({ ...props }))
    else {
      mounted = true
      await ui.render(createElement(RouterProvider, { router, future: { v7_startTransition: true } }))
    }
    await act(() => new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))))
    await ui.flush()
  }
  return { ...ui, props, submissions, render }
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
  await ui.click(ui.button('返回列表'))
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

for (const [kind, title, label, value, field] of [
  ['CYCLE_COUNT', '编辑盘点草稿', '实盘数量', '0', 'counted_quantity'],
  ['TRANSFER', '编辑调拨草稿', '调拨数量', '3', 'adjustment_quantity'],
  ['MANUAL_ADJUSTMENT', '编辑人工调整草稿', '调整数量（增加填正数，扣减填负数）', '-2', 'adjustment_quantity'],
]) {
  test(`inventory ${kind} draft page keeps source identity and operator input across reference refresh`, async (t) => {
    const ui = await setup(t)
    ui.props.mode = 'edit'
    ui.props.operation = {
      id: 11,
version: 2,
operation_type: kind,
operation_no: 'DRAFT-11',
reason: '原草稿',
      items: [{ ...ui.props.sourceRecord, id: 91, from_warehouse_id: 3, to_warehouse_id: 4, counted_quantity: '5', adjustment_quantity: '2' }],
    }
    ui.props.warehouseOptions = [{ value: 4, label: '目标成品仓', type: 'FINISHED_GOODS' }]
    await ui.render()
    assert.equal(document.querySelector('.erp-business-form-page:not([hidden]) h1').textContent, title)
    assert.equal(document.querySelectorAll('.ant-modal').length, 0)
    await ui.fill(label, value)
    await ui.fill('业务原因', '修改后仍保留')
    ui.props.warehouseOptions = [{ value: 4, label: '目标仓库新名称', type: 'FINISHED_GOODS' }]
    await ui.render()
    assert.equal(ui.field(label).value, value)
    await ui.click(ui.button('保存草稿'))
    await t.waitFor(() => assert.equal(ui.submissions.length, 1))
    assert.equal(ui.submissions[0].items[0].id, 91)
    assert.equal(ui.submissions[0].items[0][field], value)
    assert.equal(ui.submissions[0].items[0].subject_id, undefined)
    assert.equal(ui.submissions[0].items[0].warehouse_id, undefined)
  })
}

test('reopening a saved inventory draft retains the persisted quantity after closed source fields unregister', async (t) => {
  const ui = await setup(t)
  const operation = {
    id: 11,
version: 1,
operation_type: 'CYCLE_COUNT',
operation_no: 'DRAFT-11',
reason: '原草稿',
    items: [{ ...ui.props.sourceRecord, id: 91, counted_quantity: '5' }],
  }
  ui.props.mode = 'edit'
  ui.props.operation = operation
  await ui.render()
  assert.equal(ui.field('实盘数量').value, '5')
  ui.props.open = false
  ui.props.mode = 'create'
  ui.props.operation = null
  await ui.render()
  ui.props.open = true
  ui.props.mode = 'edit'
  ui.props.operation = { ...operation, version: 2, items: [{ ...operation.items[0], counted_quantity: '9' }] }
  await ui.render()
  assert.equal(ui.field('实盘数量').value, '9')
  assert.equal(ui.field('业务原因').value, '原草稿')
})
