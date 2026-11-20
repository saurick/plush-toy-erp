\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
DO $terminal_assignee$
DECLARE missing bigint;
BEGIN
  IF to_regclass('public.workflow_task_events') IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO missing FROM workflow_tasks t
  JOIN workflow_task_events m ON m.task_id = t.id
    AND m.payload->>'source' = 'production_task_responsibility_migration'
  WHERE t.assignee_id IS NULL AND t.task_status_key IN ('done', 'rejected', 'withdrawn')
    AND m.to_status_key = t.task_status_key
    AND NOT EXISTS (
      SELECT 1 FROM (
        SELECT e.mutation_result FROM workflow_task_events e
        WHERE e.task_id = t.id AND e.task_version < m.task_version
          AND e.mutation_result->>'contract' = 'workflow.task-mutation-result/v1'
        ORDER BY e.task_version DESC, e.id DESC LIMIT 1
      ) receipt
      WHERE jsonb_typeof(receipt.mutation_result->'task') = 'object'
        AND receipt.mutation_result->'task'->>'id' = t.id::text
        AND receipt.mutation_result->'task'->>'task_status_key' = t.task_status_key
        AND (receipt.mutation_result->'task'->>'assignee_id' IS NULL
          OR CASE WHEN receipt.mutation_result->'task'->>'assignee_id' ~ '^[1-9][0-9]*$'
            THEN (receipt.mutation_result->'task'->>'assignee_id')::numeric <= 9223372036854775807
            ELSE false END)
    )
    AND NOT EXISTS (SELECT 1 FROM workflow_task_events restored WHERE restored.task_id = t.id
      AND restored.payload->>'source' = 'terminal_task_assignee_restoration');
  IF missing > 0 THEN
    RAISE EXCEPTION 'terminal task assignee recovery blocked: % tasks have no immutable assignment receipt; recover original assignments from a verified pre-upgrade backup before applying. Do not infer the assignee from the event actor.', missing;
  END IF;
END
$terminal_assignee$;
COMMIT;
