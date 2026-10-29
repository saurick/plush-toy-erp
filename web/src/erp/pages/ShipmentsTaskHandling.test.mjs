import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { transformWithEsbuild } from 'vite'
import { isSourceBusinessActionResultUnknown } from '../utils/sourceBusinessAction.mjs'

const source = readFileSync(new URL('./ShipmentsPage.jsx', import.meta.url), 'utf8')
const handler = source.slice(source.indexOf('  const submitShipmentModal ='), source.indexOf('  const runShipmentAction ='))
assert.ok(handler.length > 0, 'load the actual page submit handler')
const { code } = await transformWithEsbuild(`${handler}\nsubmitShipmentModal`, 'ShipmentsTaskHandling.jsx', { loader: 'jsx', jsx: 'transform', target: 'esnext' })

function setup(overrides = {}) {
  const calls = []
  const state = { modal: { mode: 'edit', shipment: { id: 91, version: 4 } } }
  const items = Array.from({ length: 25 }, (_, index) => ({ sales_order_item_id: index + 1, product_id: index + 10, quantity: 1 }))
  const saved = { id: 91, version: 5, shipment_no: 'TEST-SHIP-91', items }
  const canonical = { ...saved, note: '保存后规范化备注', items: items.map((item, index) => ({ ...item, id: 9001 + index })) }
  const context = {
    taskDraftSavingRef: { current: false },
    taskBusiness: { readOnly: false },
    shipmentForm: { validateFields: async () => ({ sales_order_id: 12, items, idempotency_key: 'draft-only' }) },
    buildShipmentWithItemsParams: (values) => values,
    products: [],
    productSKUs: [],
    selectedSalesOrder: null,
    taskSource: null,
    positiveInt: (value) => Number.isSafeInteger(value) && value > 0,
    canSubmitShipmentRelease: true,
    modal: { confirm: (options) => { calls.push(['confirm']); options.onOk() } },
    React: { createElement: () => null },
    ProcessSubmissionRoute: () => null,
    activeCustomerKey: 'demo',
    setSaving: (value) => calls.push(['saving', value]),
    saveShipmentDraft: async (params) => { calls.push(['save', params]); return saved },
    createShipmentWithItems: async () => { throw new Error('existing tasks must not create a second shipment') },
    shipmentAttachmentRef: { current: { flushPendingAttachments: async () => true } },
    getShipment: async (params) => { calls.push(['read', params]); return canonical },
    shipmentFormValues: (record) => ({ note: record.note }),
    applyBusinessFormReadback: (_form, values) => calls.push(['readback', values]),
    setSelectedRow: (value) => { state.selected = value },
    setShipmentModal: (value) => { state.modal = value },
    submitShipmentFinanceApprovalProcess: async (params) => { calls.push(['approve', params]) },
    closeShipmentModal: () => { calls.push(['close']) },
    reportBusinessResult: (text) => calls.push(['receipt', text]),
    loadRows: async () => { calls.push(['reload']) },
    message: Object.fromEntries(['success', 'warning', 'error'].map((level) => [level, (text) => calls.push([level, text])])),
    getActionErrorMessage: (_error, action) => `${action}失败`,
    isSourceBusinessActionResultUnknown,
    ...overrides,
  }
  Object.defineProperty(context, 'shipmentModal', { get: () => state.modal })
  const submit = vm.runInNewContext(code, context)
  return { submit, calls, state, saved, canonical, context }
}

test('task shipment saves every row with its version before submitting the same draft for approval', async () => {
  const ui = setup()
  await ui.submit({ submitForApproval: true })
  assert.deepEqual(ui.calls.map(([name]) => name), ['confirm', 'saving', 'save', 'approve', 'close', 'receipt', 'reload', 'saving'])
  const params = ui.calls.find(([name]) => name === 'save')[1]
  assert.equal(params.id, 91)
  assert.equal(params.expected_version, 4)
  assert.equal(params.items.length, 25)
  assert.equal(params.items.at(-1).sales_order_item_id, 25)
  assert.equal('idempotency_key' in params, false)
  assert.deepEqual(JSON.parse(JSON.stringify(ui.calls.find(([name]) => name === 'approve')[1])), { id: 91, shipment_no: 'TEST-SHIP-91' })
})

test('save-only keeps approval separate and records the actual saved draft', async () => {
  const ui = setup()
  await ui.submit()
  assert.equal(ui.calls.some(([name]) => ['confirm', 'approve'].includes(name)), false)
  assert.equal(ui.calls.filter(([name]) => name === 'save').length, 1)
  assert.match(ui.calls.find(([name]) => name === 'receipt')[1], /草稿和明细已更新/)
  assert.equal(ui.calls.find(([name]) => name === 'read')[1].id, 91)
  assert.equal(ui.state.modal.shipment.note, ui.canonical.note)
  const values = ui.calls.find(([name]) => name === 'readback')[1]
  assert.equal(values.note, ui.canonical.note)
  assert.equal(values.items.length, 25)
  assert.equal(values.items.at(-1).id, ui.canonical.items.at(-1).id)
})

