import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatWorkflowRelatedDocumentRef,
  isInternalSourceNoFallback,
  resolveReadableWorkflowSourceNo,
} from './workflowDocumentRefs.mjs'

test('workflowDocumentRefs: 识别内部 ID 式来源号 fallback', () => {
  assert.equal(isInternalSourceNoFallback('66', 66), true)
  assert.equal(isInternalSourceNoFallback('#66', 66), true)
  assert.equal(isInternalSourceNoFallback('ID-66', 66), true)
  assert.equal(isInternalSourceNoFallback('TASK-66', 66), true)
  assert.equal(isInternalSourceNoFallback('PO-66', 66), false)
})

test('workflowDocumentRefs: source_no 等于内部 ID 时不当业务编号展示', () => {
  assert.equal(
    resolveReadableWorkflowSourceNo({
      id: 66,
      document_no: '',
      source_no: '66',
      title: '',
    }),
    ''
  )
  assert.equal(
    resolveReadableWorkflowSourceNo({
      id: 66,
      document_no: '',
      source_no: 'PO-66',
      title: '',
    }),
    'PO-66'
  )
})

test('workflowDocumentRefs: related documents 用已关联替代内部 ID', () => {
  assert.equal(
    formatWorkflowRelatedDocumentRef('到货记录', { id: 66 }, '66'),
    '到货记录已关联'
  )
  assert.equal(
    formatWorkflowRelatedDocumentRef('到货记录', { id: 66 }, 'PUR-ARR-001'),
    '到货记录：PUR-ARR-001'
  )
  assert.equal(formatWorkflowRelatedDocumentRef('到货记录', { id: 66 }, ''), '')
})
