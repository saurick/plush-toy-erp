BEGIN TRANSACTION READ ONLY;

DO $$
DECLARE
  finance_incompatible bigint;
  production_incompatible bigint;
  outsourcing_incompatible bigint;
BEGIN
  SELECT count(*)
    INTO finance_incompatible
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

  SELECT count(*)
    INTO production_incompatible
    FROM "production_facts"
   WHERE NOT (
     (
       "status" = 'DRAFT'
       AND "posted_at" IS NULL AND "posted_by" IS NULL
       AND "cancelled_at" IS NULL AND "cancelled_by" IS NULL
       AND "cancel_reason" IS NULL
     )
     OR
     (
       "status" = 'POSTED'
       AND "posted_at" IS NOT NULL AND "posted_by" IS NOT NULL
       AND "cancelled_at" IS NULL AND "cancelled_by" IS NULL
       AND "cancel_reason" IS NULL
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

  SELECT count(*)
    INTO outsourcing_incompatible
    FROM "outsourcing_facts"
   WHERE NOT (
     (
       "status" = 'DRAFT'
       AND "posted_at" IS NULL AND "posted_by" IS NULL
       AND "cancelled_at" IS NULL AND "cancelled_by" IS NULL
       AND "cancel_reason" IS NULL
     )
     OR
     (
       "status" = 'POSTED'
       AND "posted_at" IS NOT NULL AND "posted_by" IS NOT NULL
       AND "cancelled_at" IS NULL AND "cancelled_by" IS NULL
       AND "cancel_reason" IS NULL
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

  RAISE NOTICE
    'operational fact lifecycle audit: finance=%, production=%, outsourcing=%',
    finance_incompatible,
    production_incompatible,
    outsourcing_incompatible;

  IF finance_incompatible + production_incompatible + outsourcing_incompatible > 0 THEN
    RAISE EXCEPTION
      'operational fact lifecycle audit blocked: finance=%, production=%, outsourcing=%; reconcile lifecycle actors from an authoritative source or rebuild disposable development data before retrying',
      finance_incompatible,
      production_incompatible,
      outsourcing_incompatible;
  END IF;
END
$$;

ROLLBACK;
