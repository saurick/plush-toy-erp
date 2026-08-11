\set ON_ERROR_STOP on

BEGIN TRANSACTION READ ONLY;

DO $plush_process_runtime_state_machine_preflight$
DECLARE
  blockers text[] := ARRAY[]::text[];
  invalid_count bigint := 0;
BEGIN
  IF to_regclass('public.inventory_lots') IS NOT NULL THEN
    SELECT count(*)
      INTO invalid_count
      FROM public.inventory_lots
     WHERE status::text NOT IN ('ACTIVE', 'HOLD', 'REJECTED', 'DISABLED');
    IF invalid_count > 0 THEN
      blockers := array_append(
        blockers,
        format('inventory_lots has %s unsupported status rows', invalid_count)
      );
    END IF;
  END IF;

  IF to_regclass('public.process_node_instances') IS NOT NULL THEN
    SELECT count(*)
      INTO invalid_count
      FROM public.process_node_instances
     WHERE status::text NOT IN ('waiting', 'active', 'completed', 'blocked', 'withdrawn')
        OR (
          status::text = 'waiting'
          AND (started_at IS NOT NULL OR completed_at IS NOT NULL)
        )
        OR (
          status::text IN ('active', 'blocked')
          AND (started_at IS NULL OR completed_at IS NOT NULL)
        )
        OR (
          status::text = 'completed'
          AND (started_at IS NULL OR completed_at IS NULL)
        )
        OR (
          status::text = 'withdrawn'
          AND completed_at IS NULL
        );
    IF invalid_count > 0 THEN
      blockers := array_append(
        blockers,
        format('process_node_instances has %s rows incompatible with target lifecycle checks', invalid_count)
      );
    END IF;
  END IF;

  IF to_regclass('public.workflow_tasks') IS NOT NULL THEN
    SELECT count(*)
      INTO invalid_count
      FROM public.workflow_tasks
     WHERE task_status_key::text NOT IN ('ready', 'blocked', 'done', 'rejected', 'withdrawn');
    IF invalid_count > 0 THEN
      blockers := array_append(
        blockers,
        format('workflow_tasks has %s unsupported status rows', invalid_count)
      );
    END IF;
  END IF;

  IF cardinality(blockers) > 0 THEN
    RAISE EXCEPTION
      'process runtime state machine preflight failed: %',
      array_to_string(blockers, '; ');
  END IF;

  RAISE NOTICE 'process runtime state machine preflight passed';
END
$plush_process_runtime_state_machine_preflight$;

COMMIT;
