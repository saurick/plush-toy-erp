import {
  OUTSOURCING_ORDER_SUBJECT_TYPES,
  normalizeOutsourcingOrderSubjectType,
} from './sourceOrderLineValues.mjs'
import {
  buildDeliverySnapshot,
  buildOrderContactSnapshot,
  buildContractPartySnapshot,
} from './sourcePartySnapshots.mjs'
import {
  deriveSalesOrderItemAmount,
  derivePurchaseOrderItemAmount,
} from './sourceOrderAmounts.mjs'
import {
  trimOptional,
  normalizeOptionalDecimalString,
  normalizeOptionalNonNegativeInteger,
  compactParams,
} from './sourceDocumentValues.mjs'
import { isBusinessCurrency } from './businessCurrency.mjs'

function normalizeSourceOrderCurrency(value, extra = {}) {
  const currency = trimOptional(value)?.toUpperCase()
  const id = Number(extra?.id)
  const isEdit = Number.isFinite(id) && Number.isInteger(id) && id > 0
  if (!currency && !isEdit) {
    return 'CNY'
  }
  if (!currency || !isBusinessCurrency(currency)) {
    throw new Error('币种必须明确选择人民币、美元或港币')
  }
  return currency
}

function normalizeOptionalPositiveInteger(value) {
  const normalized = normalizeOptionalNonNegativeInteger(value)
  return normalized && normalized > 0 ? normalized : undefined
}

function normalizeLineNo(primaryValue, fallbackValue) {
  const normalized = normalizeOptionalNonNegativeInteger(primaryValue)
  if (normalized && normalized > 0) {
    return normalized
  }
  const fallback = normalizeOptionalNonNegativeInteger(fallbackValue)
  return fallback && fallback > 0 ? fallback : 1
}

function buildOptionalContractPartySnapshotParam(values = {}) {
  if (
    !Object.prototype.hasOwnProperty.call(values, 'contract_party_snapshot')
  ) {
    return undefined
  }
  return values.contract_party_snapshot &&
    typeof values.contract_party_snapshot === 'object'
    ? buildContractPartySnapshot(values.contract_party_snapshot)
    : {}
}

function buildSalesOrderParams(values = {}, extra = {}) {
  const deliverySnapshot = buildDeliverySnapshot(values)
  const taxMode = String(values.tax_mode || '')
    .trim()
    .toUpperCase()
  const freightTerms = String(values.freight_terms || '')
    .trim()
    .toUpperCase()
  return compactParams({
    ...extra,
    order_no: trimOptional(values.order_no),
    currency: normalizeSourceOrderCurrency(values.currency, extra),
    customer_id:
      values.customer_id === undefined ||
      values.customer_id === null ||
      trimOptional(values.customer_id) === ''
        ? undefined
        : Number(values.customer_id || 0),
    customer_order_no: trimOptional(values.customer_order_no),
    customer_snapshot:
      values.customer_snapshot && typeof values.customer_snapshot === 'object'
        ? values.customer_snapshot
        : {},
    sales_owner: trimOptional(values.sales_owner),
    contact_snapshot:
      values.contact_snapshot && typeof values.contact_snapshot === 'object'
        ? values.contact_snapshot
        : buildOrderContactSnapshot(values),
    delivery_snapshot:
      Object.keys(deliverySnapshot).length > 0 ? deliverySnapshot : undefined,
    payment_method: trimOptional(values.payment_method),
    payment_term_days: normalizeOptionalNonNegativeInteger(
      values.payment_term_days
    ),
    price_condition_note: trimOptional(values.price_condition_note),
    tax_mode: trimOptional(values.tax_mode),
    tax_rate:
      !taxMode || taxMode === 'NONE'
        ? undefined
        : normalizeOptionalDecimalString(values.tax_rate),
    freight_terms: trimOptional(values.freight_terms),
    quoted_freight_amount:
      freightTerms === 'EXCLUDED'
        ? normalizeOptionalDecimalString(values.quoted_freight_amount)
        : undefined,
    order_date: trimOptional(values.order_date),
    planned_delivery_date: trimOptional(values.planned_delivery_date),
    note: trimOptional(values.note),
  })
}

function buildSalesOrderItemParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    line_no: normalizeLineNo(extra.line_no, values.line_no),
    product_id: normalizeOptionalPositiveInteger(values.product_id),
    product_sku_id: normalizeOptionalPositiveInteger(values.product_sku_id),
    unit_id: normalizeOptionalPositiveInteger(values.unit_id),
    product_code_snapshot: trimOptional(values.product_code_snapshot),
    product_name_snapshot: trimOptional(values.product_name_snapshot),
    color_snapshot: trimOptional(values.color_snapshot),
    ordered_quantity: trimOptional(values.ordered_quantity),
    unit_price: trimOptional(values.unit_price),
    amount: deriveSalesOrderItemAmount(values),
    planned_delivery_date: trimOptional(values.planned_delivery_date),
    note: trimOptional(values.note),
  })
}

