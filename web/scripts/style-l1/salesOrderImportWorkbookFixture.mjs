/* eslint-disable no-bitwise -- Minimal OOXML fixtures need ZIP CRC32 checksums. */
import { Buffer } from 'node:buffer'
import { deflateRawSync } from 'node:zlib'

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function zip(entries) {
  const local = []
  const central = []
  let offset = 0
  for (const [name, value] of Object.entries(entries)) {
    const filename = Buffer.from(name)
    const data = Buffer.from(value)
    const compressed = deflateRawSync(data)
    const checksum = crc32(data)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(8, 8)
    header.writeUInt32LE(checksum, 14)
    header.writeUInt32LE(compressed.length, 18)
    header.writeUInt32LE(data.length, 22)
    header.writeUInt16LE(filename.length, 26)
    local.push(header, filename, compressed)
    const directory = Buffer.alloc(46)
    directory.writeUInt32LE(0x02014b50, 0)
    directory.writeUInt16LE(20, 4)
    directory.writeUInt16LE(20, 6)
    directory.writeUInt16LE(8, 10)
    directory.writeUInt32LE(checksum, 16)
    directory.writeUInt32LE(compressed.length, 20)
    directory.writeUInt32LE(data.length, 24)
    directory.writeUInt16LE(filename.length, 28)
    directory.writeUInt32LE(offset, 42)
    central.push(directory, filename)
    offset += header.length + filename.length + compressed.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(entries).length, 8)
  end.writeUInt16LE(Object.keys(entries).length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, directory, end])
}

const xml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
function letters(index) {
  let result = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    result = String.fromCharCode(65 + ((n - 1) % 26)) + result
  }
  return result
}

export function createSalesOrderWorkbook({
  sheets,
  date1904 = false,
  prefixed = false,
  cellImages = [],
} = {}) {
  sheets ||= [
    { name: '订单汇总', rows: salesOrderFixtureRows(), merges: ['Q4:Q5'] },
    {
      name: '辅助来货表',
      rows: [
        ['产品名称', '数量', '来货数量'],
        ['模拟产品', 100, 80],
      ],
    },
  ]
  const prefix = (content) =>
    prefixed ? content.replace(/(<\/?)([A-Za-z]+)/gu, '$1x:$2') : content
  const entries = {
    'xl/workbook.xml': prefix(
      `<workbook><workbookPr date1904="${date1904 ? 1 : 0}"/><sheets>${sheets.map((sheet, i) => `<sheet name="${xml(sheet.name)}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`
    ),
    'xl/_rels/workbook.xml.rels': `<Relationships>${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
  }
  sheets.forEach((sheet, i) => {
    const rows = sheet.rows
      .map(
        (row, r) =>
          `<row r="${r + 1}">${row
            .map((value, c) => {
              if (value === undefined || value === null || value === '') {
                return ''
              }
              const ref = `${letters(c)}${r + 1}`
              if (typeof value === 'number') {
                return `<c r="${ref}"><v>${value}</v></c>`
              }
              if (typeof value === 'object') {
                return `<c r="${ref}" t="${value.type || 'n'}">${value.formula ? `<f>${xml(value.formula)}</f>` : ''}${value.value === undefined ? '' : `<v>${xml(value.value)}</v>`}</c>`
              }
              return `<c r="${ref}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`
            })
            .join('')}</row>`
      )
      .join('')
    const merges = (sheet.merges || [])
      .map((ref) => `<mergeCell ref="${ref}"/>`)
      .join('')
    entries[`xl/worksheets/sheet${i + 1}.xml`] = prefix(
      `<worksheet><sheetData>${rows}</sheetData><mergeCells>${merges}</mergeCells></worksheet>`
    )
  })
  if (cellImages.length) {
    entries['xl/cellimages.xml'] =
      `<etc:cellImages>${cellImages.map((image, i) => `<etc:cellImage><xdr:pic><xdr:cNvPr name="${xml(image.id)}"/><a:blip r:embed="rId${i + 1}"/></xdr:pic></etc:cellImage>`).join('')}</etc:cellImages>`
    entries['xl/_rels/cellimages.xml.rels'] =
      `<Relationships>${cellImages.map((image, i) => `<Relationship Id="rId${i + 1}" Target="${xml(image.target || `media/image${i + 1}.png`)}" ${image.external ? 'TargetMode="External"' : ''}/>`).join('')}</Relationships>`
    cellImages.forEach((image, i) => {
      entries[`xl/media/image${i + 1}.png`] = image.bytes
    })
  }
  return zip(entries)
}

export function salesOrderFixtureRows() {
  return [
    ['模拟工厂订单汇总'],
    [
      '下单日期',
      '客户',
      '订单编号',
      '客户订单号',
      '产品编号',
      '产品名称',
      '订单数量',
      '船头版',
      '生产数量',
      '出货日期',
      '未出货数',
      '跟单业务人员',
      '图片',
      '类别',
      '单价',
      '设计师',
      '备注',
      '工艺',
      '单位',
      '币种',
    ],
    [
      '2026-04-07',
      'CUS-STYLE-L1',
      'SO-IMPORT-001',
      'PO-001',
      '00128',
      '模拟订货产品',
      1000,
      12,
      1012,
      '2026-05-16',
      500,
      '模拟业务员',
      '=DISPIMG("untrusted",1)',
      '新单',
      15.8,
      '设计师甲',
      '核对样品',
      '新单工艺',
    ],
    [
      '2026-04-10',
      'CUS-STYLE-L1',
      'SO-IMPORT-002',
      '',
      '00201',
      '第二张订单产品一',
      1800,
      15,
      1815,
      '2026-05-18',
      200,
      '模拟业务员',
      '',
      '新单',
      21,
      '',
      '共享备注',
      '新单工艺',
    ],
    [
      '2026-04-10',
      'CUS-STYLE-L1',
      'SO-IMPORT-002',
      '',
      '00202',
      '第二张订单产品二',
      2800,
      15,
      2815,
      '2026-05-19',
      '',
      '模拟业务员',
      '',
      '返单',
      26.400000000000002,
      '',
      '',
      '返单工艺',
    ],
    ['注意条件：'],
    ['1、自动生成款号并从外部路径抓取图片'],
  ]
}
