import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyDetailCellMerge,
  buildMaterialPurchaseContractDraft,
  computeMaterialPurchaseTotals,
  deleteMaterialPurchaseLine,
  insertMaterialPurchaseLine,
  splitDetailCellMerge,
  updateMaterialPurchaseLineCell,
} from './materialPurchaseContractEditor.mjs'

const sampleDraft = buildMaterialPurchaseContractDraft({
  contractNo: 'C25030508',
  lines: [
    {
      contractNo: 'C25030508',
      productOrderNo: 'SU241203',
      productNo: '24668',
      productName: '企鹅包包',
      materialName: 'OPP自粘袋',
      vendorCode: '振鼎',
      spec: '0.04*18*18+2.5CM',
      unit: 'PCS',
      unitPrice: '0.068',
      quantity: '1000',
      amount: '68',
      remark: '顶部1CM半圆',
    },
    {
      contractNo: 'C25030508',
      productOrderNo: 'SU241203',
      productNo: '24668',
      productName: '企鹅包包',
      materialName: '版费',
      vendorCode: '勤盈',
      spec: '68*58*17CM',
      unit: 'PCS',
      unitPrice: '80',
      quantity: '1',
      amount: '80',
      remark: '',
    },
  ],
})

test('materialPurchaseContractEditor: 更新数量或单价时会重算金额和总计', () => {
  const nextLines = updateMaterialPurchaseLineCell(
    sampleDraft.lines,
    0,
    'quantity',
    '1200'
  )
  assert.equal(nextLines[0].amount, '81.60')
  const totals = computeMaterialPurchaseTotals(nextLines)
  assert.equal(totals.quantityText, '1201')
  assert.equal(totals.amountText, '161.60')
})

test('materialPurchaseContractEditor: 初始化时优先保留已有采购金额快照', () => {
  const draft = buildMaterialPurchaseContractDraft({
    lines: [
      {
        unitPrice: '2',
        quantity: '3',
        amount: '9',
      },
    ],
  })

  assert.equal(draft.lines[0].amount, '9.00')
})

test('materialPurchaseContractEditor: 可直接编辑采购金额并参与合计', () => {
  const nextLines = updateMaterialPurchaseLineCell(
    sampleDraft.lines,
    0,
    'amount',
    '70.5'
  )

  assert.equal(nextLines[0].amount, '70.50')
  assert.equal(nextLines[0].quantity, '1000')
  assert.equal(nextLines[0].unitPrice, '0.068')

  const totals = computeMaterialPurchaseTotals(nextLines)
  assert.equal(totals.amountText, '150.50')
})

test('materialPurchaseContractEditor: 采购金额输入态只保留数字和小数点，并保留正在输入的小数点', () => {
  const typingLines = updateMaterialPurchaseLineCell(
    sampleDraft.lines,
    0,
    'amount',
    '¥0012.3a4',
    { amountInputPhase: 'input' }
  )
  assert.equal(typingLines[0].amount, '12.34')

  const trailingDotLines = updateMaterialPurchaseLineCell(
    sampleDraft.lines,
    0,
    'amount',
    '0.',
    { amountInputPhase: 'input' }
  )
  assert.equal(trailingDotLines[0].amount, '0.')
})

test('materialPurchaseContractEditor: 采购金额提交时会清洗非法字符并补齐两位小数', () => {
  const nextLines = updateMaterialPurchaseLineCell(
    sampleDraft.lines,
    0,
    'amount',
    '¥-12.3a'
  )

  assert.equal(nextLines[0].amount, '12.30')
})

test('materialPurchaseContractEditor: 草稿会保留独立签字字段且默认不带印章', () => {
  const draft = buildMaterialPurchaseContractDraft({
    buyerContact: '郭伟锋',
    buyerSigner: '郭细云',
  })

  assert.equal(draft.buyerContact, '郭伟锋')
  assert.equal(draft.buyerSigner, '郭细云')
  assert.equal(draft.supplierSigner, '')
  assert.equal(draft.buyerStampVisible, false)
})

test('materialPurchaseContractEditor: 合并选区后会清空被覆盖单元格，拆分后可恢复独立结构', () => {
  const merged = applyDetailCellMerge({
    lines: sampleDraft.lines,
    merges: [],
    selection: {
      rowStart: 0,
      rowEnd: 0,
      colStart: 0,
      colEnd: 1,
    },
  })

  assert.equal(merged.ok, true)
  assert.equal(merged.lines[0].contractNo, 'C25030508')
  assert.equal(merged.lines[0].productOrderNo, '')
  assert.equal(merged.merges.length, 1)

  const split = splitDetailCellMerge({
    merges: merged.merges,
    rowIndex: 0,
    colIndex: 0,
  })
  assert.equal(split.ok, true)
  assert.equal(split.merges.length, 0)
})

test('materialPurchaseContractEditor: 插入和删除明细行会同步调整当前选择', () => {
  const inserted = insertMaterialPurchaseLine({
    lines: sampleDraft.lines,
    merges: [],
    selectedRowIndex: 0,
    position: 'after',
  })

  assert.equal(inserted.ok, true)
  assert.equal(inserted.lines.length, 3)
  assert.equal(inserted.selectedRowIndex, 1)
  assert.equal(inserted.lines[1].contractNo, '')
  assert.equal(inserted.lines[1].productOrderNo, '')
  assert.equal(inserted.lines[1].productNo, '')
  assert.equal(inserted.lines[1].productName, '')
  assert.equal(inserted.lines[1].materialName, '')
  assert.equal(inserted.lines[1].unit, '')

  const deleted = deleteMaterialPurchaseLine({
    lines: inserted.lines,
    merges: [],
    selectedRowIndex: 1,
  })
  assert.equal(deleted.ok, true)
  assert.equal(deleted.lines.length, 2)
  assert.equal(deleted.selectedRowIndex, 1)
})

test('materialPurchaseContractEditor: 删除到只剩一行时会重置为空白行', () => {
  const deleted = deleteMaterialPurchaseLine({
    lines: [sampleDraft.lines[0]],
    merges: [],
    selectedRowIndex: 0,
  })

  assert.equal(deleted.ok, true)
  assert.equal(deleted.lines.length, 1)
  assert.equal(deleted.selectedRowIndex, 0)
  assert.deepEqual(deleted.lines[0], {
    contractNo: '',
    productOrderNo: '',
    productNo: '',
    productName: '',
    materialName: '',
    vendorCode: '',
    spec: '',
    unit: '',
    unitPrice: '',
    quantity: '',
    amount: '',
    remark: '',
  })
})
