/* eslint-disable no-bitwise -- ZIP flags and CRC32 require bit operations. */
export const MAX_XLSX_FILE_BYTES = 20 * 1024 * 1024

const MAX_ZIP_ENTRIES = 1024
const MAX_ZIP_ENTRY_BYTES = 16 * 1024 * 1024
const MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 64 * 1024 * 1024
const MAX_WORKSHEET_ROWS = 5000
const MAX_WORKSHEET_CELLS = 100000

const ZIP_EOCD_SIGNATURE = 0x06054b50
const ZIP_CENTRAL_SIGNATURE = 0x02014b50
const ZIP_LOCAL_SIGNATURE = 0x04034b50

const textDecoder = new TextDecoder('utf-8')

export class XlsxImportError extends Error {
  constructor(message, code = 'invalid_xlsx') {
    super(message)
    this.name = 'XlsxImportError'
    this.code = code
  }
}

function fail(message, code) {
  throw new XlsxImportError(message, code)
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
  if (bytes.byteLength > MAX_XLSX_FILE_BYTES) {
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
      compressedSize > MAX_XLSX_FILE_BYTES ||
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
    if (error instanceof XlsxImportError) throw error
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
  // OOXML writers may use either a default namespace or prefixed elements.
  // Attribute prefixes remain intact because r:id identifies sheet relations.
  return textDecoder
    .decode(await extractZipEntry(zip, name))
    .replace(/(<\/?)[A-Za-z_][\w.-]*:/gu, '$1')
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

export function columnIndex(cellRef) {
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

export function normalizeText(value) {
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
    const formulas = []
    const cellTypes = []
    for (const cellMatch of rowMatch[2].matchAll(
      /<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/gu
    )) {
      cellCount += 1
      if (cellCount > MAX_WORKSHEET_CELLS) {
        fail('Excel 工作表单元格过多，请拆分后再导入', 'worksheet_too_large')
      }
      const attributes = parseXmlAttributes(cellMatch[1] ?? cellMatch[2])
      const column = columnIndex(attributes.r)
      if (!column || column > 16384) {
        fail('Excel 单元格列号无效', 'invalid_cell_reference')
      }
      cellTypes[column - 1] = attributes.t || 'n'
      values[column - 1] = normalizeText(
        extractCellValue(cellMatch[3] ?? '', attributes, sharedStrings)
      )
      const formula = (cellMatch[3] ?? '').match(/<f\b[^>]*>([\s\S]*?)<\/f>/u)
      if (formula) formulas[column - 1] = decodeXml(stripXml(formula[1]))
    }
    const normalizedRow = {
      rowNumber:
        Number.isSafeInteger(rowNumber) && rowNumber > 0
          ? rowNumber
          : rows.length + 1,
      values,
      formulas,
      cellTypes,
    }
    if (values.some(Boolean) || formulas.some(Boolean)) rows.push(normalizedRow)
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

export async function readXlsxWorkbook(
  input,
  { sheetFilter = () => true, includeImages = false } = {}
) {
  const zip = parseZip(input)
  const workbookXml = await readZipText(zip, 'xl/workbook.xml')
  const relationships = parseRelationships(
    await readZipText(zip, 'xl/_rels/workbook.xml.rels')
  )
  const sheetInfos = parseWorkbookSheets(workbookXml).filter(sheetFilter)
  if (sheetInfos.length > 64) {
    fail('Excel 工作表过多，请拆分文件后再导入', 'too_many_sheets')
  }
  const sharedStrings = zip.entries.has('xl/sharedStrings.xml')
    ? parseSharedStrings(await readZipText(zip, 'xl/sharedStrings.xml'))
    : []
  const sheets = []
  const imagesByID = new Map()
  const imageCache = new Map()
  const readImage = async (part, target) => {
    if (!target) return null
    const name = resolvePartTarget(part, target)
    if (!zip.entries.has(name)) return null
    if (imageCache.has(name)) return imageCache.get(name)
    const bytes = await extractZipEntry(zip, name)
    const mimeType = rasterMimeType(bytes)
    if (!mimeType) return null
    const image = { bytes, mimeType, name }
    imageCache.set(name, image)
    return image
  }
  if (includeImages && zip.entries.has('xl/cellimages.xml')) {
    const xml = await readZipText(zip, 'xl/cellimages.xml')
    const rels = zip.entries.has('xl/_rels/cellimages.xml.rels')
      ? parseRelationships(
          await readZipText(zip, 'xl/_rels/cellimages.xml.rels')
        )
      : new Map()
    for (const match of xml.matchAll(
      /<cellImage\b[^>]*>([\s\S]*?)<\/cellImage>/gu
    )) {
      const props = parseXmlAttributes(match[1].match(/<cNvPr\b([^>]*)/u)?.[1])
      const blip = parseXmlAttributes(match[1].match(/<blip\b([^>]*)/u)?.[1])
      const image = await readImage(
        'xl/cellimages.xml',
        rels.get(blip['r:embed'])
      )
      if (props.name && image) {
        if (imagesByID.has(props.name))
          { fail('Excel 图片编号重复，无法可靠匹配', 'duplicate_image_id') }
        imagesByID.set(props.name, image)
      }
    }
  }
  for (const info of sheetInfos) {
    const target = relationships.get(info.relationshipId)
    if (!target) fail('工作表缺少内部关联，无法读取', 'missing_sheet_relation')
    const sheetPath = normalizeWorkbookTarget(target)
    const xml = await readZipText(zip, sheetPath)
    const imagesByCell = new Map()
    const relationPath = partRelationshipsPath(sheetPath)
    if (includeImages && zip.entries.has(relationPath)) {
      const sheetRels = parseRelationships(await readZipText(zip, relationPath))
      for (const drawing of xml.matchAll(/<drawing\b([^>]*)/gu)) {
        const drawingTarget = sheetRels.get(
          parseXmlAttributes(drawing[1])['r:id']
        )
        if (!drawingTarget) continue
        const drawingPath = resolvePartTarget(sheetPath, drawingTarget)
        const drawingRelsPath = partRelationshipsPath(drawingPath)
        if (!zip.entries.has(drawingPath) || !zip.entries.has(drawingRelsPath))
          { continue }
        const drawingXml = await readZipText(zip, drawingPath)
        const drawingRels = parseRelationships(
          await readZipText(zip, drawingRelsPath)
        )
        for (const anchor of drawingXml.matchAll(
          /<(?:oneCellAnchor|twoCellAnchor)\b[^>]*>([\s\S]*?)<\/(?:oneCellAnchor|twoCellAnchor)>/gu
        )) {
          const from =
            anchor[1].match(/<from\b[^>]*>([\s\S]*?)<\/from>/u)?.[1] || ''
          const row = Number(from.match(/<row>(\d+)<\/row>/u)?.[1]) + 1
          const column = Number(from.match(/<col>(\d+)<\/col>/u)?.[1]) + 1
          if (!Number.isSafeInteger(row) || !Number.isSafeInteger(column))
            { continue }
          const blip = parseXmlAttributes(
            anchor[1].match(/<blip\b([^>]*)/u)?.[1]
          )
          const image = await readImage(
            drawingPath,
            drawingRels.get(blip['r:embed'])
          )
          if (image) {
            const key = `${row}:${column}`
            imagesByCell.set(key, [...(imagesByCell.get(key) || []), image])
          }
        }
      }
    }
    sheets.push({
      name: normalizeText(info.name),
      rows: parseSheetRows(xml, sharedStrings),
      mergeRanges: parseMergeRanges(xml),
      imagesByCell,
    })
  }
  return {
    sheets,
    imagesByID,
    uses1904Dates: workbookUses1904Dates(workbookXml),
  }
}

function partRelationshipsPath(part) {
  const parts = part.split('/')
  const file = parts.pop()
  return `${parts.join('/')}/_rels/${file}.rels`
}

function resolvePartTarget(part, target) {
  if (/[:\\]/u.test(target) || target.includes(String.fromCharCode(0)))
    { fail('Excel 图片路径无效', 'invalid_relationship') }
  const parts = target.startsWith('/') ? [] : part.split('/').slice(0, -1)
  for (const segment of target.replace(/^\//u, '').split('/')) {
    if (segment === '..') {
      if (parts.length <= 1) fail('Excel 图片路径越界', 'invalid_relationship')
      parts.pop()
    } else if (segment !== '.') {
      if (!segment) fail('Excel 图片路径无效', 'invalid_relationship')
      parts.push(segment)
    }
  }
  if (parts[0] !== 'xl') fail('Excel 图片路径越界', 'invalid_relationship')
  return parts.join('/')
}

function rasterMimeType(bytes) {
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value))
    { return 'image/png' }
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    { return 'image/jpeg' }
  const header = String.fromCharCode(...bytes.slice(0, 12))
  if (/^GIF8[79]a/u.test(header)) return 'image/gif'
  if (header.startsWith('RIFF') && header.endsWith('WEBP')) return 'image/webp'
  return ''
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
