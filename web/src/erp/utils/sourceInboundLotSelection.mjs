export const SOURCE_INBOUND_LOT_SELECTION = Object.freeze({
  EXISTING: 'EXISTING',
  NEW: 'NEW',
})

function positiveID(value) {
  const parsed = Number(value || 0)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

function optionalLotNo(value) {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string') return ''
  return value.trim()
}

function invalidSelection(message) {
  const error = new Error(message)
  error.isInvalidResponse = true
  return error
}

export function sourceInboundLotSelectionForOptions(options = []) {
  return Array.isArray(options) && options.length > 0
    ? SOURCE_INBOUND_LOT_SELECTION.EXISTING
    : SOURCE_INBOUND_LOT_SELECTION.NEW
}

export function buildSourceInboundLotFields(
  values = {},
  {
    allowNew = true,
    existingRequiredMessage = '请选择已有批次',
    newRequiredMessage = '请填写新批次号',
    invalidMessage = '请选择已有批次或填写新批次号',
  } = {}
) {
  const selection = String(values.lot_selection || '')
    .trim()
    .toUpperCase()
  const lotID = positiveID(values.lot_id)
  const newLotNo = optionalLotNo(values.new_lot_no)
  if (lotID && newLotNo) throw new Error(invalidMessage)

  if (selection === SOURCE_INBOUND_LOT_SELECTION.EXISTING) {
    if (!lotID || newLotNo) throw new Error(existingRequiredMessage)
    return { lot_id: lotID }
  }
  if (selection === SOURCE_INBOUND_LOT_SELECTION.NEW && allowNew) {
    if (lotID || !newLotNo) throw new Error(newRequiredMessage)
    if ([...newLotNo].length > 64) {
      throw new Error('新批次号不能超过 64 个字符')
    }
    return { new_lot_no: newLotNo }
  }
  throw new Error(invalidMessage)
}

export function normalizeSourceInboundLotRequestFields(
  values = {},
  { allowNew = true, required = true } = {}
) {
  const lotID = positiveID(values.lot_id)
  const newLotNo = optionalLotNo(values.new_lot_no)
  if (lotID && newLotNo) throw invalidSelection('入库批次参数不能同时填写')
  if (lotID) return { lot_id: lotID }
  if (newLotNo) {
    if (!allowNew || [...newLotNo].length > 64) {
      throw invalidSelection('入库批次参数无效')
    }
    return { new_lot_no: newLotNo }
  }
  if (required) throw invalidSelection('入库批次参数缺失')
  return {}
}
