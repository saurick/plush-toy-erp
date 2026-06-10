#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'

const USAGE = `Yoyoosun customer source extractor

Usage:
  node scripts/import/customerSourceExtract.mjs \\
    --raw-dir docs/customers/yoyoosun/raw-source-files \\
    --out output/customers/yoyoosun/source-extract

Options:
  --customer <key>   Optional. Defaults to yoyoosun.
  --raw-dir <path>   Optional. Defaults to docs/customers/yoyoosun/raw-source-files.
  --out <path>       Required. Output directory for extracted local evidence.
  --help             Print this help.

This tool extracts local Excel source files into import-prep evidence only. It never connects to a database, reads server config, writes formal tables, writes business_records, generates SQL, generates migrations, or executes a real import.`

export const OUTPUT_FILES = [
  'source-snapshot.extracted.json',
  'existing-v1.empty-preview.json',
  'customer-import-config.candidate.json',
  'extraction-summary.json',
  'extraction-report.md',
]

const DEFAULT_CUSTOMER = 'yoyoosun'
const DEFAULT_RAW_DIR = 'docs/customers/yoyoosun/raw-source-files'

const ZIP_EOCD_SIGNATURE = 0x06054b50
const ZIP_CENTRAL_SIGNATURE = 0x02014b50
const ZIP_LOCAL_SIGNATURE = 0x04034b50

const XLSX_EXTENSIONS = new Set(['.xlsx'])

const HEADER_ALIASES = {
  sequence: ['序号'],
  orderNo: ['订单编号', '订单号', '产品订单编号'],
  productOrderNo: ['产品订单编号'],
  productNo: ['产品编号', '产品资料编号'],
  productName: ['产品名称', '品名'],
  materialCode: ['材料编号', '物料编号'],
  materialName: ['材料品名', '物料名称'],
  vendorItemNo: ['厂商料号'],
  materialSpec: ['规格'],
  color: ['颜色'],
  unit: ['单位'],
  assemblyPosition: ['组装部位'],
  pieceCount: ['片数'],
  unitQuantity: ['单位用量'],
  lossRate: ['损耗%', '损耗％'],
  totalQuantity: ['总用量含损耗10%', '总用量含损耗', '总用量', '采购数量', '材料耗量'],
  processName: ['加工项目', '加工程序', '加工方式', '工序名称'],
  processType: ['工序类别'],
  supplierShortName: ['厂商简称', '厂家简称', '加工厂商', '厂家名称', '加工方名称', '供应商名称'],
  supplierCode: ['厂商编号'],
  supplierName: ['厂商名称', '厂家全称', '供应商名称', '加工方名称'],
  contactName: ['联系人'],
  phone: ['联系电话', '对接人电话'],
  address: ['地址', '加工商地址', '供应商地址'],
  supplierCategory: ['类别', '加工工序'],
  invoiceType: ['开票类型'],
  invoiceRate: ['开票点数'],
  bankAccount: ['银行卡号'],
  requester: ['下单人', '委托人'],
  requesterPhone: ['联系电话'],
  returnDate: ['回货日期'],
  unitPrice: ['单价'],
  purchaseQuantity: ['采购数量'],
  purchaseAmount: ['采购金额', '金额'],
  purchaseOrderNo: ['采购订单号'],
  outsourcingOrderNo: ['委外加工订单号', '加工合同号'],
  outsourcingQuantity: ['加工数量', '委托加工数量', '数量'],
  outsourcingAmount: ['加工金额', '委托加工金额'],
  note: ['备注', '备注1'],
  materialCategory: ['材料类别', '材料编号', '物料编号'],
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
    customer: DEFAULT_CUSTOMER,
    rawDir: DEFAULT_RAW_DIR,
    help: false,
  }

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

    if (key === 'customer') {
      options.customer = value
    } else if (key === 'raw-dir') {
      options.rawDir = value
    } else if (key === 'out') {
      options.out = value
    } else {
      throw new CliError(`Unknown option: --${key}`, 2)
    }
  }

  if (options.help) {
    return options
  }
  if (!options.out) {
    throw new CliError('Missing required --out', 2)
  }
  return options
}

export async function runExtraction(options) {
  const customerKey = options.customer ?? DEFAULT_CUSTOMER
  const rawDir = options.rawDir ?? DEFAULT_RAW_DIR
  const outDir = options.out
  const workbooks = await readRawWorkbooks(rawDir)
  const extraction = extractSourcesFromWorkbooks(workbooks, { customerKey })
  const generatedAt = new Date().toISOString()
  const sourceSnapshot = {
    version: 1,
    generatedAt,
    customerKey,
    noRealImport: true,
    canExecuteRealImport: false,
    sources: extraction.sources,
  }
  const existingPreview = buildEmptyExistingPreview(generatedAt, customerKey)
  const importConfig = buildImportConfigCandidate({
    customerKey,
    generatedAt,
    workbooks,
    extraction,
  })
  const summary = buildExtractionSummary({
    customerKey,
    generatedAt,
    rawDir,
    outDir,
    workbooks,
    extraction,
  })
  const report = buildExtractionReport({
    customerKey,
    rawDir,
    sourceSnapshot,
    importConfig,
    summary,
  })

  await mkdir(outDir, { recursive: true })
  await writeJson(path.join(outDir, 'source-snapshot.extracted.json'), sourceSnapshot)
  await writeJson(path.join(outDir, 'existing-v1.empty-preview.json'), existingPreview)
  await writeJson(path.join(outDir, 'customer-import-config.candidate.json'), importConfig)
  await writeJson(path.join(outDir, 'extraction-summary.json'), summary)
  await writeFile(path.join(outDir, 'extraction-report.md'), report)

  return {
    sourceSnapshot,
    existingPreview,
    importConfig,
    summary,
    report,
  }
}

