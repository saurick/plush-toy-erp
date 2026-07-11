import React from 'react'
import { Tag } from 'antd'

import {
  V1_ROUTE_PATHS,
  compactParams,
  hasActionPermission,
  trimOptional,
} from '../../utils/masterDataOrderView.mjs'

const STATUS_LABELS = Object.freeze({
  DRAFT: '草稿',
  POSTED: '已过账',
  SHIPPED: '已发货',
  SETTLED: '已结清',
  ACTIVE: '生效中',
  RELEASED: '已释放',
  CONSUMED: '已消耗',
  CANCELLED: '已取消',
})

const STATUS_COLORS = Object.freeze({
  DRAFT: 'default',
  POSTED: 'green',
  SHIPPED: 'blue',
  SETTLED: 'purple',
  ACTIVE: 'cyan',
  RELEASED: 'gold',
  CONSUMED: 'geekblue',
  CANCELLED: 'red',
})

const COLLECTION_TYPE_OPTIONS = [
  { label: '预收款', value: 'ADVANCE_RECEIPT' },
  { label: '应收款', value: 'ACCOUNTS_RECEIVABLE' },
]

const PAYMENT_TERM_OPTIONS = [
  { label: '出货即收', value: 'CASH_ON_SHIPMENT', days: 0 },
  { label: '月结 30 天', value: 'EOM_30', days: 30 },
  { label: '月结 45 天', value: 'EOM_45', days: 45 },
]

const INVOICE_CATEGORY_OPTIONS = [
  { label: '不开票', value: 'NONE' },
  { label: '出口普票', value: 'EXPORT_GENERAL' },
  { label: '1% 普票', value: 'VAT_GENERAL_1' },
  { label: '3% 专票', value: 'VAT_SPECIAL_3' },
  { label: '13% 专票', value: 'VAT_SPECIAL_13' },
]

export const FINANCE_COLLECTION_TYPE_LABELS = Object.freeze(
  COLLECTION_TYPE_OPTIONS.reduce((labels, item) => {
    labels[item.value] = item.label
    return labels
  }, {})
)

export const FINANCE_PAYMENT_TERM_LABELS = Object.freeze(
  PAYMENT_TERM_OPTIONS.reduce((labels, item) => {
    labels[item.value] = item.label
    return labels
  }, {})
)

export const FINANCE_INVOICE_CATEGORY_LABELS = Object.freeze(
  INVOICE_CATEGORY_OPTIONS.reduce((labels, item) => {
    labels[item.value] = item.label
    return labels
  }, {})
)

export const ACTION_PERMISSIONS = Object.freeze({
  productionWrite: ['pmc.plan.update', 'warehouse.adjustment.create'],
  outsourcingWrite: ['purchase.order.update', 'warehouse.adjustment.create'],
  shipmentWrite: ['shipment.create'],
  shipmentConfirm: ['shipment.ship', 'shipment.cancel'],
  reservationWrite: ['sales_order.update', 'warehouse.outbound.confirm'],
  financeWrite: ['finance.receivable.confirm', 'finance.payable.confirm'],
})

export function hasAnyPermission(adminProfile, permissions = []) {
  return permissions.some((permission) =>
    hasActionPermission(adminProfile, permission)
  )
}

export function statusTag(status) {
  const key = String(status || '').trim()
  return (
    <Tag color={STATUS_COLORS[key] || 'default'}>
      {STATUS_LABELS[key] || (key ? '业务状态' : '-')}
    </Tag>
  )
}

export function decimalNumber(value) {
  const numeric = Number(
    String(value ?? '')
      .replace(/,/g, '')
      .trim()
  )
  return Number.isFinite(numeric) ? numeric : 0
}

export function formatQuantity(value) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric) || numeric === 0) return '0'
  return String(Number(numeric.toFixed(4)))
}

const RECORD_FALLBACK_LABELS = Object.freeze({
  production: '生产事实已关联',
  outsourcing: '委外事实已关联',
  shipments: '出货单已关联',
  reservations: '库存预留已关联',
  finance: '财务事实已关联',
})

export function recordNoForKey(key, record = {}) {
  if (key === 'shipments') {
    return record.shipment_no || RECORD_FALLBACK_LABELS.shipments
  }
  if (key === 'reservations') {
    return record.reservation_no || RECORD_FALLBACK_LABELS.reservations
  }
  return record.fact_no || RECORD_FALLBACK_LABELS[key] || '业务事实已关联'
}

function factTypeText(type) {
  const key = String(type || '')
    .trim()
    .toUpperCase()
  if (key === 'MATERIAL_ISSUE') return '发料'
  if (key === 'FINISHED_GOODS_RECEIPT') return '成品入库'
  if (key === 'REWORK') return '返工'
  if (key === 'RETURN_RECEIPT') return '回料'
  if (key === 'RECEIVABLE') return '应收'
  if (key === 'PAYABLE') return '应付'
  if (key === 'INVOICE') return '发票'
  if (key === 'PAYMENT') return '收付款'
  if (key === 'RECONCILIATION') return '对账'
  return key ? '业务事实' : '-'
}

