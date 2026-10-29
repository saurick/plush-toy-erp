import React from 'react'
import { Tag } from 'antd'

import {
  FinanceAllocationStatus,
  FinancePaymentDirection,
  FinancePaymentKind,
  FinancePaymentStatus,
} from '../../../common/consts/statuses.generated.mjs'

export const PAYMENT_STORAGE_PREFIX = 'plush-erp:finance-payment:last:v1:'

export const FINANCE_PAYMENT_COLUMN_ORDER_KEY = 'finance-payments-records'

export const FINANCE_CREDIT_NOTE_COLUMN_ORDER_KEY =
  'finance-credit-notes-records'

export const PAYMENT_STATUS_META = Object.freeze({
  [FinancePaymentStatus.DRAFT]: ['待审批', 'blue'],
  [FinancePaymentStatus.APPROVED]: ['已批准待入账', 'gold'],
  [FinancePaymentStatus.REJECTED]: ['已退回', 'red'],
  [FinancePaymentStatus.CANCELLED]: ['已取消', 'default'],
  [FinancePaymentStatus.POSTED]: ['已入账', 'green'],
  [FinancePaymentStatus.REVERSED]: ['已冲销', 'magenta'],
})

export const PAYMENT_STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  ...Object.entries(PAYMENT_STATUS_META).map(([value, [label]]) => ({
    value,
    label,
  })),
]

export const PAYMENT_DIRECTION_OPTIONS = [
  { value: '', label: '全部方向' },
  { value: FinancePaymentDirection.RECEIPT, label: '收款' },
  { value: FinancePaymentDirection.DISBURSEMENT, label: '付款' },
]

export const CREDIT_STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: FinanceAllocationStatus.POSTED, label: '已调整' },
  { value: FinanceAllocationStatus.REVERSED, label: '冲销记录' },
]

export const FINANCE_VIEW_ITEMS = [
  { key: 'payments', label: '收付款记录' },
  { key: 'credits', label: '账款调整' },
  { key: 'statement', label: '期间对账' },
  { key: 'source-adjustments', label: '采购待调整' },
]

export function paymentStatus(value) {
  const [label, color] = PAYMENT_STATUS_META[value] || ['状态待核对', 'default']
  return <Tag color={color}>{label}</Tag>
}

export function paymentStatusLabel(value) {
  return PAYMENT_STATUS_META[value]?.[0] || '状态待核对'
}

export function creditStatusLabel(value) {
  return value === FinanceAllocationStatus.REVERSED ? '冲销记录' : '已调整'
}

export function financeFactTypeLabel(value) {
  return value === 'RECEIVABLE' ? '应收' : '应付'
}

export function paymentAllocationExportValue(record) {
  const allocations = Array.isArray(record?.allocations)
    ? record.allocations
    : []
  if (allocations.length === 0) return '0 笔'

  return allocations
    .map((item, index) => {
      const factNo = item?.finance_fact_no || `核销明细 ${index + 1}`
      const currency = item?.currency || record?.currency || ''
      const amount = String(item?.amount ?? '').trim()
      const status =
        item?.status === FinanceAllocationStatus.REVERSED ? '已冲销' : '已过账'
      return [factNo, amount && `${amount}${currency ? ` ${currency}` : ''}`, status]
        .filter(Boolean).join(' / ')
    })
    .join('；')
}

export function partyOption(record, fallback) {
  const code = String(
    record?.customer_code || record?.supplier_code || ''
  ).trim()
  const name = String(
    record?.name || record?.customer_name || record?.supplier_name || ''
  ).trim()
  return {
    value: Number(record?.id),
    label: [code, name].filter(Boolean).join(' ') || fallback,
  }
}

export function paymentSourceReference(record, { emptyText = '—' } = {}) {
  if (record?.kind === FinancePaymentKind.REFUND) {
    return record.refund_of_payment_no || '原收付款单待核对'
  }
  if (record?.kind === FinancePaymentKind.ADVANCE) {
    return record.source_no || '关联订单待核对'
  }
  const allocations = Array.isArray(record?.allocations)
    ? record.allocations
    : []
  return allocations.length ? `${allocations.length} 笔核销记录` : emptyText
}
