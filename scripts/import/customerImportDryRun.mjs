#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const USAGE = `Customer import dry-run tooling

Usage:
  node scripts/import/customerImportDryRun.mjs \\
    --source scripts/import/fixtures/customers/yoyoosun/source-snapshot.sample.json \\
    --existing scripts/import/fixtures/customers/yoyoosun/existing-v1.sample.json \\
    --out output/customers/yoyoosun/import-dry-run \\
    --format json,md

Options:
  --source <path>           Required. Source snapshot JSON.
  --existing <path>         Required. Existing V1 / formal model snapshot JSON.
  --out <path>              Required. Output directory for the dry-run package.
  --format <json|md|json,md>
                            Optional. Defaults to json,md.
  --fail-on-blockers        Exit non-zero when block severity unresolved or forbidden items exist.
  --strict-source           Exit non-zero when a source row misses sourceId, sourceType, sourceKind, moduleKey, domain, or fields.
  --help                    Print this help.

This tool performs dry-run analysis only. It never connects to a database, reads server config, writes formal tables, writes business_records, or executes a real import.`

const OUTPUT_FILES = [
  'source-references.json',
  'normalized-rows.json',
  'candidates.json',
  'unresolved-queue.json',
  'duplicates.json',
  'conflicts.json',
  'forbidden-auto-import.json',
  'validation-summary.json',
  'dry-run-report.md',
]

const ALLOWED_ACTIONS = new Set(['create', 'update', 'skip', 'defer', 'forbidden', 'review'])
const ALLOWED_SEVERITIES = new Set(['block', 'defer', 'review', 'warning'])

const SOURCE_REQUIRED_FIELDS = [
  'sourceId',
  'sourceType',
  'sourceKind',
  'moduleKey',
  'domain',
  'fields',
]

const DOMAIN_TARGETS = new Map([
  ['customers', 'customers'],
  ['suppliers', 'suppliers'],
  ['contacts', 'contacts'],
  ['sales_orders', 'sales_orders'],
  ['sales_order_items', 'sales_order_items'],
  ['products', 'products'],
  ['materials', 'materials'],
  ['units', 'units'],
  ['warehouses', 'warehouses'],
  ['bom', 'bom_headers / bom_items'],
])

const DEFERRED_DOMAINS = new Map([
  ['product_skus', 'product_skus'],
  ['purchase_orders', 'purchase_orders'],
  ['purchase_order_items', 'purchase_order_items'],
  ['outsourcing', 'outsourcing source documents'],
])

const FORBIDDEN_DOMAINS = new Map([
  ['shipment', 'shipments'],
  ['shipments', 'shipments'],
  ['shipment_items', 'shipment_items'],
  ['stock_reservations', 'stock_reservations'],
  ['inventory', 'inventory facts'],
  ['inventory_txns', 'inventory_txns'],
  ['inventory_balances', 'inventory_balances'],
  ['inventory_lots', 'inventory_lots'],
  ['finance', 'finance facts'],
  ['ar_ap', 'AR/AP'],
  ['invoice', 'invoice'],
  ['invoices', 'invoice'],
  ['payment', 'payment'],
  ['payments', 'payment'],
  ['finance_reconciliation', 'finance reconciliation'],
])

const FIELD_FORBIDDEN_RULES = [
  {
    pattern: /shipping[_ -]?released|出货放行/u,
    forbiddenTarget: 'shipped facts',
    boundary: 'shipping_released != shipped',
    reason: 'shipping_released is a release / permission state, not shipped or inventory deduction.',
  },
  {
    pattern: /(^|[_ -])shipped($|[_ -])|已发货|已出库/u,
    forbiddenTarget: 'shipped facts',
    boundary: 'shipping facts require a future ShipmentUsecase.',
    reason: 'A dry-run source field cannot prove a shipped fact.',
  },
  {
    pattern: /unshipped|未出货|production_qty|生产数量/u,
    forbiddenTarget: 'shipment / production facts',
    boundary: 'sales_order remains a Source Document / Business Commitment.',
    reason: 'Fulfillment or production quantities cannot create shipment, inventory, or production facts.',
  },
  {
    pattern: /stock[_ -]?reservation|库存预留/u,
    forbiddenTarget: 'stock_reservations',
    boundary: 'stock reservation is a future fact domain.',
    reason: 'Dry-run import cannot create stock reservations.',
  },
  {
    pattern: /inventory[_ -]?(txn|transaction|balance|lot)|库存流水|库存余额|库存批次|入库数量|出库数量/u,
    forbiddenTarget: 'inventory_txn / inventory_balance / inventory_lot',
    boundary: 'inventory facts must be written by formal fact usecases.',
    reason: 'Dry-run import cannot create or mutate inventory facts.',
  },
  {
    pattern: /(^|[_ -])(ar|ap)($|[_ -])|receivable|payable|invoice|payment|reconciliation|应收|应付|发票|收款|付款|对账/u,
    forbiddenTarget: 'AR/AP / invoice / payment / finance reconciliation',
    boundary: 'finance facts are deferred to future finance review.',
    reason: 'Dry-run import cannot create finance facts.',
  },
]

const FIELD_DEFER_RULES = [
  {
    pattern: /product[_ -]?sku|sku|颜色|尺寸|包装版本/u,
    target: 'product_skus',
    reason: 'SKU, color, size, or packaging version fields are deferred and cannot create product_skus in this dry-run.',
  },
  {
    pattern: /purchase[_ -]?order|采购单|采购订单/u,
    target: 'purchase_orders',
    reason: 'Purchase order source documents are deferred and cannot be created in this dry-run.',
  },
]

const CUSTOMER_ALIASES = {
  code: ['code', 'customer_code', 'customerCode', 'document_no', 'documentNo', '客户编号', '客户代码'],
  name: ['name', 'title', 'customer_name', 'customerName', 'customer', '客户', '客户名称'],
  display: ['displayName', 'display_name', 'display', '简称'],
}

const SUPPLIER_ALIASES = {
  code: ['code', 'supplier_code', 'supplierCode', 'document_no', 'documentNo', '供应商编号', '供应商代码'],
  name: ['name', 'title', 'supplier_name', 'supplierName', 'factory_name', 'factoryName', '供应商', '供应商名称', '加工厂', '厂家名称'],
  display: ['shortName', 'short_name', 'displayName', 'display_name', '简称'],
}

const PRODUCT_ALIASES = {
  code: ['code', 'product_code', 'productCode', 'product_no', 'productNo', 'document_no', 'documentNo', '产品编号', '产品资料编号'],
  name: ['name', 'title', 'product_name', 'productName', 'item_name', 'itemName', '产品名称', '品名'],
}

const MATERIAL_ALIASES = {
  code: ['code', 'material_code', 'materialCode', 'material_no', 'materialNo', 'document_no', 'documentNo', '物料编号', '材料编号'],
  name: ['name', 'title', 'material_name', 'materialName', 'item_name', 'itemName', '材料品名', '物料名称'],
}

const UNIT_ALIASES = {
  code: ['code', 'unit_code', 'unitCode', 'unit', '单位'],
  name: ['name', 'unit_name', 'unitName', 'unit', '单位'],
}

const WAREHOUSE_ALIASES = {
  code: ['code', 'warehouse_code', 'warehouseCode', 'warehouse_no', 'warehouseNo', '仓库编号'],
  name: ['name', 'warehouse_name', 'warehouseName', 'warehouse', 'warehouse_location', '仓库', '仓库位置', '货位'],
}

const SALES_ORDER_ALIASES = {
  orderNo: ['order_no', 'orderNo', 'document_no', 'documentNo', '订单编号'],
  customerId: ['customer_id', 'customerId'],
  customerCode: ['customer_code', 'customerCode', 'customer_no', 'customerNo', '客户编号'],
  customerName: ['customer_name', 'customerName', 'customer', '客户', '客户名称'],
  orderDate: ['order_date', 'orderDate', 'document_date', 'documentDate', '订单日期'],
  expectedShipDate: ['expected_ship_date', 'expectedShipDate', 'due_date', 'dueDate', 'shipping_date', 'shippingDate', '交期', '出货日期'],
}

const SALES_ORDER_ITEM_ALIASES = {
  productId: ['product_id', 'productId'],
  productCode: ['product_code', 'productCode', 'product_no', 'productNo', '产品编号'],
  productName: ['product_name', 'productName', 'item_name', 'itemName', '产品名称'],
  unitId: ['unit_id', 'unitId'],
  unitCode: ['unit_code', 'unitCode', 'unit', '单位'],
  quantity: ['ordered_quantity', 'orderedQuantity', 'quantity', 'qty', '数量'],
}

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message)
    this.name = 'CliError'
    this.exitCode = exitCode
  }
}

export function parseCliArgs(argv) {
  const options = {
    format: 'json,md',
    failOnBlockers: false,
    strictSource: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--help' || token === '-h') {
      options.help = true
      continue
    }
    if (token === '--fail-on-blockers') {
      options.failOnBlockers = true
      continue
    }
    if (token === '--strict-source') {
      options.strictSource = true
      continue
    }
    if (!token.startsWith('--')) {
      throw new CliError(`Unexpected argument: ${token}`, 2)
    }

    const equalIndex = token.indexOf('=')
    const key = token.slice(2, equalIndex === -1 ? undefined : equalIndex)
    const inlineValue = equalIndex === -1 ? undefined : token.slice(equalIndex + 1)
    const value = inlineValue ?? argv[index + 1]
    if (inlineValue === undefined) {
      index += 1
    }
    if (value === undefined || value.startsWith('--')) {
      throw new CliError(`Missing value for --${key}`, 2)
    }

    if (key === 'source') {
      options.source = value
    } else if (key === 'existing') {
      options.existing = value
    } else if (key === 'out') {
      options.out = value
    } else if (key === 'format') {
      options.format = value
    } else {
      throw new CliError(`Unknown option: --${key}`, 2)
    }
  }

  if (options.help) {
    return options
  }
  if (!options.source) {
    throw new CliError('Missing required --source', 2)
  }
  if (!options.existing) {
    throw new CliError('Missing required --existing', 2)
  }
  if (!options.out) {
    throw new CliError('Missing required --out', 2)
  }

  const formats = parseFormats(options.format)
  return {
    ...options,
    formats,
  }
}

function parseFormats(formatText) {
  const formats = new Set(
    String(formatText)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
  if (formats.size === 0) {
    throw new CliError('--format must include json, md, or json,md', 2)
  }
  for (const format of formats) {
    if (format !== 'json' && format !== 'md') {
      throw new CliError(`Unsupported --format value: ${format}`, 2)
    }
  }
  return formats
}

export async function runDryRun(options) {
  const sourceSnapshot = await readJsonFile(options.source, 'source snapshot')
  const existingSnapshot = await readJsonFile(options.existing, 'existing snapshot')
  validateSnapshotRoot(sourceSnapshot, 'source snapshot')
  validateSnapshotRoot(existingSnapshot, 'existing snapshot')
  if (!Array.isArray(sourceSnapshot.sources)) {
    throw new CliError('Source snapshot must contain a sources array', 2)
  }

  const context = createContext({
    sourcePath: options.source,
    existingPath: options.existing,
    outDir: options.out,
    command: options.command,
    strictSource: Boolean(options.strictSource),
  })

  const existingIndex = buildExistingIndex(existingSnapshot)
  const sourceReferences = []
  const normalizedRows = []
  const candidates = []

  sourceSnapshot.sources.forEach((source, index) => {
    const row = buildNormalizedRow(source, index, context)
    sourceReferences.push(row.sourceReference)
    normalizedRows.push({
      sourceReference: row.sourceReference.sourceReferenceLabel,
      domain: row.domain,
      normalizedFields: row.normalizedFields,
      rawFields: row.rawFields,
      normalizationWarnings: row.normalizationWarnings,
      skipped: row.skipped,
      skipReason: row.skipReason,
    })

    const rowCandidates = evaluateRow(row, existingIndex, context)
    candidates.push(...rowCandidates)
  })

  const validationSummary = buildValidationSummary({
    totalSources: sourceSnapshot.sources.length,
    normalizedRows: normalizedRows.length,
    candidates,
    unresolvedQueue: context.unresolvedQueue,
    forbiddenAutoImport: context.forbiddenAutoImport,
    duplicates: context.duplicates,
    conflicts: context.conflicts,
  })

  const packageData = {
    sourceReferences: sourceReferences.map((reference) => ({
      sourceId: reference.sourceId,
      sourceType: reference.sourceType,
      sourceKind: reference.sourceKind,
      moduleKey: reference.moduleKey,
      fileName: reference.fileName,
      sheetName: reference.sheetName,
      rowNumber: reference.rowNumber,
      domain: reference.domain,
      sourceReferenceLabel: reference.sourceReferenceLabel,
    })),
    normalizedRows,
    candidates,
    unresolvedQueue: context.unresolvedQueue,
    duplicates: context.duplicates,
    conflicts: context.conflicts,
    forbiddenAutoImport: context.forbiddenAutoImport,
    validationSummary,
  }

  await writeDryRunPackage({
    outDir: options.out,
    formats: options.formats ?? parseFormats(options.format ?? 'json,md'),
    sourcePath: options.source,
    existingPath: options.existing,
    command: options.command,
    data: packageData,
  })

  return packageData
}

async function readJsonFile(filePath, label) {
  try {
    const content = await readFile(filePath, 'utf8')
    return JSON.parse(content)
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new CliError(`Cannot read ${label}: ${filePath}`, 2)
    }
    if (error instanceof SyntaxError) {
      throw new CliError(`Invalid JSON in ${label}: ${filePath}`, 2)
    }
    throw error
  }
}

function validateSnapshotRoot(snapshot, label) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new CliError(`${label} must be a JSON object`, 2)
  }
  if (snapshot.version !== 1) {
    throw new CliError(`${label} version must be 1`, 2)
  }
}

function createContext(options) {
  return {
    ...options,
    duplicates: [],
    duplicateKeys: new Set(),
    conflicts: [],
    conflictKeys: new Set(),
    forbiddenAutoImport: [],
    forbiddenKeys: new Set(),
    unresolvedQueue: [],
    unresolvedKeys: new Set(),
  }
}

function buildExistingIndex(existingSnapshot) {
  return {
    snapshot: existingSnapshot,
    customers: getExistingArray(existingSnapshot, 'customers'),
    suppliers: getExistingArray(existingSnapshot, 'suppliers'),
    contacts: getExistingArray(existingSnapshot, 'contacts'),
    salesOrders: getExistingArray(existingSnapshot, 'salesOrders', 'sales_orders'),
    salesOrderItems: getExistingArray(existingSnapshot, 'salesOrderItems', 'sales_order_items'),
    products: getExistingArray(existingSnapshot, 'products'),
    materials: getExistingArray(existingSnapshot, 'materials'),
    units: getExistingArray(existingSnapshot, 'units'),
    warehouses: getExistingArray(existingSnapshot, 'warehouses'),
    bomHeaders: getExistingArray(existingSnapshot, 'bomHeaders', 'bom_headers'),
    bomItems: getExistingArray(existingSnapshot, 'bomItems', 'bom_items'),
  }
}

function getExistingArray(snapshot, ...keys) {
  for (const key of keys) {
    if (Array.isArray(snapshot[key])) {
      return snapshot[key]
    }
  }
  return []
}

function buildNormalizedRow(source, index, context) {
  const missingFields = SOURCE_REQUIRED_FIELDS.filter((field) => {
    if (!(field in source)) {
      return true
    }
    if (field === 'fields') {
      return !source.fields || typeof source.fields !== 'object' || Array.isArray(source.fields)
    }
    return source[field] === null || source[field] === undefined || source[field] === ''
  })

  if (missingFields.length > 0 && context.strictSource) {
    throw new CliError(
      `Source row ${index + 1} misses required field(s): ${missingFields.join(', ')}`,
      2,
    )
  }

  const fallbackId = source.sourceId ?? `source-row-${index + 1}`
  const sourceReference = {
    sourceId: fallbackId,
    sourceType: source.sourceType ?? 'Unknown Source',
    sourceKind: source.sourceKind ?? 'unknown',
    moduleKey: source.moduleKey ?? 'unknown',
    fileName: source.fileName ?? 'unknown-file',
    sheetName: source.sheetName ?? null,
    rowNumber: source.rowNumber ?? null,
    domain: normalizeDomain(source.domain ?? 'unknown'),
    sourceReferenceLabel: buildSourceReferenceLabel(source, fallbackId),
  }

  const warnings = []
  const rawFields =
    source.fields && typeof source.fields === 'object' && !Array.isArray(source.fields)
      ? source.fields
      : {}
  const normalizedFields = normalizeFields(rawFields, warnings)
  const sourceType = normalizeSourceType(source.sourceType)
  const skipped = sourceType === 'demo seed' || sourceType === 'qa debug'
  const skipReason = skipped ? `${source.sourceType} rows are skipped by dry-run policy.` : null

  const row = {
    source,
    sourceReference,
    sourceType: source.sourceType ?? 'Unknown Source',
    sourceKind: source.sourceKind ?? 'unknown',
    moduleKey: source.moduleKey ?? 'unknown',
    domain: sourceReference.domain,
    rawFields,
    normalizedFields,
    normalizationWarnings: warnings,
    skipped,
    skipReason,
  }

  if (missingFields.length > 0) {
    row.normalizationWarnings.push(`Missing source required fields: ${missingFields.join(', ')}`)
    addUnresolved(context, row, {
      unresolvedType: 'missing required field',
      sourceField: missingFields.join(', '),
      sourceValue: null,
      targetCandidate: 'source snapshot',
      severity: 'block',
      ownerRole: 'Data Import',
      resolution: 'missing source metadata',
      reason: 'Source rows need sourceId, sourceType, sourceKind, moduleKey, domain, and fields before any import candidate can be trusted.',
    })
  }

  return row
}

function buildSourceReferenceLabel(source, fallbackId) {
  const filePart = source.fileName ?? 'unknown-file'
  const sheetPart = source.sheetName ? `#${source.sheetName}` : ''
  const rowPart = source.rowNumber !== null && source.rowNumber !== undefined ? `:row${source.rowNumber}` : ''
  return `${filePart}${sheetPart}${rowPart}/${fallbackId}`
}

