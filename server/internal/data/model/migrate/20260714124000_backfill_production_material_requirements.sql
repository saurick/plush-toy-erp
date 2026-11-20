-- Backfill release-time material requirements only when the historical BOM
-- reference is fully deterministic. Orders with a missing/mismatched header,
-- version, BOM line, material, or unit intentionally remain without snapshots;
-- the runtime projection reports those orders as NEEDS_REVIEW and blocks issue.
WITH eligible_orders AS (
  SELECT po.id
  FROM production_orders AS po
  WHERE po.status IN ('RELEASED', 'CLOSED')
    AND po.released_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM production_order_items AS poi
      WHERE poi.production_order_id = po.id
        AND poi.bom_header_id IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM production_order_items AS poi
      LEFT JOIN bom_headers AS bh
        ON bh.id = poi.bom_header_id
       AND bh.product_id = poi.product_id
       AND bh.version = poi.bom_version_snapshot
      WHERE poi.production_order_id = po.id
        AND poi.bom_header_id IS NOT NULL
        AND (
          bh.id IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM bom_items AS bi
            WHERE bi.bom_header_id = poi.bom_header_id
          )
          OR EXISTS (
            SELECT 1
            FROM bom_items AS bi
            LEFT JOIN materials AS m ON m.id = bi.material_id
            LEFT JOIN units AS u ON u.id = bi.unit_id
            WHERE bi.bom_header_id = poi.bom_header_id
              AND (
                m.id IS NULL
                OR u.id IS NULL
                OR bi.quantity <= 0
                OR bi.loss_rate < 0
              )
          )
        )
    )
)
INSERT INTO production_order_material_requirements (
  unit_quantity_snapshot,
  loss_rate_snapshot,
  planned_quantity,
  material_code_snapshot,
  material_name_snapshot,
  unit_code_snapshot,
  unit_name_snapshot,
  created_at,
  updated_at,
  bom_header_id,
  bom_item_id,
  material_id,
  production_order_id,
  production_order_item_id,
  unit_id
)
SELECT
  bi.quantity,
  bi.loss_rate,
  ROUND(poi.planned_quantity * bi.quantity * (1 + bi.loss_rate), 6),
  m.code,
  m.name,
  u.code,
  u.name,
  po.released_at,
  po.released_at,
  bh.id,
  bi.id,
  m.id,
  po.id,
  poi.id,
  u.id
FROM eligible_orders AS eo
JOIN production_orders AS po ON po.id = eo.id
JOIN production_order_items AS poi
  ON poi.production_order_id = po.id
 AND poi.bom_header_id IS NOT NULL
JOIN bom_headers AS bh
  ON bh.id = poi.bom_header_id
 AND bh.product_id = poi.product_id
 AND bh.version = poi.bom_version_snapshot
JOIN bom_items AS bi ON bi.bom_header_id = bh.id
JOIN materials AS m ON m.id = bi.material_id
JOIN units AS u ON u.id = bi.unit_id
ON CONFLICT (production_order_item_id, bom_item_id) DO NOTHING;
