import assert from 'node:assert/strict'
import test from 'node:test'

import { suggestNextBOMVersion } from './bomVersionSuggestion.mjs'

test('bomVersionSuggestion: starts with V1 after product is selected', () => {
  assert.equal(suggestNextBOMVersion([], 7), 'V1')
})

test('bomVersionSuggestion: increments existing V-series for the same product', () => {
  assert.equal(
    suggestNextBOMVersion(
      [
        { product_id: 7, version: 'V1' },
        { product_id: 7, version: 'v2' },
        { product_id: 8, version: 'V9' },
      ],
      7
    ),
    'V3'
  )
})

test('bomVersionSuggestion: avoids duplicate V labels even with custom labels', () => {
  assert.equal(
    suggestNextBOMVersion(
      [
        { product_id: 7, version: '打样版A' },
        { product_id: 7, version: 'V1' },
      ],
      7
    ),
    'V2'
  )
})

test('bomVersionSuggestion: does not suggest before product truth is selected', () => {
  assert.equal(suggestNextBOMVersion([{ product_id: 7, version: 'V1' }]), '')
})
