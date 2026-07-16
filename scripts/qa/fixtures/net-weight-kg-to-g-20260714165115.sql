\set ON_ERROR_STOP on

BEGIN;

UPDATE products
SET unit_net_weight_kg = 0.425000
WHERE id = 910001;

INSERT INTO products (
  id,
  code,
  name,
  default_unit_id,
  unit_net_weight_kg,
  created_at,
  updated_at
) VALUES (
  910002,
  '__qa_populated_upgrade_product_null_weight__',
  'QA populated upgrade product without weight',
  910001,
  NULL,
  '2026-07-14 16:51:15+00',
  '2026-07-14 16:51:15+00'
);

INSERT INTO warehouses (
  id,
  code,
  name,
  type,
  created_at,
  updated_at
) VALUES (
  910001,
  '__qa_populated_upgrade_warehouse__',
  'QA populated upgrade warehouse',
  'MATERIAL',
  '2026-07-14 16:51:15+00',
  '2026-07-14 16:51:15+00'
);

INSERT INTO product_skus (
  id,
  sku_code,
  sku_name,
  product_id,
  default_unit_id,
  unit_net_weight_kg,
  created_at,
  updated_at
) VALUES
  (
    910001,
    '__qa_populated_upgrade_sku_weighted__',
    'QA populated upgrade weighted SKU',
    910001,
    910001,
    0.123456,
    '2026-07-14 16:51:15+00',
    '2026-07-14 16:51:15+00'
  ),
  (
    910002,
    '__qa_populated_upgrade_sku_null_weight__',
    'QA populated upgrade SKU without weight',
    910002,
    NULL,
    NULL,
    '2026-07-14 16:51:15+00',
    '2026-07-14 16:51:15+00'
  );

INSERT INTO shipments (
  id,
  shipment_no,
  status,
  idempotency_key,
  total_net_weight_kg,
  requested_total_net_weight_kg,
  created_at,
  updated_at
) VALUES
  (
    910001,
    '__qa_populated_upgrade_shipment_weighted__',
    'DRAFT',
    '__qa_populated_upgrade_shipment_weighted__',
    12.345600,
    11.111111,
    '2026-07-14 16:51:15+00',
    '2026-07-14 16:51:15+00'
  ),
  (
    910002,
    '__qa_populated_upgrade_shipment_null_weight__',
    'DRAFT',
    '__qa_populated_upgrade_shipment_null_weight__',
    NULL,
    NULL,
    '2026-07-14 16:51:15+00',
    '2026-07-14 16:51:15+00'
  );

INSERT INTO shipment_items (
  id,
  shipment_id,
  product_id,
  product_sku_id,
  warehouse_id,
  unit_id,
  quantity,
  unit_net_weight_kg_snapshot,
  created_at,
  updated_at
) VALUES
  (
    910001,
    910001,
    910001,
    910001,
    910001,
    910001,
    1,
    0.425000,
    '2026-07-14 16:51:15+00',
    '2026-07-14 16:51:15+00'
  ),
  (
    910002,
    910002,
    910002,
    910002,
    910001,
    910001,
    1,
    NULL,
    '2026-07-14 16:51:15+00',
    '2026-07-14 16:51:15+00'
  );

COMMIT;
