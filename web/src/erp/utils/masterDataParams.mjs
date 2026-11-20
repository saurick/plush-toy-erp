import {
  trimOptional,
  normalizeOptionalDecimalString,
  normalizeOptionalNonNegativeInteger,
  optionalFormReferenceID,
  compactParams,
} from './sourceDocumentValues.mjs'

function buildMasterDataParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    code: trimOptional(values.code),
    name: trimOptional(values.name),
    short_name: trimOptional(values.short_name),
    default_payment_method: trimOptional(values.default_payment_method),
    default_payment_term_days: normalizeOptionalNonNegativeInteger(
      values.default_payment_term_days
    ),
    country_region: trimOptional(values.country_region),
    default_delivery_recipient: trimOptional(values.default_delivery_recipient),
    default_delivery_phone: trimOptional(values.default_delivery_phone),
    default_delivery_address: trimOptional(values.default_delivery_address),
    supplier_type: trimOptional(values.supplier_type),
    address: trimOptional(values.address),
    tax_no: trimOptional(values.tax_no),
    default_invoice_required:
      typeof values.default_invoice_required === 'boolean'
        ? values.default_invoice_required
        : undefined,
    default_invoice_category:
      values.default_invoice_required === true
        ? trimOptional(values.default_invoice_category)
        : undefined,
    process_ids: Array.isArray(values.process_ids)
      ? values.process_ids.map((value) => Number(value || 0))
      : undefined,
    category: trimOptional(values.category),
    stock_category: trimOptional(values.stock_category),
    default_warehouse_id: values.default_warehouse_id
      ? Number(values.default_warehouse_id)
      : undefined,
    supplier_id: values.supplier_id ? Number(values.supplier_id) : undefined,
    supplier_item_no: trimOptional(values.supplier_item_no),
    spec: trimOptional(values.spec),
    color: trimOptional(values.color),
    default_unit_id:
      values.default_unit_id === undefined
        ? undefined
        : Number(values.default_unit_id || 0),
    note: trimOptional(values.note),
  })
}

function buildProductParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    code: trimOptional(values.code),
    name: trimOptional(values.name),
    english_name: trimOptional(values.english_name),
    hs_code: trimOptional(values.hs_code),
    style_no: trimOptional(values.style_no),
    customer_style_no: trimOptional(values.customer_style_no),
    default_unit_id:
      values.default_unit_id === undefined
        ? undefined
        : Number(values.default_unit_id || 0),
    unit_net_weight_g: normalizeOptionalDecimalString(values.unit_net_weight_g),
  })
}

function buildProcessParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    code: trimOptional(values.code),
    name: trimOptional(values.name),
    category: trimOptional(values.category),
    production_route_operation_code: trimOptional(
      values.production_route_operation_code
    ),
    outsourcing_enabled: values.outsourcing_enabled ?? false,
    inhouse_enabled: values.inhouse_enabled ?? true,
    note: trimOptional(values.note),
  })
}

function skuText(value) {
  if (value != null && typeof value !== 'string') {
    throw new Error('产品规格资料须填写文本，请核对后保存')
  }
  return trimOptional(value)
}

function buildProductSKUParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    product_id: optionalFormReferenceID(values.product_id),
    sku_code: skuText(values.sku_code),
    sku_name: skuText(values.sku_name),
    barcode: skuText(values.barcode),
    customer_sku: skuText(values.customer_sku),
    color: skuText(values.color),
    color_no: skuText(values.color_no),
    size: skuText(values.size),
    packaging_version: skuText(values.packaging_version),
    default_unit_id: optionalFormReferenceID(values.default_unit_id),
    unit_net_weight_g: normalizeOptionalDecimalString(values.unit_net_weight_g),
  })
}

function buildContactParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    name: trimOptional(values.name),
    phone: trimOptional(values.phone),
    mobile: trimOptional(values.mobile),
    email: trimOptional(values.email),
    title: trimOptional(values.title),
    is_primary: values.is_primary === true,
    note: trimOptional(values.note),
  })
}

export {
  buildMasterDataParams,
  buildProductParams,
  buildProcessParams,
  buildProductSKUParams,
  buildContactParams,
}