async function readRawWorkbooks(rawDir) {
  let entries
  try {
    entries = await readdir(rawDir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new CliError(`Cannot read raw source directory: ${rawDir}`, 2)
    }
    throw error
  }

  const workbookPaths = entries
    .filter((entry) => entry.isFile() && XLSX_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(rawDir, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'zh-Hans-CN'))

  if (workbookPaths.length === 0) {
    throw new CliError(`No .xlsx files found in ${rawDir}`, 2)
  }

  const workbooks = []
  for (const workbookPath of workbookPaths) {
    workbooks.push(await readXlsxWorkbook(workbookPath))
  }
  return workbooks
}

export function extractSourcesFromWorkbooks(workbooks, options = {}) {
  const collector = createCollector(options.customerKey ?? DEFAULT_CUSTOMER)
  for (const workbook of workbooks) {
    for (const sheet of workbook.sheets) {
      if (isMaterialSummarySheet(sheet.name)) {
        extractMaterialSummarySheet(workbook, sheet, collector)
      }
      if (isMaterialDetailSheet(sheet.name)) {
        extractMaterialDetailSheet(workbook, sheet, collector)
      }
      if (isPurchaseSummarySheet(sheet.name, workbook.fileName)) {
        extractPurchaseSummarySheet(workbook, sheet, collector)
      }
      if (isOutsourcingSummarySheet(sheet.name)) {
        extractOutsourcingSummarySheet(workbook, sheet, collector)
      }
      if (isSupplierDirectorySheet(sheet.name)) {
        extractSupplierDirectorySheet(workbook, sheet, collector)
      }
      if (isContractTemplateSheet(sheet.name)) {
        extractContractTemplateSheet(workbook, sheet, collector)
      }
    }
  }

  return {
    sources: collector.sources,
    mappings: collector.mappings,
    counters: collector.counters,
    warnings: collector.warnings,
    uniqueKeys: collector.uniqueKeys,
  }
}

function createCollector(customerKey) {
  const sources = []
  const unique = new Set()
  const counters = {
    byDomain: {},
    bySourceType: {},
    byModuleKey: {},
  }
  return {
    customerKey,
    sources,
    mappings: [],
    counters,
    warnings: [],
    uniqueKeys: {},
    addMapping(mapping) {
      this.mappings.push(mapping)
    },
    addWarning(warning) {
      this.warnings.push(warning)
    },
    addSource(input) {
      const fields = cleanFields(input.fields)
      if (Object.keys(fields).length === 0) {
        return null
      }
      const sourceId =
        input.sourceId ??
        buildSourceId({
          customerKey,
          domain: input.domain,
          fileName: input.fileName,
          sheetName: input.sheetName,
          rowNumber: input.rowNumber,
          fields,
        })
      const source = {
        sourceId,
        sourceType: input.sourceType ?? 'Data Import Source',
        sourceKind: input.sourceKind ?? 'xlsx_sheet',
        moduleKey: input.moduleKey ?? 'unknown',
        fileName: input.fileName,
        sheetName: input.sheetName,
        rowNumber: input.rowNumber ?? null,
        domain: input.domain,
        fields,
        items: input.items ?? [],
      }
      sources.push(source)
      increment(counters.byDomain, source.domain)
      increment(counters.bySourceType, source.sourceType)
      increment(counters.byModuleKey, source.moduleKey)
      return source
    },
    addUnique(input) {
      const key = `${input.domain}:${input.uniqueKey}`
      this.uniqueKeys[input.domain] ??= 0
      if (unique.has(key)) {
        return null
      }
      unique.add(key)
      this.uniqueKeys[input.domain] += 1
      return this.addSource(input)
    },
  }
}

function extractMaterialSummarySheet(workbook, sheet, collector) {
  const header = findHeader(sheet, ['序号', '材料品名', '单位'])
  if (!header) {
    return
  }
  const context = extractProductContext(sheet)
  collector.addMapping(
    buildMapping(workbook, sheet, header.rowNumber, 'materials / products / units / purchase_orders', [
      '产品编号',
      '产品名称',
      '材料品名',
      '厂商料号',
      '规格',
      '单位',
      '采购数量',
      '单价',
      '金额',
    ]),
  )

  for (const row of rowsAfter(sheet, header.rowNumber)) {
    if (isFooterRow(row) || isBlankRow(row)) {
      continue
    }
    const materialName = valueByAlias(row, header.map, 'materialName')
    const productNo = valueByAlias(row, header.map, 'productNo') || context.productNo
    const productName = valueByAlias(row, header.map, 'productName') || context.productName
    const unit = valueByAlias(row, header.map, 'unit')
    if (!materialName || !productNo) {
      continue
    }

    addProductCandidate(collector, workbook, sheet, row, { productNo, productName, orderNo: context.orderNo })
    addUnitCandidate(collector, workbook, sheet, row, unit)
    addMaterialCandidate(collector, workbook, sheet, row, {
      materialName,
      vendorItemNo: valueByAlias(row, header.map, 'vendorItemNo'),
      materialSpec: valueByAlias(row, header.map, 'materialSpec'),
      unit,
      sourceOrderNo: valueByAlias(row, header.map, 'orderNo') || context.orderNo,
    })
    collector.addSource({
      sourceType: 'Data Import Source',
      sourceKind: 'xlsx_sheet',
      moduleKey: 'purchase_orders',
      fileName: workbook.fileName,
      sheetName: sheet.name,
      rowNumber: row.rowNumber,
      domain: 'purchase_orders',
      fields: {
        purchase_order_no: null,
        product_order_no: valueByAlias(row, header.map, 'orderNo') || context.orderNo,
        product_no: productNo,
        product_name: productName,
        material_name: materialName,
        vendor_item_no: valueByAlias(row, header.map, 'vendorItemNo'),
        spec: valueByAlias(row, header.map, 'materialSpec'),
        unit,
        purchase_quantity: valueByAlias(row, header.map, 'purchaseQuantity') || valueByAlias(row, header.map, 'totalQuantity'),
        unit_price: valueByAlias(row, header.map, 'unitPrice'),
        amount: valueByAlias(row, header.map, 'purchaseAmount'),
        note: valueByAlias(row, header.map, 'note'),
      },
    })
  }
}

