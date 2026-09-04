/* eslint-disable no-bitwise -- ZIP flags and CRC32 require bit operations. */
import {
  isPositiveNumeric20Scale6Units,
  numeric20Scale6Units,
} from './numeric20Scale6.mjs'

export const MAX_BOM_XLSX_FILE_BYTES = 20 * 1024 * 1024

const MAX_ZIP_ENTRIES = 1024
const MAX_ZIP_ENTRY_BYTES = 16 * 1024 * 1024
const MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 64 * 1024 * 1024
const MAX_WORKSHEET_ROWS = 5000
const MAX_WORKSHEET_CELLS = 100000
const MAX_BOM_IMPORT_ROWS = 1000

const ZIP_EOCD_SIGNATURE = 0x06054b50
const ZIP_CENTRAL_SIGNATURE = 0x02014b50
const ZIP_LOCAL_SIGNATURE = 0x04034b50

const HEADER_ALIASES = {
  materialCode: ['材料编号', '物料编号'],
  materialName: ['物料名称', '材料名称', '材料品名'],
  supplierItemNo: ['厂商料号'],
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

const textDecoder = new TextDecoder('utf-8')

export class BOMXlsxImportError extends Error {
  constructor(message, code = 'invalid_xlsx') {
    super(message)
    this.name = 'BOMXlsxImportError'
    this.code = code
  }
}

function fail(message, code) {
  throw new BOMXlsxImportError(message, code)
}

function normalizedFileName(value) {
  const parts = String(value || 'BOM.xlsx').split(/[\\/]/u)
  return parts.at(-1)?.trim() || 'BOM.xlsx'
}

function toBytes(input) {
  if (input instanceof Uint8Array) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  }
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  }
  fail('无法读取该 Excel 文件，请重新选择 .xlsx 文件', 'invalid_input')
}

function assertRange(bytes, offset, length, message) {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > bytes.byteLength
  ) {
    fail(message, 'invalid_zip')
  }
}

function readUint16(view, offset) {
  if (offset < 0 || offset + 2 > view.byteLength) {
    fail('Excel 文件结构不完整，无法读取', 'invalid_zip')
  }
  return view.getUint16(offset, true)
}

function readUint32(view, offset) {
  if (offset < 0 || offset + 4 > view.byteLength) {
    fail('Excel 文件结构不完整，无法读取', 'invalid_zip')
  }
  return view.getUint32(offset, true)
}

function findEndOfCentralDirectory(bytes, view) {
  if (bytes.byteLength < 22) {
    fail('所选文件不是有效的 .xlsx 文件', 'invalid_zip')
  }
  const minOffset = Math.max(0, bytes.byteLength - 65557)
  for (let offset = bytes.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (readUint32(view, offset) === ZIP_EOCD_SIGNATURE) return offset
  }
  fail('所选文件不是有效的 .xlsx 文件', 'invalid_zip')
}

function validateZipEntryName(name) {
  if (!name || name.includes('\\') || name.startsWith('/')) {
    fail('Excel 文件包含不安全的内部路径', 'invalid_zip_path')
  }
  const normalized = name.endsWith('/') ? name.slice(0, -1) : name
  const parts = normalized.split('/')
  if (
    !normalized ||
    parts.some((part) => !part || part === '.' || part === '..')
  ) {
    fail('Excel 文件包含不安全的内部路径', 'invalid_zip_path')
  }
}

