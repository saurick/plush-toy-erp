import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPrintTemplateLineCells,
  getPrintTemplateLineColumns,
  normalizePrintTemplatePreviewData,
  resolvePrintTemplateTotals,
} from './printTemplateRendererModel.mjs'

const amountColumnMerge = {
  rowStart: 0,
  rowEnd: 1,
  colStart: 10,
  colEnd: 10,
}

test('printTemplateRendererModel: 加工合同静态预览复用正式字段真源', () => {
  const columns = getPrintTemplateLineColumns('processing')
  const cells = buildPrintTemplateLineCells(
    {
      productOrderNo: 'SIM-SO-001',
      productNo: 'SIM-PROD-001',
      productName: '合成玩偶甲',
      processingItem: '面*1',
    },
    0,
    'processing'
  )

  assert.equal(
    columns.find((column) => column.key === 'productOrderNo')?.label,
    '来源订单编号'
  )
  assert.equal(
    columns.find((column) => column.key === 'productNo')?.label,
    '产品 / 材料编号'
  )
  assert.equal(
    columns.find((column) => column.key === 'productName')?.label,
    '产品 / 材料名称'
  )
  assert.equal(
    columns.find((column) => column.key === 'processingItem')?.label,
    '加工项目'
  )
  assert.equal(
    cells.find((cell) => cell.key === 'processingItem')?.value,
    '面*1'
  )
  assert.equal(cells.some((cell) => cell.key === 'processName'), false)
})

test('FL_print_template_preview_totals__skip_material_hidden_amount_cells printTemplateRendererModel: 采购合同静态预览合计不统计被合并覆盖金额', () => {
  const totals = resolvePrintTemplateTotals(
    {
      lines: [
        { quantity: '10', unitPrice: '2', amount: '20.00' },
        { quantity: '5', unitPrice: '3', amount: '15.00' },
      ],
      merges: [amountColumnMerge],
    },
    'material'
  )
  const firstRowCells = buildPrintTemplateLineCells(
    { amount: '20.00' },
    0,
    'material',
    [amountColumnMerge]
  )
  const secondRowCells = buildPrintTemplateLineCells(
    { amount: '15.00' },
    1,
    'material',
    [amountColumnMerge]
  )

  assert.equal(totals.quantityText, '15')
  assert.equal(totals.amountText, '20.00')
  assert.equal(firstRowCells.find((cell) => cell.key === 'amount')?.rowSpan, 2)
  assert.equal(
    secondRowCells.some((cell) => cell.key === 'amount'),
    false
  )
})

test('FL_print_template_preview_totals__skip_processing_hidden_amount_cells printTemplateRendererModel: 加工合同静态预览合计不统计被合并覆盖金额', () => {
  const totals = resolvePrintTemplateTotals(
    {
      lines: [
        { quantity: '10', unitPrice: '2', amount: '20' },
        { quantity: '5', unitPrice: '3', amount: '15' },
      ],
      merges: [amountColumnMerge],
    },
    'processing'
  )
  const firstRowCells = buildPrintTemplateLineCells(
    { amount: '20' },
    0,
    'processing',
    [amountColumnMerge]
  )
  const secondRowCells = buildPrintTemplateLineCells(
    { amount: '15' },
    1,
    'processing',
    [amountColumnMerge]
  )

  assert.equal(totals.quantityText, '15')
  assert.equal(totals.amountText, '20')
  assert.equal(firstRowCells.find((cell) => cell.key === 'amount')?.rowSpan, 2)
  assert.equal(
    secondRowCells.some((cell) => cell.key === 'amount'),
    false
  )
})

test('FL_print_template_preview_missing_fields__keeps_business_blanks printTemplateRendererModel: 静态预览缺字段不回填样例值', () => {
  const normalized = normalizePrintTemplatePreviewData({
    contractNo: 'PO-EMPTY',
    supplierName: '',
  })
  const totals = resolvePrintTemplateTotals(normalized, 'material')
  const blankCells = buildPrintTemplateLineCells({}, 0, 'material')

  assert.equal(normalized.contractNo, 'PO-EMPTY')
  assert.equal(normalized.supplierName, '')
  assert.deepEqual(normalized.lines, [])
  assert.deepEqual(normalized.merges, [])
  assert.deepEqual(normalized.clauses.delivery, [])
  assert.deepEqual(normalized.clauses.contract, [])
  assert.deepEqual(normalized.clauses.settlement, [])
  assert.equal(totals.quantityText, '')
  assert.equal(totals.amountText, '')
  assert(
    blankCells.every((cell) => cell.value === ''),
    'missing line fields must render as blank cells instead of sample values'
  )
})

test('FL_print_template_preview_zero_values__keeps_explicit_zero_cells printTemplateRendererModel: 静态预览保留显式 0 数值字段', () => {
  const materialCells = buildPrintTemplateLineCells(
    {
      contractNo: 'PO-ZERO',
      unitPrice: 0,
      quantity: 0,
      amount: 0,
    },
    0,
    'material'
  )
  const processingCells = buildPrintTemplateLineCells(
    {
      contractNo: 'OUT-ZERO',
      unitPrice: 0,
      quantity: 0,
      amount: 0,
    },
    0,
    'processing'
  )

  for (const cells of [materialCells, processingCells]) {
    assert.equal(cells.find((cell) => cell.key === 'unitPrice')?.value, 0)
    assert.equal(cells.find((cell) => cell.key === 'quantity')?.value, 0)
    assert.equal(cells.find((cell) => cell.key === 'amount')?.value, 0)
  }
})