function extractMaterialDetailSheet(workbook, sheet, collector) {
  const header = findHeader(sheet, ['物料名称', '单位用量'])
  if (!header) {
    return
  }
  const context = extractProductContext(sheet)
  collector.addMapping(
    buildMapping(workbook, sheet, header.rowNumber, 'bom / materials / units / products', [
      '产品编号',
      '产品名称',
      '物料名称',
      '厂商料号',
      '规格',
      '单位',
      '组装部位',
      '单位用量',
      '损耗%',
      '总用量',
      '加工方式',
    ]),
  )

  const carried = {}
  for (const row of rowsAfter(sheet, header.rowNumber)) {
    if (isFooterRow(row) || isBlankRow(row)) {
      continue
    }
    carryField(carried, 'materialCategory', valueByAlias(row, header.map, 'materialCategory'))
    carryField(carried, 'materialName', valueByAlias(row, header.map, 'materialName'))
    carryField(carried, 'vendorItemNo', valueByAlias(row, header.map, 'vendorItemNo'))
    carryField(carried, 'materialSpec', valueByAlias(row, header.map, 'materialSpec'))
    carryField(carried, 'color', valueByAlias(row, header.map, 'color'))
    carryField(carried, 'unit', valueByAlias(row, header.map, 'unit'))

    const materialName = carried.materialName
    const unit = carried.unit
    const assemblyPosition = valueByAlias(row, header.map, 'assemblyPosition')
    const unitQuantity = valueByAlias(row, header.map, 'unitQuantity')
    if (!materialName || !unit || (!assemblyPosition && !unitQuantity)) {
      continue
    }

    addProductCandidate(collector, workbook, sheet, row, {
      productNo: context.productNo,
      productName: context.productName,
      orderNo: context.orderNo,
    })
    addUnitCandidate(collector, workbook, sheet, row, unit)
    addMaterialCandidate(collector, workbook, sheet, row, {
      materialName,
      vendorItemNo: carried.vendorItemNo,
      materialSpec: carried.materialSpec,
      unit,
      materialCategory: carried.materialCategory,
      color: carried.color,
      sourceOrderNo: context.orderNo,
    })
    collector.addSource({
      sourceType: 'Data Import Source',
      sourceKind: 'xlsx_sheet',
      moduleKey: 'bom',
      fileName: workbook.fileName,
      sheetName: sheet.name,
      rowNumber: row.rowNumber,
      domain: 'bom',
      fields: {
        product_no: context.productNo,
        product_name: context.productName,
        order_no: context.orderNo,
        material_name: materialName,
        vendor_item_no: carried.vendorItemNo,
        spec: carried.materialSpec,
        color: carried.color,
        unit,
        assembly_position: assemblyPosition,
        piece_count: valueByAlias(row, header.map, 'pieceCount'),
        unit_quantity: unitQuantity,
        loss_rate: valueByAlias(row, header.map, 'lossRate'),
        total_quantity: valueByAlias(row, header.map, 'totalQuantity'),
        process_name: valueByAlias(row, header.map, 'processName'),
        note: valueByAlias(row, header.map, 'note'),
      },
    })
  }
}

function extractPurchaseSummarySheet(workbook, sheet, collector) {
  const header = findHeader(sheet, ['产品订单编号', '材料品名', '采购数量'])
  if (!header) {
    return
  }
  collector.addMapping(
    buildMapping(workbook, sheet, header.rowNumber, 'purchase_orders / materials / suppliers / units', [
      '产品订单编号',
      '产品编号',
      '产品名称',
      '材料品名',
      '厂商料号',
      '规格',
      '单位',
      '单价',
      '采购数量',
      '采购金额',
      '厂商简称',
      '回货日期',
    ]),
  )

  for (const row of rowsAfter(sheet, header.rowNumber)) {
    if (isFooterRow(row) || isBlankRow(row)) {
      continue
    }
    const materialName = valueByAlias(row, header.map, 'materialName')
    const productNo = valueByAlias(row, header.map, 'productNo')
    const unit = valueByAlias(row, header.map, 'unit')
    if (!materialName && !productNo) {
      continue
    }
    const supplierName =
      valueByAlias(row, header.map, 'supplierShortName') || valueByAlias(row, header.map, 'vendorItemNo')

    addProductCandidate(collector, workbook, sheet, row, {
      productNo,
      productName: valueByAlias(row, header.map, 'productName'),
      orderNo: valueByAlias(row, header.map, 'productOrderNo'),
    })
    addUnitCandidate(collector, workbook, sheet, row, unit)
    addMaterialCandidate(collector, workbook, sheet, row, {
      materialName,
      vendorItemNo: valueByAlias(row, header.map, 'vendorItemNo'),
      materialSpec: valueByAlias(row, header.map, 'materialSpec'),
      unit,
      supplierName,
      sourceOrderNo: valueByAlias(row, header.map, 'productOrderNo'),
    })
    addSupplierCandidate(collector, workbook, sheet, row, {
      supplierName,
      shortName: valueByAlias(row, header.map, 'supplierShortName'),
      supplierType: '材料 / 辅材 / 包材供应商',
    })
    collector.addSource({
      sourceType: 'Data Import Source',
      sourceKind: 'xlsx_sheet',
      moduleKey: 'purchase_orders',
      fileName: workbook.fileName,
      sheetName: sheet.name,
      rowNumber: row.rowNumber,
      domain: 'purchase_orders',
      fields: {
        product_order_no: valueByAlias(row, header.map, 'productOrderNo'),
        product_no: productNo,
        product_name: valueByAlias(row, header.map, 'productName'),
        material_name: materialName,
        supplier_name: supplierName,
        vendor_item_no: valueByAlias(row, header.map, 'vendorItemNo'),
        spec: valueByAlias(row, header.map, 'materialSpec'),
        unit,
        unit_price: valueByAlias(row, header.map, 'unitPrice'),
        purchase_quantity: valueByAlias(row, header.map, 'purchaseQuantity'),
        amount: valueByAlias(row, header.map, 'purchaseAmount'),
        requester: valueByAlias(row, header.map, 'requester'),
        requester_phone: valueByAlias(row, header.map, 'requesterPhone'),
        expected_return_date: normalizeDateLike(valueByAlias(row, header.map, 'returnDate')),
        note: valueByAlias(row, header.map, 'note'),
      },
    })
  }
}

