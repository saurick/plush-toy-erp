import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { resolvePsqlBin } from './manual-acceptance-capacity-pressure.mjs';
import { assertDisposableDatabaseTarget } from './database-target.mjs';

const execFileAsync = promisify(execFile);
export function pressureOrderIDs(orders) {
  if (!Array.isArray(orders) || !orders.length || orders.length > 1000 ||
      orders.some(({ id }) => !Number.isSafeInteger(id) || id < 1) || new Set(orders.map(({ id }) => id)).size !== orders.length)
    throw new Error('pressure order IDs must be unique positive integers');
  return orders.map(({ id }) => id).join(',');
}

export function engineeringLedgerSQL(orders) {
  const ids = pressureOrderIDs(orders);
  // The complement catches unexpected inserts outside the working pool too.
  // Full row hashes protect quantities, statuses and frozen sources, not just counts.
  const background = {
    salesOrders: `SELECT * FROM sales_orders WHERE id NOT IN (${ids})`,
    salesItems: `SELECT * FROM sales_order_items WHERE sales_order_id NOT IN (${ids})`,
    requests: 'SELECT * FROM engineering_material_requests WHERE id NOT IN (SELECT id FROM batch_requests)',
    demandItems: 'SELECT * FROM engineering_material_request_items WHERE request_id NOT IN (SELECT id FROM batch_requests)',
    purchaseOrders: 'SELECT * FROM purchase_orders WHERE id NOT IN (SELECT id FROM batch_purchases)',
    purchaseItems: 'SELECT * FROM purchase_order_items WHERE purchase_order_id NOT IN (SELECT id FROM batch_purchases)',
    inventoryTxns: 'SELECT * FROM inventory_txns',
    productionFacts: 'SELECT * FROM production_facts',
    financeFacts: 'SELECT * FROM finance_facts',
    receipts: 'SELECT * FROM purchase_receipts',
  };
  const snapshots = Object.entries(background).map(([key, query]) =>
    `'${key}',(SELECT json_build_object('count',count(*),'digest',md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id),''))) FROM (${query}) x)`);
  return `WITH batch_requests AS (SELECT * FROM engineering_material_requests WHERE sales_order_id IN (${ids})),
    batch_purchases AS (SELECT p.* FROM purchase_orders p JOIN batch_requests r ON r.id=p.engineering_material_request_id)
    SELECT json_build_object(
      'orders',(SELECT count(*) FROM sales_orders WHERE id IN (${ids})),
      'requests',(SELECT count(*) FROM batch_requests),
      'approvedRequests',(SELECT count(*) FROM batch_requests WHERE status='APPROVED'),
      'demandItems',(SELECT count(*) FROM engineering_material_request_items WHERE request_id IN (SELECT id FROM batch_requests)),
      'purchaseOrders',(SELECT count(*) FROM batch_purchases),
      'purchaseItems',(SELECT count(*) FROM purchase_order_items WHERE purchase_order_id IN (SELECT id FROM batch_purchases)),
      'duplicateSupplierResults',(SELECT count(*) FROM (SELECT engineering_material_request_id,supplier_id FROM batch_purchases GROUP BY engineering_material_request_id,supplier_id HAVING count(*)<>1) x),
      'partialSupplierResults',(SELECT count(*) FROM batch_requests r WHERE
        (r.status<>'APPROVED' AND EXISTS(SELECT 1 FROM batch_purchases p WHERE p.engineering_material_request_id=r.id)) OR
        (r.status='APPROVED' AND (SELECT count(*) FROM batch_purchases p WHERE p.engineering_material_request_id=r.id)<>
          (SELECT count(DISTINCT supplier_id) FROM engineering_material_request_items i WHERE i.request_id=r.id))),
      'invalidPurchaseLines',(SELECT count(*) FROM purchase_order_items i JOIN batch_purchases p ON p.id=i.purchase_order_id
        WHERE i.unit_price IS NOT NULL OR i.amount IS NOT NULL OR i.expected_arrival_date IS NOT NULL OR NOT EXISTS(
          SELECT 1 FROM engineering_material_request_items d WHERE d.request_id=p.engineering_material_request_id
          AND d.material_id=i.material_id AND d.unit_id=i.unit_id AND d.supplier_id=p.supplier_id AND d.required_quantity=i.purchased_quantity)),
      'inventoryTxns',(SELECT count(*) FROM inventory_txns),
      'productionFacts',(SELECT count(*) FROM production_facts),
      'financeFacts',(SELECT count(*) FROM finance_facts),
      'postedReceipts',(SELECT count(*) FROM purchase_receipts WHERE status='POSTED'),
      'background',json_build_object(${snapshots.join(',')}),
      'storage',json_build_object('databaseBytes',pg_database_size(current_database()),
        'businessTableBytes',(SELECT coalesce(sum(pg_total_relation_size(relid)),0) FROM pg_stat_user_tables
          WHERE relname IN ('sales_orders','sales_order_items','engineering_material_requests','engineering_material_request_items','purchase_orders','purchase_order_items'))))`;
}
export async function readEngineeringPressureLedger(databaseURL, orders) {
  const databaseName = new URL(databaseURL).pathname.slice(1);
  assertDisposableDatabaseTarget({ databaseURL, databaseName, profile: 'capacity' });
  const { stdout } = await execFileAsync(resolvePsqlBin(), [databaseURL, '-X', '-Atq', '-v', 'ON_ERROR_STOP=1', '-c', engineeringLedgerSQL(orders)],
    { timeout: 30000, maxBuffer: 1048576 });
  const result = JSON.parse(stdout.trim());
  result.backgroundFingerprint = createHash('sha256').update(JSON.stringify(result.background)).digest('hex');
  return result;
}
export function checkEngineeringLedger(before, after, expectedFlows, poolSize) {
  const backgroundUnchanged = Boolean(before?.backgroundFingerprint && after?.backgroundFingerprint === before.backgroundFingerprint);
  const consistency = Boolean(backgroundUnchanged && before.orders === poolSize && after.orders === poolSize && before.requests === 0 &&
    after.requests === expectedFlows && after.approvedRequests === expectedFlows && after.demandItems === expectedFlows * 3 &&
    after.purchaseOrders === expectedFlows * 2 && after.purchaseItems === expectedFlows * 3 &&
    ['duplicateSupplierResults', 'partialSupplierResults', 'invalidPurchaseLines'].every((key) => after[key] === 0) &&
    ['inventoryTxns', 'productionFacts', 'financeFacts', 'postedReceipts'].every((key) => after[key] === before[key]));
  return { consistency, backgroundUnchanged };
}
