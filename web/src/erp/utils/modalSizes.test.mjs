import assert from 'node:assert/strict'
import test from 'node:test'

import { ERP_MODAL_WIDTHS, resolveBusinessModalWidth } from './modalSizes.mjs'

test('modalSizes: keep ERP modal width tiers explicit', () => {
  assert.equal(ERP_MODAL_WIDTHS.confirm, 480)
  assert.equal(
    ERP_MODAL_WIDTHS.recordDetails,
    'min(1120px, calc(100vw - 32px))'
  )
  assert.equal(
    ERP_MODAL_WIDTHS.lineItems,
    'min(1800px, 94vw, calc(100vw - 32px))'
  )
  assert.equal(ERP_MODAL_WIDTHS.localAction, 'min(860px, calc(100vw - 32px))')
  assert.equal(ERP_MODAL_WIDTHS.columnOrder, 'min(960px, calc(100vw - 32px))')
})

test('business modals default to a local form and select a named size', () => {
  assert.equal(resolveBusinessModalWidth(), ERP_MODAL_WIDTHS.localAction)
  for (const [size, width] of Object.entries(ERP_MODAL_WIDTHS)) {
    assert.equal(resolveBusinessModalWidth(size), width)
  }
  assert.throws(() => resolveBusinessModalWidth('unknown'), RangeError)
})

test('full-screen mobile summaries can override the desktop width', () => {
  assert.equal(resolveBusinessModalWidth('lineItems', '100%'), '100%')
  assert.equal(
    resolveBusinessModalWidth('lineItems', undefined),
    ERP_MODAL_WIDTHS.lineItems
  )
})
