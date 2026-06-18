import assert from 'node:assert/strict'
import test from 'node:test'

import { ERP_MODAL_WIDTHS } from './modalSizes.mjs'

test('modalSizes: keep ERP modal width tiers explicit', () => {
  assert.equal(ERP_MODAL_WIDTHS.confirm, 480)
  assert.equal(
    ERP_MODAL_WIDTHS.masterDataForm,
    'min(880px, calc(100vw - 48px))'
  )
  assert.equal(ERP_MODAL_WIDTHS.businessForm, 'min(1720px, calc(100vw - 96px))')
  assert.equal(ERP_MODAL_WIDTHS.localAction, 'min(860px, calc(100vw - 96px))')
  assert.equal(ERP_MODAL_WIDTHS.columnOrder, 'min(960px, calc(100vw - 48px))')
})
