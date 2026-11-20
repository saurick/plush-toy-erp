-- Preserve the exact supplier identity only when all receipt lines resolve to one
-- purchase-order supplier. Manual or ambiguous historical receipts intentionally
-- stay NULL and are not eligible for automatic payable generation.
WITH receipt_suppliers AS (
  SELECT
    pri.receipt_id,
    MIN(po.supplier_id) AS supplier_id
  FROM purchase_receipt_items AS pri
  LEFT JOIN purchase_order_items AS poi ON poi.id = pri.purchase_order_item_id
  LEFT JOIN purchase_orders AS po ON po.id = poi.purchase_order_id
  GROUP BY pri.receipt_id
  HAVING COUNT(*) = COUNT(pri.purchase_order_item_id)
    AND COUNT(*) = COUNT(poi.id)
    AND COUNT(*) = COUNT(po.supplier_id)
    AND COUNT(DISTINCT po.supplier_id) = 1
)
UPDATE purchase_receipts AS pr
SET supplier_id = rs.supplier_id
FROM receipt_suppliers AS rs
WHERE pr.id = rs.receipt_id
  AND pr.supplier_id IS NULL;

-- Shipment finance snapshots are derived only from an explicit sales-order line.
-- Unlinked historical shipment lines stay NULL rather than guessing an amount.
UPDATE shipment_items AS si
SET
  unit_price_snapshot = COALESCE(
    si.unit_price_snapshot,
    soi.unit_price,
    soi.amount / NULLIF(soi.ordered_quantity, 0)
  ),
  amount_snapshot = COALESCE(
    si.amount_snapshot,
    soi.amount * si.quantity / NULLIF(soi.ordered_quantity, 0),
    soi.unit_price * si.quantity
  )
FROM sales_order_items AS soi, shipments AS s
WHERE soi.id = si.sales_order_item_id
  AND s.id = si.shipment_id
  AND s.sales_order_id = soi.sales_order_id
  AND si.product_id = soi.product_id
  AND si.product_sku_id IS NOT DISTINCT FROM soi.product_sku_id
  AND si.unit_id = soi.unit_id
  AND (si.unit_price_snapshot IS NULL OR si.amount_snapshot IS NULL);
