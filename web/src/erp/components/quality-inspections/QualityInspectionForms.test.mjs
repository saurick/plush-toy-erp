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
