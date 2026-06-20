import React from 'react'
import { Form, Input, InputNumber, Select, Tag } from 'antd'

import { DateInput } from '../business-list/BusinessListLayout.jsx'
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

const FACT_SUBJECT_OPTIONS = [
  { label: '材料 MATERIAL', value: 'MATERIAL' },
  { label: '产品 PRODUCT', value: 'PRODUCT' },
]

export const PRODUCTION_FACT_TYPES = [
  { label: '发料 MATERIAL_ISSUE', value: 'MATERIAL_ISSUE' },
  { label: '成品入库 FINISHED_GOODS_RECEIPT', value: 'FINISHED_GOODS_RECEIPT' },
  { label: '返工 REWORK', value: 'REWORK' },
]

export const OUTSOURCING_FACT_TYPES = [
  { label: '委外发料 MATERIAL_ISSUE', value: 'MATERIAL_ISSUE' },
  { label: '委外回料 RETURN_RECEIPT', value: 'RETURN_RECEIPT' },
]

const FINANCE_FACT_TYPES = [
  { label: '应收 RECEIVABLE', value: 'RECEIVABLE' },
  { label: '应付 PAYABLE', value: 'PAYABLE' },
  { label: '发票 INVOICE', value: 'INVOICE' },
  { label: '收付款 PAYMENT', value: 'PAYMENT' },
  { label: '对账 RECONCILIATION', value: 'RECONCILIATION' },
]

const COUNTERPARTY_TYPES = [
  { label: '客户 CUSTOMER', value: 'CUSTOMER' },
  { label: '供应商 SUPPLIER', value: 'SUPPLIER' },
  { label: '其他 OTHER', value: 'OTHER' },
]

const CURRENCY_OPTIONS = [
  { label: '美金 USD', value: 'USD' },
  { label: '人民币 CNY', value: 'CNY' },
  { label: '港币 HKD', value: 'HKD' },
]

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

function CurrencyAmountInput({
  currencyLabel,
  disabled,
  id,
  onBlur,
  onChange,
  placeholder,
  value,
}) {
  return (
    <Input
      allowClear
      autoComplete="off"
      disabled={disabled}
      id={id}
      onBlur={onBlur}
      onChange={onChange}
      placeholder={placeholder}
      suffix={
        <span className="erp-operational-fact-form__currency-addon">
          {currencyLabel}
        </span>
      }
      value={value}
    />
  )
}

const CURRENCY_LABELS = Object.freeze(
  CURRENCY_OPTIONS.reduce((labels, item) => {
    labels[item.value] = item.label
    return labels
  }, {})
)

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

const BUSINESS_FIELD_CLASS = 'erp-business-action-form__field'
const BUSINESS_FIELD_FULL_CLASS =
  'erp-business-action-form__field erp-business-action-form__field--full'

export const ACTION_PERMISSIONS = Object.freeze({
  productionWrite: ['pmc.plan.update', 'warehouse.adjustment.create'],
  outsourcingWrite: ['purchase.order.update', 'warehouse.adjustment.create'],
  shipmentWrite: ['shipment.create'],
  shipmentConfirm: ['shipment.ship', 'shipment.cancel'],
  reservationWrite: ['sales_order.update', 'warehouse.outbound.confirm'],
  financeWrite: ['finance.receivable.confirm', 'finance.payable.confirm'],
})

export function hasAnyPermission(adminProfile, permissions = []) {
  if (adminProfile?.is_super_admin === true) {
    return true
  }
  return permissions.some((permission) =>
    hasActionPermission(adminProfile, permission)
  )
}

