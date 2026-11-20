-- migration-risk: maintenance
-- affected-table: units, materials, products, product_skus, inventory_txns, inventory_balances
-- expected-lock: ACCESS EXCLUSIVE
-- preflight: scripts/qa/unit-normalization-preflight.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: true
-- Source aliases change identity and spelling only. No physical conversion or quantity rounding.
-- Unsupported active units, fractional counts, request conflicts and balance overflow block atomically.

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
), violations AS (
  SELECT 'sales_order_items.ordered_quantity' AS field, x.id FROM sales_order_items x JOIN unit_map m ON m.old_id=x.unit_id WHERE x.ordered_quantity <> trunc(x.ordered_quantity, m.precision)
  UNION ALL
  SELECT 'sales_order_items.pre_shipment_sample_quantity' AS field, x.id FROM sales_order_items x JOIN unit_map m ON m.old_id=x.unit_id WHERE x.pre_shipment_sample_quantity <> trunc(x.pre_shipment_sample_quantity, m.precision)
  UNION ALL
  SELECT 'purchase_order_items.purchased_quantity' AS field, x.id FROM purchase_order_items x JOIN unit_map m ON m.old_id=x.unit_id WHERE x.purchased_quantity <> trunc(x.purchased_quantity, m.precision)
  UNION ALL
  SELECT 'outsourcing_order_items.outsourcing_quantity' AS field, x.id FROM outsourcing_order_items x JOIN unit_map m ON m.old_id=x.unit_id WHERE x.outsourcing_quantity <> trunc(x.outsourcing_quantity, m.precision)
  UNION ALL
  SELECT 'production_order_items.planned_quantity' AS field, x.id FROM production_order_items x JOIN unit_map m ON m.old_id=x.unit_id WHERE x.planned_quantity <> trunc(x.planned_quantity, m.precision)
  UNION ALL
  SELECT 'purchase_receipt_items.quantity' AS field, x.id FROM purchase_receipt_items x JOIN unit_map m ON m.old_id=x.unit_id WHERE x.quantity <> trunc(x.quantity, m.precision)
  UNION ALL
  SELECT 'purchase_receipt_items.declared_quantity' AS field, x.id FROM purchase_receipt_items x JOIN unit_map m ON m.old_id=x.unit_id WHERE x.declared_quantity <> trunc(x.declared_quantity, m.precision)
  UNION ALL
  SELECT 'purchase_return_items.quantity' AS field, x.id FROM purchase_return_items x JOIN unit_map m ON m.old_id=x.unit_id WHERE x.quantity <> trunc(x.quantity, m.precision)
  UNION ALL
  SELECT 'purchase_receipt_adjustment_items.quantity' AS field, x.id FROM purchase_receipt_adjustment_items x JOIN unit_map m ON m.old_id=x.unit_id WHERE x.quantity <> trunc(x.quantity, m.precision)
  UNION ALL
  SELECT 'shipment_items.quantity' AS field, x.id FROM shipment_items x JOIN unit_map m ON m.old_id=x.unit_id WHERE x.quantity <> trunc(x.quantity, m.precision)
  UNION ALL
  SELECT 'production_facts.quantity' AS field, x.id FROM production_facts x JOIN unit_map m ON m.old_id=x.unit_id WHERE x.quantity <> trunc(x.quantity, m.precision)
  UNION ALL
  SELECT 'outsourcing_facts.quantity' AS field, x.id FROM outsourcing_facts x JOIN unit_map m ON m.old_id=x.unit_id WHERE x.quantity <> trunc(x.quantity, m.precision)
  UNION ALL
  SELECT 'inventory_txns.quantity' AS field, x.id FROM inventory_txns x JOIN unit_map m ON m.old_id=x.unit_id WHERE x.quantity <> trunc(x.quantity, m.precision)
  UNION ALL
  SELECT 'inventory_balances.quantity' AS field, x.id FROM inventory_balances x JOIN unit_map m ON m.old_id=x.unit_id WHERE x.quantity <> trunc(x.quantity, m.precision)
  UNION ALL
  SELECT 'inventory_operation_items.counted_quantity' AS field, x.id FROM inventory_operation_items x JOIN unit_map m ON m.old_id=x.unit_id WHERE x.counted_quantity <> trunc(x.counted_quantity, m.precision)
  UNION ALL
  SELECT 'inventory_operation_items.adjustment_quantity' AS field, x.id FROM inventory_operation_items x JOIN unit_map m ON m.old_id=x.unit_id WHERE x.adjustment_quantity <> trunc(x.adjustment_quantity, m.precision)
  UNION ALL
  SELECT 'inventory_operation_items.expected_quantity' AS field, x.id FROM inventory_operation_items x JOIN unit_map m ON m.old_id=x.unit_id WHERE x.expected_quantity <> trunc(x.expected_quantity, m.precision)
  UNION ALL
  SELECT 'stock_reservations.quantity' AS field, x.id FROM stock_reservations x JOIN unit_map m ON m.old_id=x.unit_id WHERE x.quantity <> trunc(x.quantity, m.precision)
  UNION ALL
  SELECT 'engineering_material_request_items.required_quantity' AS field, x.id FROM engineering_material_request_items x JOIN unit_map m ON m.old_id=x.unit_id WHERE x.required_quantity <> trunc(x.required_quantity, m.precision)
  UNION ALL
  SELECT 'production_order_material_requirements.planned_quantity' AS field, x.id FROM production_order_material_requirements x JOIN unit_map m ON m.old_id=x.unit_id WHERE x.planned_quantity <> trunc(x.planned_quantity, m.precision)
  UNION ALL
  SELECT 'production_wip_outsourcing_allocations.allocated_quantity' AS field, x.id FROM production_wip_outsourcing_allocations x JOIN unit_map m ON m.old_id=x.unit_id WHERE x.allocated_quantity <> trunc(x.allocated_quantity, m.precision)
  UNION ALL
  SELECT 'production_wip_batches.quantity' AS field, x.id FROM production_wip_batches x JOIN production_order_items o ON o.id=x.production_order_item_id JOIN unit_map m ON m.old_id=o.unit_id WHERE x.quantity <> trunc(x.quantity, m.precision)
  UNION ALL
  SELECT 'production_order_operations.planned_quantity' AS field, x.id FROM production_order_operations x JOIN production_order_items o ON o.id=x.production_order_item_id JOIN unit_map m ON m.old_id=o.unit_id WHERE x.planned_quantity <> trunc(x.planned_quantity, m.precision)
  UNION ALL
  SELECT 'production_wip_events.quantity' AS field, x.id FROM production_wip_events x JOIN production_wip_batches b ON b.id=x.production_wip_batch_id JOIN production_order_items o ON o.id=b.production_order_item_id JOIN unit_map m ON m.old_id=o.unit_id WHERE x.quantity <> trunc(x.quantity, m.precision)
  UNION ALL
  SELECT 'production_exception_decisions.requested_quantity' AS field, x.id FROM production_exception_decisions x JOIN production_order_items o ON o.id=x.production_order_item_id LEFT JOIN production_order_material_requirements r ON r.id=x.production_material_requirement_id JOIN unit_map m ON m.old_id=coalesce(r.unit_id,o.unit_id) WHERE x.requested_quantity <> trunc(x.requested_quantity, m.precision)
  UNION ALL
  SELECT 'production_exception_decisions.approved_quantity' AS field, x.id FROM production_exception_decisions x JOIN production_order_items o ON o.id=x.production_order_item_id LEFT JOIN production_order_material_requirements r ON r.id=x.production_material_requirement_id JOIN unit_map m ON m.old_id=coalesce(r.unit_id,o.unit_id) WHERE x.approved_quantity <> trunc(x.approved_quantity, m.precision)
  UNION ALL
  SELECT 'purchase_rejection_dispositions.quantity' AS field, x.id FROM purchase_rejection_dispositions x JOIN purchase_receipt_items r ON r.id=x.purchase_receipt_item_id JOIN unit_map m ON m.old_id=r.unit_id WHERE x.quantity <> trunc(x.quantity, m.precision)
  UNION ALL
  SELECT 'outsourcing_return_dispositions.quantity' AS field, x.id FROM outsourcing_return_dispositions x JOIN outsourcing_facts f ON f.id=x.outsourcing_return_fact_id JOIN unit_map m ON m.old_id=f.unit_id WHERE x.quantity <> trunc(x.quantity, m.precision)
  UNION ALL
  SELECT 'units.unsupported_active_name' AS field, id FROM named WHERE is_active AND canonical_code IS NULL
  UNION ALL
  SELECT 'units.precision' AS field, id FROM units WHERE precision NOT BETWEEN 0 AND 6
  UNION ALL
  SELECT 'units.code_conflict' AS field, n.id FROM named n JOIN standards s ON s.code=n.code WHERE n.canonical_code IS DISTINCT FROM s.code
  UNION ALL
  SELECT 'engineering_material_request_items.merge_conflict' AS field, min(x.id) FROM engineering_material_request_items x JOIN unit_map m ON m.old_id=x.unit_id GROUP BY x.request_id,x.material_id,m.target_id HAVING count(*)>1
  UNION ALL
  SELECT 'engineering_material_requests.frozen_unit_change' AS field, r.id FROM engineering_material_requests r JOIN engineering_material_request_items x ON x.request_id=r.id JOIN unit_map m ON m.old_id=x.unit_id JOIN units u ON u.id=m.old_id WHERE (r.status IN ('SUBMITTED','BOSS_APPROVED') AND (m.old_id<>m.target_id OR u.name<>m.name)) OR (r.status='APPROVED' AND m.old_id<>m.target_id)
  UNION ALL
  SELECT 'sales_order_items.confirmed_bom_unit_change' AS field, x.id FROM sales_order_items x JOIN sales_orders o ON o.id=x.sales_order_id JOIN bom_items b ON b.bom_header_id=x.sample_bom_id JOIN materials a ON a.id=b.material_id JOIN unit_map m ON m.old_id IN (b.unit_id,a.default_unit_id) WHERE x.engineering_status='CONFIRMED' AND o.lifecycle_status IN ('draft','submitted','active') AND m.old_id<>m.target_id
  UNION ALL
  SELECT 'inventory_balances.merge_overflow' AS field, min(x.id) FROM inventory_balances x JOIN unit_map m ON m.old_id=x.unit_id GROUP BY x.subject_type,x.subject_id,x.product_sku_id,x.warehouse_id,x.lot_id,m.target_id HAVING sum(x.quantity)>99999999999999.999999
)
SELECT CASE WHEN count(*)=0 THEN 0
  ELSE ('unit normalization blocked: ' || string_agg(field || '#' || id, ', ' ORDER BY field,id))::integer
