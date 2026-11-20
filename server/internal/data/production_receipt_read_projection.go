package data

// Apply posted rework, signed inventory dispositions and accepted packing to
// the selected receipt facts. Inventory and warehouse reads share this grain.
const productionReceiptReadinessCTEs = `, packed AS (
 SELECT b.finished_goods_receipt_id AS receipt_id,
 SUM(CASE WHEN b.status='ACCEPTED' THEN b.quantity ELSE 0 END) AS quantity,
 MIN(CASE WHEN b.status='IN_PROGRESS' THEN b.id END) AS running_id,
 MIN(CASE WHEN b.status='PLANNED' AND b.execution_mode IS NULL THEN b.id END) AS unassigned_id,
 MIN(CASE WHEN b.status='PLANNED' THEN b.id END) AS planned_id
 FROM production_wip_batches b JOIN production_order_operations op ON op.id=b.production_order_operation_id
 JOIN receipts f ON f.id=b.finished_goods_receipt_id
 WHERE op.operation_code='PACKAGING' AND b.status NOT IN ('CANCELLED','SPLIT') GROUP BY b.finished_goods_receipt_id
 ), reworked AS (
 SELECT f.source_id AS receipt_id,SUM(f.quantity) AS quantity FROM production_facts f JOIN receipts r ON r.id=f.source_id
 WHERE f.fact_type='REWORK' AND f.source_type='PRODUCTION_FACT' AND f.status='POSTED' GROUP BY f.source_id
 ), disposed AS (
 SELECT t.source_line_id AS receipt_id,SUM(t.quantity*t.direction) AS signed_quantity FROM inventory_txns t
 JOIN receipts r ON r.id=t.source_line_id WHERE t.source_type='PRODUCTION_EXCEPTION' GROUP BY t.source_line_id
 ), remaining AS (
 SELECT f.*,CASE WHEN f.quantity-COALESCE(r.quantity,0)+COALESCE(d.signed_quantity,0)>0
 THEN f.quantity-COALESCE(r.quantity,0)+COALESCE(d.signed_quantity,0) ELSE 0 END AS remaining_quantity
 FROM receipts f LEFT JOIN reworked r ON r.receipt_id=f.id LEFT JOIN disposed d ON d.receipt_id=f.id
 ), receipt_readiness AS (
 SELECT f.*,b.status AS batch_status,b.id AS source_batch_id,
 CASE WHEN b.id IS NULL OR op.id IS NULL THEN 1 ELSE 0 END AS invalid_source,
 pk.running_id,pk.unassigned_id,pk.planned_id,
 CASE WHEN f.status<>'POSTED' OR (op.operation_code='PACKAGING' AND b.status='ACCEPTED') THEN 0
 WHEN b.status IS NULL OR b.status<>'ACCEPTED' THEN f.remaining_quantity ELSE 0 END AS inspection_quantity,
 CASE WHEN f.status='POSTED' AND b.status='ACCEPTED' AND op.operation_code<>'PACKAGING' AND f.remaining_quantity>COALESCE(pk.quantity,0)
 THEN f.remaining_quantity-COALESCE(pk.quantity,0) ELSE 0 END AS packaging_quantity
 FROM remaining f LEFT JOIN production_wip_batches b ON b.id=f.production_wip_batch_id
 LEFT JOIN production_order_operations op ON op.id=b.production_order_operation_id
 LEFT JOIN packed pk ON pk.receipt_id=f.id
 )`