function normalizeSourceType(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function normalizeDomain(domain) {
  return String(domain ?? '')
    .trim()
    .toLowerCase()
    .replaceAll('-', '_')
}

function normalizeFields(fields, warnings) {
  const normalized = {}
  for (const [key, value] of Object.entries(fields)) {
    normalized[key] = normalizeValue(key, value, warnings)
  }
  return normalized
}

function normalizeValue(key, value, warnings) {
  if (value === undefined) {
    return null
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(key, item, warnings))
  }
  if (typeof value === 'object') {
    const output = {}
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      output[nestedKey] = normalizeValue(nestedKey, nestedValue, warnings)
    }
    return output
  }

  const trimmed = String(value).trim()
  if (trimmed === '') {
    return null
  }
  if (isDateField(key)) {
    const date = normalizeDate(trimmed)
    if (!date) {
      warnings.push(`Invalid date value for ${key}: ${trimmed}`)
      return trimmed
    }
    return date
  }
  if (isMoneyField(key)) {
    const money = normalizeMoney(trimmed)
    if (money === null) {
      warnings.push(`Invalid money value for ${key}: ${trimmed}`)
      return trimmed
    }
    return money
  }
  if (isDecimalField(key) || looksDecimal(trimmed)) {
    const decimal = normalizeDecimal(trimmed)
    if (decimal === null) {
      warnings.push(`Invalid decimal value for ${key}: ${trimmed}`)
      return trimmed
    }
    return decimal
  }
  if (isUnitField(key)) {
    return normalizeUnitText(trimmed)
  }
  return trimmed
}

