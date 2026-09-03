import assert from 'node:assert/strict'
import test from 'node:test'

import {
  businessTableCopyColumnKey,
  normalizeBusinessTableCopyText,
  resolveBusinessTableCopyLabel,
  resolveBusinessTableCopyText,
} from './businessTableCopy.mjs'

test('table copy text keeps useful scalar and multi-value content', () => {
  assert.equal(normalizeBusinessTableCopyText('  SO-001  '), 'SO-001')
  assert.equal(normalizeBusinessTableCopyText(0), '0')
  assert.equal(
    normalizeBusinessTableCopyText([' LOT-001 ', '', 'LOT-002']),
    'LOT-001\nLOT-002'
  )
})

test('table copy text rejects objects and visible empty placeholders', () => {
  assert.equal(normalizeBusinessTableCopyText({ code: 'SO-001' }), '')
  assert.equal(normalizeBusinessTableCopyText('-'), '')
  assert.equal(normalizeBusinessTableCopyText('—'), '')
  assert.equal(normalizeBusinessTableCopyText('任务已关联'), '')
})

test('table copy config can resolve snapshot and nested-path values', () => {
  const record = {
    customer_snapshot: { name: '示例客户' },
    supplier_snapshot: { contact: { phone: '13800000000' } },
  }
  assert.equal(
    resolveBusinessTableCopyText(
      {
        copyable: {
          resolveValue: (_value, current) => current.customer_snapshot.name,
        },
      },
      record.customer_snapshot,
      record
    ),
    '示例客户'
  )
  assert.equal(
    resolveBusinessTableCopyText(
      { copyable: { dataIndex: 'supplier_snapshot.contact.phone' } },
      undefined,
      record
    ),
    '13800000000'
  )
})

test('table copy metadata stays business-readable', () => {
  assert.equal(
    resolveBusinessTableCopyLabel({
      title: { type: 'header-menu' },
      exportTitle: '采购单号',
      copyable: true,
    }),
    '采购单号'
  )
  assert.equal(
    resolveBusinessTableCopyLabel({
      title: { type: 'header-menu' },
      copyable: { label: '物流单号' },
    }),
    '物流单号'
  )
  assert.equal(
    businessTableCopyColumnKey({ dataIndex: ['primary_contact', 'mobile'] }),
    'primary_contact.mobile'
  )
})