function buildPurchaseOrderParams(values = {}, extra = {}) {
  const supplierSnapshot =
    Object.prototype.hasOwnProperty.call(extra, 'supplier_snapshot') &&
    extra.supplier_snapshot &&
    typeof extra.supplier_snapshot === 'object'
      ? extra.supplier_snapshot
      : values.supplier_snapshot && typeof values.supplier_snapshot === 'object'
        ? values.supplier_snapshot
        : {}
  return compactParams({
    ...extra,
    purchase_order_no: trimOptional(values.purchase_order_no),
    currency: normalizeSourceOrderCurrency(values.currency, extra),
    supplier_id: Number(values.supplier_id || 0),
    supplier_purchase_order_no: trimOptional(values.supplier_purchase_order_no),
    supplier_snapshot: supplierSnapshot,
    contract_party_snapshot: buildOptionalContractPartySnapshotParam(values),
    purchase_date: trimOptional(values.purchase_date),
    expected_arrival_date: trimOptional(values.expected_arrival_date),
    supplier_confirmed_arrival_date: trimOptional(
      values.supplier_confirmed_arrival_date
    ),
    payment_term_days: normalizeOptionalNonNegativeInteger(
      values.payment_term_days
    ),
    payment_method: trimOptional(values.payment_method),
    invoice_required:
      typeof values.invoice_required === 'boolean'
        ? values.invoice_required
        : undefined,
    invoice_category:
      values.invoice_required === true
        ? trimOptional(values.invoice_category)
        : undefined,
    delivery_address: trimOptional(values.delivery_address),
    note: trimOptional(values.note),
  })
}

function buildPurchaseOrderItemParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    line_no: normalizeLineNo(extra.line_no, values.line_no),
    material_id: Number(values.material_id || 0),
    unit_id: Number(values.unit_id || 0),
    material_code_snapshot: trimOptional(values.material_code_snapshot),
    material_name_snapshot: trimOptional(values.material_name_snapshot),
    color_snapshot: trimOptional(values.color_snapshot),
    product_order_no_snapshot: trimOptional(values.product_order_no_snapshot),
    product_no_snapshot: trimOptional(values.product_no_snapshot),
    product_name_snapshot: trimOptional(values.product_name_snapshot),
    purchased_quantity: trimOptional(values.purchased_quantity),
    unit_price: trimOptional(values.unit_price),
    amount: derivePurchaseOrderItemAmount(values),
    expected_arrival_date: trimOptional(values.expected_arrival_date),
    note: trimOptional(values.note),
  })
}

function buildOutsourcingOrderParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    outsourcing_order_no: trimOptional(values.outsourcing_order_no),
    currency: normalizeSourceOrderCurrency(values.currency, extra),
    supplier_id: Number(values.supplier_id || 0),
    supplier_snapshot:
      values.supplier_snapshot && typeof values.supplier_snapshot === 'object'
        ? values.supplier_snapshot
        : {},
    contract_party_snapshot: buildOptionalContractPartySnapshotParam(values),
    source_order_no: trimOptional(values.source_order_no),
    order_date: trimOptional(values.order_date),
    expected_return_date: trimOptional(values.expected_return_date),
    payment_term_days: normalizeOptionalNonNegativeInteger(
      values.payment_term_days
    ),
    note: trimOptional(values.note),
  })
}

function buildOutsourcingOrderItemParams(values = {}, extra = {}) {
  const subjectType = normalizeOutsourcingOrderSubjectType(values.subject_type)
  const productSubject = subjectType === OUTSOURCING_ORDER_SUBJECT_TYPES.PRODUCT
  const materialSubject =
    subjectType === OUTSOURCING_ORDER_SUBJECT_TYPES.MATERIAL
  return compactParams({
    ...extra,
    line_no: normalizeLineNo(extra.line_no, values.line_no),
    subject_type: subjectType,
    product_id: productSubject
      ? normalizeOptionalPositiveInteger(values.product_id)
      : undefined,
    product_sku_id: productSubject
      ? normalizeOptionalPositiveInteger(values.product_sku_id)
      : undefined,
    material_id: materialSubject
      ? normalizeOptionalPositiveInteger(values.material_id)
      : undefined,
    process_id: Number(values.process_id || 0),
    unit_id: Number(values.unit_id || 0),
    product_no_snapshot: productSubject
      ? trimOptional(values.product_no_snapshot)
      : undefined,
    sku_code_snapshot: productSubject
      ? trimOptional(values.sku_code_snapshot)
      : undefined,
    product_order_no_snapshot: trimOptional(values.product_order_no_snapshot),
    product_name_snapshot: productSubject
      ? trimOptional(values.product_name_snapshot)
      : undefined,
    material_code_snapshot: materialSubject
      ? trimOptional(values.material_code_snapshot)
      : undefined,
    material_name_snapshot: materialSubject
      ? trimOptional(values.material_name_snapshot)
      : undefined,
    processing_item: trimOptional(values.processing_item),
    process_name_snapshot: trimOptional(values.process_name_snapshot),
    process_category_snapshot: trimOptional(values.process_category_snapshot),
    unit_name_snapshot: trimOptional(values.unit_name_snapshot),
    outsourcing_quantity: trimOptional(values.outsourcing_quantity),
    unit_price: trimOptional(values.unit_price),
    expected_return_date: trimOptional(values.expected_return_date),
    note: trimOptional(values.note),
  })
}

export {
  buildSalesOrderParams,
  buildSalesOrderItemParams,
  buildPurchaseOrderParams,
  buildPurchaseOrderItemParams,
  buildOutsourcingOrderParams,
  buildOutsourcingOrderItemParams,
}
