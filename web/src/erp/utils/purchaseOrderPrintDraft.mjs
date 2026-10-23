import { formatUnixDate } from './masterDataOrderView.mjs'
import {
  buildContractPartySnapshot,
  contractPartySnapshotFromPrintTemplateDefaults,
} from './sourcePartySnapshots.mjs'
import { derivePurchaseOrderItemAmount } from './sourceOrderAmounts.mjs'
import { trimOptional, compactParams } from './sourceDocumentValues.mjs'
import { normalizeMaterialPurchaseUnitText } from './materialPurchaseContractEditor.mjs'

function formatPrintDraftDate(value) {
  const text = trimOptional(value)
  const timestamp = Number(value || 0)
  if (Number.isFinite(timestamp) && timestamp > 0) {
    return formatUnixDate(value)
  }
  return text || undefined
}

function isCanceledBusinessLineStatus(value) {
  return ['canceled', 'cancelled'].includes(
    String(value ?? '')
      .trim()
      .toLowerCase()
  )
}

function buildMaterialPurchaseContractDraftFromPurchaseOrder(
  order = {},
  items = [],
  { printTemplateDefaults = {} } = {}
) {
  const supplierSnapshot =
    order?.supplier_snapshot && typeof order.supplier_snapshot === 'object'
      ? order.supplier_snapshot
      : {}
  const contractPartySnapshot = buildContractPartySnapshot(
    order?.contract_party_snapshot &&
      typeof order.contract_party_snapshot === 'object'
      ? order.contract_party_snapshot
      : {}
  )
  const lines = (Array.isArray(items) ? items : [])
    .filter((item) => !isCanceledBusinessLineStatus(item?.line_status))
    .map((item) => {
      return compactParams({
        contractNo: trimOptional(order.purchase_order_no),
        productOrderNo:
          trimOptional(item.product_order_no_snapshot) ||
          trimOptional(item.source_order_no_snapshot) ||
          trimOptional(item.source_order_no),
        productNo:
          trimOptional(item.product_no_snapshot) ||
          trimOptional(item.product_code_snapshot),
        productName: trimOptional(item.product_name_snapshot),
        materialName: trimOptional(item.material_name_snapshot),
        vendorCode: trimOptional(item.supplier_item_no_snapshot),
        spec: trimOptional(item.material_spec_snapshot),
        unit:
          normalizeMaterialPurchaseUnitText(item.unit_name_snapshot) ||
          undefined,
        unitPrice: trimOptional(item.unit_price),
        quantity: trimOptional(item.purchased_quantity),
        amount: derivePurchaseOrderItemAmount(item, {
          allowSnapshotFallback: true,
        }),
        remark: trimOptional(item.note) || trimOptional(item.color_snapshot),
      })
    })
  return compactParams({
    contractNo: trimOptional(order.purchase_order_no),
    currency: String(order.currency ?? '')
      .trim()
      .toUpperCase(),
    orderDateText: formatPrintDraftDate(order.purchase_date),
    returnDateText: formatPrintDraftDate(order.expected_arrival_date),
    signDateText: formatPrintDraftDate(order.purchase_date),
    supplierName:
      trimOptional(supplierSnapshot.name) ||
      trimOptional(supplierSnapshot.short_name),
    supplierContact: trimOptional(supplierSnapshot.contact_name),
    supplierPhone:
      trimOptional(supplierSnapshot.contact_phone) ||
      trimOptional(supplierSnapshot.contact_mobile),
    supplierAddress: trimOptional(supplierSnapshot.address),
    ...contractPartySnapshotFromPrintTemplateDefaults(
      printTemplateDefaults,
      'material-purchase-contract'
    ),
    ...contractPartySnapshot,
    lines,
  })
}

export { buildMaterialPurchaseContractDraftFromPurchaseOrder }
