import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import {
  buildBOMImportDraft,
  getBOMImportDraftIssues,
  parseBOMXlsx,
} from '../utils/bomXlsxImport.mjs'
import {
  BOM_IMPORT_EXAMPLE_COLUMNS,
  BOM_IMPORT_EXAMPLE_CONTEXT,
  BOM_IMPORT_EXAMPLE_FILENAME,
  BOM_IMPORT_EXAMPLE_IMAGES,
  BOM_IMPORT_EXAMPLE_MATERIALS,
  BOM_IMPORT_EXAMPLE_ROWS,
  BOM_IMPORT_EXAMPLE_SHEET,
} from './bomImportFormat.mjs'
import { readXlsxWorkbook } from '../utils/xlsxWorkbook.mjs'

test('format guide preview is generated from the exact downloadable Excel workbook', async () => {
  const metadata = JSON.parse(await readFile(new URL('./bomImportExamplePreview.generated.json', import.meta.url), 'utf8'))
  const workbook = await readFile(new URL('./bom-import-example.xlsx', import.meta.url))
  const preview = await readFile(new URL('./bom-import-example-preview.png', import.meta.url))
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
  assert.equal(metadata.workbookSha256, hash(workbook), '更换下载文件时必须同步图示')
  assert.equal(metadata.previewSha256, hash(preview))
  assert.equal(metadata.sheetName, BOM_IMPORT_EXAMPLE_SHEET)
  assert.equal(metadata.range, 'A1:N12')
  assert.equal(metadata.width, preview.readUInt32BE(16))
  assert.equal(metadata.height, preview.readUInt32BE(20))
})

test('prototype download uses the same verified workbook as the ERP format dialog', async () => {
  const html = await readFile(new URL('../../../../docs/product/ui-design/index.html', import.meta.url), 'utf8')
  const embedded = html.match(/const bomExcelExampleDataURL = 'data:application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet;base64,([A-Za-z0-9+/=]+)'/u)
  assert(embedded, '设计稿应包含可直接下载的同源示例')
  const workbook = await readFile(new URL('./bom-import-example.xlsx', import.meta.url))
  assert(Buffer.from(embedded[1], 'base64').equals(workbook), '设计稿和正式页面不能提供不同的示例文件')
  const preview = html.match(/const bomExcelPreviewDataURL = 'data:image\/png;base64,([A-Za-z0-9+/=]+)'/u)
  assert(preview, '设计稿应使用正式下载文件生成的图示')
  const image = await readFile(new URL('./bom-import-example-preview.png', import.meta.url))
  assert(Buffer.from(preview[1], 'base64').equals(image))
})