function extractOutsourcingSummarySheet(workbook, sheet, collector) {
  const header = findHeader(sheet, ['委外加工订单号', '产品编号', '加工'])
  if (!header) {
    return
  }
  collector.addMapping(
    buildMapping(workbook, sheet, header.rowNumber, 'outsourcing / suppliers / products / units', [
      '委外加工订单号',
      '产品订单编号',
      '产品编号',
      '产品名称',
      '加工项目',
      '厂家名称',
      '工序类别',
      '单位',
      '单价',
      '加工数量',
      '加工金额',
      '回货日期',
    ]),
  )

  for (const row of rowsAfter(sheet, header.rowNumber)) {
    if (isFooterRow(row) || isBlankRow(row)) {
      continue
    }
    const productNo = valueByAlias(row, header.map, 'productNo')
    const processName = valueByAlias(row, header.map, 'processName')
    const supplierName = valueByAlias(row, header.map, 'supplierShortName')
    const unit = valueByAlias(row, header.map, 'unit')
    if (!productNo && !processName && !supplierName) {
      continue
    }

    addProductCandidate(collector, workbook, sheet, row, {
      productNo,
      productName: valueByAlias(row, header.map, 'productName'),
      orderNo: valueByAlias(row, header.map, 'productOrderNo'),
    })
    addUnitCandidate(collector, workbook, sheet, row, unit)
    addSupplierCandidate(collector, workbook, sheet, row, {
      supplierName,
      shortName: supplierName,
      supplierType: valueByAlias(row, header.map, 'processType') || '加工厂',
    })
    collector.addSource({
      sourceType: 'Data Import Source',
      sourceKind: 'xlsx_sheet',
      moduleKey: 'outsourcing',
      fileName: workbook.fileName,
      sheetName: sheet.name,
      rowNumber: row.rowNumber,
      domain: 'outsourcing',
      fields: {
        outsourcing_order_no: valueByAlias(row, header.map, 'outsourcingOrderNo'),
        product_order_no: valueByAlias(row, header.map, 'productOrderNo'),
        product_no: productNo,
        product_name: valueByAlias(row, header.map, 'productName'),
        process_name: processName,
        supplier_name: supplierName,
        process_type: valueByAlias(row, header.map, 'processType'),
        unit,
        unit_price: valueByAlias(row, header.map, 'unitPrice'),
        quantity:
          valueByAlias(row, header.map, 'outsourcingQuantity') ||
          valueByAlias(row, header.map, 'purchaseQuantity'),
        amount: valueByAlias(row, header.map, 'outsourcingAmount'),
        requester: valueByAlias(row, header.map, 'requester'),
        requester_phone: valueByAlias(row, header.map, 'requesterPhone'),
        expected_return_date: normalizeDateLike(valueByAlias(row, header.map, 'returnDate')),
        note: valueByAlias(row, header.map, 'note'),
      },
    })
  }
}

function extractSupplierDirectorySheet(workbook, sheet, collector) {
  const header = findHeader(sheet, ['序号', '联系人', '联系电话'])
  if (!header) {
    return
  }
  collector.addMapping(
    buildMapping(workbook, sheet, header.rowNumber, 'suppliers / contacts / customer material', [
      '厂商简称',
      '厂商编号',
      '厂商名称',
      '厂家全称',
      '加工工序',
      '联系人',
      '联系电话',
      '地址',
      '类别',
      '银行卡号',
    ]),
  )

  for (const row of rowsAfter(sheet, header.rowNumber)) {
    if (isFooterRow(row) || isBlankRow(row)) {
      continue
    }
    const supplierName = valueByAlias(row, header.map, 'supplierName')
    const shortName = valueByAlias(row, header.map, 'supplierShortName')
    if (!supplierName && !shortName) {
      continue
    }
    const supplier = addSupplierCandidate(collector, workbook, sheet, row, {
      supplierCode: valueByAlias(row, header.map, 'supplierCode') || valueByAlias(row, header.map, 'sequence'),
      supplierName: supplierName || shortName,
      shortName,
      supplierType: valueByAlias(row, header.map, 'supplierCategory'),
      invoiceType: valueByAlias(row, header.map, 'invoiceType'),
      invoiceRate: valueByAlias(row, header.map, 'invoiceRate'),
      address: valueByAlias(row, header.map, 'address'),
      bankAccountPresent: Boolean(valueByAlias(row, header.map, 'bankAccount')),
      note: valueByAlias(row, header.map, 'note'),
    })
    const contactName = valueByAlias(row, header.map, 'contactName')
    const phone = valueByAlias(row, header.map, 'phone')
    if (contactName || phone) {
      collector.addUnique({
        uniqueKey: `${supplierName || shortName}|${contactName}|${phone}`,
        sourceType: 'Data Import Source',
        sourceKind: 'xlsx_sheet',
        moduleKey: 'contacts',
        fileName: workbook.fileName,
        sheetName: sheet.name,
        rowNumber: row.rowNumber,
        domain: 'contacts',
        fields: {
          owner_type: 'SUPPLIER',
          owner_name: supplierName || shortName,
          owner_source_id: supplier?.sourceId,
          item_name: contactName || phone,
          mobile_phone: phone,
          note: 'owner_id 需在 supplier 唯一匹配后人工回填；不得按名称猜 owner_id。',
        },
      })
    }
  }
}