function parseZip(input) {
  const bytes = toBytes(input)
  if (bytes.byteLength <= 0) {
    fail('所选 Excel 文件为空', 'empty_file')
  }
  if (bytes.byteLength > MAX_BOM_XLSX_FILE_BYTES) {
    fail('Excel 文件超过 20MB，请精简图片或拆分后再导入', 'file_too_large')
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocdOffset = findEndOfCentralDirectory(bytes, view)
  assertRange(bytes, eocdOffset, 22, 'Excel 文件尾部结构不完整')
  const diskNumber = readUint16(view, eocdOffset + 4)
  const centralDiskNumber = readUint16(view, eocdOffset + 6)
  const diskEntryCount = readUint16(view, eocdOffset + 8)
  const entryCount = readUint16(view, eocdOffset + 10)
  const centralSize = readUint32(view, eocdOffset + 12)
  const centralOffset = readUint32(view, eocdOffset + 16)
  const commentLength = readUint16(view, eocdOffset + 20)

  if (
    diskNumber !== 0 ||
    centralDiskNumber !== 0 ||
    diskEntryCount !== entryCount ||
    entryCount === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff ||
    entryCount > MAX_ZIP_ENTRIES
  ) {
    fail('该 Excel 使用了暂不支持的压缩结构', 'unsupported_zip')
  }
  if (eocdOffset + 22 + commentLength !== bytes.byteLength) {
    fail('Excel 文件尾部结构不完整', 'invalid_zip')
  }
  if (centralOffset + centralSize > eocdOffset) {
    fail('Excel 文件目录结构不完整', 'invalid_zip')
  }
  assertRange(bytes, centralOffset, centralSize, 'Excel 文件目录结构不完整')

  const entries = new Map()
  const centralEnd = centralOffset + centralSize
  let totalUncompressedBytes = 0
  let offset = centralOffset

  for (let index = 0; index < entryCount; index += 1) {
    assertRange(bytes, offset, 46, 'Excel 文件目录项不完整')
    if (readUint32(view, offset) !== ZIP_CENTRAL_SIGNATURE) {
      fail('Excel 文件目录项无效', 'invalid_zip')
    }
    const flags = readUint16(view, offset + 8)
    const method = readUint16(view, offset + 10)
    const checksum = readUint32(view, offset + 16)
    const compressedSize = readUint32(view, offset + 20)
    const uncompressedSize = readUint32(view, offset + 24)
    const nameLength = readUint16(view, offset + 28)
    const extraLength = readUint16(view, offset + 30)
    const entryCommentLength = readUint16(view, offset + 32)
    const localHeaderOffset = readUint32(view, offset + 42)
    const entryEnd = offset + 46 + nameLength + extraLength + entryCommentLength

    if (entryEnd > centralEnd) {
      fail('Excel 文件目录项越界', 'invalid_zip')
    }
    const name = textDecoder.decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength)
    )
    validateZipEntryName(name)
    if ((flags & 1) !== 0) {
      fail('不支持加密的 Excel 文件，请先取消文件密码', 'encrypted_xlsx')
    }
    if (method !== 0 && method !== 8) {
      fail('该 Excel 使用了暂不支持的压缩方式', 'unsupported_zip')
    }
    if (
      compressedSize > MAX_BOM_XLSX_FILE_BYTES ||
      uncompressedSize > MAX_ZIP_ENTRY_BYTES
    ) {
      fail('Excel 内部数据过大，请精简文件后再导入', 'xlsx_too_large')
    }
    totalUncompressedBytes += uncompressedSize
    if (totalUncompressedBytes > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES) {
      fail('Excel 解压后的内容过大，请精简文件后再导入', 'xlsx_too_large')
    }
    if (entries.has(name)) {
      fail('Excel 文件包含重复的内部条目', 'invalid_zip')
    }
    assertRange(bytes, localHeaderOffset, 30, 'Excel 文件数据项不完整')
    entries.set(name, {
      name,
      flags,
      method,
      checksum,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    })
    offset = entryEnd
  }
  if (offset !== centralEnd) {
    fail('Excel 文件目录长度不一致', 'invalid_zip')
  }
  return { bytes, view, centralOffset, entries }
}

