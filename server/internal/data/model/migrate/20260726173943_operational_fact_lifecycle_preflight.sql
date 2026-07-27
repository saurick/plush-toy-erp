-- The preceding Atlas migration stages lifecycle version and actor columns.
-- Existing posted, settled, or cancelled facts cannot be assigned an actor by
-- inference. Operators may populate only audit data backed by an exact source
-- before retrying; otherwise this migration fails closed.
DO $$
DECLARE
  incompatible_count bigint;
BEGIN
  SELECT count(*)
    INTO incompatible_count
    FROM "finance_facts"
   WHERE NOT (
     (
       "status" = 'DRAFT'
       AND "posted_at" IS NULL AND "posted_by" IS NULL
       AND "settled_at" IS NULL AND "settled_by" IS NULL
     )
     OR
     (
       "status" = 'POSTED'
       AND "posted_at" IS NOT NULL AND "posted_by" IS NOT NULL
       AND "settled_at" IS NULL AND "settled_by" IS NULL
     )
     OR
     (
       "status" = 'SETTLED'
       AND "posted_at" IS NOT NULL AND "posted_by" IS NOT NULL
       AND "settled_at" IS NOT NULL AND "settled_by" IS NOT NULL
     )
     OR
     (
       "status" = 'CANCELLED'
       AND "settled_at" IS NULL AND "settled_by" IS NULL
       AND (
         ("posted_at" IS NULL AND "posted_by" IS NULL)
         OR
         ("posted_at" IS NOT NULL AND "posted_by" IS NOT NULL)
       )
     )
   );
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'finance_facts contains % rows without exact post or settlement actor audit; reconcile the staged posted_by/settled_by columns from an authoritative source before retrying', incompatible_count;
  END IF;

  SELECT count(*)
    INTO incompatible_count
    FROM "production_facts"
   WHERE NOT (
     (
       "status" = 'DRAFT'
       AND "posted_at" IS NULL AND "posted_by" IS NULL
       AND "cancelled_at" IS NULL AND "cancelled_by" IS NULL AND "cancel_reason" IS NULL
     )
     OR
     (
       "status" = 'POSTED'
       AND "posted_at" IS NOT NULL AND "posted_by" IS NOT NULL
       AND "cancelled_at" IS NULL AND "cancelled_by" IS NULL AND "cancel_reason" IS NULL
     )
     OR
     (
       "status" = 'CANCELLED'
       AND "cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL
       AND "cancel_reason" IS NOT NULL
       AND length(trim("cancel_reason")) BETWEEN 1 AND 255
       AND (
         ("posted_at" IS NULL AND "posted_by" IS NULL)
         OR
         ("posted_at" IS NOT NULL AND "posted_by" IS NOT NULL)
       )
     )
   );
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'production_facts contains % rows without exact post or cancellation actor audit; reconcile the staged lifecycle columns from an authoritative source before retrying', incompatible_count;
  END IF;

  SELECT count(*)
    INTO incompatible_count
    FROM "outsourcing_facts"
   WHERE NOT (
     (
       "status" = 'DRAFT'
       AND "posted_at" IS NULL AND "posted_by" IS NULL
       AND "cancelled_at" IS NULL AND "cancelled_by" IS NULL AND "cancel_reason" IS NULL
     )
     OR
     (
       "status" = 'POSTED'
       AND "posted_at" IS NOT NULL AND "posted_by" IS NOT NULL
       AND "cancelled_at" IS NULL AND "cancelled_by" IS NULL AND "cancel_reason" IS NULL
     )
     OR
     (
       "status" = 'CANCELLED'
       AND "cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL
       AND "cancel_reason" IS NOT NULL
       AND length(trim("cancel_reason")) BETWEEN 1 AND 255
       AND (
         ("posted_at" IS NULL AND "posted_by" IS NULL)
         OR
         ("posted_at" IS NOT NULL AND "posted_by" IS NOT NULL)
       )
     )
   );
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'outsourcing_facts contains % rows without exact post or cancellation actor audit; reconcile the staged lifecycle columns from an authoritative source before retrying', incompatible_count;
  END IF;
END
$$;