function isDateField(key) {
  return /date|日期|交期|出货日/i.test(key)
}

function isMoneyField(key) {
  return /amount|money|price|tax|金额|单价|税额|货款/i.test(key)
}

function isDecimalField(key) {
  return /quantity|qty|(?:^|[_-])count$|rate|数量|用量|损耗/i.test(key)
}

function isUnitField(key) {
  return /unit|单位/i.test(key)
}

function normalizeDate(text) {
  const normalized = text.replace(/[./年]/g, '-').replace(/[月]/g, '-').replace(/[日]/g, '')
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!match) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function looksDecimal(text) {
  return /^[-+]?\d{1,3}(,\d{3})*(\.\d+)?$|^[-+]?\d+(\.\d+)?$/.test(text)
}

function normalizeDecimal(text) {
  const cleaned = String(text).replaceAll(',', '').trim()
  if (!/^[-+]?\d+(\.\d+)?$/.test(cleaned)) {
    return null
  }
  const number = Number(cleaned)
  if (!Number.isFinite(number)) {
    return null
  }
  return cleaned.includes('.') ? String(number) : cleaned
}

function normalizeMoney(text) {
  const cleaned = String(text)
    .replace(/[¥￥$,\s]/g, '')
    .replace(/^RMB/i, '')
  return normalizeDecimal(cleaned)
}

function normalizeUnitText(text) {
  const value = text.trim()
  if (/^[a-z]+$/i.test(value)) {
    return value.toUpperCase()
  }
  return value
}

function evaluateRow(row, existingIndex, context) {
  const candidates = []
  applyFieldBoundaryRules(row, context)

  if (row.skipped) {
    candidates.push(
      buildCandidate(row, {
        targetModel: 'none',
        actionCandidate: 'skip',
        confidence: 'High',
        matchedExistingId: null,
        targetFields: {},
        reason: row.skipReason,
        warnings: row.normalizationWarnings,
      }),
    )
    return candidates
  }

  const normalizedSourceType = normalizeSourceType(row.sourceType)

  if (normalizedSourceType === 'forbidden auto import') {
    addForbidden(context, row, {
      sourceField: 'sourceType',
      sourceValue: row.sourceType,
      forbiddenTarget: 'all formal models',
      reason: 'Source type explicitly forbids auto import.',
      boundary: 'forbidden source type cannot create or update formal data.',
    })
    candidates.push(
      buildCandidate(row, {
        targetModel: 'none',
        actionCandidate: 'forbidden',
        confidence: 'High',
        matchedExistingId: null,
        targetFields: {},
        reason: 'Source type explicitly forbids auto import.',
        warnings: row.normalizationWarnings,
      }),
    )
    return candidates
  }

  if (normalizedSourceType === 'customer material') {
    candidates.push(
      buildCandidate(row, {
        targetModel: DOMAIN_TARGETS.get(row.domain) ?? 'manual review',
        actionCandidate: 'review',
        confidence: 'Low',
        matchedExistingId: null,
        targetFields: row.normalizedFields,
        reason: 'Customer Material can only enter manual review, not automatic create/update.',
        warnings: row.normalizationWarnings,
      }),
    )
    return candidates
  }

  if (normalizedSourceType === 'print template input') {
    addUnresolved(context, row, {
      unresolvedType: 'needs manual review',
      sourceField: 'sourceType',
      sourceValue: row.sourceType,
      targetCandidate: 'Print Template Input',
      severity: 'review',
      ownerRole: 'Product / Delivery',
      resolution: 'confirm template-only fields before any future import mapping',
      reason: 'Print Template Input can support template review, but cannot automatically create or update formal data.',
    })
    candidates.push(
      buildCandidate(row, {
        targetModel: 'print template / manual review',
        actionCandidate: 'review',
        confidence: 'Low',
        matchedExistingId: null,
        targetFields: row.normalizedFields,
        reason: 'Print Template Input defaults to manual review and does not auto-import facts.',
        warnings: row.normalizationWarnings,
      }),
    )
    return candidates
  }

  if (normalizedSourceType === 'industry template candidate') {
    addUnresolved(context, row, {
      unresolvedType: 'deferred domain',
      sourceField: 'sourceType',
      sourceValue: row.sourceType,
      targetCandidate: 'Industry Template Candidate',
      severity: 'defer',
      ownerRole: 'Product / Architecture',
      resolution: 'defer to industry template review',
      reason: 'Industry Template Candidate cannot become Product Core or formal data without a separate review.',
    })
    candidates.push(
      buildCandidate(row, {
        targetModel: 'industry template candidate',
        actionCandidate: 'defer',
        confidence: 'Low',
        matchedExistingId: null,
        targetFields: row.normalizedFields,
        reason: 'Industry Template Candidate defaults to deferred review, not create/update.',
        warnings: row.normalizationWarnings,
      }),
    )
    return candidates
  }

  if (DEFERRED_DOMAINS.has(row.domain)) {
    addUnresolved(context, row, {
      unresolvedType: 'deferred domain',
      sourceField: 'domain',
      sourceValue: row.domain,
      targetCandidate: DEFERRED_DOMAINS.get(row.domain),
      severity: 'defer',
      ownerRole: 'Product / Architecture',
      resolution: 'defer to future implementation task',
      reason: `${DEFERRED_DOMAINS.get(row.domain)} is not implemented by this dry-run tooling task.`,
    })
    candidates.push(
      buildCandidate(row, {
        targetModel: DEFERRED_DOMAINS.get(row.domain),
        actionCandidate: 'defer',
        confidence: 'High',
        matchedExistingId: null,
        targetFields: {},
        reason: `${DEFERRED_DOMAINS.get(row.domain)} is deferred and cannot be created or updated.`,
        warnings: row.normalizationWarnings,
      }),
    )
    return candidates
  }

  if (FORBIDDEN_DOMAINS.has(row.domain)) {
    addForbidden(context, row, {
      sourceField: 'domain',
      sourceValue: row.domain,
      forbiddenTarget: FORBIDDEN_DOMAINS.get(row.domain),
      reason: `${FORBIDDEN_DOMAINS.get(row.domain)} is a forbidden auto-import target.`,
      boundary: 'Dry-run tooling does not create shipment, inventory, or finance facts.',
    })
    candidates.push(
      buildCandidate(row, {
        targetModel: FORBIDDEN_DOMAINS.get(row.domain),
        actionCandidate: 'forbidden',
        confidence: 'High',
        matchedExistingId: null,
        targetFields: {},
        reason: `${FORBIDDEN_DOMAINS.get(row.domain)} cannot be auto-imported.`,
        warnings: row.normalizationWarnings,
      }),
    )
    return candidates
  }

  switch (row.domain) {
    case 'customers':
      candidates.push(evaluateCustomer(row, existingIndex, context))
      break
    case 'suppliers':
      candidates.push(evaluateSupplier(row, existingIndex, context))
      break
    case 'contacts':
      candidates.push(evaluateContact(row, existingIndex, context))
      break
    case 'sales_orders':
      candidates.push(evaluateSalesOrder(row, existingIndex, context))
      break
    case 'sales_order_items':
      candidates.push(evaluateSalesOrderItem(row, existingIndex, context))
      break
    case 'products':
      candidates.push(evaluateSimpleMaster(row, existingIndex.products, PRODUCT_ALIASES, 'products', context))
      break
    case 'materials':
      candidates.push(evaluateSimpleMaster(row, existingIndex.materials, MATERIAL_ALIASES, 'materials', context))
      break
    case 'units':
      candidates.push(evaluateSimpleMaster(row, existingIndex.units, UNIT_ALIASES, 'units', context))
      break
    case 'warehouses':
      candidates.push(evaluateSimpleMaster(row, existingIndex.warehouses, WAREHOUSE_ALIASES, 'warehouses', context))
      break
    case 'bom':
      candidates.push(evaluateBom(row, existingIndex, context))
      break
    default:
      addUnresolved(context, row, {
        unresolvedType: 'unmapped field',
        sourceField: 'domain',
        sourceValue: row.domain,
        targetCandidate: 'manual classification',
        severity: 'review',
        ownerRole: 'Product / Data',
        resolution: 'classify source domain',
        reason: 'Source domain is not mapped by the current dry-run rules.',
      })
      candidates.push(
        buildCandidate(row, {
          targetModel: 'manual review',
          actionCandidate: 'review',
          confidence: 'Low',
          matchedExistingId: null,
          targetFields: row.normalizedFields,
          reason: 'Domain requires manual classification before import.',
          warnings: row.normalizationWarnings,
        }),
      )
  }

  return candidates
}