END AS unit_normalization_preflight FROM violations;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
), ranked AS (
  SELECT x.id, min(x.id) OVER (PARTITION BY x.subject_type,x.subject_id,x.product_sku_id,x.warehouse_id,x.lot_id,m.target_id) AS survivor,
    sum(x.quantity) OVER (PARTITION BY x.subject_type,x.subject_id,x.product_sku_id,x.warehouse_id,x.lot_id,m.target_id) AS total_quantity
  FROM inventory_balances x JOIN unit_map m ON m.old_id=x.unit_id
), removed AS (
  DELETE FROM inventory_balances b USING ranked r WHERE b.id=r.id AND r.id<>r.survivor RETURNING b.id
)
UPDATE inventory_balances b SET quantity=r.total_quantity
FROM ranked r WHERE b.id=r.id AND r.id=r.survivor;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE sales_order_items x SET unit_id=m.target_id FROM unit_map m WHERE x.unit_id=m.old_id AND m.old_id<>m.target_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE purchase_order_items x SET unit_id=m.target_id FROM unit_map m WHERE x.unit_id=m.old_id AND m.old_id<>m.target_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE outsourcing_order_items x SET unit_id=m.target_id FROM unit_map m WHERE x.unit_id=m.old_id AND m.old_id<>m.target_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE production_order_items x SET unit_id=m.target_id FROM unit_map m WHERE x.unit_id=m.old_id AND m.old_id<>m.target_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE purchase_receipt_items x SET unit_id=m.target_id FROM unit_map m WHERE x.unit_id=m.old_id AND m.old_id<>m.target_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE purchase_return_items x SET unit_id=m.target_id FROM unit_map m WHERE x.unit_id=m.old_id AND m.old_id<>m.target_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE purchase_receipt_adjustment_items x SET unit_id=m.target_id FROM unit_map m WHERE x.unit_id=m.old_id AND m.old_id<>m.target_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE shipment_items x SET unit_id=m.target_id FROM unit_map m WHERE x.unit_id=m.old_id AND m.old_id<>m.target_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE production_facts x SET unit_id=m.target_id FROM unit_map m WHERE x.unit_id=m.old_id AND m.old_id<>m.target_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE outsourcing_facts x SET unit_id=m.target_id FROM unit_map m WHERE x.unit_id=m.old_id AND m.old_id<>m.target_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE inventory_txns x SET unit_id=m.target_id FROM unit_map m WHERE x.unit_id=m.old_id AND m.old_id<>m.target_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE inventory_balances x SET unit_id=m.target_id FROM unit_map m WHERE x.unit_id=m.old_id AND m.old_id<>m.target_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE inventory_operation_items x SET unit_id=m.target_id FROM unit_map m WHERE x.unit_id=m.old_id AND m.old_id<>m.target_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE stock_reservations x SET unit_id=m.target_id FROM unit_map m WHERE x.unit_id=m.old_id AND m.old_id<>m.target_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE engineering_material_request_items x SET unit_id=m.target_id FROM unit_map m WHERE x.unit_id=m.old_id AND m.old_id<>m.target_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE production_order_material_requirements x SET unit_id=m.target_id FROM unit_map m WHERE x.unit_id=m.old_id AND m.old_id<>m.target_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE production_wip_outsourcing_allocations x SET unit_id=m.target_id FROM unit_map m WHERE x.unit_id=m.old_id AND m.old_id<>m.target_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE bom_items x SET unit_id=m.target_id FROM unit_map m WHERE x.unit_id=m.old_id AND m.old_id<>m.target_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE materials x SET default_unit_id=m.target_id FROM unit_map m WHERE x.default_unit_id=m.old_id AND m.old_id<>m.target_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE products x SET default_unit_id=m.target_id FROM unit_map m WHERE x.default_unit_id=m.old_id AND m.old_id<>m.target_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE product_skus x SET default_unit_id=m.target_id FROM unit_map m WHERE x.default_unit_id=m.old_id AND m.old_id<>m.target_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE outsourcing_order_items x SET unit_name_snapshot=m.name FROM unit_map m WHERE x.unit_id=m.old_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE production_order_items x SET unit_name_snapshot=m.name FROM unit_map m WHERE x.unit_id=m.old_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE production_order_material_requirements x SET unit_name_snapshot=m.name, unit_code_snapshot=m.code FROM unit_map m WHERE x.unit_id=m.old_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE engineering_material_request_items x SET unit_name=m.name FROM unit_map m WHERE x.unit_id=m.old_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
),
kept AS (
  UPDATE units u SET is_active=m.any_active FROM unit_map m WHERE u.id=m.target_id RETURNING u.id
)
DELETE FROM units u USING unit_map m WHERE u.id=m.old_id AND m.old_id<>m.target_id;

