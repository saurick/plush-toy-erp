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

test('production order sales source includes draft planning context and preserves exhausted choices', () => {
  assert.match(source, /production_order_id: filters\.production_order_id/u)
  assert.match(source, /filters\.production_order_id,\s*\]/u)
  assert.match(source, /disabled: option\.selectable === false/u)
  assert.match(source, /title: option\.reason \|\| option\.label/u)
  assert.match(source, /virtual=\{salesReference \? false : undefined\}/u)
  assert.match(source, /min\(520px, calc\(100vw - 24px\)\)/u)
  assert.match(source, /whiteSpace: 'normal', overflowWrap: 'anywhere'/u)
  assert.match(source, /shiftX: true/u)
  assert.doesNotMatch(source, /\.filter\([^\n]*selectable/u)
})

test('production order reference control retains the form field label association', () => {
  assert.match(source, /ProductionOrderReferenceSelect\(\{\s*id,/u)
  assert.match(source, /<Select\s*id=\{id\}/u)
})