async function inflateRawLimited(compressed, expectedSize) {
  if (typeof DecompressionStream !== 'function') {
    fail(
      '当前浏览器无法解压 Excel，请改用项目支持的最新版 Chrome',
      'unsupported_browser'
    )
  }
  let reader
  try {
    reader = new Blob([compressed])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'))
      .getReader()
    const chunks = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value)
      total += chunk.byteLength
      if (total > expectedSize || total > MAX_ZIP_ENTRY_BYTES) {
        await reader.cancel()
        fail('Excel 内部数据大小异常', 'invalid_zip')
      }
      chunks.push(chunk)
    }
    if (total !== expectedSize) {
      fail('Excel 内部数据长度不一致', 'invalid_zip')
    }
    const output = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      output.set(chunk, offset)
      offset += chunk.byteLength
    }
    return output
  } catch (error) {
    if (error instanceof BOMXlsxImportError) throw error
    try {
      await reader?.cancel()
    } catch {
      // The decompressor is already closed.
    }
    fail('Excel 内部压缩数据损坏，无法读取', 'invalid_zip')
  }
}

async function extractZipEntry(zip, name) {
  const entry = zip.entries.get(name)
  if (!entry) fail('Excel 缺少必要的工作簿数据', 'missing_xlsx_entry')

  const offset = entry.localHeaderOffset
  if (readUint32(zip.view, offset) !== ZIP_LOCAL_SIGNATURE) {
    fail('Excel 文件数据项无效', 'invalid_zip')
  }
  const localFlags = readUint16(zip.view, offset + 6)
  const localMethod = readUint16(zip.view, offset + 8)
  const nameLength = readUint16(zip.view, offset + 26)
  const extraLength = readUint16(zip.view, offset + 28)
  const dataStart = offset + 30 + nameLength + extraLength
  const dataEnd = dataStart + entry.compressedSize
  if (
    localFlags !== entry.flags ||
    localMethod !== entry.method ||
    dataEnd > zip.centralOffset
  ) {
    fail('Excel 文件数据项范围无效', 'invalid_zip')
  }
  assertRange(
    zip.bytes,
    dataStart,
    entry.compressedSize,
    'Excel 文件数据项越界'
  )
  const localName = textDecoder.decode(
    zip.bytes.subarray(offset + 30, offset + 30 + nameLength)
  )
  if (localName !== entry.name) {
    fail('Excel 文件内部条目名称不一致', 'invalid_zip')
  }

  const compressed = zip.bytes.subarray(dataStart, dataEnd)
  let output
  if (entry.method === 0) {
    if (entry.compressedSize !== entry.uncompressedSize) {
      fail('Excel 内部数据长度不一致', 'invalid_zip')
    }
    output = new Uint8Array(compressed)
  } else {
    output = await inflateRawLimited(compressed, entry.uncompressedSize)
  }
  if (crc32(output) !== entry.checksum) {
    fail('Excel 内部数据校验失败', 'invalid_zip')
  }
  return output
}

async function readZipText(zip, name) {
  return textDecoder.decode(await extractZipEntry(zip, name))
}

function decodeXml(text) {
  return String(text ?? '')
    .replace(/&#(x[0-9a-f]+|\d+);/giu, (_match, rawCode) => {
      const hexadecimal = String(rawCode).toLowerCase().startsWith('x')
      const codePoint = Number.parseInt(
        hexadecimal ? String(rawCode).slice(1) : rawCode,
        hexadecimal ? 16 : 10
      )
      if (!Number.isSafeInteger(codePoint) || codePoint < 0) return ''
      try {
        return String.fromCodePoint(codePoint)
      } catch {
        return ''
      }
    })
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
}

function parseXmlAttributes(text) {
  const attributes = {}
  for (const match of String(text || '').matchAll(
    /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu
  )) {
    attributes[match[1]] = decodeXml(match[2] ?? match[3] ?? '')
  }
  return attributes
}

function parseRelationships(xml) {
  const relationships = new Map()
  for (const match of xml.matchAll(/<Relationship\b([^>]*)\/?\s*>/gu)) {
    const attributes = parseXmlAttributes(match[1])
    if (!attributes.Id || !attributes.Target) continue
    if (String(attributes.TargetMode || '').toLowerCase() === 'external') {
      continue
    }
    relationships.set(attributes.Id, attributes.Target)
  }
  return relationships
}

