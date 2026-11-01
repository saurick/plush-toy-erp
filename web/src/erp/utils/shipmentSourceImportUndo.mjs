import { businessFormSnapshot } from './businessFormSnapshot.mjs'
import { deliverySnapshotFormValues } from './sourcePartySnapshots.mjs'

// 运费随来源币种解释，人工总净重随整组明细解释；两者参与撤销保护。
const IMPORT_FIELDS = Object.freeze([
  'sales_order_id',
  'customer_id',
  'customer_snapshot',
  ...Object.keys(deliverySnapshotFormValues()),
  'items',
  'freight_amount',
  'total_net_weight_g',
  'total_net_weight_items_signature',
])

function importValues(values = {}) {
  return Object.fromEntries(IMPORT_FIELDS.map((key) => [key, values[key]]))
}

export function shipmentSourceImportSnapshot(values) {
  return businessFormSnapshot(importValues(values))
}

export function createShipmentSourceImportUndo(before, applied) {
  return {
    values: structuredClone(importValues(before)),
    appliedSnapshot: shipmentSourceImportSnapshot(applied),
    invalidated: false,
  }
}

export function canUndoShipmentSourceImport(undo, current) {
  return Boolean(undo && !undo.invalidated &&
    shipmentSourceImportSnapshot(current) === undo.appliedSnapshot)
}
