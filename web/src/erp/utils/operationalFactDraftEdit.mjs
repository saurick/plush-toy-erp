import {
  numeric20Scale6Units,
  normalizePositiveNumeric20Scale6,
} from './numeric20Scale6.mjs'
import {
  SOURCE_INBOUND_LOT_SELECTION,
  buildSourceInboundLotFields,
  normalizeSourceInboundLotRequestFields,
} from './sourceInboundLotSelection.mjs'

export const OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS = Object.freeze({
  PRODUCTION_MATERIAL_ISSUE: 'save_production_material_issue_draft',
  PRODUCTION_COMPLETION: 'save_production_completion_draft',
  PRODUCTION_REWORK_COMPLETION: 'save_production_rework_from_completion_draft',
  PRODUCTION_REWORK_INTAKE: 'save_production_rework_from_intake_draft',
  OUTSOURCING_MATERIAL_ISSUE: 'save_outsourcing_material_issue_draft',
  OUTSOURCING_RETURN_RECEIPT: 'save_outsourcing_return_receipt_draft',
})

const PRODUCTION_ACTIONS = new Set([
  OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_MATERIAL_ISSUE,
  OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_COMPLETION,
  OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_REWORK_COMPLETION,
  OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_REWORK_INTAKE,
])

const OUTSOURCING_ACTIONS = new Set([
  OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.OUTSOURCING_MATERIAL_ISSUE,
  OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.OUTSOURCING_RETURN_RECEIPT,
])

function invalidContract(message = '草稿内容不完整，请刷新后重新填写') {
  const error = new Error(message)
  error.isInvalidResponse = true
  return error
}

