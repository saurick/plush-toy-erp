const MAX_FACT_NO_LENGTH = 64
const MAX_NOTE_LENGTH = 255

export const FINANCE_BUSINESS_SOURCE_ACTIONS = Object.freeze({
  PURCHASE_RECEIPT_PAYABLE: 'purchase-receipt-payable',
  OUTSOURCING_RETURN_PAYABLE: 'outsourcing-return-payable',
  SINGLE_FACT_RECONCILIATION: 'single-fact-reconciliation',
})

const ACTION_CONFIGS = Object.freeze({
  [FINANCE_BUSINESS_SOURCE_ACTIONS.PURCHASE_RECEIPT_PAYABLE]: Object.freeze({
    key: FINANCE_BUSINESS_SOURCE_ACTIONS.PURCHASE_RECEIPT_PAYABLE,
    title: '从采购入库生成应付',
    okText: '生成应付草稿',
    factType: 'PAYABLE',
    sourceType: 'PURCHASE_RECEIPT',
    sourceIDKey: 'purchase_receipt_id',
    factNoPrefix: 'AP',
    successMessage: '应付草稿已生成，请到应付管理核对并确认',
  }),
  [FINANCE_BUSINESS_SOURCE_ACTIONS.OUTSOURCING_RETURN_PAYABLE]: Object.freeze({
    key: FINANCE_BUSINESS_SOURCE_ACTIONS.OUTSOURCING_RETURN_PAYABLE,
    title: '从委外回货生成应付',
    okText: '生成应付草稿',
    factType: 'PAYABLE',
    sourceType: 'OUTSOURCING_FACT',
    sourceIDKey: 'outsourcing_fact_id',
    factNoPrefix: 'AP',
    successMessage: '应付草稿已生成，请到应付管理核对并确认',
  }),
  [FINANCE_BUSINESS_SOURCE_ACTIONS.SINGLE_FACT_RECONCILIATION]: Object.freeze({
    key: FINANCE_BUSINESS_SOURCE_ACTIONS.SINGLE_FACT_RECONCILIATION,
    title: '登记单笔核对',
    okText: '生成核对草稿',
    factType: 'RECONCILIATION',
    sourceType: 'FINANCE_FACT',
    sourceIDKey: 'finance_fact_id',
    factNoPrefix: 'REC',
    successMessage: '单笔核对草稿已生成，请到对账管理核对并确认',
  }),
})

const RECONCILIATION_SOURCE_TYPES = new Set([
  'RECEIVABLE',
  'PAYABLE',
  'INVOICE',
])

const FINANCE_TRANSITION_SOURCE_TYPES = Object.freeze({
  RECEIVABLE: new Set(['SHIPMENT']),
  PAYABLE: new Set(['PURCHASE_RECEIPT', 'OUTSOURCING_FACT']),
  INVOICE: new Set(['SHIPMENT']),
  RECONCILIATION: new Set(['FINANCE_FACT']),
})

function normalizedText(value) {
  return String(value ?? '').trim()
}

function normalizedUpperText(value) {
  return normalizedText(value).toUpperCase()
}

function positiveID(value) {
  const parsed = Number(value || 0)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

export function hasValidFinanceTransitionSource(fact = {}) {
  const record = fact && typeof fact === 'object' ? fact : {}
  const sourceTypes =
    FINANCE_TRANSITION_SOURCE_TYPES[normalizedUpperText(record.fact_type)]
  return Boolean(
    sourceTypes?.has(normalizedUpperText(record.source_type)) &&
      positiveID(record.source_id)
  )
}

function boundedFactNo(value) {
  const factNo = normalizedText(value)
  if (!factNo) throw new Error('请填写业务编号')
  if ([...factNo].length > MAX_FACT_NO_LENGTH) {
    throw new Error(`业务编号不能超过 ${MAX_FACT_NO_LENGTH} 个字符`)
  }
  return factNo
}

function optionalOccurredAt(value) {
  const text = normalizedText(value)
  if (!text) return undefined
  const parsed = new Date(text)
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error('发生时间无效，请重新选择')
  }
  return parsed.toISOString()
}

