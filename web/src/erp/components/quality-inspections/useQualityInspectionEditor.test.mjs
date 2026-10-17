import { createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

async function editorHarness(t, initial = {}) {
  const view = await createReactTestHarness(t)
  const [{ Form }, { default: useQualityInspectionEditor }] = await Promise.all(
    [import('antd'), import('./useQualityInspectionEditor.js')]
  )
  let current
  function Consumer(props) {
    current = useQualityInspectionEditor(props)
    return createElement(
      'div',
      null,
      createElement(Form, { form: current.inspectionForm }),
      createElement(Form, { form: current.decisionForm })
    )
  }
  const props = { rows: [], referenceDataState: 'ready', ...initial }
  const render = async (next = {}) => {
    Object.assign(props, next)
    await view.render(createElement(Consumer, props))
    await view.flush()
  }
  await render()
  return {
    ...view,
    render,
    get current() {
      return current
    },
  }
}

test('refreshing list rows preserves the open draft, while source switching clears its old line', async (t) => {
  const view = await editorHarness(t)
  await view.act(() => view.current.openCreate())
  await view.act(() =>
    view.current.inspectionForm.setFieldsValue({
      inspection_no: 'QI-EDITING',
      purchase_receipt_id: 7,
      purchase_receipt_item_id: 8,
      decision_note: 'operator input',
    })
  )
  await view.render({ rows: [{ inspection_no: 'QI-999' }] })
  assert.equal(
    view.current.inspectionForm.getFieldValue('inspection_no'),
    'QI-EDITING'
  )
  assert.equal(
    view.current.inspectionForm.getFieldValue('decision_note'),
    'operator input'
  )
  await view.act(() => view.current.handleReceiptChange())
  assert.equal(
    view.current.inspectionForm.getFieldValue('purchase_receipt_id'),
    7
  )
  assert.equal(
    view.current.inspectionForm.getFieldValue('purchase_receipt_item_id'),
    undefined
  )
  await view.act(() => view.current.closeModal())
  await view.act(() => view.current.openCreate())
  const values = view.current.inspectionForm.getFieldsValue(true)
  assert.notEqual(values.inspection_no, 'QI-EDITING')
  assert.equal(values.purchase_receipt_id, undefined)
  assert.equal(values.purchase_receipt_item_id, undefined)
  assert.equal(values.decision_note, '')
})

test('decision modes and source changes discard previous result and evidence values', async (t) => {
  const view = await editorHarness(t)
  await view.act(() =>
    view.current.openDecision('pass', { id: 7, purchase_receipt_item_id: 8 })
  )
  assert.equal(view.current.decisionForm.getFieldValue('result'), 'PASS')
  assert.ok(view.current.decisionForm.getFieldValue('check_items').length > 0)
  await view.act(() =>
    view.current.decisionForm.setFieldsValue({
      defect_rate_selection: 'APPROX:10',
      defect_rate_custom_percent: 10,
      decision_note: 'old decision',
    })
  )
  await view.act(() => view.current.openDecision('reject', { id: 9 }))
  let values = view.current.decisionForm.getFieldsValue(true)
  assert.equal(values.result, undefined)
  assert.equal(values.defect_rate_selection, undefined)
  assert.equal(values.defect_rate_custom_percent, undefined)
  assert.equal(values.check_items, undefined)
  assert.equal(values.decision_note, '')
  await view.act(() => view.current.openDecision('cancel', { id: 9 }))
  values = view.current.decisionForm.getFieldsValue(true)
  assert.equal(values.inspected_at, undefined)
  assert.equal(values.result, undefined)
  assert.equal(values.check_items, undefined)
})

test('unavailable reference data cannot open a create editor', async (t) => {
  const view = await editorHarness(t, { referenceDataState: 'loading' })
  await view.act(() => view.current.openCreate())
  assert.equal(view.current.inspectionModal, null)
  await view.render({ referenceDataState: 'error' })
  await view.act(() => view.current.openCreate())
  assert.equal(view.current.inspectionModal, null)
})