function extractContractTemplateSheet(workbook, sheet, collector) {
  const header =
    findHeader(sheet, ['采购订单号', '材料品名', '采购数量']) ||
    findHeader(sheet, ['委外加工订单号', '工序名称', '委托加工数量'])
  if (!header) {
    return
  }
  const domain = hasHeader(header.map, '采购订单号') ? 'purchase_orders' : 'outsourcing'
  collector.addMapping(
    buildMapping(workbook, sheet, header.rowNumber, `${domain} / print template input`, [
      '采购订单号',
      '委外加工订单号',
      '产品订单编号',
      '产品编号',
      '产品名称',
      '材料品名',
      '工序名称',
      '单位',
      '单价',
      '采购数量',
      '委托加工数量',
      '采购金额',
      '委托加工金额',
    ]),
  )

  for (const row of rowsAfter(sheet, header.rowNumber)) {
    if (isFooterRow(row) || isBlankRow(row)) {
      continue
    }
    const productNo = valueByAlias(row, header.map, 'productNo')
    const lineName = valueByAlias(row, header.map, 'materialName') || valueByAlias(row, header.map, 'processName')
    if (!productNo && !lineName) {
      continue
    }
    collector.addSource({
      sourceType: 'Print Template Input',
      sourceKind: 'xlsx_sheet',
      moduleKey: domain,
      fileName: workbook.fileName,
      sheetName: sheet.name,
      rowNumber: row.rowNumber,
      domain,
      fields: {
        document_no:
          valueByAlias(row, header.map, 'purchaseOrderNo') ||
          valueByAlias(row, header.map, 'outsourcingOrderNo'),
        product_order_no: valueByAlias(row, header.map, 'productOrderNo'),
        product_no: productNo,
        product_name: valueByAlias(row, header.map, 'productName'),
        line_name: lineName,
        vendor_item_no: valueByAlias(row, header.map, 'vendorItemNo'),
        spec: valueByAlias(row, header.map, 'materialSpec'),
        unit: valueByAlias(row, header.map, 'unit'),
        unit_price: valueByAlias(row, header.map, 'unitPrice'),
        quantity:
          valueByAlias(row, header.map, 'purchaseQuantity') ||
          valueByAlias(row, header.map, 'outsourcingQuantity'),
        amount:
          valueByAlias(row, header.map, 'purchaseAmount') ||
          valueByAlias(row, header.map, 'outsourcingAmount'),
        note: valueByAlias(row, header.map, 'note'),
      },
    })
  }
}

function addProductCandidate(collector, workbook, sheet, row, input) {
  const productNo = normalizeText(input.productNo)
  const productName = normalizeText(input.productName)
  if (!productNo && !productName) {
    return null
  }
  return collector.addUnique({
    uniqueKey: `${productNo}|${productName}`,
    sourceType: 'Data Import Source',
    sourceKind: 'xlsx_sheet',
    moduleKey: 'products',
    fileName: workbook.fileName,
    sheetName: sheet.name,
    rowNumber: row.rowNumber,
    domain: 'products',
    fields: {
      product_no: productNo,
      title: productName,
      source_order_no: input.orderNo,
    },
  })
}

function addMaterialCandidate(collector, workbook, sheet, row, input) {
  const materialName = normalizeText(input.materialName)
  if (!materialName) {
    return null
  }
  return collector.addUnique({
    uniqueKey: `${materialName}|${normalizeText(input.vendorItemNo)}|${normalizeText(input.materialSpec)}|${normalizeText(input.unit)}`,
    sourceType: 'Data Import Source',
    sourceKind: 'xlsx_sheet',
    moduleKey: 'materials',
    fileName: workbook.fileName,
    sheetName: sheet.name,
    rowNumber: row.rowNumber,
    domain: 'materials',
    fields: {
      material_name: materialName,
      vendor_item_no: input.vendorItemNo,
      spec: input.materialSpec,
      unit: input.unit,
      material_category: input.materialCategory,
      color: input.color,
      supplier_name: input.supplierName,
      source_order_no: input.sourceOrderNo,
    },
  })
}

function addUnitCandidate(collector, workbook, sheet, row, unit) {
  const unitText = normalizeText(unit)
  if (!unitText || isBadIdentityValue(unitText)) {
    return null
  }
  return collector.addUnique({
    uniqueKey: unitText,
    sourceType: 'Data Import Source',
    sourceKind: 'xlsx_sheet',
    moduleKey: 'units',
    fileName: workbook.fileName,
    sheetName: sheet.name,
    rowNumber: row.rowNumber,
    domain: 'units',
    fields: {
      unit: unitText,
      name: unitText,
    },
  })
}

function addSupplierCandidate(collector, workbook, sheet, row, input) {
  const supplierName = normalizeText(input.supplierName)
  const shortName = normalizeText(input.shortName)
  if ((!supplierName && !shortName) || isBadIdentityValue(supplierName || shortName)) {
    return null
  }
  return collector.addUnique({
    uniqueKey: `${normalizeText(input.supplierCode)}|${supplierName}|${shortName}`,
    sourceType: 'Data Import Source',
    sourceKind: 'xlsx_sheet',
    moduleKey: 'suppliers',
    fileName: workbook.fileName,
    sheetName: sheet.name,
    rowNumber: row.rowNumber,
    domain: 'suppliers',
    fields: {
      document_no: input.supplierCode,
      factory_name: supplierName || shortName,
      short_name: shortName,
      partner_type: input.supplierType,
      address: input.address,
      invoice_type: input.invoiceType,
      invoice_rate: input.invoiceRate,
      bank_account_source_present: input.bankAccountPresent ? true : null,
      bank_account_redacted: input.bankAccountPresent ? true : null,
      note: input.note,
    },
  })
}

function isMaterialSummarySheet(sheetName) {
  return /材料分析.*汇总|^汇总表$/u.test(sheetName)
}

function isMaterialDetailSheet(sheetName) {
  return /材料分析明细/u.test(sheetName)
}

function isPurchaseSummarySheet(sheetName, fileName) {
  return /原辅料采购汇总|^Sheet1$/u.test(sheetName) && /辅材|包材|模板/u.test(fileName)
}

function isOutsourcingSummarySheet(sheetName) {
  return /委外加工汇总|B类汇总|加工分析汇总/u.test(sheetName)
}

