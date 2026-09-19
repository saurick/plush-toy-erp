import assert from 'node:assert/strict'
import test from 'node:test'

import { getPrintTemplateByKey } from '../config/printTemplates.mjs'
import {
  MATERIAL_PURCHASE_CONTRACT_BATCH_MAX,
  buildMaterialPurchaseContractBatchDraft,
  formatMaterialPurchaseContractBatchProblems,
  getMaterialPurchaseContractBatchProblems,
  getMaterialPurchaseContractOutputBatches,
  isMaterialPurchaseContractBatchDraft,
  groupMaterialPurchaseContracts,
} from './materialPurchaseContractBatch.mjs'
import {
  buildMaterialPurchaseContractBusinessDraft,
  computeMaterialPurchaseTotals,
  MATERIAL_PURCHASE_MAX_ROWS,
} from './materialPurchaseContractEditor.mjs'

const template = getPrintTemplateByKey('material-purchase-contract')

function validDraft(overrides = {}) {
  return {
    contractNo: 'PO-001',
    supplierName: '示例供应商',
    buyerCompany: '示例采购方',
    lines: [
      {
        materialName: '示例材料',
        quantity: '10',
        unitPrice: '1.25',
      },
    ],
    ...overrides,
  }
}

function sourceEntry(id, record = {}, draft = {}) {
  return {
    record: {
      id,
      purchase_order_no: `PO-${id}`,
      supplier_id: 8,
      currency: 'CNY',
      payment_term_days: 45,
      invoice_required: false,
      ...record,
    },
    draft: buildMaterialPurchaseContractBusinessDraft(
      validDraft({ contractNo: `PO-${id}`, ...draft })
    ),
  }
}

test('同一供应商及合同条件的三张采购单归并为一份，逐行保留来源和金额', () => {
  const entries = [sourceEntry(1), sourceEntry(2), sourceEntry(3)]
  const original = JSON.stringify(entries)
  const batch = buildMaterialPurchaseContractBatchDraft(
    groupMaterialPurchaseContracts(entries)
  )
  assert.equal(isMaterialPurchaseContractBatchDraft(batch), true)
  assert.equal(batch.contracts.length, 1)
  const contract = batch.contracts[0]
  assert.deepEqual(
    contract.sourceOrders.map((order) => order.orderNo),
    ['PO-1', 'PO-2', 'PO-3']
  )
  assert.deepEqual(
    contract.draft.lines.map((line) => line.contractNo),
    ['PO-1', 'PO-2', 'PO-3']
  )
  assert.equal(contract.draft.lines.length, 3)
  assert.equal(
    computeMaterialPurchaseTotals(contract.draft.lines).amountText,
    '37.50'
  )
  assert.equal(contract.draft.contractNo, '详见明细（3 张采购单）')
  assert.equal(JSON.stringify(entries), original)
  contract.draft.lines[1].unitPrice = '2'
  contract.included = false
  const restored = buildMaterialPurchaseContractBatchDraft(
    JSON.parse(JSON.stringify(batch)).contracts,
    batch
  )
  assert.equal(restored.contracts.length, 1)
  assert.deepEqual(restored.contracts[0], contract)
})

test('供应商按编号识别，同名不同编号和缺少编号不能合并', () => {
  assert.equal(
    groupMaterialPurchaseContracts([
      sourceEntry(1),
      sourceEntry(2, { supplier_id: 9 }),
      sourceEntry(3, { supplier_id: null }),
      sourceEntry(4, { supplier_id: null }),
    ]).length,
    4
  )
})

test('币种、付款、开票、交货和合同主体差异自动分开并解释原因', () => {
  const cases = [
    [{ currency: 'USD' }, {}, '币种'],
    [{ payment_term_days: 0 }, {}, '付款条件'],
    [{ payment_term_days: null }, {}, '付款条件'],
    [{ payment_method: '现金' }, {}, '付款条件'],
    [{ invoice_required: null }, {}, '开票条件'],
    [
      { invoice_required: true, invoice_category: 'VAT_SPECIAL_13' },
      {},
      '开票条件',
    ],
    [{ delivery_address: '另一个收货地址' }, {}, '交货条件'],
    [{ supplier_confirmed_arrival_date: 123 }, {}, '交货条件'],
    [{}, { returnDateText: '2026/10/01' }, '交货条件'],
    [{}, { buyerCompany: '另一采购方' }, '采购方信息'],
    [{}, { supplierAddress: '另一个地址' }, '供应方信息'],
    [{}, { clauses: { settlement: ['约定付款条件'] } }, '合同条款'],
  ]
  for (const [record, draft, reason] of cases) {
    const groups = groupMaterialPurchaseContracts([
      sourceEntry(1),
      sourceEntry(2, record, draft),
    ])
    assert.equal(groups.length, 2, reason)
    assert.ok(
      groups.every((group) => group.splitReasons.includes(reason)),
      reason
    )
  }
})

