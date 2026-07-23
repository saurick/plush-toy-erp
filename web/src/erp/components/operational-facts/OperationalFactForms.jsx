import React from 'react'
import { Tag } from 'antd'

import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { formatOperationalFactDecimal } from './operationalFactDecimal.mjs'

export {
  businessSourceRouteFor,
  sourceRouteFor,
} from '../../utils/businessSourceNavigation.mjs'

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
  productionRead: ['production.fact.read'],
  productionPost: ['production.fact.post'],
  productionCancel: ['production.fact.cancel'],
  outsourcingRead: ['outsourcing.fact.read'],
  outsourcingPost: ['outsourcing.fact.post'],
  outsourcingCancel: ['outsourcing.fact.cancel'],
  shipmentWrite: ['shipment.create'],
  shipmentPost: ['shipment.ship'],
  shipmentCancel: ['shipment.cancel'],
  reservationRelease: ['stock.reservation.release'],
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

export function formatQuantity(value) {
  return formatOperationalFactDecimal(value)
}

const RECORD_FALLBACK_LABELS = Object.freeze({
  production: '生产记录已关联',
  outsourcing: '委外记录已关联',
  shipments: '出货单已关联',
  reservations: '库存预留已关联',
  finance: '财务记录已关联',
})

export function recordNoForKey(key, record = {}) {
  if (key === 'shipments') {
    return record.shipment_no || RECORD_FALLBACK_LABELS.shipments
  }
  if (key === 'reservations') {
    return record.reservation_no || RECORD_FALLBACK_LABELS.reservations
  }
  return record.fact_no || RECORD_FALLBACK_LABELS[key] || '业务记录已关联'
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
  return key ? '业务记录' : '-'
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
