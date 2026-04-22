import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PROCESSING_CONTRACT_MAX_ROWS,
  applyProcessingDetailCellMerge,
  deleteProcessingContractLine,
  insertProcessingContractLine,
  splitProcessingDetailCellMerge,
} from './processingContractEditor.mjs'

const sampleLines = [
  {
    contractNo: 'B25060808',
    processName: '面*1',
    quantity: '9024',
    unitPrice: '0.2',
  },
  {
    contractNo: 'B25060808',
    processName: '耳*2',
    quantity: '9024',
    unitPrice: '0.1',
  },
]

test('processingContractEditor: 插入明细行后会返回新选择位置', () => {
  const inserted = insertProcessingContractLine({
    lines: sampleLines,
    selectedLineIndex: 0,
    contractNo: 'B25060808',
    position: 'after',
  })

  assert.equal(inserted.ok, true)
  assert.equal(inserted.lines.length, 3)
  assert.deepEqual(inserted.merges, [])
  assert.equal(inserted.selectedLineIndex, 1)
  assert.equal(inserted.lines[1].contractNo, '')
  assert.equal(inserted.lines[1].productOrderNo, '')
  assert.equal(inserted.lines[1].productNo, '')
  assert.equal(inserted.lines[1].productName, '')
  assert.equal(inserted.lines[1].processName, '')
})

test('processingContractEditor: 达到 300 行后不允许继续插入', () => {
  const fullLines = Array.from(
    { length: PROCESSING_CONTRACT_MAX_ROWS },
    () => ({
      contractNo: 'B25060808',
      processName: '电绣',
      quantity: '1',
      unitPrice: '1',
    })
  )

  const inserted = insertProcessingContractLine({
    lines: fullLines,
    selectedLineIndex: PROCESSING_CONTRACT_MAX_ROWS - 1,
    contractNo: 'B25060808',
    position: 'after',
  })

  assert.equal(inserted.ok, false)
  assert.match(inserted.message, /最多支持 300 行/)
})

test('processingContractEditor: 删除到只剩一行时会重置为空白行', () => {
  const deleted = deleteProcessingContractLine({
    lines: [sampleLines[0]],
    selectedLineIndex: 0,
    contractNo: 'B25060808',
  })

  assert.equal(deleted.ok, true)
  assert.equal(deleted.lines.length, 1)
  assert.deepEqual(deleted.merges, [])
  assert.equal(deleted.selectedLineIndex, 0)
  assert.deepEqual(deleted.lines[0], {
    contractNo: '',
    productOrderNo: '',
    productNo: '',
    productName: '',
    processName: '',
    supplierAlias: '',
    processCategory: '',
    unit: '',
    unitPrice: '',
    quantity: '',
    remark: '',
  })
})

test('processingContractEditor: 合并选区后会清空被覆盖单元格，拆分后可恢复独立结构', () => {
  const merged = applyProcessingDetailCellMerge({
    lines: sampleLines,
    merges: [],
    selection: {
      rowStart: 0,
      rowEnd: 0,
      colStart: 0,
      colEnd: 1,
    },
  })

  assert.equal(merged.ok, true)
  assert.equal(merged.lines[0].contractNo, 'B25060808')
  assert.equal(merged.lines[0].productOrderNo, '')
  assert.equal(merged.merges.length, 1)

  const split = splitProcessingDetailCellMerge({
    merges: merged.merges,
    rowIndex: 0,
    colIndex: 0,
  })
  assert.equal(split.ok, true)
  assert.equal(split.merges.length, 0)
})

test('processingContractEditor: 插删行会同步维护纵向合并块', () => {
  const inserted = insertProcessingContractLine({
    lines: sampleLines,
    merges: [
      {
        id: 'merge_0_1_0_0',
        rowStart: 0,
        rowEnd: 1,
        colStart: 0,
        colEnd: 0,
      },
    ],
    selectedLineIndex: 0,
    position: 'after',
  })

  assert.equal(inserted.ok, true)
  assert.equal(inserted.merges[0].rowStart, 0)
  assert.equal(inserted.merges[0].rowEnd, 1)

  const deleted = deleteProcessingContractLine({
    lines: inserted.lines,
    merges: inserted.merges,
    selectedLineIndex: 1,
  })

  assert.equal(deleted.ok, true)
  assert.equal(deleted.lines.length, 1)
  assert.equal(deleted.merges.length, 0)
})
