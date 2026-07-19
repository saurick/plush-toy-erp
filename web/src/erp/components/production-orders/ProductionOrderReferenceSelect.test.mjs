import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./ProductionOrderReferenceSelect.jsx', import.meta.url),
  'utf8'
)

test('production order reference select uses complete server pagination', () => {
  assert.match(source, /PRODUCTION_ORDER_REFERENCE_PAGE_SIZE/u)
  assert.match(source, /nextProductionOrderReferencePage\(data\)/u)
  assert.match(source, /onPopupScroll=\{handlePopupScroll\}/u)
  assert.match(source, /mergeProductionOrderReferenceOptions\(/u)
  assert.doesNotMatch(source, /limit:\s*20/u)
})

test('production order reference select invalidates stale search and filter pages', () => {
  assert.match(source, /createProductionOrderReferenceRequestGate\(\)/u)
  assert.match(source, /requestGateRef\.current\.isCurrent\(generation\)/u)
  assert.match(source, /controllerRef\.current\?\.abort\(\)/u)
  assert.match(source, /\{ signal: controller\.signal \}/u)
  assert.match(source, /setOptions\(\[\]\)/u)
  assert.match(source, /initialOptions,\s*options/u)
})
