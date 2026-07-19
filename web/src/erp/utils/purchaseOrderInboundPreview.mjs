import {
  addNumeric20Scale6Units,
  isPositiveNumeric20Scale6Units,
  numeric20Scale6TextFromUnits,
  numeric20Scale6Units,
  subtractNumeric20Scale6Units,
} from './numeric20Scale6.mjs'

function referenceName(options, id, fallbackLabel = '记录') {
  const option = (Array.isArray(options) ? options : []).find(
    (item) => String(item.value) === String(id)
  )
  return option?.label || (id ? `${fallbackLabel}已关联` : '-')
}

export function buildPurchaseInboundDraftPreviewRows({
  orderItems = [],
  receipts = [],
  materialOptions = [],
  unitOptions = [],
}) {
  const receivedByOrderItemID = new Map()
  receipts
    .filter((receipt) => String(receipt?.status || '') !== 'CANCELLED')
    .forEach((receipt) => {
      const receiptItems = receipt?.items || []
      receiptItems.forEach((item) => {
        const sourceItemID = Number(item?.purchase_order_item_id || 0)
        if (!sourceItemID) return
        const current = receivedByOrderItemID.get(sourceItemID) || '0'
        receivedByOrderItemID.set(
          sourceItemID,
          addNumeric20Scale6Units(
            current,
            numeric20Scale6Units(item?.quantity) || '0'
          )
        )
      })
    })

  return orderItems
    .filter((item) => String(item?.line_status || 'open') === 'open')
    .map((item) => {
      const purchasedUnits =
        numeric20Scale6Units(item?.purchased_quantity) || '0'
      const receivedUnits =
        receivedByOrderItemID.get(Number(item?.id)) || '0'
      const remainingUnits = subtractNumeric20Scale6Units(
        purchasedUnits,
        receivedUnits
      )
      return {
        key: item.id || item.line_no,
        lineNo: item.line_no,
        material: referenceName(materialOptions, item.material_id, '材料'),
        unit: referenceName(unitOptions, item.unit_id, '单位'),
        purchasedQuantity: numeric20Scale6TextFromUnits(purchasedUnits),
        receivedQuantity: numeric20Scale6TextFromUnits(receivedUnits),
        remainingQuantity: numeric20Scale6TextFromUnits(remainingUnits),
        disabledReason: isPositiveNumeric20Scale6Units(remainingUnits)
          ? ''
          : '已全部生成入库',
      }
    })
}
