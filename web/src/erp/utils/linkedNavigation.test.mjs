import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildLinkedNavigationQuery,
  getLinkedTargets,
  matchesLinkedRecord,
  parseLinkedNavigationQuery,
} from './linkedNavigation.mjs'
import {
  buildBusinessRecordSourcePrefillValues,
  getBusinessRecordSourcePrefillModuleKeys,
  getDefaultBusinessRecordSourcePrefillModuleKey,
  resolveBusinessRecordSourceRecord,
  shouldClearBusinessRecordSourcePrefill,
} from './businessRecordSourcePrefill.mjs'

test('linkedNavigation: 客户款式立项可跳转到主链下游业务页', () => {
  const targets = getLinkedTargets('project-orders', {
    document_no: 'PO260424001',
  })

  assert.deepEqual(
    targets.map((item) => item.targetKey),
    [
      'material-bom',
      'accessories-purchase',
      'processing-contracts',
      'production-scheduling',
      'shipping-release',
    ]
  )
  assert.deepEqual(
    targets.map((item) => item.matchFields),
    [['source_no'], ['source_no'], ['source_no'], ['source_no'], ['source_no']]
  )
})

test('linkedNavigation: 采购和加工记录按 source_no 回跳上游并按 document_no 找下游', () => {
  const purchaseTargets = getLinkedTargets('accessories-purchase', {
    document_no: 'CG260424001',
    source_no: 'BOM260424001',
  })

  assert.deepEqual(
    purchaseTargets.map((item) => item.targetKey),
    ['project-orders', 'material-bom', 'inbound', 'reconciliation']
  )
  assert.equal(purchaseTargets[0].keyword, 'BOM260424001')
  assert.equal(purchaseTargets[2].keyword, 'CG260424001')

  const processingTargets = getLinkedTargets('processing-contracts', {
    document_no: 'JG260424001',
    source_no: 'PO260424001',
  })

  assert.deepEqual(
    processingTargets.map((item) => item.targetKey),
    [
      'project-orders',
      'material-bom',
      'inbound',
      'production-scheduling',
      'reconciliation',
    ]
  )
})

test('linkedNavigation: 无稳定 document_no 或 source_no 时不提供误导性跳转', () => {
  assert.deepEqual(getLinkedTargets('inventory', { document_no: 'KC001' }), [])
  assert.deepEqual(getLinkedTargets('payables', { document_no: 'FK001' }), [])
})

test('linkedNavigation: 字段白名单匹配避免同号误命中备注或其它字段', () => {
  assert.equal(
    matchesLinkedRecord(
      {
        source_no: 'PO260424001',
        payload: { note: '备注里提到 PO260424002' },
      },
      'PO260424001',
      ['source_no']
    ),
    true
  )
  assert.equal(
    matchesLinkedRecord(
      {
        source_no: 'PO260424001',
        payload: { note: '备注里提到 PO260424002' },
      },
      'PO260424002',
      ['source_no']
    ),
    false
  )
  assert.equal(
    matchesLinkedRecord(
      {
        source_no: 'PO260424001',
        payload: { note: '备注里提到 PO260424002' },
      },
      'PO260424002'
    ),
    true
  )
})

test('linkedNavigation: 跳转 query 保留来源、关键字和目标匹配字段', () => {
  const query = buildLinkedNavigationQuery({
    sourceKey: 'project-orders',
    keyword: 'PO260424001',
    matchFields: ['source_no'],
  })

  assert.deepEqual(parseLinkedNavigationQuery(query), {
    keyword: 'PO260424001',
    sourceKey: 'project-orders',
    matchFields: ['source_no'],
  })
})

test('linkedNavigation: 来源带值模块白名单按目标模块收口', () => {
  assert.deepEqual(
    getBusinessRecordSourcePrefillModuleKeys('accessories-purchase'),
    ['material-bom', 'project-orders']
  )
  assert.equal(
    getDefaultBusinessRecordSourcePrefillModuleKey('processing-contracts'),
    'material-bom'
  )
  assert.deepEqual(getBusinessRecordSourcePrefillModuleKeys('inventory'), [])
})

test('FL_business_source_prefill__clears_when_source_changes linkedNavigation: 已带值来源发生变化时需要清空旧来源残值', () => {
  assert.equal(
    shouldClearBusinessRecordSourcePrefill({
      appliedModuleKey: 'material-bom',
      appliedKeyword: 'BOM260424001',
      nextKeyword: 'BOM260424002',
    }),
    true
  )
  assert.equal(
    shouldClearBusinessRecordSourcePrefill({
      appliedModuleKey: 'material-bom',
      appliedKeyword: 'BOM260424001',
      nextModuleKey: 'project-orders',
    }),
    true
  )
  assert.equal(
    shouldClearBusinessRecordSourcePrefill({
      appliedModuleKey: 'material-bom',
      appliedKeyword: 'BOM260424001',
      nextKeyword: 'BOM260424001',
    }),
    false
  )
  assert.equal(
    shouldClearBusinessRecordSourcePrefill({
      nextKeyword: 'BOM260424001',
    }),
    false
  )
})

