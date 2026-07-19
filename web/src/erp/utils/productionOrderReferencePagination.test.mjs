import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PRODUCTION_ORDER_REFERENCE_PAGE_SIZE,
  createProductionOrderReferenceRequestGate,
  mergeProductionOrderReferenceOptions,
  nextProductionOrderReferencePage,
} from './productionOrderReferencePagination.mjs'

function options(offset, count) {
  return Array.from({ length: count }, (_, index) => ({
    value: offset + index + 1,
    label: `选项 ${offset + index + 1}`,
    selectable: true,
  }))
}

test('production order reference pagination covers 51 and 101 row boundaries', () => {
  assert.equal(PRODUCTION_ORDER_REFERENCE_PAGE_SIZE, 50)
  assert.equal(
    nextProductionOrderReferencePage({ offset: 0, total: 51, options: options(0, 50) }),
    50
  )
  assert.equal(
    nextProductionOrderReferencePage({ offset: 50, total: 51, options: options(50, 1) }),
    null
  )
  assert.equal(
    nextProductionOrderReferencePage({ offset: 50, total: 101, options: options(50, 50) }),
    100
  )
  assert.equal(
    nextProductionOrderReferencePage({ offset: 100, total: 101, options: options(100, 1) }),
    null
  )
})

test('production order reference pages deduplicate while preserving selected history', () => {
  const selected = { value: 1001, label: '历史选项', selectable: false }
  const merged = mergeProductionOrderReferenceOptions(
    [selected],
    options(0, 50),
    [options(49, 2)[0], ...options(50, 50)]
  )
  assert.equal(merged.length, 101)
  assert.equal(
    merged.find((option) => option.value === selected.value)?.label,
    '历史选项'
  )
})

test('production order reference request gate rejects stale search pages', () => {
  const gate = createProductionOrderReferenceRequestGate()
  const firstSearch = gate.next()
  const secondSearch = gate.next()
  assert.equal(gate.isCurrent(firstSearch), false)
  assert.equal(gate.isCurrent(secondSearch), true)
})
