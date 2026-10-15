import assert from 'node:assert/strict'
import test from 'node:test'

import { isDraftSourceDocument } from './sourceDocumentEditing.mjs'

test('source documents freeze after draft submission', () => {
  assert.equal(isDraftSourceDocument({ lifecycle_status: 'draft' }), true)

  for (const lifecycleStatus of [
    'submitted',
    'approved',
    'confirmed',
    'closed',
    'canceled',
  ]) {
    assert.equal(
      isDraftSourceDocument({ lifecycle_status: lifecycleStatus }),
      false,
      `source document must be frozen in ${lifecycleStatus}`
    )
  }
})
