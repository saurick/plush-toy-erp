import assert from 'node:assert/strict';
import test from 'node:test';
import { checkEngineeringLedger, engineeringLedgerSQL, pressureOrderIDs } from './pressure-engineering-ledger.mjs';

test('batch selection rejects empty, duplicate, fractional and injection identities before SQL', () => {
  for (const ids of [[], [0], [1, 1], [1.5], ['1);DELETE FROM sales_orders;--']])
    assert.throws(() => pressureOrderIDs(ids.map((id) => ({ id }))));
  const sql = engineeringLedgerSQL([{ id: 17 }, { id: 42 }]);
  assert.match(sql, /sales_order_id IN \(17,42\)/u);
  assert.match(sql, /to_jsonb\(x\)/u);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER)\b/u);
});
test('historical records are excluded from flow counts but a content change or foreign insertion fails the run', () => {
  const before = { orders: 42, requests: 0, inventoryTxns: 0, productionFacts: 2000, financeFacts: 2000, postedReceipts: 0,
    backgroundFingerprint: 'a'.repeat(64), background: { requests: { count: 16 }, purchaseOrders: { count: 16 } } };
  const after = { ...before, requests: 42, approvedRequests: 42, demandItems: 126, purchaseOrders: 84, purchaseItems: 126,
    duplicateSupplierResults: 0, partialSupplierResults: 0, invalidPurchaseLines: 0 };
  assert.deepEqual(checkEngineeringLedger(before, after, 42, 42), { consistency: true, backgroundUnchanged: true });
  for (const change of [
    { backgroundFingerprint: 'b'.repeat(64) }, { requests: 58 }, { purchaseOrders: 83 }, { purchaseItems: 127 },
    { orders: 41 }, { invalidPurchaseLines: 1 }, { duplicateSupplierResults: 1 }, { partialSupplierResults: 1 }, { inventoryTxns: 1 },
  ]) assert.equal(checkEngineeringLedger(before, { ...after, ...change }, 42, 42).consistency, false);
  assert.equal(checkEngineeringLedger(before, undefined, 42, 42).consistency, false);
});