test('合并日期保留所有来源，明细超限明确报告且不截断', () => {
  const groups = groupMaterialPurchaseContracts([
    sourceEntry(1, {}, { orderDateText: '2026/09/01' }),
    sourceEntry(
      2,
      {},
      {
        orderDateText: '2026/09/02',
        lines: Array.from({ length: MATERIAL_PURCHASE_MAX_ROWS }, () => ({
          materialName: '材料',
          quantity: '1',
          unitPrice: '1',
        })),
      }
    ),
  ])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].draft.orderDateText, '2026/09/01、2026/09/02')
  assert.equal(groups[0].draft.lines.length, MATERIAL_PURCHASE_MAX_ROWS + 1)
  assert.match(
    getMaterialPurchaseContractBatchProblems(
      template,
      buildMaterialPurchaseContractBatchDraft(groups)
    )[0].fields.join('、'),
    /明细超过 300 行/u
  )
})

test('采购合同批量预检按订单指出缺失字段', () => {
  const batch = buildMaterialPurchaseContractBatchDraft([
    { orderNo: 'PO-001', draft: validDraft() },
    {
      orderNo: 'PO-002',
      draft: validDraft({
        supplierName: '',
        lines: [{ materialName: '示例材料', quantity: '10', unitPrice: '' }],
      }),
    },
  ])
  const problems = getMaterialPurchaseContractBatchProblems(template, batch)

  assert.deepEqual(problems, [
    { orderNo: 'PO-002', fields: ['供应方名称', '第 1 行单价'] },
  ])
  assert.match(
    formatMaterialPurchaseContractBatchProblems(problems),
    /PO-002：供应方名称、第 1 行单价/u
  )
})

test('采购合同批量预检限制合同数量', () => {
  const batch = buildMaterialPurchaseContractBatchDraft(
    Array.from(
      { length: MATERIAL_PURCHASE_CONTRACT_BATCH_MAX + 1 },
      (_, index) => ({
        orderNo: `PO-${index + 1}`,
        draft: validDraft({ contractNo: `PO-${index + 1}` }),
      })
    )
  )

  assert.deepEqual(getMaterialPurchaseContractBatchProblems(template, batch), [
    {
      orderNo: '批量打印数据',
      fields: [`单次最多 ${MATERIAL_PURCHASE_CONTRACT_BATCH_MAX} 份采购合同`],
    },
  ])
})

test('汇总范围超过二十份时完整保留，最后一份也可独立输出', () => {
  const batch = buildMaterialPurchaseContractBatchDraft(
    Array.from({ length: 41 }, (_, index) => ({
      purchaseOrderID: index + 1,
      orderNo: `PO-${index + 1}`,
      draft: validDraft({ contractNo: `PO-${index + 1}` }),
    })),
    { sourceLabel: '模拟汇总表', batchIndex: 2 }
  )
  const batches = getMaterialPurchaseContractOutputBatches(batch)
  assert.deepEqual(
    batches.map((group) => group.length),
    [20, 20, 1]
  )
  assert.equal(
    new Set(batches.flat().map((contract) => contract.purchaseOrderID)).size,
    41
  )
  assert.deepEqual(
    getMaterialPurchaseContractBatchProblems(template, {
      ...batch,
      contracts: batches[2],
    }),
    []
  )
  const restored = buildMaterialPurchaseContractBatchDraft(
    batch.contracts,
    batch
  )
  assert.equal(restored.sourceLabel, '模拟汇总表')
  assert.equal(restored.batchIndex, 2)
})

test('排除缺资料合同只影响输出范围，恢复选择后仍保留修改与缺值', () => {
  const batch = buildMaterialPurchaseContractBatchDraft([
    { purchaseOrderID: 1, draft: validDraft() },
    {
      purchaseOrderID: 2,
      included: false,
      draft: validDraft({ supplierName: '' }),
    },
  ])
  const restored = buildMaterialPurchaseContractBatchDraft(
    JSON.parse(JSON.stringify(batch)).contracts,
    batch
  )
  assert.equal(restored.contracts.length, 2)
  assert.equal(getMaterialPurchaseContractOutputBatches(restored)[0].length, 1)
  assert.equal(restored.contracts[1].draft.supplierName, '')
  restored.contracts[1].included = true
  assert.equal(getMaterialPurchaseContractOutputBatches(restored)[0].length, 2)
  assert.equal(
    getMaterialPurchaseContractBatchProblems(template, restored).length,
    1
  )
  restored.contracts.forEach((contract) => {
    contract.included = false
  })
  assert.deepEqual(getMaterialPurchaseContractOutputBatches(restored), [])
})
