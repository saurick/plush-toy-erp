\if :{?plush_snapshot}
WITH synthetic_rows AS (
  SELECT 'unit:' || id::text AS row_key, to_jsonb(row_data) AS payload
    FROM units AS row_data
   WHERE id = 910001
  UNION ALL
  SELECT 'product:' || id::text, to_jsonb(row_data)
    FROM products AS row_data
   WHERE id = 910001
  UNION ALL
  SELECT 'bom:' || id::text, to_jsonb(row_data)
    FROM bom_headers AS row_data
   WHERE id = 910001
  UNION ALL
  SELECT 'finance:' || id::text, to_jsonb(row_data)
    FROM finance_facts AS row_data
   WHERE id = 910001
  UNION ALL
  SELECT 'role:' || id::text, to_jsonb(row_data)
    FROM roles AS row_data
   WHERE id IN (910001, 910002, 910003)
  UNION ALL
  SELECT 'process:' || id::text, to_jsonb(row_data)
    FROM process_instances AS row_data
   WHERE id IN (910001, 910002)
  UNION ALL
  SELECT 'node:' || id::text, to_jsonb(row_data)
    FROM process_node_instances AS row_data
   WHERE id IN (910001, 910002)
  UNION ALL
  SELECT 'workflow-state:' || id::text, to_jsonb(row_data)
    FROM workflow_business_states AS row_data
   WHERE id = 910001
  UNION ALL
  SELECT 'workflow-task:' || id::text, to_jsonb(row_data)
    FROM workflow_tasks AS row_data
   WHERE id = 910001
)
SELECT count(*)::text || ':' || md5(string_agg(row_key || ':' || payload::text, E'\n' ORDER BY row_key))
  FROM synthetic_rows;
\endif

\if :{?plush_net_weight_kg}
SELECT weighted_product.unit_net_weight_kg::text
       || '|' || weighted_sku.unit_net_weight_kg::text
       || '|' || weighted_shipment.total_net_weight_kg::text
       || '|' || weighted_shipment.requested_total_net_weight_kg::text
       || '|' || weighted_item.unit_net_weight_kg_snapshot::text
       || '|' || (
         (null_product.unit_net_weight_kg IS NULL)::int
         + (null_sku.unit_net_weight_kg IS NULL)::int
         + (null_shipment.total_net_weight_kg IS NULL)::int
         + (null_shipment.requested_total_net_weight_kg IS NULL)::int
         + (null_item.unit_net_weight_kg_snapshot IS NULL)::int
       )::text
  FROM products AS weighted_product,
       products AS null_product,
       product_skus AS weighted_sku,
       product_skus AS null_sku,
       shipments AS weighted_shipment,
       shipments AS null_shipment,
       shipment_items AS weighted_item,
       shipment_items AS null_item
 WHERE weighted_product.id = 910001
   AND null_product.id = 910002
   AND weighted_sku.id = 910001
   AND null_sku.id = 910002
   AND weighted_shipment.id = 910001
   AND null_shipment.id = 910002
   AND weighted_item.id = 910001
   AND null_item.id = 910002;
\endif

\if :{?plush_net_weight_g}
SELECT weighted_product.unit_net_weight_g::text
       || '|' || weighted_sku.unit_net_weight_g::text
       || '|' || weighted_shipment.total_net_weight_g::text
       || '|' || weighted_shipment.requested_total_net_weight_g::text
       || '|' || weighted_item.unit_net_weight_g_snapshot::text
       || '|' || (
         (null_product.unit_net_weight_g IS NULL)::int
         + (null_sku.unit_net_weight_g IS NULL)::int
         + (null_shipment.total_net_weight_g IS NULL)::int
         + (null_shipment.requested_total_net_weight_g IS NULL)::int
         + (null_item.unit_net_weight_g_snapshot IS NULL)::int
       )::text
  FROM products AS weighted_product,
       products AS null_product,
       product_skus AS weighted_sku,
       product_skus AS null_sku,
       shipments AS weighted_shipment,
       shipments AS null_shipment,
       shipment_items AS weighted_item,
       shipment_items AS null_item
 WHERE weighted_product.id = 910001
   AND null_product.id = 910002
   AND weighted_sku.id = 910001
   AND null_sku.id = 910002
   AND weighted_shipment.id = 910001
   AND null_shipment.id = 910002
   AND weighted_item.id = 910001
   AND null_item.id = 910002;
\endif

\if :{?plush_net_weight_g_columns}
WITH expected(table_name, column_name) AS (
  VALUES
    ('products', 'unit_net_weight_g'),
    ('product_skus', 'unit_net_weight_g'),
    ('shipments', 'total_net_weight_g'),
    ('shipments', 'requested_total_net_weight_g'),
    ('shipment_items', 'unit_net_weight_g_snapshot')
), old_columns(table_name, column_name) AS (
  VALUES
    ('products', 'unit_net_weight_kg'),
    ('product_skus', 'unit_net_weight_kg'),
    ('shipments', 'total_net_weight_kg'),
    ('shipments', 'requested_total_net_weight_kg'),
    ('shipment_items', 'unit_net_weight_kg_snapshot')
)
SELECT count(actual.column_name)::text
       || '|' || count(*) FILTER (
         WHERE actual.data_type = 'numeric'
           AND actual.numeric_precision = 20
           AND actual.numeric_scale = 6
           AND actual.is_nullable = 'YES'
       )::text
       || '|' || (
         SELECT count(*)
           FROM information_schema.columns AS actual_old
           JOIN old_columns
             ON old_columns.table_name = actual_old.table_name
            AND old_columns.column_name = actual_old.column_name
          WHERE actual_old.table_schema = 'public'
       )::text
  FROM expected
  LEFT JOIN information_schema.columns AS actual
    ON actual.table_schema = 'public'
   AND actual.table_name = expected.table_name
   AND actual.column_name = expected.column_name;