function applyFieldBoundaryRules(row, context) {
  for (const [field, value] of Object.entries(row.normalizedFields)) {
    const haystack = `${field} ${value ?? ''}`
    for (const rule of FIELD_DEFER_RULES) {
      if (rule.pattern.test(haystack)) {
        addUnresolved(context, row, {
          unresolvedType: 'deferred domain',
          sourceField: field,
          sourceValue: value,
          targetCandidate: rule.target,
          severity: 'defer',
          ownerRole: 'Product / Architecture',
          resolution: 'defer to future model review',
          reason: rule.reason,
        })
      }
    }
    for (const rule of FIELD_FORBIDDEN_RULES) {
      if (rule.pattern.test(haystack)) {
        addForbidden(context, row, {
          sourceField: field,
          sourceValue: value,
          forbiddenTarget: rule.forbiddenTarget,
          reason: rule.reason,
          boundary: rule.boundary,
        })
      }
    }
    if (/workflow.*(done|完成)|task.*done|workflow_task_done/i.test(haystack)) {
      addForbidden(context, row, {
        sourceField: field,
        sourceValue: value,
        forbiddenTarget: 'fact posted',
        reason: 'Workflow task done cannot become a posted fact.',
        boundary: 'workflow task done != fact posted',
      })
    }
  }
}

function evaluateCustomer(row, existingIndex, context) {
  const match = findExistingMatch(existingIndex.customers, row.normalizedFields, CUSTOMER_ALIASES, {
    model: 'customers',
    row,
    context,
  })
  const code = pickFirst(row.normalizedFields, CUSTOMER_ALIASES.code)
  const name = pickFirst(row.normalizedFields, CUSTOMER_ALIASES.name)
  if (match.status === 'duplicate') {
    addDuplicate(context, row, {
      targetModel: 'customers',
      duplicateType: match.duplicateType,
      key: match.key,
      existingIds: match.matches.map((item) => item.id ?? item.code ?? item.name),
      reason: 'Existing customers contain multiple matches; dry-run cannot choose one.',
    })
    addUnresolved(context, row, {
      unresolvedType: match.duplicateType === 'code' ? 'duplicate code' : 'duplicate name',
      sourceField: match.duplicateType,
      sourceValue: match.key,
      targetCandidate: 'customers',
      severity: 'block',
      ownerRole: 'Sales / Data Import',
      resolution: 'merge, recode, or choose a confirmed existing customer',
      reason: 'Duplicate existing customers must be resolved manually.',
    })
    return buildCandidate(row, {
      targetModel: 'customers',
      actionCandidate: 'review',
      confidence: 'Low',
      matchedExistingId: null,
      targetFields: { code, name },
      reason: 'Duplicate existing customer match blocks automatic create/update.',
      warnings: row.normalizationWarnings,
    })
  }
  if (match.status === 'matched') {
    recordConflictsForUpdate(context, row, 'customers', match.match, { code, name }, CUSTOMER_ALIASES)
    return buildCandidate(row, {
      targetModel: 'customers',
      actionCandidate: 'update',
      confidence: 'High',
      matchedExistingId: match.match.id ?? null,
      targetFields: { code, name, displayName: pickFirst(row.normalizedFields, CUSTOMER_ALIASES.display) ?? name },
      reason: `Unique existing customer matched by ${match.matchBy}.`,
      warnings: row.normalizationWarnings,
    })
  }
  if (name || code) {
    return buildCandidate(row, {
      targetModel: 'customers',
      actionCandidate: 'create',
      confidence: name ? 'Medium' : 'Low',
      matchedExistingId: null,
      targetFields: { code, name, displayName: pickFirst(row.normalizedFields, CUSTOMER_ALIASES.display) ?? name },
      reason: 'No existing customer matched and minimum customer identity fields are present.',
      warnings: row.normalizationWarnings,
    })
  }
  addUnresolved(context, row, {
    unresolvedType: 'missing required field',
    sourceField: 'customer name/code',
    sourceValue: null,
    targetCandidate: 'customers',
    severity: 'block',
    ownerRole: 'Sales / Data Import',
    resolution: 'provide customer code or name',
    reason: 'Customer rows need at least a code or name candidate.',
  })
  return buildCandidate(row, {
    targetModel: 'customers',
    actionCandidate: 'review',
    confidence: 'Low',
    matchedExistingId: null,
    targetFields: {},
    reason: 'Missing customer identity fields.',
    warnings: row.normalizationWarnings,
  })
}