function isSupplierDirectorySheet(sheetName) {
  return /材料厂商编号|加工厂商资料|^加工厂商$/u.test(sheetName)
}

function isContractTemplateSheet(sheetName) {
  return /C类辅料合同|B类加工合同/u.test(sheetName)
}

function findHeader(sheet, requiredLabels) {
  for (const row of sheet.rows) {
    const headerMap = buildHeaderMap(row.values)
    if (requiredLabels.every((label) => hasHeader(headerMap, label))) {
      return {
        rowNumber: row.rowNumber,
        row,
        map: headerMap,
      }
    }
  }
  return null
}

function buildHeaderMap(values) {
  const map = new Map()
  values.forEach((value, index) => {
    const normalized = normalizeHeader(value)
    if (!normalized || map.has(normalized)) {
      return
    }
    map.set(normalized, index)
  })
  return map
}

function hasHeader(headerMap, label) {
  const normalized = normalizeHeader(label)
  if (headerMap.has(normalized)) {
    return true
  }
  for (const key of headerMap.keys()) {
    if (key.includes(normalized) || normalized.includes(key)) {
      return true
    }
  }
  return false
}

function valueByAlias(row, headerMap, aliasKey) {
  const aliases = HEADER_ALIASES[aliasKey] ?? [aliasKey]
  for (const alias of aliases) {
    const index = headerIndex(headerMap, alias)
    if (index !== null) {
      const value = normalizeText(row.values[index])
      if (value) {
        return value
      }
    }
  }
  return null
}

function headerIndex(headerMap, alias) {
  const normalized = normalizeHeader(alias)
  if (headerMap.has(normalized)) {
    return headerMap.get(normalized)
  }
  for (const [key, index] of headerMap.entries()) {
    if (key.includes(normalized) || normalized.includes(key)) {
      return index
    }
  }
  return null
}

function extractProductContext(sheet) {
  const topRows = sheet.rows.filter((row) => row.rowNumber <= 5)
  return {
    productNo: findLabeledValue(topRows, /产品编号/u),
    productName: findLabeledValue(topRows, /产品名称|品\s*名/u),
    orderNo: findLabeledValue(topRows, /订单编号|订单号/u),
    orderQuantity: findLabeledValue(topRows, /数量/u),
    documentDate: normalizeDateLike(findLabeledValue(topRows, /日期|定单日期/u)),
  }
}

function findLabeledValue(rows, labelPattern) {
  for (const row of rows) {
    for (let index = 0; index < row.values.length; index += 1) {
      const value = normalizeText(row.values[index])
      if (!value || !labelPattern.test(value)) {
        continue
      }
      for (let offset = 1; offset <= 4; offset += 1) {
        const candidate = normalizeText(row.values[index + offset])
        if (candidate && !looksLikeLabel(candidate)) {
          return candidate
        }
      }
    }
  }
  return null
}

function rowsAfter(sheet, rowNumber) {
  return sheet.rows.filter((row) => row.rowNumber > rowNumber)
}

function carryField(carried, key, value) {
  const normalized = normalizeText(value)
  if (normalized) {
    carried[key] = normalized
  }
}

function isBlankRow(row) {
  return row.values.every((value) => !normalizeText(value))
}

function isFooterRow(row) {
  const joined = row.values.map((value) => normalizeText(value)).join(' ')
  return /合计|审核|业务员|^#REF!$/u.test(joined)
}

function isBadIdentityValue(value) {
  const text = normalizeText(value)
  return !text || text === '0' || text === '#REF!' || text === '-1' || /合计/u.test(text)
}

function looksLikeLabel(value) {
  return /[:：]$|产品编号|订单编号|数量|日期/u.test(value)
}

function buildMapping(workbook, sheet, headerRow, domain, fields) {
  return {
    fileName: workbook.fileName,
    sheetName: sheet.name,
    headerRow,
    domain,
    mappedFields: fields,
  }
}

function buildImportConfigCandidate({ customerKey, generatedAt, workbooks, extraction }) {
  return {
    customerKey,
    label: '永绅 yoyoosun 客户导入配置候选',
    status: 'draft',
    runtimeEnabled: false,
    generatedAt,
    generatedBy: 'scripts/import/customerSourceExtract.mjs',
    boundaries: {
      createsTenant: false,
      changesSchema: false,
      changesMigration: false,
      changesBackendRbac: false,
      changesWorkflowFactRules: false,
      executesImport: false,
      noRealImport: true,
      canExecuteRealImport: false,
    },
    sourceFiles: workbooks.map((workbook) => ({
      fileName: workbook.fileName,
      sheetCount: workbook.sheets.length,
      sheets: workbook.sheets.map((sheet) => ({
        name: sheet.name,
        usedRows: sheet.rows.length,
      })),
    })),
    extraction: {
      outputContract: OUTPUT_FILES,
      totalSourceRows: extraction.sources.length,
      countsByDomain: extraction.counters.byDomain,
      countsBySourceType: extraction.counters.bySourceType,
      countsByModuleKey: extraction.counters.byModuleKey,
      uniqueEntityCounts: extraction.uniqueKeys,
    },
    recommendedImportSequence: [
      {
        step: 1,
        domains: ['units'],
        action: 'review_then_import_master_data',
        reason: 'BOM、采购和委外行都依赖单位；单位文本必须先人工标准化。',
      },
      {
        step: 2,
        domains: ['products', 'materials', 'suppliers'],
        action: 'review_then_import_master_data',
        reason: '产品、材料和供应商可进入主数据候选，但重复名称、厂商简称和加工厂角色必须人工确认。',
      },
      {
        step: 3,
        domains: ['contacts'],
        action: 'review_after_supplier_match',
        reason: '联系人必须先确认 owner_type + owner_id；不能按供应商名称猜 owner_id。',
      },
      {
        step: 4,
        domains: ['bom'],
        action: 'review_after_product_material_unit_match',
        reason: 'BOM 只在产品、材料、单位均唯一匹配后才能作为后续导入候选；不写库存事实。',
      },
      {
        step: 5,
        domains: ['purchase_orders', 'outsourcing'],
        action: 'defer_to_future_source_document_review',
        reason: '采购订单和委外源单据当前仍是 deferred domain；本提取只保留来源快照和字段映射。',
      },
    ],
    fieldMappings: extraction.mappings,
    blockers: [
      'customerSourceExtract 输出不是 import approval。',
      'existing-v1.empty-preview.json 只是本地预览占位，不是当前数据库快照。',
      'purchase_orders / outsourcing 当前为 deferred domain，不自动写入。',
      '联系人 owner_id 需在供应商唯一匹配后人工补齐。',
      'BOM 需要现有或已批准导入的 product/material/unit 唯一匹配。',
      '不从 Excel/PDF/图片生成 shipment、inventory、finance facts。',
      'shipping_released != shipped。',
      'workflow task done != fact posted。',
    ],
    warnings: extraction.warnings,
  }
}