function parseWorkbookSheets(xml) {
  const sheets = []
  for (const match of xml.matchAll(/<sheet\b([^>]*)\/?\s*>/gu)) {
    const attributes = parseXmlAttributes(match[1])
    if (attributes.name && attributes['r:id']) {
      sheets.push({
        name: attributes.name,
        relationshipId: attributes['r:id'],
      })
    }
  }
  return sheets
}

function workbookUses1904Dates(xml) {
  const match = xml.match(/<workbookPr\b([^>]*)\/?\s*>/u)
  if (!match) return false
  const value = String(parseXmlAttributes(match[1]).date1904 || '')
    .trim()
    .toLowerCase()
  return value === '1' || value === 'true'
}

function normalizeWorkbookTarget(target) {
  const value = String(target || '')
  if (!value || value.includes('\\') || value.includes('://')) {
    fail('Excel 工作表路径无效', 'invalid_relationship')
  }
  const withoutLeadingSlash = value.replace(/^\/+/, '')
  const candidate = withoutLeadingSlash.startsWith('xl/')
    ? withoutLeadingSlash
    : `xl/${withoutLeadingSlash}`
  const parts = candidate.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    fail('Excel 工作表路径无效', 'invalid_relationship')
  }
  return candidate
}

function stripXml(text) {
  return String(text ?? '').replace(/<[^>]*>/gu, '')
}

function extractTextRuns(xml) {
  const parts = []
  const withoutPhonetics = String(xml || '').replace(
    /<rPh\b[^>]*>[\s\S]*?<\/rPh>/gu,
    ''
  )
  for (const match of withoutPhonetics.matchAll(
    /<t\b[^>]*>([\s\S]*?)<\/t>/gu
  )) {
    parts.push(decodeXml(match[1]))
  }
  return parts.join('')
}

function parseSharedStrings(xml) {
  const strings = []
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gu)) {
    strings.push(extractTextRuns(match[1]))
  }
  return strings
}

function columnIndex(cellRef) {
  const letters = String(cellRef || '').match(/[A-Z]+/iu)?.[0]
  if (!letters) return null
  let index = 0
  for (const letter of letters.toUpperCase()) {
    index = index * 26 + letter.charCodeAt(0) - 64
  }
  return index > 0 ? index : null
}

function cellRowNumber(cellRef) {
  const digits = String(cellRef || '').match(/\d+/u)?.[0]
  const value = Number(digits)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function extractCellValue(cellXml, attributes, sharedStrings) {
  if (attributes.t === 'inlineStr') {
    const inlineMatch = cellXml.match(/<is\b[^>]*>([\s\S]*?)<\/is>/u)
    return inlineMatch ? extractTextRuns(inlineMatch[1]) : ''
  }
  const valueMatch = cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/u)
  if (!valueMatch) return ''
  const rawValue = decodeXml(stripXml(valueMatch[1]))
  if (attributes.t === 's') {
    const index = Number(rawValue)
    return Number.isSafeInteger(index) && index >= 0
      ? (sharedStrings[index] ?? '')
      : ''
  }
  return rawValue
}

function normalizeText(value) {
  const text = String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u00a0\u2005]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  return text || ''
}

