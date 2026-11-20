import { OUTSOURCING_ORDER_SUBJECT_TYPES } from './sourceOrderLineValues.mjs'

export function salesOrderLineGroupKey(item) {
  return item?.product_id || undefined
}

export function purchaseMaterialLineGroupKey(item) {
  return item?.material_id && item?.unit_id
    ? `${item.material_id}:${item.unit_id}`
    : undefined
}

export function outsourcingOrderLineGroupKey(item) {
  if (![OUTSOURCING_ORDER_SUBJECT_TYPES.MATERIAL, OUTSOURCING_ORDER_SUBJECT_TYPES.PRODUCT].includes(item?.subject_type)) return undefined
  const subjectID = item?.subject_type === OUTSOURCING_ORDER_SUBJECT_TYPES.MATERIAL
    ? item?.material_id
    : item?.product_id
  return subjectID && item?.process_id
    ? `${item.subject_type}:${subjectID}:${item.process_id}`
    : undefined
}