\endif

\if :{?plush_net_weight_g_constraints}
WITH expected(name) AS (
  VALUES
    ('products_unit_net_weight_g_positive'),
    ('product_skus_unit_net_weight_g_positive'),
    ('product_skus_unit_net_weight_g_requires_default_unit'),
    ('shipments_total_net_weight_g_positive'),
    ('shipments_requested_total_net_weight_g_positive'),
    ('shipment_items_unit_net_weight_g_snapshot_positive')
), old(name) AS (
  VALUES
    ('products_unit_net_weight_kg_positive'),
    ('product_skus_unit_net_weight_kg_positive'),
    ('product_skus_unit_net_weight_kg_requires_default_unit'),
    ('shipments_total_net_weight_kg_positive'),
    ('shipments_requested_total_net_weight_kg_positive'),
    ('shipment_items_unit_net_weight_kg_snapshot_positive')
)
SELECT (SELECT count(*) FROM pg_constraint JOIN expected ON expected.name = pg_constraint.conname)::text
       || '|' || (SELECT count(*) FROM pg_constraint JOIN old ON old.name = pg_constraint.conname)::text;
\endif

\if :{?plush_net_weight_g_rejections}
DO $$
DECLARE
  rejection_count integer := 0;
BEGIN
  BEGIN
    UPDATE products SET unit_net_weight_g = 0 WHERE id = 910001;
  EXCEPTION WHEN check_violation THEN
    rejection_count := rejection_count + 1;
  END;
  BEGIN
    UPDATE product_skus SET unit_net_weight_g = 0 WHERE id = 910001;
  EXCEPTION WHEN check_violation THEN
    rejection_count := rejection_count + 1;
  END;
  BEGIN
    UPDATE product_skus SET unit_net_weight_g = 1 WHERE id = 910002;
  EXCEPTION WHEN check_violation THEN
    rejection_count := rejection_count + 1;
  END;
  BEGIN
    UPDATE shipments SET total_net_weight_g = 0 WHERE id = 910001;
  EXCEPTION WHEN check_violation THEN
    rejection_count := rejection_count + 1;
  END;
  BEGIN
    UPDATE shipments SET requested_total_net_weight_g = 0 WHERE id = 910001;
  EXCEPTION WHEN check_violation THEN
    rejection_count := rejection_count + 1;
  END;
  BEGIN
    UPDATE shipment_items SET unit_net_weight_g_snapshot = 0 WHERE id = 910001;
  EXCEPTION WHEN check_violation THEN
    rejection_count := rejection_count + 1;
  END;
  IF rejection_count <> 6 THEN
    RAISE EXCEPTION 'expected 6 net-weight constraint rejections, got %', rejection_count;
  END IF;
END
$$;
\endif

\if :{?plush_customer_config_cutover_cleanup}
BEGIN;
UPDATE workflow_tasks
   SET process_instance_id = NULL,
       process_node_instance_id = NULL
 WHERE id = 910001;
DELETE FROM process_node_instances WHERE id IN (910001, 910002);
DELETE FROM process_instances WHERE id IN (910001, 910002);
COMMIT;
\endif

\if :{?plush_legacy_dashboard_seed}
INSERT INTO roles (id, role_key, name, description, builtin, role_type, version, created_at, updated_at)
VALUES
  (910004, 'boss', 'QA legacy dashboard boss', '', true, 'business_default', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (910005, 'pmc', 'QA legacy dashboard PMC', '', true, 'business_default', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (910006, 'warehouse', 'QA legacy warehouse', '', true, 'business_default', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO permissions (id, permission_key, name, description, module, action, resource, builtin, created_at, updated_at)
VALUES
  (910001, 'erp.dashboard.read', 'QA legacy shared dashboard', '', 'erp', 'read', 'dashboard', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (910002, 'process_runtime.recover', 'QA legacy process recovery', '', 'process_runtime', 'recover', 'domain_command', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (910003, 'production.fact.read', 'QA production fact read', '', 'production', 'read', 'fact', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (910004, 'production.wip.read', 'QA production WIP read', '', 'production', 'read', 'wip', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO role_permissions (role_id, permission_id, created_at)
VALUES
  (910003, 910001, CURRENT_TIMESTAMP),
  (910004, 910001, CURRENT_TIMESTAMP),
  (910005, 910001, CURRENT_TIMESTAMP),
  (910001, 910002, CURRENT_TIMESTAMP),
  (910002, 910002, CURRENT_TIMESTAMP),
  (910003, 910002, CURRENT_TIMESTAMP),
  (910004, 910002, CURRENT_TIMESTAMP),
  (910005, 910002, CURRENT_TIMESTAMP);
\endif