function parseSheetRows(xml, sharedStrings) {
  const rows = []
  let cellCount = 0
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/gu)) {
    if (rows.length >= MAX_WORKSHEET_ROWS) {
      fail('Excel 工作表行数过多，请拆分后再导入', 'worksheet_too_large')
    }
    const rowAttributes = parseXmlAttributes(rowMatch[1])
    const rowNumber = Number(rowAttributes.r)
    const values = []
    for (const cellMatch of rowMatch[2].matchAll(
      /<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/gu
    )) {
      cellCount += 1
      if (cellCount > MAX_WORKSHEET_CELLS) {
        fail('Excel 工作表单元格过多，请拆分后再导入', 'worksheet_too_large')
      }
      const attributes = parseXmlAttributes(cellMatch[1] ?? cellMatch[2])
      const column = columnIndex(attributes.r)
      if (!column) continue
      values[column - 1] = normalizeText(
        extractCellValue(cellMatch[3] ?? '', attributes, sharedStrings)
      )
    }
    const normalizedRow = {
      rowNumber:
        Number.isSafeInteger(rowNumber) && rowNumber > 0
          ? rowNumber
          : rows.length + 1,
      values,
    }
    if (values.some(Boolean)) rows.push(normalizedRow)
  }
  return rows
}

function parseMergeRanges(xml) {
  const ranges = []
  for (const match of xml.matchAll(/<mergeCell\b([^>]*)\/?\s*>/gu)) {
    const reference = parseXmlAttributes(match[1]).ref
    const [startRef, endRef = startRef] = String(reference || '').split(':')
    const startColumn = columnIndex(startRef)
    const endColumn = columnIndex(endRef)
    const startRow = cellRowNumber(startRef)
    const endRow = cellRowNumber(endRef)
    if (!startColumn || !endColumn || !startRow || !endRow) continue
    ranges.push({ startColumn, endColumn, startRow, endRow })
  }
  return ranges
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
    const processMethod = valuesByAlias(row, header, 'processMethod').join(
      ' / '
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
      processBase: truncateText(
        valuesByAlias(row, header, 'processBase').join(' / '),
        255
      ),
      processMethod: truncateText(processMethod, 255),
      note: truncateText(valuesByAlias(row, header, 'note').join(' / '), 300),
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

  const zip = parseZip(input)
  const workbookXml = await readZipText(zip, 'xl/workbook.xml')
  const relationshipsXml = await readZipText(zip, 'xl/_rels/workbook.xml.rels')
  const relationships = parseRelationships(relationshipsXml)
  const matchingSheets = parseWorkbookSheets(workbookXml).filter((sheet) =>
    /材料分析明细/u.test(normalizeText(sheet.name))
  )
  if (matchingSheets.length <= 0) {
    fail(
      '未找到“材料分析明细表”工作表，请选择现有 BOM 明细格式',
      'missing_bom_sheet'
    )
  }
  if (matchingSheets.length > 1) {
    fail(
      '一个 Excel 中只能保留一张材料分析明细表，请拆成一个文件一个 BOM',
      'multiple_bom_sheets'
    )
  }

  const sharedStrings = zip.entries.has('xl/sharedStrings.xml')
    ? parseSharedStrings(await readZipText(zip, 'xl/sharedStrings.xml'))
    : []
  const sheetInfo = matchingSheets[0]
  const target = relationships.get(sheetInfo.relationshipId)
  if (!target) {
    fail('材料分析明细表缺少内部关联，无法读取', 'missing_sheet_relation')
  }
  const sheetPath = normalizeWorkbookTarget(target)
  const sheetXml = await readZipText(zip, sheetPath)
  const sheet = {
    name: normalizeText(sheetInfo.name),
    rows: parseSheetRows(sheetXml, sharedStrings),
    mergeRanges: parseMergeRanges(sheetXml),
  }
  const header = findMaterialDetailHeader(sheet.rows, sheet.mergeRanges)
  const context = extractProductContext(
    sheet,
    header,
    workbookUses1904Dates(workbookXml)
  )
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
  if (matches.length === 1) {
    return { status: 'matched', by: '材料名称', record: matches[0] }
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
      material_id: positiveID(materialMatch.record?.id),
      production_operation_code: undefined,
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

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let entry = value
  for (let bit = 0; bit < 8; bit += 1) {
    entry = (entry >>> 1) ^ (0xedb88320 & -(entry & 1))
  }
  return entry >>> 0
})
