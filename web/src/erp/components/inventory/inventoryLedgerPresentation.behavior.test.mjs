import assert from 'node:assert/strict'
import test from 'node:test'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('inventory trace uses the resolved source and does not invent a link or number for missing sources', async (t) => {
  await businessFormHarness(t)
  const { canOpenSourceDocument, createInventoryLedgerColumns, VIEW_TXNS } = await import('./inventoryLedgerPresentation.jsx')
  const missing = { source_type: 'PURCHASE_RECEIPT', source_id: 51, document_no: 'UNRELATED-51' }
  assert.equal(canOpenSourceDocument(missing), false)
  const resolved = { source_type: 'PURCHASE_RETURN', source_id: 9, source_no: 'RETURN-9', source_document_type: 'PURCHASE_RECEIPT', source_document_id: 51 }
  assert.equal(canOpenSourceDocument(resolved), true)
  assert.equal(canOpenSourceDocument({ ...resolved, source_document_id: 0 }), false)
  const column = createInventoryLedgerColumns({ activeView: VIEW_TXNS }).find((item) => item.key === 'source_document')
  assert.equal(column.render(null, resolved), 'RETURN-9')
  assert.equal(column.exportValue(resolved), 'RETURN-9')
  assert.equal(column.copyable.resolveValue(null, resolved), 'RETURN-9')
  assert.equal(column.render(null, missing), '未提供业务单号')
  assert.equal(column.exportValue(missing), '')
  assert.equal(column.copyable.resolveValue(null, missing), '')
})