function positiveID(value) {
  const parsed = Number(value || 0)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

function requiredOccurredAt(value) {
  const date = new Date(String(value || '').trim())
  if (!Number.isFinite(date.getTime())) throw invalidContract('请选择业务时间')
  return date.toISOString()
}

function optionalText(value, maxLength = 255) {
  const text = String(value ?? '').trim()
  if (!text) return undefined
  if ([...text].length > maxLength) throw invalidContract()
  return text
}

function baseRequest(params = {}) {
  const id = positiveID(params.id)
  const expectedVersion = positiveID(params.expected_version)
  const quantity = normalizePositiveNumeric20Scale6(params.quantity)
  if (!id || !expectedVersion || !quantity) throw invalidContract()
  return {
    ...(optionalText(params.customer_key, 64)
      ? { customer_key: optionalText(params.customer_key, 64) }
      : {}),
    id,
    expected_version: expectedVersion,
    quantity,
    occurred_at: requiredOccurredAt(params.occurred_at),
  }
}

function requireAllowedKeys(params, keys) {
  if (
    !params ||
    typeof params !== 'object' ||
    Array.isArray(params) ||
    !Object.keys(params).every((key) => keys.has(key))
  ) {
    throw invalidContract()
  }
}

function isReworkAction(action) {
  return (
    action ===
      OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_REWORK_COMPLETION ||
    action === OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_REWORK_INTAKE
  )
}

function isInboundAction(action) {
  return (
    action === OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_COMPLETION ||
    action === OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.OUTSOURCING_RETURN_RECEIPT
  )
}

export function normalizeProductionFactDraftSaveRequest(action, params = {}) {
  if (!PRODUCTION_ACTIONS.has(action)) throw invalidContract()
  const rework = isReworkAction(action)
  const keys = rework
    ? new Set([
        'customer_key',
        'id',
        'expected_version',
        'fact_no',
        'quantity',
        'occurred_at',
        'reason',
      ])
    : new Set([
        'customer_key',
        'id',
        'expected_version',
        'warehouse_id',
        'lot_id',
        ...(isInboundAction(action) ? ['new_lot_no'] : []),
        'quantity',
        'occurred_at',
        'note',
      ])
  requireAllowedKeys(params, keys)
  const request = baseRequest(params)
  if (rework) {
    const factNo = optionalText(params.fact_no, 64)
    const reason = optionalText(params.reason, 255)
    if (!factNo || !reason) throw invalidContract()
    return { ...request, fact_no: factNo, reason }
  }
  const warehouseID = positiveID(params.warehouse_id)
  if (!warehouseID) throw invalidContract()
  let lotFields
  try {
    lotFields = normalizeSourceInboundLotRequestFields(params, {
      allowNew: isInboundAction(action),
    })
  } catch {
    throw invalidContract('请选择有效批次')
  }
  const note = optionalText(params.note)
  return {
    ...request,
    warehouse_id: warehouseID,
    ...lotFields,
    ...(note ? { note } : {}),
  }
}

export function normalizeOutsourcingFactDraftSaveRequest(action, params = {}) {
  if (!OUTSOURCING_ACTIONS.has(action)) throw invalidContract()
  return normalizeProductionFactDraftSaveRequest(
    action === OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.OUTSOURCING_MATERIAL_ISSUE
      ? OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_MATERIAL_ISSUE
      : OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_COMPLETION,
    params
  )
}

export function operationalFactDraftFormValues(record = {}) {
  const occurredAt = Number(record?.occurred_at || 0)
  const date = occurredAt > 0 ? new Date(occurredAt * 1000) : null
  const localOccurredAt =
    date && Number.isFinite(date.getTime())
      ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
          .toISOString()
          .slice(0, 16)
      : ''
  return {
    fact_no: String(record?.fact_no || ''),
    warehouse_id: positiveID(record?.warehouse_id) || undefined,
    lot_selection: SOURCE_INBOUND_LOT_SELECTION.EXISTING,
    lot_id: positiveID(record?.lot_id) || undefined,
    new_lot_no: '',
    quantity: normalizePositiveNumeric20Scale6(record?.quantity),
    occurred_at: localOccurredAt,
    note: String(record?.note || ''),
    reason: String(record?.note || ''),
  }
}

export function buildOperationalFactDraftSavePayload(
  action,
  values = {},
  record = {}
) {
  const rework = isReworkAction(action)
  const payload = {
    id: positiveID(record?.id),
    expected_version: positiveID(record?.version),
    quantity: values.quantity,
    occurred_at: requiredOccurredAt(values.occurred_at),
  }
  if (!payload.id || !payload.expected_version) throw invalidContract()
  if (rework) {
    return normalizeProductionFactDraftSaveRequest(action, {
      ...payload,
      fact_no: values.fact_no,
      reason: values.reason,
    })
  }
  const lotFields = buildSourceInboundLotFields(values, {
    allowNew: isInboundAction(action),
  })
  const request = {
    ...payload,
    warehouse_id: values.warehouse_id,
    ...lotFields,
    ...(String(values.note || '').trim()
      ? { note: String(values.note).trim() }
      : {}),
  }
  return PRODUCTION_ACTIONS.has(action)
    ? normalizeProductionFactDraftSaveRequest(action, request)
    : normalizeOutsourcingFactDraftSaveRequest(action, request)
}

export function validateOperationalFactDraftSaveResult(
  result,
  request = {},
  original = {},
  action = ''
) {
  const requestedLotID = positiveID(request.lot_id)
  const resultOccurredAt = Number(result?.occurred_at || 0)
  const requestOccurredAt = Math.floor(
    new Date(request.occurred_at).getTime() / 1000
  )
  const valid =
    positiveID(result?.id) === positiveID(original?.id) &&
    String(result?.status || '').toUpperCase() === 'DRAFT' &&
    positiveID(result?.version) === positiveID(request.expected_version) + 1 &&
    String(result?.fact_type || '').toUpperCase() ===
      String(original?.fact_type || '').toUpperCase() &&
    String(result?.source_type || '').toUpperCase() ===
      String(original?.source_type || '').toUpperCase() &&
    positiveID(result?.source_id) === positiveID(original?.source_id) &&
    positiveID(result?.source_line_id) ===
      positiveID(original?.source_line_id) &&
    String(result?.idempotency_key || '') ===
      String(original?.idempotency_key || '') &&
    numeric20Scale6Units(result?.quantity) ===
      numeric20Scale6Units(request?.quantity) &&
    resultOccurredAt === requestOccurredAt &&
    (isReworkAction(action)
      ? String(result?.fact_no || '') === String(request?.fact_no || '') &&
        String(result?.note || '') === String(request?.reason || '')
      : positiveID(result?.warehouse_id) ===
          positiveID(request?.warehouse_id) &&
        positiveID(result?.lot_id) > 0 &&
        (!requestedLotID || positiveID(result?.lot_id) === requestedLotID))
  if (!valid) throw invalidContract('草稿保存结果无法确认，请刷新后重试')
  return result
}

export function findOperationalFactDraftSaveResult(
  facts = [],
  request = {},
  original = {},
  action = ''
) {
  const matched = (Array.isArray(facts) ? facts : []).find(
    (fact) => positiveID(fact?.id) === positiveID(original?.id)
  )
  return matched
    ? validateOperationalFactDraftSaveResult(matched, request, original, action)
    : null
}