function evaluateSupplier(row, existingIndex, context) {
  const code = pickFirst(row.normalizedFields, SUPPLIER_ALIASES.code)
  const name = pickFirst(row.normalizedFields, SUPPLIER_ALIASES.name)
  const partnerType = String(pickFirst(row.normalizedFields, ['partner_type', 'partnerType', '供应商类型']) ?? '')
  const hasFactorySignal = /加工|factory/i.test(`${partnerType} ${Object.keys(row.normalizedFields).join(' ')}`)
  const match = findExistingMatch(existingIndex.suppliers, row.normalizedFields, SUPPLIER_ALIASES, {
    model: 'suppliers',
    row,
    context,
  })
  if (match.status === 'duplicate') {
    addDuplicate(context, row, {
      targetModel: 'suppliers',
      duplicateType: match.duplicateType,
      key: match.key,
      existingIds: match.matches.map((item) => item.id ?? item.code ?? item.name),
      reason: 'Existing suppliers contain multiple matches; dry-run cannot choose one.',
    })
    addUnresolved(context, row, {
      unresolvedType: match.duplicateType === 'code' ? 'duplicate code' : 'duplicate name',
      sourceField: match.duplicateType,
      sourceValue: match.key,
      targetCandidate: 'suppliers',
      severity: 'block',
      ownerRole: 'Purchase / Data Import',
      resolution: 'merge, recode, or choose a confirmed existing supplier',
      reason: 'Duplicate existing suppliers must be resolved manually.',
    })
    return buildCandidate(row, {
      targetModel: 'suppliers',
      actionCandidate: 'review',
      confidence: 'Low',
      matchedExistingId: null,
      targetFields: { code, name },
      reason: 'Duplicate existing supplier match blocks automatic create/update.',
      warnings: row.normalizationWarnings,
    })
  }
  if (hasFactorySignal) {
    addUnresolved(context, row, {
      unresolvedType: 'needs manual review',
      sourceField: 'supplier/factory role',
      sourceValue: partnerType || name,
      targetCandidate: 'suppliers',
      severity: 'review',
      ownerRole: 'Purchase / Product',
      resolution: 'confirm whether this is a supplier, outsourcing factory, or customer material',
      reason: 'Factory / supplier semantics must be confirmed before automatic create/update.',
    })
    return buildCandidate(row, {
      targetModel: 'suppliers',
      actionCandidate: 'review',
      confidence: 'Low',
      matchedExistingId: match.status === 'matched' ? match.match.id ?? null : null,
      targetFields: { code, name },
      reason: 'Supplier or factory role needs manual review.',
      warnings: row.normalizationWarnings,
    })
  }
  if (match.status === 'matched') {
    recordConflictsForUpdate(context, row, 'suppliers', match.match, { code, name }, SUPPLIER_ALIASES)
    return buildCandidate(row, {
      targetModel: 'suppliers',
      actionCandidate: 'update',
      confidence: 'High',
      matchedExistingId: match.match.id ?? null,
      targetFields: { code, name, shortName: pickFirst(row.normalizedFields, SUPPLIER_ALIASES.display) ?? null },
      reason: `Unique existing supplier matched by ${match.matchBy}.`,
      warnings: row.normalizationWarnings,
    })
  }
  if (name || code) {
    return buildCandidate(row, {
      targetModel: 'suppliers',
      actionCandidate: 'create',
      confidence: name ? 'Medium' : 'Low',
      matchedExistingId: null,
      targetFields: { code, name, shortName: pickFirst(row.normalizedFields, SUPPLIER_ALIASES.display) ?? null },
      reason: 'No existing supplier matched and minimum supplier identity fields are present.',
      warnings: row.normalizationWarnings,
    })
  }
  addUnresolved(context, row, {
    unresolvedType: 'missing required field',
    sourceField: 'supplier name/code',
    sourceValue: null,
    targetCandidate: 'suppliers',
    severity: 'block',
    ownerRole: 'Purchase / Data Import',
    resolution: 'provide supplier code or name',
    reason: 'Supplier rows need at least a code or name candidate.',
  })
  return buildCandidate(row, {
    targetModel: 'suppliers',
    actionCandidate: 'review',
    confidence: 'Low',
    matchedExistingId: null,
    targetFields: {},
    reason: 'Missing supplier identity fields.',
    warnings: row.normalizationWarnings,
  })
}

function evaluateContact(row, existingIndex, context) {
  const ownerType = pickFirst(row.normalizedFields, ['ownerType', 'owner_type'])
  const ownerId = pickFirst(row.normalizedFields, ['ownerId', 'owner_id'])
  const name = pickFirst(row.normalizedFields, ['name', 'contact_name', 'contactName', 'item_name', 'itemName', '联系人'])
  if (!ownerType || !ownerId) {
    addUnresolved(context, row, {
      unresolvedType: 'missing required field',
      sourceField: 'owner_type / owner_id',
      sourceValue: null,
      targetCandidate: 'contacts',
      severity: 'block',
      ownerRole: 'Sales / Purchase / Data Import',
      resolution: 'confirm exactly one customer or supplier owner',
      reason: 'Contacts cannot be created without a unique owner.',
    })
    return buildCandidate(row, {
      targetModel: 'contacts',
      actionCandidate: 'review',
      confidence: 'Low',
      matchedExistingId: null,
      targetFields: { name },
      reason: 'Contact owner is missing or not unique; no create candidate produced.',
      warnings: row.normalizationWarnings,
    })
  }
  const matches = existingIndex.contacts.filter((contact) => {
    return sameText(contact.ownerType ?? contact.owner_type, ownerType) && sameText(contact.ownerId ?? contact.owner_id, ownerId) && sameText(contact.name, name)
  })
  if (matches.length > 1) {
    addDuplicate(context, row, {
      targetModel: 'contacts',
      duplicateType: 'owner+name',
      key: `${ownerType}:${ownerId}:${name}`,
      existingIds: matches.map((item) => item.id ?? item.name),
      reason: 'Multiple contacts share the same owner and name.',
    })
    addUnresolved(context, row, {
      unresolvedType: 'duplicate name',
      sourceField: 'name',
      sourceValue: name,
      targetCandidate: 'contacts',
      severity: 'block',
      ownerRole: 'Data Import',
      resolution: 'choose, merge, or rename contact',
      reason: 'Duplicate contacts under the same owner must be resolved manually.',
    })
    return buildCandidate(row, {
      targetModel: 'contacts',
      actionCandidate: 'review',
      confidence: 'Low',
      matchedExistingId: null,
      targetFields: { ownerType, ownerId, name },
      reason: 'Duplicate contact match blocks automatic update.',
      warnings: row.normalizationWarnings,
    })
  }
  return buildCandidate(row, {
    targetModel: 'contacts',
    actionCandidate: matches.length === 1 ? 'update' : 'create',
    confidence: matches.length === 1 ? 'High' : 'Medium',
    matchedExistingId: matches[0]?.id ?? null,
    targetFields: { ownerType, ownerId, name },
    reason: matches.length === 1 ? 'Unique existing contact matched by owner and name.' : 'Contact owner and name are present.',
    warnings: row.normalizationWarnings,
  })
}

