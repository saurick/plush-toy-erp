/* eslint-disable no-bitwise -- the synthetic ZIP fixture needs CRC32 fields. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { deflateRawSync } from 'node:zlib'

import {
  BOMXlsxImportError,
  buildBOMImportDraft,
  getBOMImportDraftIssues,
  parseBOMXlsx,
} from './bomXlsxImport.mjs'

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

function createZip(entries) {
  const localParts = []
  const centralParts = []
  let localOffset = 0

  for (const [name, content] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name)
    const contentBuffer = Buffer.from(content)
    const compressed = deflateRawSync(contentBuffer)
    const checksum = crc32(contentBuffer)
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0x0800, 6)
    localHeader.writeUInt16LE(8, 8)
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(compressed.length, 18)
    localHeader.writeUInt32LE(contentBuffer.length, 22)
    localHeader.writeUInt16LE(nameBuffer.length, 26)
    localParts.push(localHeader, nameBuffer, compressed)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0x0800, 8)
    centralHeader.writeUInt16LE(8, 10)
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(compressed.length, 20)
    centralHeader.writeUInt32LE(contentBuffer.length, 24)
    centralHeader.writeUInt16LE(nameBuffer.length, 28)
    centralHeader.writeUInt32LE(localOffset, 42)
    centralParts.push(centralHeader, nameBuffer)
    localOffset += localHeader.length + nameBuffer.length + compressed.length
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

function createSheetXml(rows, merges = []) {
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
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges
        .map((reference) => `<mergeCell ref="${reference}"/>`)
        .join('')}</mergeCells>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet><sheetData>${rowXml}</sheetData>${mergeXml}</worksheet>`
}

function createWorkbook(sheets) {
  const workbookSheets = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
    )
    .join('')
  const relationships = sheets
    .map(
      (_sheet, index) =>
        `<Relationship Id="rId${index + 1}" Type="worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
    )
    .join('')
  const entries = {
    'xl/workbook.xml': `<?xml version="1.0"?><workbook xmlns:r="relationships"><sheets>${workbookSheets}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0"?><Relationships>${relationships}</Relationships>`,
  }
  sheets.forEach((sheet, index) => {
    entries[`xl/worksheets/sheet${index + 1}.xml`] = createSheetXml(
      sheet.rows,
      sheet.merges
    )
  })
  return createZip(entries)
}

function firstFormatWorkbook() {
  return createWorkbook([
    {
      name: '材料分析明细表',
      merges: ['H5:I5'],
      rows: [
        ['测试公司', null, null, null, null, '毛向:单方向'],
        ['物 料 分 析 明 细 表'],
        [
          '产品编号：',
          '26029#',
          '订单编号:',
          'WL260102',
          null,
          '数量:PCS',
          '200',
          '含备品0',
        ],
        [
          '产品名称:',
          '测试产品',
          null,
          null,
          null,
          '日 期:',
          '46041',
          '设计师：测试员',
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
          '测试布料',
          'SUP-1',
          '58"',
          'Y',
          '前片*1',
          '0.5',
          '110',
          '贴衬',
          '激光',
          '布料备注',
        ],
        [null, null, null, null, '后片*1', '1', '200', null, '激光'],
        ['审核：', null, null, null, '制表：制表员'],
      ],
    },
  ])
}

function secondFormatWorkbook() {
  return createWorkbook([
    {
      name: '材料分析明细表-1',
      rows: [
        [null, '测试公司', null, null, null, null, null, null, '毛向:双方向'],
        [null, '物 料 分 析 明 细 表'],
        [
          null,
          '产品编号：',
          '26204#',
          '订单编号:',
          null,
          'XH260401',
          null,
          null,
          '数量:(PCS)',
          null,
          '100',
          '含备品2',
        ],
        [
          null,
          '产品名称:',
          '第二产品',
          null,
          null,
          null,
          null,
          null,
          '日 期:',
          null,
          '2026-04-10',
          '设计师：设计员',
        ],
        [
          '材料类别',
          '物料名称',
          '厂商料号',
          '规格',
          '颜色',
          '单位',
          '组装部位',
          '片数',
          '单位用量',
          '损耗%',
          '总用量\n含损耗',
          '加工方式',
          '加工方式',
          '备注:原表总备注',
        ],
        [
          null,
          '测试毛绒',
          '客供',
          '51"',
          '黑色',
          'Y',
          '脸*1',
          null,
          '1',
          '10',
          '110',
          '贴纸朴',
          '热裁',
        ],
        [
          null,
          null,
          null,
          null,
          null,
          null,
          '后头*2',
          null,
          '1',
          null,
          '110',
          null,
          '热裁',
        ],
        [
          null,
          '测试扣',
          null,
          '10mm',
          null,
          'PCS',
          '扣*2',
          '2',
          '2',
          null,
          '200',
          null,
          null,
          '配套使用',
        ],
      ],
    },
  ])
}

test('parseBOMXlsx: first material-detail shape keeps unit usage canonical and derives per-line loss', async () => {
  const result = await parseBOMXlsx(firstFormatWorkbook(), {
    fileName: '第一类 BOM.xlsx',
  })

  assert.equal(result.sheetName, '材料分析明细表')
  assert.equal(result.context.code, '26029#')
  assert.equal(result.context.sourceOrderNo, 'WL260102')
  assert.equal(result.context.quantityText, '200')
  assert.equal(result.context.spareText, '0')
  assert.equal(result.context.printDate, '2026-01-19')
  assert.equal(result.context.designer, '测试员')
  assert.equal(result.context.maker, '制表员')
  assert.equal(result.context.hairDirection, '单方向')
  assert.equal(result.rows.length, 2)
  assert.equal(result.rows[0].materialName, '测试布料')
  assert.equal(result.rows[0].quantity, '0.5')
  assert.equal(result.rows[0].totalUsageSnapshot, '110')
  assert.equal(result.rows[0].lossRate, '0.1')
  assert.equal(result.rows[0].processMethod, '贴衬 / 激光')
  assert.equal(result.rows[1].materialName, '测试布料')
  assert.equal(result.rows[1].lossRate, '0')
})

test('parseBOMXlsx: second shape normalizes explicit percentages and infers blank losses from totals', async () => {
  const result = await parseBOMXlsx(secondFormatWorkbook(), {
    fileName: '第二类 BOM.xlsx',
  })

  assert.equal(result.sheetName, '材料分析明细表-1')
  assert.equal(result.context.printDate, '2026-04-10')
  assert.equal(result.context.sourceNote, '原表总备注')
  assert.equal(result.rows.length, 3)
  assert.equal(result.rows[0].lossRate, '0.1')
  assert.equal(result.rows[0].lossSource, 'explicit')
  assert.equal(result.rows[0].processMethod, '贴纸朴 / 热裁')
  assert.equal(result.rows[1].lossRate, '0.1')
  assert.equal(result.rows[1].lossSource, 'calculated')
  assert.equal(result.rows[2].lossRate, '0')
  assert.equal(result.rows[2].pieceCount, '2')
})

test('buildBOMImportDraft: only unique existing master data is linked and source identity stays reviewable', async () => {
  const parsed = await parseBOMXlsx(secondFormatWorkbook(), {
    fileName: '第二类 BOM.xlsx',
  })
  const draft = buildBOMImportDraft(parsed, {
    products: [
      {
        id: 11,
        code: 'P-11',
        name: '第二产品',
        style_no: '26204#',
        is_active: true,
      },
    ],
    materials: [
      { id: 21, code: 'M-21', name: '测试毛绒', spec: '48"' },
      { id: 22, code: 'M-22', name: '测试毛绒', spec: '51"' },
      { id: 23, code: 'M-23', name: '测试扣', spec: '10mm' },
    ],
    units: [
      { id: 31, code: 'Y', name: '码' },
      { id: 32, code: 'PCS', name: '个' },
    ],
  })

  assert.equal(draft.values.product_id, 11)
  assert.equal(draft.values.version, '')
  assert.equal(draft.values.items[0].material_id, 22)
  assert.equal(draft.values.items[0].unit_id, 31)
  assert.equal(draft.values.items[2].material_id, 23)
  assert.equal(draft.values.items[2].unit_id, 32)
  assert.equal(draft.values.items[0].production_operation_code, undefined)
  assert.match(draft.values.note, /第二类 BOM\.xlsx/u)
  assert.match(draft.values.note, /原表总备注/u)
  assert.equal(draft.review.productMatchStatus, 'matched')
  assert.deepEqual(getBOMImportDraftIssues(draft.values), [])
})

test('buildBOMImportDraft: missing or ambiguous mappings stay blank until the user resolves them', async () => {
  const parsed = await parseBOMXlsx(secondFormatWorkbook(), {
    fileName: '第二类 BOM.xlsx',
  })
  const draft = buildBOMImportDraft(parsed, {
    products: [],
    materials: [
      { id: 21, code: 'M-21', name: '测试毛绒', spec: '51"' },
      { id: 22, code: 'M-22', name: '测试毛绒', spec: '51"' },
    ],
    units: [{ id: 31, code: 'Y', name: '码' }],
  })

  assert.equal(draft.values.product_id, undefined)
  assert.equal(draft.values.items[0].material_id, undefined)
  assert.equal(draft.values.items[2].material_id, undefined)
  assert.equal(draft.values.items[2].unit_id, undefined)
  const initialIssues = getBOMImportDraftIssues(draft.values)
  assert.ok(initialIssues.some((issue) => issue.field === 'product_id'))
  assert.ok(initialIssues.some((issue) => issue.field === 'material_id'))
  assert.ok(initialIssues.some((issue) => issue.field === 'unit_id'))

  const resolvedValues = structuredClone(draft.values)
  resolvedValues.product_id = 11
  resolvedValues.items.forEach((item, index) => {
    item.material_id = 20 + index
    item.unit_id = 31
  })
  assert.equal(getBOMImportDraftIssues(resolvedValues).length, 0)
})

test('parseBOMXlsx: rejects workbooks without exactly one supported detail sheet', async () => {
  await assert.rejects(
    parseBOMXlsx(
      createWorkbook([{ name: '汇总表', rows: [['产品编号', 'P-1']] }]),
      { fileName: '汇总.xlsx' }
    ),
    (error) =>
      error instanceof BOMXlsxImportError && error.code === 'missing_bom_sheet'
  )

  const rows = [
    ['产品编号：', 'P-1'],
    ['产品名称:', '产品'],
    ['物料名称', '单位用量'],
    ['材料', '1'],
  ]
  await assert.rejects(
    parseBOMXlsx(
      createWorkbook([
        { name: '材料分析明细表', rows },
        { name: '材料分析明细表-1', rows },
      ]),
      { fileName: '两个 BOM.xlsx' }
    ),
    (error) =>
      error instanceof BOMXlsxImportError &&
      error.code === 'multiple_bom_sheets'
  )
})

test('parseBOMXlsx: rejects unsupported file types and unsafe ZIP paths', async () => {
  await assert.rejects(
    parseBOMXlsx(firstFormatWorkbook(), { fileName: '旧格式.xls' }),
    (error) =>
      error instanceof BOMXlsxImportError &&
      error.code === 'unsupported_file_type'
  )
  await assert.rejects(
    parseBOMXlsx(createZip({ '../xl/workbook.xml': '<workbook/>' }), {
      fileName: '不安全.xlsx',
    }),
    (error) =>
      error instanceof BOMXlsxImportError && error.code === 'invalid_zip_path'
  )
})
