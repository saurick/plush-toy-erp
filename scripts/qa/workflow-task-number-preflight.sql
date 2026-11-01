\set ON_ERROR_STOP on

BEGIN TRANSACTION READ ONLY;

DO $workflow_task_number_preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.workflow_tasks
    WHERE created_at IS NULL OR NOT isfinite(created_at)
       OR extract(year FROM created_at AT TIME ZONE 'Asia/Shanghai') NOT BETWEEN 1 AND 9999
  ) THEN
    RAISE EXCEPTION 'workflow task numbering requires a finite creation date in years 1 through 9999';
  END IF;
END;
$workflow_task_number_preflight$;

ROLLBACK;
