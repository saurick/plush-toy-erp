-- Convert only the old state whose existing audit columns prove that inventory
-- receipt and its later reversal both happened. This does not infer a missing
-- approval or business fact.
UPDATE "sales_returns"
SET "status" = 'REVERSED',
    "reversed_at" = "cancelled_at",
    "reversed_by" = "cancelled_by",
    "reverse_reason" = "cancel_reason",
    "cancelled_at" = NULL,
    "cancelled_by" = NULL,
    "cancel_reason" = NULL
WHERE "status" = 'CANCELLED'
  AND "received_at" IS NOT NULL
  AND "received_by" IS NOT NULL;

-- The structural staging migration is already committed when this migration
-- runs. If an exact historical approval/execution audit is missing, operators
-- can populate the staged columns and retry without changing migration history.
DO $$
DECLARE
  incompatible_count bigint;
BEGIN
  SELECT count(*)
    INTO incompatible_count
    FROM "production_exception_decisions"
   WHERE (
      "execution_status" = 'APPLIED'
      OR (
        "execution_status" = 'REVERSED'
        AND "decision_type" IN ('SCRAP', 'WIP_CONCESSION')
      )
    )
     AND (
       "execution_reason" IS NULL
       OR length(trim("execution_reason")) NOT BETWEEN 1 AND 255
     );
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'production_exception_decisions contains % applied/reversed rows without exact execution reasons; apply through 20260726123551, reconcile them, then retry', incompatible_count;
  END IF;

  SELECT count(*)
    INTO incompatible_count
    FROM "finance_payments"
   WHERE "status" IN ('POSTED', 'REVERSED')
     AND (
       "approved_at" IS NULL
       OR "approved_by" IS NULL
     );
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'finance_payments contains % posted/reversed rows without exact approval audit; apply through 20260726123551, reconcile them, then retry', incompatible_count;
  END IF;

  SELECT count(*)
    INTO incompatible_count
    FROM "inventory_operations"
   WHERE NOT (
     (
       "operation_type" <> 'MANUAL_ADJUSTMENT'
       AND "submitted_at" IS NULL AND "submitted_by" IS NULL
       AND "approved_at" IS NULL AND "approved_by" IS NULL
       AND "rejected_at" IS NULL AND "rejected_by" IS NULL AND "reject_reason" IS NULL
     )
     OR
     (
       "operation_type" = 'MANUAL_ADJUSTMENT'
       AND (
         (
           "status" = 'DRAFT'
           AND "submitted_at" IS NULL AND "submitted_by" IS NULL
           AND "approved_at" IS NULL AND "approved_by" IS NULL
           AND "rejected_at" IS NULL AND "rejected_by" IS NULL AND "reject_reason" IS NULL
         )
         OR
         (
           "status" = 'SUBMITTED'
           AND "submitted_at" IS NOT NULL AND "submitted_by" IS NOT NULL
           AND "approved_at" IS NULL AND "approved_by" IS NULL
           AND "rejected_at" IS NULL AND "rejected_by" IS NULL AND "reject_reason" IS NULL
         )
         OR
         (
           "status" IN ('APPROVED', 'POSTED')
           AND "submitted_at" IS NOT NULL AND "submitted_by" IS NOT NULL
           AND "approved_at" IS NOT NULL AND "approved_by" IS NOT NULL
           AND "approved_by" <> "created_by"
           AND "rejected_at" IS NULL AND "rejected_by" IS NULL AND "reject_reason" IS NULL
         )
         OR
         (
           "status" = 'REJECTED'
           AND "submitted_at" IS NOT NULL AND "submitted_by" IS NOT NULL
           AND "approved_at" IS NULL AND "approved_by" IS NULL
           AND "rejected_at" IS NOT NULL AND "rejected_by" IS NOT NULL
           AND "rejected_by" <> "created_by"
           AND "reject_reason" IS NOT NULL AND length(trim("reject_reason")) > 0
         )
         OR
         (
           "status" = 'CANCELLED'
           AND (
             (
               "submitted_at" IS NULL AND "submitted_by" IS NULL
               AND "approved_at" IS NULL AND "approved_by" IS NULL
               AND "rejected_at" IS NULL AND "rejected_by" IS NULL AND "reject_reason" IS NULL
             )
             OR
             (
               "submitted_at" IS NOT NULL AND "submitted_by" IS NOT NULL
               AND "approved_at" IS NULL AND "approved_by" IS NULL
               AND "rejected_at" IS NULL AND "rejected_by" IS NULL AND "reject_reason" IS NULL
             )
             OR
             (
               "submitted_at" IS NOT NULL AND "submitted_by" IS NOT NULL
               AND "approved_at" IS NOT NULL AND "approved_by" IS NOT NULL
               AND "approved_by" <> "created_by"
               AND "rejected_at" IS NULL AND "rejected_by" IS NULL AND "reject_reason" IS NULL
             )
           )
         )
       )
     )
   );
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'inventory_operations contains % rows without the exact approval audit bundle; apply through the anomaly staging migration, reconcile them without deleting posted facts, then retry', incompatible_count;
  END IF;

  -- approval_ref was an unstructured display reference and has no lossless
  -- mapping to the staged maker-checker audit fields. Preserve every non-empty
  -- value outside this migration, reconcile it against authoritative approval
  -- evidence, and clear it only after the structured audit bundle is complete.
  -- The following structural migration may drop the column only when no such
  -- value remains.
  SELECT count(*)
    INTO incompatible_count
    FROM "inventory_operations"
   WHERE "approval_ref" IS NOT NULL
     AND length(trim("approval_ref")) > 0;
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'inventory_operations contains % non-empty legacy approval_ref values; preserve and reconcile them into exact structured approval audit evidence before clearing the legacy field and retrying', incompatible_count;
  END IF;

  SELECT count(*)
    INTO incompatible_count
    FROM "finance_payments"
   WHERE "approved_by" IS NOT NULL
     AND "approved_by" = "created_by";
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'finance_payments contains % rows that violate maker-checker approval separation; reconcile them before retrying', incompatible_count;
  END IF;

  SELECT count(*)
    INTO incompatible_count
    FROM "sales_returns"
   WHERE "approved_by" IS NOT NULL
     AND "approved_by" = "created_by";
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'sales_returns contains % rows that violate maker-checker approval separation; reconcile them before retrying', incompatible_count;
  END IF;

  SELECT count(*)
    INTO incompatible_count
    FROM "production_exception_decisions"
   WHERE NOT (
     (
       "execution_status" = 'PENDING'
       AND "executed_at" IS NULL
       AND "executed_by" IS NULL
       AND "execution_reason" IS NULL
       AND "reversed_at" IS NULL
       AND "reversed_by" IS NULL
       AND "reverse_reason" IS NULL
     )
     OR
     (
       "execution_status" = 'APPLIED'
       AND "executed_at" IS NOT NULL
       AND "executed_by" IS NOT NULL
       AND length(trim("execution_reason")) BETWEEN 1 AND 255
       AND "reversed_at" IS NULL
       AND "reversed_by" IS NULL
       AND "reverse_reason" IS NULL
     )
     OR
     (
       "execution_status" = 'REVERSED'
       AND "reversed_at" IS NOT NULL
       AND "reversed_by" IS NOT NULL
       AND length(trim("reverse_reason")) BETWEEN 1 AND 255
       AND (
         (
           "decision_type" = 'OVER_ISSUE'
           AND "executed_at" IS NULL
           AND "executed_by" IS NULL
           AND "execution_reason" IS NULL
         )
         OR
         (
           "decision_type" IN ('SCRAP', 'WIP_CONCESSION')
           AND "executed_at" IS NOT NULL
           AND "executed_by" IS NOT NULL
           AND length(trim("execution_reason")) BETWEEN 1 AND 255
         )
       )
     )
   );
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'production_exception_decisions contains % rows incompatible with the final execution audit bundle; reconcile them before retrying', incompatible_count;
  END IF;

  SELECT count(*)
    INTO incompatible_count
    FROM "sales_returns"
   WHERE NOT (
     (
       "status" = 'DRAFT'
       AND "approved_at" IS NULL AND "approved_by" IS NULL
       AND "rejected_at" IS NULL AND "rejected_by" IS NULL AND "reject_reason" IS NULL
       AND "received_at" IS NULL AND "received_by" IS NULL
       AND "cancelled_at" IS NULL AND "cancelled_by" IS NULL AND "cancel_reason" IS NULL
       AND "reversed_at" IS NULL AND "reversed_by" IS NULL AND "reverse_reason" IS NULL
     )
     OR
     (
       "status" = 'APPROVED'
       AND "approved_at" IS NOT NULL AND "approved_by" IS NOT NULL
       AND "rejected_at" IS NULL AND "rejected_by" IS NULL AND "reject_reason" IS NULL
       AND "received_at" IS NULL AND "received_by" IS NULL
       AND "cancelled_at" IS NULL AND "cancelled_by" IS NULL AND "cancel_reason" IS NULL
       AND "reversed_at" IS NULL AND "reversed_by" IS NULL AND "reverse_reason" IS NULL
     )
     OR
     (
       "status" = 'RECEIVED'
       AND "approved_at" IS NOT NULL AND "approved_by" IS NOT NULL
       AND "rejected_at" IS NULL AND "rejected_by" IS NULL AND "reject_reason" IS NULL
       AND "received_at" IS NOT NULL AND "received_by" IS NOT NULL
       AND "cancelled_at" IS NULL AND "cancelled_by" IS NULL AND "cancel_reason" IS NULL
       AND "reversed_at" IS NULL AND "reversed_by" IS NULL AND "reverse_reason" IS NULL
     )
     OR
     (
       "status" = 'CANCELLED'
       AND (
         ("approved_at" IS NULL AND "approved_by" IS NULL)
         OR ("approved_at" IS NOT NULL AND "approved_by" IS NOT NULL)
       )
       AND "rejected_at" IS NULL AND "rejected_by" IS NULL AND "reject_reason" IS NULL
       AND "received_at" IS NULL AND "received_by" IS NULL
       AND "cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL
       AND length(trim("cancel_reason")) BETWEEN 1 AND 255
       AND "reversed_at" IS NULL AND "reversed_by" IS NULL AND "reverse_reason" IS NULL
     )
     OR
     (
       "status" = 'REVERSED'
       AND "approved_at" IS NOT NULL AND "approved_by" IS NOT NULL
       AND "rejected_at" IS NULL AND "rejected_by" IS NULL AND "reject_reason" IS NULL
       AND "received_at" IS NOT NULL AND "received_by" IS NOT NULL
       AND "cancelled_at" IS NULL AND "cancelled_by" IS NULL AND "cancel_reason" IS NULL
       AND "reversed_at" IS NOT NULL AND "reversed_by" IS NOT NULL
       AND length(trim("reverse_reason")) BETWEEN 1 AND 255
     )
   );
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'sales_returns contains % rows incompatible with the final lifecycle audit bundle; reconcile them before retrying', incompatible_count;
  END IF;
END
$$;