function evaluateSalesOrder(row, existingIndex, context) {
  const orderNo = pickFirst(row.normalizedFields, SALES_ORDER_ALIASES.orderNo)
  const customerId = resolveCustomerId(row, existingIndex, context)
  const orderDate = pickFirst(row.normalizedFields, SALES_ORDER_ALIASES.orderDate)
  const expectedShipDate = pickFirst(row.normalizedFields, SALES_ORDER_ALIASES.expectedShipDate)

  let blocked = false
  if (!orderNo) {
    blocked = true
    addUnresolved(context, row, {
      unresolvedType: 'missing required field',
      sourceField: 'order_no / document_no',
      sourceValue: null,
      targetCandidate: 'sales_orders',
      severity: 'block',
      ownerRole: 'Sales / Data Import',
      resolution: 'provide order number',
      reason: 'Sales order source documents require order_no / document_no.',
    })
  }
  if (!customerId) {
    blocked = true
    addUnresolved(context, row, {
      unresolvedType: 'unknown customer',
      sourceField: 'customer',
      sourceValue: pickFirst(row.normalizedFields, [...SALES_ORDER_ALIASES.customerCode, ...SALES_ORDER_ALIASES.customerName]) ?? null,
      targetCandidate: 'sales_orders.customer_id',
      severity: 'block',
      ownerRole: 'Sales / Data Import',
      resolution: 'match or create customer before sales order import',
      reason: 'Sales orders cannot be created without a unique existing customer or confirmed customer_id.',
    })
  }
  if (orderDate && isDateField('order_date') && !normalizeDate(String(orderDate))) {
    blocked = true
    addUnresolved(context, row, {
      unresolvedType: 'invalid date',
      sourceField: 'order_date',
      sourceValue: orderDate,
      targetCandidate: 'sales_orders.order_date',
      severity: 'block',
      ownerRole: 'Sales / Data Import',
      resolution: 'fix or remove invalid order date',
      reason: 'Invalid order dates block sales order candidates.',
    })
  }

  const matches = existingIndex.salesOrders.filter((order) => sameText(order.orderNo ?? order.order_no ?? order.document_no, orderNo))
  if (matches.length > 1) {
    blocked = true
    addDuplicate(context, row, {
      targetModel: 'sales_orders',
      duplicateType: 'order_no',
      key: orderNo,
      existingIds: matches.map((item) => item.id ?? item.orderNo ?? item.order_no),
      reason: 'Multiple existing sales orders share the same order number.',
    })
    addUnresolved(context, row, {
      unresolvedType: 'duplicate code',
      sourceField: 'order_no',
      sourceValue: orderNo,
      targetCandidate: 'sales_orders',
      severity: 'block',
      ownerRole: 'Sales / Data Import',
      resolution: 'resolve duplicate order numbers',
      reason: 'Duplicate order_no prevents automatic matching.',
    })
  }

  if (blocked) {
    return buildCandidate(row, {
      targetModel: 'sales_orders',
      actionCandidate: 'review',
      confidence: 'Low',
      matchedExistingId: null,
      targetFields: { orderNo, customerId, orderDate, expectedShipDate },
      reason: 'Sales order source document is missing required confirmed fields.',
      warnings: row.normalizationWarnings,
    })
  }

  return buildCandidate(row, {
    targetModel: 'sales_orders',
    actionCandidate: matches.length === 1 ? 'update' : 'create',
    confidence: matches.length === 1 ? 'High' : 'Medium',
    matchedExistingId: matches[0]?.id ?? null,
    targetFields: { orderNo, customerId, orderDate, expectedShipDate },
    reason: matches.length === 1 ? 'Unique existing sales order matched by order_no.' : 'Sales order source document fields are sufficient for a create candidate.',
    warnings: row.normalizationWarnings,
  })
}

function resolveCustomerId(row, existingIndex, context) {
  const directId = pickFirst(row.normalizedFields, SALES_ORDER_ALIASES.customerId)
  if (directId) {
    return directId
  }
  const code = pickFirst(row.normalizedFields, SALES_ORDER_ALIASES.customerCode)
  const name = pickFirst(row.normalizedFields, SALES_ORDER_ALIASES.customerName)
  const matches = existingIndex.customers.filter((customer) => {
    if (code && sameText(customer.code ?? customer.customer_code ?? customer.document_no, code)) {
      return true
    }
    if (name && (sameText(customer.name, name) || sameText(customer.displayName ?? customer.display_name, name))) {
      return true
    }
    return false
  })
  if (matches.length === 1) {
    return matches[0].id ?? matches[0].code ?? null
  }
  if (matches.length > 1) {
    addDuplicate(context, row, {
      targetModel: 'customers',
      duplicateType: 'customer match',
      key: code ?? name,
      existingIds: matches.map((item) => item.id ?? item.code ?? item.name),
      reason: 'Sales order customer maps to multiple existing customers.',
    })
  }
  return null
}

function evaluateSalesOrderItem(row, existingIndex, context) {
  const product = resolveSimpleExisting(row, existingIndex.products, PRODUCT_ALIASES, SALES_ORDER_ITEM_ALIASES.productId, SALES_ORDER_ITEM_ALIASES.productCode, SALES_ORDER_ITEM_ALIASES.productName)
  const unit = resolveSimpleExisting(row, existingIndex.units, UNIT_ALIASES, SALES_ORDER_ITEM_ALIASES.unitId, SALES_ORDER_ITEM_ALIASES.unitCode, SALES_ORDER_ITEM_ALIASES.unitCode)
  const quantityValue = pickFirst(row.normalizedFields, SALES_ORDER_ITEM_ALIASES.quantity)
  const quantityNumber = Number(quantityValue)
  let blocked = false

  if (product.status !== 'matched') {
    blocked = true
    addUnresolved(context, row, {
      unresolvedType: product.status === 'duplicate' ? 'duplicate name' : 'unknown product',
      sourceField: 'product',
      sourceValue: product.key ?? null,
      targetCandidate: 'sales_order_items.product_id',
      severity: 'block',
      ownerRole: 'Product / Sales / Data Import',
      resolution: 'match exactly one existing product before importing the row',
      reason: 'Sales order items require a unique existing product; product_skus are not created by this dry-run.',
    })
  }
  if (unit.status !== 'matched') {
    blocked = true
    addUnresolved(context, row, {
      unresolvedType: unit.status === 'duplicate' ? 'duplicate name' : 'unknown unit',
      sourceField: 'unit',
      sourceValue: unit.key ?? null,
      targetCandidate: 'sales_order_items.unit_id',
      severity: 'block',
      ownerRole: 'Data Import',
      resolution: 'map exactly one existing unit or defer',
      reason: 'Sales order items require a unique existing unit.',
    })
  }
  if (quantityValue === null || quantityValue === undefined || !Number.isFinite(quantityNumber) || quantityNumber < 0) {
    blocked = true
    addUnresolved(context, row, {
      unresolvedType: 'invalid quantity',
      sourceField: 'ordered_quantity',
      sourceValue: quantityValue ?? null,
      targetCandidate: 'sales_order_items.ordered_quantity',
      severity: 'block',
      ownerRole: 'Sales / Data Import',
      resolution: 'provide a decimal quantity >= 0',
      reason: 'Sales order item quantity must be a valid decimal and must not be negative.',
    })
  }

  if (blocked) {
    return buildCandidate(row, {
      targetModel: 'sales_order_items',
      actionCandidate: 'review',
      confidence: 'Low',
      matchedExistingId: null,
      targetFields: {
        productId: product.id ?? null,
        unitId: unit.id ?? null,
        orderedQuantity: quantityValue ?? null,
      },
      reason: 'Sales order item is missing product, unit, or valid quantity.',
      warnings: row.normalizationWarnings,
    })
  }
  return buildCandidate(row, {
    targetModel: 'sales_order_items',
    actionCandidate: 'create',
    confidence: 'Medium',
    matchedExistingId: null,
    targetFields: {
      productId: product.id,
      unitId: unit.id,
      orderedQuantity: String(quantityNumber),
    },
    reason: 'Product, unit, and ordered quantity are confirmed for a source document item candidate.',
    warnings: row.normalizationWarnings,
  })
}

function evaluateSimpleMaster(row, existingRows, aliases, targetModel, context) {
  const code = pickFirst(row.normalizedFields, aliases.code)
  const name = pickFirst(row.normalizedFields, aliases.name)
  const match = findExistingMatch(existingRows, row.normalizedFields, aliases, {
    model: targetModel,
    row,
    context,
  })
  if (match.status === 'duplicate') {
    addDuplicate(context, row, {
      targetModel,
      duplicateType: match.duplicateType,
      key: match.key,
      existingIds: match.matches.map((item) => item.id ?? item.code ?? item.name),
      reason: `Existing ${targetModel} contain multiple matches.`,
    })
    addUnresolved(context, row, {
      unresolvedType: match.duplicateType === 'code' ? 'duplicate code' : 'duplicate name',
      sourceField: match.duplicateType,
      sourceValue: match.key,
      targetCandidate: targetModel,
      severity: 'block',
      ownerRole: 'Data Import',
      resolution: 'resolve duplicate existing master data',
      reason: `Duplicate ${targetModel} prevents automatic matching.`,
    })
    return buildCandidate(row, {
      targetModel,
      actionCandidate: 'review',
      confidence: 'Low',
      matchedExistingId: null,
      targetFields: { code, name },
      reason: `Duplicate ${targetModel} match blocks automatic create/update.`,
      warnings: row.normalizationWarnings,
    })
  }
  if (match.status === 'matched') {
    recordConflictsForUpdate(context, row, targetModel, match.match, { code, name }, aliases)
    return buildCandidate(row, {
      targetModel,
      actionCandidate: 'update',
      confidence: 'High',
      matchedExistingId: match.match.id ?? null,
      targetFields: { code, name },
      reason: `Unique existing ${targetModel} matched by ${match.matchBy}.`,
      warnings: row.normalizationWarnings,
    })
  }
  if (code || name) {
    return buildCandidate(row, {
      targetModel,
      actionCandidate: 'create',
      confidence: name ? 'Medium' : 'Low',
      matchedExistingId: null,
      targetFields: { code, name },
      reason: `No existing ${targetModel} matched and minimum identity fields are present.`,
      warnings: row.normalizationWarnings,
    })
  }
  addUnresolved(context, row, {
    unresolvedType: 'missing required field',
    sourceField: `${targetModel} code/name`,
    sourceValue: null,
    targetCandidate: targetModel,
    severity: 'block',
    ownerRole: 'Data Import',
    resolution: 'provide code or name',
    reason: `${targetModel} rows need at least a code or name candidate.`,
  })
  return buildCandidate(row, {
    targetModel,
    actionCandidate: 'review',
    confidence: 'Low',
    matchedExistingId: null,
    targetFields: {},
    reason: `Missing ${targetModel} identity fields.`,
    warnings: row.normalizationWarnings,
  })
}