test('cancelling approval confirmation and validation failure both leave business data untouched', async () => {
  for (const overrides of [
    { modal: { confirm: (options) => options.onCancel() } },
    { shipmentForm: { validateFields: async () => { throw Object.assign(new Error('validation failed'), { errorFields: [{ name: 'quantity' }] }) } } },
  ]) {
    const ui = setup(overrides)
    await ui.submit({ submitForApproval: true })
    assert.equal(ui.calls.some(([name]) => ['save', 'approve', 'close', 'receipt'].includes(name)), false)
    assert.equal(ui.context.taskDraftSavingRef.current, false)
  }
})

test('save failure never submits approval or shows a success receipt', async () => {
  const ui = setup({ saveShipmentDraft: async () => { throw new Error('conflict') } })
  await ui.submit({ submitForApproval: true })
  assert.equal(ui.calls.some(([name]) => ['approve', 'close', 'receipt'].includes(name)), false)
  assert.match(ui.calls.find(([name]) => name === 'error')[1], /保存出货单/)
})

test('approval failure retains the new draft version and permits a version-safe retry', async () => {
  let attempts = 0
  const ui = setup({ submitShipmentFinanceApprovalProcess: async () => { if (++attempts === 1) throw new Error('approval unavailable') } })
  await ui.submit({ submitForApproval: true })
  assert.equal(ui.state.modal.shipment.version, 5)
  assert.equal(ui.calls.some(([name]) => ['close', 'receipt'].includes(name)), false)
  assert.match(ui.calls.find(([name]) => name === 'error')[1], /草稿已保存，审批未提交/)
  await ui.submit({ submitForApproval: true })
  assert.equal(ui.calls.filter(([name]) => name === 'save')[1][1].expected_version, 5)
  assert.equal(ui.calls.filter(([name]) => name === 'receipt').length, 1)
})

test('attachment upload failure retains the saved draft and does not submit incomplete approval', async () => {
  const ui = setup({ shipmentAttachmentRef: { current: { flushPendingAttachments: async () => false } } })
  await ui.submit({ submitForApproval: true })
  assert.equal(ui.state.modal.shipment.version, 5)
  assert.equal(ui.calls.some(([name]) => ['approve', 'close', 'receipt'].includes(name)), false)
  assert.match(ui.calls.find(([name]) => name === 'warning')[1], /草稿已保存，附件尚未上传完成/)
})

test('an ambiguous approval response never claims that approval did not happen', async () => {
  const ui = setup({ submitShipmentFinanceApprovalProcess: async () => { throw Object.assign(new Error('unconfirmed response'), { isNetworkError: true }) } })
  await ui.submit({ submitForApproval: true })
  assert.equal(ui.calls.some(([name]) => ['close', 'receipt'].includes(name)), false)
  assert.match(ui.calls.find(([name]) => name === 'error')[1], /审批结果暂未确认/)
  assert.doesNotMatch(ui.calls.find(([name]) => name === 'error')[1], /审批未提交/)
})

test('a list refresh failure after approval does not undo or misreport the successful submission', async () => {
  const ui = setup({ loadRows: async () => { throw new Error('list unavailable') } })
  await ui.submit({ submitForApproval: true })
  assert.equal(ui.calls.filter(([name]) => name === 'approve').length, 1)
  assert.equal(ui.calls.filter(([name]) => name === 'receipt').length, 1)
  assert.match(ui.calls.find(([name]) => name === 'error')[1], /审批已提交，任务列表读取失败/)
})

test('double clicks cannot save or approve twice while validation or confirmation is pending', async () => {
  let release
  const ui = setup({ modal: { confirm: (options) => { release = options.onOk } } })
  const first = ui.submit({ submitForApproval: true })
  await Promise.resolve()
  await ui.submit({ submitForApproval: true })
  release()
  await first
  assert.equal(ui.calls.filter(([name]) => name === 'save').length, 1)
  assert.equal(ui.calls.filter(([name]) => name === 'approve').length, 1)
})

test('readonly tasks and accounts without submission capability cannot submit approval', async () => {
  for (const overrides of [{ taskBusiness: { readOnly: true } }, { canSubmitShipmentRelease: false }]) {
    const ui = setup(overrides)
    await ui.submit({ submitForApproval: true })
    assert.equal(ui.calls.some(([name]) => ['save', 'approve', 'receipt'].includes(name)), false)
  }
})