export function statusTag(status) {
  const key = String(status || '').trim()
  return (
    <Tag color={STATUS_COLORS[key] || 'default'}>
      {STATUS_LABELS[key] || key || '-'}
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

export function recordNoForKey(key, record = {}) {
  if (key === 'shipments') return record.shipment_no || record.id
  if (key === 'reservations') return record.reservation_no || record.id
  return record.fact_no || record.id
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
      record.customer_snapshot || record.customer_id || '-'
    }`
  }
  if (key === 'reservations') {
    return `${recordNoForKey(key, record)} / 产品 #${record.product_id || '-'}`
  }
  if (key === 'finance') {
    return `${recordNoForKey(key, record)} / ${
      record.counterparty_type || '-'
    } #${record.counterparty_id || '-'}`
  }
  return `${recordNoForKey(key, record)} / ${record.fact_type || '-'}`
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

export function buildShipmentParams(values = {}) {
  return compactParams({
    shipment_no: trimOptional(values.shipment_no),
    sales_order_id: positiveInt(values.sales_order_id),
    customer_id: positiveInt(values.customer_id),
    customer_snapshot: trimOptional(values.customer_snapshot),
    idempotency_key: trimOptional(values.idempotency_key),
    planned_ship_at: dateValue(values.planned_ship_at),
    note: trimOptional(values.note),
  })
}

export function buildShipmentItemParams(values = {}) {
  return compactParams({
    shipment_id: requiredInt(values.shipment_id),
    sales_order_item_id: positiveInt(values.sales_order_item_id),
    product_id: requiredInt(values.product_id),
    warehouse_id: requiredInt(values.warehouse_id),
    unit_id: requiredInt(values.unit_id),
    lot_id: positiveInt(values.lot_id),
    quantity: trimOptional(values.quantity),
    note: trimOptional(values.note),
  })
}

export function buildReservationParams(values = {}) {
  return compactParams({
    reservation_no: trimOptional(values.reservation_no),
    sales_order_id: positiveInt(values.sales_order_id),
    sales_order_item_id: positiveInt(values.sales_order_item_id),
    product_id: requiredInt(values.product_id),
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

export function FactFormFields({ typeOptions, includeSupplier = false }) {
  return (
    <>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="事实单号（自动）"
        name="fact_no"
        rules={[{ required: true }]}
      >
        <Input
          allowClear
          autoComplete="off"
          placeholder="自动生成，可按需要调整"
        />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="事实类型"
        name="fact_type"
        rules={[{ required: true }]}
      >
        <Select options={typeOptions} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="对象类型"
        name="subject_type"
        rules={[{ required: true }]}
      >
        <Select options={FACT_SUBJECT_OPTIONS} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="对象内部引用"
        name="subject_id"
        rules={[{ required: true }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="仓库内部引用"
        name="warehouse_id"
        rules={[{ required: true }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="批次内部引用"
        name="lot_id"
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="单位内部引用"
        name="unit_id"
        rules={[{ required: true }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="数量"
        name="quantity"
        rules={[{ required: true }]}
      >
        <Input allowClear autoComplete="off" placeholder="decimal，如 120.5" />
      </Form.Item>
      {includeSupplier ? (
        <>
          <Form.Item
            className={BUSINESS_FIELD_CLASS}
            label="供应商内部引用"
            name="supplier_id"
          >
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            className={BUSINESS_FIELD_CLASS}
            label="供应商快照"
            name="supplier_name"
          >
            <Input allowClear autoComplete="off" />
          </Form.Item>
        </>
      ) : null}
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="来源类型"
        name="source_type"
      >
        <Input allowClear autoComplete="off" placeholder="如 SALES_ORDER" />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="来源记录内部引用"
        name="source_id"
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="来源行内部引用"
        name="source_line_id"
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="幂等键"
        name="idempotency_key"
        rules={[{ required: true }]}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="发生日期"
        name="occurred_at"
      >
        <DateInput />
      </Form.Item>
      <Form.Item className={BUSINESS_FIELD_FULL_CLASS} label="备注" name="note">
        <Input.TextArea allowClear rows={3} maxLength={300} showCount />
      </Form.Item>
    </>
  )
}

export function ShipmentFormFields() {
  return (
    <>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="出货单号（自动）"
        name="shipment_no"
        rules={[{ required: true }]}
      >
        <Input
          allowClear
          autoComplete="off"
          placeholder="自动生成，可按需要调整"
        />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="销售订单内部引用"
        name="sales_order_id"
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="客户内部引用"
        name="customer_id"
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="客户快照"
        name="customer_snapshot"
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="幂等键"
        name="idempotency_key"
        rules={[{ required: true }]}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="计划出货日期"
        name="planned_ship_at"
      >
        <DateInput />
      </Form.Item>
      <Form.Item className={BUSINESS_FIELD_FULL_CLASS} label="备注" name="note">
        <Input.TextArea allowClear rows={3} maxLength={300} showCount />
      </Form.Item>
    </>
  )
}

export function ShipmentItemFormFields() {
  return (
    <>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="出货单内部引用"
        name="shipment_id"
        rules={[{ required: true }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="销售订单行内部引用"
        name="sales_order_item_id"
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="产品内部引用"
        name="product_id"
        rules={[{ required: true }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="仓库内部引用"
        name="warehouse_id"
        rules={[{ required: true }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="批次内部引用"
        name="lot_id"
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="单位内部引用"
        name="unit_id"
        rules={[{ required: true }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="数量"
        name="quantity"
        rules={[{ required: true }]}
      >
        <Input allowClear autoComplete="off" placeholder="decimal，如 120.5" />
      </Form.Item>
      <Form.Item className={BUSINESS_FIELD_FULL_CLASS} label="备注" name="note">
        <Input.TextArea allowClear rows={3} maxLength={300} showCount />
      </Form.Item>
    </>
  )
}

export function ReservationFormFields() {
  return (
    <>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="预留单号（自动）"
        name="reservation_no"
        rules={[{ required: true }]}
      >
        <Input
          allowClear
          autoComplete="off"
          placeholder="自动生成，可按需要调整"
        />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="销售订单内部引用"
        name="sales_order_id"
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="销售订单行内部引用"
        name="sales_order_item_id"
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="产品内部引用"
        name="product_id"
        rules={[{ required: true }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="仓库内部引用"
        name="warehouse_id"
        rules={[{ required: true }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="批次内部引用"
        name="lot_id"
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="单位内部引用"
        name="unit_id"
        rules={[{ required: true }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="数量"
        name="quantity"
        rules={[{ required: true }]}
      >
        <Input allowClear autoComplete="off" placeholder="decimal，如 120.5" />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="幂等键"
        name="idempotency_key"
        rules={[{ required: true }]}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="预留日期"
        name="reserved_at"
      >
        <DateInput />
      </Form.Item>
      <Form.Item className={BUSINESS_FIELD_FULL_CLASS} label="备注" name="note">
        <Input.TextArea allowClear rows={3} maxLength={300} showCount />
      </Form.Item>
    </>
  )
}

export function FinanceFormFields() {
  const form = Form.useFormInstance()
  const currency = Form.useWatch('currency')
  const currencyLabel = CURRENCY_LABELS[currency] || '人民币 CNY'

  return (
    <>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="事实单号（自动）"
        name="fact_no"
        rules={[{ required: true }]}
      >
        <Input
          allowClear
          autoComplete="off"
          placeholder="自动生成，可按需要调整"
        />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="事实类型"
        name="fact_type"
        rules={[{ required: true }]}
      >
        <Select options={FINANCE_FACT_TYPES} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="往来方类型"
        name="counterparty_type"
        rules={[{ required: true }]}
      >
        <Select options={COUNTERPARTY_TYPES} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="往来方内部引用"
        name="counterparty_id"
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="金额"
        name="amount"
        rules={[{ required: true }]}
      >
        <CurrencyAmountInput
          currencyLabel={currencyLabel}
          placeholder="decimal，如 120.5"
        />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="手续费"
        name="fee_amount"
      >
        <CurrencyAmountInput
          currencyLabel={currencyLabel}
          placeholder="无手续费可留空或填 0"
        />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="币种"
        name="currency"
        rules={[{ required: true }]}
      >
        <Select options={CURRENCY_OPTIONS} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="收款分类"
        name="collection_type"
      >
        <Select allowClear options={COLLECTION_TYPE_OPTIONS} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="收款账期"
        name="payment_term"
      >
        <Select
          allowClear
          options={PAYMENT_TERM_OPTIONS}
          onChange={(value) => {
            const option = PAYMENT_TERM_OPTIONS.find(
              (item) => item.value === value
            )
            form.setFieldValue('payment_term_days', option?.days)
          }}
        />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="账期天数"
        name="payment_term_days"
      >
        <InputNumber min={0} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="发票类别"
        name="invoice_category"
      >
        <Select allowClear options={INVOICE_CATEGORY_OPTIONS} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="来源类型"
        name="source_type"
      >
        <Input allowClear autoComplete="off" placeholder="如 SHIPMENT" />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="来源记录内部引用"
        name="source_id"
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="来源行内部引用"
        name="source_line_id"
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="幂等键"
        name="idempotency_key"
        rules={[{ required: true }]}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className={BUSINESS_FIELD_CLASS}
        label="发生日期"
        name="occurred_at"
      >
        <DateInput />
      </Form.Item>
      <Form.Item className={BUSINESS_FIELD_FULL_CLASS} label="备注" name="note">
        <Input.TextArea allowClear rows={3} maxLength={300} showCount />
      </Form.Item>
    </>
  )
}

export function businessModalTitle(title, description) {
  return (
    <div className="erp-business-action-modal__title">
      <span>{title}</span>
      <small>{description}</small>
    </div>
  )
}
