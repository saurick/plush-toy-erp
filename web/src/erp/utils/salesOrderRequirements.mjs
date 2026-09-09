import {
  addNumeric20Scale6Units,
  numeric20Scale6Units,
  numeric20Scale6TextFromUnits,
} from './numeric20Scale6.mjs'

export const SALES_ORDER_CATEGORY_OPTIONS = [
  { value: 'NEW', label: '新单' },
  { value: 'REPEAT', label: '返单' },
]

export const SALES_ORDER_ENGINEERING_OPTIONS = [
  { value: 'PREPARING', label: '工程准备' },
  { value: 'SAMPLING', label: '打样中' },
  { value: 'CONFIRMED', label: '样品已确认' },
]

export function salesOrderRequirementName(item = {}) {
  return (
    item.requested_product_name ||
    item.product_name_snapshot ||
    '需求名称待补充'
  )
}

export function salesOrderProductionQuantity(item = {}) {
  const ordered = numeric20Scale6Units(item.ordered_quantity)
  const samples = numeric20Scale6Units(item.pre_shipment_sample_quantity || '0')
  if (ordered === null || samples === null) return ''
  return numeric20Scale6TextFromUnits(addNumeric20Scale6Units(ordered, samples))
}

export function salesOrderEngineeringLabel(item = {}) {
  if (!Number(item.product_id)) return '待工程建档'
  return (
    SALES_ORDER_ENGINEERING_OPTIONS.find(
      (option) => option.value === item.engineering_status
    )?.label || '工程准备'
  )
}
