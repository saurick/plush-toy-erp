import assert from 'node:assert/strict'
import test from 'node:test'
import { canUndoPurchaseMaterialImport, createPurchaseMaterialImportUndo } from './purchaseMaterialImportUndo.mjs'

const original = () => ({ supplier_id: 4, note: '原备注', items: [{ id: 21, material_id: 1, purchased_quantity: '2', unit_price: '5', note: '原行备注' }] })
const append = (before) => ({ ...before, items: [...before.items, { material_id: 1, purchased_quantity: '', unit_price: '', expected_arrival_date: '' }] })

test('material undo restores original rows including split lines without replacing unrelated order fields', () => {
  const before = original()
  const applied = append(before)
  const undo = createPurchaseMaterialImportUndo(before, applied)
  const current = { ...applied, note: '导入后备注', expected_arrival_date: '2026-11-02' }
  assert.equal(canUndoPurchaseMaterialImport(undo, current), true)
  const restored = { ...current, items: undo.items }
  assert.deepEqual(restored.items, before.items)
  assert.equal(restored.note, '导入后备注')
  assert.equal(restored.expected_arrival_date, '2026-11-02')
  before.items[0].note = '后来修改'
  assert.equal(undo.items[0].note, '原行备注')
})

test('supplier changes and related line edits cannot restore an old import batch', () => {
  const before = original()
  const applied = append(before)
  const undo = createPurchaseMaterialImportUndo(before, applied)
  assert.equal(canUndoPurchaseMaterialImport(undo, { ...applied, supplier_id: 9 }), false)
  for (const key of ['material_id', 'unit_id', 'unit_price', 'purchased_quantity', 'expected_arrival_date', 'note', 'material_name_snapshot']) {
    const items = applied.items.map((item, index) => index ? { ...item, [key]: 'changed' } : item)
    assert.equal(canUndoPurchaseMaterialImport(undo, { ...applied, items }), false, key)
  }
  assert.equal(canUndoPurchaseMaterialImport(undo, { ...applied, items: applied.items.slice(1) }), false)
  assert.equal(canUndoPurchaseMaterialImport({ ...undo, invalidated: true }, applied), false)
  assert.equal(canUndoPurchaseMaterialImport(null, applied), false)
})

test('the latest material import restores earlier imported rows and retains their intervening edits', () => {
  const first = append(original())
  first.items[1].purchased_quantity = '8'
  const second = append(first)
  const undo = createPurchaseMaterialImportUndo(first, second)
  assert.equal(canUndoPurchaseMaterialImport(undo, second), true)
  assert.deepEqual(undo.items, first.items)
  assert.equal(undo.items[1].purchased_quantity, '8')
})
