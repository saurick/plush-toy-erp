-- migration-risk: maintenance
-- affected-table: workflow_tasks,workflow_task_events
-- expected-lock: ROW EXCLUSIVE
-- preflight: scripts/qa/terminal-task-assignee-preflight.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: true

-- A missing serialized assignee is evidence of an originally unassigned task.
-- Confirm that result explicitly so subsequent recovery cannot reinterpret it.
WITH affected AS (
  SELECT DISTINCT ON (t.id) t.id, t.task_status_key, m.task_version AS migration_version
  FROM workflow_tasks t
  JOIN workflow_task_events m ON m.task_id = t.id
    AND m.payload->>'source' = 'production_task_responsibility_migration'
  WHERE t.assignee_id IS NULL AND t.task_status_key IN ('done', 'rejected', 'withdrawn')
    AND m.to_status_key = t.task_status_key
    AND NOT EXISTS (SELECT 1 FROM workflow_task_events restored WHERE restored.task_id = t.id
      AND restored.payload->>'source' = 'terminal_task_assignee_restoration')
  ORDER BY t.id, m.task_version DESC, m.id DESC
), proven AS (
  SELECT a.* FROM affected a
  CROSS JOIN LATERAL (
    SELECT e.mutation_result FROM workflow_task_events e
    WHERE e.task_id = a.id AND e.task_version < a.migration_version
      AND e.mutation_result->>'contract' = 'workflow.task-mutation-result/v1'
    ORDER BY e.task_version DESC, e.id DESC LIMIT 1
  ) receipt
  WHERE jsonb_typeof(receipt.mutation_result->'task') = 'object'
    AND receipt.mutation_result->'task'->>'id' = a.id::text
    AND receipt.mutation_result->'task'->>'task_status_key' = a.task_status_key
    AND receipt.mutation_result->'task'->>'assignee_id' IS NULL
), confirmed AS (
  UPDATE workflow_tasks t SET version = t.version + 1, updated_at = CURRENT_TIMESTAMP
  FROM proven p WHERE t.id = p.id AND t.assignee_id IS NULL
  RETURNING t.id, t.version, t.task_status_key
)
INSERT INTO workflow_task_events (task_id, task_version, event_type, from_status_key, to_status_key, reason, payload, created_at)
SELECT id, version, 'source_updated', task_status_key, task_status_key,
  '按原始办理回执确认终态任务原未分配办理人',
  jsonb_build_object('source', 'terminal_task_assignee_restoration', 'assignee_id', NULL), CURRENT_TIMESTAMP
FROM confirmed;
