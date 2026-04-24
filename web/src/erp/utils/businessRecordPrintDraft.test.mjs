import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildBusinessRecordPrintDraft,
  getBusinessRecordPrintTemplate,
} from './businessRecordPrintDraft.mjs'
import {
  MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
  PROCESSING_CONTRACT_TEMPLATE_KEY,
} from './printWorkspace.js'

test('businessRecordPrintDraft: 辅材采购记录带值生成采购合同草稿', () => {
  const draft = buildBusinessRecordPrintDraft('accessories-purchase', {
    document_no: 'CG202604240001',
    source_no: 'XM260202',
    supplier_name: '华南辅材',
    product_no: '23145-1',
    product_name: '黑白熊猫挂件',
    document_date: '2026-04-24',
    due_date: '2026-05-02',
    items: [
      {
        material_name: '黑色发箍头胶套',
        spec: '12mm',
        quantity: 200,
        unit: 'PCS',
        unit_price: 0.12,
        amount: '',
        supplier_name: '华南辅材',
      },
      {
        material_name: '白色织带',
        spec: '8mm',
        quantity: 300,
        unit: '米',
        unit_price: 0.3,
        amount: 88,
      },
    ],
  })

  assert.equal(draft.contractNo, 'CG202604240001')
  assert.equal(draft.supplierName, '华南辅材')
  assert.equal(draft.returnDateText, '2026-05-02')
  assert.equal(draft.lines.length, 2)
  assert.equal(draft.lines[0].contractNo, 'CG202604240001')
  assert.equal(draft.lines[0].productOrderNo, 'XM260202')
  assert.equal(draft.lines[0].productName, '黑白熊猫挂件')
  assert.equal(draft.lines[0].materialName, '黑色发箍头胶套')
  assert.equal(draft.lines[0].vendorCode, '华南辅材')
  assert.equal(draft.lines[0].amount, '24.00')
  assert.equal(draft.lines[1].amount, '88.00')
  assert(!draft.lines.some((line) => line.contractNo === 'A26022832'))
  assert(!draft.lines.some((line) => line.productName.includes('双熊猫')))
})

test('businessRecordPrintDraft: 辅材采购缺少真源字段时不沿用样例残值', () => {
  const draft = buildBusinessRecordPrintDraft('accessories-purchase', {
    document_no: 'CG202604240002',
    title: '辅材采购',
    items: [],
  })

  assert.equal(draft.contractNo, 'CG202604240002')
  assert.equal(draft.supplierName, '')
  assert.equal(draft.returnDateText, '')
  assert.equal(draft.lines.length, 1)
  assert.equal(draft.lines[0].contractNo, 'CG202604240002')
  assert.equal(draft.lines[0].productName, '')
  assert.equal(draft.lines[0].materialName, '辅材采购')
  assert.equal(draft.lines[0].vendorCode, '')
  assert.equal(draft.lines[0].quantity, '')
})

test('businessRecordPrintDraft: 加工记录带值生成加工合同草稿', () => {
  const draft = buildBusinessRecordPrintDraft('processing-contracts', {
    document_no: 'JG202604240001',
    source_no: 'SLO260101',
    supplier_name: '子淳加工厂',
    product_no: '23233',
    product_name: '10cm PN 吊饰',
    due_date: '2026-05-06',
    items: [
      {
        item_name: '车缝',
        spec: '车缝工序',
        quantity: 9024,
        unit: '只',
        unit_price: 0.2,
        amount: '',
      },
    ],
  })

  assert.equal(draft.contractNo, 'JG202604240001')
  assert.equal(draft.supplierName, '子淳加工厂')
  assert.equal(draft.returnDateText, '2026-05-06')
  assert.equal(draft.lines.length, 1)
  assert.equal(draft.lines[0].contractNo, 'JG202604240001')
  assert.equal(draft.lines[0].productOrderNo, 'SLO260101')
  assert.equal(draft.lines[0].productNo, '23233')
  assert.equal(draft.lines[0].processName, '车缝')
  assert.equal(draft.lines[0].supplierAlias, '子淳加工厂')
  assert.equal(draft.lines[0].processCategory, '车缝工序')
  assert.equal(draft.lines[0].amount, '1804.8')
  assert(!draft.lines.some((line) => line.contractNo === 'B25060808'))
  assert(!draft.lines.some((line) => line.processName === '面*1'))
})

test('businessRecordPrintDraft: 只有指定业务页能生成打印模板草稿', () => {
  assert.equal(
    getBusinessRecordPrintTemplate('accessories-purchase')?.key,
    MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY
  )
  assert.equal(
    getBusinessRecordPrintTemplate('processing-contracts')?.key,
    PROCESSING_CONTRACT_TEMPLATE_KEY
  )
  assert.equal(getBusinessRecordPrintTemplate('inventory'), null)
  assert.equal(buildBusinessRecordPrintDraft('inventory', {}), null)
})
