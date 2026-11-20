import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { productionWipFixture } from '../../../../scripts/test/productionWipFixture.mjs'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { installRpcCallHarness } from '../../../../scripts/test/rpcApiTestHarness.mjs'

function reworkRoute(orderID) {
  const data = productionWipFixture()
  data.production_order.id = orderID
  data.production_order.order_no = `PO-${orderID}`
  const root = {
    ...data.production_wip_batches[1],
    id: 35,
    production_order_operation_id: 43,
    batch_no: 'RW-35',
    origin_rework_fact_id: 901,
    source_batch_id: null,
    flow_type: 'REWORK',
    rework_reason: '成品返工',
    execution_mode: null,
    status: 'PLANNED',
    started_at: null,
    completed_at: null,
  }
  data.production_wip_batches.push(root)
  for (const rows of Object.values(data).filter(Array.isArray)) {
    for (const row of rows) {
      if (Object.hasOwn(row, 'production_order_id')) {
        row.production_order_id = orderID
      }
    }
  }
  return data
}

test('rework progress follows the selected order even when a previous read finishes last', async (t) => {
  const view = await createReactTestHarness(t)
  const setRpc = installRpcCallHarness((cleanup) => t.after(cleanup))
  const { default: useProductionReworkProgress } =
    await import('./useProductionReworkProgress.mjs')
  let progress
  function Consumer({ orderID, canRead }) {
    progress = useProductionReworkProgress(
      { id: orderID, status: 'RELEASED' },
      canRead
    )
    return null
  }
  const render = (orderID, canRead = true) =>
    view.render(createElement(Consumer, { orderID, canRead }))
  const ordersRead = []
  const firstRead = Promise.withResolvers()
  const firstStarted = Promise.withResolvers()
  let oldSignal
  setRpc(async (method, params, { init }) => {
    if (method === 'get_production_wip') {
      const id = params.production_order_id
      ordersRead.push(id)
      if (id === 7) {
        oldSignal = init.signal
        firstStarted.resolve()
        await firstRead.promise
      }
      return { code: 0, data: reworkRoute(id) }
    }
    assert.equal(method, 'list_production_facts')
    assert.equal(params.source_type, 'PRODUCTION_ORDER')
    return {
      code: 0,
      data: {
        production_facts: [{ id: params.source_id }],
        total: 1,
        limit: params.limit,
        offset: params.offset,
      },
    }
  })

  await render(7)
  let slowLoad
  await view.act(async () => {
    slowLoad = progress.open()
    await firstStarted.promise
  })
  assert.equal(progress.loading, true)
  await render(8)
  assert.equal(oldSignal.aborted, true)
  assert.equal(progress.context, null)
  assert.equal(progress.loading, false)
  await view.act(() => progress.open())
  assert.equal(progress.context?.order.id, 8)
  await view.act(async () => {
    firstRead.resolve()
    await slowLoad
  })
  assert.equal(progress.context?.order.id, 8)
  assert.deepEqual(
    progress.context.facts.map((row) => row.id),
    [8]
  )
  await view.act(async () => progress.close())
  assert.equal(progress.context, null)
  await view.act(() => progress.open())
  await render(8, false)
  assert.equal(progress.context, null)
  await view.act(() => progress.open())
  assert.deepEqual(ordersRead, [7, 8, 8])
})
