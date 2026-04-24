import { getPrintTemplateByKey } from '../config/printTemplates.mjs'
import {
  createEmptyProcessingAttachments,
  createProcessingContractDraft,
  normalizeProcessingLine,
} from '../data/processingContractTemplate.mjs'
import { buildMaterialPurchaseContractDraft } from './materialPurchaseContractEditor.mjs'
import {
  MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
  PROCESSING_CONTRACT_TEMPLATE_KEY,
} from './printWorkspace.js'

export const BUSINESS_RECORD_PRINT_TEMPLATES = Object.freeze({
  'accessories-purchase': Object.freeze({
    key: MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
    label: '采购合同',
    actionLabel: '打印采购合同',
  }),
  'processing-contracts': Object.freeze({
    key: PROCESSING_CONTRACT_TEMPLATE_KEY,
    label: '加工合同',
    actionLabel: '打印加工合同',
  }),
})

const isPresent = (value) =>
  value !== undefined && value !== null && String(value).trim() !== ''

const toText = (value) =>
  String(value ?? '')
    .replace(/\r/g, '')
    .trim()

const firstText = (...values) => {
  const matchedValue = values.find(isPresent)
  return matchedValue === undefined ? '' : toText(matchedValue)
}

const itemsOf = (record = {}) =>
  Array.isArray(record?.items) && record.items.length > 0 ? record.items : []

export function getBusinessRecordPrintTemplate(moduleKey) {
  return BUSINESS_RECORD_PRINT_TEMPLATES[moduleKey] || null
}

function buildFallbackMaterialPurchaseLine(record = {}) {
  return {
    contractNo: toText(record.document_no),
    productOrderNo: toText(record.source_no),
    productNo: toText(record.product_no),
    productName: toText(record.product_name),
    materialName: firstText(record.material_name, record.title),
    vendorCode: '',
    spec: '',
    unit: toText(record.unit),
    unitPrice: '',
    quantity: toText(record.quantity),
    amount: toText(record.amount),
    remark: '',
  }
}

function mapMaterialPurchaseItemToLine(item = {}, record = {}) {
  return {
    contractNo: toText(record.document_no),
    productOrderNo: toText(record.source_no),
    productNo: toText(record.product_no),
    productName: toText(record.product_name),
    materialName: firstText(item.material_name, record.material_name),
    vendorCode: toText(item.supplier_name),
    spec: toText(item.spec),
    unit: firstText(item.unit, record.unit),
    unitPrice: toText(item.unit_price),
    quantity: toText(item.quantity),
    amount: toText(item.amount),
    remark: toText(item.item_name),
  }
}

function buildMaterialPurchasePrintDraft(record = {}) {
  const template = getPrintTemplateByKey(
    MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY
  )
  const baseDraft = buildMaterialPurchaseContractDraft(template?.sample)
  const sourceItems = itemsOf(record)
  const lines =
    sourceItems.length > 0
      ? sourceItems.map((item) => mapMaterialPurchaseItemToLine(item, record))
      : [buildFallbackMaterialPurchaseLine(record)]

  return buildMaterialPurchaseContractDraft({
    contractNo: toText(record.document_no),
    orderDateText: toText(record.document_date),
    returnDateText: toText(record.due_date),
    supplierName: toText(record.supplier_name),
    supplierContact: '',
    supplierPhone: '',
    supplierAddress: '',
    buyerCompany: baseDraft.buyerCompany,
    buyerContact: baseDraft.buyerContact,
    buyerPhone: baseDraft.buyerPhone,
    buyerAddress: baseDraft.buyerAddress,
    buyerSigner: baseDraft.buyerSigner,
    supplierSigner: '',
    signDateText: toText(record.document_date),
    supplierSignDateText: '',
    lines,
    clauses: baseDraft.clauses,
    buyerStampVisible: baseDraft.buyerStampVisible,
    merges: [],
  })
}

function buildFallbackProcessingLine(record = {}) {
  return {
    contractNo: toText(record.document_no),
    productOrderNo: toText(record.source_no),
    productNo: toText(record.product_no),
    productName: toText(record.product_name),
    processName: '',
    supplierAlias: toText(record.supplier_name),
    processCategory: '',
    unit: toText(record.unit),
    unitPrice: '',
    quantity: toText(record.quantity),
    amount: toText(record.amount),
    remark: '',
  }
}

function mapProcessingItemToLine(item = {}, record = {}) {
  return {
    contractNo: toText(record.document_no),
    productOrderNo: toText(record.source_no),
    productNo: toText(record.product_no),
    productName: toText(record.product_name),
    processName: toText(item.item_name),
    supplierAlias: firstText(item.supplier_name, record.supplier_name),
    processCategory: toText(item.spec),
    unit: firstText(item.unit, record.unit),
    unitPrice: toText(item.unit_price),
    quantity: toText(item.quantity),
    amount: toText(item.amount),
    remark: '',
  }
}

function buildProcessingContractPrintDraft(record = {}) {
  const baseDraft = createProcessingContractDraft()
  const sourceItems = itemsOf(record)
  const lines =
    sourceItems.length > 0
      ? sourceItems.map((item) => mapProcessingItemToLine(item, record))
      : [buildFallbackProcessingLine(record)]

  return {
    ...baseDraft,
    contractNo: toText(record.document_no),
    orderDateText: toText(record.document_date),
    returnDateText: toText(record.due_date),
    supplierName: toText(record.supplier_name),
    supplierContact: '',
    supplierPhone: '',
    supplierAddress: '',
    supplierSignDateText: '',
    attachments: createEmptyProcessingAttachments(),
    lines: lines.map((line) => normalizeProcessingLine(line)),
    merges: [],
  }
}

export function buildBusinessRecordPrintDraft(moduleKey, record = {}) {
  const printTemplate = getBusinessRecordPrintTemplate(moduleKey)
  if (!printTemplate) {
    return null
  }
  if (printTemplate.key === MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY) {
    return buildMaterialPurchasePrintDraft(record)
  }
  if (printTemplate.key === PROCESSING_CONTRACT_TEMPLATE_KEY) {
    return buildProcessingContractPrintDraft(record)
  }
  return null
}
