import {
  isPositiveNumeric20Scale6Units,
  numeric20Scale6Units,
} from './numeric20Scale6.mjs'
import {
  XlsxImportError as BOMXlsxImportError,
  columnIndex,
  normalizeText,
  readXlsxWorkbook,
} from './xlsxWorkbook.mjs'

export {
  XlsxImportError as BOMXlsxImportError,
  MAX_XLSX_FILE_BYTES as MAX_BOM_XLSX_FILE_BYTES,
} from './xlsxWorkbook.mjs'

const MAX_BOM_IMPORT_ROWS = 1000

const HEADER_ALIASES = {
  materialCode: ['材料编号', '物料编号'],
  materialName: ['物料名称', '材料名称', '材料品名'],
  supplierItemNo: ['款号', '厂商料号'],
  materialSpec: ['规格'],
  color: ['颜色'],
  unit: ['单位'],
  position: ['组装部位', '部位'],
  pieceCount: ['片数'],
  unitQuantity: ['单位用量'],
  lossRate: ['损耗%', '损耗率'],
  totalQuantity: ['总用量含损耗', '总用量', '材料耗量'],
  processBase: ['加工基础'],
  processMethod: ['加工程序', '加工方式'],
  note: ['备注'],
}

function fail(message, code) {
  throw new BOMXlsxImportError(message, code)
}

function normalizedFileName(value) {
  const parts = String(value || 'BOM.xlsx').split(/[\\/]/u)
  return parts.at(-1)?.trim() || 'BOM.xlsx'
}

function normalizeHeader(value) {
  return normalizeText(value)
    .replace(/[：:]/gu, '')
    .replace(/％/gu, '%')
    .replace(/\s+/gu, '')
    .trim()
}

function headerDescriptors(row, mergeRanges) {
  const descriptors = []
  row.values.forEach((value, index) => {
    const label = normalizeHeader(value)
    if (!label) return
    const column = index + 1
    const merge = mergeRanges.find(
      (item) =>
        item.startRow === row.rowNumber &&
        item.endRow === row.rowNumber &&
        item.startColumn === column
    )
    descriptors.push({
      label,
      rawLabel: normalizeText(value),
      startColumn: column,
      endColumn: merge?.endColumn || column,
    })
  })
  return descriptors
}

function descriptorMatchesAlias(descriptor, alias, allowPrefixedLabel) {
  const normalizedAlias = normalizeHeader(alias)
  return (
    descriptor.label === normalizedAlias ||
    (allowPrefixedLabel && descriptor.label.includes(normalizedAlias))
  )
}

function descriptorsByAlias(header, aliasKey) {
  const aliases = HEADER_ALIASES[aliasKey] || [aliasKey]
  const allowPrefixedLabel = aliasKey === 'totalQuantity' || aliasKey === 'note'
  return header.descriptors.filter((descriptor) =>
    aliases.some((alias) =>
      descriptorMatchesAlias(descriptor, alias, allowPrefixedLabel)
    )
  )
}

function hasAlias(header, aliasKey) {
  return descriptorsByAlias(header, aliasKey).length > 0
}

function findMaterialDetailHeader(rows, mergeRanges) {
  for (const row of rows) {
    const header = {
      rowNumber: row.rowNumber,
      row,
      descriptors: headerDescriptors(row, mergeRanges),
    }
    if (hasAlias(header, 'materialName') && hasAlias(header, 'unitQuantity')) {
      return header
    }
  }
  fail(
    '材料分析明细表缺少“物料名称”或“单位用量”表头，无法导入',
    'unsupported_bom_sheet'
  )
}

function valuesByAlias(row, header, aliasKey) {
  const values = []
  for (const descriptor of descriptorsByAlias(header, aliasKey)) {
    for (
      let column = descriptor.startColumn;
      column <= descriptor.endColumn;
      column += 1
    ) {
      const value = normalizeText(row.values[column - 1])
      if (value && !values.includes(value)) values.push(value)
    }
  }
  return values
}