function counterpartyTypeText(type) {
  const key = String(type || '')
    .trim()
    .toUpperCase()
  if (key === 'CUSTOMER') return '客户'
  if (key === 'SUPPLIER') return '供应商'
  if (key === 'OTHER') return '其他往来方'
  return key ? '往来方' : '-'
}

export function selectedLabelForKey(key, record) {
  if (!record) return '请先选择一条记录'
  if (key === 'outsourcing') {
    return `${recordNoForKey(key, record)} / ${
      record.supplier_name || '未填写供应商'
    }`
  }
  if (key === 'shipments') {
    return `${recordNoForKey(key, record)} / 客户 ${
      record.customer_snapshot || (record.customer_id ? '已关联' : '-')
    }`
  }
  if (key === 'reservations') {
    return `${recordNoForKey(key, record)} / 产品 ${
      record.product_snapshot || (record.product_id ? '已关联' : '-')
    }`
  }
  if (key === 'finance') {
    return `${recordNoForKey(key, record)} / ${counterpartyTypeText(
      record.counterparty_type
    )} ${record.counterparty_id ? '已关联' : '-'}`
  }
  return `${recordNoForKey(key, record)} / ${factTypeText(record.fact_type)}`
}

export function sourceRouteFor(sourceType) {
  const key = String(sourceType || '')
    .trim()
    .toUpperCase()
  if (key === 'SHIPMENT') return V1_ROUTE_PATHS.shipments
  if (key === 'PRODUCTION_FACT') return V1_ROUTE_PATHS.productionProgress
  if (key === 'OUTSOURCING_FACT') return V1_ROUTE_PATHS.processingContracts
  if (key === 'PURCHASE_RECEIPT') return V1_ROUTE_PATHS.purchaseReceipts
  return ''
}

function positiveInt(value) {
  const numberValue = Number(value || 0)
  return Number.isFinite(numberValue) && numberValue > 0
    ? Math.trunc(numberValue)
    : undefined
}

function requiredInt(value) {
  return positiveInt(value) || 0
}

function nonNegativeInt(value) {
  if (value === '' || value === null || value === undefined) return undefined
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue >= 0
    ? Math.trunc(numberValue)
    : undefined
}

function dateValue(value) {
  return trimOptional(value)
}

export function idempotencyKey(prefix) {
  return `${prefix}-${Date.now()}`
}

export function buildFactParams(values = {}) {
  return compactParams({
    fact_no: trimOptional(values.fact_no),
    fact_type: trimOptional(values.fact_type),
    subject_type: trimOptional(values.subject_type),
    subject_id: requiredInt(values.subject_id),
    product_sku_id: positiveInt(values.product_sku_id),
    warehouse_id: requiredInt(values.warehouse_id),
    unit_id: requiredInt(values.unit_id),
    lot_id: positiveInt(values.lot_id),
    quantity: trimOptional(values.quantity),
    supplier_id: positiveInt(values.supplier_id),
    supplier_name: trimOptional(values.supplier_name),
    source_type: trimOptional(values.source_type),
    source_id: positiveInt(values.source_id),
    source_line_id: positiveInt(values.source_line_id),
    idempotency_key: trimOptional(values.idempotency_key),
    occurred_at: dateValue(values.occurred_at),
    note: trimOptional(values.note),
  })
}

export function buildReservationParams(values = {}) {
  return compactParams({
    reservation_no: trimOptional(values.reservation_no),
    sales_order_id: positiveInt(values.sales_order_id),
    sales_order_item_id: positiveInt(values.sales_order_item_id),
    product_id: requiredInt(values.product_id),
    product_sku_id: positiveInt(values.product_sku_id),
    warehouse_id: requiredInt(values.warehouse_id),
    unit_id: requiredInt(values.unit_id),
    lot_id: positiveInt(values.lot_id),
    quantity: trimOptional(values.quantity),
    idempotency_key: trimOptional(values.idempotency_key),
    reserved_at: dateValue(values.reserved_at),
    note: trimOptional(values.note),
  })
}

export function buildFinanceParams(values = {}) {
  return compactParams({
    fact_no: trimOptional(values.fact_no),
    fact_type: trimOptional(values.fact_type),
    counterparty_type: trimOptional(values.counterparty_type),
    counterparty_id: positiveInt(values.counterparty_id),
    amount: trimOptional(values.amount),
    fee_amount: trimOptional(values.fee_amount),
    currency: trimOptional(values.currency),
    collection_type: trimOptional(values.collection_type),
    payment_term: trimOptional(values.payment_term),
    payment_term_days: nonNegativeInt(values.payment_term_days),
    invoice_category: trimOptional(values.invoice_category),
    source_type: trimOptional(values.source_type),
    source_id: positiveInt(values.source_id),
    source_line_id: positiveInt(values.source_line_id),
    idempotency_key: trimOptional(values.idempotency_key),
    occurred_at: dateValue(values.occurred_at),
    note: trimOptional(values.note),
  })
}

export function businessModalTitle(title, description) {
  return (
    <div className="erp-business-action-modal__title">
      <span>{title}</span>
      <small>{description}</small>
    </div>
  )
}
