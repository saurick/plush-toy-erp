import assert from 'node:assert/strict'
import test from 'node:test'

import { getBusinessRecordDefinition } from './businessRecordDefinitions.mjs'

test('businessRecordDefinitions: 业务页按模块暴露日期筛选字段', () => {
  const definition = getBusinessRecordDefinition({
    key: 'production-scheduling',
    sectionKey: 'production',
  })

  assert.deepEqual(definition.dateFilterOptions, [
    { key: 'document_date', label: '排产日期' },
    { key: 'due_date', label: '计划完成日期' },
  ])
})

test('businessRecordDefinitions: 没有业务日期字段时回退到创建日期筛选', () => {
  const definition = getBusinessRecordDefinition({
    key: 'material-bom',
    sectionKey: 'purchase',
  })

  assert.deepEqual(definition.dateFilterOptions, [
    { key: 'created_at', label: '创建日期' },
  ])
})

test('businessRecordDefinitions: 新增品质和财务模块包含核心字段定义', () => {
  const expectations = [
    {
      key: 'quality-inspections',
      sectionKey: 'production',
      owner: 'quality',
      fields: [
        'document_no',
        'title',
        'source_no',
        'supplier_name',
        'customer_name',
        'style_no',
        'product_no',
        'product_name',
        'material_name',
        'quantity',
        'unit',
        'document_date',
        'due_date',
        'payload.qc_type',
        'payload.qc_result',
        'payload.defect_qty',
        'payload.defect_reason',
        'payload.rework_required',
        'payload.release_decision',
      ],
    },
    {
      key: 'receivables',
      sectionKey: 'finance',
      owner: 'finance',
      fields: [
        'document_no',
        'title',
        'source_no',
        'customer_name',
        'product_name',
        'quantity',
        'amount',
        'document_date',
        'due_date',
        'payload.tax_rate',
        'payload.tax_amount',
        'payload.amount_without_tax',
        'payload.amount_with_tax',
        'payload.received_amount',
        'payload.receivable_status',
        'payload.invoice_status',
        'payload.settlement_note',
      ],
    },
    {
      key: 'invoices',
      sectionKey: 'finance',
      owner: 'finance',
      fields: [
        'document_no',
        'title',
        'source_no',
        'customer_name',
        'supplier_name',
        'amount',
        'document_date',
        'due_date',
        'payload.invoice_no',
        'payload.invoice_type',
        'payload.tax_rate',
        'payload.tax_amount',
        'payload.amount_without_tax',
        'payload.amount_with_tax',
        'payload.invoice_direction',
        'payload.invoice_status',
        'payload.issue_date',
        'payload.receive_date',
      ],
    },
  ]

  expectations.forEach((item) => {
    const definition = getBusinessRecordDefinition({
      key: item.key,
      sectionKey: item.sectionKey,
    })
    const fieldKeys = definition.formFields.map((field) => field.key)

    assert.equal(definition.defaultOwnerRole, item.owner)
    item.fields.forEach((fieldKey) => {
      assert(
        fieldKeys.includes(fieldKey),
        `expected ${item.key} to include ${fieldKey}`
      )
    })
    assert(definition.itemFields.length > 0)
  })
})
