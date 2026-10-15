import assert from 'node:assert/strict'
import test from 'node:test'

import { hasRequiredOperationalFactDraftSource } from './operationalFactDraftSource.mjs'

test('production drafts require their exact source coordinate shape', () => {
  for (const fact of [
    {
      fact_type: 'MATERIAL_ISSUE',
      source_type: 'PRODUCTION_ORDER',
      source_id: 11,
      source_line_id: 12,
    },
    {
      fact_type: 'FINISHED_GOODS_RECEIPT',
      source_type: 'production_order',
      source_id: '11',
      source_line_id: '12',
    },
    {
      fact_type: 'REWORK',
      source_type: 'PRODUCTION_FACT',
      source_id: 21,
      source_line_id: 12,
    },
  ]) {
    assert.equal(hasRequiredOperationalFactDraftSource('production', fact), true)
  }
  for (const fact of [
    {},
    { fact_type: 'MATERIAL_ISSUE', source_type: 'MANUAL', source_id: 11, source_line_id: 12 },
    { fact_type: 'REWORK', source_type: 'PRODUCTION_FACT', source_id: 21 },
    { fact_type: 'OTHER', source_type: 'PRODUCTION_ORDER', source_id: 11, source_line_id: 12 },
  ]) {
    assert.equal(hasRequiredOperationalFactDraftSource('production', fact), false)
  }
})

test('outsourcing drafts require an outsourcing order and line', () => {
  for (const factType of ['MATERIAL_ISSUE', 'RETURN_RECEIPT']) {
    assert.equal(
      hasRequiredOperationalFactDraftSource('outsourcing', {
        fact_type: factType,
        source_type: 'OUTSOURCING_ORDER',
        source_id: 31,
        source_line_id: 32,
      }),
      true
    )
  }
  assert.equal(
    hasRequiredOperationalFactDraftSource('outsourcing', {
      fact_type: 'RETURN_RECEIPT',
      source_type: 'OUTSOURCING_ORDER',
      source_id: 31,
    }),
    false
  )
  assert.equal(hasRequiredOperationalFactDraftSource('finance', {}), false)
})
