export function financePaymentFilterParams(filters = {}) {
  const [counterparty_type, rawID] = String(filters.party || '').split(':')
  return {
    currency: filters.currency || undefined,
    kind: filters.kind || undefined,
    counterparty_type: counterparty_type || undefined,
    counterparty_id: rawID ? Number(rawID) : undefined,
    date_from: filters.dateFrom || undefined,
    date_to: filters.dateTo || undefined,
  }
}

export const financeStatementKindLabel = (kind) => ({
  BILL: '账款确认',
  BILL_CANCEL: '账款撤销',
  PAYMENT: '收付款入账',
  PAYMENT_REVERSE: '收付款冲销',
  ADJUSTMENT: '账款调整',
  ADJUSTMENT_REVERSE: '调整冲销',
})[kind] || (kind ? '业务记录' : '')