function optionalNote(value) {
  const note = normalizedText(value)
  if ([...note].length > MAX_NOTE_LENGTH) {
    throw new Error(`备注不能超过 ${MAX_NOTE_LENGTH} 个字符`)
  }
  return note || undefined
}

function operatorFields(values = {}) {
  const factNo = boundedFactNo(values.fact_no)
  const occurredAt = optionalOccurredAt(values.occurred_at)
  const note = optionalNote(values.note)
  return {
    fact_no: factNo,
    ...(occurredAt ? { occurred_at: occurredAt } : {}),
    ...(note ? { note } : {}),
  }
}

export function financeBusinessSourceActionConfig(action) {
  const config = ACTION_CONFIGS[normalizedText(action)]
  if (!config) throw new Error('请选择财务来源操作')
  return config
}

export function localFinanceDateTimeInputValue(now = new Date()) {
  const timestamp = now instanceof Date ? now.getTime() : Number.NaN
  if (!Number.isFinite(timestamp)) return ''
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(timestamp - offset).toISOString().slice(0, 16)
}

function sourceBusinessNo(action, source = {}) {
  const record = source && typeof source === 'object' ? source : {}
  if (action === FINANCE_BUSINESS_SOURCE_ACTIONS.PURCHASE_RECEIPT_PAYABLE) {
    return normalizedText(record.receipt_no)
  }
  return normalizedText(record.fact_no)
}

export function suggestedFinanceBusinessNo(action, source = {}) {
  const config = financeBusinessSourceActionConfig(action)
  const sourceNo = sourceBusinessNo(action, source)
  if (!sourceNo) return ''
  const normalizedSourceNo = sourceNo.replace(/\s+/gu, '-')
  return `${config.factNoPrefix}-${normalizedSourceNo}`.slice(
    0,
    MAX_FACT_NO_LENGTH
  )
}

export function buildPurchaseReceiptPayablePayload(values = {}, receipt = {}) {
  const record = receipt && typeof receipt === 'object' ? receipt : {}
  if (normalizedUpperText(record.status) !== 'POSTED') {
    throw new Error('仅已过账的采购入库可以生成应付')
  }
  const receiptID = positiveID(record.id)
  if (!receiptID || !normalizedText(record.receipt_no)) {
    throw new Error('采购入库信息不完整，请刷新后重试')
  }
  return {
    ...operatorFields(values),
    purchase_receipt_id: receiptID,
  }
}

export function isOutsourcingReturnPayableSource(fact = {}) {
  const record = fact && typeof fact === 'object' ? fact : {}
  return (
    normalizedUpperText(record.status) === 'POSTED' &&
    normalizedUpperText(record.fact_type) === 'RETURN_RECEIPT' &&
    positiveID(record.id) > 0
  )
}

export function buildOutsourcingReturnPayablePayload(values = {}, fact = {}) {
  if (!isOutsourcingReturnPayableSource(fact)) {
    throw new Error('仅已过账的委外回货可以生成应付')
  }
  const factID = positiveID(fact.id)
  if (!factID || !normalizedText(fact.fact_no)) {
    throw new Error('委外回货信息不完整，请刷新后重试')
  }
  return {
    ...operatorFields(values),
    outsourcing_fact_id: factID,
  }
}

export function isSingleFactReconciliationSource(fact = {}) {
  const record = fact && typeof fact === 'object' ? fact : {}
  return (
    normalizedUpperText(record.status) === 'POSTED' &&
    RECONCILIATION_SOURCE_TYPES.has(normalizedUpperText(record.fact_type)) &&
    positiveID(record.id) > 0
  )
}