function evaluateBom(row, existingIndex, context) {
  const product = resolveSimpleExisting(row, existingIndex.products, PRODUCT_ALIASES, ['product_id', 'productId'], PRODUCT_ALIASES.code, PRODUCT_ALIASES.name)
  const material = resolveSimpleExisting(row, existingIndex.materials, MATERIAL_ALIASES, ['material_id', 'materialId'], MATERIAL_ALIASES.code, MATERIAL_ALIASES.name)
  const unit = resolveSimpleExisting(row, existingIndex.units, UNIT_ALIASES, ['unit_id', 'unitId'], UNIT_ALIASES.code, UNIT_ALIASES.name)
  let blocked = false
  for (const [label, result] of [
    ['product', product],
    ['material', material],
    ['unit', unit],
  ]) {
    if (result.status !== 'matched') {
      blocked = true
      addUnresolved(context, row, {
        unresolvedType: result.status === 'duplicate' ? 'duplicate name' : `unknown ${label}`,
        sourceField: label,
        sourceValue: result.key ?? null,
        targetCandidate: `bom.${label}`,
        severity: 'block',
        ownerRole: 'Engineering / Data Import',
        resolution: `match exactly one existing ${label}`,
        reason: `BOM candidate needs a unique ${label}; dry-run does not write inventory facts.`,
      })
    }
  }
  return buildCandidate(row, {
    targetModel: 'bom_headers / bom_items',
    actionCandidate: blocked ? 'review' : 'create',
    confidence: blocked ? 'Low' : 'Medium',
    matchedExistingId: null,
    targetFields: {
      productId: product.id ?? null,
      materialId: material.id ?? null,
      unitId: unit.id ?? null,
    },
    reason: blocked ? 'BOM candidate requires manual review before any future import.' : 'BOM candidate has confirmed product, material, and unit.',
    warnings: row.normalizationWarnings,
  })
}

function findExistingMatch(existingRows, fields, aliases) {
  const code = pickFirst(fields, aliases.code)
  if (code) {
    const matches = existingRows.filter((item) => sameText(anyExistingValue(item, aliases.code), code))
    if (matches.length === 1) {
      return { status: 'matched', match: matches[0], matchBy: 'code' }
    }
    if (matches.length > 1) {
      return { status: 'duplicate', duplicateType: 'code', key: code, matches }
    }
  }

  const name = pickFirst(fields, aliases.name)
  if (name) {
    const matches = existingRows.filter((item) => sameText(anyExistingValue(item, aliases.name), name))
    if (matches.length === 1) {
      return { status: 'matched', match: matches[0], matchBy: 'name' }
    }
    if (matches.length > 1) {
      return { status: 'duplicate', duplicateType: 'name', key: name, matches }
    }
  }

  const display = aliases.display ? pickFirst(fields, aliases.display) : null
  if (display) {
    const matches = existingRows.filter((item) => sameText(anyExistingValue(item, aliases.display), display))
    if (matches.length === 1) {
      return { status: 'matched', match: matches[0], matchBy: 'displayName' }
    }
    if (matches.length > 1) {
      return { status: 'duplicate', duplicateType: 'displayName', key: display, matches }
    }
  }

  return { status: 'none' }
}

function resolveSimpleExisting(row, existingRows, aliases, idAliases, codeAliases, nameAliases) {
  const directId = pickFirst(row.normalizedFields, idAliases)
  if (directId) {
    const matches = existingRows.filter((item) => sameText(item.id, directId))
    if (matches.length === 1) {
      return { status: 'matched', id: matches[0].id, match: matches[0], key: directId }
    }
    if (matches.length > 1) {
      return { status: 'duplicate', key: directId }
    }
  }
  const code = pickFirst(row.normalizedFields, codeAliases)
  const name = pickFirst(row.normalizedFields, nameAliases)
  const matches = existingRows.filter((item) => {
    if (code && sameText(anyExistingValue(item, aliases.code), code)) {
      return true
    }
    if (name && sameText(anyExistingValue(item, aliases.name), name)) {
      return true
    }
    return false
  })
  if (matches.length === 1) {
    return { status: 'matched', id: matches[0].id ?? matches[0].code ?? matches[0].name, match: matches[0], key: code ?? name }
  }
  if (matches.length > 1) {
    return { status: 'duplicate', key: code ?? name }
  }
  return { status: 'none', key: code ?? name }
}

function anyExistingValue(item, aliases = []) {
  for (const alias of aliases) {
    if (item[alias] !== undefined && item[alias] !== null && item[alias] !== '') {
      return item[alias]
    }
  }
  return null
}

function pickFirst(fields, aliases = []) {
  for (const alias of aliases) {
    if (fields[alias] !== undefined && fields[alias] !== null && fields[alias] !== '') {
      return fields[alias]
    }
  }
  return null
}

function sameText(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) {
    return false
  }
  return String(left).trim().toLowerCase() === String(right).trim().toLowerCase()
}

function recordConflictsForUpdate(context, row, targetModel, existing, targetFields, aliases) {
  const sourceName = targetFields.name
  const existingName = anyExistingValue(existing, aliases.name)
  if (sourceName && existingName && !sameText(sourceName, existingName)) {
    addConflict(context, row, {
      targetModel,
      conflictType: 'field mismatch',
      key: targetFields.code ?? sourceName,
      existingId: existing.id ?? null,
      before: { name: existingName },
      afterCandidate: { name: sourceName },
      reason: 'Source row matches by code but name differs from existing record.',
    })
  }
}

function buildCandidate(row, input) {
  if (!ALLOWED_ACTIONS.has(input.actionCandidate)) {
    throw new Error(`Invalid actionCandidate: ${input.actionCandidate}`)
  }
  return {
    sourceReference: row.sourceReference.sourceReferenceLabel,
    targetModel: input.targetModel,
    actionCandidate: input.actionCandidate,
    confidence: input.confidence,
    matchedExistingId: input.matchedExistingId ?? null,
    targetFields: input.targetFields ?? {},
    reason: input.reason,
    warnings: input.warnings ?? [],
  }
}

function addUnresolved(context, row, input) {
  if (!ALLOWED_SEVERITIES.has(input.severity)) {
    throw new Error(`Invalid unresolved severity: ${input.severity}`)
  }
  const key = [
    row.sourceReference.sourceReferenceLabel,
    input.unresolvedType,
    input.sourceField,
    input.targetCandidate,
    input.severity,
  ].join('|')
  if (context.unresolvedKeys.has(key)) {
    return
  }
  context.unresolvedKeys.add(key)
  context.unresolvedQueue.push({
    sourceReference: row.sourceReference.sourceReferenceLabel,
    sourceType: row.sourceType,
    domain: row.domain,
    unresolvedType: input.unresolvedType,
    sourceField: input.sourceField,
    sourceValue: input.sourceValue ?? null,
    targetCandidate: input.targetCandidate,
    severity: input.severity,
    ownerRole: input.ownerRole,
    resolution: input.resolution,
    decisionNote: '',
    reason: input.reason,
  })
}

function addDuplicate(context, row, input) {
  const key = [
    input.targetModel,
    input.duplicateType,
    input.key,
    row.sourceReference.sourceReferenceLabel,
  ].join('|')
  if (context.duplicateKeys.has(key)) {
    return
  }
  context.duplicateKeys.add(key)
  context.duplicates.push({
    targetModel: input.targetModel,
    duplicateType: input.duplicateType,
    key: input.key ?? null,
    sourceReferences: [row.sourceReference.sourceReferenceLabel],
    existingIds: input.existingIds ?? [],
    reason: input.reason,
  })
}

