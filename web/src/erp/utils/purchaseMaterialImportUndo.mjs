import { businessFormSnapshot } from './businessFormSnapshot.mjs'

export function purchaseMaterialImportSnapshot(values = {}) {
  return businessFormSnapshot({ supplier_id: values.supplier_id, items: values.items })
}

export function createPurchaseMaterialImportUndo(before, applied) {
  return {
    items: structuredClone(before.items || []),
    appliedSnapshot: purchaseMaterialImportSnapshot(applied),
    invalidated: false,
  }
}

export function canUndoPurchaseMaterialImport(undo, current) {
  return Boolean(undo && !undo.invalidated &&
    undo.appliedSnapshot === purchaseMaterialImportSnapshot(current))
}
