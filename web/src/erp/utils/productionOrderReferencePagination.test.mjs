import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PRODUCTION_ORDER_REFERENCE_PAGE_SIZE,
  createProductionOrderReferenceRequestGate,
  mergeProductionOrderReferenceOptions,
  nextProductionOrderReferencePage,
  selectedProductionOrderReferenceOptions,
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

test('reference reload retains only the selected label and accepts refreshed eligibility', () => {
  const selected = { value: 1001, label: '已选来源', selectable: true }
  const current = [...options(0, 50), selected]
  const retained = selectedProductionOrderReferenceOptions(
    current,
    selected.value
  )
  assert.deepEqual(retained, [selected])
  assert.equal(current.length, 51)

  const reloaded = mergeProductionOrderReferenceOptions(
    retained,
    options(0, 50)
  )
  assert.equal(
    reloaded.find((option) => option.value === selected.value),
    selected
  )

  const refreshed = {
    ...selected,
    label: '已选来源 · 可排产 0',
    selectable: false,
    reason: '订单数量已全部安排生产',
  }
  const updated = mergeProductionOrderReferenceOptions(retained, [refreshed])
  assert.equal(updated[0], refreshed)
  assert.equal(selected.selectable, true)

  assert.deepEqual(
    selectedProductionOrderReferenceOptions(current, undefined),
    []
  )
  assert.deepEqual(selectedProductionOrderReferenceOptions(current, 2), [
    current[1],
  ])
})

test('production order reference request gate rejects stale search pages', () => {
  const gate = createProductionOrderReferenceRequestGate()
  const firstSearch = gate.next()
  const secondSearch = gate.next()
  assert.equal(gate.isCurrent(firstSearch), false)
  assert.equal(gate.isCurrent(secondSearch), true)
})
