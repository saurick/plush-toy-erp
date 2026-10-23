-- migration-risk: maintenance
-- affected-table: shipments
-- expected-lock: ROW EXCLUSIVE
-- preflight: scripts/qa/business-consistency-upgrade-preflight.sql
-- recovery: restore-reviewed-pre-migration-backup-and-previous-runtime
-- maintenance-required: true

-- Backfill only provable frozen commercial inputs. Unknown purchase master values
-- and incomplete historical order terms remain NULL; posted finance facts never change.
DO $commercial_snapshot_guard$
DECLARE blockers bigint;
BEGIN
WITH batch_goods AS (
  SELECT s.id, s.sales_order_id, s.shipped_at, o.currency, o.tax_mode,
    o.goods_amount, o.tax_amount, o.order_total, o.freight_terms,
    CASE WHEN o.freight_terms = 'INCLUDED' THEN 0 ELSE o.quoted_freight_amount END AS quoted_freight,
    sum(i.amount_snapshot) AS batch_goods,
    bool_and(i.amount_snapshot IS NOT NULL AND i.amount_snapshot > 0
      AND i.currency_snapshot = o.currency AND i.sales_order_item_id IS NOT NULL) AS valid
  FROM shipments s JOIN sales_orders o ON o.id = s.sales_order_id
  LEFT JOIN shipment_items i ON i.shipment_id = s.id
  WHERE s.status = 'SHIPPED'
  GROUP BY s.id, o.id
), eligible AS (
  SELECT b.* FROM batch_goods b
  WHERE b.valid AND b.goods_amount > 0 AND b.tax_amount >= 0 AND b.quoted_freight >= 0
    AND b.tax_mode IN ('NONE', 'EXCLUSIVE', 'INCLUSIVE')
    AND b.freight_terms IN ('INCLUDED', 'EXCLUDED')
    AND (b.tax_mode <> 'NONE' OR b.tax_amount = 0)
    AND b.order_total = b.goods_amount + b.quoted_freight + CASE WHEN b.tax_mode = 'EXCLUSIVE' THEN b.tax_amount ELSE 0 END
    AND NOT EXISTS (SELECT 1 FROM batch_goods bad WHERE bad.sales_order_id = b.sales_order_id AND NOT bad.valid)
), apportioned AS (
  SELECT e.*, sum(batch_goods) OVER (PARTITION BY sales_order_id ORDER BY shipped_at, id) AS cumulative_goods,
    sum(batch_goods) OVER (PARTITION BY sales_order_id) AS all_goods,
    round(quoted_freight * batch_goods / goods_amount, 6) AS freight_share,
    round(tax_amount * batch_goods / goods_amount, 6) AS tax_share
  FROM eligible e
), prior AS (
  SELECT a.*,
    coalesce(sum(freight_share) OVER (PARTITION BY sales_order_id ORDER BY shipped_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS prior_freight,
    coalesce(sum(tax_share) OVER (PARTITION BY sales_order_id ORDER BY shipped_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS prior_tax
  FROM apportioned a WHERE all_goods <= goods_amount
), shares AS (
  SELECT p.*,
    CASE WHEN cumulative_goods = goods_amount THEN greatest(0, quoted_freight - prior_freight)
      ELSE least(freight_share, greatest(0, quoted_freight - prior_freight)) END AS frozen_freight,
    CASE WHEN cumulative_goods = goods_amount THEN greatest(0, tax_amount - prior_tax)
      ELSE least(tax_share, greatest(0, tax_amount - prior_tax)) END AS frozen_tax
  FROM prior p
), expected AS (
  SELECT shares.*, batch_goods + frozen_freight + CASE WHEN tax_mode = 'EXCLUSIVE' THEN frozen_tax ELSE 0 END AS receivable
  FROM shares
)
SELECT count(*) INTO blockers FROM expected e JOIN finance_facts f ON f.source_type = 'SHIPMENT' AND f.source_id = e.id
  WHERE EXISTS (SELECT 1 FROM shipments pending WHERE pending.id=e.id AND pending.receivable_amount_snapshot IS NULL)
    AND f.status <> 'CANCELLED' AND f.fact_type IN ('RECEIVABLE', 'INVOICE')
    AND (f.amount <> e.receivable OR f.currency <> e.currency);
  IF blockers > 0 THEN
    RAISE EXCEPTION 'business consistency upgrade blocked: % existing shipment finance facts differ from frozen order tax/freight allocation. Review and correct through the existing finance cancellation workflow before upgrading; migration does not rewrite financial facts.', blockers;
  END IF;
END $commercial_snapshot_guard$;

WITH batch_goods AS (
  SELECT s.id, s.sales_order_id, s.shipped_at, o.currency, o.tax_mode,
    o.goods_amount, o.tax_amount, o.order_total, o.freight_terms,
    CASE WHEN o.freight_terms = 'INCLUDED' THEN 0 ELSE o.quoted_freight_amount END AS quoted_freight,
    sum(i.amount_snapshot) AS batch_goods,
    bool_and(i.amount_snapshot IS NOT NULL AND i.amount_snapshot > 0
      AND i.currency_snapshot = o.currency AND i.sales_order_item_id IS NOT NULL) AS valid
  FROM shipments s JOIN sales_orders o ON o.id = s.sales_order_id
  LEFT JOIN shipment_items i ON i.shipment_id = s.id
  WHERE s.status = 'SHIPPED'
  GROUP BY s.id, o.id
), eligible AS (
  SELECT b.* FROM batch_goods b
  WHERE b.valid AND b.goods_amount > 0 AND b.tax_amount >= 0 AND b.quoted_freight >= 0
    AND b.tax_mode IN ('NONE', 'EXCLUSIVE', 'INCLUSIVE')
    AND b.freight_terms IN ('INCLUDED', 'EXCLUDED')
    AND (b.tax_mode <> 'NONE' OR b.tax_amount = 0)
    AND b.order_total = b.goods_amount + b.quoted_freight + CASE WHEN b.tax_mode = 'EXCLUSIVE' THEN b.tax_amount ELSE 0 END
    AND NOT EXISTS (SELECT 1 FROM batch_goods bad WHERE bad.sales_order_id = b.sales_order_id AND NOT bad.valid)
), apportioned AS (
  SELECT e.*, sum(batch_goods) OVER (PARTITION BY sales_order_id ORDER BY shipped_at, id) AS cumulative_goods,
    sum(batch_goods) OVER (PARTITION BY sales_order_id) AS all_goods,
    round(quoted_freight * batch_goods / goods_amount, 6) AS freight_share,
    round(tax_amount * batch_goods / goods_amount, 6) AS tax_share
  FROM eligible e
), prior AS (
  SELECT a.*,
    coalesce(sum(freight_share) OVER (PARTITION BY sales_order_id ORDER BY shipped_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS prior_freight,
    coalesce(sum(tax_share) OVER (PARTITION BY sales_order_id ORDER BY shipped_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS prior_tax
  FROM apportioned a WHERE all_goods <= goods_amount
), shares AS (
  SELECT p.*,
    CASE WHEN cumulative_goods = goods_amount THEN greatest(0, quoted_freight - prior_freight)
      ELSE least(freight_share, greatest(0, quoted_freight - prior_freight)) END AS frozen_freight,
    CASE WHEN cumulative_goods = goods_amount THEN greatest(0, tax_amount - prior_tax)
      ELSE least(tax_share, greatest(0, tax_amount - prior_tax)) END AS frozen_tax
  FROM prior p
), expected AS (
  SELECT shares.*, batch_goods + frozen_freight + CASE WHEN tax_mode = 'EXCLUSIVE' THEN frozen_tax ELSE 0 END AS receivable
  FROM shares
)
UPDATE shipments s SET receivable_amount_snapshot = e.receivable,
  quoted_freight_amount_snapshot = e.frozen_freight, tax_amount_snapshot = e.frozen_tax,
  tax_mode_snapshot = e.tax_mode
FROM expected e WHERE s.id = e.id AND s.receivable_amount_snapshot IS NULL
  AND s.quoted_freight_amount_snapshot IS NULL AND s.tax_amount_snapshot IS NULL AND s.tax_mode_snapshot IS NULL;