export function buildSingleFactReconciliationPayload(values = {}, fact = {}) {
  if (!isSingleFactReconciliationSource(fact)) {
    throw new Error('仅已确认的应收、应付或发票记录可以登记单笔核对')
  }
  const factID = positiveID(fact.id)
  if (!factID || !normalizedText(fact.fact_no)) {
    throw new Error('财务记录信息不完整，请刷新后重试')
  }
  return {
    ...operatorFields(values),
    finance_fact_id: factID,
  }
}

export function buildFinanceBusinessSourcePayload(
  action,
  values = {},
  source = {}
) {
  switch (action) {
    case FINANCE_BUSINESS_SOURCE_ACTIONS.PURCHASE_RECEIPT_PAYABLE:
      return buildPurchaseReceiptPayablePayload(values, source)
    case FINANCE_BUSINESS_SOURCE_ACTIONS.OUTSOURCING_RETURN_PAYABLE:
      return buildOutsourcingReturnPayablePayload(values, source)
    case FINANCE_BUSINESS_SOURCE_ACTIONS.SINGLE_FACT_RECONCILIATION:
      return buildSingleFactReconciliationPayload(values, source)
    default:
      throw new Error('请选择财务来源操作')
  }
}

function strictRequest(params, sourceIDKey) {
  const sourceID = positiveID(params?.[sourceIDKey])
  const idempotencyKey = normalizedText(params?.idempotency_key)
  if (!sourceID || !idempotencyKey || [...idempotencyKey].length > 128) {
    throw new Error('财务处理内容有误，请刷新页面后重新填写')
  }
  const customerKey = normalizedText(params?.customer_key)
  return {
    ...(customerKey ? { customer_key: customerKey } : {}),
    ...operatorFields(params),
    [sourceIDKey]: sourceID,
    idempotency_key: idempotencyKey,
  }
}

export function normalizePurchaseReceiptPayableRequest(params = {}) {
  return strictRequest(params, 'purchase_receipt_id')
}

export function normalizeOutsourcingReturnPayableRequest(params = {}) {
  return strictRequest(params, 'outsourcing_fact_id')
}

export function normalizeSingleFactReconciliationRequest(params = {}) {
  return strictRequest(params, 'finance_fact_id')
}

export function validateFinanceBusinessSourceResult(
  result,
  request,
  { factType, sourceType, sourceIDKey }
) {
  const expectedSourceID = positiveID(request?.[sourceIDKey])
  const valid =
    positiveID(result?.id) > 0 &&
    normalizedUpperText(result?.status) === 'DRAFT' &&
    normalizedUpperText(result?.fact_type) === factType &&
    normalizedUpperText(result?.source_type) === sourceType &&
    positiveID(result?.source_id) === expectedSourceID
  if (!valid) {
    const error = new Error('财务记录返回结果无法确认')
    error.isInvalidResponse = true
    throw error
  }
  return result
}

export function validatePurchaseReceiptPayableResult(result, request) {
  return validateFinanceBusinessSourceResult(result, request, {
    factType: 'PAYABLE',
    sourceType: 'PURCHASE_RECEIPT',
    sourceIDKey: 'purchase_receipt_id',
  })
}

export function validateOutsourcingReturnPayableResult(result, request) {
  return validateFinanceBusinessSourceResult(result, request, {
    factType: 'PAYABLE',
    sourceType: 'OUTSOURCING_FACT',
    sourceIDKey: 'outsourcing_fact_id',
  })
}

export function validateSingleFactReconciliationResult(result, request) {
  return validateFinanceBusinessSourceResult(result, request, {
    factType: 'RECONCILIATION',
    sourceType: 'FINANCE_FACT',
    sourceIDKey: 'finance_fact_id',
  })
}

export function financeBusinessSourceFormValuesFromRequest(request = {}) {
  const occurredAtText = normalizedText(request.occurred_at)
  const occurredAt = occurredAtText ? new Date(occurredAtText) : null
  return {
    fact_no: normalizedText(request.fact_no),
    occurred_at:
      occurredAt && Number.isFinite(occurredAt.getTime())
        ? localFinanceDateTimeInputValue(occurredAt)
        : '',
    note: normalizedText(request.note),
  }
}
