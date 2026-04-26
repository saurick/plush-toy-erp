import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildBusinessRecordParams,
  buildBusinessRecordStatusUpdateParams,
  normalizeRecordItems,
  summarizeRecordItems,
} from './businessRecordForm.mjs'

const moduleItem = {
  key: 'accessories-purchase',
  title: '辅材/包材采购',
  sectionKey: 'purchase',
}

const definition = {
  itemFields: [
    { key: 'material_name', label: '材料品名' },
    { key: 'quantity', label: '采购数量', type: 'number' },
    { key: 'unit_price', label: '单价', type: 'number' },
    { key: 'amount', label: '金额', type: 'number' },
  ],
}

test('FL_business_item_amount__derives_amount_from_quantity_and_unit_price businessRecordForm: 明细金额为空时按数量乘单价派生并连续编号', () => {
  assert.deepEqual(
    normalizeRecordItems(
      [
        { material_name: '', quantity: null, unit_price: null, amount: null },
        { material_name: 'PP 棉', quantity: 3, unit_price: 12.5, amount: null },
      ],
      definition.itemFields
    ),
    [
      {
        line_no: 1,
        payload: {},
        material_name: 'PP 棉',
        quantity: 3,
        unit_price: 12.5,
        amount: 37.5,
      },
    ]
  )
})

test('FL_business_item_amount__keeps_manual_amount_snapshot businessRecordForm: 手工金额优先于数量乘单价', () => {
  const items = normalizeRecordItems(
    [{ material_name: '织带', quantity: 2, unit_price: 8, amount: 20 }],
    definition.itemFields
  )

  assert.equal(items[0].amount, 20)
})

test('FL_business_header_totals__backfills_missing_header_quantity_and_amount businessRecordForm: 表头数量和金额为空时由明细合计回写', () => {
  const params = buildBusinessRecordParams(
    {
      title: '采购测试',
      quantity: null,
      amount: null,
      business_status_key: 'material_preparing',
      owner_role_key: 'purchase',
      items: [
        { material_name: '织带', quantity: 2, unit_price: 8, amount: null },
        { material_name: '吊牌', quantity: 5, unit_price: 1.2, amount: 7 },
      ],
    },
    moduleItem,
    definition,
    null
  )

  assert.equal(params.quantity, 7)
  assert.equal(params.amount, 23)
  assert.equal(params.items.length, 2)
})

test('FL_business_header_totals__keeps_manual_header_values businessRecordForm: 表头手工数量和金额不被明细合计覆盖', () => {
  const params = buildBusinessRecordParams(
    {
      title: '采购测试',
      quantity: 99,
      amount: 88,
      business_status_key: 'material_preparing',
      owner_role_key: 'purchase',
      items: [{ material_name: '织带', quantity: 2, unit_price: 8 }],
    },
    moduleItem,
    definition,
    { id: 12, row_version: 4 }
  )

  assert.equal(params.quantity, 99)
  assert.equal(params.amount, 88)
  assert.equal(params.row_version, 4)
})

test('businessRecordForm: 明细摘要同时计算显式金额和派生金额', () => {
  assert.deepEqual(
    summarizeRecordItems(
      [
        { material_name: '织带', quantity: 2, unit_price: 8 },
        { material_name: '吊牌', quantity: 5, amount: 7 },
      ],
      definition.itemFields
    ),
    {
      rowCount: 2,
      hasQuantity: true,
      quantity: 7,
      hasAmount: true,
      amount: 23,
    }
  )
})

test('FL_business_status_update__preserves_record_fields_and_items businessRecordForm: 状态流转参数保留原记录字段和明细，避免清空残值', () => {
  const params = buildBusinessRecordStatusUpdateParams(
    {
      id: 21,
      module_key: 'accessories-purchase',
      document_no: 'PUR-001',
      title: '采购单',
      source_no: 'BOM-001',
      customer_name: '成慧怡',
      supplier_name: '联调供应商',
      product_no: '24668',
      product_name: '企鹅包包',
      material_name: 'PP 棉',
      quantity: 99,
      amount: 88,
      business_status_key: 'material_preparing',
      owner_role_key: 'purchase',
      due_date: '2026-04-30',
      payload: { note: '保留备注', priority: 3 },
      row_version: 7,
      items: [
        {
          material_name: 'PP 棉',
          quantity: 3,
          unit_price: 12.5,
          amount: null,
        },
      ],
    },
    'production_ready',
    moduleItem,
    definition,
    { reason: '资料已齐，转待排产' }
  )

  assert.equal(params.id, 21)
  assert.equal(params.business_status_key, 'production_ready')
  assert.equal(params.source_no, 'BOM-001')
  assert.equal(params.customer_name, '成慧怡')
  assert.equal(params.supplier_name, '联调供应商')
  assert.equal(params.product_no, '24668')
  assert.equal(params.product_name, '企鹅包包')
  assert.equal(params.material_name, 'PP 棉')
  assert.equal(params.quantity, 99)
  assert.equal(params.amount, 88)
  assert.equal(params.due_date, '2026-04-30')
  assert.equal(params.payload.note, '保留备注')
  assert.equal(params.payload.priority, 3)
  assert.equal(params.payload.status_reason, '资料已齐，转待排产')
  assert.equal(params.payload.status_reason_key, 'production_ready')
  assert.equal(params.row_version, 7)
  assert.equal(params.items[0].amount, 37.5)
})

test('businessRecordForm: payload 字段按定义保存，清空后不保留旧残值', () => {
  const params = buildBusinessRecordParams(
    {
      title: '质检记录',
      business_status_key: 'qc_pending',
      owner_role_key: 'quality',
      'payload.qc_result': 'failed',
      'payload.defect_qty': 2,
      'payload.defect_reason': '',
      items: [],
    },
    { key: 'quality-inspections', title: '品质检验', sectionKey: 'production' },
    {
      formFields: [
        { key: 'payload.qc_result', label: '检验结果' },
        { key: 'payload.defect_qty', label: '不良数量', type: 'number' },
        { key: 'payload.defect_reason', label: '不良原因' },
      ],
      itemFields: [],
    },
    {
      id: 1,
      row_version: 2,
      payload: {
        qc_result: 'passed',
        defect_qty: 0,
        defect_reason: '旧原因',
      },
    }
  )

  assert.equal(params.payload.qc_result, 'failed')
  assert.equal(params.payload.defect_qty, 2)
  assert.equal(params.payload.defect_reason, undefined)
})
