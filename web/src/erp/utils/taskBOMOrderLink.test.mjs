import assert from 'node:assert/strict'
import test from 'node:test'
import { registerJSXTestLoader } from '../../../scripts/test/reactRuntime.mjs'

registerJSXTestLoader()
const { JsonRpc } = await import('../../common/utils/jsonRpc.js')
const { saveTaskBOMOrderLink, completeTaskEngineering } = await import('./taskBOMOrderLink.mjs')

test('task BOM save associates only the selected order line and safely recovers a lost response', async (t) => {
  const original = JsonRpc.prototype.call
  t.after(() => { JsonRpc.prototype.call = original })
  const source = { id: 11, product_id: 7, product_sku_id: 8, bom_id: null, line_status: 'open' }
  const bom = { id: 73, product_id: 7, edit_version: 100000001 }
  let line; let version; let writes; let lost; let
ignored
  const reset = () => { line = { ...source }; version = 3; writes = []; lost = false; ignored = false }
  JsonRpc.prototype.call = async function callRpc(method, params) {
    if (method === 'get_sales_order') return { data: { sales_order: { id: 1, version } } }
    if (method === 'list_sales_order_items') return { data: { sales_order_items: [line], total: 1, offset: params.offset, limit: params.limit } }
    assert.equal(method, 'save_sales_order_engineering')
    assert.equal(params.expected_version, version)
    assert.equal(params.items.length, 1)
    writes.push(params)
    if (!ignored) { line = { ...line, ...params.items[0] }; version++ }
    if (lost) { lost = false; throw new Error('response lost') }
    return { data: { sales_order_id: 1, version } }
  }
  await t.test('new BOM retains the matching product specification', async () => {
    reset()
    const saved = await saveTaskBOMOrderLink({ orderID: 1, source, bom })
    assert.equal(writes.length, 1)
    assert.equal(writes[0].items[0].product_sku_id, 8)
    assert.equal(writes[0].items[0].expected_bom_version, bom.edit_version)
    assert.equal(saved.items[0].bom_id, 73)
    await saveTaskBOMOrderLink({ orderID: 1, source, bom })
    assert.equal(writes.length, 1, 'editing an already associated BOM does not rewrite order engineering')
  })
  await t.test('product changes clear the old specification', async () => {
    reset()
    await saveTaskBOMOrderLink({ orderID: 1, source, bom: { ...bom, product_id: 9 } })
    assert.equal(writes[0].items[0].product_sku_id, null)
  })
  await t.test('lost write response retries by reading the successful association', async () => {
    reset(); lost = true
    await assert.rejects(saveTaskBOMOrderLink({ orderID: 1, source, bom }), /response lost/)
    const saved = await saveTaskBOMOrderLink({ orderID: 1, source, bom })
    assert.equal(saved.items[0].bom_id, 73)
    assert.equal(writes.length, 1)
  })
  await t.test('concurrent reference changes are never overwritten', async () => {
    for (const patch of [{ product_id: 99 }, { bom_id: 99 }, { product_sku_id: 99 }]) {
      reset(); line = { ...line, ...patch }
      await assert.rejects(saveTaskBOMOrderLink({ orderID: 1, source, bom }), /已被修改/)
      assert.equal(writes.length, 0)
    }
  })
  await t.test('closed line refuses association', async () => {
    reset(); line.line_status = 'canceled'
    await assert.rejects(saveTaskBOMOrderLink({ orderID: 1, source, bom }), /取消或移除/)
    assert.equal(writes.length, 0)
  })
  await t.test('successful response without matching readback remains unconfirmed', async () => {
    reset(); ignored = true
    await assert.rejects(saveTaskBOMOrderLink({ orderID: 1, source, bom }), /结果暂未确认/)
  })
})

test('completion preserves all order sources and recovers an automatic-review response loss', async (t) => {
  const original = JsonRpc.prototype.call
  t.after(() => { JsonRpc.prototype.call = original })
  const source = { id: 11, product_id: 7, product_sku_id: 8, bom_id: 73, line_status: 'open' }
  let line = { ...source }
  let order = { id: 1, version: 3 }
  let writes = 0
  JsonRpc.prototype.call = async function callRpc(method, params) {
    if (method === 'get_sales_order') return { data: { sales_order: order } }
    if (method === 'list_sales_order_items') return { data: { sales_order_items: [line], total: 1, offset: params.offset, limit: params.limit } }
    if (method === 'get_bom_version') return { data: { bom_version: { id: 73, edit_version: 101 } } }
    assert.equal(method, 'save_sales_order_engineering')
    assert.equal(params.expected_version, order.version)
    assert.equal(params.complete, true)
    assert.deepEqual(params.items[0], { id: 11, product_id: 7, product_sku_id: 8, bom_id: 73, expected_bom_version: 101 })
    writes++
    order = { ...order, version: order.version + 1, engineering_material_status: 'SUBMITTED' }
    throw new Error('response lost')
  }
  const input = { orderID: 1, sources: [source] }
  await assert.rejects(completeTaskEngineering(input), /response lost/)
  const saved = await completeTaskEngineering(input)
  assert.equal(saved.order.engineering_material_status, 'SUBMITTED')
  assert.equal(writes, 1)
  line = { ...line, bom_id: 99 }
  await assert.rejects(completeTaskEngineering(input), /已被修改/)
  assert.equal(writes, 1)
})

test('completion refuses a new or unfinished order line before writing', async (t) => {
  const original = JsonRpc.prototype.call
  t.after(() => { JsonRpc.prototype.call = original })
  const source = { id: 11, line_no: 1, product_id: 7, bom_id: null, line_status: 'open' }
  let lines = [source]
  JsonRpc.prototype.call = async function callRpc(method, params) {
    if (method === 'get_sales_order') return { data: { sales_order: { id: 1, version: 3 } } }
    if (method === 'list_sales_order_items') return { data: { sales_order_items: lines, total: lines.length, offset: params.offset, limit: params.limit } }
    assert.fail(`unexpected write ${method}`)
  }
  await assert.rejects(completeTaskEngineering({ orderID: 1, sources: lines }), /第 1 行/)
  lines = [...lines, { ...source, id: 12 }]
  await assert.rejects(completeTaskEngineering({ orderID: 1, sources: [source] }), /已被修改/)
})

test('review success retries only task completion and reads an already completed task', async (t) => {
  const original = JsonRpc.prototype.call
  t.after(() => { JsonRpc.prototype.call = original })
  const source = { id: 11, product_id: 7, bom_id: 73, line_status: 'open' }
  let task = { id: 41, version: 2, task_status_key: 'ready' }
  let calls = 0
  JsonRpc.prototype.call = async function callRpc(method, params) {
    if (method === 'get_sales_order') return { data: { sales_order: { id: 1, version: 4, engineering_material_status: 'SUBMITTED' } } }
    if (method === 'list_sales_order_items') return { data: { sales_order_items: [source], total: 1, offset: params.offset, limit: params.limit } }
    if (method === 'get_task') return { data: { task } }
    assert.fail(`unexpected mutation ${method}`)
  }
  const attempts = { run: async ({ params, operation }) => {
    assert.equal(operation, 'complete')
    assert.equal(params.expected_version, 2)
    calls++
    task = { ...task, version: 3, task_status_key: 'done' }
    throw new Error('response lost')
  } }
  const input = { orderID: 1, sources: [source], taskID: 41, attempts }
  await assert.rejects(completeTaskEngineering(input), /response lost/)
  await completeTaskEngineering(input)
  assert.equal(calls, 1)
})
