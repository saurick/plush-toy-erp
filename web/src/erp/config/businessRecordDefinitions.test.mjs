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

test('businessRecordDefinitions: BOM 暴露来源日期作为 payload 日期筛选', () => {
  const definition = getBusinessRecordDefinition({
    key: 'material-bom',
    sectionKey: 'purchase',
  })

  assert.deepEqual(definition.dateFilterOptions, [
    { key: 'payload.source_date', label: '来源日期' },
  ])
})

test('businessRecordDefinitions: 没有业务日期字段时回退到创建日期筛选', () => {
  const definition = getBusinessRecordDefinition({
    key: 'partners',
    sectionKey: 'master',
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

test('businessRecordDefinitions: 销售链路默认主责角色是 sales', () => {
  const definition = getBusinessRecordDefinition({
    key: 'project-orders',
    sectionKey: 'sales',
  })

  assert.equal(definition.defaultOwnerRole, 'sales')
})

test('businessRecordDefinitions: 业务模块按字段自动插入基础资料选择器', () => {
  const projectOrder = getBusinessRecordDefinition({
    key: 'project-orders',
    sectionKey: 'sales',
  })
  const projectOrderKeys = projectOrder.formFields.map((field) => field.key)
  assert(projectOrderKeys.includes('payload.customer_record_id'))
  assert(projectOrderKeys.includes('payload.product_record_id'))
  assert(
    projectOrderKeys.indexOf('payload.customer_record_id') <
      projectOrderKeys.indexOf('customer_name')
  )
  assert(
    projectOrderKeys.indexOf('payload.product_record_id') <
      projectOrderKeys.indexOf('style_no')
  )

  const processingContract = getBusinessRecordDefinition({
    key: 'processing-contracts',
    sectionKey: 'purchase',
  })
  const processingKeys = processingContract.formFields.map((field) => field.key)
  assert(processingKeys.includes('payload.supplier_record_id'))
  assert(processingKeys.includes('payload.product_record_id'))

  const partners = getBusinessRecordDefinition({
    key: 'partners',
    sectionKey: 'master',
  })
  const products = getBusinessRecordDefinition({
    key: 'products',
    sectionKey: 'master',
  })
  assert(!partners.formFields.some((field) => field.type === 'master-record'))
  assert(!products.formFields.some((field) => field.type === 'master-record'))
  assert.equal(partners.hideWorkflowFields, true)
  assert.equal(products.hideWorkflowFields, true)
})

test('businessRecordDefinitions: 客户供应商新建表单只暴露必要主档字段', () => {
  const partners = getBusinessRecordDefinition({
    key: 'partners',
    sectionKey: 'master',
  })
  const partnerFormKeys = partners.formFields.map((field) => field.key)

  assert.deepEqual(partnerFormKeys, [
    'payload.partner_type',
    'title',
    'payload.address',
    'payload.country_region',
    'payload.sales_owner',
    'payload.payment_method',
    'payload.payment_cycle_days',
    'payload.tax_no',
  ])
  assert.equal(
    partners.formFields.find((field) => field.key === 'payload.address')
      ?.fullWidth,
    true
  )
})

test('businessRecordDefinitions: Excel 非合同业务字段落到业务模块字段定义', () => {
  const expectations = [
    {
      key: 'project-orders',
      sectionKey: 'sales',
      formFields: [
        'document_date',
        'payload.product_order_no',
        'payload.color',
        'payload.production_qty',
        'payload.unshipped_qty',
        'payload.business_owner',
        'payload.order_unit_price',
      ],
      itemFields: [
        'payload.color',
        'payload.production_qty',
        'payload.line_remark',
      ],
    },
    {
      key: 'material-bom',
      sectionKey: 'purchase',
      formFields: [
        'payload.product_order_no',
        'payload.spare_qty',
        'payload.designer_name',
        'payload.material_direction',
        'payload.color_card_ref',
        'payload.sop_ref',
        'payload.source_date',
      ],
      itemFields: [
        'payload.material_category',
        'payload.supplier_item_no',
        'payload.assembly_part',
        'payload.unit_usage',
        'payload.loss_rate',
        'payload.process_prepare_note',
      ],
    },
    {
      key: 'accessories-purchase',
      sectionKey: 'purchase',
      formFields: [
        'product_no',
        'product_name',
        'payload.supplier_item_no',
        'payload.supplier_short_name',
        'payload.orderer_name',
        'payload.orderer_phone',
        'payload.contract_printed',
      ],
      itemFields: [
        'payload.supplier_item_no',
        'payload.return_date',
        'payload.contract_printed',
      ],
    },
    {
      key: 'processing-contracts',
      sectionKey: 'purchase',
      formFields: ['payload.orderer_name', 'payload.orderer_phone'],
      itemFields: [
        'payload.material_qty',
        'payload.material_unit',
        'payload.processing_inbound_qty',
        'payload.quantity_diff',
        'payload.line_remark',
      ],
    },
    {
      key: 'partners',
      sectionKey: 'master',
      formFields: [
        'payload.partner_type',
        'title',
        'payload.address',
        'payload.country_region',
        'payload.sales_owner',
        'payload.payment_method',
        'payload.payment_cycle_days',
        'payload.tax_no',
      ],
      itemFields: [
        'item_name',
        'payload.office_phone',
        'payload.mobile_phone',
        'payload.email',
      ],
    },
    {
      key: 'products',
      sectionKey: 'master',
      formFields: [
        'document_no',
        'payload.product_category',
        'payload.hs_code',
        'payload.spec_code',
        'product_name',
        'payload.en_desc',
        'payload.attachment_ref',
        'style_no',
        'product_no',
      ],
      itemFields: ['item_name', 'spec'],
    },
  ]

  expectations.forEach((item) => {
    const definition = getBusinessRecordDefinition({
      key: item.key,
      sectionKey: item.sectionKey,
    })
    const formFieldKeys = definition.formFields.map((field) => field.key)
    const itemFieldKeys = definition.itemFields.map((field) => field.key)

    item.formFields.forEach((fieldKey) => {
      assert(
        formFieldKeys.includes(fieldKey),
        `expected ${item.key} form fields to include ${fieldKey}`
      )
    })
    item.itemFields.forEach((fieldKey) => {
      assert(
        itemFieldKeys.includes(fieldKey),
        `expected ${item.key} item fields to include ${fieldKey}`
      )
    })
  })
})

test('businessRecordDefinitions: 基础资料列表列包含 trade-erp 摘要字段', () => {
  const partners = getBusinessRecordDefinition({
    key: 'partners',
    sectionKey: 'master',
  })
  const partnerColumns = partners.tableColumns.map((column) => column.key)
  assert(partnerColumns.includes('payload.contact_summary'))
  assert(partnerColumns.includes('payload.office_phone_summary'))
  assert(partnerColumns.includes('payload.mobile_phone_summary'))
  assert(partnerColumns.includes('payload.email_summary'))

  const products = getBusinessRecordDefinition({
    key: 'products',
    sectionKey: 'master',
  })
  const productColumns = products.tableColumns.map((column) => column.key)
  assert(productColumns.includes('payload.product_category'))
  assert(productColumns.includes('payload.spec_code'))
  assert(productColumns.includes('payload.hs_code'))
  assert(productColumns.includes('payload.en_desc'))
  assert(!productColumns.includes('payload.product_order_no'))
})

test('businessRecordDefinitions: 产品主档字段不再混用资料编号、SKU 和订单编号', () => {
  const products = getBusinessRecordDefinition({
    key: 'products',
    sectionKey: 'master',
  })
  const documentNoField = products.formFields.find(
    (field) => field.key === 'document_no'
  )
  const categoryField = products.formFields.find(
    (field) => field.key === 'payload.product_category'
  )
  const hsCodeField = products.formFields.find(
    (field) => field.key === 'payload.hs_code'
  )

  assert.equal(documentNoField?.label, '产品资料编号')
  assert.match(documentNoField?.placeholder || '', /不等同产品编号/)
  assert.equal(categoryField?.label, '产品分类')
  assert.equal(
    categoryField?.options?.some((option) => option.value === '钕铁硼'),
    false
  )
  assert.equal(
    categoryField?.options?.some((option) => option.value === '毛绒公仔'),
    true
  )
  assert.equal(hsCodeField?.type, 'autocomplete')
  assert.equal(hsCodeField?.required, undefined)
  assert.equal(hsCodeField?.options, undefined)
  assert.equal(
    products.formFields.some(
      (field) => field.key === 'payload.product_order_no'
    ),
    false
  )
})

test('businessRecordDefinitions: 付款方式暂不提供预设候选值', () => {
  const partners = getBusinessRecordDefinition({
    key: 'partners',
    sectionKey: 'master',
  })
  const paymentMethodField = partners.formFields.find(
    (field) => field.key === 'payload.payment_method'
  )

  assert.equal(paymentMethodField?.type, 'autocomplete')
  assert.equal(paymentMethodField?.options, undefined)
  assert.match(paymentMethodField?.placeholder || '', /可手输付款方式/)
})
