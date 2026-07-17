import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./QualityInspectionForms.jsx', import.meta.url),
  'utf8'
)

test('incoming quality creation only submits the selected purchase source and business note', () => {
  const createBuilder = source.slice(
    source.indexOf('export function buildInspectionParams'),
    source.indexOf('export function buildDecisionParams')
  )
  for (const field of [
    'inspection_no',
    'purchase_receipt_id',
    'purchase_receipt_item_id',
    'decision_note',
  ]) {
    assert.match(createBuilder, new RegExp(field, 'u'))
  }
  for (const derivedField of [
    'inventory_lot_id',
    'material_id',
    'warehouse_id',
    'inspector_id',
  ]) {
    assert.doesNotMatch(createBuilder, new RegExp(derivedField, 'u'))
  }
})

test('incoming quality creation does not expose server-derived grain as editable fields', () => {
  const createForm = source.slice(
    source.indexOf('export function QualityInspectionCreateForm'),
    source.indexOf('export function QualityInspectionDecisionForm')
  )
  for (const field of [
    'inspection_no',
    'purchase_receipt_id',
    'purchase_receipt_item_id',
    'decision_note',
  ]) {
    assert.match(createForm, new RegExp(`name="${field}"`, 'u'))
  }
  for (const derivedField of [
    'inventory_lot_id',
    'material_id',
    'warehouse_id',
    'source_type',
    'source_id',
  ]) {
    assert.doesNotMatch(createForm, new RegExp(`name="${derivedField}"`, 'u'))
  }
})

test('quality decision submits an explicit defect-rate contract while cancellation can omit it', () => {
  const decisionBuilder = source.slice(
    source.indexOf('export function buildDecisionParams'),
    source.indexOf('export function QualityInspectionCreateForm')
  )
  assert.match(decisionBuilder, /buildQualityDefectRateParams/u)
  assert.match(decisionBuilder, /defect_rate_selection/u)
  assert.match(decisionBuilder, /defect_rate_custom_percent/u)
  assert.match(decisionBuilder, /decisionResult\s*\?/u)

  const createBuilder = source.slice(
    source.indexOf('export function buildInspectionParams'),
    source.indexOf('export function buildDecisionParams')
  )
  assert.doesNotMatch(createBuilder, /defect_rate_/u)
})

test('quality decision form offers accessible presets and clears stale custom input', () => {
  const decisionForm = source.slice(
    source.indexOf('export function QualityInspectionDecisionForm')
  )
  assert.match(decisionForm, /<Radio\.Group/u)
  assert.match(decisionForm, /aria-label="估算不良比例"/u)
  assert.match(decisionForm, /QUALITY_DEFECT_RATE_PRESETS/u)
  assert.match(decisionForm, /QUALITY_DEFECT_RATE_CUSTOM_SELECTION/u)
  assert.match(
    decisionForm,
    /setFieldValue\('defect_rate_custom_percent', undefined\)/u
  )
  assert.match(decisionForm, /stringMode/u)
  assert.match(decisionForm, /max=\{100\}/u)
  assert.match(decisionForm, /precision=\{2\}/u)
  assert.match(decisionForm, /不需要逐件计数/u)
  assert.match(decisionForm, /不会自动换算成退货数量/u)
  assert.match(decisionForm, /allowConcession = true/u)
  assert.match(decisionForm, /STRICT_RESULT_DECISION_OPTIONS/u)
  assert.match(decisionForm, /allowConcession\s*\?/u)
})