function valueByAlias(row, header, aliasKey) {
  return valuesByAlias(row, header, aliasKey)[0] || ''
}

function looksLikeLabel(value) {
  const text = normalizeText(value)
  if (!text) return true
  return (
    /[:：]$/u.test(text) ||
    /^(?:PCS|PC|只|个|件|套)$/iu.test(text) ||
    /^(?:产品编号|产品名称|订单编号|订单号|数量|日期|定单日期|设计师|毛向)$/u.test(
      normalizeHeader(text)
    )
  )
}

function findLabeledValue(rows, labelPattern) {
  for (const row of rows) {
    for (let index = 0; index < row.values.length; index += 1) {
      const value = normalizeText(row.values[index])
      if (!value || !labelPattern.test(value)) continue
      for (let offset = 1; offset <= 4; offset += 1) {
        const candidate = normalizeText(row.values[index + offset])
        if (candidate && !looksLikeLabel(candidate)) return candidate
      }
    }
  }
  return ''
}

function findInlineValue(rows, labelPattern) {
  for (const row of rows) {
    for (const rawValue of row.values) {
      const value = normalizeText(rawValue)
      const match = value.match(labelPattern)
      const candidate = normalizeText(match?.[1])
      if (candidate) return candidate
    }
  }
  return ''
}

