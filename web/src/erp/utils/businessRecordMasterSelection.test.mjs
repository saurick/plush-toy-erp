import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMasterRecordLinkedValues,
  buildMasterRecordOption,
  filterMasterRecordsByField,
} from './businessRecordMasterSelection.mjs'

const customerField = {
  key: 'payload.customer_record_id',
  masterRecordKind: 'customer',
  partnerTypes: ['合作客户', '潜在客户'],
}

const supplierField = {
  key: 'payload.supplier_record_id',
  masterRecordKind: 'supplier',
  partnerTypes: ['合作供应商'],
}

const productField = {
  key: 'payload.product_record_id',
  masterRecordKind: 'product',
}

test('businessRecordMasterSelection: 客户选择只匹配客户类型并生成可搜索标签', () => {
  const records = [
    {
      id: 1,
      document_no: 'C001',
      title: '客户 A',
      payload: { partner_type: '合作客户' },
    },
    {
      id: 2,
      document_no: 'S001',
      title: '供应商 B',
      payload: { partner_type: '合作供应商' },
    },
  ]

  assert.deepEqual(
    filterMasterRecordsByField(records, customerField).map(
      (record) => record.id
    ),
    [1]
  )
  assert.deepEqual(buildMasterRecordOption(records[0]), {
    label: 'C001 / 客户 A / 合作客户',
    value: '1',
  })
})

test('FL_master_record_selection__syncs_customer_snapshot businessRecordMasterSelection: 选择客户时同步软引用和业务快照', () => {
  const values = buildMasterRecordLinkedValues(
    {
      id: 7,
      document_no: 'C007',
      title: '宁波客户',
      payload: {
        partner_type: '合作客户',
        country_region: 'China',
        payment_method: '月结30天',
        payment_cycle_days: 30,
        tax_no: 'TAX-007',
        address: '宁波',
        contact_summary: '张三\n李四',
        office_phone_summary: '0574-1000',
      },
    },
    customerField
  )

  assert.equal(values['payload.customer_record_id'], '7')
  assert.equal(values.customer_name, '宁波客户')
  assert.equal(values['payload.customer_record_code'], 'C007')
  assert.equal(values['payload.customer_partner_type'], '合作客户')
  assert.equal(values['payload.customer_country_region'], 'China')
  assert.equal(values['payload.customer_payment_method'], '月结30天')
  assert.equal(values['payload.customer_payment_cycle_days'], 30)
  assert.equal(values['payload.customer_tax_no'], 'TAX-007')
  assert.equal(values['payload.customer_address'], '宁波')
  assert.equal(values['payload.customer_contact_name'], '张三')
  assert.equal(values['payload.customer_contact_phone'], '0574-1000')
})

test('FL_master_record_selection__syncs_supplier_snapshot businessRecordMasterSelection: 选择供应商时同步供应商快照', () => {
  const values = buildMasterRecordLinkedValues(
    {
      id: 8,
      document_no: 'S008',
      title: '加工厂 A',
      payload: {
        partner_type: '合作供应商',
        country_region: 'China',
        contact_name: '王五',
        contact_phone: '13800000000',
      },
    },
    supplierField
  )

  assert.equal(values['payload.supplier_record_id'], '8')
  assert.equal(values.supplier_name, '加工厂 A')
  assert.equal(values['payload.supplier_record_code'], 'S008')
  assert.equal(values['payload.supplier_partner_type'], '合作供应商')
  assert.equal(values['payload.supplier_country_region'], 'China')
  assert.equal(values['payload.supplier_contact_name'], '王五')
  assert.equal(values['payload.supplier_contact_phone'], '13800000000')
})

test('FL_master_record_selection__syncs_product_snapshot businessRecordMasterSelection: 选择产品时同步产品快照', () => {
  const values = buildMasterRecordLinkedValues(
    {
      id: 9,
      document_no: 'P009',
      product_no: 'SKU-009',
      product_name: '毛绒兔挂件',
      style_no: 'ST-009',
      payload: {
        product_order_no: 'PO-009',
        product_category: '毛绒挂件',
        hs_code: '950300',
        spec_code: 'PLUSH-009',
        en_desc: 'Plush bunny keychain',
        attachment_ref: 'drawing.pdf',
      },
    },
    productField
  )

  assert.equal(values['payload.product_record_id'], '9')
  assert.equal(values.product_no, 'SKU-009')
  assert.equal(values.product_name, '毛绒兔挂件')
  assert.equal(values.style_no, 'ST-009')
  assert.equal(values['payload.product_order_no'], undefined)
  assert.equal(values['payload.category'], '毛绒挂件')
  assert.equal(values['payload.product_record_code'], 'P009')
  assert.equal(values['payload.product_category'], '毛绒挂件')
  assert.equal(values['payload.hs_code'], '950300')
  assert.equal(values['payload.spec_code'], 'PLUSH-009')
  assert.equal(values['payload.en_desc'], 'Plush bunny keychain')
  assert.equal(values['payload.attachment_ref'], 'drawing.pdf')
})

test('FL_master_record_selection__keeps_product_record_code_out_of_sku businessRecordMasterSelection: 产品资料编号不兜底写入 SKU', () => {
  const values = buildMasterRecordLinkedValues(
    {
      id: 10,
      document_no: 'P010',
      product_name: '毛绒熊',
      style_no: 'ST-010',
      payload: {
        product_category: '毛绒公仔',
      },
    },
    productField
  )

  assert.equal(values.product_no, '')
  assert.equal(values['payload.product_record_code'], 'P010')
})

test('FL_master_record_selection__clears_linked_snapshots businessRecordMasterSelection: 清空主档选择时同步清空关联快照', () => {
  assert.deepEqual(buildMasterRecordLinkedValues(null, customerField), {
    'payload.customer_record_id': '',
    customer_name: '',
    'payload.customer_record_code': '',
    'payload.customer_partner_type': '',
    'payload.customer_country_region': '',
    'payload.customer_payment_method': '',
    'payload.customer_payment_cycle_days': '',
    'payload.customer_tax_no': '',
    'payload.customer_address': '',
    'payload.customer_contact_name': '',
    'payload.customer_contact_phone': '',
  })
  assert.deepEqual(buildMasterRecordLinkedValues(null, productField), {
    'payload.product_record_id': '',
    product_no: '',
    product_name: '',
    style_no: '',
    'payload.category': '',
    'payload.product_record_code': '',
    'payload.product_category': '',
    'payload.hs_code': '',
    'payload.spec_code': '',
    'payload.en_desc': '',
    'payload.attachment_ref': '',
  })
})
