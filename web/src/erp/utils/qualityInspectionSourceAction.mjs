function positiveID(value) {
  const parsed = Number(value || 0)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

function requiredText(value, message) {
  const text = String(value || '').trim()
  if (!text) throw new Error(message)
  return text
}

function optionalText(value) {
  const text = String(value || '').trim()
  return text ? { note: text } : {}
}

function positiveQuantity(value) {
  const text = String(value ?? '')
    .replace(/,/gu, '')
    .trim()
  const parsed = Number(text)
  if (!text || !Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('退货数量必须大于 0')
  }
  return text
}

function requiredDateTime(value) {
  const text = String(value || '').trim()
  const date = new Date(text)
  if (!text || Number.isNaN(date.getTime())) {
    throw new Error('请选择退货时间')
  }
  return date.toISOString()
}

export const OUTSOURCING_RETURN_QUALITY_GATE_STATES = Object.freeze({
  ACCEPTED: 'ACCEPTED',
  PENDING: 'PENDING',
  REJECTED: 'REJECTED',
})

export function resolveOutsourcingReturnQualityGate(inspections = []) {
  const activeInspections = (Array.isArray(inspections) ? inspections : [])
    .filter(
      (inspection) =>
        String(inspection?.status || '').toUpperCase() !== 'CANCELLED'
    )

  if (activeInspections.length !== 1) {
    return {
      state: OUTSOURCING_RETURN_QUALITY_GATE_STATES.PENDING,
      label:
        activeInspections.length > 1 ? '质检状态待核对' : '待发起质检',
      inspection: null,
    }
  }

  const inspection = activeInspections[0]
  const status = String(inspection?.status || '').toUpperCase()
  const result = String(inspection?.result || '').toUpperCase()
  if (status === 'REJECTED' || result === 'REJECT') {
    return {
      state: OUTSOURCING_RETURN_QUALITY_GATE_STATES.REJECTED,
      label: '质检不合格',
      inspection,
    }
  }
  if (
    status === 'PASSED' &&
    (result === 'PASS' || result === 'CONCESSION')
  ) {
    return {
      state: OUTSOURCING_RETURN_QUALITY_GATE_STATES.ACCEPTED,
      label: result === 'CONCESSION' ? '让步接收' : '质检合格',
      inspection,
    }
  }

  const pendingLabels = {
    DRAFT: '质检草稿',
    SUBMITTED: '质检中',
  }
  return {
    state: OUTSOURCING_RETURN_QUALITY_GATE_STATES.PENDING,
    label: pendingLabels[status] || '质检结果待核对',
    inspection,
  }
}

export function isPostedOutsourcingReturn(fact) {
  return Boolean(
    positiveID(fact?.id) &&
      String(fact?.fact_type || '').toUpperCase() === 'RETURN_RECEIPT' &&
      String(fact?.status || '').toUpperCase() === 'POSTED'
  )
}

export function isRejectedIncomingInspection(inspection) {
  return Boolean(
    positiveID(inspection?.id) &&
      String(inspection?.status || '').toUpperCase() === 'REJECTED' &&
      String(inspection?.result || '').toUpperCase() === 'REJECT' &&
      String(inspection?.source_type || '').toUpperCase() ===
        'PURCHASE_RECEIPT' &&
      String(inspection?.inspection_type || '').toUpperCase() === 'INCOMING' &&
      positiveID(inspection?.purchase_receipt_id) &&
      positiveID(inspection?.purchase_receipt_item_id)
  )
}

export function buildOutsourcingReturnQualityInspectionPayload(
  values = {},
  fact = {},
  customerKey = ''
) {
  if (!isPostedOutsourcingReturn(fact)) {
    throw new Error('请选择已过账的委外回货记录')
  }
  return {
    ...(String(customerKey || '').trim()
      ? { customer_key: String(customerKey).trim() }
      : {}),
    fact_id: positiveID(fact.id),
    inspection_no: requiredText(values.inspection_no, '请填写质检单号'),
    ...optionalText(values.note),
  }
}

export function isMatchingOutsourcingReturnQualityInspection(inspection, fact) {
  return Boolean(
    positiveID(inspection?.id) &&
      positiveID(fact?.id) &&
      String(inspection?.source_type || '').toUpperCase() ===
        'OUTSOURCING_FACT' &&
      positiveID(inspection?.source_id) === positiveID(fact.id) &&
      String(inspection?.inspection_type || '').toUpperCase() ===
        'OUTSOURCING_RETURN' &&
      String(inspection?.subject_type || '').toUpperCase() === 'PRODUCT' &&
      String(inspection?.status || '').toUpperCase() === 'DRAFT'
  )
}

export function groupOutsourcingReturnQualityInspections(
  inspections = [],
  facts = []
) {
  const factIDs = new Set(
    (Array.isArray(facts) ? facts : [])
      .filter(isPostedOutsourcingReturn)
      .map((fact) => positiveID(fact.id))
  )
  return (Array.isArray(inspections) ? inspections : []).reduce(
    (grouped, inspection) => {
      const factID = positiveID(inspection?.source_id)
      if (
        !factIDs.has(factID) ||
        String(inspection?.source_type || '').toUpperCase() !==
          'OUTSOURCING_FACT'
      ) {
        return grouped
      }
      grouped[factID] = [...(grouped[factID] || []), inspection]
      return grouped
    },
    {}
  )
}

export function buildPurchaseReturnFromQualityInspectionPayload(
  values = {},
  inspection = {},
  customerKey = ''
) {
  if (!isRejectedIncomingInspection(inspection)) {
    throw new Error('请选择已判定不合格的来料质检单')
  }
  return {
    ...(String(customerKey || '').trim()
      ? { customer_key: String(customerKey).trim() }
      : {}),
    return_no: requiredText(values.return_no, '请填写退货单号'),
    quality_inspection_id: positiveID(inspection.id),
    quantity: positiveQuantity(values.quantity),
    returned_at: requiredDateTime(values.returned_at),
    reason: requiredText(values.reason, '请填写退货原因'),
    ...optionalText(values.note),
  }
}
