export const FINANCE_TRACE_PAGE_SIZE = 20

export const FINANCE_FACT_LABELS = Object.freeze({
  RECEIVABLE: '应收',
  PAYABLE: '应付',
  INVOICE: '发票',
  RECONCILIATION: '单笔核对',
})
export const FINANCE_STATUS_LABELS = Object.freeze({
  DRAFT: '草稿',
  POSTED: '已过账',
  SETTLED: '已结清',
  CANCELLED: '已取消',
  REVERSED: '已冲回',
  APPROVED: '已批准',
  REJECTED: '已退回',
})
export const financeStatus = (value) =>
  FINANCE_STATUS_LABELS[value] || '状态待核对'
export const financeAmount = (value, currency) =>
  value == null || value === ''
    ? '待核对'
    : `${String(value)} ${currency || ''}`.trim()
export function financeTime(value) {
  if (!value) return '未记录'
  const date = new Date(typeof value === 'number' ? value * 1000 : value)
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '时间待核对'
}

// Fail closed when a page is malformed or contains records from a different
// relationship. Missing data must not look like an empty, successful query.
export function financeTracePage(data, field, params) {
  const rows = data?.[field]
  if (
    !Array.isArray(rows) ||
    !Number.isSafeInteger(data.total) ||
    data.total < rows.length ||
    rows.length > FINANCE_TRACE_PAGE_SIZE
  ) {
    throw new Error('财务查询结果不完整')
  }
  for (const row of rows) {
    if (
      !row ||
      (field !== 'adjustments' &&
        (!Number.isSafeInteger(row.id) || row.id <= 0))
    ) {
      throw new Error('财务记录缺少有效标识')
    }
    if (params.finance_fact_id) {
      const matches =
        field === 'payments'
          ? Array.isArray(row.allocations) &&
            row.allocations.some(
              (item) => item.finance_fact_id === params.finance_fact_id
            )
          : row.finance_fact_id === params.finance_fact_id
      if (!matches) throw new Error('财务关联结果不匹配')
    }
    if (
      params.refund_of_payment_id &&
      row.refund_of_payment_id !== params.refund_of_payment_id
    ) {
      throw new Error('退款关联结果不匹配')
    }
  }
  return { rows, total: data.total }
}

export function financeTraceFact(data, params) {
  if (!data || data.id !== params.id || !FINANCE_FACT_LABELS[data.fact_type]) {
    throw new Error('账款详情缺失或不匹配')
  }
  return data
}