test('FL_business_source_prefill__rebuilds_target_from_blank linkedNavigation: 下游新建默认按来源记录带值且从空白值重建', () => {
  const sourceRecord = {
    module_key: 'project-orders',
    document_no: 'PO260424001',
    source_no: 'KH-7788',
    title: '黑白熊猫挂件',
    customer_name: '成慧怡',
    style_no: '26029#',
    product_no: '24594',
    product_name: '黑白熊猫挂件',
    quantity: 300,
    unit: 'PCS',
    due_date: '2026-05-20',
    payload: {
      product_order_no: 'SLO26029',
      color: '黑白',
      business_owner: '张三',
    },
  }
  const values = buildBusinessRecordSourcePrefillValues({
    baseValues: {
      source_no: '',
      customer_name: '',
      style_no: '',
      product_no: '',
      product_name: '',
      quantity: null,
      unit: '',
      due_date: '',
      title: '',
      'payload.product_order_no': '',
      'payload.color': '',
      'payload.business_owner': '',
      items: [{ material_name: '旧物料' }],
    },
    sourceRecord,
    targetModuleKey: 'material-bom',
    targetDefinition: {
      formFields: [
        { key: 'source_no' },
        { key: 'customer_name' },
        { key: 'style_no' },
        { key: 'product_no' },
        { key: 'product_name' },
        { key: 'quantity' },
        { key: 'unit' },
        { key: 'due_date' },
        { key: 'title' },
        { key: 'payload.product_order_no' },
        { key: 'payload.color' },
        { key: 'payload.business_owner' },
      ],
    },
  })

  assert.equal(values.source_no, 'PO260424001')
  assert.equal(values.customer_name, '成慧怡')
  assert.equal(values.style_no, '26029#')
  assert.equal(values.product_no, '24594')
  assert.equal(values.product_name, '黑白熊猫挂件')
  assert.equal(values.quantity, 300)
  assert.equal(values.unit, 'PCS')
  assert.equal(values.due_date, '2026-05-20')
  assert.equal(values.title, '黑白熊猫挂件 BOM')
  assert.equal(values['payload.product_order_no'], 'SLO26029')
  assert.equal(values['payload.color'], '黑白')
  assert.equal(values['payload.business_owner'], '张三')
  assert.deepEqual(values.items, [{ material_name: '旧物料' }])
})

test('FL_business_source_prefill__filters_bom_accessories linkedNavigation: BOM 到辅材采购只带辅材包材明细，避免主料残留', () => {
  const values = buildBusinessRecordSourcePrefillValues({
    baseValues: {
      source_no: '',
      title: '',
      product_name: '',
      items: [{ material_name: '', 'payload.supplier_item_no': '' }],
    },
    sourceRecord: {
      module_key: 'material-bom',
      document_no: 'BOM260424001',
      product_name: '黑白熊猫挂件',
      payload: {},
      items: [
        {
          material_name: '主料布',
          spec: '黑白',
          quantity: 10,
          unit: 'Y',
          payload: {
            material_category: 'main_material',
            supplier_item_no: 'M-01',
          },
        },
        {
          material_name: '吊牌',
          spec: '30mm',
          quantity: 300,
          unit: 'PCS',
          payload: { material_category: 'packaging', supplier_item_no: 'P-01' },
        },
      ],
    },
    targetModuleKey: 'accessories-purchase',
    targetDefinition: {
      formFields: [
        { key: 'source_no' },
        { key: 'title' },
        { key: 'product_name' },
      ],
    },
  })

  assert.equal(values.source_no, 'BOM260424001')
  assert.equal(values.title, '黑白熊猫挂件 辅材/包材采购')
  assert.equal(values.items.length, 1)
  assert.equal(values.items[0].material_name, '吊牌')
  assert.equal(values.items[0]['payload.supplier_item_no'], 'P-01')
})

test('linkedNavigation: 解析来源记录时要求单号精确匹配', () => {
  const sourceRecord = resolveBusinessRecordSourceRecord(
    [
      { document_no: 'PO260424001-OLD' },
      { document_no: 'PO260424001', source_no: 'KH-7788' },
    ],
    'PO260424001'
  )

  assert.equal(sourceRecord.document_no, 'PO260424001')
  assert.equal(resolveBusinessRecordSourceRecord([], 'PO260424001'), null)
})