function buildExtractionSummary({ customerKey, generatedAt, rawDir, outDir, workbooks, extraction }) {
  return {
    customerKey,
    generatedAt,
    rawDir,
    outDir,
    workbookCount: workbooks.length,
    sheetCount: workbooks.reduce((sum, workbook) => sum + workbook.sheets.length, 0),
    sourceCount: extraction.sources.length,
    countsByDomain: extraction.counters.byDomain,
    countsBySourceType: extraction.counters.bySourceType,
    countsByModuleKey: extraction.counters.byModuleKey,
    outputFiles: OUTPUT_FILES,
    noRealImport: true,
    canExecuteRealImport: false,
    generatedBy: 'scripts/import/customerSourceExtract.mjs',
  }
}

function buildExtractionReport({ customerKey, rawDir, sourceSnapshot, importConfig, summary }) {
  const lines = [
    `# ${customerKey} 客户来源提取报告 / Customer Source Extraction Report`,
    '',
    '## 结论 / Decision',
    '',
    '- 本报告只说明客户原始 Excel 已提取为本地导入前 evidence。',
    '- 输出不写数据库、不写 `business_records`、不执行真实导入。',
    '- `canExecuteRealImport` 固定为 `false`，后续必须经过 dry-run、人工 review、备份和客户确认。',
    '',
    '## 输入 / Inputs',
    '',
    `- rawDir: \`${rawDir}\``,
    `- workbookCount: ${summary.workbookCount}`,
    `- sheetCount: ${summary.sheetCount}`,
    '',
    '## 输出 / Outputs',
    '',
    ...OUTPUT_FILES.map((file) => `- \`${file}\``),
    '',
    '## 统计 / Counts',
    '',
    '| domain | count |',
    '|---|---:|',
    ...Object.entries(summary.countsByDomain)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([domain, count]) => `| ${domain} | ${count} |`),
    '',
    '## 推荐后续顺序 / Recommended Next Steps',
    '',
    ...importConfig.recommendedImportSequence.map(
      (item) => `${item.step}. ${item.domains.join(', ')}: ${item.action}。${item.reason}`,
    ),
    '',
    '## 边界 / Boundary',
    '',
    '- `existing-v1.empty-preview.json` 只是本地空快照，不能替代真实 V1 / formal model 现有数据快照。',
    '- PDF / 图片仍作为人工来源引用，本工具不做 OCR，不从图片生成结构化事实。',
    '- 采购订单、委外源单据、shipment、inventory、finance 相关内容只保留为 deferred / forbidden evidence。',
    '- `shipping_released != shipped`。',
    '- `workflow task done != fact posted`。',
    '',
    `source rows: ${sourceSnapshot.sources.length}`,
  ]
  return `${lines.join('\n')}\n`
}

function buildEmptyExistingPreview(generatedAt, customerKey) {
  return {
    version: 1,
    generatedAt,
    customerKey,
    previewOnly: true,
    noRealImport: true,
    canExecuteRealImport: false,
    note: 'Empty preview snapshot only. Replace with a reviewed existing V1/formal model snapshot before any real dry-run sign-off.',
    customers: [],
    suppliers: [],
    contacts: [],
    salesOrders: [],
    salesOrderItems: [],
    products: [],
    materials: [],
    units: [],
    warehouses: [],
    bomHeaders: [],
    bomItems: [],
  }
}

export async function readXlsxWorkbook(filePath) {
  const buffer = await readFile(filePath)
  const zip = parseZip(buffer)
  const workbookXml = readZipText(zip, 'xl/workbook.xml')
  const relsXml = readZipText(zip, 'xl/_rels/workbook.xml.rels')
  const relMap = parseRelationships(relsXml)
  const sharedStrings = zip.entries.has('xl/sharedStrings.xml')
    ? parseSharedStrings(readZipText(zip, 'xl/sharedStrings.xml'))
    : []
  const sheets = []
  for (const sheetInfo of parseWorkbookSheets(workbookXml)) {
    const target = relMap.get(sheetInfo.relationshipId)
    if (!target) {
      continue
    }
    const sheetPath = normalizeWorkbookTarget(target)
    const sheetXml = readZipText(zip, sheetPath)
    sheets.push({
      name: sheetInfo.name,
      path: sheetPath,
      rows: parseSheetRows(sheetXml, sharedStrings),
    })
  }

  return {
    filePath,
    fileName: path.basename(filePath),
    sha256: createHash('sha256').update(buffer).digest('hex'),
    sizeBytes: buffer.length,
    sheets,
  }
}

function parseZip(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer)
  const entryCount = buffer.readUInt16LE(eocdOffset + 10)
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16)
  const entries = new Map()
  let offset = centralOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== ZIP_CENTRAL_SIGNATURE) {
      throw new CliError('Invalid xlsx zip central directory', 2)
    }
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localHeaderOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)
    entries.set(name, {
      name,
      method,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return { buffer, entries }
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 65557)
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === ZIP_EOCD_SIGNATURE) {
      return offset
    }
  }
  throw new CliError('Invalid xlsx zip: end of central directory not found', 2)
}

