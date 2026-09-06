import { trimOptional } from './sourceDocumentValues.mjs'

const OUTSOURCING_ORDER_SUBJECT_TYPES = Object.freeze({
  PRODUCT: 'PRODUCT',
  MATERIAL: 'MATERIAL',
})

function normalizeOutsourcingOrderSubjectType(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
  return Object.values(OUTSOURCING_ORDER_SUBJECT_TYPES).includes(normalized)
    ? normalized
    : undefined
}

function buildSalesOrderItemSourceValuesFromSKU(sku = {}) {
  if (!sku?.id) {
    return {
      product_sku_id: undefined,
      product_id: undefined,
      unit_id: undefined,
      product_code_snapshot: '',
      product_name_snapshot: '',
      color_snapshot: '',
    }
  }
  return {
    product_sku_id: Number(sku.id || 0) || undefined,
    product_id: Number(sku.product_id || 0) || undefined,
    unit_id: Number(sku.default_unit_id || 0) || undefined,
    product_code_snapshot: trimOptional(sku.sku_code) || '',
    product_name_snapshot:
      trimOptional(sku.sku_name) ||
      trimOptional(sku.customer_sku) ||
      trimOptional(sku.barcode) ||
      '',
    color_snapshot: trimOptional(sku.color) || '',
  }
}

function buildPurchaseOrderItemSourceValuesFromMaterial(material = {}) {
  if (!material?.id) {
    return {
      material_id: undefined,
      unit_id: undefined,
      material_code_snapshot: '',
      material_name_snapshot: '',
      color_snapshot: '',
    }
  }
  return {
    material_id: Number(material.id || 0) || undefined,
    unit_id: Number(material.default_unit_id || 0) || undefined,
    material_code_snapshot: trimOptional(material.code) || '',
    material_name_snapshot: trimOptional(material.name) || '',
    color_snapshot: trimOptional(material.color) || '',
  }
}

function buildOutsourcingOrderSubjectSwitchValues(subjectType) {
  return {
    subject_type: normalizeOutsourcingOrderSubjectType(subjectType),
    product_id: undefined,
    product_sku_id: undefined,
    material_id: undefined,
    product_no_snapshot: '',
    sku_code_snapshot: '',
    product_name_snapshot: '',
    material_code_snapshot: '',
    material_name_snapshot: '',
    unit_id: undefined,
    unit_name_snapshot: '',
  }
}

function buildOutsourcingOrderItemSourceValuesFromProduct(
  product = {},
  unit = {}
) {
  const resetValues = buildOutsourcingOrderSubjectSwitchValues(
    OUTSOURCING_ORDER_SUBJECT_TYPES.PRODUCT
  )
  if (!product?.id) {
    return resetValues
  }
  return {
    ...resetValues,
    product_id: Number(product.id || 0) || undefined,
    product_no_snapshot: trimOptional(product.code) || '',
    product_name_snapshot: trimOptional(product.name) || '',
    unit_id: Number(product.default_unit_id || 0) || undefined,
    unit_name_snapshot: trimOptional(unit.name) || '',
  }
}

function buildOutsourcingOrderItemSourceValuesFromMaterial(
  material = {},
  unit = {}
) {
  const resetValues = buildOutsourcingOrderSubjectSwitchValues(
    OUTSOURCING_ORDER_SUBJECT_TYPES.MATERIAL
  )
  if (!material?.id) {
    return resetValues
  }
  return {
    ...resetValues,
    material_id: Number(material.id || 0) || undefined,
    material_code_snapshot: trimOptional(material.code) || '',
    material_name_snapshot: trimOptional(material.name) || '',
    unit_id: Number(material.default_unit_id || 0) || undefined,
    unit_name_snapshot: trimOptional(unit.name) || '',
  }
}

function buildOutsourcingOrderItemSourceValuesFromProductSKU(
  productSKU = {},
  unit = {}
) {
  if (!productSKU?.id) {
    return {
      product_sku_id: undefined,
      sku_code_snapshot: '',
      unit_id: Number(unit.id || 0) || undefined,
      unit_name_snapshot: trimOptional(unit.name) || '',
    }
  }
  return {
    product_sku_id: Number(productSKU.id || 0) || undefined,
    sku_code_snapshot: trimOptional(productSKU.sku_code) || '',
    unit_id: Number(productSKU.default_unit_id || 0) || undefined,
    unit_name_snapshot: trimOptional(unit.name) || '',
  }
}

function buildBOMItemSourceValuesFromMaterial(material = {}) {
  if (!material?.id) {
    return {
      material_id: undefined,
      unit_id: undefined,
    }
  }
  return {
    material_id: Number(material.id || 0) || undefined,
    unit_id: Number(material.default_unit_id || 0) || undefined,
  }
}

export {
  OUTSOURCING_ORDER_SUBJECT_TYPES,
  normalizeOutsourcingOrderSubjectType,
  buildSalesOrderItemSourceValuesFromSKU,
  buildPurchaseOrderItemSourceValuesFromMaterial,
  buildOutsourcingOrderSubjectSwitchValues,
  buildOutsourcingOrderItemSourceValuesFromProduct,
  buildOutsourcingOrderItemSourceValuesFromMaterial,
  buildOutsourcingOrderItemSourceValuesFromProductSKU,
  buildBOMItemSourceValuesFromMaterial,
}
