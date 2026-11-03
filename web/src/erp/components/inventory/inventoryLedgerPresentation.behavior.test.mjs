import assert from 'node:assert/strict'
import test from 'node:test'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('inventory trace uses the resolved source and does not invent a link or number for missing sources', async (t) => {
  const ui = await businessFormHarness(t)
  const { canOpenSourceDocument, createInventoryLedgerColumns, VIEW_TXNS } = await import('./inventoryLedgerPresentation.jsx')
  const missing = { source_type: 'PURCHASE_RECEIPT', source_id: 51, document_no: 'UNRELATED-51' }
  assert.equal(canOpenSourceDocument(missing), false)
  const resolved = { source_type: 'PURCHASE_RETURN', source_id: 9, source_no: 'RETURN-9', source_document_type: 'PURCHASE_RECEIPT', source_document_id: 51 }
  assert.equal(canOpenSourceDocument(resolved), true)
  assert.equal(canOpenSourceDocument({ ...resolved, source_document_id: 0 }), false)
  const column = createInventoryLedgerColumns({ activeView: VIEW_TXNS }).find((item) => item.key === 'source_document')
  await ui.render(column.render(null, resolved))
  assert.match(document.body.textContent, /RETURN-9/u)
  assert.match(document.body.textContent, /采购退货/u)
  assert.doesNotMatch(document.body.textContent, /UNRELATED-51/u)
  assert.equal(column.exportValue(resolved), 'RETURN-9')
  assert.equal(column.copyable.resolveValue(null, resolved), 'RETURN-9')
  await ui.render(column.render(null, missing))
  assert.match(document.body.textContent, /未提供业务单号/u)
  assert.doesNotMatch(document.body.textContent, /UNRELATED-51|RETURN-9/u)
  assert.equal(column.exportValue(missing), '')
  assert.equal(column.copyable.resolveValue(null, missing), '')
})