test('source-shaped BOM example keeps grouped parts, subtotal formulas and ignored companion sheets', async () => {
  const input = await readFile(
    new URL('./bom-import-example.xlsx', import.meta.url)
  )
  const parsed = await parseBOMXlsx(input, {
    fileName: BOM_IMPORT_EXAMPLE_FILENAME,
  })
  assert.equal(parsed.sheetName, BOM_IMPORT_EXAMPLE_SHEET)
  const workbook = await readXlsxWorkbook(input)
  assert.deepEqual(workbook.sheets.map((sheet) => sheet.name), [BOM_IMPORT_EXAMPLE_SHEET, '汇总表', '色卡', 'Sheet1'])
  const detail = workbook.sheets[0]
  const illustrated = await readXlsxWorkbook(input, { includeImages: true })
  let imageCount = 0
  for (const placement of BOM_IMPORT_EXAMPLE_IMAGES) {
    const sheet = illustrated.sheets.find((item) => item.name === placement.sheet)
    const images = sheet.imagesByCell.get(`${placement.row}:${placement.column}`) || []
    assert.equal(images.length, 1, `${placement.sheet} 的图片应锚定到原表对应区域`)
    assert.equal(images[0].mimeType, 'image/jpeg')
    const asset = await readFile(new URL(`./bom-example-images/${placement.file}`, import.meta.url))
    assert(Buffer.from(images[0].bytes).equals(asset), '工作簿应嵌入可读取的同源图片')
    imageCount += images.length
  }
  assert.equal(imageCount, 6)
  assert.equal(illustrated.sheets.reduce((count, sheet) => count + [...sheet.imagesByCell.values()].flat().length, 0), 6)
  assert.equal(detail.rows.find((row) => row.rowNumber === 1)?.values[11] || '', '', '原表图片区不能再放制作标记')
  assert(workbook.sheets.every((sheet) => sheet.rows.every((row) => row.values.every((value) => !/脱敏|模拟|替换为实际/u.test(String(value || ''))))), '示例表内只保留业务内容')
  assert.equal(parsed.headerRowNumber, 5)
  assert.deepEqual(detail.rows.find((row) => row.rowNumber === 5).values, BOM_IMPORT_EXAMPLE_COLUMNS.map((column) => column.title))
  assert.equal(detail.rows.find((row) => row.rowNumber === 8).formulas[8], 'SUM(I6:I7)')
  assert(detail.mergeRanges.some((range) => range.startColumn === 2 && range.endColumn === 2 && range.startRow === 6 && range.endRow === 7))
  assert.deepEqual(parsed.rows.map((row) => row.rowNumber), [6, 7, 9], '材料小计和其他工作表不能成为额外部位')
  assert.equal(parsed.rows.length, 3)
  assert.deepEqual(parsed.rows.map((row) => row.unit), ['码', '码', '千克'])
  const summary = workbook.sheets.find((sheet) => sheet.name === '汇总表')
  assert.equal(summary.rows.find((row) => row.rowNumber === 4).values[1], '码')
  assert.equal(summary.rows.find((row) => row.rowNumber === 4).formulas[1], "'材料分析明细表-1'!F6")
  assert.equal(summary.rows.find((row) => row.rowNumber === 5).values[1], '千克')
  for (const [key, value] of Object.entries(BOM_IMPORT_EXAMPLE_CONTEXT)) assert.equal(parsed.context[key], value)
  assert.deepEqual(
    parsed.rows.map((row) => ({
      materialName: row.materialName,
      supplierItemNo: row.supplierItemNo,
      materialSpec: row.materialSpec,
      color: row.color,
      unit: row.unit,
      position: row.position,
      pieceCount: row.pieceCount,
      quantity: Number(row.quantity),
      lossRate: Number(row.lossRate),
      totalUsageSnapshot: Number(row.totalUsageSnapshot),
      processBase: row.processBase,
      processMethod: row.processMethod,
      note: row.note,
    })),
    BOM_IMPORT_EXAMPLE_ROWS
  )
  assert(
    parsed.rows.every((row) => row.lossSource === 'explicit' && !row.lossIssue)
  )
  const unmapped = buildBOMImportDraft(parsed)
  assert(
    unmapped.values.items.every((item) => !item.material_id && !item.unit_id)
  )
  const draft = buildBOMImportDraft(parsed, {
    products: [{ id: 1, code: BOM_IMPORT_EXAMPLE_CONTEXT.code, name: BOM_IMPORT_EXAMPLE_CONTEXT.name, is_active: true }],
    materials: BOM_IMPORT_EXAMPLE_MATERIALS.map((row, index) => ({
      id: index + 1,
      name: row.materialName,
      supplier_item_no: row.supplierItemNo,
      is_active: true,
    })),
    units: [
      { id: 1, code: 'YD', name: '码' },
      { id: 2, code: 'KG', name: '千克' },
    ],
  })
  assert.equal(
    getBOMImportDraftIssues(draft.values).length,
    0
  )
  assert.deepEqual(draft.values.items.map((item) => item.material_id), [1, 1, 2])
  assert.deepEqual(draft.values.items.map((item) => item.unit_id), [1, 1, 2])
  assert.deepEqual(draft.values.items.map((item) => item.total_usage_snapshot), ['44.1', '8.4', '18'])
})
