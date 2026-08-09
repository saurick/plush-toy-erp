import assert from 'node:assert/strict'
import test from 'node:test'

import { canonicalizeDevFlowStateSearchParams } from './devFlowStateQuery.mjs'

function canonicalize(query) {
  const result = canonicalizeDevFlowStateSearchParams(
    new URLSearchParams(query)
  )
  return {
    changed: result.changed,
    query: result.searchParams.toString(),
  }
}

test('dev flow state query removes a stale process selection from the chain overview', () => {
  assert.deepEqual(
    canonicalize(
      'view=chain&chain=all&process=production_exception_approval%2Fexception_decision_approval'
    ),
    {
      changed: true,
      query: 'view=chain&chain=all',
    }
  )
})

test('dev flow state query keeps the active selection and task while removing inactive selections', () => {
  assert.deepEqual(
    canonicalize(
      'view=states&flow=source.production_exception_decision&state=APPROVED&chain=production_exception&fact=fact.production&task_id=42'
    ),
    {
      changed: true,
      query:
        'view=states&flow=source.production_exception_decision&state=APPROVED&task_id=42',
    }
  )
})

test('dev flow state query removes a stale single-chain node from the overview', () => {
  assert.deepEqual(canonicalize('view=chain&chain=all&node=retired-node'), {
    changed: true,
    query: 'view=chain&chain=all',
  })
})

test('dev flow state query preserves unknown values for fail-closed validation', () => {
  assert.deepEqual(
    canonicalize('view=facts&fact=fact.retired&task_id=abc&extra=1'),
    {
      changed: false,
      query: 'view=facts&fact=fact.retired&task_id=abc&extra=1',
    }
  )
})

test('dev flow state query does not hide duplicate parameters', () => {
  assert.deepEqual(
    canonicalize('view=chain&view=facts&chain=all&process=retired'),
    {
      changed: false,
      query: 'view=chain&view=facts&chain=all&process=retired',
    }
  )
})
