import {
  isProductionStageQualityInspection,
  productionQualityGateLabel,
  qualityInspectionSubjectType,
  QUALITY_INSPECTION_TYPE_LABELS,
} from './qualityInspectionColumns.jsx'
import { positiveInt } from './QualityInspectionForms.jsx'
import { trimOptional } from '../../utils/sourceDocumentValues.mjs'
import {
  businessSubjectLabel,
  referenceLabel,
} from '../../utils/referenceSelectOptions.mjs'

export function findByPositiveID(id, records = []) {
  const targetID = positiveInt(id)
  if (!targetID) return null
  return (Array.isArray(records) ? records : []).find(
    (record) => Number(record?.id || record?.lot_id || 0) === targetID
  )
}

export function buildQualityInspectionDecisionSourceSummary({
  inspection,
  allPurchaseReceiptItemOptions,
  inventoryLotOptions,
  materialOptions,
  productOptions,
  purchaseReceiptOptions,
}) {
  const sourceType = String(inspection?.source_type || '').toUpperCase()
  const subjectType = qualityInspectionSubjectType(inspection)
  const inspectionType =
    QUALITY_INSPECTION_TYPE_LABELS[
      String(inspection?.inspection_type || '').toUpperCase()
    ] || '质量检验'
  const visibleWipText = (value) => String(value ?? '').trim() || '—'

  if (isProductionStageQualityInspection(inspection)) {
    return {
      sourceNo: visibleWipText(inspection?.production_order_no),
      primary: [
        `检验类型：${inspectionType}`,
        `质量关口：${productionQualityGateLabel(inspection?.gate_code)}`,
      ].join('；'),
      secondary: [
        `产品：${visibleWipText(inspection?.product_code)} / ${visibleWipText(
          inspection?.product_name
        )}`,
        `生产工序：${visibleWipText(inspection?.operation_name)}`,
        `在制批次：${visibleWipText(inspection?.wip_batch_no)}`,
        `批次数量：${visibleWipText(inspection?.batch_quantity)}`,
      ].join('；'),
    }
  }

  const recordedSourceNo = trimOptional(inspection?.source_no)
  let sourceNo = recordedSourceNo
  if (!sourceNo && sourceType === 'PURCHASE_RECEIPT') {
    sourceNo = referenceLabel(
      purchaseReceiptOptions,
      inspection?.purchase_receipt_id,
      '采购入库单'
    )
  }
  if (!sourceNo && sourceType === 'OUTSOURCING_FACT') {
    sourceNo = '委外回货单已关联'
  }
  if (!sourceNo && sourceType === 'SHIPMENT') {
    sourceNo = '出货单已关联'
  }

  const sourceLine =
    sourceType === 'PURCHASE_RECEIPT' && inspection?.purchase_receipt_item_id
      ? referenceLabel(
          allPurchaseReceiptItemOptions,
          inspection.purchase_receipt_item_id,
          '入库行'
        )
      : ''
  const subjectLabel = businessSubjectLabel(subjectType)
  const subject =
    subjectType === 'PRODUCT'
      ? referenceLabel(productOptions, inspection?.subject_id, subjectLabel, {
          emptyText: '',
        })
      : subjectType === 'MATERIAL'
        ? referenceLabel(
            materialOptions,
            inspection?.material_id || inspection?.subject_id,
            subjectLabel,
            { emptyText: '' }
          )
        : ''
  const lot = inspection?.inventory_lot_id
    ? referenceLabel(
        inventoryLotOptions,
        inspection.inventory_lot_id,
        '批次'
      )
    : ''

  return {
    sourceNo: sourceNo || '来源单据已关联',
    primary: [
      `检验类型：${inspectionType}`,
      sourceLine ? `来源行：${sourceLine}` : '',
    ]
      .filter(Boolean)
      .join('；'),
    secondary: [
      subject ? `${subjectLabel}：${subject}` : '',
      lot ? `批次：${lot}` : '',
    ]
      .filter(Boolean)
      .join('；'),
  }
}

export function buildPurchaseReturnSourceSummary({
  inspection,
  purchaseReceipts,
  purchaseReceiptItems,
  selectedRowPurchaseReceipt,
  materialOptions,
  warehouseOptions,
  inventoryLotOptions,
}) {
  const receipt =
    findByPositiveID(inspection?.purchase_receipt_id, purchaseReceipts) ||
    (positiveInt(selectedRowPurchaseReceipt?.id) ===
    positiveInt(inspection?.purchase_receipt_id)
      ? selectedRowPurchaseReceipt
      : null)
  const item =
    findByPositiveID(
      inspection?.purchase_receipt_item_id,
      purchaseReceiptItems
    ) ||
    findByPositiveID(
      inspection?.purchase_receipt_item_id,
      Array.isArray(receipt?.items) ? receipt.items : []
    )

  return {
    receipt: receipt?.receipt_no || '采购入库已关联',
    supplier: receipt?.supplier_name || '供应商已关联',
    material: referenceLabel(
      materialOptions,
      item?.material_id || inspection?.material_id,
      '材料'
    ),
    warehouse: referenceLabel(
      warehouseOptions,
      item?.warehouse_id || inspection?.warehouse_id,
      '仓库'
    ),
    lot: referenceLabel(
      inventoryLotOptions,
      item?.lot_id || inspection?.inventory_lot_id,
      '批次'
    ),
  }
}
