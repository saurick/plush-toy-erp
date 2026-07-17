export const BOM_PRODUCTION_OPERATION_CODE = Object.freeze({
  FABRIC_PROCESSING: 'FABRIC_PROCESSING',
})

export const BOM_PRODUCTION_OPERATION_OPTIONS = Object.freeze([
  Object.freeze({
    value: BOM_PRODUCTION_OPERATION_CODE.FABRIC_PROCESSING,
    label: '布料加工',
  }),
])

export function normalizeBOMProductionOperationCode(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
  if (!normalized) return undefined
  if (normalized !== BOM_PRODUCTION_OPERATION_CODE.FABRIC_PROCESSING) {
    throw new Error('生产工序归属不完整，请重新选择')
  }
  return normalized
}

export function bomProductionOperationLabel(value) {
  if (value == null || String(value).trim() === '') return '不指定'
  try {
    return normalizeBOMProductionOperationCode(value) ===
      BOM_PRODUCTION_OPERATION_CODE.FABRIC_PROCESSING
      ? '布料加工'
      : '不指定'
  } catch {
    return '归属待核对'
  }
}