function normalizeDateLike(value, uses1904Dates) {
  const text = normalizeText(value)
  if (!text) return ''
  if (/^\d+(?:\.\d+)?$/u.test(text)) {
    const serial = Number(text)
    if (serial > 1000 && serial < 100000) {
      const epoch = uses1904Dates
        ? Date.UTC(1904, 0, 1)
        : Date.UTC(1899, 11, 30)
      const date = new Date(epoch + Math.trunc(serial) * 86400000)
      return `${date.getUTCFullYear()}-${String(
        date.getUTCMonth() + 1
      ).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
    }
  }
  const match = text.match(
    /^(\d{4})[/.\-年](\d{1,2})[/.\-月](\d{1,2})(?:日)?$/u
  )
  if (!match) return ''
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return ''
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(
    2,
    '0'
  )}-${String(day).padStart(2, '0')}`
}

function extractProductContext(sheet, header, uses1904Dates) {
  const topRows = sheet.rows.filter((row) => row.rowNumber < header.rowNumber)
  const allRows = sheet.rows
  return {
    code: findLabeledValue(topRows, /产品编号/u),
    name: findLabeledValue(topRows, /产品名称|品\s*名/u),
    sourceOrderNo: findLabeledValue(topRows, /订单编号|订单号/u),
    quantityText: findLabeledValue(topRows, /数量/u),
    spareText: findInlineValue(topRows, /含备品\s*[:：]?\s*(.+)$/u),
    printDate: normalizeDateLike(
      findLabeledValue(topRows, /日\s*期|定单日期/u),
      uses1904Dates
    ),
    designer: findInlineValue(topRows, /设计师\s*[:：]\s*(.+)$/u),
    maker: findInlineValue(allRows, /制表\s*[:：]\s*(.+)$/u),
    auditor: findInlineValue(allRows, /审核\s*[:：]\s*(.+)$/u),
    hairDirection: findInlineValue(topRows, /毛向\s*[:：]\s*(.+)$/u),
  }
}

function parseFiniteNumber(value) {
  const text = normalizeText(value).replace(/,/gu, '')
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(text)) {
    return null
  }
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

function formatDecimal(value, { nonNegative = false } = {}) {
  const number = parseFiniteNumber(value)
  if (number === null || (nonNegative && number < 0)) return ''
  if (Math.abs(number) >= 1e14) return ''
  const rounded = number.toFixed(6).replace(/0+$/u, '').replace(/\.$/u, '')
  return rounded === '-0' ? '0' : rounded
}

function normalizeLossRate(value) {
  const text = normalizeText(value)
  if (!text) return null
  const hasPercentSign = /[%％]/u.test(text)
  const number = parseFiniteNumber(text.replace(/[%％]/gu, ''))
  if (number === null || number < 0) return null
  const normalized = hasPercentSign || number > 1 ? number / 100 : number
  if (!Number.isFinite(normalized) || normalized > 1000000) return null
  return formatDecimal(normalized, { nonNegative: true }) || null
}

function inferLossRate({ orderQuantity, totalQuantity, unitQuantity }) {
  const order = parseFiniteNumber(orderQuantity)
  const total = parseFiniteNumber(totalQuantity)
  const unit = parseFiniteNumber(unitQuantity)
  if (!(order > 0) || !(total >= 0) || !(unit > 0)) return null
  let inferred = total / (order * unit) - 1
  if (inferred < 0 && inferred > -0.0005) inferred = 0
  if (inferred < 0 || inferred > 1) return null
  return formatDecimal(inferred, { nonNegative: true }) || null
}

function lossRateFromHeader(header) {
  for (const descriptor of descriptorsByAlias(header, 'totalQuantity')) {
    const match = descriptor.rawLabel
      .replace(/％/gu, '%')
      .match(/含损耗\s*([0-9]+(?:\.[0-9]+)?)\s*%/u)
    if (match) return normalizeLossRate(`${match[1]}%`)
  }
  return null
}

function lossRatesDiffer(left, right) {
  if (left === null || right === null) return false
  return Math.abs(Number(left) - Number(right)) > 0.0005
}

function resolveLossRate({
  explicitValue,
  headerDefault,
  orderQuantity,
  totalQuantity,
  unitQuantity,
}) {
  const explicitText = normalizeText(explicitValue)
  const explicit = explicitText ? normalizeLossRate(explicitText) : null
  const inferred = inferLossRate({
    orderQuantity,
    totalQuantity,
    unitQuantity,
  })

  if (explicitText && explicit === null) {
    return {
      value: '',
      source: 'unresolved',
      issue: `原表损耗率“${explicitText}”无法识别`,
    }
  }
  if (explicit !== null && lossRatesDiffer(explicit, inferred)) {
    return {
      value: '',
      source: 'unresolved',
      issue: '原表损耗率与单位用量、订单数量、总用量不一致',
    }
  }
  if (explicit !== null) {
    return { value: explicit, source: 'explicit', issue: '' }
  }
  if (inferred !== null) {
    return { value: inferred, source: 'calculated', issue: '' }
  }
  if (headerDefault !== null) {
    return { value: headerDefault, source: 'header', issue: '' }
  }
  return {
    value: '',
    source: 'unresolved',
    issue: '原表未给出可确认的损耗率',
  }
}

function isFooterRow(row) {
  const joined = row.values.map(normalizeText).filter(Boolean).join(' ')
  return /^(?:合计|审核|制表)|#REF!/u.test(joined)
}

function isMaterialSubtotal(row, header, current) {
  if (
    current.materialName ||
    current.materialCode ||
    valueByAlias(row, header, 'position')
  ) {
    return false
  }
  // Unlabelled SUM rows summarize preceding parts; their cached values and
  // annotations must not become another part or overwrite material identity.
  return descriptorsByAlias(header, 'unitQuantity').some((descriptor) => {
    const formula = row.formulas[descriptor.startColumn - 1] || ''
    const match = formula
      .replace(/\s+/gu, '')
      .match(/^SUM\(\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)\)$/iu)
    return Boolean(
      match &&
        columnIndex(match[1]) === descriptor.startColumn &&
        columnIndex(match[3]) === descriptor.startColumn &&
        Number(match[2]) > header.rowNumber &&
        Number(match[2]) <= Number(match[4]) &&
        Number(match[4]) < row.rowNumber
    )
  })
}

function extractProcessing(row, header, mergeRanges) {
  const processBase = valuesByAlias(row, header, 'processBase').join(' / ')
  const processMethod = valuesByAlias(row, header, 'processMethod').join(' / ')
  const columns = descriptorsByAlias(header, 'processMethod').flatMap(
    ({ startColumn, endColumn }) =>
      Array.from(
        { length: endColumn - startColumn + 1 },
        (_, i) => startColumn + i
      )
  )
  if (hasAlias(header, 'processBase') || columns.length !== 2) {
    return { processBase, processMethod }
  }
  const [baseColumn, methodColumn] = columns
  const merged = mergeRanges.some(
    (range) =>
      range.startRow <= row.rowNumber &&
      range.endRow >= row.rowNumber &&
      range.startColumn <= baseColumn &&
      range.endColumn >= methodColumn
  )
  // A merged row contains one instruction, while two separate cells describe
  // preparation and the following cutting/processing method.
  return merged
    ? { processBase, processMethod }
    : {
        processBase: normalizeText(row.values[baseColumn - 1]),
        processMethod: normalizeText(row.values[methodColumn - 1]),
      }
}

function extractProcessingAndNote(row, header, mergeRanges) {
  const processingColumns = ['processBase', 'processMethod'].flatMap((key) =>
    descriptorsByAlias(header, key).flatMap(({ startColumn, endColumn }) =>
      Array.from(
        { length: endColumn - startColumn + 1 },
        (_, i) => startColumn + i
      )
    )
  )
  const noteDescriptors = descriptorsByAlias(header, 'note')
  const values = [...row.values]
  const notes = valuesByAlias(row, header, 'note')
  for (const range of mergeRanges) {
    if (
      range.startRow > row.rowNumber ||
      range.endRow < row.rowNumber ||
      !processingColumns.includes(range.startColumn) ||
      !noteDescriptors.some(
        ({ startColumn, endColumn }) =>
          range.startColumn <= endColumn && range.endColumn >= startColumn
      )
    ) {
      continue
    }
    // A source instruction spanning processing and remarks is one remark;
    // keep independent processing cells on the same row in their own fields.
    for (
      let column = range.startColumn;
      column <= range.endColumn;
      column += 1
    ) {
      const text = normalizeText(values[column - 1])
      if (text) notes.push(text)
      values[column - 1] = ''
    }
  }
  return {
    ...extractProcessing({ ...row, values }, header, mergeRanges),
    note: [...new Set(notes)].join(' / '),
  }
}

function carryMaterialIdentity(carried, current) {
  const startsNewMaterial = Boolean(
    current.materialName || current.materialCode
  )
  if (startsNewMaterial) {
    carried.materialCode = current.materialCode
    carried.materialName = current.materialName
    carried.supplierItemNo = current.supplierItemNo
    carried.materialSpec = current.materialSpec
    carried.color = current.color
    carried.unit = current.unit
    return
  }
  for (const key of ['supplierItemNo', 'materialSpec', 'color', 'unit']) {
    if (current[key]) carried[key] = current[key]
  }
}

function truncateText(value, maxLength) {
  return normalizeText(value).slice(0, maxLength)
}

function extractHeaderNote(header) {
  for (const descriptor of descriptorsByAlias(header, 'note')) {
    const match = descriptor.rawLabel.match(/^备注\s*[:：]\s*(.+)$/u)
    if (match?.[1]) return normalizeText(match[1])
  }
  return ''
}

function extractBOMRows(sheet, header, context) {
  const rows = []
  const carried = {
    materialCode: '',
    materialName: '',
    supplierItemNo: '',
    materialSpec: '',
    color: '',
    unit: '',
  }
  const headerDefaultLossRate = lossRateFromHeader(header)

  for (const row of sheet.rows) {
    if (row.rowNumber <= header.rowNumber || isFooterRow(row)) continue
    const current = {
      materialCode: valueByAlias(row, header, 'materialCode'),
      materialName: valueByAlias(row, header, 'materialName'),
      supplierItemNo: valueByAlias(row, header, 'supplierItemNo'),
      materialSpec: valueByAlias(row, header, 'materialSpec'),
      color: valueByAlias(row, header, 'color'),
      unit: valueByAlias(row, header, 'unit'),
    }
    if (isMaterialSubtotal(row, header, current)) continue
    carryMaterialIdentity(carried, current)

    const position = valueByAlias(row, header, 'position')
    const rawUnitQuantity = valueByAlias(row, header, 'unitQuantity')
    if (!position && !rawUnitQuantity) continue

    const totalQuantity = valueByAlias(row, header, 'totalQuantity')
    const loss = resolveLossRate({
      explicitValue: valueByAlias(row, header, 'lossRate'),
      headerDefault: headerDefaultLossRate,
      orderQuantity: context.quantityText,
      totalQuantity,
      unitQuantity: rawUnitQuantity,
    })
    const { processBase, processMethod, note } = extractProcessingAndNote(
      row,
      header,
      sheet.mergeRanges
    )
    rows.push({
      rowNumber: row.rowNumber,
      materialCode: carried.materialCode,
      materialName: carried.materialName,
      supplierItemNo: carried.supplierItemNo,
      materialSpec: carried.materialSpec,
      color: carried.color,
      unit: carried.unit,
      position: truncateText(position, 255),
      pieceCount: truncateText(valueByAlias(row, header, 'pieceCount'), 64),
      quantity: formatDecimal(rawUnitQuantity, { nonNegative: true }),
      rawQuantity: rawUnitQuantity,
      lossRate: loss.value,
      lossSource: loss.source,
      lossIssue: loss.issue,
      totalUsageSnapshot: formatDecimal(totalQuantity, {
        nonNegative: true,
      }),
      rawTotalUsage: totalQuantity,
      processBase: truncateText(processBase, 255),
      processMethod: truncateText(processMethod, 255),
      note: truncateText(note, 300),
    })
    if (rows.length > MAX_BOM_IMPORT_ROWS) {
      fail('BOM 明细超过 1000 行，请拆分文件后再导入', 'too_many_bom_rows')
    }
  }
  if (rows.length <= 0) {
    fail('材料分析明细表中没有可导入的单位用量行', 'empty_bom_rows')
  }
  return rows
}

export async function parseBOMXlsx(input, options = {}) {
  const fileName = normalizedFileName(options.fileName)
  if (!/\.xlsx$/iu.test(fileName)) {
    fail('仅支持 .xlsx 格式的 BOM Excel 文件', 'unsupported_file_type')
  }

  const workbook = await readXlsxWorkbook(input, {
    sheetFilter: (sheet) => /材料分析明细/u.test(normalizeText(sheet.name)),
  })
  if (workbook.sheets.length <= 0) {
    fail(
      '未找到“材料分析明细表”工作表，请选择现有 BOM 明细格式',
      'missing_bom_sheet'
    )
  }
  if (workbook.sheets.length > 1) {
    fail(
      '一个 Excel 中只能保留一张材料分析明细表，请拆成一个文件一个 BOM',
      'multiple_bom_sheets'
    )
  }
  const sheet = workbook.sheets[0]
  const header = findMaterialDetailHeader(sheet.rows, sheet.mergeRanges)
  const context = extractProductContext(sheet, header, workbook.uses1904Dates)
  return {
    fileName,
    sheetName: sheet.name,
    headerRowNumber: header.rowNumber,
    context: {
      ...context,
      sourceNote: extractHeaderNote(header),
    },
    rows: extractBOMRows(sheet, header, context),
  }
}

function positiveID(value) {
  const id = Number(value || 0)
  return Number.isSafeInteger(id) && id > 0 ? id : undefined
}

function comparisonText(value) {
  return normalizeText(value).toLocaleLowerCase('zh-CN')
}

function sameText(left, right) {
  const normalizedLeft = comparisonText(left)
  const normalizedRight = comparisonText(right)
  return Boolean(normalizedLeft && normalizedLeft === normalizedRight)
}

function usableRecords(records) {
  return (Array.isArray(records) ? records : []).filter(
    (record) => positiveID(record?.id) && record?.is_active !== false
  )
}

function matchProduct(context, products) {
  const records = usableRecords(products)
  if (context.code) {
    const codeMatches = records.filter((record) =>
      [record.code, record.style_no, record.customer_style_no].some((value) =>
        sameText(value, context.code)
      )
    )
    if (codeMatches.length === 1) {
      return { status: 'matched', by: '产品编号', record: codeMatches[0] }
    }
    if (codeMatches.length > 1) {
      return { status: 'ambiguous', by: '产品编号', record: null }
    }
  }
  if (context.name) {
    const nameMatches = records.filter((record) =>
      sameText(record.name, context.name)
    )
    if (nameMatches.length === 1) {
      return { status: 'matched', by: '产品名称', record: nameMatches[0] }
    }
    if (nameMatches.length > 1) {
      return { status: 'ambiguous', by: '产品名称', record: null }
    }
  }
  return { status: 'missing', by: '', record: null }
}

function matchMaterial(source, materials) {
  const records = usableRecords(materials)
  if (source.materialCode) {
    const codeMatches = records.filter((record) =>
      sameText(record.code, source.materialCode)
    )
    if (codeMatches.length === 1) {
      return { status: 'matched', by: '材料编号', record: codeMatches[0] }
    }
    if (codeMatches.length > 1) {
      return { status: 'ambiguous', by: '材料编号', record: null }
    }
  }

  let matches = records.filter((record) =>
    sameText(record.name, source.materialName)
  )
  if (source.supplierItemNo) {
    // Supplier references are not globally unique (for example 客供). Require
    // the material name as well; a conflicting reference needs manual review.
    matches = matches.filter((record) =>
      sameText(record.supplier_item_no, source.supplierItemNo)
    )
  }
  if (matches.length === 1) {
    return {
      status: 'matched',
      by: source.supplierItemNo ? '材料名称/款号' : '材料名称',
      record: matches[0],
    }
  }
  if (matches.length > 1 && source.materialSpec) {
    const specMatches = matches.filter((record) =>
      sameText(record.spec, source.materialSpec)
    )
    if (specMatches.length > 0) matches = specMatches
  }
  if (matches.length > 1 && source.color) {
    const colorMatches = matches.filter((record) =>
      sameText(record.color, source.color)
    )
    if (colorMatches.length > 0) matches = colorMatches
  }
  if (matches.length === 1) {
    return { status: 'matched', by: '材料名称/规格', record: matches[0] }
  }
  return {
    status: matches.length > 1 ? 'ambiguous' : 'missing',
    by: matches.length > 1 ? '材料名称' : '',
    record: null,
  }
}

function matchUnit(sourceUnit, units) {
  const matches = usableRecords(units).filter((record) =>
    [record.code, record.name].some((value) => sameText(value, sourceUnit))
  )
  if (matches.length === 1) {
    return { status: 'matched', by: '单位代码/名称', record: matches[0] }
  }
  return {
    status: matches.length > 1 ? 'ambiguous' : 'missing',
    by: matches.length > 1 ? '单位代码/名称' : '',
    record: null,
  }
}

function buildSourceNote(parsed) {
  const source = `Excel 导入来源：${parsed.fileName}（${parsed.sheetName}）`
  const originalNote = normalizeText(parsed.context?.sourceNote)
  return truncateText(
    originalNote ? `${source}；原表备注：${originalNote}` : source,
    300
  )
}

function matchStatusLabel(match) {
  if (match.status === 'matched') return `已按${match.by}唯一匹配`
  if (match.status === 'ambiguous') return `${match.by || '资料'}存在多个匹配项`
  return '未匹配到现有资料'
}

export function buildBOMImportDraft(
  parsed,
  { products = [], materials = [], units = [] } = {}
) {
  if (!parsed || !Array.isArray(parsed.rows) || parsed.rows.length <= 0) {
    fail('Excel 解析结果中没有 BOM 明细', 'empty_bom_rows')
  }
  const productMatch = matchProduct(parsed.context || {}, products)
  const items = parsed.rows.map((row) => {
    const materialMatch = matchMaterial(row, materials)
    const unitMatch = matchUnit(row.unit, units)
    return {
      _material_group_key:
        row.materialName || row.materialCode
          ? JSON.stringify(
              [
                row.materialCode,
                row.materialName,
                row.supplierItemNo,
                row.materialSpec,
                row.color,
                row.unit,
              ].map(comparisonText)
            )
          : undefined,
      material_id: positiveID(materialMatch.record?.id),
      quantity: row.quantity || row.rawQuantity || '',
      unit_id: positiveID(unitMatch.record?.id),
      loss_rate: row.lossRate,
      position: row.position,
      piece_count: row.pieceCount,
      total_usage_snapshot: row.totalUsageSnapshot,
      process_base: row.processBase,
      process_method: row.processMethod,
      note: row.note,
      _import_source: {
        rowNumber: row.rowNumber,
        materialName: row.materialName,
        supplierItemNo: row.supplierItemNo,
        materialSpec: row.materialSpec,
        color: row.color,
        unit: row.unit,
        rawQuantity: row.rawQuantity,
        rawTotalUsage: row.rawTotalUsage,
        lossSource: row.lossSource,
        lossIssue: row.lossIssue,
        materialMatchStatus: materialMatch.status,
        materialMatchLabel: matchStatusLabel(materialMatch),
        unitMatchStatus: unitMatch.status,
        unitMatchLabel: matchStatusLabel(unitMatch),
      },
    }
  })
  const values = {
    product_id: positiveID(productMatch.record?.id),
    version: '',
    effective_from: '',
    effective_to: '',
    source_order_no: parsed.context?.sourceOrderNo || '',
    quantity_text: parsed.context?.quantityText || '',
    spare_text: parsed.context?.spareText || '',
    print_date: parsed.context?.printDate || '',
    designer: truncateText(parsed.context?.designer, 255),
    maker: truncateText(parsed.context?.maker, 255),
    auditor: truncateText(parsed.context?.auditor, 255),
    hair_direction: truncateText(parsed.context?.hairDirection, 255),
    note: buildSourceNote(parsed),
    items,
  }
  return {
    values,
    review: {
      fileName: parsed.fileName,
      sheetName: parsed.sheetName,
      rowCount: items.length,
      productCode: parsed.context?.code || '',
      productName: parsed.context?.name || '',
      productMatchStatus: productMatch.status,
      productMatchLabel: matchStatusLabel(productMatch),
      lossEvidence: parsed.rows.reduce(
        (counts, row) => ({
          ...counts,
          [row.lossSource]: Number(counts[row.lossSource] || 0) + 1,
        }),
        {}
      ),
    },
  }
}

export function getBOMImportLineIssues(line = {}) {
  const issues = []
  if (!positiveID(line.material_id)) {
    issues.push({ field: 'material_id', message: '请选择现有材料' })
  }
  if (!positiveID(line.unit_id)) {
    issues.push({ field: 'unit_id', message: '请选择现有单位' })
  }
  const quantityUnits = numeric20Scale6Units(line.quantity)
  if (
    quantityUnits === null ||
    !isPositiveNumeric20Scale6Units(quantityUnits)
  ) {
    issues.push({
      field: 'quantity',
      message: '材料用量必须大于 0，且最多保留 6 位小数',
    })
  }
  if (numeric20Scale6Units(line.loss_rate) === null) {
    issues.push({
      field: 'loss_rate',
      message:
        line?._import_source?.lossIssue ||
        '损耗率必须为非负数，且最多保留 6 位小数',
    })
  }
  return issues
}

export function getBOMImportDraftIssues(values = {}) {
  const issues = []
  if (!positiveID(values.product_id)) {
    issues.push({
      scope: 'header',
      field: 'product_id',
      message: '请选择现有产品',
    })
  }
  const items = Array.isArray(values.items) ? values.items : []
  if (items.length <= 0) {
    issues.push({
      scope: 'items',
      field: 'items',
      message: '至少保留一条 BOM 明细',
    })
  }
  items.forEach((line, index) => {
    for (const issue of getBOMImportLineIssues(line)) {
      issues.push({
        ...issue,
        scope: 'item',
        itemIndex: index,
        rowNumber: line?._import_source?.rowNumber,
      })
    }
  })
  return issues
}