function addConflict(context, row, input) {
  const key = [
    input.targetModel,
    input.conflictType,
    input.key,
    row.sourceReference.sourceReferenceLabel,
    input.existingId,
  ].join('|')
  if (context.conflictKeys.has(key)) {
    return
  }
  context.conflictKeys.add(key)
  context.conflicts.push({
    targetModel: input.targetModel,
    conflictType: input.conflictType,
    key: input.key ?? null,
    sourceReference: row.sourceReference.sourceReferenceLabel,
    existingId: input.existingId ?? null,
    before: input.before ?? {},
    afterCandidate: input.afterCandidate ?? {},
    reason: input.reason,
  })
}

function addForbidden(context, row, input) {
  const key = [
    row.sourceReference.sourceReferenceLabel,
    input.sourceField,
    input.forbiddenTarget,
    input.boundary,
  ].join('|')
  if (context.forbiddenKeys.has(key)) {
    return
  }
  context.forbiddenKeys.add(key)
  context.forbiddenAutoImport.push({
    sourceReference: row.sourceReference.sourceReferenceLabel,
    domain: row.domain,
    sourceField: input.sourceField,
    sourceValue: input.sourceValue ?? null,
    forbiddenTarget: input.forbiddenTarget,
    reason: input.reason,
    boundary: input.boundary,
  })
  addUnresolved(context, row, {
    unresolvedType: 'forbidden fact generation',
    sourceField: input.sourceField,
    sourceValue: input.sourceValue ?? null,
    targetCandidate: input.forbiddenTarget,
    severity: 'block',
    ownerRole: 'Architecture / Data Import',
    resolution: 'forbidden',
    reason: `${input.reason} Boundary: ${input.boundary}`,
  })
}

function buildValidationSummary(input) {
  const candidateCountsByAction = countBy(input.candidates, 'actionCandidate')
  const unresolvedCountsBySeverity = countBy(input.unresolvedQueue, 'severity')
  for (const action of ALLOWED_ACTIONS) {
    candidateCountsByAction[action] ??= 0
  }
  for (const severity of ALLOWED_SEVERITIES) {
    unresolvedCountsBySeverity[severity] ??= 0
  }
  const blockerCount = unresolvedCountsBySeverity.block + input.forbiddenAutoImport.length
  return {
    totalSources: input.totalSources,
    normalizedRows: input.normalizedRows,
    candidateCountsByAction,
    unresolvedCountsBySeverity,
    forbiddenCount: input.forbiddenAutoImport.length,
    duplicateCount: input.duplicates.length,
    conflictCount: input.conflicts.length,
    blockerCount,
    canProceedToManualReview: input.totalSources > 0,
    canExecuteRealImport: false,
  }
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key]
    acc[value] = (acc[value] ?? 0) + 1
    return acc
  }, {})
}

async function writeDryRunPackage({ outDir, formats, sourcePath, existingPath, command, data }) {
  await mkdir(outDir, { recursive: true })
  if (formats.has('json')) {
    await writeJson(path.join(outDir, 'source-references.json'), data.sourceReferences)
    await writeJson(path.join(outDir, 'normalized-rows.json'), data.normalizedRows)
    await writeJson(path.join(outDir, 'candidates.json'), data.candidates)
    await writeJson(path.join(outDir, 'unresolved-queue.json'), data.unresolvedQueue)
    await writeJson(path.join(outDir, 'duplicates.json'), data.duplicates)
    await writeJson(path.join(outDir, 'conflicts.json'), data.conflicts)
    await writeJson(path.join(outDir, 'forbidden-auto-import.json'), data.forbiddenAutoImport)
    await writeJson(path.join(outDir, 'validation-summary.json'), data.validationSummary)
  }
  if (formats.has('md')) {
    await writeFile(
      path.join(outDir, 'dry-run-report.md'),
      renderMarkdownReport({
        sourcePath,
        existingPath,
        outDir,
        command,
        data,
      }),
      'utf8',
    )
  }
}

async function writeJson(filePath, data) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function renderMarkdownReport({ sourcePath, existingPath, outDir, command, data }) {
  const summary = data.validationSummary
  const candidateRows = Object.entries(summary.candidateCountsByAction)
    .map(([action, count]) => `| ${action} | ${count} |`)
    .join('\n')
  const unresolvedRows = Object.entries(summary.unresolvedCountsBySeverity)
    .map(([severity, count]) => `| ${severity} | ${count} |`)
    .join('\n')
  const forbiddenList =
    data.forbiddenAutoImport.length === 0
      ? '- None'
      : data.forbiddenAutoImport
          .slice(0, 20)
          .map((item) => `- ${item.sourceReference}: ${item.forbiddenTarget} (${item.boundary})`)
          .join('\n')
  const duplicateList =
    data.duplicates.length === 0
      ? '- None'
      : data.duplicates
          .slice(0, 20)
          .map((item) => `- ${item.targetModel} ${item.duplicateType} ${item.key}: ${item.reason}`)
          .join('\n')
  const conflictList =
    data.conflicts.length === 0
      ? '- None'
      : data.conflicts
          .slice(0, 20)
          .map((item) => `- ${item.targetModel} ${item.key}: ${item.reason}`)
          .join('\n')

  return `# Yoyoosun Customer Import Dry-run Report

## Command

\`\`\`bash
${command ?? 'node scripts/import/customerImportDryRun.mjs ...'}
\`\`\`

## Inputs

- Source snapshot: \`${sourcePath}\`
- Existing snapshot: \`${existingPath}\`
- Output directory: \`${outDir}\`

## Summary

| Metric | Value |
|---|---:|
| totalSources | ${summary.totalSources} |
| normalizedRows | ${summary.normalizedRows} |
| forbiddenCount | ${summary.forbiddenCount} |
| duplicateCount | ${summary.duplicateCount} |
| conflictCount | ${summary.conflictCount} |
| blockerCount | ${summary.blockerCount} |
| canProceedToManualReview | ${summary.canProceedToManualReview} |
| canExecuteRealImport | ${summary.canExecuteRealImport} |

## Candidate Counts

| actionCandidate | count |
|---|---:|
${candidateRows}

## Unresolved Counts

| severity | count |
|---|---:|
${unresolvedRows}

## Forbidden Auto-import Summary

${forbiddenList}

## Duplicate Summary

${duplicateList}

## Conflict Summary

${conflictList}

## No real import

No real import is executed by this dry-run package. The tool does not connect to a database, does not write formal V1 tables, does not write \`business_records\`, does not create SQL, and does not modify schema, API, UI, seedData, or docs registry. \`canExecuteRealImport\` is always \`false\`.

## Next manual review steps

1. Review \`unresolved-queue.json\` and resolve block / defer / review items manually.
2. Review \`duplicates.json\` and \`conflicts.json\` before any future loader design.
3. Confirm \`forbidden-auto-import.json\` remains excluded from real import.
4. Only a separate future implementation task may design or implement real import execution with backup, rollback, idempotency, validation, and customer sign-off.
`
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv)
  if (options.help) {
    console.log(USAGE)
    return 0
  }
  const command = `node scripts/import/customerImportDryRun.mjs ${argv.map(quoteArg).join(' ')}`
  const data = await runDryRun({ ...options, command })
  if (options.failOnBlockers && (data.validationSummary.blockerCount > 0 || data.validationSummary.forbiddenCount > 0)) {
    console.error(
      `Dry-run blockers found: blockerCount=${data.validationSummary.blockerCount}, forbiddenCount=${data.validationSummary.forbiddenCount}`,
    )
    return 1
  }
  console.log(`Dry-run package written to ${options.out}`)
  console.log(`canExecuteRealImport: ${data.validationSummary.canExecuteRealImport}`)
  return 0
}

function quoteArg(arg) {
  if (/^[A-Za-z0-9_./:=,-]+$/.test(arg)) {
    return arg
  }
  return JSON.stringify(arg)
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  runCli()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      if (error instanceof CliError) {
        console.error(error.message)
        process.exitCode = error.exitCode
        return
      }
      console.error(error)
      process.exitCode = 1
    })
}

export { OUTPUT_FILES, USAGE }