function readZipText(zip, name) {
  if (!zip.entries.has(name)) {
    throw new CliError(`XLSX entry not found: ${name}`, 2)
  }
  return extractZipEntry(zip, name).toString('utf8')
}

function extractZipEntry(zip, name) {
  const entry = zip.entries.get(name)
  const { buffer } = zip
  const offset = entry.localHeaderOffset
  if (buffer.readUInt32LE(offset) !== ZIP_LOCAL_SIGNATURE) {
    throw new CliError(`Invalid xlsx zip local header: ${name}`, 2)
  }
  const nameLength = buffer.readUInt16LE(offset + 26)
  const extraLength = buffer.readUInt16LE(offset + 28)
  const dataStart = offset + 30 + nameLength + extraLength
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize)
  if (entry.method === 0) {
    return compressed
  }
  if (entry.method === 8) {
    return inflateRawSync(compressed, { finishFlush: 2 })
  }
  throw new CliError(`Unsupported xlsx zip compression method ${entry.method}: ${name}`, 2)
}

function parseRelationships(xml) {
  const map = new Map()
  for (const match of xml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = parseXmlAttributes(match[1])
    if (attrs.Id && attrs.Target) {
      map.set(attrs.Id, attrs.Target)
    }
  }
  return map
}

function parseWorkbookSheets(xml) {
  const sheets = []
  for (const match of xml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = parseXmlAttributes(match[1])
    if (attrs.name && attrs['r:id']) {
      sheets.push({
        name: decodeXml(attrs.name),
        relationshipId: attrs['r:id'],
      })
    }
  }
  return sheets
}

function normalizeWorkbookTarget(target) {
  const normalized = target.replace(/^\/+/, '')
  if (normalized.startsWith('xl/')) {
    return normalized
  }
  return path.posix.normalize(`xl/${normalized}`)
}

function parseSharedStrings(xml) {
  const strings = []
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    strings.push(extractTextRuns(match[1]))
  }
  return strings
}

function parseSheetRows(xml, sharedStrings) {
  const rows = []
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowAttrs = parseXmlAttributes(rowMatch[1])
    const rowNumber = Number(rowAttrs.r)
    const values = []
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const cellAttrs = parseXmlAttributes(cellMatch[1] ?? cellMatch[2])
      const cellRef = cellAttrs.r
      const col = columnIndex(cellRef)
      if (!col) {
        continue
      }
      const cellXml = cellMatch[3] ?? ''
      if (cellXml) {
        values[col - 1] = extractCellValue(cellXml, cellAttrs, sharedStrings)
      }
    }
    rows.push({
      rowNumber: Number.isFinite(rowNumber) ? rowNumber : rows.length + 1,
      values: values.map((value) => normalizeText(value)),
    })
  }
  return rows.filter((row) => !isBlankRow(row))
}

function extractCellValue(cellXml, attrs, sharedStrings) {
  if (attrs.t === 'inlineStr') {
    const inlineMatch = cellXml.match(/<is\b[^>]*>([\s\S]*?)<\/is>/)
    return inlineMatch ? extractTextRuns(inlineMatch[1]) : ''
  }
  const valueMatch = cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)
  if (!valueMatch) {
    return ''
  }
  const rawValue = decodeXml(stripXml(valueMatch[1]))
  if (attrs.t === 's') {
    return sharedStrings[Number(rawValue)] ?? rawValue
  }
  return rawValue
}

function extractTextRuns(xml) {
  const parts = []
  for (const match of xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) {
    parts.push(decodeXml(match[1]))
  }
  return parts.join('')
}

function parseXmlAttributes(text) {
  const attrs = {}
  for (const match of text.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) {
    attrs[match[1]] = decodeXml(match[2])
  }
  return attrs
}

function columnIndex(cellRef) {
  const letters = String(cellRef ?? '').match(/[A-Z]+/i)?.[0]
  if (!letters) {
    return null
  }
  let index = 0
  for (const letter of letters.toUpperCase()) {
    index = index * 26 + letter.charCodeAt(0) - 64
  }
  return index
}

function stripXml(text) {
  return String(text ?? '').replace(/<[^>]*>/g, '')
}

function decodeXml(text) {
  return String(text ?? '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
}

function normalizeText(value) {
  if (value === undefined || value === null) {
    return null
  }
  const text = String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\u2005/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text === '' ? null : text
}

function normalizeHeader(value) {
  return String(normalizeText(value) ?? '')
    .replace(/[：:]/g, '')
    .replace(/[％]/g, '%')
    .replace(/\s+/g, '')
    .trim()
}

function normalizeDateLike(value) {
  const text = normalizeText(value)
  if (!text) {
    return null
  }
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const serial = Number(text)
    if (serial > 20000 && serial < 80000) {
      const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
    }
  }
  return text
}

function cleanFields(fields) {
  const output = {}
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (value === undefined || value === null || value === '') {
      continue
    }
    if (typeof value === 'string') {
      const normalized = normalizeText(value)
      if (normalized) {
        output[key] = normalized
      }
    } else {
      output[key] = value
    }
  }
  return output
}

function increment(target, key) {
  target[key] = (target[key] ?? 0) + 1
}

function buildSourceId(input) {
  const hash = createHash('sha256')
    .update(`${input.customerKey}|${input.domain}|${input.fileName}|${input.sheetName}|${input.rowNumber}|${JSON.stringify(input.fields)}`)
    .digest('hex')
    .slice(0, 12)
  return `${input.customerKey}-${input.domain}-${hash}`
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

async function main() {
  try {
    const options = parseCliArgs(process.argv.slice(2))
    if (options.help) {
      console.log(USAGE)
      return
    }
    const result = await runExtraction(options)
    console.log(
      `Extracted ${result.summary.sourceCount} source row(s) from ${result.summary.workbookCount} workbook(s). Output: ${options.out}`,
    )
  } catch (error) {
    if (error instanceof CliError) {
      console.error(error.message)
      process.exitCode = error.exitCode
      return
    }
    throw error
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
