/* eslint-disable no-bitwise -- the browser fixture needs valid ZIP CRC32 fields. */
import { Buffer } from 'node:buffer'

const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let entry = value
  for (let bit = 0; bit < 8; bit += 1) {
    entry = (entry >>> 1) ^ (0xedb88320 & -(entry & 1))
  }
  return entry >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function createStoredZip(entries) {
  const localParts = []
  const centralParts = []
  let localOffset = 0

  for (const [name, content] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name)
    const contentBuffer = Buffer.from(content)
    const checksum = crc32(contentBuffer)
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0x0800, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(contentBuffer.length, 18)
    localHeader.writeUInt32LE(contentBuffer.length, 22)
    localHeader.writeUInt16LE(nameBuffer.length, 26)
    localParts.push(localHeader, nameBuffer, contentBuffer)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0x0800, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(contentBuffer.length, 20)
    centralHeader.writeUInt32LE(contentBuffer.length, 24)
    centralHeader.writeUInt16LE(nameBuffer.length, 28)
    centralHeader.writeUInt32LE(localOffset, 42)
    centralParts.push(centralHeader, nameBuffer)
    localOffset += localHeader.length + nameBuffer.length + contentBuffer.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(entries).length, 8)
  end.writeUInt16LE(Object.keys(entries).length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(localOffset, 16)
  return Buffer.concat([...localParts, centralDirectory, end])
}

function columnLetters(index) {
  let value = index
  let letters = ''
  while (value > 0) {
    value -= 1
    letters = `${String.fromCharCode(65 + (value % 26))}${letters}`
    value = Math.floor(value / 26)
  }
  return letters
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function createSheetXml(rows) {
  const rowXml = rows
    .map((values, rowIndex) => {
      const cells = values
        .map((value, columnIndex) => {
          if (value === null || value === undefined || value === '') return ''
          const reference = `${columnLetters(columnIndex + 1)}${rowIndex + 1}`
          return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`
        })
        .join('')
      return `<row r="${rowIndex + 1}">${cells}</row>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet><sheetData>${rowXml}</sheetData><mergeCells count="1"><mergeCell ref="H5:I5"/></mergeCells></worksheet>`
}

export function createBOMImportWorkbookFixture() {
  const rows = [
    ['样式测试公司', null, null, null, null, '毛向:单方向'],
    ['物 料 分 析 明 细 表'],
    [
      '产品编号：',
      'PROD-STYLE-L1',
      '订单编号:',
      'ORDER-IMPORT-L1',
      null,
      '数量:PCS',
      '100',
      '含备品0',
    ],
    [
      '产品名称:',
      '样式产品',
      null,
      null,
      null,
      '日 期:',
      '46041',
      '设计师：样式设计员',
    ],
    [
      '物料名称',
      '厂商料号',
      '规格',
      '单位',
      '组装部位',
      '单位用量',
      '总用量\n含损耗10％',
      '加工程序',
      null,
      '备注：',
    ],
    [
      '样式材料',
      'SUP-L1',
      '短毛绒 300g',
      '核心演示单位-件',
      '前片*1',
      '0.5',
      '55',
      '贴衬',
      '激光',
      '已匹配行',
    ],
    [
      '尚未建档材料',
      'SUP-MISSING',
      '测试规格',
      '核心演示单位-件',
      '后片*1',
      '1',
      '100',
      null,
      null,
      '待补全行',
    ],
    ['审核：', null, null, null, '制表：样式制表员'],
  ]
  return createStoredZip({
    'xl/workbook.xml':
      '<?xml version="1.0"?><workbook xmlns:r="relationships"><sheets><sheet name="材料分析明细表" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': createSheetXml(rows),
  })
}
