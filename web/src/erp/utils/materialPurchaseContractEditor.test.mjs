import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyDetailCellMerge,
  buildBlankMaterialPurchaseContractDraft,
  buildMaterialPurchaseContractBusinessDraft,
  buildMaterialPurchaseContractDraft,
  clearMaterialPurchaseContractSignatureDraft,
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

test('FL_material_purchase_amount__recomputes_amount_and_total_from_current_line materialPurchaseContractEditor: 更新数量或单价时会重算金额和总计', () => {
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

test('FL_material_purchase_amount__keeps_manual_amount_snapshot materialPurchaseContractEditor: 初始化时优先保留已有采购金额快照', () => {
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

test('FL_material_purchase_business_draft__does_not_fill_missing_business_fields_from_template_sample materialPurchaseContractEditor: 业务带值草稿不从模板样例兜底真实缺值', () => {
  const draft = buildMaterialPurchaseContractBusinessDraft(
    {
      contractNo: 'PO-1001',
      supplierName: '真实供应商',
      lines: [
        {
          contractNo: 'PO-1001',
          materialName: '拉毛布',
          unitPrice: '2',
          quantity: '3',
        },
      ],
    },
    {
      supplierContact: '供应商联系人样例',
      supplierPhone: '供应商联系电话样例',
      buyerCompany: '买方公司样例',
      buyerContact: '买方联系人样例',
      buyerSigner: '买方签字样例',
      lines: [
        {
          productOrderNo: 'SAMPLE-SO',
          productName: '样例产品',
          materialName: '样例材料',
          quantity: '999',
        },
      ],
      clauses: {
        delivery: ['保留模板来货要求'],
        contract: ['保留模板合同约定'],
        settlement: ['保留模板结算方式'],
      },
    }
  )

  assert.equal(draft.contractNo, 'PO-1001')
  assert.equal(draft.supplierName, '真实供应商')
  assert.equal(draft.supplierContact, '')
  assert.equal(draft.supplierPhone, '')
  assert.equal(draft.buyerCompany, '')
  assert.equal(draft.buyerContact, '')
  assert.equal(draft.buyerSigner, '')
  assert.equal(draft.lines.length, 1)
  assert.equal(draft.lines[0].materialName, '拉毛布')
  assert.equal(draft.lines[0].productOrderNo, '')
  assert.equal(draft.lines[0].productName, '')
  assert.equal(draft.lines[0].quantity, '3')
  assert.equal(draft.lines[0].amount, '6.00')
  assert.deepEqual(draft.clauses.delivery, ['保留模板来货要求'])
  assert.deepEqual(draft.merges, [])
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
    buyerContact: '采购负责人',
    buyerSigner: '签字人',
  })

  assert.equal(draft.buyerContact, '采购负责人')
  assert.equal(draft.buyerSigner, '签字人')
  assert.equal(draft.supplierSigner, '')
  assert.equal(draft.buyerStampVisible, false)
})

test('materialPurchaseContractEditor: 空白模板清空示例字段和明细但保留合同条款', () => {
  const blankDraft = buildBlankMaterialPurchaseContractDraft({
    ...sampleDraft,
    supplierName: '示例供应商',
    buyerCompany: '本公司',
    buyerSigner: '签字人',
    clauses: {
      delivery: ['保留来货要求'],
      contract: ['保留合同约定'],
      settlement: ['保留结算方式'],
    },
    merges: [
      {
        rowStart: 0,
        rowEnd: 0,
        colStart: 0,
        colEnd: 1,
      },
    ],
  })

  assert.equal(blankDraft.contractNo, '')
  assert.equal(blankDraft.supplierName, '')
  assert.equal(blankDraft.buyerCompany, '')
  assert.equal(blankDraft.buyerSigner, '')
  assert.equal(blankDraft.lines.length, 1)
  assert.deepEqual(blankDraft.lines[0], {
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
  assert.deepEqual(blankDraft.clauses.delivery, ['保留来货要求'])
  assert.deepEqual(blankDraft.clauses.contract, ['保留合同约定'])
  assert.deepEqual(blankDraft.clauses.settlement, ['保留结算方式'])
  assert.deepEqual(blankDraft.merges, [])
})

test('materialPurchaseContractEditor: 手签留白只清空签字人并保留日期', () => {
  const cleared = clearMaterialPurchaseContractSignatureDraft({
    ...sampleDraft,
    supplierName: '示例供应商',
    buyerCompany: '本公司',
    buyerSigner: '签字人',
    supplierSigner: '供应商签字人',
    signDateText: '2026/2/28',
    supplierSignDateText: '2026/2/28',
  })

  assert.equal(cleared.supplierName, '示例供应商')
  assert.equal(cleared.buyerCompany, '本公司')
  assert.equal(cleared.lines.length, sampleDraft.lines.length)
  assert.deepEqual(cleared.clauses, sampleDraft.clauses)
  assert.equal(cleared.buyerSigner, '')
  assert.equal(cleared.supplierSigner, '')
  assert.equal(cleared.signDateText, '2026/2/28')
  assert.equal(cleared.supplierSignDateText, '2026/2/28')
})

test('FL_material_purchase_merge__clears_covered_cell_stale_value materialPurchaseContractEditor: 合并选区后会清空被覆盖单元格，拆分后可恢复独立结构', () => {
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

test('FL_material_purchase_totals__skip_merged_hidden_amount_cells materialPurchaseContractEditor: 合计不统计被合并覆盖的隐藏采购金额单元格', () => {
  const merged = applyDetailCellMerge({
    lines: [
      {
        quantity: '10',
        unitPrice: '2',
        amount: '20',
      },
      {
        quantity: '5',
        unitPrice: '3',
        amount: '99',
      },
    ],
    merges: [],
    selection: {
      rowStart: 0,
      rowEnd: 1,
      colStart: 10,
      colEnd: 10,
    },
  })

  assert.equal(merged.ok, true)
  assert.equal(merged.lines[0].amount, '20.00')
  assert.equal(merged.lines[1].amount, '15.00')
  assert.notEqual(merged.lines[1].amount, '99.00')

  const totals = computeMaterialPurchaseTotals(merged.lines, {
    merges: merged.merges,
  })
  assert.equal(totals.quantityText, '15')
  assert.equal(totals.amountText, '20.00')
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

test('materialPurchaseContractEditor: 移除到只剩一行时会重置为空白行', () => {
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
