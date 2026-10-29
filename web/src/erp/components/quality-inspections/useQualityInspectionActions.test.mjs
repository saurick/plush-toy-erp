import { createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { installRpcCallHarness } from '../../../../scripts/test/rpcApiTestHarness.mjs'
import { RpcErrorCode } from '../../../common/consts/errorCodes.generated.js'

async function actionsHarness(t, handler, overrides = {}) {
  const view = await createReactTestHarness(t)
  const setHandler = installRpcCallHarness((cleanup) => t.after(cleanup))
  const calls = []
  setHandler(async (method, params) => {
    calls.push({ method, params })
    return handler(method, params)
  })
  const { default: useQualityInspectionActions } =
    await import('./useQualityInspectionActions.js')
  const selected = []
  const reports = []
  const loading = []
  const attachments = []
  let closed = 0
  let refreshed = 0
  let pagination = { current: 4, pageSize: 20 }
  const editor = {
    referenceDataState: 'ready',
    inspectionModal: { mode: 'pass', inspection: { id: 7 } },
    inspectionForm: {
      validateFields: async () => ({
        inspection_no: ' QI-7 ',
        purchase_receipt_id: 8,
        purchase_receipt_item_id: 9,
        material_id: 999,
        warehouse_id: 999,
        inventory_lot_id: 999,
        source_type: 'manual',
        source_id: 999,
      }),
      resetFields: () => {},
    },
    decisionForm: {
      validateFields: async () => ({
        result: 'PASS',
        inspected_at: '2026-10-17',
        defect_rate_selection: 'APPROX:0',
        check_items: [{ name: '外观', requirement: '符合确认样', observation: '未见异常', result: 'PASS', scope: 'FULL' }],
      }),
    },
    inspectionAttachmentRef: {
      current: {
        flushPendingAttachments: async (id) => {
          attachments.push(id)
          return false
        },
      },
    },
    closeModal: () => {
      closed++
    },
    setSaving: (value) => loading.push(value),
    ...overrides,
  }
  let current
  function Consumer() {
    current = useQualityInspectionActions({
      editor,
      sourceAccess: overrides.sourceAccess || { allowed: true },
      activeCustomerKey: 'actions-fixture',
      loadRows: async () => {
        refreshed++
      },
      reportBusinessResult: (...args) => reports.push(args),
      setSelectedRow: (row) => selected.push(row),
      setPagination: (update) => {
        pagination = typeof update === 'function' ? update(pagination) : update
      },
    })
    return null
  }
  await view.render(createElement(Consumer))
  return {
    ...view,
    calls,
    selected,
    reports,
    loading,
    attachments,
    editor,
    get current() {
      return current
    },
    get pagination() {
      return pagination
    },
    get closed() {
      return closed
    },
    get refreshed() {
      return refreshed
    },
    render: () => view.render(createElement(Consumer)),
  }
}

test('missing receipt read blocks inspection creation before requesting a write', async (t) => {
  const view = await actionsHarness(t, () => { throw new Error('must not write') }, { sourceAccess: { allowed: false, reason: '缺少收货读取权限' } })
  await view.act(() => view.current.handleCreateInspection())
  assert.equal(view.calls.length, 0)
})

test('inspection creation permission denial closes and clears the source editor', async (t) => {
  const view = await actionsHarness(t, () => ({ code: RpcErrorCode.PERMISSION_DENIED, message: '权限不足' }))
  let cleared = 0
  view.editor.inspectionForm.resetFields = () => { cleared++ }
  await view.act(() => view.current.handleCreateInspection())
  assert.equal(view.closed, 1)
  assert.equal(cleared, 1)
  assert.deepEqual(view.attachments, [])
})

test('a pending decision admits one mutation and retains the committed result after attachment failure', async (t) => {
  let complete
  const pending = new Promise((resolve) => {
    complete = resolve
  })
  const result = { id: 7, status: 'PASSED' }
  const view = await actionsHarness(t, async () => {
    await pending
    return { code: 0, data: { quality_inspection: result } }
  })
  let first
  await view.act(() => {
    first = view.current.handleDecision()
  })
  await view.flush()
  await view.act(() => view.current.handleDecision())
  assert.equal(view.calls.length, 1)
  assert.deepEqual(view.loading, [true])
  await view.act(async () => {
    complete()
    await first
  })
  assert.deepEqual(view.selected, [result])
  assert.deepEqual(view.attachments, [7])
  assert.equal(view.closed, 1)
  assert.equal(view.refreshed, 1)
  assert.equal(view.pagination.current, 4)
  assert.equal(view.reports.length, 1)
  assert.deepEqual(view.loading, [true, false])
})

test('a failed decision leaves its editor open and releases the mutation guard for retry', async (t) => {
  let fail = true
  const view = await actionsHarness(t, () => {
    if (fail) throw new Error('connection closed')
    return {
      code: 0,
      data: { quality_inspection: { id: 7, status: 'PASSED' } },
    }
  })
  await view.act(() => view.current.handleDecision())
  assert.equal(view.closed, 0)
  assert.equal(view.selected.length, 0)
  assert.equal(view.refreshed, 0)
  fail = false
  await view.act(() => view.current.handleDecision())
  assert.equal(view.calls.length, 2)
  assert.equal(view.closed, 1)
  assert.equal(view.reports.length, 1)
})

test('creation submits source identity only and does not repeat a committed draft on attachment failure', async (t) => {
  const view = await actionsHarness(t, () => ({
    code: 0,
    data: { quality_inspection: { id: 11, status: 'DRAFT' } },
  }))
  await view.act(() => view.current.handleCreateInspection())
  assert.equal(view.calls.length, 1)
  assert.deepEqual(view.calls[0], {
    method: 'create_quality_inspection_draft',
    params: {
      customer_key: 'actions-fixture',
      inspection_no: 'QI-7',
      purchase_receipt_id: 8,
      purchase_receipt_item_id: 9,
    },
  })
  assert.deepEqual(view.attachments, [11])
  assert.equal(view.closed, 1)
  assert.equal(view.pagination.current, 1)
})

test('cancel uses the cancellation command and carries no decision-only evidence', async (t) => {
  const view = await actionsHarness(
    t,
    () => ({
      code: 0,
      data: { quality_inspection: { id: 7, status: 'CANCELLED' } },
    }),
    {
      inspectionModal: { mode: 'cancel', inspection: { id: 7 } },
      decisionForm: {
        validateFields: async () => ({ decision_note: 'source cancelled' }),
      },
    }
  )
  await view.act(() => view.current.handleDecision())
  assert.deepEqual(view.calls[0], {
    method: 'cancel_quality_inspection',
    params: { id: 7, decision_note: 'source cancelled' },
  })
  assert.equal(view.closed, 1)
})

for (const inspection_type of ['INCOMING', 'OUTSOURCING_RETURN', 'FINISHED_GOODS', 'PRODUCTION_STAGE']) {
  test(`${inspection_type} cannot submit a decision without actual inspection evidence`, async (t) => {
    const view = await actionsHarness(t, () => { throw new Error('must not write') }, {
      inspectionModal: { mode: 'pass', inspection: { id: 7, inspection_type } },
      decisionForm: { validateFields: async () => ({ result: 'PASS', defect_rate_selection: 'APPROX:0' }) },
    })
    await view.act(() => view.current.handleDecision())
    assert.equal(view.calls.length, 0)
    assert.equal(view.closed, 0)
  })
}

test('rejection without a reason stays open even with a failed check', async (t) => {
  const view = await actionsHarness(t, () => { throw new Error('must not write') }, {
    inspectionModal: { mode: 'reject', inspection: { id: 7, inspection_type: 'PRODUCTION_STAGE' } },
    decisionForm: { validateFields: async () => ({ defect_rate_selection: 'APPROX:5', check_items: [{ name: '针检', requirement: '无异物', observation: '检出异物', scope: 'FULL', result: 'FAIL' }] }) },
  })
  await view.act(() => view.current.handleDecision())
  assert.equal(view.calls.length, 0)
  assert.equal(view.closed, 0)
})