WITH normalized AS (
  SELECT id, code, name, precision, is_active,
    trim(regexp_replace(name, '^核心演示单位[-－]\s*', '')) AS label
  FROM units
), named AS (
  SELECT *, CASE
    WHEN lower(label) IN ('pc','pcs','ea','件','个') THEN 'EA'
    WHEN label = '套' THEN 'SET' WHEN label = '对' THEN 'PAIR'
    WHEN label = '片' THEN 'SHEET' WHEN label = '条' THEN 'STRIP'
    WHEN label = '块' THEN 'BLOCK'
    WHEN lower(label) IN ('y','yd','码') THEN 'YD'
    WHEN lower(label) IN ('kg','千克','公斤') THEN 'KG'
  END AS canonical_code FROM normalized
), standards(code, name, precision) AS (VALUES
  ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0), ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)
), unit_map AS (
  SELECT n.id AS old_id,
    first_value(n.id) OVER (PARTITION BY s.code ORDER BY (n.code = s.code) DESC, n.id) AS target_id,
    s.code, s.name, s.precision,
    bool_or(n.is_active) OVER (PARTITION BY s.code) AS any_active
  FROM named n JOIN standards s ON s.code = n.canonical_code
)
UPDATE units u SET code=m.code, name=m.name, precision=m.precision, is_active=m.any_active, updated_at=now() FROM unit_map m WHERE u.id=m.old_id;

INSERT INTO units (code, name, precision, is_active, created_at, updated_at)
SELECT code, name, precision, true, now(), now()
FROM (VALUES ('EA','个',0), ('SET','套',0), ('PAIR','对',0), ('SHEET','片',0),
 ('STRIP','条',0), ('BLOCK','块',0), ('YD','码',6), ('KG','千克',3)) AS s(code,name,precision)
WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.code=s.code);
