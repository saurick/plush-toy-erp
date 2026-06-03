#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const USAGE = `Customer source snapshot freeze checker

Usage:
  node scripts/import/customerSourceSnapshotFreezeCheck.mjs \\
    --source scripts/import/fixtures/customers/yoyoosun/source-snapshot.freeze.sample.json \\
    --existing scripts/import/fixtures/customers/yoyoosun/existing-v1.freeze.sample.json \\
    --out output/customers/yoyoosun/source-snapshot-freeze

Options:
  --source <path>    Required. Source snapshot JSON.
  --existing <path>  Required. Existing V1 / formal model snapshot JSON.
  --out <path>       Required. Output directory for freeze evidence.
  --help             Print this help.

This tool freezes evidence only. It never connects to a database, reads server config, writes formal tables, writes business_records, generates SQL, generates migrations, or executes a real import.`

const OUTPUT_FILES = [
  'freeze-metadata.json',
  'freeze-check-summary.json',
  'freeze-check-report.md',
]

const ALLOWED_DOMAINS = new Set([
  'customers',
  'suppliers',
  'contacts',
  'sales_orders',
  'sales_order_items',
  'products',
  'materials',
  'units',
  'warehouses',
  'bom',
  'product_skus',
  'purchase_orders',
  'purchase_order_items',
  'outsourcing',
  'shipment',
  'shipments',
  'shipment_items',
  'stock_reservations',
  'inventory',
  'inventory_txns',
  'inventory_balances',
  'inventory_lots',
  'finance',
  'ar_ap',
  'invoice',
  'invoices',
  'payment',
  'payments',
  'finance_reconciliation',
])

const EXISTING_ARRAY_FIELDS = [
  'customers',
  'suppliers',
  'contacts',
  'salesOrders',
  'salesOrderItems',
  'products',
  'materials',
  'units',
  'warehouses',
  'bomHeaders',
  'bomItems',
]

const SOURCE_REFERENCE_FIELDS = [
  'sourceId',
  'sourceKind',
  'moduleKey',
  'fileName',
  'domain',
]

const SENSITIVE_FIELD_PATTERNS = [
  /phone/i,
  /mobile/i,
  /\btel\b/i,
  /email/i,
  /address/i,
  /contact/i,
  /联系电话/u,
  /手机/u,
  /电话/u,
  /邮箱/u,
  /地址/u,
  /联系人/u,
  /身份证/u,
  /银行/u,
  /账号/u,
]

const FORBIDDEN_FIELD_PATTERNS = [
  { pattern: /shipment/i, target: 'shipment facts', boundary: 'sales_order != shipment' },
  { pattern: /\bshipped\b/i, target: 'shipped facts', boundary: 'shipping_released != shipped' },
  { pattern: /shipping[_ -]?released/i, target: 'shipped facts', boundary: 'shipping_released != shipped' },
  { pattern: /stock[_ -]?reservation/i, target: 'stock_reservations', boundary: 'future fact domain' },
  { pattern: /inventory[_ -]?txn/i, target: 'inventory_txns', boundary: 'inventory facts require formal usecase' },
  { pattern: /inventory[_ -]?balance/i, target: 'inventory_balances', boundary: 'inventory facts require formal usecase' },
  { pattern: /inventory[_ -]?lot/i, target: 'inventory_lots', boundary: 'inventory facts require formal usecase' },
  { pattern: /\binvoice\b/i, target: 'invoice facts', boundary: 'finance facts deferred' },
  { pattern: /\bpayment\b/i, target: 'payment facts', boundary: 'finance facts deferred' },
  { pattern: /receivable/i, target: 'receivable facts', boundary: 'finance facts deferred' },
  { pattern: /payable/i, target: 'payable facts', boundary: 'finance facts deferred' },
  { pattern: /reconciliation/i, target: 'finance reconciliation', boundary: 'finance facts deferred' },
  { pattern: /已发货/u, target: 'shipped facts', boundary: 'shipping_released != shipped' },
  { pattern: /已出库/u, target: 'shipment / inventory facts', boundary: 'shipment and inventory facts deferred' },
  { pattern: /库存流水/u, target: 'inventory_txns', boundary: 'inventory facts require formal usecase' },
  { pattern: /库存余额/u, target: 'inventory_balances', boundary: 'inventory facts require formal usecase' },
  { pattern: /发票/u, target: 'invoice facts', boundary: 'finance facts deferred' },
  { pattern: /收款/u, target: 'payment facts', boundary: 'finance facts deferred' },
  { pattern: /付款/u, target: 'payment facts', boundary: 'finance facts deferred' },
  { pattern: /应收/u, target: 'receivable facts', boundary: 'finance facts deferred' },
  { pattern: /应付/u, target: 'payable facts', boundary: 'finance facts deferred' },
  { pattern: /对账/u, target: 'finance reconciliation', boundary: 'finance facts deferred' },
]

const DEFERRED_FIELD_PATTERNS = [
  { pattern: /\bsku\b/i, target: 'product_skus' },
  { pattern: /product[_ -]?sku/i, target: 'product_skus' },
  { pattern: /\bcolor\b/i, target: 'product_skus' },
  { pattern: /\bsize\b/i, target: 'product_skus' },
  { pattern: /packing[_ -]?version/i, target: 'product_skus' },
  { pattern: /purchase[_ -]?order/i, target: 'purchase_orders' },
  { pattern: /颜色/u, target: 'product_skus' },
  { pattern: /尺寸/u, target: 'product_skus' },
  { pattern: /包装版本/u, target: 'product_skus' },
  { pattern: /采购订单/u, target: 'purchase_orders' },
  { pattern: /采购单/u, target: 'purchase_orders' },
]

const SHIPPING_BOUNDARY_PATTERNS = [
  /shipping[_ -]?released/i,
  /\bshipped\b/i,
  /已发货/u,
  /已出库/u,
]

const WORKFLOW_FACT_PATTERNS = [
  /workflow.*done/i,
  /task.*done/i,
  /workflow_task_done/i,
  /fact[_ -]?posted/i,
  /事实.*过账/u,
  /任务.*完成/u,
]

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message)
    this.name = 'CliError'
    this.exitCode = exitCode
  }
}

export function parseCliArgs(argv) {
  const options = { help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--help' || token === '-h') {
      options.help = true
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
  return options
}

export async function runFreezeCheck(options) {
  const [sourceFile, existingFile] = await Promise.all([
    readSnapshotFile(options.source, 'source snapshot'),
    readSnapshotFile(options.existing, 'existing snapshot'),
  ])

  const context = createContext()
  validateSourceSnapshot(sourceFile.json, context)
  validateExistingSnapshot(existingFile.json, context)

  const sources = Array.isArray(sourceFile.json.sources) ? sourceFile.json.sources : []
  const sourceRows = sources.map((source, index) => buildSourceRow(source, index, context))
  scanSourceRows(sourceRows, context)

  const sourceSha256 = sha256(sourceFile.raw)
  const existingSha256 = sha256(existingFile.raw)
  const freezeDate = new Date().toISOString()
  const command = options.command ?? 'node scripts/import/customerSourceSnapshotFreezeCheck.mjs ...'

  const metadata = {
    freezeId: `customer-freeze-${sourceSha256.slice(0, 12)}-${existingSha256.slice(0, 12)}`,
    freezeDate,
    sourcePath: options.source,
    existingPath: options.existing,
    sourceSha256,
    existingSha256,
    sourceSizeBytes: sourceFile.sizeBytes,
    existingSizeBytes: existingFile.sizeBytes,
    sourceCount: sources.length,
    domainCounts: countBy(sourceRows, 'domain'),
    sourceKindCounts: countBy(sourceRows, 'sourceKind'),
    sourceTypeCounts: countBy(sourceRows, 'sourceType'),
    cli: {
      name: 'customerSourceSnapshotFreezeCheck.mjs',
      command,
      outputFiles: OUTPUT_FILES,
    },
    noRealImport: true,
    canExecuteRealImport: false,
    generatedBy: 'scripts/import/customerSourceSnapshotFreezeCheck.mjs',
    manualReviewRequired: true,
  }

  const summary = buildSummary(sources.length, context)
  await writeFreezePackage({
    outDir: options.out,
    sourcePath: options.source,
    existingPath: options.existing,
    command,
    metadata,
    summary,
    sourceRows,
  })

  return { metadata, summary, sourceRows }
}

async function readSnapshotFile(filePath, label) {
  let raw
  try {
    raw = await readFile(filePath)
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new CliError(`Cannot read ${label}: ${filePath}`, 2)
    }
    throw error
  }
  let json
  try {
    json = JSON.parse(raw.toString('utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CliError(`Invalid JSON in ${label}: ${filePath}`, 2)
    }
    throw error
  }
  const fileStat = await stat(filePath)
  return { raw, json, sizeBytes: fileStat.size }
}

function createContext() {
  return {
    blockers: [],
    warnings: [],
    blockerKeys: new Set(),
    warningKeys: new Set(),
    duplicateSourceIds: new Set(),
    duplicateSourceIdCount: 0,
    invalidDomainCount: 0,
    invalidFieldsCount: 0,
    missingSourceReferenceCount: 0,
    sensitiveFieldCount: 0,
    forbiddenFieldCount: 0,
    deferredFieldCount: 0,
    shippingBoundaryRiskCount: 0,
    workflowFactBoundaryRiskCount: 0,
  }
}

function validateSourceSnapshot(snapshot, context) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    addBlocker(context, {
      riskType: 'invalid-source-root',
      reason: 'Source snapshot must be a JSON object.',
    })
    return
  }
  if (snapshot.version !== 1) {
    addBlocker(context, {
      riskType: 'invalid-source-version',
      reason: 'Source snapshot version must be 1.',
    })
  }
  if (!snapshot.generatedAt) {
    addBlocker(context, {
      riskType: 'missing-generated-at',
      reason: 'Source snapshot generatedAt is required for freeze traceability.',
    })
  }
  if (!Array.isArray(snapshot.sources)) {
    addBlocker(context, {
      riskType: 'invalid-sources-array',
      reason: 'Source snapshot must contain a sources array.',
    })
  }
}

function validateExistingSnapshot(snapshot, context) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    addBlocker(context, {
      riskType: 'invalid-existing-root',
      reason: 'Existing snapshot must be a JSON object.',
    })
    return
  }
  if (snapshot.version !== 1) {
    addBlocker(context, {
      riskType: 'invalid-existing-version',
      reason: 'Existing snapshot version must be 1.',
    })
  }
  for (const field of EXISTING_ARRAY_FIELDS) {
    if (field in snapshot && !Array.isArray(snapshot[field])) {
      addBlocker(context, {
        riskType: 'invalid-existing-array',
        fieldName: field,
        reason: `Existing snapshot field ${field} must be an array when present.`,
      })
    }
  }
}

function buildSourceRow(source, index, context) {
  const fallbackSourceId =
    source && typeof source === 'object' && !Array.isArray(source) && source.sourceId
      ? String(source.sourceId)
      : `source-row-${index + 1}`
  const row = {
    index,
    source,
    sourceId: fallbackSourceId,
    sourceType: valueOrUnknown(source?.sourceType),
    sourceKind: valueOrUnknown(source?.sourceKind),
    moduleKey: valueOrUnknown(source?.moduleKey),
    fileName: valueOrUnknown(source?.fileName),
    sheetName: source?.sheetName ?? null,
    rowNumber: source?.rowNumber ?? null,
    domain: normalizeDomain(source?.domain),
    fields: source?.fields,
    sourceReference: null,
  }
  row.sourceReference = buildSourceReference(row)

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    addBlocker(context, {
      sourceId: row.sourceId,
      sourceReference: row.sourceReference,
      riskType: 'invalid-source-row',
      reason: 'Each source row must be a JSON object.',
    })
    return row
  }

  const missingTraceFields = SOURCE_REFERENCE_FIELDS.filter((field) => {
    const value = source[field]
    return value === undefined || value === null || value === ''
  })
  if (missingTraceFields.length > 0) {
    context.missingSourceReferenceCount += 1
    addBlocker(context, {
      sourceId: row.sourceId,
      sourceReference: row.sourceReference,
      riskType: 'missing-source-reference',
      fieldName: missingTraceFields.join(', '),
      reason: 'Source reference must include sourceId, sourceKind, moduleKey, fileName, and domain.',
    })
  }

  if (!('sourceType' in source) || source.sourceType === null || source.sourceType === '') {
    addBlocker(context, {
      sourceId: row.sourceId,
      sourceReference: row.sourceReference,
      riskType: 'missing-source-type',
      fieldName: 'sourceType',
      reason: 'Source type is required for freeze classification.',
    })
  }

  if (!ALLOWED_DOMAINS.has(row.domain)) {
    context.invalidDomainCount += 1
    addBlocker(context, {
      sourceId: row.sourceId,
      sourceReference: row.sourceReference,
      riskType: 'invalid-domain',
      fieldName: 'domain',
      reason: `Unknown domain "${row.domain}" is not allowed in the freeze snapshot.`,
    })
  }

  if (!source.fields || typeof source.fields !== 'object' || Array.isArray(source.fields)) {
    context.invalidFieldsCount += 1
    addBlocker(context, {
      sourceId: row.sourceId,
      sourceReference: row.sourceReference,
      riskType: 'invalid-fields',
      fieldName: 'fields',
      reason: 'Source fields must be a JSON object.',
    })
  }

  return row
}

function scanSourceRows(sourceRows, context) {
  const seenSourceIds = new Map()
  for (const row of sourceRows) {
    if (row.sourceId) {
      if (seenSourceIds.has(row.sourceId)) {
        context.duplicateSourceIds.add(row.sourceId)
        addBlocker(context, {
          sourceId: row.sourceId,
          sourceReference: row.sourceReference,
          riskType: 'duplicate-source-id',
          fieldName: 'sourceId',
          reason: `Duplicate sourceId "${row.sourceId}" appears in source snapshot.`,
        })
      } else {
        seenSourceIds.set(row.sourceId, row)
      }
    }

    if (row.fields && typeof row.fields === 'object' && !Array.isArray(row.fields)) {
      scanFields(row, context)
    }
  }
  context.duplicateSourceIdCount = context.duplicateSourceIds.size
}

function scanFields(row, context) {
  for (const field of flattenFields(row.fields)) {
    const haystack = `${field.path} ${field.valueText}`.trim()
    const nameOnly = field.path

    if (SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(nameOnly))) {
      context.sensitiveFieldCount += 1
      addWarning(context, {
        sourceId: row.sourceId,
        sourceReference: row.sourceReference,
        riskType: 'sensitive-field',
        fieldName: field.path,
        reason: 'Field name may contain personal or sensitive data; raw value is intentionally omitted from freeze evidence.',
      })
    }

    for (const rule of FORBIDDEN_FIELD_PATTERNS) {
      if (rule.pattern.test(haystack)) {
        context.forbiddenFieldCount += 1
        addBlocker(context, {
          sourceId: row.sourceId,
          sourceReference: row.sourceReference,
          riskType: 'forbidden-field',
          fieldName: field.path,
          targetCandidate: rule.target,
          boundary: rule.boundary,
          reason: `Forbidden fact-like field or value requires manual exclusion before any future import.`,
        })
      }
    }

    for (const rule of DEFERRED_FIELD_PATTERNS) {
      if (rule.pattern.test(haystack)) {
        context.deferredFieldCount += 1
        addWarning(context, {
          sourceId: row.sourceId,
          sourceReference: row.sourceReference,
          riskType: 'deferred-field',
          fieldName: field.path,
          targetCandidate: rule.target,
          reason: `${rule.target} is deferred and cannot be auto-imported from this freeze snapshot.`,
        })
      }
    }

    if (SHIPPING_BOUNDARY_PATTERNS.some((pattern) => pattern.test(haystack))) {
      context.shippingBoundaryRiskCount += 1
      addBlocker(context, {
        sourceId: row.sourceId,
        sourceReference: row.sourceReference,
        riskType: 'shipping-boundary-risk',
        fieldName: field.path,
        boundary: 'shipping_released != shipped',
        reason: 'Shipment release or shipped wording must not become shipment, shipped, or inventory facts.',
      })
    }

    if (WORKFLOW_FACT_PATTERNS.some((pattern) => pattern.test(haystack))) {
      context.workflowFactBoundaryRiskCount += 1
      addBlocker(context, {
        sourceId: row.sourceId,
        sourceReference: row.sourceReference,
        riskType: 'workflow-fact-boundary-risk',
        fieldName: field.path,
        boundary: 'workflow task done != fact posted',
        reason: 'Workflow completion wording must not become fact posting evidence.',
      })
    }
  }
}

function flattenFields(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }
  const output = []
  for (const [key, nestedValue] of Object.entries(value)) {
    const pathName = prefix ? `${prefix}.${key}` : key
    if (nestedValue && typeof nestedValue === 'object' && !Array.isArray(nestedValue)) {
      output.push(...flattenFields(nestedValue, pathName))
      continue
    }
    if (Array.isArray(nestedValue)) {
      nestedValue.forEach((item, index) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          output.push(...flattenFields(item, `${pathName}[${index}]`))
          return
        }
        output.push({ path: `${pathName}[${index}]`, valueText: scalarToText(item) })
      })
      continue
    }
    output.push({ path: pathName, valueText: scalarToText(nestedValue) })
  }
  return output
}

function scalarToText(value) {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return ''
}

function buildSourceReference(row) {
  return {
    sourceId: row.sourceId,
    sourceKind: row.sourceKind,
    moduleKey: row.moduleKey,
    fileName: row.fileName,
    sheetName: row.sheetName,
    rowNumber: row.rowNumber,
    domain: row.domain,
    label: `${row.fileName}${row.sheetName ? `#${row.sheetName}` : '#<empty-sheet>'}:${row.rowNumber ?? '<empty-row>'}/${row.sourceId}`,
  }
}

function addBlocker(context, input) {
  const item = normalizeRiskItem(input)
  const key = ['blocker', item.sourceReference?.label, item.riskType, item.fieldName, item.targetCandidate, item.boundary].join('|')
  if (context.blockerKeys.has(key)) {
    return
  }
  context.blockerKeys.add(key)
  context.blockers.push(item)
}

function addWarning(context, input) {
  const item = normalizeRiskItem(input)
  const key = ['warning', item.sourceReference?.label, item.riskType, item.fieldName, item.targetCandidate, item.boundary].join('|')
  if (context.warningKeys.has(key)) {
    return
  }
  context.warningKeys.add(key)
  context.warnings.push(item)
}

function normalizeRiskItem(input) {
  return {
    sourceId: input.sourceId ?? null,
    sourceReference: input.sourceReference ?? null,
    riskType: input.riskType,
    fieldName: input.fieldName ?? null,
    targetCandidate: input.targetCandidate ?? null,
    boundary: input.boundary ?? null,
    reason: input.reason,
  }
}

function buildSummary(sourceCount, context) {
  return {
    valid: context.blockers.length === 0,
    blockerCount: context.blockers.length,
    warningCount: context.warnings.length,
    sourceCount,
    duplicateSourceIdCount: context.duplicateSourceIdCount,
    invalidDomainCount: context.invalidDomainCount,
    invalidFieldsCount: context.invalidFieldsCount,
    missingSourceReferenceCount: context.missingSourceReferenceCount,
    sensitiveFieldCount: context.sensitiveFieldCount,
    forbiddenFieldCount: context.forbiddenFieldCount,
    deferredFieldCount: context.deferredFieldCount,
    shippingBoundaryRiskCount: context.shippingBoundaryRiskCount,
    workflowFactBoundaryRiskCount: context.workflowFactBoundaryRiskCount,
    blockers: context.blockers,
    warnings: context.warnings,
  }
}

async function writeFreezePackage({ outDir, sourcePath, existingPath, command, metadata, summary, sourceRows }) {
  await mkdir(outDir, { recursive: true })
  await writeJson(path.join(outDir, 'freeze-metadata.json'), metadata)
  await writeJson(path.join(outDir, 'freeze-check-summary.json'), summary)
  await writeFile(
    path.join(outDir, 'freeze-check-report.md'),
    renderMarkdownReport({ sourcePath, existingPath, outDir, command, metadata, summary, sourceRows }),
    'utf8',
  )
}

async function writeJson(filePath, data) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function renderMarkdownReport({ sourcePath, existingPath, outDir, command, metadata, summary, sourceRows }) {
  const checksumRows = [
    `| sourceSha256 | \`${metadata.sourceSha256}\` |`,
    `| existingSha256 | \`${metadata.existingSha256}\` |`,
    `| sourceSizeBytes | ${metadata.sourceSizeBytes} |`,
    `| existingSizeBytes | ${metadata.existingSizeBytes} |`,
  ].join('\n')
  const domainRows = renderCountRows(metadata.domainCounts)
  const sourceTypeRows = renderCountRows(metadata.sourceTypeCounts)
  const sourceReferenceRows = sourceRows
    .slice(0, 40)
    .map((row) => `| ${row.sourceId} | ${row.domain} | ${row.fileName} | ${row.sheetName ?? '<empty>'} | ${row.rowNumber ?? '<empty>'} |`)
    .join('\n')
  const blockerRows = renderRiskRows(summary.blockers)
  const warningRows = renderRiskRows(summary.warnings)
  const sensitiveRows = renderRiskRows(summary.warnings.filter((item) => item.riskType === 'sensitive-field'))
  const forbiddenRows = renderRiskRows(summary.blockers.filter((item) => item.riskType === 'forbidden-field'))
  const deferredRows = renderRiskRows(summary.warnings.filter((item) => item.riskType === 'deferred-field'))

  return `# Yoyoosun Source Snapshot Freeze Check Report

## Command

\`\`\`bash
${command}
\`\`\`

## Inputs

- Source path: \`${sourcePath}\`
- Existing path: \`${existingPath}\`
- Output path: \`${outDir}\`
- Freeze ID: \`${metadata.freezeId}\`
- Freeze date: \`${metadata.freezeDate}\`

## Checksum Summary

| item | value |
|---|---|
${checksumRows}

## Source Summary

| item | value |
|---|---:|
| sourceCount | ${metadata.sourceCount} |
| blockerCount | ${summary.blockerCount} |
| warningCount | ${summary.warningCount} |
| canExecuteRealImport | ${metadata.canExecuteRealImport} |
| noRealImport | ${metadata.noRealImport} |
| manualReviewRequired | ${metadata.manualReviewRequired} |

## Domain Counts

| domain | count |
|---|---:|
${domainRows}

## Source Type Counts

| sourceType | count |
|---|---:|
${sourceTypeRows}

## Source References

Sheet name and row number are shown as \`<empty>\` when the source snapshot leaves them blank.

| sourceId | domain | fileName | sheetName | rowNumber |
|---|---|---|---|---:|
${sourceReferenceRows || '| none | none | none | none | none |'}

## Blockers

${blockerRows}

## Warnings

${warningRows}

## Sensitive Field Review

Sensitive findings list field names and source references only. Raw sensitive values are intentionally not written to this report.

${sensitiveRows}

## Forbidden Field Review

${forbiddenRows}

## Deferred Field Review

${deferredRows}

## Boundary Statements

- \`shipping_released != shipped\`
- \`workflow task done != fact posted\`
- \`sales_order != shipment\`
- Dry-run evidence is not import approval.

## No real import

No real import is executed by this freeze checker. The tool does not connect to a database, does not write formal V1 tables, does not write \`business_records\`, does not create SQL, and does not modify schema, API, UI, seedData, or docs registry. \`canExecuteRealImport\` is always \`false\`.

## Manual Review Next Steps

1. Review every blocker in \`freeze-check-summary.json\` before any future loader design.
2. Review sensitive field names without copying raw values into reports.
3. Keep product_skus and purchase_orders deferred unless a later implementation task explicitly changes the boundary.
4. Keep shipment, inventory, and finance rows out of automatic import.
5. Run the dry-run CLI and review its evidence package separately.
`
}

