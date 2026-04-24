import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildLinkedNavigationQuery,
  getLinkedTargets,
  matchesLinkedRecord,
  parseLinkedNavigationQuery,
} from './linkedNavigation.mjs'

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
