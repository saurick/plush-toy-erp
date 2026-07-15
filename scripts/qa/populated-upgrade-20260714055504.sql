\set ON_ERROR_STOP on

BEGIN TRANSACTION READ ONLY;

DO $plush_populated_upgrade$
DECLARE
  blockers text[] := ARRAY[]::text[];
  invalid_count bigint := 0;
  column_count integer := 0;
  workflow_task_version_migration_pending boolean := false;
  shipment_status_normalization_pending boolean := false;
BEGIN
  IF to_regclass('atlas_schema_revisions.atlas_schema_revisions') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT NOT EXISTS (
        SELECT 1
          FROM atlas_schema_revisions.atlas_schema_revisions
         WHERE version = '20260711063237'
      )
    $sql$ INTO workflow_task_version_migration_pending;

    EXECUTE $sql$
      SELECT NOT EXISTS (
        SELECT 1
          FROM atlas_schema_revisions.atlas_schema_revisions
         WHERE version = '20260711204000'
      )
    $sql$ INTO shipment_status_normalization_pending;
  END IF;

  IF to_regclass('public.bom_headers') IS NOT NULL THEN
    SELECT count(*)
      INTO column_count
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'bom_headers'
       AND column_name IN ('status', 'effective_from', 'effective_to');
    IF column_count <> 3 THEN
      blockers := array_append(blockers, 'bom_headers core columns are incomplete');
    ELSE
      EXECUTE $sql$
        SELECT count(*)
          FROM public.bom_headers
         WHERE status::text NOT IN ('DRAFT', 'ACTIVE', 'ARCHIVED')
            OR (
              effective_from IS NOT NULL
              AND effective_to IS NOT NULL
              AND effective_to <= effective_from
            )
      $sql$ INTO invalid_count;
      IF invalid_count > 0 THEN
        blockers := array_append(
          blockers,
          format('bom_headers has %s rows incompatible with the target checks', invalid_count)
        );
      END IF;
    END IF;
  END IF;

  IF to_regclass('public.finance_facts') IS NOT NULL THEN
    SELECT count(*)
      INTO column_count
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'finance_facts'
       AND column_name = 'status';
    IF column_count <> 1 THEN
      blockers := array_append(blockers, 'finance_facts.status is missing');
    ELSE
      SELECT count(*)
        INTO column_count
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'finance_facts'
         AND column_name IN ('cancelled_at', 'cancelled_by', 'cancel_reason');
      IF column_count = 0 THEN
        EXECUTE $sql$
          SELECT count(*)
            FROM public.finance_facts
           WHERE status::text = 'CANCELLED'
        $sql$ INTO invalid_count;
        IF invalid_count > 0 THEN
          blockers := array_append(
            blockers,
            format(
              'finance_facts has %s legacy CANCELLED rows without a durable cancellation audit',
              invalid_count
            )
          );
        END IF;
      ELSIF column_count = 3 THEN
        EXECUTE $sql$
          SELECT count(*)
            FROM public.finance_facts
           WHERE (
             status::text = 'CANCELLED'
             AND (
               cancelled_at IS NULL
               OR cancelled_by IS NULL
               OR cancel_reason IS NULL
               OR char_length(btrim(cancel_reason)) NOT BETWEEN 1 AND 255
             )
           )
           OR (
             status::text <> 'CANCELLED'
             AND (
               cancelled_at IS NOT NULL
               OR cancelled_by IS NOT NULL
               OR cancel_reason IS NOT NULL
             )
           )
        $sql$ INTO invalid_count;
        IF invalid_count > 0 THEN
          blockers := array_append(
            blockers,
            format(
              'finance_facts has %s rows incompatible with the target cancellation audit bundle',
              invalid_count
            )
          );
        END IF;
      ELSE
        blockers := array_append(
          blockers,
          'finance_facts cancellation audit columns are only partially present'
        );
      END IF;
    END IF;
  END IF;

  IF to_regclass('public.process_instances') IS NOT NULL THEN
    SELECT count(*)
      INTO column_count
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'process_instances'
       AND column_name IN ('status', 'completed_at');
    IF column_count <> 2 THEN
      blockers := array_append(blockers, 'process_instances lifecycle columns are incomplete');
    ELSE
      EXECUTE $sql$
        SELECT count(*)
          FROM public.process_instances
         WHERE status::text NOT IN ('active', 'completed', 'blocked')
            OR (status::text = 'completed' AND completed_at IS NULL)
            OR (status::text IN ('active', 'blocked') AND completed_at IS NOT NULL)
      $sql$ INTO invalid_count;
      IF invalid_count > 0 THEN
        blockers := array_append(
          blockers,
          format('process_instances has %s incompatible lifecycle rows', invalid_count)
        );
      END IF;
    END IF;
  END IF;

  IF to_regclass('public.workflow_business_states') IS NOT NULL THEN
    SELECT count(*)
      INTO column_count
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'workflow_business_states'
       AND column_name = 'business_status_key';
    IF column_count <> 1 THEN
      blockers := array_append(
        blockers,
        'workflow_business_states.business_status_key is missing'
      );
    ELSE
      EXECUTE $sql$
        SELECT count(*)
          FROM public.workflow_business_states
         WHERE business_status_key::text NOT IN (
           'project_pending',
           'project_approved',
           'engineering_preparing',
           'material_preparing',
           'production_ready',
           'production_processing',
           'qc_pending',
           'iqc_pending',
           'qc_failed',
           'warehouse_processing',
           'warehouse_inbound_pending',
           'inbound_done',
           'shipment_pending',
           'shipping_released',
           'shipped',
           'reconciling',
           'settled',
           'blocked',
           'cancelled',
           'closed'
         )
           AND NOT (
             $1
             AND business_status_key::text = 'shipment_release_pending'
           )
      $sql$ INTO invalid_count USING shipment_status_normalization_pending;
      IF invalid_count > 0 THEN
        blockers := array_append(
          blockers,
          format('workflow_business_states has %s unsupported rows', invalid_count)
        );
      END IF;
    END IF;
  END IF;

  IF to_regclass('public.process_node_instances') IS NOT NULL THEN
    SELECT count(*)
      INTO column_count
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'process_node_instances'
       AND column_name IN ('status', 'node_type', 'version', 'started_at', 'completed_at');
    IF column_count <> 5 THEN
      blockers := array_append(
        blockers,
        'process_node_instances lifecycle columns are incomplete'
      );
    ELSE
      EXECUTE $sql$
        SELECT count(*)
          FROM public.process_node_instances
         WHERE status::text NOT IN ('waiting', 'active', 'completed', 'blocked')
            OR node_type::text NOT IN (
              'human_task',
              'approval',
              'domain_command',
              'wait_event',
              'end'
            )
            OR version IS NULL
            OR version <= 0
            OR (
              status::text = 'waiting'
              AND (started_at IS NOT NULL OR completed_at IS NOT NULL)
            )
            OR (
              status::text = 'active'
              AND (started_at IS NULL OR completed_at IS NOT NULL)
            )
            OR (
              status::text = 'completed'
              AND (started_at IS NULL OR completed_at IS NULL)
            )
            OR (
              status::text = 'blocked'
              AND (started_at IS NULL OR completed_at IS NOT NULL)
            )
      $sql$ INTO invalid_count;
      IF invalid_count > 0 THEN
        blockers := array_append(
          blockers,
          format('process_node_instances has %s incompatible rows', invalid_count)
        );
      END IF;
    END IF;
  END IF;

  IF to_regclass('public.workflow_tasks') IS NOT NULL THEN
    SELECT count(*)
      INTO column_count
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'workflow_tasks'
       AND column_name IN (
         'task_status_key',
         'process_instance_id',
         'process_node_instance_id'
       );
    IF column_count <> 3 THEN
      blockers := array_append(blockers, 'workflow_tasks required columns are incomplete');
    ELSE
      EXECUTE $sql$
        SELECT count(*)
          FROM public.workflow_tasks
         WHERE task_status_key::text NOT IN ('ready', 'blocked', 'done', 'rejected')
            OR (
              (process_instance_id IS NULL) <> (process_node_instance_id IS NULL)
            )
      $sql$ INTO invalid_count;
      IF invalid_count > 0 THEN
        blockers := array_append(
          blockers,
          format('workflow_tasks has %s incompatible status or anchor rows', invalid_count)
        );
      END IF;

      IF to_regclass('public.process_instances') IS NULL
         OR to_regclass('public.process_node_instances') IS NULL THEN
        EXECUTE $sql$
          SELECT count(*)
            FROM public.workflow_tasks
           WHERE process_instance_id IS NOT NULL
              OR process_node_instance_id IS NOT NULL
        $sql$ INTO invalid_count;
        IF invalid_count > 0 THEN
          blockers := array_append(
            blockers,
            format(
              'workflow_tasks has %s process anchors but the referenced tables are missing',
              invalid_count
            )
          );
        END IF;
      ELSE
        EXECUTE $sql$
          SELECT count(*)
            FROM public.workflow_tasks AS task
            LEFT JOIN public.process_instances AS process
              ON process.id = task.process_instance_id
            LEFT JOIN public.process_node_instances AS node
              ON node.id = task.process_node_instance_id
           WHERE task.process_instance_id IS NOT NULL
             AND (
               process.id IS NULL
               OR node.id IS NULL
               OR node.process_instance_id <> task.process_instance_id
             )
        $sql$ INTO invalid_count;
        IF invalid_count > 0 THEN
          blockers := array_append(
            blockers,
            format(
              'workflow_tasks has %s invalid process anchors incompatible with target foreign keys or process ownership',
              invalid_count
            )
          );
        END IF;
      END IF;
    END IF;

    -- version is added safely by 20260711063237 with NOT NULL DEFAULT 1.
    -- A database before that revision must reach the additive migration instead
    -- of being rejected before Atlas can apply it; once present, values are audited.
    SELECT count(*)
      INTO column_count
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'workflow_tasks'
       AND column_name = 'version';
    IF column_count = 1 THEN
      EXECUTE $sql$
        SELECT count(*)
          FROM public.workflow_tasks
         WHERE version IS NULL OR version <= 0
      $sql$ INTO invalid_count;
      IF invalid_count > 0 THEN
        blockers := array_append(
          blockers,
          format('workflow_tasks has %s non-positive versions', invalid_count)
        );
      END IF;
    ELSIF NOT workflow_task_version_migration_pending THEN
      blockers := array_append(
        blockers,
        'workflow_tasks.version is missing after migration 20260711063237'
      );
    END IF;

    SELECT count(*)
      INTO column_count
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'workflow_tasks'
       AND column_name IN ('started_at', 'closed_at');
    IF column_count = 2 THEN
      EXECUTE $sql$
        SELECT count(*)
          FROM public.workflow_tasks
         WHERE started_at IS NOT NULL OR closed_at IS NOT NULL
      $sql$ INTO invalid_count;
      IF invalid_count > 0 THEN
        blockers := array_append(
          blockers,
          format(
            'workflow_tasks has %s rows with legacy timestamps that the target migration drops',
            invalid_count
          )
        );
      END IF;
    ELSIF column_count = 1 THEN
      blockers := array_append(
        blockers,
        'workflow_tasks legacy timestamp columns are only partially present'
      );
    END IF;
  END IF;

  IF cardinality(blockers) > 0 THEN
    RAISE EXCEPTION
      'populated upgrade preflight failed: %',
      array_to_string(blockers, '; ');
  END IF;

  RAISE NOTICE 'populated upgrade preflight passed';
END
$plush_populated_upgrade$;

COMMIT;