function renderCountRows(counts) {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
  if (entries.length === 0) {
    return '| none | 0 |'
  }
  return entries.map(([key, value]) => `| ${key} | ${value} |`).join('\n')
}

function renderRiskRows(items) {
  if (items.length === 0) {
    return '- None'
  }
  return items
    .slice(0, 60)
    .map((item) => {
      const reference = item.sourceReference?.label ?? 'snapshot-root'
      const parts = [
        `source=${reference}`,
        `risk=${item.riskType}`,
        item.fieldName ? `field=${item.fieldName}` : null,
        item.targetCandidate ? `target=${item.targetCandidate}` : null,
        item.boundary ? `boundary=${item.boundary}` : null,
        `reason=${item.reason}`,
      ].filter(Boolean)
      return `- ${parts.join('; ')}`
    })
    .join('\n')
}

function normalizeDomain(domain) {
  return String(domain ?? '')
    .trim()
    .toLowerCase()
    .replaceAll('-', '_')
}

function valueOrUnknown(value) {
  if (value === undefined || value === null || value === '') {
    return 'unknown'
  }
  return String(value)
}

function countBy(items, key) {
  const counts = {}
  for (const item of items) {
    const value = item[key] ?? 'unknown'
    counts[value] = (counts[value] ?? 0) + 1
  }
  return counts
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv)
  if (options.help) {
    console.log(USAGE)
    return 0
  }
  const command = `node scripts/import/customerSourceSnapshotFreezeCheck.mjs ${argv.map(quoteArg).join(' ')}`
  const result = await runFreezeCheck({ ...options, command })
  console.log(`Freeze evidence written to ${options.out}`)
  console.log(`freezeId: ${result.metadata.freezeId}`)
  console.log(`valid: ${result.summary.valid}`)
  console.log(`canExecuteRealImport: ${result.metadata.canExecuteRealImport}`)
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
